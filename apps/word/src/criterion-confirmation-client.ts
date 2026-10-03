import { compareCriterionContext, type CriterionContext } from '../../../packages/office-word/src/criterion-confirmation';
import { readServerWordFile } from './server-file';
import { ServerWordError } from './server-documents';

export interface CriterionBasis {
  schemaVersion: 1; documentRevision: number; snapshotHash: string; snapshotText: string;
  context: CriterionContext; authorityEpoch: string; actorIdentityId: string;
}
export interface CriterionRequest {
  schemaVersion: 1; expectedRevision: number; snapshotHash: string; snapshotText: string;
  context: CriterionContext; authorityEpoch: string; idempotencyKey: string;
}
export interface CriterionReceipt {
  schemaVersion: 1; confirmationId: string; tenantId: string; documentId: string;
  actorIdentityId: string; confirmedAt: string; documentRevision: number; snapshotHash: string;
  context: CriterionContext; authorityEpoch: string; idempotencyKey: string; requestHash: string;
  verification: 'not-run'; scope: 'writer-self-confirmation';
}
export interface CriterionView { basis: CriterionBasis; receipts: CriterionReceipt[] }
export interface CriterionConfirmationHost {
  load(): Promise<CriterionView>;
  confirm(basis: CriterionBasis, current: () => boolean): Promise<CriterionReceipt>;
}
/** A historical receipt is never promoted to the current criterion by outer labels alone. */
export function currentCriterionReceipt(basis: CriterionBasis, receipts: CriterionReceipt[]) {
  return receipts.find(receipt => receipt.actorIdentityId === basis.actorIdentityId && receipt.documentRevision === basis.documentRevision &&
    receipt.snapshotHash === basis.snapshotHash && receipt.authorityEpoch === basis.authorityEpoch &&
    compareCriterionContext(basis.snapshotText, receipt.context));
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const exactKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
function contextShape(v: unknown): v is CriterionContext {
  if (!object(v) || !exactKeys(v, ['schemaVersion', 'requirement', 'decision', 'relation']) || v.schemaVersion !== 1) return false;
  const item = (value: unknown, decision = false): boolean => object(value) &&
    exactKeys(value, ['itemId', 'version', 'locator', 'snapshotText', ...(decision ? ['currentVersion', 'currentSnapshotText'] : [])]) &&
    uuid(value.itemId) && Number.isSafeInteger(value.version) && Number(value.version) > 0 &&
    object(value.locator) && exactKeys(value.locator, ['kind', 'bookmarkId']) && value.locator.kind === 'point-bookmark' && typeof value.locator.bookmarkId === 'string' &&
    typeof value.snapshotText === 'string' && !('error' in readServerWordFile(value.snapshotText)) &&
    (!decision || (Number.isSafeInteger(value.currentVersion) && Number(value.currentVersion) >= Number(value.version) &&
      typeof value.currentSnapshotText === 'string' && !('error' in readServerWordFile(value.currentSnapshotText))));
  if (!item(v.requirement) || !item(v.decision, true) || !object(v.relation) ||
    !exactKeys(v.relation, ['kind', 'source', 'target']) || v.relation.kind !== 'supported_by') return false;
  const r = v.requirement as Record<string, unknown>, d = v.decision as Record<string, unknown>;
  return object(v.relation.source) && exactKeys(v.relation.source, ['itemId', 'version']) && v.relation.source.itemId === r.itemId && v.relation.source.version === r.version &&
    object(v.relation.target) && exactKeys(v.relation.target, ['itemId', 'version']) && v.relation.target.itemId === d.itemId && v.relation.target.version === d.version;
}
const invalid = (): never => { throw new ServerWordError(null, 'invalid_confirmation_response'); };
export async function criterionHash(text: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
}
export function criterionRequest(basis: CriterionBasis, idempotencyKey: string = crypto.randomUUID()): CriterionRequest {
  return structuredClone({ schemaVersion: 1, expectedRevision: basis.documentRevision,
    snapshotHash: basis.snapshotHash, snapshotText: basis.snapshotText, context: basis.context,
    authorityEpoch: basis.authorityEpoch, idempotencyKey });
}
export function createCriterionClient(fetcher: typeof fetch, tenantId: string, documentId: string) {
  if (!uuid(tenantId) || !uuid(documentId)) return invalid();
  const path = `/api/v1/tenants/${tenantId}/documents/${documentId}/criterion-confirmations`;
  const send = async (suffix: string, body?: CriterionRequest): Promise<unknown> => {
    let response: Response;
    try { response = await fetcher(path + suffix, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined); }
    catch { throw new ServerWordError(null, 'confirmation_network_unknown'); }
    const value: unknown = await response.json().catch(() => invalid());
    if (!response.ok) throw new ServerWordError(response.status, object(value) && typeof value.status === 'string' ? value.status : 'confirmation_refused');
    return value;
  };
  const receipt = (v: unknown): CriterionReceipt => {
    if (!object(v) || v.schemaVersion !== 1 || !uuid(v.confirmationId) || v.tenantId !== tenantId || v.documentId !== documentId ||
      !uuid(v.actorIdentityId) || typeof v.confirmedAt !== 'string' || !Number.isFinite(Date.parse(v.confirmedAt)) ||
      !Number.isSafeInteger(v.documentRevision) || Number(v.documentRevision) < 1 || !sha(v.snapshotHash) || !sha(v.requestHash) ||
      typeof v.authorityEpoch !== 'string' || !v.authorityEpoch || typeof v.idempotencyKey !== 'string' || !contextShape(v.context) ||
      v.verification !== 'not-run' || v.scope !== 'writer-self-confirmation') return invalid();
    return structuredClone(v) as unknown as CriterionReceipt;
  };
  return {
    async context(): Promise<CriterionBasis> {
      const v = await send('/context');
      if (!object(v) || v.schemaVersion !== 1 || !Number.isSafeInteger(v.documentRevision) || Number(v.documentRevision) < 1 ||
        !sha(v.snapshotHash) || typeof v.snapshotText !== 'string' || typeof v.authorityEpoch !== 'string' || !uuid(v.actorIdentityId) ||
        !compareCriterionContext(v.snapshotText, v.context) || await criterionHash(v.snapshotText) !== v.snapshotHash) return invalid();
      return structuredClone(v) as unknown as CriterionBasis;
    },
    async list(): Promise<CriterionReceipt[]> {
      const v = await send('');
      if (!object(v) || !Array.isArray(v.confirmations)) return invalid();
      return v.confirmations.map(receipt);
    },
    async confirm(attempt: CriterionRequest, actorIdentityId: string): Promise<CriterionReceipt> {
      if (!uuid(actorIdentityId) || attempt.schemaVersion !== 1 || Object.keys(attempt).length !== 7 ||
        !Number.isSafeInteger(attempt.expectedRevision) || attempt.expectedRevision < 1 || !sha(attempt.snapshotHash) ||
        typeof attempt.authorityEpoch !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(attempt.idempotencyKey) ||
        !compareCriterionContext(attempt.snapshotText, attempt.context) || await criterionHash(attempt.snapshotText) !== attempt.snapshotHash) return invalid();
      const expectedHash = await criterionHash(JSON.stringify(['criterion-confirmation-v1', tenantId, documentId, actorIdentityId, attempt]));
      const v = receipt(await send('', attempt));
      if (v.actorIdentityId !== actorIdentityId || v.requestHash !== expectedHash || v.idempotencyKey !== attempt.idempotencyKey || v.documentRevision !== attempt.expectedRevision || v.snapshotHash !== attempt.snapshotHash ||
        v.authorityEpoch !== attempt.authorityEpoch || !compareCriterionContext(attempt.snapshotText, v.context)) return invalid();
      return v;
    }
  };
}
