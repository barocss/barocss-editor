import { describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { ProjectExecutionStore } from '../src/project-execution.js';
import type { ProjectExecutionContext, ProjectRecord, ProjectStore } from '../src/project-store.js';
import { TenantAccessDeniedError, type VerifiedPrincipal } from '../src/membership-store.js';
import { createHash } from 'node:crypto';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', projectId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const workId = 'cccccccc-cccc-cccc-cccc-cccccccccccc', documentId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const snapshotText = 'exact saved native guide revision two';
const setup = () => {
  const pin = { id: 'new-pin', document: { product: 'word' as const, id: documentId }, revision: 2, text: snapshotText, title: 'Guide' };
  const input = { request: 'Original request', revision: 1, snapshotHash: hash('original'), snapshotText: 'original',
    target: { nodeId: 'thread', text: 'Original', from: 0, to: 8 }, inputs: [] };
  const attempt = { id: 'attempt', tenantId, projectId, workId, resultId: 'guide', documentId, actorId: 'actor', workspaceId: 'workspace',
    phase: 'applied', reason: null, input, pendingOutputs: [], appliedRevision: 2, projectRevision: 4,
    authorityEpoch: 'editor:0', target: { kind: 'word-comment', id: 'thread', quote: 'Original' },
    proposal: { replacement: 'Saved native guide', reason: 'Original request', assumptions: [] } };
  const record: ProjectRecord = { id: projectId, title: 'Project', goal: 'Guide then training', archived: false,
    results: [{ id: 'guide', name: 'Guide', document: pin.document, inputs: [] },
      { id: 'training', name: 'Training', document: { product: 'slides', id: 'training-doc' }, inputs: [pin], request: workId },
      { id: 'unrelated', name: 'Other work', document: { product: 'slides', id: 'other-doc' }, inputs: [pin], request: 'other-work' }],
    comments: [{ id: 'comment', resultId: 'guide', target: { kind: 'word-comment', id: 'thread', quote: 'Original' }, pin,
      actor: { kind: 'human', id: 'actor', label: 'Member' }, body: 'Request', createdAt: '2026-10-03', status: 'open', workId }],
    works: [{ id: workId, commentId: 'comment', request: 'Original request', state: 'unconnected', inputs: [pin],
      outputs: ['guide', 'training', 'unrelated'], reason: 'Unconnected', createdAt: '2026-10-03' }], activities: [], drafts: {} };
  let denied = false, sourceRevision = 2;
  const reads: string[] = [], sql: string[] = [];
  const context: ProjectExecutionContext = {
    client: { query: async (query: string) => {
      sql.push(query);
      if (query.includes('FROM wonffice.project_executions')) return { rows: [ { data: structuredClone(attempt) } ] };
      if (query.includes('FROM wonffice.project_pins')) return { rows: [{ document_id: documentId, snapshot_revision: 2,
        snapshot_hash: hash(snapshotText), snapshot_text: snapshotText }] };
      throw new Error(`Unexpected database mutation: ${query}`);
    } } as unknown as PoolClient,
    project: { id: projectId, workspace_id: 'workspace', revision: 7, data: record },
    actor: { kind: 'human', id: 'actor', label: 'Member' }, authorityEpoch: 'editor:0',
    document: async id => { reads.push(id); if (denied) throw new TenantAccessDeniedError();
      return { id, product: 'word', title: 'Guide', mode: 'snapshot', revision: sourceRevision,
        snapshot_hash: hash(sourceRevision === 2 ? snapshotText : 'new human version'),
        snapshot_text: sourceRevision === 2 ? snapshotText : 'new human version' }; }
  };
  const projects: Pick<ProjectStore, 'withExecutionContext'> = {
    withExecutionContext: async <T>(_principal: VerifiedPrincipal, _tenant: string, _project: string, _writable: boolean,
      operation: (context: ProjectExecutionContext) => Promise<T>) => operation(context)
  };
  const store = new ProjectExecutionStore({} as Pool, null, projects);
  return { store, attempt, reads, sql, record, pin, advance: () => { sourceRevision = 3; }, revoke: () => { denied = true; } };
};
const args = [{ issuer: 'https://synthetic.example.test', subject: 'actor' }, tenantId, projectId, workId] as const;
describe('current follow-up observation independent of captured model input', () => {
  it('shows training linked after guide application with its exact new pin, leaving immutable attempt untouched', async () => {
    const f = setup(), before = structuredClone(f.attempt);
    const result = (await f.store.get(...args)).execution!;
    expect(result.phase).toBe('applied'); expect(result.input).toEqual(before.input);
    expect(result.proposal).toEqual(before.proposal);
    expect(result.pendingOutputs).toEqual([{ resultId: 'training', reason: 'unsupported_target', inputs: [
      { id: f.pin.id, documentId, revision: 2, snapshotHash: hash(snapshotText), snapshotText }
    ] }]);
    expect(f.attempt).toEqual(before); expect(f.reads).toContain(documentId);
    expect(f.sql.every(query => query.startsWith('SELECT'))).toBe(true);
  });
  it('retains historical pin bytes after newer source edits but refuses current source-access denial', async () => {
    const f = setup(); const initial = await f.store.get(...args); f.advance();
    expect(await f.store.get(...args)).toEqual(initial);
    f.revoke(); await expect(f.store.get(...args)).rejects.toBeInstanceOf(TenantAccessDeniedError);
  });
});
