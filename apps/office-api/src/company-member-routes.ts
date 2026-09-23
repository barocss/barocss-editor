import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { CompanyMemberAccessDeniedError, CompanyMemberConflictError } from
  '@barocss/office-service/company-member-store';
import type { CompanyMemberStore } from '@barocss/office-service/company-member-store';
import type { VerifiedPrincipal } from '@barocss/office-service/membership-store';

const uuid = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const statusSchema = { type: 'object', required: ['status'], additionalProperties: false,
  properties: { status: { type: 'string' } } } as const;
const memberSchema = { type: 'object', additionalProperties: false,
  required: ['memberId', 'role', 'active', 'isSelf'], properties: {
    memberId: { type: 'string' }, role: { type: 'string', enum: ['owner', 'admin', 'editor', 'viewer'] },
    active: { type: 'boolean' }, isSelf: { type: 'boolean' },
  } } as const;
const changeSchema = { type: 'object', additionalProperties: false,
  required: ['memberId', 'role', 'active', 'changed'], properties: {
    memberId: { type: 'string' }, role: { type: 'string', enum: ['editor', 'viewer'] },
    active: { type: 'boolean' }, changed: { type: 'boolean' },
  } } as const;

export interface CompanyMemberRouteDependencies {
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<VerifiedPrincipal | null>;
  companyMembers: Pick<CompanyMemberStore, 'listMembers' | 'setRole' | 'revoke'>;
}

function failure(error: unknown, reply: FastifyReply) {
  if (error instanceof CompanyMemberAccessDeniedError) return reply.code(403).send({ status: 'forbidden' });
  if (error instanceof CompanyMemberConflictError) return reply.code(409).send({ status: 'conflict' });
  return reply.code(503).send({ status: 'service_unavailable' });
}

/** Fastify validates request shape; office-service enforces current membership. */
export function registerCompanyMemberRoutes(app: FastifyInstance, deps: CompanyMemberRouteDependencies) {
  app.get('/v1/tenants/:tenantId/members', {
    schema: {
      params: { type: 'object', required: ['tenantId'], additionalProperties: false,
        properties: { tenantId: { type: 'string', pattern: uuid } } },
      querystring: { type: 'object', additionalProperties: false,
        properties: { after: { type: 'string', pattern: uuid } } },
      response: { 200: { type: 'object', required: ['members', 'nextCursor'], additionalProperties: false,
        properties: { members: { type: 'array', maxItems: 50, items: memberSchema },
          nextCursor: { anyOf: [{ type: 'string' }, { type: 'null' }] } } },
      403: statusSchema, 503: statusSchema },
    },
  }, async (request, reply) => {
    const principal = await deps.authenticate(request, reply);
    if (!principal) return;
    const { tenantId } = request.params as { tenantId: string };
    const { after } = request.query as { after?: string };
    try { return await deps.companyMembers.listMembers(principal, tenantId, after); }
    catch (error) { return failure(error, reply); }
  });

  const params = { type: 'object', required: ['tenantId', 'memberId'], additionalProperties: false,
    properties: { tenantId: { type: 'string', pattern: uuid }, memberId: { type: 'string', pattern: uuid } } } as const;
  const response = { 200: changeSchema, 403: statusSchema, 409: statusSchema, 503: statusSchema } as const;
  app.patch('/v1/tenants/:tenantId/members/:memberId', {
    schema: { params, body: { type: 'object', required: ['role'], additionalProperties: false,
      properties: { role: { type: 'string', enum: ['editor', 'viewer'] } } }, response },
  }, async (request, reply) => {
    const principal = await deps.authenticate(request, reply);
    if (!principal) return;
    const { tenantId, memberId } = request.params as { tenantId: string; memberId: string };
    const { role } = request.body as { role: 'editor' | 'viewer' };
    try { return await deps.companyMembers.setRole(principal, tenantId, memberId, role); }
    catch (error) { return failure(error, reply); }
  });
  app.delete('/v1/tenants/:tenantId/members/:memberId', {
    schema: { params, response },
  }, async (request, reply) => {
    const principal = await deps.authenticate(request, reply);
    if (!principal) return;
    const { tenantId, memberId } = request.params as { tenantId: string; memberId: string };
    try { return await deps.companyMembers.revoke(principal, tenantId, memberId); }
    catch (error) { return failure(error, reply); }
  });
}
