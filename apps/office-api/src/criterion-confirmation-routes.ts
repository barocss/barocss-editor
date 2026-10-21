import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CriterionConfirmationStore, ConfirmCriterionInput } from '@barocss/office-service/criterion-confirmation-store';
import { DocumentError } from '@barocss/office-service/document-store';
import { TenantAccessDeniedError, type VerifiedPrincipal } from '@barocss/office-service/membership-store';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = ['schemaVersion','expectedRevision','snapshotHash','snapshotText','context','authorityEpoch','idempotencyKey'];
export function registerCriterionConfirmationRoutes(app: FastifyInstance, deps: {
  authenticate(request: FastifyRequest,reply: FastifyReply): Promise<VerifiedPrincipal | null>;
  confirmations: Pick<CriterionConfirmationStore,'getContext' | 'confirm' | 'list'>;
}) {
  const route = async (request: FastifyRequest,reply: FastifyReply,
    operation: (principal: VerifiedPrincipal,tenantId: string,documentId: string) => Promise<unknown>) => {
    const principal = await deps.authenticate(request,reply); if (!principal) return;
    const { tenantId,documentId } = request.params as { tenantId: string; documentId: string };
    if (!uuid.test(tenantId) || !uuid.test(documentId) || Object.keys(request.query as object).length) {
      return reply.code(400).send({ status:'invalid_request' });
    }
    try { return await operation(principal,tenantId,documentId); }
    catch (error) {
      if (error instanceof TenantAccessDeniedError) return reply.code(403).send({ status:'forbidden' });
      if (error instanceof DocumentError) return reply.code(error.status).send({ status:error.reason });
      return reply.code(503).send({ status:'service_unavailable' });
    }
  };
  const path = '/v1/tenants/:tenantId/documents/:documentId/criterion-confirmations';
  app.get(`${path}/context`,(request,reply) => route(request,reply,
    (principal,tenantId,documentId) => deps.confirmations.getContext(principal,tenantId,documentId)));
  app.get(path,(request,reply) => route(request,reply,
    (principal,tenantId,documentId) => deps.confirmations.list(principal,tenantId,documentId)));
  app.post(path,(request,reply) => route(request,reply,async (principal,tenantId,documentId) => {
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== fields.length ||
      fields.some(key => !Object.hasOwn(body,key))) throw new DocumentError(400,'invalid_request');
    return deps.confirmations.confirm(principal,tenantId,documentId,body as ConfirmCriterionInput);
  }));
}
