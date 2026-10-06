import { createHash, randomUUID } from 'node:crypto';
import { copyNoteSnapshotFile, readNoteSnapshotFile as readNativeSnapshotFile, readNoteV1SnapshotFile as readNoteSnapshotFile } from '@barocss/office-note-file';
import type { Pool, PoolClient } from 'pg';
import type { RegistryBundle } from '@barocss/schema/registry-contract';
import { MembershipStore, type TenantRole, type VerifiedPrincipal } from './membership-store.js';
import { currentSchemaActor, admitDocumentSchemaBundle, SchemaRegistryError,
  type CurrentSchemaActor, type DocumentSchemaAction, type DocumentSchemaScopePolicy } from './schema-registry-store.js';

export type Product = 'note' | 'word' | 'slides' | 'site';
export type DocumentOperation = 'create' | 'update' | 'metadata';
export type DocumentMode = 'snapshot' | 'initializing' | 'collaborative';
export interface DocumentHead {
  documentId: string;
  tenantId: string;
  workspaceId: string;
  product: Product;
  title: string;
  /** Immutable creator attribution; null means a legacy original of unknown origin. */
  creatorUserId: string | null;
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
export interface DocumentStoreOptions { noteSchemaPolicy?: readonly DocumentSchemaScopePolicy[] }
export interface UpdateSnapshotInput {
  expectedSnapshotHash?: string;
  expectedPriorPinDigest?: string;
  schemaAction?: 'preserve' | 'adopt';
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
function supportedFileVersion(product: Product, version: unknown): boolean {
  return version === 1 || (product === 'slides' && version === 2);
}

function parseSnapshot(text: unknown, product: Product): Record<string, unknown> {
  if (typeof text !== 'string') throw new DocumentError(422, 'invalid_snapshot');
  checkSnapshotSize(text);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new DocumentError(422, 'invalid_snapshot'); }
  if (!record(parsed) || parsed.format !== formats[product] || !supportedFileVersion(product, parsed.version) ||
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
  title: string; creatorUserId: string | null; metadataRevision: number; mode: DocumentMode; pageId: string | null;
  documentKey: string; fileFormat: string | null; fileVersion: number | null;
  revision: number | null; snapshotHash: string | null; snapshotText?: string;
}
const selectHead = `SELECT d.id AS "documentId", d.tenant_id AS "tenantId",
  d.workspace_id AS "workspaceId", d.product, d.title, d.creator_user_id AS "creatorUserId",
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
    product: row.product, title: row.title, creatorUserId: row.creatorUserId ?? null, metadataRevision: row.metadataRevision,
    mode: row.mode, pageId: row.pageId, documentKey: row.documentKey,
    fileFormat: row.fileFormat, fileVersion: row.fileVersion,
    revision: row.revision, snapshotHash: row.snapshotHash };
}

// Old immutable receipts retain their stored bytes. Only their response gains Unknown.
function receiptHead(document: DocumentHead): DocumentHead {
  return Object.hasOwn(document, 'creatorUserId') ? document : { ...document, creatorUserId: null };
}

type Native2Snapshot = Omit<Extract<ReturnType<typeof readNativeSnapshotFile>, { fileVersion: 2 }>, 'schemaBundle'> & { schemaBundle: RegistryBundle };
type Native2Action = 'preserve' | 'adopt';
interface Native2ReceiptMetadata {
  version: 1; actorId: string; action: Native2Action; authorityEpoch: string;
  requestDomain: 'note-native2-create-v1' | 'note-native2-snapshot-v1';
}
const native2Head = (document: DocumentHead) => document.product === 'note' && document.fileVersion === 2;
function hasNative2Envelope(text: string): boolean {
  try { const parsed: unknown = JSON.parse(text); return record(parsed) && parsed.format === 'barocss-note' && parsed.version === 2; }
  catch { return false; }
}
function hasUnsupportedNoteEnvelope(text: string | null | undefined): boolean {
  if (typeof text !== 'string') return false;
  try { const parsed: unknown = JSON.parse(text); return record(parsed) && parsed.format === 'barocss-note' && parsed.version !== 1; }
  catch { return false; }
}
function native2Snapshot(text: string): Native2Snapshot {
  checkSnapshotSize(text);
  const parsed = readNativeSnapshotFile(text);
  if ('error' in parsed || !('fileVersion' in parsed) || parsed.fileVersion !== 2) throw new DocumentError(422, 'invalid_snapshot');
  return parsed;
}
function storedNative2(document: DocumentHead, text: string | undefined, reason = 'snapshot_store_unavailable'): Native2Snapshot {
  if (!native2Head(document) || document.fileFormat !== 'barocss-note' || typeof text !== 'string' || hash(text) !== document.snapshotHash) {
    throw new DocumentError(409, reason);
  }
  let snapshot: Native2Snapshot;
  try { snapshot = native2Snapshot(text); } catch { throw new DocumentError(409, reason); }
  if (!document.pageId || snapshot.document.attributes?.pageId !== document.pageId) throw new DocumentError(409, reason);
  return snapshot;
}
function priorPinDigest(document: DocumentHead, bundle: RegistryBundle): string {
  return hash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', document.tenantId, document.workspaceId,
    document.documentId, 'pinned', bundle.selected.map(ref => [ref.schemaId, ref.version, ref.digest])]));
}
function sameRef(a: RegistryBundle['selected'][number], b: RegistryBundle['selected'][number]) {
  return a.schemaId === b.schemaId && a.version === b.version && a.digest === b.digest;
}
function preserveBundle(previous: RegistryBundle, next: RegistryBundle, action: Native2Action) {
  const originals = new Map(previous.definitions.map(entry => [`${entry.reference.schemaId}:${entry.reference.version}`, entry]));
  for (const entry of next.definitions) {
    const before = originals.get(`${entry.reference.schemaId}:${entry.reference.version}`);
    if (before && (!sameRef(before.reference, entry.reference) || before.definitionText !== entry.definitionText)) {
      throw new DocumentError(409, 'schema_pin_conflict');
    }
  }
  if (action !== 'preserve') return;
  if (previous.bundleVersion !== next.bundleVersion || previous.digestAlgorithm !== next.digestAlgorithm ||
    previous.selected.length !== next.selected.length || previous.definitions.length !== next.definitions.length ||
    previous.selected.some((ref, index) => !sameRef(ref, next.selected[index])) ||
    previous.definitions.some((entry, index) => !sameRef(entry.reference, next.definitions[index].reference) ||
      entry.definitionText !== next.definitions[index].definitionText)) throw new DocumentError(409, 'schema_pin_conflict');
}
function readReceiptHead(stored: DocumentHead, identityId: string, operation: DocumentOperation) {
  const data = stored as DocumentHead & { _noteSchemaReceiptV1?: unknown };
  const { _noteSchemaReceiptV1: raw, ...document } = data;
  let metadata: Native2ReceiptMetadata | undefined;
  if (Object.hasOwn(data, '_noteSchemaReceiptV1')) {
    if (!record(raw) || Object.keys(raw).some(k => !['version', 'actorId', 'action', 'authorityEpoch', 'requestDomain'].includes(k)) ||
      raw.version !== 1 || raw.actorId !== identityId || typeof raw.authorityEpoch !== 'string' || !raw.authorityEpoch ||
      !['preserve', 'adopt'].includes(String(raw.action)) || !native2Head(document) ||
      raw.requestDomain !== (operation === 'create' ? 'note-native2-create-v1' : operation === 'update' ? 'note-native2-snapshot-v1' : null) ||
      (operation === 'create' && raw.action !== 'preserve')) throw new DocumentError(409, 'receipt_unavailable');
    metadata = raw as unknown as Native2ReceiptMetadata;
  }
  return { document: receiptHead(document), metadata };
}
async function schemaErrors<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (failure) {
    if (failure instanceof SchemaRegistryError) throw new DocumentError(failure.status, failure.reason);
    throw failure;
  }
}

export class DocumentStore {
  private readonly membership: MembershipStore;
  constructor(pool: Pool, private readonly options: DocumentStoreOptions = {}) { this.membership = new MembershipStore(pool); }

  private admit(client: PoolClient, document: Pick<DocumentHead, 'tenantId' | 'workspaceId'>,
    snapshot: Native2Snapshot, actor: CurrentSchemaActor, action: DocumentSchemaAction) {
    return schemaErrors(() => admitDocumentSchemaBundle(client, document, snapshot.schemaBundle, actor, action,
      this.options.noteSchemaPolicy ?? []));
  }
  private async lockedSnapshot(client: PoolClient, tenantId: string, documentId: string, write: boolean): Promise<Row> {
    const found = await client.query<Row>(selectHead + ', s.snapshot_text AS "snapshotText"' + fromHead +
      ' WHERE d.tenant_id = $1 AND d.id = $2 ' + (write ? 'FOR UPDATE OF d,s' : 'FOR SHARE OF d,s'), [tenantId, documentId]);
    if (!found.rows[0]) throw new DocumentError(404, 'not_found');
    return found.rows[0];
  }
  private async admitReceipt(client: PoolClient, tenantId: string, receipt: DocumentReceipt,
    actor: CurrentSchemaActor, action: DocumentSchemaAction) {
    const historical = receipt.document, current = head(await this.lockedSnapshot(client, tenantId, historical.documentId, false));
    if (historical.tenantId !== tenantId || current.tenantId !== tenantId || historical.documentId !== current.documentId ||
      historical.workspaceId !== current.workspaceId || historical.product !== current.product) throw new DocumentError(409, 'receipt_unavailable');
    if (current.mode !== 'snapshot') throw new DocumentError(409, 'mode_conflict');
    const snapshot = storedNative2(historical, receipt.snapshotText, 'receipt_unavailable');
    await this.admit(client, current, snapshot, actor, action);
    // Only immutable scope is compared: a historical receipt is not a confirmation of the latest head or draft.
  }
  private async createNative2(principal: VerifiedPrincipal, tenantId: string, input: CreateDocumentInput): Promise<DocumentReceipt> {
    if (input.fileFormat !== 'barocss-note' || input.importMode !== 'new-page-copy' || typeof input.snapshotText !== 'string') {
      throw new DocumentError(422, 'invalid_document_format');
    }
    const snapshot = native2Snapshot(input.snapshotText);
    const digest = requestHash(['note-native2-create-v1', tenantId, input.workspaceId, input.product, input.title,
      input.fileFormat, input.fileVersion, input.importMode, input.snapshotText]);
    return this.membership.withAuthorizedTenant(principal, tenantId, async client => {
      const actor = await schemaErrors(() => currentSchemaActor(client, tenantId, true));
      await this.admit(client, { tenantId, workspaceId: input.workspaceId }, snapshot, actor, 'preserve');
      const existing = await this.reserve(client, tenantId, actor.id, 'create', input.idempotencyKey, digest, 'preserve');
      if (existing) { await this.admitReceipt(client, tenantId, existing, actor, 'preserve'); return existing; }
      const workspace = await client.query('SELECT 1 FROM wonffice.workspaces WHERE tenant_id = $1 AND id = $2', [tenantId, input.workspaceId]);
      if (!workspace.rowCount) throw new DocumentError(404, 'not_found');
      const documentId = randomUUID(), pageId = randomUUID();
      let copied: ReturnType<typeof copyNoteSnapshotFile>;
      try { copied = copyNoteSnapshotFile(input.snapshotText, pageId); } catch { throw new DocumentError(422, 'invalid_snapshot'); }
      if ('error' in copied) throw new DocumentError(422, 'invalid_snapshot');
      const snapshotText = copied.snapshotText; checkSnapshotSize(snapshotText);
      await client.query(`INSERT INTO wonffice.documents
        (tenant_id, id, workspace_id, product, title, page_id, document_key, creator_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, documentId, input.workspaceId, input.product, input.title, pageId, `wonffice-${tenantId}-${documentId}`, actor.id]);
      await client.query(`INSERT INTO wonffice.document_snapshots
        (tenant_id, document_id, file_format, file_version, snapshot_text, snapshot_hash, revision)
        VALUES ($1, $2, $3, $4, $5, $6, 1)`, [tenantId, documentId, input.fileFormat, 2, snapshotText, hash(snapshotText)]);
      const document = head(await this.lockedSnapshot(client, tenantId, documentId, true));
      await this.complete(client, tenantId, actor.id, 'create', input.idempotencyKey, document, snapshotText,
        { version: 1, actorId: actor.id, action: 'preserve', authorityEpoch: actor.epoch, requestDomain: 'note-native2-create-v1' });
      return { operation: 'create', idempotencyKey: input.idempotencyKey, requestHash: digest, document, snapshotText };
    });
  }
  private async updateNative2(principal: VerifiedPrincipal, tenantId: string, documentId: string, input: UpdateSnapshotInput): Promise<DocumentReceipt> {
    if (input.schemaAction !== 'preserve' && input.schemaAction !== 'adopt' ||
      typeof input.expectedSnapshotHash !== 'string' || !/^[0-9a-f]{64}$/.test(input.expectedSnapshotHash) ||
      typeof input.expectedPriorPinDigest !== 'string' || !/^[0-9a-f]{64}$/.test(input.expectedPriorPinDigest)) throw new DocumentError(400, 'invalid_request');
    const action = input.schemaAction, snapshot = native2Snapshot(input.snapshotText);
    return this.membership.withAuthorizedTenant(principal, tenantId, async client => {
      const actor = await schemaErrors(() => currentSchemaActor(client, tenantId, true));
      const row = await this.lockedSnapshot(client, tenantId, documentId, true), current = head(row);
      if (current.product !== 'note' || current.fileFormat !== 'barocss-note' || current.fileVersion !== 2) throw new DocumentError(422, 'invalid_document_format');
      if (current.mode !== 'snapshot') throw new DocumentError(409, 'mode_conflict');
      const digest = requestHash(['note-native2-snapshot-v1', tenantId, current.workspaceId, documentId, action,
        input.expectedRevision, input.expectedSnapshotHash, input.expectedPriorPinDigest, input.snapshotText]);
      const existing = await this.reserve(client, tenantId, actor.id, 'update', input.idempotencyKey, digest, action);
      if (existing) { await this.admitReceipt(client, tenantId, existing, actor, action); return existing; }
      const previous = storedNative2(current, row.snapshotText);
      if (current.revision !== input.expectedRevision) throw new DocumentError(409, 'revision_conflict');
      if (current.snapshotHash !== input.expectedSnapshotHash) throw new DocumentError(409, 'snapshot_hash_conflict');
      if (priorPinDigest(current, previous.schemaBundle) !== input.expectedPriorPinDigest) throw new DocumentError(409, 'schema_pin_conflict');
      if (snapshot.document.attributes?.pageId !== current.pageId) throw new DocumentError(422, 'invalid_page_id');
      await this.admit(client, current, previous, actor, 'read');
      await this.admit(client, current, snapshot, actor, action);
      preserveBundle(previous.schemaBundle, snapshot.schemaBundle, action);
      await client.query(`UPDATE wonffice.document_snapshots
        SET snapshot_text = $3, snapshot_hash = $4, file_version = $5, revision = revision + 1, updated_at = now()
        WHERE tenant_id = $1 AND document_id = $2`, [tenantId, documentId, input.snapshotText, hash(input.snapshotText), 2]);
      await client.query('UPDATE wonffice.documents SET updated_at = now() WHERE tenant_id = $1 AND id = $2', [tenantId, documentId]);
      const document = head(await this.lockedSnapshot(client, tenantId, documentId, true));
      await this.complete(client, tenantId, actor.id, 'update', input.idempotencyKey, document, input.snapshotText,
        { version: 1, actorId: actor.id, action, authorityEpoch: actor.epoch, requestDomain: 'note-native2-snapshot-v1' });
      return { operation: 'update', idempotencyKey: input.idempotencyKey, requestHash: digest, document, snapshotText: input.snapshotText };
    });
  }

  private async identity(client: PoolClient, principal: VerifiedPrincipal) {
    const result = await client.query<{ id: string }>(`SELECT id FROM wonffice.identities
      WHERE issuer = $1 AND subject = $2`, [principal.issuer, principal.subject]);
    if (!result.rows[0]) throw new Error('authorized_identity_missing');
    return result.rows[0].id;
  }

  private async reserve(client: PoolClient, tenantId: string, identityId: string,
    operation: DocumentOperation, idempotencyKey: string, digest: string, action?: Native2Action): Promise<DocumentReceipt | null> {
    const inserted = await client.query(`INSERT INTO wonffice.document_receipts
      (tenant_id, identity_id, operation, idempotency_key, request_hash)
      VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING 1`,
    [tenantId, identityId, operation, idempotencyKey, digest]);
    if (inserted.rowCount) return null;
    const existing = await client.query<{ request_hash: string; result_head: DocumentHead;
      result_snapshot_text: string | null; document_id: string; current_mode: DocumentMode }>(`
      SELECT r.request_hash, r.result_head, r.result_snapshot_text, r.document_id, d.mode AS current_mode
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
    const decoded = readReceiptHead(existing.rows[0].result_head, identityId, operation);
    if (hasUnsupportedNoteEnvelope(existing.rows[0].result_snapshot_text) && !native2Head(decoded.document)) throw new DocumentError(409, 'receipt_unavailable');
    if (native2Head(decoded.document) && (decoded.document.documentId !== existing.rows[0].document_id || decoded.document.tenantId !== tenantId)) throw new DocumentError(409, 'receipt_unavailable');
    if (operation === 'metadata' && native2Head(decoded.document)) throw new DocumentError(422, 'unsupported_native_format');
    if (action && decoded.metadata && decoded.metadata.action !== action) throw new DocumentError(409, 'receipt_unavailable');
    return { operation, idempotencyKey, requestHash: digest, document: decoded.document,
      ...(existing.rows[0].result_snapshot_text === null ? {} :
        { snapshotText: existing.rows[0].result_snapshot_text }) };
  }

  private async complete(client: PoolClient, tenantId: string, identityId: string,
    operation: DocumentOperation, idempotencyKey: string, document: DocumentHead,
    snapshotText?: string, schemaMetadata?: Native2ReceiptMetadata) {
    const stored = schemaMetadata ? { ...document, _noteSchemaReceiptV1: schemaMetadata } : document;
    const updated = await client.query(`UPDATE wonffice.document_receipts
      SET document_id = $5, result_head = $6, result_snapshot_text = $7
      WHERE tenant_id = $1 AND identity_id = $2 AND operation = $3 AND idempotency_key = $4
        AND document_id IS NULL`,
    [tenantId, identityId, operation, idempotencyKey, document.documentId, JSON.stringify(stored),
      snapshotText ?? null]);
    if (updated.rowCount !== 1) throw new Error('receipt_update_failed');
  }

  async create(principal: VerifiedPrincipal, tenantId: string, input: CreateDocumentInput): Promise<DocumentReceipt> {
    checkUuid(tenantId); checkUuid(input.workspaceId); title(input.title); key(input.idempotencyKey);
    if (input.product === 'note' && input.fileVersion === 2) return this.createNative2(principal, tenantId, input);
    if (!Object.hasOwn(formats, input.product) || input.fileFormat !== formats[input.product] ||
      !supportedFileVersion(input.product, input.fileVersion) || (input.product === 'note' ? input.importMode !== 'new-page-copy' : input.importMode !== undefined)) {
      throw new DocumentError(422, 'invalid_document_format');
    }
    const parsed = parseSnapshot(input.snapshotText, input.product);
    if (parsed.version !== input.fileVersion) throw new DocumentError(422, 'invalid_document_format');
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
        (tenant_id, id, workspace_id, product, title, page_id, document_key, creator_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, documentId, input.workspaceId, input.product, input.title, pageId,
        `wonffice-${tenantId}-${documentId}`, identityId]);
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
      if (documents.some(d => d.product === 'note' && d.fileVersion !== 1)) throw new DocumentError(422, 'unsupported_native_format');
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
      if (document.product === 'note' && document.fileVersion !== 1) {
        if (!native2Head(document)) throw new DocumentError(422, 'unsupported_native_format');
        if (document.mode !== 'snapshot') throw new DocumentError(409, 'mode_conflict');
        const actor = await schemaErrors(() => currentSchemaActor(client, tenantId));
        const snapshot = storedNative2(document, found.rows[0].snapshotText);
        await this.admit(client, document, snapshot, actor, 'read');
      }
      if (document.mode === 'snapshot') return { document, snapshotText: found.rows[0].snapshotText };
      if (document.mode === 'initializing') {
        const attempt = await client.query<{ status: string }>(`SELECT status
          FROM wonffice.document_collaboration_seeds WHERE tenant_id = $1 AND document_id = $2`,
        [tenantId, documentId]);
        return { document, transitionStatus: attempt.rows[0]?.status ?? 'uncertain' };
      }
      return { document };
    });
  }

  async updateSnapshot(principal: VerifiedPrincipal, tenantId: string, documentId: string,
    input: UpdateSnapshotInput): Promise<DocumentReceipt> {
    checkUuid(tenantId); checkUuid(documentId); revision(input.expectedRevision); key(input.idempotencyKey);
    if (typeof input.snapshotText !== 'string') throw new DocumentError(422, 'invalid_snapshot');
    if (hasNative2Envelope(input.snapshotText)) return this.updateNative2(principal, tenantId, documentId, input);
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
      if (current.product === 'note' && current.fileVersion !== 1) throw new DocumentError(422, 'invalid_document_format');
      const parsed = parseSnapshot(input.snapshotText, current.product);
      const slidesUpgrade = current.product === 'slides' && current.fileVersion === 1 && parsed.version === 2;
      if (parsed.format !== current.fileFormat || (parsed.version !== current.fileVersion && !slidesUpgrade)) {
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
        SET snapshot_text = $3, snapshot_hash = $4, file_version = $5, revision = revision + 1, updated_at = now()
        WHERE tenant_id = $1 AND document_id = $2`,
      [tenantId, documentId, input.snapshotText, hash(input.snapshotText), parsed.version]);
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
      if (current.product === 'note' && current.fileVersion !== 1) throw new DocumentError(422, 'unsupported_native_format');
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
      let actor = this.options.noteSchemaPolicy !== undefined ? await schemaErrors(() => currentSchemaActor(client, tenantId)) : undefined;
      const identityId = actor?.id ?? await this.identity(client, principal);
      const found = await client.query<{ request_hash: string; result_head: DocumentHead;
        result_snapshot_text: string | null; document_id: string; current_mode: DocumentMode }>(`
        SELECT r.request_hash, r.result_head, r.result_snapshot_text, r.document_id, d.mode AS current_mode
        FROM wonffice.document_receipts r
        JOIN wonffice.documents d ON d.tenant_id = r.tenant_id AND d.id = r.document_id
        WHERE r.tenant_id = $1 AND r.identity_id = $2 AND r.operation = $3 AND r.idempotency_key = $4
        FOR SHARE OF d`,
      [tenantId, identityId, operation, idempotencyKey]);
      if (!found.rows[0]?.result_head) throw new DocumentError(404, 'not_found');
      if (operation !== 'metadata' && found.rows[0].current_mode !== 'snapshot') {
        throw new DocumentError(409, 'mode_conflict');
      }
      const decoded = readReceiptHead(found.rows[0].result_head, identityId, operation);
      if (hasUnsupportedNoteEnvelope(found.rows[0].result_snapshot_text) && !native2Head(decoded.document)) throw new DocumentError(409, 'receipt_unavailable');
      if (native2Head(decoded.document) && (decoded.document.documentId !== found.rows[0].document_id || decoded.document.tenantId !== tenantId)) throw new DocumentError(409, 'receipt_unavailable');
      const receipt: DocumentReceipt = { operation, idempotencyKey, requestHash: found.rows[0].request_hash,
        document: decoded.document,
        ...(found.rows[0].result_snapshot_text === null ? {} :
          { snapshotText: found.rows[0].result_snapshot_text }) };
      if (receipt.document.product === 'note' && receipt.document.fileVersion !== 1) {
        if (!native2Head(receipt.document) || operation === 'metadata') throw new DocumentError(422, 'unsupported_native_format');
        actor ??= await schemaErrors(() => currentSchemaActor(client, tenantId));
        await this.admitReceipt(client, tenantId, receipt, actor, 'read');
      }
      return receipt;
    });
  }
}
