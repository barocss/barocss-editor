// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { webcrypto, createHash } from 'node:crypto';
import { createProjectRecord, createProjectComment, requestProjectWork, type Pin } from '@barocss/shared';
const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('./auth-client', () => ({ captureAuthorizedFetch: () => transport.fetch, listSnapshotDocuments: vi.fn() }));
import { serverProjectRepository } from './project-client';
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); transport.fetch.mockReset(); });
function fixture() {
  const current = createProjectRecord('공개', '검토');
  const pin: Pin = { id: 'source', document: { product: 'word', id: 'guide' }, revision: 1, text: 'native source', title: '안내' };
  current.results.push({ id: 'result', name: '안내', document: pin.document, inputs: [] });
  let revision = 1, actorId = 'verified', lose: string | null = null, beforeCommit = false, cas = false;
  const receipts = new Map<string, unknown>(), posted: Array<{ expectedRevision: number; idempotencyKey: string; action: Record<string, unknown> }> = [];
  const view = () => ({ tenantId: 'tenant', workspaceId: 'workspace', actor: { kind: 'human', id: actorId, label: 'Member' }, project: { record: structuredClone(current), revision } });
  transport.fetch.mockImplementation(async (input: string, init?: RequestInit) => {
    if (new URL(input).pathname.endsWith('/documents/guide')) return new Response(JSON.stringify({ document: { workspaceId: 'workspace', product: 'word', revision: 1 }, snapshotText: pin.text }));
    if (init?.method !== 'PATCH') return new Response(JSON.stringify(view()));
    const body = JSON.parse(init.body as string); posted.push(body);
    if (receipts.has(body.idempotencyKey)) return new Response(JSON.stringify(receipts.get(body.idempotencyKey)));
    const loseThis = lose === body.action.type || (lose === 'prepare' && body.action.type === 'draft' && String(body.action.text).includes('idempotencyKey'));
    if (cas && body.action.type === 'comment') { cas = false; current.goal = '새 목표'; revision++; return new Response(JSON.stringify({ status: 'revision_conflict' }), { status: 409 }); }
    if (loseThis && beforeCommit) { lose = null; throw new Error('lost before commit'); }
    if (body.expectedRevision !== revision) return new Response(JSON.stringify({ status: 'revision_conflict' }), { status: 409 });
    const action = body.action;
    if (action.type === 'draft') { const key = `${actorId}:${action.key}`; if (action.text) current.drafts[key] = action.text; else delete current.drafts[key]; }
    else if (action.type === 'comment') Object.assign(current, createProjectComment(current, { resultId: action.resultId, target: action.target, body: action.body, pin: { ...pin, id: 'canonical-pin' }, actor: { kind: 'human', id: actorId, label: 'Member' } }));
    else if (action.type === 'request') Object.assign(current, requestProjectWork(current, action.commentId, action.request));
    else throw new Error('unexpected action');
    revision++; const reply = view(); receipts.set(body.idempotencyKey, reply);
    if (loseThis) { lose = null; throw new Error('lost after commit'); }
    return new Response(JSON.stringify(reply));
  });
  return { current, pin, posted, repo: () => serverProjectRepository('tenant', 'workspace', 'editor'), lose: (type: string, before = false) => { lose = type; beforeCommit = before; }, actor: (id: string) => { actorId = id; }, cas: () => { cas = true; } };
}
const intent = { documentId: 'guide', resultId: 'result', target: { kind: 'word-comment' as const, id: 'native-thread', quote: 'selected' }, body: '수정해 주세요' };
it('recovers durable comment and work receipts with exact envelopes after fresh repository instances', async () => {
  const f = fixture(), first = f.repo();
  expect(first.feedbackRecovery).toBeDefined();
  await first.feedbackRecovery!.begin(f.current.id, intent);
  await first.feedbackRecovery!.nativeSnapshot(f.current.id, 'guide', createHash('sha256').update(f.pin.text).digest('hex'));
  f.lose('comment'); await expect(first.feedbackRecovery!.comment(f.current.id, 'guide', f.pin)).rejects.toThrow('lost after commit');
  const next = f.repo(); expect(await next.feedbackRecovery!.read(f.current.id, 'guide')).toMatchObject({ body: intent.body, target: intent.target });
  const saved = await next.feedbackRecovery!.comment(f.current.id, 'guide', f.pin);
  const commentId = saved.commentId!; expect(commentId).toBe(f.current.comments[0]!.id); expect(f.current.comments).toHaveLength(1);
  f.lose('request'); await expect(next.feedbackRecovery!.request(f.current.id, 'guide', commentId, intent.body)).rejects.toThrow('lost after commit');
  const final = f.repo(); const requested = await final.feedbackRecovery!.request(f.current.id, 'guide', commentId, intent.body);
  expect(requested.record.works).toHaveLength(1); expect(requested.record.comments[0]!.workId).toBe(requested.record.works[0]!.id);
  for (const type of ['comment', 'request']) { const operations = f.posted.filter(one => one.action.type === type); expect(operations).toHaveLength(2); expect(operations[1]).toEqual(operations[0]); }
  f.current.drafts['verified:composer'] = 'keep draft'; await final.feedbackRecovery!.clear(f.current.id, 'guide');
  expect(await final.feedbackRecovery!.read(f.current.id, 'guide')).toBeNull(); expect(f.current.drafts['verified:composer']).toBe('keep draft');
});
it('retries an uncommitted request envelope after reload without assigning a fresh key', async () => {
  const f = fixture(), first = f.repo(); await first.feedbackRecovery!.begin(f.current.id, intent);
  await first.feedbackRecovery!.nativeSnapshot(f.current.id, 'guide', createHash('sha256').update(f.pin.text).digest('hex'));
  f.lose('comment', true); await expect(first.feedbackRecovery!.comment(f.current.id, 'guide', f.pin)).rejects.toThrow('before commit');
  const recovered = await f.repo().feedbackRecovery!.comment(f.current.id, 'guide', f.pin);
  expect(recovered.commentId).toBe(f.current.comments[0]!.id);
  const posts = f.posted.filter(one => one.action.type === 'comment'); expect(posts[1]).toEqual(posts[0]);
});
it('keeps recovery private and refuses corrupt metadata and unrelated requests', async () => {
  const f = fixture(), first = f.repo(); await first.feedbackRecovery!.begin(f.current.id, intent);
  await first.feedbackRecovery!.nativeSnapshot(f.current.id, 'guide', createHash('sha256').update(f.pin.text).digest('hex'));
  f.actor('other'); expect(await f.repo().feedbackRecovery!.read(f.current.id, 'guide')).toBeNull();
  f.actor('verified');
  await expect(first.feedbackRecovery!.request(f.current.id, 'guide', 'foreign-comment', 'other text')).rejects.toThrow();
  expect(f.posted.filter(one => one.action.type === 'request')).toHaveLength(0);
  f.current.drafts['verified:word-feedback:guide:meta'] = '{"schemaVersion":999}';
  await expect(f.repo().feedbackRecovery!.read(f.current.id, 'guide')).rejects.toThrow();
});

it('verifies a lost preparation ACK before any effect and refuses an uncommitted preparation', async () => {
  for (const beforeCommit of [false, true]) {
    const f = fixture(), repo = f.repo(); await repo.feedbackRecovery!.begin(f.current.id, intent);
    await repo.feedbackRecovery!.nativeSnapshot(f.current.id, 'guide', createHash('sha256').update(f.pin.text).digest('hex'));
    f.lose('prepare', beforeCommit);
    if (beforeCommit) await expect(repo.feedbackRecovery!.comment(f.current.id, 'guide', f.pin)).rejects.toThrow('before commit');
    else await repo.feedbackRecovery!.comment(f.current.id, 'guide', f.pin);
    expect(f.posted.filter(one => one.action.type === 'comment')).toHaveLength(beforeCommit ? 0 : 1);
  }
});
it('keeps intent after confirmed CAS but prepares a fresh scope only on the next explicit retry', async () => {
  const f = fixture(), repo = f.repo(); await repo.feedbackRecovery!.begin(f.current.id, intent);
  await repo.feedbackRecovery!.nativeSnapshot(f.current.id, 'guide', createHash('sha256').update(f.pin.text).digest('hex'));
  f.cas(); await expect(repo.feedbackRecovery!.comment(f.current.id, 'guide', f.pin)).rejects.toMatchObject({ code: 'project_revision_conflict' });
  expect(f.current.comments).toHaveLength(0); expect((await f.repo().feedbackRecovery!.read(f.current.id, 'guide'))!.phase).toBe('native');
  await f.repo().feedbackRecovery!.comment(f.current.id, 'guide', f.pin);
  const posts = f.posted.filter(one => one.action.type === 'comment'); expect(posts).toHaveLength(2);
  expect(posts[1]!.idempotencyKey).not.toBe(posts[0]!.idempotencyKey); expect(posts[1]!.expectedRevision).toBeGreaterThan(posts[0]!.expectedRevision);
  expect(f.current.goal).toBe('새 목표'); expect(f.current.comments).toHaveLength(1);
});
it('refuses source retargeting and premature clearing while preserving the original recovery', async () => {
  const f = fixture(), repo = f.repo(); await repo.feedbackRecovery!.begin(f.current.id, intent);
  const hash = createHash('sha256').update(f.pin.text).digest('hex'); await repo.feedbackRecovery!.nativeSnapshot(f.current.id, 'guide', hash);
  await expect(repo.feedbackRecovery!.nativeSnapshot(f.current.id, 'guide', 'a'.repeat(64))).rejects.toThrow();
  await expect(repo.feedbackRecovery!.clear(f.current.id, 'guide')).rejects.toThrow();
  f.pin.text = 'another edit'; await expect(f.repo().feedbackRecovery!.comment(f.current.id, 'guide', f.pin)).rejects.toThrow();
  expect(f.current.comments).toHaveLength(0); expect(f.posted.filter(one => one.action.type === 'comment')).toHaveLength(0);
  expect(await f.repo().feedbackRecovery!.read(f.current.id, 'guide')).toMatchObject({ body: intent.body, target: intent.target, nativeHash: hash });
});
it('connects an existing stored opinion after begin without inserting a second comment', async () => {
  const f = fixture(), repo = f.repo(); await repo.feedbackRecovery!.begin(f.current.id, intent);
  const hash = createHash('sha256').update(f.pin.text).digest('hex'); await repo.feedbackRecovery!.nativeSnapshot(f.current.id, 'guide', hash);
  const saved = await repo.feedbackRecovery!.comment(f.current.id, 'guide', f.pin); await repo.feedbackRecovery!.clear(f.current.id, 'guide');
  await repo.feedbackRecovery!.begin(f.current.id, { ...intent, requestWork: true });
  await repo.feedbackRecovery!.nativeSnapshot(f.current.id, 'guide', hash);
  await repo.feedbackRecovery!.request(f.current.id, 'guide', saved.commentId!, intent.body);
  expect(f.posted.filter(one => one.action.type === 'comment')).toHaveLength(1);
  expect(f.current.comments).toHaveLength(1); expect(f.current.works).toHaveLength(1);
});
it('stores full bounded body and quote separately from small receipt metadata', async () => {
  const f = fixture(), repo = f.repo(), long = { ...intent, body: '가'.repeat(8000), target: { ...intent.target, quote: '나'.repeat(8000) } };
  await repo.feedbackRecovery!.begin(f.current.id, long);
  expect(await f.repo().feedbackRecovery!.read(f.current.id, 'guide')).toMatchObject(long);
  const meta = f.current.drafts['verified:word-feedback:guide:meta']!;
  expect(meta.length).toBeLessThan(1000); expect(meta).not.toContain(long.body); expect(meta).not.toContain(long.target.quote);
});
