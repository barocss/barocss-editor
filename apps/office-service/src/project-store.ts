import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { readNoteSnapshotFile } from '@barocss/office-note-file';
import { currentSchemaActor, admitDocumentSchemaBundle, SchemaRegistryError, type DocumentSchemaScopePolicy } from './schema-registry-store.js';
import { MembershipStore, TenantAccessDeniedError, type VerifiedPrincipal } from './membership-store.js';
import type { Product } from './document-store.js';
import { captureExecutionTarget } from './project-execution-native.js';

export interface ProjectDocument { product: Product; id: string }
export interface ProjectPin { id: string; document: ProjectDocument; revision: number; text: string; title: string }
export interface ProjectRecord {
  id: string; title: string; goal: string; archived: boolean;
  results: Array<{ id: string; name: string; document: ProjectDocument; inputs: ProjectPin[]; request?: string }>;
  comments: Array<{ id: string; resultId: string; target: ProjectTarget; pin: ProjectPin;
    actor: { kind: 'human'; id: string; label: string }; body: string; createdAt: string;
    workId?: string; status: 'open' | 'resolved' }>;
  works: Array<{ id: string; commentId: string; request: string; state: 'unconnected' | 'paused';
    inputs: ProjectPin[]; outputs: string[]; reason: string; createdAt: string }>;
  activities: Array<{ id: string; at: string; label: string }>;
  drafts: Record<string, string>;
}
export type ProjectTarget = { kind: 'document' | 'word-comment'; id: string; quote: string } | {
  kind: 'note-paragraph'; id: string; quote: string; selector: { version: 1; pageId: string; paragraphIndex: number };
} | {
  kind: 'note-native2-paragraph-review'; id: string; quote: string;
  selector: { version: 2; pageId: string; paragraphIndex: number };
};
export interface ProjectSource { documentId: string; revision: number; snapshotHash: string }
export type ProjectAction =
  | { type: 'metadata'; title?: string; goal?: string; archived?: boolean }
  | { type: 'link-result'; name: string; document: ProjectDocument }
  | { type: 'unlink-result'; resultId: string }
  | { type: 'comment'; resultId: string; target: ProjectTarget; body: string; source: ProjectSource }
  | { type: 'request'; commentId: string; request: string }
  | { type: 'pause'; workId: string; paused: boolean }
  | { type: 'draft'; key: string; text: string }
  | { type: 'pin-input'; resultId: string; source: ProjectSource; requestId?: string };
export interface CreateProjectInput { workspaceId: string; title: string; goal: string; idempotencyKey: string }
export interface UpdateProjectInput { expectedRevision: number; idempotencyKey: string; action: ProjectAction }
export interface ProjectView {
  project: { record: ProjectRecord; revision: number }; tenantId: string; workspaceId: string;
  actor: { kind: 'human'; id: string; label: string };
}
export class ProjectError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 409 | 413 | 422, public readonly reason: string) { super(reason); }
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const products = new Set(['note', 'word', 'slides', 'site']);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function shape(value: unknown, allowed: string[], required = allowed): asserts value is Record<string, unknown> {
  if (!object(value) || Object.keys(value).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(value, k))) {
    throw new ProjectError(400, 'invalid_request');
  }
}
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new ProjectError(400, 'invalid_request');
}
function text(value: unknown, limit: number, empty = false): asserts value is string {
  if (typeof value !== 'string' || [...value].length > limit || (!empty && !value.trim()) || [...value].some(char => char.charCodeAt(0) < 32 && !'\t\n\r'.includes(char))) {
    throw new ProjectError(422, 'invalid_text');
  }
}
function key(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value)) throw new ProjectError(400, 'invalid_idempotency_key');
}
function revision(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new ProjectError(400, 'invalid_revision');
}
function source(value: unknown) {
  shape(value, ['documentId', 'revision', 'snapshotHash']); id(value.documentId); revision(value.revision);
  if (typeof value.snapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.snapshotHash)) throw new ProjectError(400, 'invalid_request');
}
/** Untrusted clients can request only bounded human actions, never write an execution result. */
export function validateProjectAction(value: unknown): asserts value is ProjectAction {
  if (!object(value)) throw new ProjectError(400, 'invalid_request');
  switch (value.type) {
    case 'metadata':
      shape(value, ['type', 'title', 'goal', 'archived'], ['type']);
      if (Object.keys(value).length < 2) throw new ProjectError(400, 'invalid_request');
      if (value.title !== undefined) text(value.title, 200);
      if (value.goal !== undefined) text(value.goal, 4000, true);
      if (value.archived !== undefined && typeof value.archived !== 'boolean') throw new ProjectError(400, 'invalid_request');
      break;
    case 'link-result':
      shape(value, ['type', 'name', 'document']); text(value.name, 200);
      shape(value.document, ['product', 'id']); id(value.document.id);
      if (!products.has(value.document.product as string)) throw new ProjectError(400, 'invalid_request');
      break;
    case 'unlink-result': shape(value, ['type', 'resultId']); id(value.resultId); break;
    case 'comment':
      shape(value, ['type', 'resultId', 'target', 'body', 'source']); id(value.resultId); text(value.body, 8000);
      if (object(value.target) && ['note-paragraph', 'note-native2-paragraph-review'].includes(String(value.target.kind))) {
        shape(value.target, ['kind', 'id', 'quote', 'selector']); id(value.target.id); text(value.target.quote, 8000);
        shape(value.target.selector, ['version', 'pageId', 'paragraphIndex']);
        if (value.target.kind === 'note-paragraph') id(value.target.selector.pageId);
        else text(value.target.selector.pageId, 120);
        if (value.target.selector.version !== (value.target.kind === 'note-paragraph' ? 1 : 2) || !Number.isSafeInteger(value.target.selector.paragraphIndex) ||
          Number(value.target.selector.paragraphIndex) < 0) throw new ProjectError(400, 'invalid_request');
      } else {
        shape(value.target, ['kind', 'id', 'quote']); text(value.target.id, 120); text(value.target.quote, 8000, true);
        if (!['document', 'word-comment'].includes(value.target.kind as string)) throw new ProjectError(400, 'invalid_request');
      }
      source(value.source); break;
    case 'request': shape(value, ['type', 'commentId', 'request']); id(value.commentId); text(value.request, 8000); break;
    case 'pause':
      shape(value, ['type', 'workId', 'paused']); id(value.workId);
      if (typeof value.paused !== 'boolean') throw new ProjectError(400, 'invalid_request');
      break;
    case 'draft': shape(value, ['type', 'key', 'text']); key(value.key); text(value.text, 8000, true); break;
    case 'pin-input':
      shape(value, ['type', 'resultId', 'source', 'requestId'], ['type', 'resultId', 'source']); id(value.resultId);
      source(value.source); if (value.requestId !== undefined) id(value.requestId); break;
    default: throw new ProjectError(400, 'invalid_request');
  }
}
interface Row { id: string; workspace_id: string; revision: number; data: ProjectRecord }
export interface ProjectSourceRow { id: string; product: Product; title: string; mode: string; revision: number;
  snapshot_hash: string; snapshot_text: string; file_format?: string; file_version?: number; page_id?: string | null }
export interface ProjectExecutionContext {
  client: PoolClient; project: Row; actor: ProjectView['actor']; authorityEpoch: string;
  document(documentId: string): Promise<ProjectSourceRow>;
}

export interface ProjectStoreOptions { noteSchemaPolicy?: readonly DocumentSchemaScopePolicy[] }

/** Every operation checks current membership inside the same RLS transaction. */
export class ProjectStore {
  private readonly membership: MembershipStore;
  constructor(pool: Pool, private readonly options: ProjectStoreOptions = {}) { this.membership = new MembershipStore(pool); }
  private async actor(client: PoolClient, _principal: VerifiedPrincipal, writable = false) {
    const found = await client.query<{ id: string; role: string }>(`SELECT id,role FROM wonffice.project_current_actor(
      NULLIF(current_setting('wonffice.tenant_id',true),'')::uuid)`);
    if (!found.rows[0]) throw new TenantAccessDeniedError();
    if (writable && found.rows[0].role === 'viewer') throw new ProjectError(403, 'forbidden');
    return { kind: 'human' as const, id: found.rows[0].id, label: 'Member' };
  }
  private view(row: Row, tenantId: string, actor: ProjectView['actor']): ProjectView {
    const record = { ...row.data, drafts: Object.fromEntries(Object.entries(row.data.drafts)
      .filter(([key]) => key.startsWith(`${actor.id}:`))) };
    return { project: { record, revision: row.revision }, tenantId, workspaceId: row.workspace_id, actor };
  }
  private async workspace(client: PoolClient, tenantId: string, workspaceId: string) {
    const result = await client.query('SELECT 1 FROM wonffice.workspaces WHERE tenant_id=$1 AND id=$2', [tenantId, workspaceId]);
    if (!result.rowCount) throw new ProjectError(404, 'not_found');
  }
  private async require(client: PoolClient, tenantId: string, projectId: string, lock = false) {
    const found = await client.query<Row>(`SELECT id,workspace_id,revision,data FROM wonffice.projects
      WHERE tenant_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`, [tenantId, projectId]);
    if (!found.rows[0]) throw new ProjectError(404, 'not_found');
    return found.rows[0];
  }
  private async document(client: PoolClient, tenantId: string, workspaceId: string, documentId: string) {
    const found = await client.query<ProjectSourceRow>(`SELECT d.id,d.product,d.title,d.mode,s.file_format,s.file_version,d.page_id,s.revision,s.snapshot_hash,s.snapshot_text
      FROM wonffice.documents d JOIN wonffice.document_snapshots s ON s.tenant_id=d.tenant_id AND s.document_id=d.id
      WHERE d.tenant_id=$1 AND d.workspace_id=$2 AND d.id=$3 FOR SHARE OF d,s`, [tenantId, workspaceId, documentId]);
    if (!found.rows[0]) throw new ProjectError(404, 'source_not_found');
    await this.admitSnapshot(client, tenantId, workspaceId, found.rows[0], found.rows[0].snapshot_text, found.rows[0].snapshot_hash);
    return found.rows[0];
  }
  /** Read admission borrows this Project transaction; it does not open another store or connection. */
  private async admitSnapshot(client: PoolClient, tenantId: string, workspaceId: string, current: ProjectSourceRow,
    snapshotText: string, expectedHash?: string) {
    let native2 = current.file_version === 2 && current.product === 'note';
    if (!native2 && typeof snapshotText === 'string') {
      try { const value: unknown = JSON.parse(snapshotText);
        native2 = object(value) && value.format === 'barocss-note' && value.version === 2; }
      catch { /* Existing legacy input validation remains at its native boundary. */ }
    }
    if (!native2) return;
    if (current.product !== 'note' || current.file_format !== 'barocss-note' || current.file_version !== 2)
      throw new ProjectError(409, 'source_conflict');
    if (current.mode !== 'snapshot') throw new ProjectError(409, 'source_unavailable');
    if (typeof snapshotText !== 'string') throw new ProjectError(422, 'invalid_snapshot');
    if (Buffer.byteLength(snapshotText) > 524288) throw new ProjectError(413, 'snapshot_too_large');
    if (expectedHash !== undefined && hash(snapshotText) !== expectedHash) throw new ProjectError(409, 'source_conflict');
    const parsed = readNoteSnapshotFile(snapshotText);
    if ('error' in parsed || !('fileVersion' in parsed) || parsed.fileVersion !== 2)
      throw new ProjectError(422, 'invalid_snapshot');
    if (!current.page_id || parsed.document.attributes?.pageId !== current.page_id) throw new ProjectError(409, 'source_conflict');
    try {
      const actor = await currentSchemaActor(client, tenantId);
      await admitDocumentSchemaBundle(client, { tenantId, workspaceId }, parsed.schemaBundle, actor, 'read', this.options.noteSchemaPolicy ?? []);
      const latest = await currentSchemaActor(client, tenantId);
      if (latest.id !== actor.id || latest.role !== actor.role || latest.epoch !== actor.epoch)
        throw new ProjectError(409, 'authority_changed');
    } catch (error) {
      if (error instanceof SchemaRegistryError) throw new ProjectError(error.status, error.reason);
      throw error;
    }
  }
  private async pin(client: PoolClient, tenantId: string, row: Row, input: ProjectSource) {
    const current = await this.document(client, tenantId, row.workspace_id, input.documentId);
    if (current.mode !== 'snapshot') throw new ProjectError(409, 'source_unavailable');
    if (current.revision !== input.revision || current.snapshot_hash !== input.snapshotHash || hash(current.snapshot_text) !== current.snapshot_hash) {
      throw new ProjectError(409, 'source_conflict');
    }
    const pin: ProjectPin = { id: randomUUID(), document: { product: current.product, id: current.id },
      revision: current.revision, text: current.snapshot_text, title: current.title };
    await client.query(`INSERT INTO wonffice.project_pins
      (tenant_id,project_id,id,document_id,snapshot_revision,snapshot_hash,snapshot_text,source_title,source_product)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [tenantId, row.id, pin.id, current.id, current.revision, current.snapshot_hash, current.snapshot_text, current.title, current.product]);
    return pin;
  }
  /** Stored evidence is still confidential: a historical pin does not confer current source access. */
  private async sources(client: PoolClient, tenantId: string, row: Row) {
    const ids = new Set([...row.data.results.map(r => r.document.id),
      ...row.data.results.flatMap(r => r.inputs.map(p => p.document.id)),
      ...row.data.comments.map(c => c.pin.document.id), ...row.data.works.flatMap(w => w.inputs.map(p => p.document.id))]);
    const current = new Map<string, ProjectSourceRow>();
    for (const documentId of [...ids].sort()) current.set(documentId, await this.document(client, tenantId, row.workspace_id, documentId));
    // Current allowed bytes never grant every older embedded bundle access.
    const pins = [...row.data.results.flatMap(r => r.inputs), ...row.data.comments.map(c => c.pin),
      ...row.data.works.flatMap(w => w.inputs)];
    for (const pin of pins) {
      const source = current.get(pin.document.id);
      if (!source || source.product !== pin.document.product) throw new ProjectError(409, 'source_conflict');
      await this.admitSnapshot(client, tenantId, row.workspace_id, source, pin.text);
    }
  }
  private async reserve(client: PoolClient, tenantId: string, actorId: string, idempotencyKey: string, requestHash: string) {
    const inserted = await client.query(`INSERT INTO wonffice.project_receipts
      (tenant_id,identity_id,idempotency_key,request_hash) VALUES ($1,$2,$3,$4)
      ON CONFLICT DO NOTHING RETURNING 1`, [tenantId, actorId, idempotencyKey, requestHash]);
    if (inserted.rowCount) return null;
    const found = await client.query<{ request_hash: string; result_project: ProjectView }>(`SELECT request_hash,result_project
      FROM wonffice.project_receipts WHERE tenant_id=$1 AND identity_id=$2 AND idempotency_key=$3`, [tenantId, actorId, idempotencyKey]);
    if (!found.rows[0]?.result_project) throw new Error('receipt_unfinished');
    if (found.rows[0].request_hash !== requestHash) throw new ProjectError(409, 'key_reuse');
    const result = found.rows[0].result_project;
    const current = await this.require(client, tenantId, result.project.record.id);
    // Validate both the current source links and the historical result before replaying content.
    await this.sources(client, tenantId, current);
    await this.sources(client, tenantId, { ...current, data: result.project.record });
    return result;
  }
  private async complete(client: PoolClient, tenantId: string, actorId: string, idempotencyKey: string, result: ProjectView) {
    await client.query(`UPDATE wonffice.project_receipts SET project_id=$4,result_project=$5
      WHERE tenant_id=$1 AND identity_id=$2 AND idempotency_key=$3`,
    [tenantId, actorId, idempotencyKey, result.project.record.id, JSON.stringify(result)]);
    return result;
  }
  async create(principal: VerifiedPrincipal, tenantId: string, input: CreateProjectInput) {
    id(tenantId); shape(input, ['workspaceId', 'title', 'goal', 'idempotencyKey']); id(input.workspaceId);
    text(input.title, 200); text(input.goal, 4000, true); key(input.idempotencyKey);
    return this.membership.withAuthorizedTenant(principal, tenantId, async (client, role) => {
      if (role === 'viewer') throw new ProjectError(403, 'forbidden');
      const actor = await this.actor(client, principal, true);
      const replay = await this.reserve(client, tenantId, actor.id, input.idempotencyKey,
        hash(JSON.stringify(['create', input.workspaceId, input.title, input.goal])));
      if (replay) return replay;
      await this.workspace(client, tenantId, input.workspaceId);
      const record: ProjectRecord = { id: randomUUID(), title: input.title, goal: input.goal, archived: false,
        results: [], comments: [], works: [], activities: [], drafts: {} };
      const found = await client.query<Row>(`INSERT INTO wonffice.projects (tenant_id,id,workspace_id,data)
        VALUES ($1,$2,$3,$4) RETURNING id,workspace_id,revision,data`, [tenantId, record.id, input.workspaceId, JSON.stringify(record)]);
      return this.complete(client, tenantId, actor.id, input.idempotencyKey, this.view(found.rows[0], tenantId, actor));
    });
  }
  async list(principal: VerifiedPrincipal, tenantId: string, query: { workspaceId?: string; after?: string } = {}) {
    id(tenantId); shape(query, ['workspaceId', 'after'], []);
    if (query.workspaceId !== undefined) id(query.workspaceId); if (query.after !== undefined) id(query.after);
    return this.membership.withAuthorizedTenant(principal, tenantId, async client => {
      const actor = await this.actor(client, principal);
      const found = await client.query<Row>(`SELECT id,workspace_id,revision,data FROM wonffice.projects WHERE tenant_id=$1
        AND ($2::uuid IS NULL OR workspace_id=$2) AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT 51`,
      [tenantId, query.workspaceId ?? null, query.after ?? null]);
      const rows = found.rows.slice(0, 50);
      for (const row of rows) await this.sources(client, tenantId, row);
      return { projects: rows.map(row => this.view(row, tenantId, actor)), nextCursor: found.rows.length > 50 ? rows[49].id : null };
    });
  }
  async get(principal: VerifiedPrincipal, tenantId: string, projectId: string) {
    id(tenantId); id(projectId);
    return this.membership.withAuthorizedTenant(principal, tenantId, async client => {
      const row = await this.require(client, tenantId, projectId); await this.sources(client, tenantId, row);
      return this.view(row, tenantId, await this.actor(client, principal));
    });
  }
  /** Execution stays in the existing catalog's current membership/source transaction. */
  async withExecutionContext<T>(principal: VerifiedPrincipal, tenantId: string, projectId: string, writable: boolean,
    operation: (context: ProjectExecutionContext) => Promise<T>): Promise<T> {
    id(tenantId); id(projectId);
    return this.membership.withAuthorizedTenant(principal, tenantId, async (client, role) => {
      if (writable && role === 'viewer') throw new ProjectError(403, 'forbidden');
      const actor = await this.actor(client, principal, writable);
      const epoch = await client.query<{ epoch: string }>('SELECT epoch FROM wonffice.project_execution_actor_epoch($1)', [tenantId]);
      // project_current_actor already holds FOR SHARE on this current membership.
      // Company role changes use a separate audit log; the row lifetime also
      // detects revoke/restore and role ABA without changing old migrations.
      const membership = await client.query<{ version: string }>(
        'SELECT xmin::text AS version FROM wonffice.tenant_memberships WHERE tenant_id=$1 AND identity_id=$2 AND revoked_at IS NULL',
        [tenantId, actor.id]);
      if (!epoch.rows[0] || !membership.rows[0]) throw new TenantAccessDeniedError();
      const project = await this.require(client, tenantId, projectId, writable);
      await this.sources(client, tenantId, project);
      return operation({ client, project, actor, authorityEpoch: `${epoch.rows[0].epoch}:${membership.rows[0].version}`,
        document: documentId => this.document(client, tenantId, project.workspace_id, documentId) });
    });
  }
  async getPin(principal: VerifiedPrincipal, tenantId: string, projectId: string, pinId: string) {
    id(tenantId); id(projectId); id(pinId);
    return this.membership.withAuthorizedTenant(principal, tenantId, async client => {
      await this.actor(client, principal);
      const row = await this.require(client, tenantId, projectId);
      const found = await client.query<{ document_id: string; snapshot_revision: number; snapshot_hash: string;
        snapshot_text: string; source_title: string; source_product: Product }>(`SELECT document_id,snapshot_revision,snapshot_hash,
        snapshot_text,source_title,source_product FROM wonffice.project_pins WHERE tenant_id=$1 AND project_id=$2 AND id=$3`,
      [tenantId, projectId, pinId]);
      const stored = found.rows[0]; if (!stored) throw new ProjectError(404, 'not_found');
      const current = await this.document(client, tenantId, row.workspace_id, stored.document_id);
      if (current.product !== stored.source_product) throw new ProjectError(409, 'source_conflict');
      await this.admitSnapshot(client, tenantId, row.workspace_id, current, stored.snapshot_text, stored.snapshot_hash);
      return { pin: { id: pinId, document: { product: stored.source_product, id: stored.document_id },
        revision: stored.snapshot_revision, text: stored.snapshot_text, title: stored.source_title },
      sourceState: current.mode !== 'snapshot' ? 'unavailable' as const
        : current.revision === stored.snapshot_revision && current.snapshot_hash === stored.snapshot_hash ? 'current' as const : 'changed' as const };
    });
  }
  async update(principal: VerifiedPrincipal, tenantId: string, projectId: string, input: UpdateProjectInput) {
    id(tenantId); id(projectId); shape(input, ['expectedRevision', 'idempotencyKey', 'action']);
    revision(input.expectedRevision); key(input.idempotencyKey); validateProjectAction(input.action);
    return this.membership.withAuthorizedTenant(principal, tenantId, async (client, role) => {
      if (role === 'viewer') throw new ProjectError(403, 'forbidden');
      const actor = await this.actor(client, principal, true);
      const replay = await this.reserve(client, tenantId, actor.id, input.idempotencyKey,
        hash(JSON.stringify(['update', projectId, input.expectedRevision, input.action])));
      if (replay) return replay;
      const row = await this.require(client, tenantId, projectId, true);
      if (row.revision !== input.expectedRevision) throw new ProjectError(409, 'revision_conflict');
      await this.sources(client, tenantId, row);
      const data = row.data, action = input.action, at = new Date().toISOString();
      if (data.archived && action.type !== 'metadata') throw new ProjectError(409, 'project_archived');
      let label = '';
      const result = (resultId: string) => {
        const found = data.results.find(one => one.id === resultId);
        if (!found) throw new ProjectError(404, 'result_not_found'); return found;
      };
      switch (action.type) {
        case 'metadata':
          if (action.title !== undefined) data.title = action.title;
          if (action.goal !== undefined) data.goal = action.goal;
          if (action.archived !== undefined) data.archived = action.archived;
          label = 'Project details updated'; break;
        case 'link-result': {
          const document = await this.document(client, tenantId, row.workspace_id, action.document.id);
          if (document.product !== action.document.product) throw new ProjectError(409, 'source_conflict');
          if (!data.results.some(r => r.document.id === action.document.id)) {
            if (data.results.length >= 100) throw new ProjectError(422, 'project_limit');
            data.results.push({ id: randomUUID(), name: action.name, document: action.document, inputs: [] }); label = 'Result linked';
          }
          break;
        }
        case 'unlink-result':
          result(action.resultId);
          data.results = data.results.filter(r => r.id !== action.resultId); label = 'Result unlinked'; break;
        case 'comment': {
          const output = result(action.resultId);
          if (output.document.id !== action.source.documentId) throw new ProjectError(409, 'source_conflict');
          const pin = await this.pin(client, tenantId, row, action.source);
          verifyProjectTarget(pin, action.target);
          if (data.comments.length >= 100) throw new ProjectError(422, 'project_limit');
          data.comments.push({ id: randomUUID(), resultId: action.resultId, target: action.target, pin, actor,
            body: action.body, createdAt: at, status: 'open' }); label = 'Opinion recorded'; break;
        }
        case 'request': {
          const comment = data.comments.find(c => c.id === action.commentId);
          if (!comment) throw new ProjectError(404, 'comment_not_found');
          result(comment.resultId);
          const currentSource = await this.document(client, tenantId, row.workspace_id, comment.pin.document.id);
          if (currentSource.mode !== 'snapshot' || currentSource.revision !== comment.pin.revision ||
            currentSource.snapshot_hash !== hash(comment.pin.text)) throw new ProjectError(409, 'source_conflict');
          verifyProjectTarget(comment.pin, comment.target);
          if (!comment.workId) {
            if (data.works.length >= 100) throw new ProjectError(422, 'project_limit');
            const workId = randomUUID(); comment.workId = workId;
            data.works.push({ id: workId, commentId: comment.id, request: action.request, state: 'unconnected',
              inputs: [comment.pin], outputs: [comment.resultId], reason: 'No product Agent execution is connected', createdAt: at });
            label = 'Revision requested';
          } else {
            const work = data.works.find(w => w.id === comment.workId);
            if (!work) throw new Error('invalid_work_link');
            if (work.request !== action.request || work.state !== 'unconnected') {
              work.request = action.request; work.state = 'unconnected';
              work.reason = 'No product Agent execution is connected'; label = 'Same revision request updated';
            }
          }
          break;
        }
        case 'pause': {
          const work = data.works.find(w => w.id === action.workId);
          if (!work) throw new ProjectError(404, 'work_not_found');
          work.state = action.paused ? 'paused' : 'unconnected';
          work.reason = action.paused ? 'Paused by a human' : 'No product Agent execution is connected';
          label = action.paused ? 'Work paused' : 'Same work resumed'; break;
        }
        case 'draft': {
          const draftKey = `${actor.id}:${action.key}`;
          if (action.text) data.drafts[draftKey] = action.text; else delete data.drafts[draftKey];
          if (Object.keys(data.drafts).length > 100) throw new ProjectError(422, 'project_limit');
          break;
        }
        case 'pin-input': {
          const output = result(action.resultId);
          if (action.requestId !== undefined && !data.works.some(w => w.id === action.requestId)) throw new ProjectError(404, 'work_not_found');
          const pin = await this.pin(client, tenantId, row, action.source);
          if (output.inputs.length >= 20) throw new ProjectError(422, 'project_limit');
          output.inputs.push(pin);
          if (action.requestId !== undefined) {
            output.request = action.requestId;
            const work = data.works.find(w => w.id === action.requestId)!;
            if (!work.outputs.includes(output.id)) work.outputs.push(output.id);
            work.inputs.push(structuredClone(pin));
          }
          label = 'Input version pinned'; break;
        }
      }
      if (label) data.activities = [...data.activities, { id: randomUUID(), at, label }].slice(-100);
      const encoded = JSON.stringify(data);
      if (Buffer.byteLength(encoded) > 4194304) throw new ProjectError(422, 'project_limit');
      const saved = await client.query<Row>(`UPDATE wonffice.projects SET data=$3,revision=revision+1,updated_at=now()
        WHERE tenant_id=$1 AND id=$2 AND revision=$4 RETURNING id,workspace_id,revision,data`, [tenantId, projectId, encoded, input.expectedRevision]);
      if (!saved.rows[0]) throw new ProjectError(409, 'revision_conflict');
      return this.complete(client, tenantId, actor.id, input.idempotencyKey, this.view(saved.rows[0], tenantId, actor));
    });
  }
}

/** Reject missing and ambiguous native anchors instead of rebinding a comment to guessed text. */
export function verifyProjectTarget(pin: ProjectPin, target: ProjectTarget) {
  if (target.kind === 'document') {
    if (target.id !== pin.document.id || target.quote !== '') throw new ProjectError(409, 'target_conflict');
    return;
  }
  if (target.kind === 'note-paragraph' || target.kind === 'note-native2-paragraph-review') {
    if (pin.document.product !== 'note') throw new ProjectError(422, 'unsupported_target');
    captureExecutionTarget(pin.text, target); return;
  }
  if (pin.document.product !== 'word') throw new ProjectError(422, 'unsupported_target');
  let value: unknown; try { value = JSON.parse(pin.text); } catch { throw new ProjectError(409, 'source_conflict'); }
  if (!object(value) || !object(value.document)) throw new ProjectError(409, 'source_conflict');
  const resources = Array.isArray(value.document.content) ? value.document.content.filter(node => object(node) && node.stype === 'resources') : [];
  if (resources.length !== 1 || !object(resources[0]) || !Array.isArray(resources[0].content)) throw new ProjectError(409, 'target_conflict');
  const threads = resources[0].content.filter(node => object(node) && node.stype === 'commentThread' &&
    object(node.attributes) && node.attributes.id === target.id);
  if (threads.length !== 1 || !object(threads[0]) || !object(threads[0].attributes)) throw new ProjectError(409, 'target_conflict');
  type Anchor = { node: Record<string, unknown>; parent?: Record<string, unknown>; index: number;
    attrs: Record<string, unknown>; start: number; end: number; text: string; blocked: boolean };
  const anchors: Anchor[] = [];
  const textOf = (node: Record<string, unknown>, depth = 0): string => {
    if (depth > 100) throw new ProjectError(409, 'target_conflict');
    if (typeof node.text === 'string') return node.text;
    return Array.isArray(node.content) ? node.content.filter(object).map(child => textOf(child, depth + 1)).join('') : '';
  };
  const visit = (node: unknown, depth: number, parent?: Record<string, unknown>, index = 0, protectedAncestor = false) => {
    if (!object(node) || node.stype === 'resources') return;
    if (depth > 100) throw new ProjectError(409, 'target_conflict');
    const blocked = protectedAncestor || node.stype === 'contentControl' || node.stype === 'commentThread' ||
      (object(node.attributes) && (node.attributes.locked === true || node.attributes.protected === true));
    const contentText = textOf(node);
    if (Array.isArray(node.marks)) for (const mark of node.marks) {
      if (!object(mark) || mark.stype !== 'commentRef' || !object(mark.attrs) || mark.attrs.id !== target.id) continue;
      if (!Array.isArray(mark.range) || mark.range.length !== 2 || !mark.range.every(Number.isSafeInteger) ||
        mark.range[0] < 0 || mark.range[1] > contentText.length || mark.range[0] >= mark.range[1]) throw new ProjectError(409, 'target_conflict');
      anchors.push({ node, parent, index, attrs: mark.attrs, start: mark.range[0], end: mark.range[1],
        text: contentText.slice(mark.range[0], mark.range[1]), blocked });
    }
    if (Array.isArray(node.content)) node.content.forEach((child, childIndex) => visit(child, depth + 1, node, childIndex, blocked));
  };
  visit(value.document, 0);
  const coverage = threads[0].attributes.coverage;
  if (coverage === undefined) {
    // Existing single-run native comments have no indexed coverage metadata.
    if (anchors.length !== 1 || anchors[0].blocked || Object.hasOwn(anchors[0].attrs, 'part') || anchors[0].text !== target.quote)
      throw new ProjectError(409, 'target_conflict');
    return;
  }
  if (!Array.isArray(coverage) || coverage.length < 2 || anchors.length !== coverage.length ||
    coverage.some(part => !object(part) || Object.keys(part).length !== 1 || typeof part.text !== 'string' || !part.text))
    throw new ProjectError(409, 'target_conflict');
  const first = anchors[0];
  for (const [part, anchor] of anchors.entries()) {
    // Persisted native order and exact endpoint slices establish identity. Quote
    // equality alone never attaches a different run or paragraph to this thread.
    if (anchor.blocked || anchor.node.stype !== 'inline-text' || typeof anchor.node.text !== 'string' ||
      Object.hasOwn(anchor.node, 'sid') || Object.hasOwn(anchor.node, 'parentId') ||
      anchor.parent?.stype !== 'paragraph' || anchor.parent !== first.parent || anchor.index !== first.index + part ||
      Object.keys(anchor.attrs).length !== 2 || anchor.attrs.id !== target.id || anchor.attrs.part !== part ||
      anchor.text !== coverage[part].text || (part > 0 && anchor.start !== 0) ||
      (part < anchors.length - 1 && anchor.end !== anchor.node.text.length)) throw new ProjectError(409, 'target_conflict');
  }
  if (anchors.map(anchor => anchor.text).join('') !== target.quote) throw new ProjectError(409, 'target_conflict');
}
