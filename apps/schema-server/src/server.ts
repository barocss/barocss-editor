import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import { AuthProviderUnavailableError, type OidcVerifier } from '@barocss/office-api/oidc';
import { MembershipStore, TenantAccessDeniedError, type VerifiedPrincipal } from '@barocss/office-service/membership-store';
import { SchemaRegistryError, type SchemaRegistryStore } from '@barocss/office-service/schema-registry-store';
import { isRegistryUuid, SchemaContractError, parseRegistryDefinition, parseRegistryJson } from '@barocss/schema/registry-contract';
import type { SchemaScopePolicy } from './config.js';
import { DocumentError } from '@barocss/office-service/document-store';
import { registerNative2Routes, type Native2Documents } from './native2-routes.js';
export interface SchemaServerDependencies {
  verifier: Pick<OidcVerifier, 'verify'>; memberships: Pick<MembershipStore, 'getTenantAccess'>;
  registry: Pick<SchemaRegistryStore, 'ready' | 'register' | 'get' | 'receipt' | 'legacyDocument'>;
  policy: readonly SchemaScopePolicy[];
  documents?: Native2Documents;
}
class AuthRequestError extends Error {
  constructor(public readonly status: 401 | 503, public readonly reason: string) { super(reason); }
}
const bad = (): never => { throw new SchemaRegistryError(400, 'invalid_request'); };
export function createSchemaServer(deps: SchemaServerDependencies) {
  const app = Fastify({ logger: false, trustProxy: false, requestIdHeader: false, exposeHeadRoutes: false,
    http: { maxHeaderSize: 8192, headersTimeout: 10000 }, requestTimeout: 15000, keepAliveTimeout: 5000,
    bodyLimit: 1048576, forceCloseConnections: 'idle',
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: false } } });
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    try { done(null, parseRegistryJson(body as string, 1048576)); }
    catch { done(new SchemaRegistryError(400, 'invalid_request'), undefined); }
  });
  app.addHook('onRequest', async (_request, reply) => { reply.header('cache-control','no-store').header('x-content-type-options','nosniff'); });
  app.setNotFoundHandler(async (_request, reply) => reply.code(404).send({ status: 'not_found' }));
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthRequestError) return reply.code(error.status).send({ status: error.reason });
    if (error instanceof DocumentError) return reply.code(error.status).send({ status: error.reason });
    if (error instanceof SchemaRegistryError) return reply.code(error.status).send({ status: error.reason });
    if (error instanceof SchemaContractError) return reply.code(error.reason === 'definition_too_large' ? 413 : 422).send({ status: error.reason });
    if (error instanceof TenantAccessDeniedError) return reply.code(403).send({ status: 'forbidden' });
    const code = (error as { statusCode?: number }).statusCode;
    if (code === 400 || code === 413 || code === 415) return reply.code(code).send({ status: code === 413 ? 'request_too_large' : 'invalid_request' });
    return reply.code(503).send({ status: 'schema_store_unavailable' });
  });
  app.get('/health/live', async () => ({ status: 'alive' }));
  app.get('/health/ready', async (_request, reply) => {
    let ready = false; try { ready = await deps.registry.ready(); } catch { /* Named failure, no driver detail. */ }
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'schema_store_unavailable' });
  });
  async function authenticate(request: FastifyRequest): Promise<VerifiedPrincipal> {
    const token = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_.-]+)$/i);
    if (!token) throw new AuthRequestError(401, 'unauthorized');
    let principal: VerifiedPrincipal;
    try { principal = await deps.verifier.verify(token[1]); }
    catch (error) { throw new AuthRequestError(error instanceof AuthProviderUnavailableError ? 503 : 401,
      error instanceof AuthProviderUnavailableError ? 'auth_unavailable' : 'unauthorized'); }
    return principal;
  }
  async function authorize(request: FastifyRequest, action: 'read' | 'register', capabilities: readonly string[] = []) {
    const principal = await authenticate(request);
    const params = request.params as Record<string,string>;
    if (!isRegistryUuid(params.tenantId) || !isRegistryUuid(params.workspaceId) || Object.keys(request.query ?? {}).length) bad();
    const access = await deps.memberships.getTenantAccess(principal, params.tenantId);
    const policy = deps.policy.find(p => p.tenantId === params.tenantId && p.workspaceId === params.workspaceId);
    if (!policy || !(action === 'read' ? policy.readRoles : policy.registerRoles).includes(access.role) ||
      capabilities.some(c => !policy.capabilities.includes(c))) throw new SchemaRegistryError(403, 'scope_forbidden');
    return { principal, tenantId: params.tenantId, workspaceId: params.workspaceId, params };
  }
  const base = '/v1/tenants/:tenantId/workspaces/:workspaceId';
  function pathVersion(value: string) { if (!/^[1-9]\d{0,9}$/.test(value)) return bad(); const v = Number(value); if (v > 2147483647) return bad(); return v; }
  app.put(base + '/schemas/:schemaId/versions/:version', async request => {
    const body = request.body as Record<string,unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2 ||
      typeof body.definitionText !== 'string' || typeof body.idempotencyKey !== 'string') bad();
    const parsed = parseRegistryDefinition(body.definitionText as string);
    const a = await authorize(request, 'register', parsed.definition.requiredCapabilities);
    return deps.registry.register(a.principal, a.tenantId, a.workspaceId, a.params.schemaId, pathVersion(a.params.version),
      { definitionText: body.definitionText as string, idempotencyKey: body.idempotencyKey as string });
  });
  app.get(base + '/schemas/:schemaId/versions/:version', async request => {
    const a = await authorize(request, 'read'); return deps.registry.get(a.principal,a.tenantId,a.workspaceId,a.params.schemaId,pathVersion(a.params.version));
  });
  app.get(base + '/schema-receipts/:idempotencyKey', async request => {
    const a = await authorize(request, 'register'); return deps.registry.receipt(a.principal,a.tenantId,a.workspaceId,a.params.idempotencyKey);
  });
  app.get(base + '/documents/:documentId/schema-bundle', async request => {
    const a = await authorize(request, 'read'); if (!isRegistryUuid(a.params.documentId)) bad();
    return deps.registry.legacyDocument(a.principal, a.tenantId, a.workspaceId, a.params.documentId);
  });
  if (deps.documents) registerNative2Routes(app, deps.documents, authenticate);
  return app;
}
