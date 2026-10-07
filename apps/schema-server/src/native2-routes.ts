import type { FastifyInstance, FastifyRequest } from 'fastify';
import { DocumentError, type DocumentStore, type CreateDocumentInput, type UpdateSnapshotInput } from '@barocss/office-service/document-store';
import type { VerifiedPrincipal } from '@barocss/office-service/membership-store';
import { isRegistryUuid, validateRegistryBundle } from '@barocss/schema/registry-contract';

export type Native2Documents = Pick<DocumentStore, 'create' | 'open' | 'updateSnapshot' | 'getReceipt'>;
type Authenticate = (request: FastifyRequest) => Promise<VerifiedPrincipal>;
const invalid = (): never => { throw new DocumentError(400, 'invalid_request'); };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function body(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!record(value)) return invalid();
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return invalid();
  return value;
}
function key(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value);
}
const digest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

/** Explicit experimental transport; it never grants document authority or activates a client. */
export function registerNative2Routes(app: FastifyInstance, documents: Native2Documents, authenticate: Authenticate) {
  const prefix = '/v1/tenants/:tenantId/note-native2';
  const context = async (request: FastifyRequest) => {
    const principal = await authenticate(request);
    const params = request.params as Record<string, string>;
    if (!isRegistryUuid(params.tenantId) || Object.keys(request.query ?? {}).length) invalid();
    if (params.documentId !== undefined && !isRegistryUuid(params.documentId)) invalid();
    return { principal, params };
  };
  const snapshot = async (principal: VerifiedPrincipal, tenantId: string, documentId: string) => {
    const opened = await documents.open(principal, tenantId, documentId);
    if (opened.document.product !== 'note' || opened.document.fileFormat !== 'barocss-note' || opened.document.fileVersion !== 2) {
      throw new DocumentError(422, 'unsupported_native_format');
    }
    if (opened.document.mode !== 'snapshot') throw new DocumentError(409, 'mode_conflict');
    if (!('snapshotText' in opened) || typeof opened.snapshotText !== 'string') throw new DocumentError(409, 'snapshot_store_unavailable');
    return { document: opened.document, snapshotText: opened.snapshotText };
  };
  app.post(prefix + '/documents', async (request, reply) => {
    const { principal, params } = await context(request);
    const input = body(request.body, ['workspaceId', 'title', 'fileFormat', 'fileVersion', 'snapshotText', 'importMode', 'idempotencyKey']);
    if (!isRegistryUuid(input.workspaceId) || typeof input.title !== 'string' || input.fileFormat !== 'barocss-note' ||
      input.fileVersion !== 2 || typeof input.snapshotText !== 'string' || input.importMode !== 'new-page-copy' || !key(input.idempotencyKey)) invalid();
    const receipt = await documents.create(principal, params.tenantId, { ...input, product: 'note' } as unknown as CreateDocumentInput);
    reply.code(201); return receipt;
  });
  app.get(prefix + '/documents/:documentId', async request => {
    const { principal, params } = await context(request);
    return snapshot(principal, params.tenantId, params.documentId);
  });
  app.get(prefix + '/documents/:documentId/schema-bundle', async request => {
    const { principal, params } = await context(request);
    const opened = await snapshot(principal, params.tenantId, params.documentId);
    // The same authorized versioned raw/head pair supplies the bundle. Never read a live registry head.
    const envelope: unknown = JSON.parse(opened.snapshotText);
    if (!record(envelope)) throw new DocumentError(409, 'snapshot_store_unavailable');
    const { bundle } = validateRegistryBundle(envelope.schemaBundle);
    return { status: 'pinned' as const, documentId: opened.document.documentId, documentRevision: opened.document.revision,
      snapshotHash: opened.document.snapshotHash, nativeFormat: { format: 'barocss-note', version: 2 }, bundle };
  });
  app.put(prefix + '/documents/:documentId/snapshot', async request => {
    const { principal, params } = await context(request);
    const input = body(request.body, ['schemaAction', 'expectedRevision', 'expectedSnapshotHash', 'expectedPriorPinDigest', 'snapshotText', 'idempotencyKey']);
    if ((input.schemaAction !== 'preserve' && input.schemaAction !== 'adopt') || !Number.isSafeInteger(input.expectedRevision) ||
      (input.expectedRevision as number) < 1 || !digest(input.expectedSnapshotHash) || !digest(input.expectedPriorPinDigest) ||
      typeof input.snapshotText !== 'string' || !key(input.idempotencyKey)) return invalid();
    // Reject a legacy payload before the ordinary store can dispatch a native1 save.
    let envelope: unknown;
    try { envelope = JSON.parse(input.snapshotText); } catch { throw new DocumentError(422, 'invalid_snapshot'); }
    if (!record(envelope) || envelope.format !== 'barocss-note' || envelope.version !== 2) throw new DocumentError(422, 'invalid_snapshot');
    return documents.updateSnapshot(principal, params.tenantId, params.documentId, input as unknown as UpdateSnapshotInput);
  });
  app.get(prefix + '/receipts/:operation/:idempotencyKey', async request => {
    const { principal, params } = await context(request);
    if (!['create', 'update'].includes(params.operation) || !key(params.idempotencyKey)) invalid();
    const receipt = await documents.getReceipt(principal, params.tenantId, params.operation as 'create' | 'update', params.idempotencyKey);
    if (receipt.document.product !== 'note' || receipt.document.fileFormat !== 'barocss-note' || receipt.document.fileVersion !== 2 ||
      typeof receipt.snapshotText !== 'string') throw new DocumentError(422, 'unsupported_native_format');
    return receipt;
  });
}
