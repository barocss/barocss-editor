import Fastify from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { TenantAccessDeniedError } from '@barocss/office-service/membership-store';
import type { MembershipStore, VerifiedPrincipal } from '@barocss/office-service/membership-store';
import { DocumentError } from '@barocss/office-service/document-store';
import type { DocumentStore, CreateDocumentInput, UpdateMetadataInput,
  UpdateSnapshotInput, DocumentOperation, Product } from '@barocss/office-service/document-store';
import { AuthProviderUnavailableError } from './oidc.js';
import type { OidcVerifier } from './oidc.js';

const statusSchema = {
  type: 'object', required: ['status'], additionalProperties: false,
  properties: { status: { type: 'string' } },
} as const;
const healthPaths = new Set(['/health/live', '/health/ready']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ApiAuthDependencies {
  verifier: OidcVerifier;
  memberships: Pick<MembershipStore, 'getTenantAccess' | 'listTenantAccess'>;
  documents?: Pick<DocumentStore, 'create' | 'list' | 'open' | 'updateSnapshot' | 'updateMetadata' | 'getReceipt'>;
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
    const live = path === '/health/live';
    const code = live ? 200 : 503;
    app.route({
      method: ['GET', 'HEAD'], url: path,
      schema: { response: { [code]: statusSchema } },
      handler: async (_request, reply) => reply.code(code).send({
        status: live ? 'alive' : 'service_not_configured',
      }),
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
    }
  }
  return app;
}
