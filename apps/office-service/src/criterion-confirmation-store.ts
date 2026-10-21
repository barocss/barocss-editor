import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { captureCriterionContext, compareCriterionContext, type CriterionContext } from '@barocss/office-word/criterion-confirmation';
import { DocumentError } from './document-store.js';
import { MembershipStore, TenantAccessDeniedError, type VerifiedPrincipal } from './membership-store.js';
import { assertUuid } from './tenant-store.js';

export interface ConfirmCriterionInput {
  schemaVersion: 1; expectedRevision: number; snapshotHash: string; snapshotText: string;
  context: CriterionContext; authorityEpoch: string; idempotencyKey: string;
}
export interface CriterionConfirmationReceipt {
  schemaVersion: 1; confirmationId: string; tenantId: string; documentId: string;
  actorIdentityId: string; confirmedAt: string; documentRevision: number;
  snapshotHash: string; context: CriterionContext; authorityEpoch: string;
  idempotencyKey: string; requestHash: string; verification: 'not-run'; scope: 'writer-self-confirmation';
}
interface Source { product: string; mode: string; revision: number; snapshot_hash: string; snapshot_text: string }
interface ConfirmationRow {
  id: string; tenant_id: string; document_id: string; identity_id: string;
  confirmed_at: Date; document_revision: number; snapshot_hash: string; context: CriterionContext;
  authority_epoch: string; idempotency_key: string; request_hash: string;
}
const hash = (text: string) => createHash('sha256').update(text,'utf8').digest('hex');
const inputKeys = ['schemaVersion','expectedRevision','snapshotHash','snapshotText','context','authorityEpoch','idempotencyKey'];
function checkInput(input: ConfirmCriterionInput) {
  if (!input || typeof input !== 'object' || Object.keys(input).length !== inputKeys.length ||
    inputKeys.some(key => !Object.hasOwn(input,key)) || input.schemaVersion !== 1 ||
    !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 ||
    typeof input.snapshotHash !== 'string' || !/^[0-9a-f]{64}$/.test(input.snapshotHash) ||
    typeof input.snapshotText !== 'string' || typeof input.authorityEpoch !== 'string' ||
    !input.authorityEpoch || input.authorityEpoch.length > 255 ||
    typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(input.idempotencyKey)) {
    throw new DocumentError(400,'invalid_request');
  }
  if (Buffer.byteLength(input.snapshotText,'utf8') > 524288) throw new DocumentError(413,'snapshot_too_large');
  if (hash(input.snapshotText) !== input.snapshotHash || !compareCriterionContext(input.snapshotText,input.context)) {
    throw new DocumentError(422,'invalid_criterion_context');
  }
}
function receipt(row: ConfirmationRow): CriterionConfirmationReceipt {
  return { schemaVersion:1,confirmationId:row.id,tenantId:row.tenant_id,documentId:row.document_id,
    actorIdentityId:row.identity_id,confirmedAt:row.confirmed_at.toISOString(),documentRevision:row.document_revision,
    snapshotHash:row.snapshot_hash,context:row.context,authorityEpoch:row.authority_epoch,
    idempotencyKey:row.idempotency_key,requestHash:row.request_hash,verification:'not-run',scope:'writer-self-confirmation' };
}

/** An append-only self-confirmation of one exact native criterion, separate from storage receipts. */
export class CriterionConfirmationStore {
  private readonly membership: MembershipStore;
  constructor(pool: Pool) { this.membership = new MembershipStore(pool); }
  private async actor(client: PoolClient, tenantId: string) {
    // Lock current membership first, then read its event epoch in a fresh statement.
    // This also handles a role change that completed while the lock was waiting.
    const actor = await client.query<{ id: string; role: string }>('SELECT id,role FROM wonffice.project_current_actor($1)',[tenantId]);
    if (!actor.rows[0]) throw new TenantAccessDeniedError();
    if (actor.rows[0].role === 'viewer') throw new DocumentError(403,'forbidden');
    const epoch = await client.query<{ epoch: string }>('SELECT epoch FROM wonffice.project_execution_actor_epoch($1)',[tenantId]);
    if (!epoch.rows[0]) throw new TenantAccessDeniedError();
    // Existing company administration and privileged recovery may update this row
    // without membership_events. Bind its committed MVCC version too, under the
    // same held membership lock, so writer → viewer → writer cannot revive intent.
    const membership = await client.query<{ version: string }>(`SELECT xmin::text AS version
      FROM wonffice.tenant_memberships WHERE tenant_id=$1 AND identity_id=$2 AND revoked_at IS NULL`,
    [tenantId,actor.rows[0].id]);
    if (!membership.rows[0]) throw new TenantAccessDeniedError();
    return { id:actor.rows[0].id,epoch:`${epoch.rows[0].epoch}:${membership.rows[0].version}` };
  }
  private async source(client: PoolClient, tenantId: string, documentId: string) {
    const found = await client.query<Source>(`SELECT d.product,d.mode,s.revision,s.snapshot_hash,s.snapshot_text
      FROM wonffice.documents d JOIN wonffice.document_snapshots s ON s.tenant_id=d.tenant_id AND s.document_id=d.id
      WHERE d.tenant_id=$1 AND d.id=$2 FOR UPDATE OF d,s`,[tenantId,documentId]);
    if (!found.rows[0]) throw new DocumentError(404,'not_found');
    const source = found.rows[0];
    if (source.mode !== 'snapshot') throw new DocumentError(409,'mode_conflict');
    if (source.product !== 'word') throw new DocumentError(422,'unsupported_criterion_product');
    if (hash(source.snapshot_text) !== source.snapshot_hash) throw new DocumentError(409,'source_unavailable');
    return source;
  }
  async getContext(principal: VerifiedPrincipal, tenantId: string, documentId: string) {
    assertUuid(tenantId); assertUuid(documentId);
    return this.membership.withAuthorizedTenant(principal,tenantId,async client => {
      const actor = await this.actor(client,tenantId);
      const source = await this.source(client,tenantId,documentId);
      let context: CriterionContext;
      try { context = captureCriterionContext(source.snapshot_text); }
      catch { throw new DocumentError(409,'criterion_unavailable'); }
      return { schemaVersion:1 as const,documentRevision:source.revision,snapshotHash:source.snapshot_hash,
        snapshotText:source.snapshot_text,context,authorityEpoch:actor.epoch,actorIdentityId:actor.id };
    });
  }
  async confirm(principal: VerifiedPrincipal, tenantId: string, documentId: string,input: ConfirmCriterionInput) {
    assertUuid(tenantId); assertUuid(documentId); checkInput(input);
    // Freeze all input bytes before opening the asynchronous authority transaction.
    const frozen: ConfirmCriterionInput = { schemaVersion:1,expectedRevision:input.expectedRevision,
      snapshotHash:input.snapshotHash,snapshotText:input.snapshotText,context:captureCriterionContext(input.snapshotText),
      authorityEpoch:input.authorityEpoch,idempotencyKey:input.idempotencyKey };
    return this.membership.withAuthorizedTenant(principal,tenantId,async client => {
      const actor = await this.actor(client,tenantId);
      if (actor.epoch !== frozen.authorityEpoch) throw new DocumentError(409,'authority_conflict');
      const source = await this.source(client,tenantId,documentId);
      const digest = hash(JSON.stringify(['criterion-confirmation-v1',tenantId,documentId,actor.id,frozen]));
      const previous = await client.query<ConfirmationRow>(`SELECT * FROM wonffice.criterion_confirmations
        WHERE tenant_id=$1 AND identity_id=$2 AND idempotency_key=$3`,[tenantId,actor.id,frozen.idempotencyKey]);
      if (previous.rows[0]) {
        if (previous.rows[0].request_hash !== digest) throw new DocumentError(409,'key_reuse');
        return receipt(previous.rows[0]);
      }
      if (source.revision !== frozen.expectedRevision || source.snapshot_hash !== frozen.snapshotHash ||
        source.snapshot_text !== frozen.snapshotText || !compareCriterionContext(source.snapshot_text,frozen.context)) {
        throw new DocumentError(409,'criterion_conflict');
      }
      const inserted = await client.query<ConfirmationRow>(`INSERT INTO wonffice.criterion_confirmations
        (tenant_id,document_id,id,identity_id,idempotency_key,request_hash,document_revision,snapshot_hash,snapshot_text,context,authority_epoch)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING RETURNING *`,
      [tenantId,documentId,randomUUID(),actor.id,frozen.idempotencyKey,digest,source.revision,
        source.snapshot_hash,source.snapshot_text,JSON.stringify(frozen.context),actor.epoch]);
      if (inserted.rows[0]) return receipt(inserted.rows[0]);
      // A conflicting key on another document can commit while this document is locked.
      const concurrent = await client.query<ConfirmationRow>(`SELECT * FROM wonffice.criterion_confirmations
        WHERE tenant_id=$1 AND identity_id=$2 AND idempotency_key=$3`,[tenantId,actor.id,frozen.idempotencyKey]);
      if (!concurrent.rows[0] || concurrent.rows[0].request_hash !== digest) throw new DocumentError(409,'key_reuse');
      return receipt(concurrent.rows[0]);
    });
  }
  async list(principal: VerifiedPrincipal, tenantId: string, documentId: string) {
    assertUuid(tenantId); assertUuid(documentId);
    return this.membership.withAuthorizedTenant(principal,tenantId,async client => {
      await this.actor(client,tenantId); await this.source(client,tenantId,documentId);
      const found = await client.query<ConfirmationRow>(`SELECT * FROM wonffice.criterion_confirmations
        WHERE tenant_id=$1 AND document_id=$2 ORDER BY confirmed_at,id`,[tenantId,documentId]);
      return { confirmations:found.rows.map(receipt) };
    });
  }
}
