import type { WorkspaceDB } from '../../note/cloud-workspace/server';
import { readProductDocument } from '@barocss/office-workspace';
import { readProjectRecord, type LibrarySnapshot } from '@barocss/shared';
import { STORAGE_ROOT, MAX_COMMIT_BYTES, isStoreKind, validName, storageHash, type StoreKind, type StorageItem } from './storage-protocol';

interface Row { namespace: StoreKind; name: string; revision: number; deleted: number; entry_json: string;
  snapshot_text: string; saved_at: number; request_id: string; request_hash: string; batch_index: number; batch_size: number }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
const snapshot = (row: Row): LibrarySnapshot => ({ row: { ...JSON.parse(row.entry_json), revision: row.revision, savedAt: row.saved_at }, text: row.snapshot_text });
function reply(status: number, value: unknown, owner?: string): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Vary': 'oai-authenticated-user-id', ...(owner ? { 'X-Office-User-Scope': owner } : {}) } });
}
async function body(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new Error('invalid_body');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_body');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const next = await reader.read(); if (next.done) break;
    size += next.value.byteLength; if (size > MAX_COMMIT_BYTES) { await reader.cancel(); throw new Error('document_too_large'); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function itemsOf(value: unknown): { requestId: string; items: StorageItem[] } {
  if (!record(value) || Object.keys(value).some(key => !['requestId', 'items'].includes(key)) || !uuid(value.requestId) ||
    !Array.isArray(value.items) || !value.items.length || value.items.length > 100) throw new Error('invalid_commit');
  const names = new Set<string>();
  for (const item of value.items) {
    if (!record(item) || Object.keys(item).some(key => !['entry', 'text', 'expectedRevision', 'deleted'].includes(key)) ||
      !record(item.entry) || Object.keys(item.entry).some(key => !['name', 'title', 'count', 'metadata'].includes(key)) ||
      !validName(item.entry.name) || names.has(item.entry.name) || typeof item.text !== 'string' ||
      item.expectedRevision !== null && (!Number.isSafeInteger(item.expectedRevision) || Number(item.expectedRevision) < 0 || Number(item.expectedRevision) >= Number.MAX_SAFE_INTEGER) ||
      item.deleted !== undefined && typeof item.deleted !== 'boolean' || item.deleted === true && item.expectedRevision === null ||
      item.entry.title !== undefined && (typeof item.entry.title !== 'string' || item.entry.title.length > 512) ||
      item.entry.count !== undefined && (!Number.isSafeInteger(item.entry.count) || Number(item.entry.count) < 0) ||
      item.entry.metadata !== undefined && !record(item.entry.metadata)) throw new Error('invalid_commit');
    names.add(item.entry.name);
  }
  return value as unknown as { requestId: string; items: StorageItem[] };
}
const headSQL = `SELECT r.* FROM office_store_revisions r WHERE r.owner_id = ? AND r.workspace_id = ? AND r.namespace = ? AND r.name = ? ORDER BY r.revision DESC LIMIT 1`;

/** One INSERT appends every proposed record or none; no read/modify/write head race or partial batch. */
const appendSQL = `WITH RECURSIVE scope(owner, workspace, kind, request_id, request_hash, saved_at, payload, refs) AS (VALUES (?, ?, ?, ?, ?, ?, ?, ?)),
 proposed AS (SELECT j.key AS batch_index, j.value, json_extract(j.value, '$.entry.name') AS name FROM scope, json_each(scope.payload) j),
 current AS (SELECT p.*, (SELECT revision FROM office_store_revisions r, scope s WHERE r.owner_id=s.owner AND r.workspace_id=s.workspace AND r.namespace=s.kind AND r.name=p.name ORDER BY revision DESC LIMIT 1) AS held_revision,
 (SELECT deleted FROM office_store_revisions r, scope s WHERE r.owner_id=s.owner AND r.workspace_id=s.workspace AND r.namespace=s.kind AND r.name=p.name ORDER BY revision DESC LIMIT 1) AS held_deleted FROM proposed p),
 ancestry(origin, name) AS (
 SELECT p.name, json_extract(p.value,'$.entry.metadata.parentId') FROM proposed p, scope s WHERE s.kind='note' AND COALESCE(json_extract(p.value,'$.deleted'),0)=0
 UNION SELECT a.origin, CASE WHEN EXISTS(SELECT 1 FROM proposed p WHERE p.name=a.name)
 THEN (SELECT json_extract(p.value,'$.entry.metadata.parentId') FROM proposed p WHERE p.name=a.name)
 ELSE (SELECT json_extract(r.entry_json,'$.metadata.parentId') FROM office_store_revisions r, scope s WHERE r.owner_id=s.owner AND r.workspace_id=s.workspace AND r.namespace='note' AND r.name=a.name ORDER BY revision DESC LIMIT 1) END
 FROM ancestry a WHERE a.name IS NOT NULL)
 INSERT INTO office_store_revisions(owner_id, workspace_id, namespace, name, revision, deleted, entry_json, snapshot_text, saved_at, request_id, request_hash, batch_index, batch_size)
 SELECT s.owner, s.workspace, s.kind, p.name, COALESCE(p.held_revision,0)+1, COALESCE(json_extract(p.value,'$.deleted'),0),
 json_extract(p.value,'$.entryJson'), json_extract(p.value,'$.text'), s.saved_at, s.request_id, s.request_hash, CAST(p.batch_index AS INTEGER), (SELECT COUNT(*) FROM proposed)
 FROM current p, scope s WHERE NOT EXISTS (SELECT 1 FROM current q WHERE
 (CASE WHEN q.held_deleted=1 THEN NULL ELSE q.held_revision END) IS NOT json_extract(q.value,'$.expectedRevision'))
 AND NOT EXISTS(SELECT 1 FROM office_store_revisions r WHERE r.owner_id=s.owner AND r.workspace_id=s.workspace AND r.request_id=s.request_id)
 AND NOT EXISTS(SELECT 1 FROM ancestry WHERE origin=name)
 AND NOT EXISTS(SELECT 1 FROM json_each(s.refs) ref WHERE NOT (
 (json_extract(ref.value,'$.revision') IS NULL AND json_extract(ref.value,'$.kind')=s.kind AND EXISTS(SELECT 1 FROM proposed own WHERE own.name=json_extract(ref.value,'$.name') AND COALESCE(json_extract(own.value,'$.deleted'),0)=0))
 OR (NOT (json_extract(ref.value,'$.revision') IS NULL AND json_extract(ref.value,'$.kind')=s.kind AND EXISTS(SELECT 1 FROM proposed own WHERE own.name=json_extract(ref.value,'$.name')))
 AND EXISTS(SELECT 1 FROM office_store_revisions source WHERE source.owner_id=s.owner AND source.workspace_id=s.workspace AND source.namespace=json_extract(ref.value,'$.kind') AND source.name=json_extract(ref.value,'$.name') AND source.deleted=0
 AND source.revision=COALESCE(json_extract(ref.value,'$.revision'),(SELECT MAX(h.revision) FROM office_store_revisions h WHERE h.owner_id=source.owner_id AND h.workspace_id=source.workspace_id AND h.namespace=source.namespace AND h.name=source.name))
 AND (json_extract(ref.value,'$.text') IS NULL OR (source.snapshot_text=json_extract(ref.value,'$.text') AND COALESCE(NULLIF(json_extract(source.entry_json,'$.title'),''),'제목 없는 ' || CASE source.namespace WHEN 'note' THEN 'Note' WHEN 'word' THEN 'Word' WHEN 'slides' THEN 'Slides' ELSE 'Site' END)=json_extract(ref.value,'$.title')))))))`;

const canonical = (value: unknown): string => JSON.stringify(value, (_key, held: unknown) => record(held) ? Object.fromEntries(Object.keys(held).sort().map(key => [key, held[key]])) : held);

export async function handleOfficeStorage(request: Request, db?: WorkspaceDB): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== STORAGE_ROOT && !url.pathname.startsWith(STORAGE_ROOT + '/')) return null;
  const owner = request.headers.get('oai-authenticated-user-id')?.trim();
  if (!owner || owner.length > 256) return reply(401, { code: 'authentication_required' });
  const error = (status: number, code: string) => reply(status, { code }, owner);
  const path = url.pathname.slice(STORAGE_ROOT.length);
  const session = path === '/session' && request.method === 'GET';
  if (!session && request.headers.get('X-Office-Expected-Scope') !== owner) return error(401, 'identity_changed');
  if (!db) return error(503, 'storage_unavailable');
  if (!['GET', 'POST'].includes(request.method)) return error(405, 'method_not_allowed');
  if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) return error(403, 'origin_denied');
  try {
    if (session) {
      await db.prepare('INSERT OR IGNORE INTO office_owner_workspaces(owner_id, workspace_id) VALUES (?, ?)').bind(owner, crypto.randomUUID()).run();
    }
    const workspace = await db.prepare('SELECT workspace_id FROM office_owner_workspaces WHERE owner_id = ?').bind(owner).first<{ workspace_id: string }>();
    if (!workspace) return error(403, 'workspace_unavailable');
    const workspaceId = workspace.workspace_id;
    if (session) return reply(200, { userScope: owner, workspaceId }, owner);
    const parts = path.slice(1).split('/').map(decodeURIComponent);
    if (parts[0] !== workspaceId) return error(403, 'workspace_unavailable');
    const receipt = async (requestId: string) => (await db.prepare(`SELECT * FROM office_store_revisions WHERE owner_id=? AND workspace_id=? AND request_id=? ORDER BY batch_index`)
      .bind(owner, workspaceId, requestId).all<Row>()).results;
    const receiptReply = (rows: Row[]) => reply(200, { workspaceId, requestId: rows[0].request_id, requestHash: rows[0].request_hash, snapshots: rows.map(snapshot) }, owner);
    if (parts.length === 3 && parts[1] === 'receipts' && request.method === 'GET' && uuid(parts[2])) {
      const rows = await receipt(parts[2]); return rows.length ? receiptReply(rows) : error(404, 'not_found');
    }
    const kind = parts[1]; if (parts.length !== 3 || !isStoreKind(kind)) return error(404, 'not_found');
    const head = (name: string) => db.prepare(headSQL).bind(owner, workspaceId, kind, name).first<Row>();
    if (request.method === 'GET' && parts[2] === 'item') {
      const name = url.searchParams.get('name'); if (!validName(name)) return error(400, 'invalid_name');
      const row = await head(name); return row && !row.deleted ? reply(200, { workspaceId, snapshot: snapshot(row) }, owner) : error(404, 'not_found');
    }
    if (request.method === 'GET' && parts[2] === 'snapshots') {
      const after = url.searchParams.get('after') ?? ''; if (after && !validName(after)) return error(400, 'invalid_cursor');
      const rows = (await db.prepare(`SELECT r.* FROM office_store_revisions r WHERE r.owner_id=? AND r.workspace_id=? AND r.namespace=? AND r.name>? AND r.deleted=0
        AND r.revision=(SELECT MAX(h.revision) FROM office_store_revisions h WHERE h.owner_id=r.owner_id AND h.workspace_id=r.workspace_id AND h.namespace=r.namespace AND h.name=r.name)
        ORDER BY r.name LIMIT 9`).bind(owner, workspaceId, kind, after).all<Row>()).results;
      return reply(200, { workspaceId, snapshots: rows.slice(0, 8).map(snapshot), nextCursor: rows.length > 8 ? rows[7].name : null }, owner);
    }
    if (request.method !== 'POST' || parts[2] !== 'commit') return error(404, 'not_found');
    const attempt = itemsOf(await body(request));
    const hash = await storageHash(JSON.stringify([kind, attempt.items]));
    const previousReceipt = await receipt(attempt.requestId);
    if (previousReceipt.length) {
      if (previousReceipt.some(row => row.batch_size !== previousReceipt.length)) return error(503, 'invalid_receipt');
      return previousReceipt[0].request_hash === hash ? receiptReply(previousReceipt) : error(409, 'request_key_reused');
    }
    const references: { kind: string; name: string; revision?: number; text?: string; title?: string }[] = [];
    const projectNames = kind === 'catalog' ? attempt.items.filter(item => item.entry.name.startsWith('project:')).map(item => item.entry.name) : [];
    const previousProjects = new Map<string, Row>(projectNames.length ? (await db.prepare(`SELECT r.* FROM office_store_revisions r WHERE r.owner_id=? AND r.workspace_id=? AND r.namespace='catalog' AND r.name IN (SELECT value FROM json_each(?))
      AND r.revision=(SELECT MAX(h.revision) FROM office_store_revisions h WHERE h.owner_id=r.owner_id AND h.workspace_id=r.workspace_id AND h.namespace=r.namespace AND h.name=r.name)`)
      .bind(owner, workspaceId, JSON.stringify(projectNames)).all<Row>()).results.map(row => [row.name, row]) : []);
    for (const item of attempt.items) {
      if (item.deleted) continue;
      if (kind !== 'catalog') {
        const product = kind === 'slides-library' ? 'slides' : kind === 'site-library' ? 'site' : kind;
        try { await readProductDocument(product, item.text); } catch { return error(422, 'unsupported_document'); }
        const raw = JSON.parse(item.text);
        if (kind === 'note' && raw.document?.attributes?.pageId !== item.entry.name) return error(422, 'document_identity_mismatch');
        if (kind === 'note' && item.entry.metadata?.parentId !== undefined && item.entry.metadata.parentId !== null) {
          if (!validName(item.entry.metadata.parentId)) return error(422, 'invalid_parent');
          references.push({ kind: 'note', name: item.entry.metadata.parentId });
        }
      } else if (item.entry.name.startsWith('project:')) {
        let project: ReturnType<typeof readProjectRecord>;
        try { project = readProjectRecord(JSON.parse(item.text)); } catch { return error(422, 'invalid_project'); }
        if (item.entry.name !== `project:${project.id}`) return error(422, 'project_identity_mismatch');
        const oldRow = previousProjects.get(item.entry.name);
        const previous = oldRow && !oldRow.deleted ? readProjectRecord(JSON.parse(oldRow.snapshot_text)) : null;
        const pins = (record: ReturnType<typeof readProjectRecord>) => [...record.results.flatMap(row => row.inputs), ...record.comments.map(row => row.pin), ...record.works.flatMap(row => row.inputs)];
        const oldPins = new Map(previous ? pins(previous).map(pin => [pin.id, pin]) : []);
        for (const result of project.results) references.push({ kind: result.document.product, name: result.document.id });
        for (const pin of pins(project)) {
          if (oldPins.has(pin.id) && canonical(oldPins.get(pin.id)) !== canonical(pin)) return error(422, 'immutable_pin');
          references.push({ kind: pin.document.product, name: pin.document.id, revision: pin.revision, text: pin.text, title: pin.title });
        }
        for (const comment of project.comments) {
          const old = previous?.comments.find(row => row.id === comment.id);
          if (old && canonical([old.resultId, old.target, old.pin.id]) !== canonical([comment.resultId, comment.target, comment.pin.id])) return error(422, 'immutable_anchor');
          const result = project.results.find(row => row.id === comment.resultId);
          if (!result || result.document.id !== comment.pin.document.id || result.document.product !== comment.pin.document.product) return error(422, 'source_unavailable');
        }
      } else {
        const split = item.entry.name.indexOf(':'), product = item.entry.name.slice(0, split), name = item.entry.name.slice(split + 1);
        if (!['note', 'word', 'slides', 'site'].includes(product) || !validName(name) || !record(JSON.parse(item.text))) return error(422, 'invalid_catalog');
        references.push({ kind: product, name });
      }
    }
    const proposed = attempt.items.map(item => ({ ...item, entryJson: JSON.stringify(item.entry) }));
    if (new TextEncoder().encode(JSON.stringify(proposed)).length > 1_900_000) return error(413, 'document_too_large');
    if (new TextEncoder().encode(JSON.stringify(references)).length > 1_900_000) return error(413, 'document_too_large');
    await db.prepare(appendSQL).bind(owner, workspaceId, kind, attempt.requestId, hash, Date.now(), JSON.stringify(proposed), JSON.stringify(references)).run();
    const rows = await receipt(attempt.requestId);
    if (rows.length) {
      if (rows.length !== attempt.items.length || rows.some(row => row.batch_size !== rows.length)) return error(503, 'invalid_receipt');
      return rows[0].request_hash === hash ? receiptReply(rows) : error(409, 'request_key_reused');
    }
    for (const item of attempt.items) {
      const row = await head(item.entry.name), actual = row && !row.deleted ? row.revision : null;
      if (actual !== item.expectedRevision) return reply(409, { code: 'revision_conflict', name: item.entry.name, latest: row && !row.deleted ? snapshot(row) : null }, owner);
    }
    return error(409, 'source_conflict');
  } catch (cause) {
    if (cause instanceof SyntaxError || cause instanceof URIError) return error(400, 'invalid_request');
    if (cause instanceof Error && ['invalid_body', 'invalid_commit', 'document_too_large'].includes(cause.message)) return error(cause.message === 'document_too_large' ? 413 : 400, cause.message);
    return error(503, 'storage_error');
  }
}
