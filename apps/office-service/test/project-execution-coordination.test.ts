import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { ProjectExecutionStore, type LocalExecutionInput } from '../src/project-execution.js';
import type { ProjectExecutionContext, ProjectRecord, ProjectStore } from '../src/project-store.js';
import type { VerifiedPrincipal } from '../src/membership-store.js';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', projectId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const workId = 'cccccccc-cccc-cccc-cccc-cccccccccccc', documentId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const args = [{ issuer: 'https://synthetic.example.test', subject: 'editor' }, tenantId, projectId, workId] as const;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
function fixture(options: { delayed?: boolean; unknown?: boolean } = {}) {
  const text = 'Original guide', thread = 'native-thread';
  const snapshotText = JSON.stringify({ format: 'barocss-word', version: 1, document: { stype: 'document', content: [
    { stype: 'paragraph', attributes: { styleId: 'Body' }, content: [{ stype: 'inline-text', text,
      marks: [{ stype: 'commentRef', attrs: { id: thread }, range: [0, text.length] }] }] },
    { stype: 'resources', content: [{ stype: 'commentThread', attributes: { id: thread }, content: [] }] }
  ] } });
  const pin = { id: 'pin', document: { product: 'word' as const, id: documentId }, revision: 1, text: snapshotText, title: 'Guide' };
  const record: ProjectRecord = { id: projectId, title: 'Project', goal: 'Improve guide', archived: false,
    results: [{ id: 'guide', name: 'Guide', document: pin.document, inputs: [] }],
    comments: [{ id: 'comment', resultId: 'guide', target: { kind: 'word-comment', id: thread, quote: text }, pin,
      actor: { kind: 'human', id: 'actor', label: 'Member' }, body: 'Please improve', createdAt: '2026-10-03', status: 'open', workId }],
    works: [{ id: workId, commentId: 'comment', request: 'Improve only the guide', state: 'unconnected', inputs: [pin],
      outputs: ['guide'], reason: 'Ready', createdAt: '2026-10-03' }], activities: [], drafts: {} };
  let stored: Record<string, unknown> | undefined, calls = 0;
  const entered = deferred(), release = deferred();
  const source = { id: documentId, product: 'word' as const, title: 'Guide', mode: 'snapshot', revision: 1,
    snapshot_text: snapshotText, snapshot_hash: hash(snapshotText) };
  const context: ProjectExecutionContext = {
    client: { query: async (sql: string, values: unknown[]) => {
      if (sql.startsWith('SELECT data FROM wonffice.project_executions')) return { rows: stored ? [{ data: structuredClone(stored) }] : [] };
      if (sql.startsWith('SELECT document_id,snapshot_revision')) return { rows: [{ document_id: documentId, snapshot_revision: pin.revision,
        snapshot_hash: hash(pin.text), snapshot_text: pin.text }] };
      if (sql.startsWith('INSERT INTO wonffice.project_executions')) stored = JSON.parse(String(values[8])) as Record<string, unknown>;
      else if (sql.startsWith('UPDATE wonffice.project_executions')) stored = JSON.parse(String(values[3])) as Record<string, unknown>;
      else if (sql.startsWith('SELECT wonffice.complete_project_execution')) Object.assign(stored!, JSON.parse(String(values[4])));
      else throw new Error(`Unexpected SQL: ${sql}`);
      return { rows: [], rowCount: 1 };
    } } as unknown as PoolClient,
    project: { id: projectId, workspace_id: 'workspace', revision: 4, data: record },
    actor: { kind: 'human', id: 'actor', label: 'Member' }, authorityEpoch: 'editor:0', document: async () => source
  };
  const projects: Pick<ProjectStore, 'withExecutionContext'> = {
    withExecutionContext: async <T>(_p: VerifiedPrincipal, _t: string, _id: string, _w: boolean,
      operation: (context: ProjectExecutionContext) => Promise<T>) => operation(context)
  };
  const store = new ProjectExecutionStore({} as Pool, { generate: async (input: LocalExecutionInput) => {
    calls++; entered.resolve(); if (options.delayed) await release.promise;
    if (options.unknown) throw new Error('Provider response lost');
    const proposal = { replacement: 'Improved guide', reason: 'Explicit request', assumptions: [] };
    return { proposal, provenance: { kind: 'live-local-model', adapterVersion: '2', model: 'synthetic-test', modelDigest: 'a'.repeat(64),
      runtimeVersion: 'test', inputHash: hash(JSON.stringify(input)), responseHash: 'b'.repeat(64), proposalHash: hash(JSON.stringify(proposal)),
      startedAt: '2026-10-03T00:00:00Z', completedAt: '2026-10-03T00:00:01Z', contextTokens: 32768, outputTokenLimit: 4096,
      promptBytes: 1000, promptEvalCount: 500, evalCount: 20 } };
  } }, projects);
  const pause = (paused: boolean) => { context.project.revision++; record.works[0].state = paused ? 'paused' : 'unconnected';
    record.works[0].reason = paused ? 'Paused by human' : 'Resumed'; };
  return { store, record, context, source, snapshotText, pause, entered, release, calls: () => calls, stored: () => stored!,
    execute: () => store.execute(...args, { expectedRevision: context.project.revision }) };
}

describe('captured semantic project context across pause and resume', () => {
  it('explicitly accepts and acknowledges the same attempt after pause/resume while preserving exact input and one dispatch', async () => {
    const f = fixture(), original = (await f.execute()).execution;
    f.pause(true);
    await expect(f.store.authorizeAcceptance(...args, original.id, {})).rejects.toMatchObject({ reason: 'work_paused' });
    f.pause(false);
    f.record.activities.push({ id: 'new-activity', at: '2026-10-03', label: 'Resumed' }); f.record.drafts.local = 'New draft';
    const accepted = (await f.store.authorizeAcceptance(...args, original.id, {})).execution;
    expect(accepted.phase).toBe('accepted'); expect(accepted.id).toBe(original.id); expect(accepted.input).toEqual(original.input);
    f.source.revision = 2; f.source.snapshot_text = accepted.expectedSnapshotText!; f.source.snapshot_hash = accepted.expectedSnapshotHash!;
    f.pause(true); await expect(f.store.acknowledge(...args, original.id, { revision: 2, snapshotHash: f.source.snapshot_hash }))
      .rejects.toMatchObject({ reason: 'work_paused' });
    f.pause(false);
    expect((await f.store.acknowledge(...args, original.id, { revision: 2, snapshotHash: f.source.snapshot_hash })).execution.phase).toBe('applied');
    expect(f.calls()).toBe(1); expect(f.stored().projectRevision).toBe(4);
  });
  it('recovers a proposal completed while paused through explicit acceptance after matching resume', async () => {
    const f = fixture({ delayed: true }), pending = f.execute(); await f.entered.promise; f.pause(true); f.release.resolve();
    const blocked = (await pending).execution;
    expect(blocked.phase).toBe('blocked'); expect(blocked.reason).toBe('work_paused');
    f.pause(false);
    const accepted = (await f.store.authorizeAcceptance(...args, blocked.id, {})).execution;
    expect(accepted.id).toBe(blocked.id); expect(accepted.phase).toBe('accepted'); expect(accepted.input).toEqual(blocked.input); expect(f.calls()).toBe(1);
  });
  it.each(['title', 'goal', 'result', 'request', 'comment', 'pin', 'output'])('keeps changed %s frozen despite pause/resume', async field => {
    const f = fixture(), proposal = (await f.execute()).execution; f.pause(true); f.pause(false);
    if (field === 'title') f.record.title = 'Different project';
    if (field === 'goal') f.record.goal = 'Different goal';
    if (field === 'result') f.record.results[0].name = 'Different result';
    if (field === 'request') f.record.works[0].request = 'Different request';
    if (field === 'comment') f.record.comments[0].body = 'Different comment';
    if (field === 'pin') f.record.works[0].inputs[0].revision++;
    if (field === 'output') f.record.works[0].outputs.push('new-output');
    await expect(f.store.authorizeAcceptance(...args, proposal.id, {})).rejects.toMatchObject({ reason: 'project_conflict' });
    expect(f.source.snapshot_text).toBe(f.snapshotText); expect(f.calls()).toBe(1);
  });
  it('only resumes a blocked coordination proposal after its captured fingerprint matches', async () => {
    const f = fixture(), proposal = (await f.execute()).execution;
    f.stored().phase = 'blocked'; f.stored().reason = 'project_conflict'; f.pause(true); f.pause(false);
    expect((await f.store.authorizeAcceptance(...args, proposal.id, {})).execution.phase).toBe('accepted');
    expect(f.calls()).toBe(1);
  });
  it('does not exclude another work state or invent a semantic basis for legacy attempts', async () => {
    const f = fixture(); f.record.works.push({ ...structuredClone(f.record.works[0]), id: 'other-work' });
    const proposal = (await f.execute()).execution; f.pause(true); f.pause(false); f.record.works[1].state = 'paused';
    await expect(f.store.authorizeAcceptance(...args, proposal.id, {})).rejects.toMatchObject({ reason: 'project_conflict' });
    const legacy = fixture(), old = (await legacy.execute()).execution; delete legacy.stored().projectContextHash;
    legacy.pause(true); legacy.pause(false);
    await expect(legacy.store.authorizeAcceptance(...args, old.id, {})).rejects.toMatchObject({ reason: 'project_conflict' });
  });
  it('retains authority epoch and exact source checks; unknown is never accepted or dispatched twice', async () => {
    const f = fixture(), proposal = (await f.execute()).execution; f.pause(true); f.pause(false);
    f.context.authorityEpoch = 'editor:2';
    await expect(f.store.authorizeAcceptance(...args, proposal.id, {})).rejects.toMatchObject({ reason: 'authority_changed' });
    f.context.authorityEpoch = 'editor:0'; f.source.revision++;
    await expect(f.store.authorizeAcceptance(...args, proposal.id, {})).rejects.toMatchObject({ reason: 'source_conflict' });
    const unknown = fixture({ unknown: true }), value = await unknown.execute(); unknown.pause(true); unknown.pause(false);
    await expect(unknown.store.authorizeAcceptance(...args, value.execution.id, {})).rejects.toMatchObject({ reason: 'execution_not_applicable' });
    expect((await unknown.execute()).execution).toEqual(value.execution); expect(unknown.calls()).toBe(1);
  });
});
