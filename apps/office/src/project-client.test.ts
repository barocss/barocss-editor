// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { createProjectRecord, type ProjectRecord, type Pin, type ProjectComment } from '@barocss/shared';
const transport = vi.hoisted(() => ({ fetch: vi.fn(), epoch: 0 }));
vi.mock('./auth-client', () => ({ captureAuthorizedFetch: () => { const epoch = transport.epoch; return (...args: unknown[]) => { if (epoch !== transport.epoch) throw new Error('account generation changed'); return transport.fetch(...args); }; }, listSnapshotDocuments: vi.fn() }));
import { serverProjectRepository } from './project-client';
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); transport.fetch.mockReset(); transport.epoch++; });
it('replays one frozen comment operation after a real-shaped lost acknowledgement and an intervening project change', async () => {
  const original = createProjectRecord('Windows 베타 공개', '설치와 교육');
  original.results.push({ id: 'result', name: '고객 설치 안내', document: { product: 'word', id: 'guide' }, inputs: [] });
  const current = structuredClone(original); let revision = 1, lost = true;
  const actor = { kind: 'human' as const, id: 'verified-user', label: 'Member' }, replies = new Map<string, unknown>();
  const posted: Array<{ expectedRevision: number; idempotencyKey: string; action: { type: string } }> = [];
  const text = JSON.stringify({ format: 'barocss-word', version: 1, document: { stype: 'document', content: [] } });
  const response = () => ({ project: { record: structuredClone(current), revision }, tenantId: 'tenant', workspaceId: 'workspace', actor });
  transport.fetch.mockImplementation(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/documents/guide')) return new Response(JSON.stringify({ document: { workspaceId: 'workspace', product: 'word', revision: 1, mode: 'snapshot', title: '고객 설치 안내', snapshotHash: createHash('sha256').update(text).digest('hex') }, snapshotText: text }));
    if (init?.method !== 'PATCH') return new Response(JSON.stringify(response()));
    const body = JSON.parse(init.body as string) as typeof posted[number] & { action: { type: string; body: string; target: ProjectComment['target']; source: { revision: number } } };
    posted.push(body);
    const previous = replies.get(body.idempotencyKey);
    if (previous) return new Response(JSON.stringify(previous));
    const pin: Pin = { id: randomUUID(), document: { product: 'word', id: 'guide' }, revision: body.action.source.revision, text, title: '고객 설치 안내' };
    current.comments.push({ id: 'canonical-comment', resultId: 'result', target: body.action.target, pin, actor, body: body.action.body, createdAt: new Date().toISOString(), status: 'open' });
    revision++; const reply = response(); replies.set(body.idempotencyKey, reply);
    if (lost) { lost = false; current.goal = '사람이 중간에 수정한 목표'; revision++; throw new Error('acknowledgement lost'); }
    return new Response(JSON.stringify(reply));
  });
  const repo = serverProjectRepository('tenant', 'workspace', 'editor');
  const before = await repo.read(original.id); expect(before).not.toBeNull();
  const pin = await repo.pin({ product: 'word', id: 'guide' });
  const pending: ProjectComment = { id: 'one-client-gesture', resultId: 'result', target: { kind: 'document', id: 'guide', quote: '' }, pin, actor: { kind: 'local', id: 'local', label: 'Local' }, body: '교육자료에도 반영해줘.', createdAt: new Date().toISOString(), status: 'open' };
  const next = { ...before!.record, comments: [pending] };
  await expect(repo.save(next, before!.revision)).rejects.toThrow('acknowledgement lost');
  const refreshed = await repo.read(original.id); expect(refreshed!.record.comments).toHaveLength(1);
  const retried: ProjectRecord = { ...refreshed!.record, comments: [...refreshed!.record.comments, pending] };
  const saved = await repo.save(retried, refreshed!.revision);
  expect(posted).toHaveLength(2); expect(posted[1]).toEqual(posted[0]);
  expect(saved.commentId).toBe('canonical-comment'); expect(current.comments).toHaveLength(1);
  expect(current.goal).toBe('사람이 중간에 수정한 목표'); expect(current.works).toHaveLength(0);
});

it('sends a deliberate follow-up association as one canonical pin operation on the existing work', async () => {
  const record = createProjectRecord('Windows 베타 공개', '교육자료까지 연결');
  record.results = [{ id: 'guide-result', name: '고객 설치 안내', document: { product: 'word', id: 'guide' }, inputs: [] },
    { id: 'training-result', name: '팀 교육자료', document: { product: 'slides', id: 'training' }, inputs: [] }];
  const text = JSON.stringify({ format: 'barocss-word', version: 1, document: { stype: 'document', content: [] } });
  const priorPin: Pin = { id: 'captured', document: { product: 'word', id: 'guide' }, revision: 1, text, title: '고객 설치 안내' };
  record.comments.push({ id: 'opinion', resultId: 'guide-result', target: { kind: 'document', id: 'guide', quote: '' }, pin: priorPin,
    actor: { kind: 'human', id: 'verified', label: 'Member' }, body: '교육자료에도 반영해줘.', createdAt: new Date().toISOString(), status: 'open', workId: 'same-work' });
  record.works.push({ id: 'same-work', commentId: 'opinion', request: '교육자료에도 반영해줘.', state: 'unconnected', inputs: [priorPin], outputs: ['guide-result'], reason: 'Not connected', createdAt: new Date().toISOString() });
  let posted: { action: Record<string, unknown> } | undefined;
  const view = (value: ProjectRecord, revision: number) => ({ project: { record: value, revision }, tenantId: 'tenant', workspaceId: 'workspace', actor: { kind: 'human', id: 'verified', label: 'Member' } });
  transport.fetch.mockImplementation(async (input: string, init?: RequestInit) => {
    if (new URL(input).pathname.endsWith('/documents/guide')) return new Response(JSON.stringify({ document: { workspaceId: 'workspace', product: 'word', revision: 1, mode: 'snapshot', title: '고객 설치 안내' }, snapshotText: text }));
    if (init?.method === 'PATCH') { posted = JSON.parse(init.body as string); return new Response(JSON.stringify(view(record, 2))); }
    return new Response(JSON.stringify(view(record, 1)));
  });
  const repository = serverProjectRepository('tenant', 'workspace', 'editor'); await repository.read(record.id);
  const pin = await repository.pin({ product: 'word', id: 'guide' }), next = structuredClone(record);
  next.results[1]!.inputs.push(pin); next.results[1]!.request = 'same-work'; next.works[0]!.inputs.push(pin); next.works[0]!.outputs.push('training-result');
  await repository.save(next, 1);
  expect(posted?.action).toEqual({ type: 'pin-input', resultId: 'training-result', requestId: 'same-work', source: { documentId: 'guide', revision: 1, snapshotHash: createHash('sha256').update(text).digest('hex') } });
  expect(posted?.action).not.toHaveProperty('text');
});

it('allows explicit same-gesture recovery after a confirmed CAS rejection without overwriting the intervening goal', async () => {
  const record = createProjectRecord('Windows 베타 공개', '처음 목표');
  record.results.push({ id: 'result', name: '안내', document: { product: 'word', id: 'guide' }, inputs: [] });
  const text = JSON.stringify({ document: { stype: 'document', content: [] } });
  const pin: Pin = { id: 'source', document: { product: 'word', id: 'guide' }, revision: 1, text, title: '안내' };
  const pending: ProjectComment = { id: 'same-gesture', resultId: 'result', target: { kind: 'document', id: 'guide', quote: '' }, pin, actor: { kind: 'local', id: 'local', label: 'Local' }, body: '보존할 의견', createdAt: new Date().toISOString(), status: 'open' };
  let revision = 1; const posted: Array<{ expectedRevision: number; idempotencyKey: string }> = [];
  const view = () => ({ tenantId: 'tenant', workspaceId: 'workspace', actor: { kind: 'human', id: 'verified', label: 'Member' }, project: { record: structuredClone(record), revision } });
  transport.fetch.mockImplementation(async (input: string, init?: RequestInit) => {
    if (new URL(input).pathname.endsWith('/documents/guide')) return new Response(JSON.stringify({ document: { workspaceId: 'workspace', product: 'word', revision: 1 }, snapshotText: text }));
    if (init?.method === 'PATCH') {
      const body = JSON.parse(init.body as string); posted.push(body);
      if (posted.length === 1) { record.goal = '중간 사용자 목표'; revision = 2; return new Response(JSON.stringify({ status: 'revision_conflict' }), { status: 409 }); }
      record.comments.push({ ...pending, id: 'canonical', actor: { kind: 'human', id: 'verified', label: 'Member' } }); revision++;
    }
    return new Response(JSON.stringify(view()));
  });
  const repo = serverProjectRepository('tenant', 'workspace', 'editor'), before = (await repo.read(record.id))!;
  await expect(repo.save({ ...before.record, comments: [pending] }, before.revision)).rejects.toThrow('다른 변경');
  const refreshed = (await repo.read(record.id))!;
  const saved = await repo.save({ ...refreshed.record, comments: [pending] }, refreshed.revision);
  expect(posted.map(one => one.expectedRevision)).toEqual([1, 2]); expect(posted[1]!.idempotencyKey).not.toBe(posted[0]!.idempotencyKey);
  expect(saved.record.goal).toBe('중간 사용자 목표'); expect(saved.record.comments).toHaveLength(1); expect(saved.record.works).toHaveLength(0);
});

it('retires an old repository before sending any request after account ABA', async () => {
  const old = serverProjectRepository('tenant', 'workspace', 'editor');
  transport.epoch++; transport.epoch++;
  await expect(old.read('project')).rejects.toThrow('account generation changed');
  await expect(old.create('제목', '목표')).rejects.toThrow('account generation changed');
  expect(transport.fetch).not.toHaveBeenCalled();
});
