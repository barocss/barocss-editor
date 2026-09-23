import { createHash, randomUUID } from 'node:crypto';
import { copyNoteSnapshotFile, readNoteSnapshotFile } from '@barocss/office-note-file';
import type { Pool, PoolClient } from 'pg';
import { MembershipStore, type TenantRole, type VerifiedPrincipal } from './membership-store.js';

export type Product = 'note' | 'word' | 'slides' | 'site';
export type DocumentOperation = 'create' | 'update' | 'metadata';
export type DocumentMode = 'snapshot' | 'initializing' | 'collaborative';
export interface DocumentHead {
  documentId: string;
  tenantId: string;
  workspaceId: string;
  product: Product;
  title: string;
  metadataRevision: number;
  mode: DocumentMode;
  pageId: string | null;
  documentKey: string;
  fileFormat: string;
  fileVersion: number;
  revision: number;
  snapshotHash: string;
}
export interface DocumentReceipt {
  operation: DocumentOperation;
  idempotencyKey: string;
  requestHash: string;
  document: DocumentHead;
  snapshotText?: string;
}
export interface CreateDocumentInput {
  workspaceId: string;
  product: Product;
  title: string;
  fileFormat: string;
  fileVersion: number;
  snapshotText: string;
  idempotencyKey: string;
  importMode?: 'new-page-copy';
}
export interface UpdateSnapshotInput {
  expectedRevision: number;
  snapshotText: string;
  idempotencyKey: string;
}
export interface UpdateMetadataInput {
  expectedMetadataRevision: number;
  title: string;
  idempotencyKey: string;
}

export class DocumentError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 409 | 413 | 422,
    public readonly reason: string) { super(reason); }
}

const formats: Record<Product, string> = {
  note: 'barocss-note', word: 'barocss-word', slides: 'barocss-slides', site: 'barocss-site',
};
const roots: Record<Product, string> = {
  note: 'note', word: 'document', slides: 'document', site: 'document',
};
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const maxSnapshotBytes = 524288;
function checkSnapshotSize(text: string) {
  if (Buffer.byteLength(text, 'utf8') > maxSnapshotBytes) {
    throw new DocumentError(413, 'snapshot_too_large');
  }
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function checkUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new DocumentError(400, 'invalid_request');
}

function requestHash(parts: unknown[]) { return hash(JSON.stringify(parts)); }
function title(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || [...value].length > 200) {
    throw new DocumentError(422, 'invalid_title');
  }
}
function key(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value)) {
    throw new DocumentError(400, 'invalid_idempotency_key');
  }
}
function revision(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new DocumentError(400, 'invalid_revision');
}
function canWrite(role: TenantRole) { return role !== 'viewer'; }

/** The service accepts the product file envelope, never a browser-selected Yorkie key. */
function parseSnapshot(text: unknown, product: Product): Record<string, unknown> {
  if (typeof text !== 'string') throw new DocumentError(422, 'invalid_snapshot');
  checkSnapshotSize(text);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new DocumentError(422, 'invalid_snapshot'); }
  if (!record(parsed) || parsed.format !== formats[product] || parsed.version !== 1 ||
    !record(parsed.document) || parsed.document.stype !== roots[product] ||
    !Array.isArray(parsed.document.content)) throw new DocumentError(422, 'invalid_snapshot');
  // A saved file cannot carry session-owned node IDs. Limit traversal as well as byte size.
  let visited = 0;
  const inspect = (value: unknown, depth: number): void => {
    if (++visited > 10000 || depth > 100) throw new DocumentError(422, 'invalid_snapshot');
    if (Array.isArray(value)) { for (const child of value) inspect(child, depth + 1); return; }
    if (!record(value)) return;
    if (typeof value.stype === 'string' && ('sid' in value || 'parentId' in value)) {
      throw new DocumentError(422, 'invalid_snapshot');
    }
    for (const child of Object.values(value)) inspect(child, depth + 1);
  };
  inspect(parsed.document, 0);
  return parsed;
}

interface Row {
  documentId: string; tenantId: string; workspaceId: string; product: Product;
  title: string; metadataRevision: number; mode: DocumentMode; pageId: string | null;
  documentKey: string; fileFormat: string | null; fileVersion: number | null;
  revision: number | null; snapshotHash: string | null; snapshotText?: string;
}
const selectHead = `SELECT d.id AS "documentId", d.tenant_id AS "tenantId",
  d.workspace_id AS "workspaceId", d.product, d.title,
  d.metadata_revision AS "metadataRevision", d.mode, d.page_id AS "pageId",
  d.document_key AS "documentKey", s.file_format AS "fileFormat",
  s.file_version AS "fileVersion", s.revision, s.snapshot_hash AS "snapshotHash"`;
const fromHead = ` FROM wonffice.documents d JOIN wonffice.document_snapshots s
  ON s.tenant_id = d.tenant_id AND s.document_id = d.id`;
function head(row: Row): DocumentHead {
  if (!row.fileFormat || !row.fileVersion || !row.revision || !row.snapshotHash) {
    throw new Error('missing_document_snapshot');
  }
  return { documentId: row.documentId, tenantId: row.tenantId, workspaceId: row.workspaceId,
    product: row.product, title: row.title, metadataRevision: row.metadataRevision,
    mode: row.mode, pageId: row.pageId, documentKey: row.documentKey,
    fileFormat: row.fileFormat, fileVersion: row.fileVersion,
    revision: row.revision, snapshotHash: row.snapshotHash };
}

export class DocumentStore {
  private readonly membership: MembershipStore;
  constructor(pool: Pool) { this.membership = new MembershipStore(pool); }

  private async identity(client: PoolClient, principal: VerifiedPrincipal) {
    const result = await client.query<{ id: string }>(`SELECT id FROM wonffice.identities
      WHERE issuer = $1 AND subject = $2`, [principal.issuer, principal.subject]);
    if (!result.rows[0]) throw new Error('authorized_identity_missing');
    return result.rows[0].id;
  }

  private async reserve(client: PoolClient, tenantId: string, identityId: string,
    operation: DocumentOperation, idempotencyKey: string, digest: string): Promise<DocumentReceipt | null> {
    const inserted = await client.query(`INSERT INTO wonffice.document_receipts
      (tenant_id, identity_id, operation, idempotency_key, request_hash)
      VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING 1`,
    [tenantId, identityId, operation, idempotencyKey, digest]);
    if (inserted.rowCount) return null;
    const existing = await client.query<{ request_hash: string; result_head: DocumentHead;
      result_snapshot_text: string | null; current_mode: DocumentMode }>(`
      SELECT r.request_hash, r.result_head, r.result_snapshot_text, d.mode AS current_mode
      FROM wonffice.document_receipts r
      JOIN wonffice.documents d ON d.tenant_id = r.tenant_id AND d.id = r.document_id
      WHERE r.tenant_id = $1 AND r.identity_id = $2 AND r.operation = $3 AND r.idempotency_key = $4
      FOR SHARE OF d`,
    [tenantId, identityId, operation, idempotencyKey]);
    if (!existing.rows[0]) throw new Error('receipt_conflict_unreadable');
    if (existing.rows[0].request_hash !== digest) throw new DocumentError(409, 'key_reuse');
    if (!existing.rows[0].result_head) throw new Error('receipt_unfinished');
    if (operation !== 'metadata' && existing.rows[0].current_mode !== 'snapshot') {
      throw new DocumentError(409, 'mode_conflict');
    }
    return { operation, idempotencyKey, requestHash: digest, document: existing.rows[0].result_head,
      ...(existing.rows[0].result_snapshot_text === null ? {} :
        { snapshotText: existing.rows[0].result_snapshot_text }) };
  }

  private async complete(client: PoolClient, tenantId: string, identityId: string,
    operation: DocumentOperation, idempotencyKey: string, document: DocumentHead,
    snapshotText?: string) {
    const updated = await client.query(`UPDATE wonffice.document_receipts
      SET document_id = $5, result_head = $6, result_snapshot_text = $7
      WHERE tenant_id = $1 AND identity_id = $2 AND operation = $3 AND idempotency_key = $4
        AND document_id IS NULL`,
    [tenantId, identityId, operation, idempotencyKey, document.documentId, JSON.stringify(document),
      snapshotText ?? null]);
    if (updated.rowCount !== 1) throw new Error('receipt_update_failed');
  }

  async create(principal: VerifiedPrincipal, tenantId: string, input: CreateDocumentInput): Promise<DocumentReceipt> {
    checkUuid(tenantId); checkUuid(input.workspaceId); title(input.title); key(input.idempotencyKey);
    if (!Object.hasOwn(formats, input.product) || input.fileFormat !== formats[input.product] ||
      input.fileVersion !== 1 || (input.product === 'note' ? input.importMode !== 'new-page-copy' : input.importMode !== undefined)) {
      throw new DocumentError(422, 'invalid_document_format');
    }
    parseSnapshot(input.snapshotText, input.product);
    if (input.product === 'note' && 'error' in readNoteSnapshotFile(input.snapshotText)) {
      throw new DocumentError(422, 'invalid_snapshot');
    }
    const digest = requestHash(['create', input.workspaceId, input.product, input.title,
      input.fileFormat, input.fileVersion, input.importMode ?? null, input.snapshotText]);
    return this.membership.withAuthorizedTenant(principal, tenantId, async (client, role) => {
      if (!canWrite(role)) throw new DocumentError(403, 'forbidden');
      const identityId = await this.identity(client, principal);
      const existing = await this.reserve(client, tenantId, identityId, 'create', input.idempotencyKey, digest);
      if (existing) return existing;
      const workspace = await client.query(`SELECT 1 FROM wonffice.workspaces
        WHERE tenant_id = $1 AND id = $2`, [tenantId, input.workspaceId]);
      if (!workspace.rowCount) throw new DocumentError(404, 'not_found');
      const documentId = randomUUID();
      const pageId = input.product === 'note' ? randomUUID() : null;
      let snapshotText = input.snapshotText;
      if (pageId) {
        let copy: ReturnType<typeof copyNoteSnapshotFile>;
        try { copy = copyNoteSnapshotFile(input.snapshotText, pageId); }
        catch { throw new DocumentError(422, 'invalid_snapshot'); }
        if ('error' in copy) throw new DocumentError(422, 'invalid_snapshot');
        snapshotText = copy.snapshotText;
      }
      checkSnapshotSize(snapshotText);
      const snapshotHash = hash(snapshotText);
      await client.query(`INSERT INTO wonffice.documents
        (tenant_id, id, workspace_id, product, title, page_id, document_key)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, documentId, input.workspaceId, input.product, input.title, pageId,
        `wonffice-${tenantId}-${documentId}`]);
      await client.query(`INSERT INTO wonffice.document_snapshots
        (tenant_id, document_id, file_format, file_version, snapshot_text, snapshot_hash, revision)
        VALUES ($1, $2, $3, $4, $5, $6, 1)`,
      [tenantId, documentId, input.fileFormat, input.fileVersion, snapshotText, snapshotHash]);
      const found = await client.query<Row>(selectHead + fromHead + ' WHERE d.tenant_id = $1 AND d.id = $2',
        [tenantId, documentId]);
      const document = head(found.rows[0]);
      await this.complete(client, tenantId, identityId, 'create', input.idempotencyKey, document, snapshotText);
      return { operation: 'create', idempotencyKey: input.idempotencyKey, requestHash: digest, document,
        snapshotText };
    });
  }

  async list(principal: VerifiedPrincipal, tenantId: string, query: { workspaceId?: string; product?: Product; after?: string } = {}) {
    checkUuid(tenantId);
    if (query.workspaceId !== undefined) checkUuid(query.workspaceId);
    if (query.after !== undefined) checkUuid(query.after);
    if (query.product && !Object.hasOwn(formats, query.product)) throw new DocumentError(400, 'invalid_product');
    return this.membership.withAuthorizedTenant(principal, tenantId, async client => {
      const rows = await client.query<Row>(selectHead + fromHead + ` WHERE d.tenant_id = $1
        AND ($2::uuid IS NULL OR d.workspace_id = $2::uuid)
        AND ($3::text IS NULL OR d.product = $3::text)
        AND ($4::uuid IS NULL OR d.id > $4::uuid)
        ORDER BY d.id LIMIT 51`,
      [tenantId, query.workspaceId ?? null, query.product ?? null, query.after ?? null]);
      const documents = rows.rows.slice(0, 50).map(head);
      return { documents, nextCursor: rows.rows.length > 50 ? documents[49].documentId : null };
    });
  }

  async open(principal: VerifiedPrincipal, tenantId: string, documentId: string) {
    checkUuid(tenantId); checkUuid(documentId);
    return this.membership.withAuthorizedTenant(principal, tenantId, async client => {
      const found = await client.query<Row>(selectHead +
        ', CASE WHEN d.mode = \'snapshot\' THEN s.snapshot_text ELSE NULL END AS "snapshotText"' + fromHead +
        ' WHERE d.tenant_id = $1 AND d.id = $2', [tenantId, documentId]);
      if (!found.rows[0]) throw new DocumentError(404, 'not_found');
      const document = head(found.rows[0]);
      return document.mode === 'snapshot'
        ? { document, snapshotText: found.rows[0].snapshotText }
        : { document };
    });
  }

  async updateSnapshot(principal: VerifiedPrincipal, tenantId: string, documentId: string,
    input: UpdateSnapshotInput): Promise<DocumentReceipt> {
    checkUuid(tenantId); checkUuid(documentId); revision(input.expectedRevision); key(input.idempotencyKey);
    if (typeof input.snapshotText !== 'string') throw new DocumentError(422, 'invalid_snapshot');
    const digest = requestHash(['update', documentId, input.expectedRevision, input.snapshotText]);
    return this.membership.withAuthorizedTenant(principal, tenantId, async (client, role) => {
      if (!canWrite(role)) throw new DocumentError(403, 'forbidden');
      const identityId = await this.identity(client, principal);
      const existing = await this.reserve(client, tenantId, identityId, 'update', input.idempotencyKey, digest);
      if (existing) return existing;
      const found = await client.query<Row>(selectHead + fromHead +
        ' WHERE d.tenant_id = $1 AND d.id = $2 FOR UPDATE OF d, s', [tenantId, documentId]);
      if (!found.rows[0]) throw new DocumentError(404, 'not_found');
      const current = head(found.rows[0]);
      if (current.mode !== 'snapshot') throw new DocumentError(409, 'mode_conflict');
      if (current.revision !== input.expectedRevision) throw new DocumentError(409, 'revision_conflict');
      const parsed = parseSnapshot(input.snapshotText, current.product);
      if (parsed.format !== current.fileFormat || parsed.version !== current.fileVersion) {
        throw new DocumentError(422, 'invalid_document_format');
      }
      if (current.product === 'note') {
        const note = readNoteSnapshotFile(input.snapshotText);
        if ('error' in note) throw new DocumentError(422, 'invalid_snapshot');
        if (note.document.attributes.pageId !== current.pageId) {
          throw new DocumentError(422, 'invalid_page_id');
        }
      }
      await client.query(`UPDATE wonffice.document_snapshots
        SET snapshot_text = $3, snapshot_hash = $4, revision = revision + 1, updated_at = now()
        WHERE tenant_id = $1 AND document_id = $2`,
      [tenantId, documentId, input.snapshotText, hash(input.snapshotText)]);
      await client.query('UPDATE wonffice.documents SET updated_at = now() WHERE tenant_id = $1 AND id = $2',
        [tenantId, documentId]);
      const updated = await client.query<Row>(selectHead + fromHead + ' WHERE d.tenant_id = $1 AND d.id = $2',
        [tenantId, documentId]);
      const document = head(updated.rows[0]);
      await this.complete(client, tenantId, identityId, 'update', input.idempotencyKey, document,
        input.snapshotText);
      return { operation: 'update', idempotencyKey: input.idempotencyKey, requestHash: digest, document,
        snapshotText: input.snapshotText };
    });
  }

  async updateMetadata(principal: VerifiedPrincipal, tenantId: string, documentId: string,
    input: UpdateMetadataInput): Promise<DocumentReceipt> {
    checkUuid(tenantId); checkUuid(documentId); revision(input.expectedMetadataRevision);
    title(input.title); key(input.idempotencyKey);
    const digest = requestHash(['metadata', documentId, input.expectedMetadataRevision, input.title]);
    return this.membership.withAuthorizedTenant(principal, tenantId, async (client, role) => {
      if (!canWrite(role)) throw new DocumentError(403, 'forbidden');
      const identityId = await this.identity(client, principal);
      const existing = await this.reserve(client, tenantId, identityId, 'metadata', input.idempotencyKey, digest);
      if (existing) return existing;
      const found = await client.query<Row>(selectHead + fromHead +
        ' WHERE d.tenant_id = $1 AND d.id = $2 FOR UPDATE OF d', [tenantId, documentId]);
      if (!found.rows[0]) throw new DocumentError(404, 'not_found');
      const current = head(found.rows[0]);
      if (current.metadataRevision !== input.expectedMetadataRevision) {
        throw new DocumentError(409, 'revision_conflict');
      }
      await client.query(`UPDATE wonffice.documents
        SET title = $3, metadata_revision = metadata_revision + 1, updated_at = now()
        WHERE tenant_id = $1 AND id = $2`, [tenantId, documentId, input.title]);
      const updated = await client.query<Row>(selectHead + fromHead + ' WHERE d.tenant_id = $1 AND d.id = $2',
        [tenantId, documentId]);
      const document = head(updated.rows[0]);
      await this.complete(client, tenantId, identityId, 'metadata', input.idempotencyKey, document);
      return { operation: 'metadata', idempotencyKey: input.idempotencyKey, requestHash: digest, document };
    });
  }

  async getReceipt(principal: VerifiedPrincipal, tenantId: string,
    operation: DocumentOperation, idempotencyKey: string): Promise<DocumentReceipt> {
    checkUuid(tenantId); key(idempotencyKey);
    if (!['create', 'update', 'metadata'].includes(operation)) throw new DocumentError(400, 'invalid_operation');
    return this.membership.withAuthorizedTenant(principal, tenantId, async client => {
      const identityId = await this.identity(client, principal);
      const found = await client.query<{ request_hash: string; result_head: DocumentHead;
        result_snapshot_text: string | null; current_mode: DocumentMode }>(`
        SELECT r.request_hash, r.result_head, r.result_snapshot_text, d.mode AS current_mode
        FROM wonffice.document_receipts r
        JOIN wonffice.documents d ON d.tenant_id = r.tenant_id AND d.id = r.document_id
        WHERE r.tenant_id = $1 AND r.identity_id = $2 AND r.operation = $3 AND r.idempotency_key = $4
        FOR SHARE OF d`,
      [tenantId, identityId, operation, idempotencyKey]);
      if (!found.rows[0]?.result_head) throw new DocumentError(404, 'not_found');
      if (operation !== 'metadata' && found.rows[0].current_mode !== 'snapshot') {
        throw new DocumentError(409, 'mode_conflict');
      }
      return { operation, idempotencyKey, requestHash: found.rows[0].request_hash,
        document: found.rows[0].result_head,
        ...(found.rows[0].result_snapshot_text === null ? {} :
          { snapshotText: found.rows[0].result_snapshot_text }) };
    });
  }
}
