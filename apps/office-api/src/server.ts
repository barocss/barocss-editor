import Fastify from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InvalidWorkspaceCursorError, TenantAccessDeniedError } from '@barocss/office-service/membership-store';
import type { MembershipStore, VerifiedPrincipal } from '@barocss/office-service/membership-store';
import type { PlatformOperatorStore } from '@barocss/office-service/platform-operator-store';
import type { CompanyMemberStore } from '@barocss/office-service/company-member-store';
import { DocumentError } from '@barocss/office-service/document-store';
import type { DocumentStore, CreateDocumentInput, UpdateMetadataInput,
  UpdateSnapshotInput, DocumentOperation, Product } from '@barocss/office-service/document-store';
import { CollaborationAuthorityError, type CollaborationSession, type CollaborationStore } from '@barocss/office-service/collaboration-store';
import { CapabilityError } from '@barocss/office-service/capability-store';
import { AuthProviderUnavailableError } from './oidc.js';
import type { OidcVerifier } from './oidc.js';
import { healthState } from './health-state.js';
import { registerOperatorRoutes } from './operator-routes.js';
import { registerCompanyMemberRoutes } from './company-member-routes.js';

const statusSchema = {
  type: 'object', required: ['status'], additionalProperties: false,
  properties: { status: { type: 'string' } },
} as const;
const healthPaths = new Set(['/health/live', '/health/ready']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ApiAuthDependencies {
  verifier: Pick<OidcVerifier, 'verify'> & Partial<Pick<OidcVerifier, 'verifySession'>>;
  memberships: Pick<MembershipStore, 'getTenantAccess' | 'listTenantAccess'>;
  workspaces?: Pick<MembershipStore, 'listWorkspaces'>;
  documents?: Pick<DocumentStore, 'create' | 'list' | 'open' | 'updateSnapshot' | 'updateMetadata' | 'getReceipt'>;
  collaboration?: Pick<CollaborationStore, 'requestTransition' | 'reconcile'>;
  capabilities?: {
    issue(input: { principal: VerifiedPrincipal; sessionId: string; oidcExpiresAt: number;
      tenantId: string; documentId: string; access: 'r' | 'rw' }):
      Promise<{ token: string; expiresAt: number; documentKey: string; access: 'r' | 'rw' }>;
    authorize(request: { token: string; method: string;
      attributes: Array<{ key: string; verb: string }> }):
      Promise<{ allowed: boolean; status: 200 | 401 | 403 | 503; reason: string }>;
  };
  /** Inject only after the caller's identity is established by the local transport. */
  verifyYorkieCaller?: (request: FastifyRequest) => Promise<boolean>;
  operators?: Pick<PlatformOperatorStore, 'getAccess' | 'getStatusAccess' | 'listTenantProvisioning'>;
  companyMembers?: Pick<CompanyMemberStore, 'listMembers' | 'setRole' | 'revoke'>;
}

function objectBody(value: unknown, allowed: readonly string[], required: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => !allowed.includes(key)) ||
    required.some(key => !Object.hasOwn(value, key))) throw new DocumentError(400, 'invalid_request');
  return value as Record<string, unknown>;
}

/** HTTP boundary only. Domain services and collaboration providers remain separate. */
export function createApiServer(auth?: ApiAuthDependencies) {
  const app = Fastify({
    logger: false,
    trustProxy: false,
    requestIdHeader: false,
    exposeHeadRoutes: false,
    http: { maxHeaderSize: 8192, headersTimeout: 10000 },
    requestTimeout: 15000,
    keepAliveTimeout: 5000,
    bodyLimit: 1024 * 1024,
    forceCloseConnections: 'idle',
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: false } },
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store').header('x-content-type-options', 'nosniff');
    if (healthPaths.has(request.url.split('?')[0]) &&
      request.method !== 'GET' && request.method !== 'HEAD') {
      return reply.header('allow', 'GET, HEAD').code(405).send({ status: 'method_not_allowed' });
    }
  });
  app.setNotFoundHandler(async (_request, reply) => reply.code(404).send({ status: 'not_found' }));
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode;
    const code = statusCode === 400 || statusCode === 413 || statusCode === 415 ? statusCode : 500;
    const status = code === 400 ? 'invalid_request' : code === 413 ? 'request_too_large'
      : code === 415 ? 'unsupported_media_type' : 'internal_error';
    // Error messages and validation details can contain user data. Never return them.
    void reply.code(code).send({ status });
  });
  for (const path of healthPaths) {
    const state = path === '/health/live' ? healthState.live : healthState.ready;
    const code = state.httpStatus;
    app.route({
      method: ['GET', 'HEAD'], url: path,
      schema: { response: { [code]: statusSchema } },
      handler: async (_request, reply) => reply.code(code).send({ status: state.status }),
    });
  }
  if (auth) {
    const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<VerifiedPrincipal | null> => {
      const header = request.headers.authorization;
      const match = header?.match(/^Bearer ([A-Za-z0-9_.-]+)$/i);
      if (!match) {
        reply.code(401).send({ status: 'unauthorized' });
        return null;
      }
      try {
        return await auth.verifier.verify(match[1]);
      } catch (error) {
        const code = error instanceof AuthProviderUnavailableError ? 503 : 401;
        // Do not return token claims, verifier errors, or provider endpoints.
        reply.code(code).send({ status: code === 503 ? 'auth_unavailable' : 'unauthorized' });
        return null;
      }
    };
    if (auth.capabilities && auth.verifyYorkieCaller) {
      app.post('/internal/yorkie/auth', { bodyLimit: 16384 }, async (request, reply) => {
        try {
          if (!await auth.verifyYorkieCaller!(request)) {
            return reply.code(401).send({ allowed: false, reason: 'unknown_caller' });
          }
        } catch {
          return reply.code(503).send({ allowed: false, reason: 'caller_unavailable' });
        }
        let body: Record<string, unknown>;
        try {
          body = objectBody(request.body, ['token', 'method', 'attributes'],
            ['token', 'method', 'attributes']);
        } catch {
          return reply.code(400).send({ allowed: false, reason: 'invalid_request' });
        }
        const clientMethod = body.method === 'ActivateClient' || body.method === 'DeactivateClient';
        // Yorkie serializes the nil attributes of client lifecycle calls as JSON null.
        const attributes = body.attributes === null && clientMethod ? [] : body.attributes;
        if (typeof body.token !== 'string' || body.token.length > 256 ||
          typeof body.method !== 'string' || body.method.length > 64 ||
          !Array.isArray(attributes) || attributes.length > 16 ||
          attributes.some(value => !value || typeof value !== 'object' || Array.isArray(value) ||
            Object.keys(value).some(key => !['key', 'verb'].includes(key)) ||
            typeof value.key !== 'string' || typeof value.verb !== 'string' ||
            value.key.length > 160 || value.verb.length > 2)) {
          return reply.code(400).send({ allowed: false, reason: 'invalid_request' });
        }
        try {
          const decision = await auth.capabilities!.authorize({ token: body.token,
            method: body.method, attributes });
          if (decision.status === 200 && decision.allowed === true) {
            return reply.code(200).send({ allowed: true, reason: 'allowed' });
          }
          const status = decision.status === 401 || decision.status === 403 ? decision.status : 503;
          const reason = status === 401 ? 'invalid_capability'
            : status === 403 ? 'forbidden' : 'authorization_unavailable';
          return reply.code(status).send({ allowed: false, reason });
        } catch {
          return reply.code(503).send({ allowed: false, reason: 'authorization_unavailable' });
        }
      });
    }
    app.get('/v1/me', async (request, reply) => {
      const principal = await authenticate(request, reply);
      if (!principal) return;
      const query = request.query as Record<string, unknown>;
      if (Object.keys(query).some(key => key !== 'after') ||
        (query.after !== undefined && (typeof query.after !== 'string' || !uuid.test(query.after)))) {
        return reply.code(400).send({ status: 'invalid_request' });
      }
      try {
        const page = await auth.memberships.listTenantAccess(principal, query.after as string | undefined);
        return { issuer: principal.issuer, subject: principal.subject, ...page };
      } catch {
        return reply.code(503).send({ status: 'service_unavailable' });
      }
    });
    app.get('/v1/tenants/:tenantId/access', async (request, reply) => {
      const principal = await authenticate(request, reply);
      if (!principal) return;
      const { tenantId } = request.params as { tenantId: string };
      if (!uuid.test(tenantId)) return reply.code(400).send({ status: 'invalid_request' });
      try {
        return await auth.memberships.getTenantAccess(principal, tenantId);
      } catch (error) {
        if (error instanceof TenantAccessDeniedError) {
          return reply.code(403).send({ status: 'forbidden' });
        }
        return reply.code(503).send({ status: 'service_unavailable' });
      }
    });
    const workspaces = auth.workspaces;
    if (workspaces) {
      app.get('/v1/tenants/:tenantId/workspaces', async (request, reply) => {
        const principal = await authenticate(request, reply);
        if (!principal) return;
        const { tenantId } = request.params as { tenantId: string };
        const query = request.query as Record<string, unknown>;
        if (!uuid.test(tenantId) || Object.keys(query).some(key => key !== 'after') ||
          (query.after !== undefined && (typeof query.after !== 'string' || !uuid.test(query.after)))) {
          return reply.code(400).send({ status: 'invalid_request' });
        }
        try { return await workspaces.listWorkspaces(principal, tenantId, query.after as string | undefined); }
        catch (error) {
          if (error instanceof TenantAccessDeniedError) return reply.code(403).send({ status: 'forbidden' });
          if (error instanceof InvalidWorkspaceCursorError) return reply.code(400).send({ status: 'invalid_cursor' });
          return reply.code(503).send({ status: 'service_unavailable' });
        }
      });
    }
    if (auth.operators) registerOperatorRoutes(app, { authenticate, operators: auth.operators });
    if (auth.companyMembers) registerCompanyMemberRoutes(app,
      { authenticate, companyMembers: auth.companyMembers });
    if (auth.documents) {
      const documents = auth.documents;
      const route = async <T>(request: FastifyRequest, reply: FastifyReply,
        operation: (principal: VerifiedPrincipal, tenantId: string) => Promise<T>) => {
        const principal = await authenticate(request, reply);
        if (!principal) return;
        const { tenantId } = request.params as { tenantId: string };
        if (!uuid.test(tenantId)) return reply.code(400).send({ status: 'invalid_request' });
        try { return await operation(principal, tenantId); }
        catch (error) {
          if (error instanceof TenantAccessDeniedError) return reply.code(403).send({ status: 'forbidden' });
          if (error instanceof DocumentError) return reply.code(error.status).send({ status: error.reason });
          return reply.code(503).send({ status: 'service_unavailable' });
        }
      };
      app.post('/v1/tenants/:tenantId/documents', async (request, reply) => {
        return route(request, reply, async (principal, tenantId) => {
          const body = objectBody(request.body,
            ['workspaceId', 'product', 'title', 'fileFormat', 'fileVersion', 'snapshotText', 'idempotencyKey', 'importMode'],
            ['workspaceId', 'product', 'title', 'fileFormat', 'fileVersion', 'snapshotText', 'idempotencyKey']);
          const created = await documents.create(principal, tenantId, body as unknown as CreateDocumentInput);
          reply.code(201);
          return created;
        });
      });
      app.get('/v1/tenants/:tenantId/documents', async (request, reply) => {
        return route(request, reply, async (principal, tenantId) => {
          const query = request.query as Record<string, unknown>;
          if (Object.keys(query).some(key => !['workspaceId', 'product', 'after'].includes(key)) ||
            Object.values(query).some(value => typeof value !== 'string')) {
            throw new DocumentError(400, 'invalid_request');
          }
          return documents.list(principal, tenantId, query as { workspaceId?: string; product?: Product; after?: string });
        });
      });
      app.get('/v1/tenants/:tenantId/documents/:documentId', async (request, reply) => {
        return route(request, reply, async (principal, tenantId) => {
          const { documentId } = request.params as { documentId: string };
          if (!uuid.test(documentId)) throw new DocumentError(400, 'invalid_request');
          return documents.open(principal, tenantId, documentId);
        });
      });
      app.put('/v1/tenants/:tenantId/documents/:documentId/snapshot', async (request, reply) => {
        return route(request, reply, async (principal, tenantId) => {
          const { documentId } = request.params as { documentId: string };
          if (!uuid.test(documentId)) throw new DocumentError(400, 'invalid_request');
          const body = objectBody(request.body, ['expectedRevision', 'snapshotText', 'idempotencyKey'],
            ['expectedRevision', 'snapshotText', 'idempotencyKey']);
          return documents.updateSnapshot(principal, tenantId, documentId, body as unknown as UpdateSnapshotInput);
        });
      });
      app.patch('/v1/tenants/:tenantId/documents/:documentId/metadata', async (request, reply) => {
        return route(request, reply, async (principal, tenantId) => {
          const { documentId } = request.params as { documentId: string };
          if (!uuid.test(documentId)) throw new DocumentError(400, 'invalid_request');
          const body = objectBody(request.body, ['expectedMetadataRevision', 'title', 'idempotencyKey'],
            ['expectedMetadataRevision', 'title', 'idempotencyKey']);
          return documents.updateMetadata(principal, tenantId, documentId, body as unknown as UpdateMetadataInput);
        });
      });
      app.get('/v1/tenants/:tenantId/receipts/:operation/:idempotencyKey', async (request, reply) => {
        return route(request, reply, async (principal, tenantId) => {
          const { operation, idempotencyKey } = request.params as
            { operation: DocumentOperation; idempotencyKey: string };
          return documents.getReceipt(principal, tenantId, operation, idempotencyKey);
        });
      });
      if (auth.collaboration) {
        const collaborationRoute = async <T>(request: FastifyRequest, reply: FastifyReply,
          operation: (session: CollaborationSession, tenantId: string) => Promise<T>) => {
          const match = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_.-]+)$/i);
          if (!match) return reply.code(401).send({ status: 'unauthorized' });
          if (!auth.verifier.verifySession) return reply.code(503).send({ status: 'auth_unavailable' });
          let session: CollaborationSession;
          try { session = await auth.verifier.verifySession(match[1]); }
          catch (error) {
            const code = error instanceof AuthProviderUnavailableError ? 503 : 401;
            return reply.code(code).send({ status: code === 503 ? 'auth_unavailable' : 'unauthorized' });
          }
          const { tenantId } = request.params as { tenantId: string };
          if (!uuid.test(tenantId)) return reply.code(400).send({ status: 'invalid_request' });
          try { return await operation(session, tenantId); }
          catch (error) {
            if (error instanceof TenantAccessDeniedError) return reply.code(403).send({ status: 'forbidden' });
            if (error instanceof DocumentError || error instanceof CollaborationAuthorityError) return reply.code(error.status).send({ status: error.reason });
            return reply.code(503).send({ status: 'service_unavailable' });
          }
        };
        app.post('/v1/tenants/:tenantId/documents/:documentId/collaboration', async (request, reply) => {
          return collaborationRoute(request, reply, async (session, tenantId) => {
            const { documentId } = request.params as { documentId: string };
            if (!uuid.test(documentId)) throw new DocumentError(400, 'invalid_request');
            const body = objectBody(request.body, ['expectedRevision', 'idempotencyKey'],
              ['expectedRevision', 'idempotencyKey']);
            return auth.collaboration!.requestTransition(session, tenantId, documentId,
              body as unknown as { expectedRevision: number; idempotencyKey: string });
          });
        });
        app.post('/v1/tenants/:tenantId/documents/:documentId/collaboration/reconcile', async (request, reply) => {
          return collaborationRoute(request, reply, async (session, tenantId) => {
            const { documentId } = request.params as { documentId: string };
            if (!uuid.test(documentId)) throw new DocumentError(400, 'invalid_request');
            objectBody(request.body ?? {}, [], []);
            return auth.collaboration!.reconcile(session, tenantId, documentId);
          });
        });
      }
      if (auth.capabilities) {
        app.post('/v1/tenants/:tenantId/documents/:documentId/capabilities', async (request, reply) => {
          const header = request.headers.authorization;
          const match = header?.match(/^Bearer ([A-Za-z0-9_.-]+)$/i);
          if (!match) return reply.code(401).send({ status: 'unauthorized' });
          if (!auth.verifier.verifySession) return reply.code(503).send({ status: 'auth_unavailable' });
          let principal: Awaited<ReturnType<NonNullable<typeof auth.verifier.verifySession>>>;
          try { principal = await auth.verifier.verifySession(match[1]); }
          catch (error) {
            const code = error instanceof AuthProviderUnavailableError ? 503 : 401;
            return reply.code(code).send({ status: code === 503 ? 'auth_unavailable' : 'unauthorized' });
          }
          const { tenantId, documentId } = request.params as { tenantId: string; documentId: string };
          if (!uuid.test(tenantId) || !uuid.test(documentId)) {
            return reply.code(400).send({ status: 'invalid_request' });
          }
          let body: Record<string, unknown>;
          try { body = objectBody(request.body, ['access'], ['access']); }
          catch { return reply.code(400).send({ status: 'invalid_request' }); }
          if (body.access !== 'r' && body.access !== 'rw') {
            return reply.code(400).send({ status: 'invalid_request' });
          }
          try {
            const issued = await auth.capabilities!.issue({ principal, sessionId: principal.sessionId,
              oidcExpiresAt: principal.expiresAt, tenantId, documentId, access: body.access });
            return reply.code(201).send({ token: issued.token, expiresAt: issued.expiresAt,
              documentKey: issued.documentKey, access: issued.access });
          } catch (error) {
            if (error instanceof TenantAccessDeniedError) return reply.code(403).send({ status: 'forbidden' });
            if (error instanceof DocumentError) return reply.code(error.status).send({ status: error.reason });
            if (error instanceof CapabilityError) {
              const status = error.status === 401 ? 'unauthorized'
                : error.status === 403 ? 'forbidden'
                  : error.status === 400 ? 'invalid_request' : 'service_unavailable';
              return reply.code(error.status).send({ status });
            }
            return reply.code(503).send({ status: 'service_unavailable' });
          }
        });
      }
    }
  }
  return app;
}
