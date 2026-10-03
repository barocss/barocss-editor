// @vitest-environment jsdom
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerProductDocumentHost, registerProductFeedbackHost, type ProductFeedbackHost, type ProjectExecution } from '@barocss/shared';
import { ConnectedWorkControl } from '../src/connected-work-control';
import type { ProjectRepository } from '../src/project-ui';

let root: Root, container: HTMLDivElement, disposers: (() => void)[];
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container); disposers = []; });
afterEach(async () => { await act(async () => root.unmount()); disposers.reverse().forEach(dispose => dispose()); container.remove(); vi.unstubAllGlobals(); });
function setup() {
  let text = 'original native bytes', phase: ProjectExecution['phase'] = 'proposal';
  let acceptLost = false, saveLost = false;
  const execution = (): ProjectExecution => ({ id: 'attempt', projectId: 'project', workId: 'work', resultId: 'result', documentId: 'word',
    tenantId: 'tenant', workspaceId: 'workspace', actorId: 'actor', phase, reason: null, pendingOutputs: [],
    input: { request: '실행 중인 앱 조치를 안내해줘.', revision: 1, snapshotHash: 'before', snapshotText: 'original native bytes',
      target: { nodeId: 'comment', text: 'original', from: 0, to: 8 }, inputs: [] },
    proposal: { replacement: 'declared replacement', reason: 'declared reason', assumptions: [] }, expectedSnapshotText: 'declared after bytes', expectedSnapshotHash: 'after' });
  const apply = vi.fn(async () => { text = 'declared after bytes'; return true; });
  const host: ProductFeedbackHost = { product: 'word', id: () => 'word', editable: () => true, capture: () => null,
    comment: async () => { throw new Error('unused'); }, locate: () => 'located',
    previewRevision: () => text === 'original native bytes' ? { current: () => true, apply, dispose: () => {} } : null };
  disposers.push(registerProductFeedbackHost(host));
  disposers.push(registerProductDocumentHost({ product: 'word', id: () => 'word', beforeNavigate: async () => {
    if (saveLost && text === 'declared after bytes') { saveLost = false; return false; } return true;
  } }));
  const acknowledge = vi.fn(async () => { phase = 'applied'; return execution(); });
  const execute = vi.fn(async () => execution());
  const accept = vi.fn(async () => { phase = 'accepted'; if (acceptLost) { acceptLost = false; throw new Error('Acceptance acknowledgement lost'); } return execution(); });
  const repository = { writable: true, execution: async () => execution(), acceptExecution: accept,
    acknowledgeExecution: acknowledge, execute, pin: async () => ({ id: 'pin', document: { product: 'word', id: 'word' }, title: 'guide', text, revision: text === 'original native bytes' ? 1 : 2 }) } as unknown as ProjectRepository;
  return { repository, apply, accept, acknowledge, execute, host, loseAcceptance: () => { acceptLost = true; }, loseSave: () => { saveLost = true; } };
}
async function render(repository: ProjectRepository) { await act(async () => root.render(createElement(ConnectedWorkControl, { repository, project: 'project', work: 'work', revision: 1, document: { product: 'word', id: 'word' } }))); }
async function click(label: string) { const button = [...container.querySelectorAll('button')].find(one => one.textContent === label); expect(button).toBeDefined(); await act(async () => button!.click()); }
it('reopens the same accepted attempt after lost acceptance ACK, then applies and acknowledges once without inference', async () => {
  const f = setup(); await render(f.repository); f.loseAcceptance();
  await click('이 변경 승인 및 저장'); expect(f.apply).not.toHaveBeenCalled();
  await act(async () => root.unmount()); root = createRoot(container); await render(f.repository);
  await click('승인된 변경 이어서 확인');
  expect(f.accept).toHaveBeenCalledTimes(2); expect(f.apply).toHaveBeenCalledTimes(1); expect(f.acknowledge).toHaveBeenCalledTimes(1);
  expect(f.execute).not.toHaveBeenCalled(); expect(container.textContent).toContain('원본 반영 확인');
});
it('retains an applied draft across failed save and reconciles after reopen without a second native change', async () => {
  const f = setup(); await render(f.repository); f.loseSave(); await click('이 변경 승인 및 저장');
  expect(f.apply).toHaveBeenCalledTimes(1); expect(f.acknowledge).not.toHaveBeenCalled();
  await act(async () => root.unmount()); root = createRoot(container); await render(f.repository);
  await click('승인된 변경 이어서 확인'); expect(f.apply).toHaveBeenCalledTimes(1); expect(f.acknowledge).toHaveBeenCalledTimes(1); expect(f.execute).not.toHaveBeenCalled();
});
it('refuses the old approval after an awaited document/account host ABA without a native commit', async () => {
  const f = setup(); let finish!: (value: ProjectExecution) => void;
  const pending = new Promise<ProjectExecution>(resolve => { finish = resolve; });
  const initial = await f.repository.execution!('project', 'work');
  f.repository.acceptExecution = () => pending; await render(f.repository);
  const button = [...container.querySelectorAll('button')].find(one => one.textContent === '이 변경 승인 및 저장')!;
  await act(async () => { button.click(); await Promise.resolve(); });
  await act(async () => {
    const off = registerProductDocumentHost({ product: 'word', id: () => 'another-account-original', beforeNavigate: async () => true });
    off(); disposers.push(registerProductDocumentHost({ product: 'word', id: () => 'word', beforeNavigate: async () => true }));
    finish({ ...initial!, phase: 'accepted' });
  });
  expect(f.apply).not.toHaveBeenCalled(); expect(f.acknowledge).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
});
it('refuses a mismatched accepted attempt without applying the proposal', async () => {
  const f = setup(), initial = await f.repository.execution!('project', 'work');
  f.repository.acceptExecution = async () => ({ ...initial!, id: 'another-attempt', phase: 'accepted' });
  await render(f.repository); await click('이 변경 승인 및 저장');
  expect(f.apply).not.toHaveBeenCalled(); expect(f.acknowledge).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
});
it('refuses unfinished native input before server acceptance', async () => {
  const f = setup(); disposers.push(registerProductDocumentHost({ product: 'word', id: () => 'word', beforeNavigate: async () => false }));
  await render(f.repository); await click('이 변경 승인 및 저장');
  expect(f.accept).not.toHaveBeenCalled(); expect(f.apply).not.toHaveBeenCalled(); expect(f.acknowledge).not.toHaveBeenCalled();
});
it('shows a deliberate later training follow-up and its exact guide version without rewriting execution input or running a model', async () => {
  const f = setup(), initial = await f.repository.execution!('project', 'work');
  f.repository.execution = async () => ({ ...initial!, phase: 'applied', appliedRevision: 2,
    pendingOutputs: [{ resultId: 'training', reason: 'unsupported_target', inputs: [{ id: 'new-guide-pin', documentId: 'word', revision: 2, snapshotHash: 'declared-guide-hash', snapshotText: 'declared after bytes' }] }] });
  await act(async () => root.render(createElement(ConnectedWorkControl, { repository: f.repository, project: 'project', work: 'work', revision: 2,
    document: { product: 'word', id: 'word' }, results: [{ id: 'guide', name: '고객 설치 안내', document: { id: 'word' } }, { id: 'training', name: '팀 교육자료', document: { id: 'slides' } }] })));
  expect(container.textContent).toContain('팀 교육자료 · 대기: 이 결과물의 자동 편집은 아직 지원하지 않습니다.');
  expect(container.textContent).toContain('고객 설치 안내 · 버전 2'); expect(container.textContent).toContain('declared-guide-hash');
  expect(initial!.input.revision).toBe(1); expect(f.apply).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
});
