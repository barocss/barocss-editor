import { readNoteV1SnapshotFile } from '@barocss/office-note/file';
import { API_ROOT, MAX_SNAPSHOT_BYTES, snapshotHash, type SavedDocument } from './shared';

/** The subset of the documented Cloudflare D1 API used by this adapter. */
export interface D1Statement {
  bind(...values: (string | number)[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface WorkspaceDB { prepare(sql: string): D1Statement }
interface RevisionRow {
  document_id: string; revision: number; title: string; page_id: string;
  snapshot_text: string; snapshot_hash: string; request_id: string; request_hash: string; saved_at: string;
}
const uuid = (value: unknown): value is string => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!record(a) || !record(b)) return Array.isArray(a) && Array.isArray(b) &&
    a.length === b.length && a.every((one, i) => equal(one, b[i]));
  return Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
}
function reply(status: number, value: unknown): Response {
  return Response.json(value, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Vary': 'oai-authenticated-user-id'
  } });
}
const problem = (status: number, code: string) => reply(status, { code });
function saved(row: RevisionRow): SavedDocument {
  return { documentId: row.document_id, revision: row.revision, title: row.title,
    pageId: row.page_id, snapshotText: row.snapshot_text, snapshotHash: row.snapshot_hash,
    requestId: row.request_id, savedAt: row.saved_at };
}
function head(row: RevisionRow) {
  return { documentId: row.document_id, revision: row.revision, title: row.title,
    pageId: row.page_id, snapshotHash: row.snapshot_hash, savedAt: row.saved_at };
}
async function body(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > MAX_SNAPSHOT_BYTES * 2) { await reader.cancel(); return null; }
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return null; }
}

/**
 * Sites dispatch authenticates and supplies this header. Never expose this adapter behind an
 * origin that forwards visitor-supplied identity headers without a trusted authentication boundary.
 * Non-API paths return null so an official Sites entrypoint can serve the built assets.
 */
export async function handleWorkspaceApi(request: Request, db?: WorkspaceDB): Promise<Response | null> {
  const response = await route(request, db);
  const owner = request.headers.get('oai-authenticated-user-id')?.trim();
  if (response && owner && owner.length <= 256) response.headers.set('X-Workspace-User-Scope', owner);
  return response;
}
async function route(request: Request, db?: WorkspaceDB): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== API_ROOT && !url.pathname.startsWith(`${API_ROOT}/`)) return null;
  const owner = request.headers.get('oai-authenticated-user-id')?.trim();
  if (!owner || owner.length > 256) return problem(401, 'authentication_required');
  const path = url.pathname.slice(API_ROOT.length);
  if (request.method === 'GET' && path === '/session') return reply(200, {
    authenticated: true, userScope: owner, storageAvailable: !!db,
    ai: { available: false, code: 'runtime_not_configured' }
  });
  // Expected scope is a frozen client precondition, never an authentication credential. Check it
  // before reading a body or touching D1, so a retired draft cannot be written as the new actor.
  if (request.headers.get('X-Workspace-Expected-Scope') !== owner) return problem(401, 'identity_changed');
  if (!db) return problem(503, 'storage_not_configured');
  if (!['GET', 'POST', 'PUT'].includes(request.method)) return problem(405, 'method_not_allowed');
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return problem(403, 'origin_denied');
  try {
    if (request.method === 'GET' && path === '/documents') {
      const after = url.searchParams.get('after') ?? '';
      if (after && !uuid(after)) return problem(400, 'invalid_cursor');
      const rows = await db.prepare(`SELECT r.* FROM workspace_document_revisions r
        WHERE r.owner_id = ? AND r.document_id > ? AND r.revision = (
          SELECT MAX(h.revision) FROM workspace_document_revisions h
          WHERE h.owner_id = r.owner_id AND h.document_id = r.document_id)
        ORDER BY r.document_id LIMIT 51`).bind(owner, after).all<RevisionRow>();
      const visible = rows.results.slice(0, 50);
      return reply(200, { documents: visible.map(head),
        nextCursor: rows.results.length > 50 ? visible.at(-1)?.document_id : null });
    }
    const receipt = path.match(/^\/receipts\/([^/]+)$/);
    if (request.method === 'GET' && receipt && uuid(receipt[1])) {
      const row = await db.prepare('SELECT * FROM workspace_document_revisions WHERE owner_id = ? AND request_id = ?')
        .bind(owner, receipt[1]).first<RevisionRow>();
      return row ? reply(200, saved(row)) : problem(404, 'not_found');
    }
    const documentRoute = path.match(/^\/documents\/([^/]+)$/);
    const documentId = documentRoute?.[1];
    if (request.method === 'GET' && documentId && uuid(documentId)) {
      const row = await db.prepare(`SELECT * FROM workspace_document_revisions
        WHERE owner_id = ? AND document_id = ? ORDER BY revision DESC LIMIT 1`)
        .bind(owner, documentId).first<RevisionRow>();
      return row ? reply(200, saved(row)) : problem(404, 'not_found');
    }
    const creating = request.method === 'POST' && path === '/documents';
    const updating = request.method === 'PUT' && documentId && uuid(documentId);
    if (!creating && !updating) return problem(404, 'not_found');
    const input = await body(request);
    if (!record(input) || Object.keys(input).some(key => !['documentId', 'baseRevision', 'requestId', 'snapshotText'].includes(key)) ||
      !uuid(input.documentId) || !uuid(input.requestId) || typeof input.snapshotText !== 'string' ||
      !Number.isSafeInteger(input.baseRevision) || (input.baseRevision as number) < 0 ||
      (input.baseRevision as number) >= Number.MAX_SAFE_INTEGER ||
      (creating ? input.baseRevision !== 0 : input.baseRevision === 0 || input.documentId !== documentId)) return problem(400, 'invalid_save');
    if (new TextEncoder().encode(input.snapshotText).length > MAX_SNAPSHOT_BYTES) return problem(413, 'document_too_large');
    const parsed = readNoteV1SnapshotFile(input.snapshotText);
    if ('error' in parsed) return problem(422, 'unsupported_note');
    const raw: unknown = JSON.parse(input.snapshotText);
    if (!record(raw) || Object.keys(raw).some(key => !['format', 'version', 'document', 'savedAt'].includes(key)) ||
      raw.format !== 'barocss-note' || raw.version !== 1 ||
      !equal(raw.document, parsed.document) || !parsed.document.attributes.pageId ||
      parsed.document.attributes.title.trim().length === 0 || parsed.document.attributes.title.length > 120) return problem(422, 'unsupported_note');
    const hash = await snapshotHash(input.snapshotText);
    const requestHash = await snapshotHash(JSON.stringify([request.method, input.documentId, input.baseRevision, input.snapshotText]));
    const findReceipt = () => db.prepare('SELECT * FROM workspace_document_revisions WHERE owner_id = ? AND request_id = ?')
      .bind(owner, input.requestId as string).first<RevisionRow>();
    const existing = await findReceipt();
    if (existing) return existing.request_hash === requestHash ? reply(200, saved(existing)) : problem(409, 'request_key_reused');
    const values = [owner, input.documentId, (input.baseRevision as number) + 1,
      parsed.document.attributes.title, parsed.document.attributes.pageId,
      input.snapshotText, hash, input.requestId, requestHash, new Date().toISOString()];
    // Each save is one atomic SQL statement. Two writers cannot both append the same next
    // revision. A rejected/stale attempt leaves zero rows and zero partial head updates.
    if (creating) await db.prepare(`INSERT OR IGNORE INTO workspace_document_revisions
      (owner_id, document_id, revision, title, page_id, snapshot_text, snapshot_hash, request_id, request_hash, saved_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (
        SELECT 1 FROM workspace_document_revisions WHERE owner_id = ? AND (document_id = ? OR page_id = ?))`)
      .bind(...values, owner, input.documentId, parsed.document.attributes.pageId).run();
    else await db.prepare(`INSERT OR IGNORE INTO workspace_document_revisions
      (owner_id, document_id, revision, title, page_id, snapshot_text, snapshot_hash, request_id, request_hash, saved_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM workspace_document_revisions WHERE owner_id = ? AND document_id = ?
          AND page_id = ? AND revision = ?)
      AND (SELECT MAX(revision) FROM workspace_document_revisions WHERE owner_id = ? AND document_id = ?) = ?`)
      .bind(...values, owner, input.documentId, parsed.document.attributes.pageId, input.baseRevision as number,
        owner, input.documentId, input.baseRevision as number).run();
    const result = await findReceipt();
    if (result) return result.request_hash === requestHash ? reply(200, saved(result)) : problem(409, 'request_key_reused');
    const current = await db.prepare(`SELECT revision FROM workspace_document_revisions
      WHERE owner_id = ? AND document_id = ? ORDER BY revision DESC LIMIT 1`)
      .bind(owner, input.documentId).first<{ revision: number }>();
    return problem(creating || current ? 409 : 404, creating || current ? 'revision_conflict' : 'not_found');
  } catch {
    // Never return provider errors, SQL, identity, or document content to the browser.
    return problem(503, 'storage_error');
  }
}
