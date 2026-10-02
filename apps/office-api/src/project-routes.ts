import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { TenantAccessDeniedError, type VerifiedPrincipal } from '@barocss/office-service/membership-store';
import { ProjectError, type ProjectStore, type CreateProjectInput, type UpdateProjectInput } from '@barocss/office-service/project-store';

export interface ProjectRouteDependencies {
  authenticate(request: FastifyRequest, reply: FastifyReply): Promise<VerifiedPrincipal | null>;
  projects: Pick<ProjectStore, 'list' | 'get' | 'create' | 'update' | 'getPin'>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emptyQuery = (value: unknown) => {
  if (!value || typeof value !== 'object' || Object.keys(value).length) throw new ProjectError(400, 'invalid_request');
};
/** Authentication establishes the principal; the store checks current authority and source evidence. */
export function registerProjectRoutes(app: FastifyInstance, deps: ProjectRouteDependencies) {
  const route = async <T>(request: FastifyRequest, reply: FastifyReply,
    operation: (principal: VerifiedPrincipal, tenantId: string) => Promise<T>) => {
    const principal = await deps.authenticate(request, reply);
    if (!principal) return;
    const params = request.params as Record<string, string>;
    if (Object.values(params).some(value => !uuid.test(value))) return reply.code(400).send({ status: 'invalid_request' });
    try { return await operation(principal, params.tenantId); }
    catch (error) {
      if (error instanceof TenantAccessDeniedError) return reply.code(403).send({ status: 'forbidden' });
      if (error instanceof ProjectError) return reply.code(error.status).send({ status: error.reason });
      return reply.code(503).send({ status: 'service_unavailable' });
    }
  };
  const prefix = '/v1/tenants/:tenantId/projects';
  app.get(prefix, async (request, reply) => route(request, reply,
    (principal, tenantId) => deps.projects.list(principal, tenantId, request.query as { workspaceId?: string; after?: string })));
  app.post(prefix, { bodyLimit: 16384 }, async (request, reply) => route(request, reply, async (principal, tenantId) => {
    emptyQuery(request.query);
    const created = await deps.projects.create(principal, tenantId, request.body as CreateProjectInput);
    reply.code(201); return created;
  }));
  app.get(`${prefix}/:projectId`, async (request, reply) => route(request, reply, (principal, tenantId) => {
    emptyQuery(request.query);
    return deps.projects.get(principal, tenantId, (request.params as { projectId: string }).projectId);
  }));
  app.patch(`${prefix}/:projectId`, { bodyLimit: 32768 }, async (request, reply) => route(request, reply, (principal, tenantId) => {
    emptyQuery(request.query);
    return deps.projects.update(principal, tenantId, (request.params as { projectId: string }).projectId,
      request.body as UpdateProjectInput);
  }));
  app.get(`${prefix}/:projectId/pins/:pinId`, async (request, reply) => route(request, reply, (principal, tenantId) => {
    emptyQuery(request.query);
    const { projectId, pinId } = request.params as { projectId: string; pinId: string };
    return deps.projects.getPin(principal, tenantId, projectId, pinId);
  }));
}
