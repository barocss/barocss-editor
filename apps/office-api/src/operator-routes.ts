import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PlatformOperatorAccessDeniedError } from '@barocss/office-service/platform-operator-store';
import type { PlatformOperatorStore } from '@barocss/office-service/platform-operator-store';
import type { VerifiedPrincipal } from '@barocss/office-service/membership-store';
import { healthState } from './health-state.js';

const uuid = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const forbiddenSchema = {
  type: 'object', required: ['status'], additionalProperties: false,
  properties: { status: { type: 'string' } },
} as const;

export interface OperatorRouteDependencies {
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<VerifiedPrincipal | null>;
  operators: Pick<PlatformOperatorStore, 'getAccess' | 'getStatusAccess' | 'listTenantProvisioning'>;
}

function respondFailure(error: unknown, reply: FastifyReply) {
  const denied = error instanceof PlatformOperatorAccessDeniedError;
  return reply.code(denied ? 403 : 503).send({ status: denied ? 'forbidden' : 'service_unavailable' });
}

/** Routes contain no grant logic; office-service checks current DB state per request. */
export function registerOperatorRoutes(app: FastifyInstance, deps: OperatorRouteDependencies) {
  app.get('/v1/operator/access', {
    schema: { response: {
      200: { type: 'object', required: ['operator'], additionalProperties: false,
        properties: { operator: { type: 'boolean', const: true } } },
      403: forbiddenSchema, 503: forbiddenSchema,
    } },
  }, async (request, reply) => {
    const principal = await deps.authenticate(request, reply);
    if (!principal) return;
    try { return await deps.operators.getAccess(principal); }
    catch (error) { return respondFailure(error, reply); }
  });

  app.get('/v1/operator/tenants', {
    schema: {
      querystring: { type: 'object', additionalProperties: false,
        properties: { after: { type: 'string', pattern: uuid } } },
      response: {
        200: { type: 'object', required: ['tenants', 'nextCursor'], additionalProperties: false,
          properties: {
            tenants: { type: 'array', maxItems: 50, items: { type: 'object',
              required: ['tenantId', 'name', 'provisioningStatus'], additionalProperties: false,
              properties: { tenantId: { type: 'string' }, name: { type: 'string' },
                provisioningStatus: { type: 'string', enum: ['owner_provisioned', 'owner_missing'] } } } },
            nextCursor: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          } },
        403: forbiddenSchema, 503: forbiddenSchema,
      },
    },
  }, async (request, reply) => {
    const principal = await deps.authenticate(request, reply);
    if (!principal) return;
    try {
      const { after } = request.query as { after?: string };
      return await deps.operators.listTenantProvisioning(principal, after);
    } catch (error) { return respondFailure(error, reply); }
  });

  app.get('/v1/operator/status', {
    schema: { response: {
      200: { type: 'object', required: ['live', 'ready'], additionalProperties: false,
        properties: {
          live: { type: 'object', required: ['httpStatus', 'status'], additionalProperties: false,
            properties: { httpStatus: { type: 'integer' }, status: { type: 'string' } } },
          ready: { type: 'object', required: ['httpStatus', 'status'], additionalProperties: false,
            properties: { httpStatus: { type: 'integer' }, status: { type: 'string' } } },
        } },
      403: forbiddenSchema, 503: forbiddenSchema,
    } },
  }, async (request, reply) => {
    const principal = await deps.authenticate(request, reply);
    if (!principal) return;
    try {
      await deps.operators.getStatusAccess(principal);
      return healthState;
    } catch (error) { return respondFailure(error, reply); }
  });
}
