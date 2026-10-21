// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { WordRuntime } from './runtime';
import { ServerWordError } from './server-documents';
import type { WordWorkHost, WordWorkReceipt, WordWorkView } from './work-result-verification-client';
import { WorkResultVerificationPanel } from './work-result-verification-panel';

vi.mock('./server-file', () => ({ stableWordSnapshotText: (text: string) => text, serverWordFileText: () => 'current' }));
vi.mock('./business-pair-pin', () => ({ PinnedContent: ({ text }: { text: string }) => <p>{text}</p>,
  PinnedItemExcerpt: () => <p>보관 문단</p> }));
vi.mock('./work-result-verification-client', () => ({
  matchingWorkConfirmations: (_option: unknown, confirmations: unknown[]) => confirmations,
  wordWorkKey: () => 'selected-run',
  currentWordWorkRun: (_option: unknown, _confirmation: unknown, run: { runId?: string }) => !!run.runId,
  matchingWordWorkRun: (_option: unknown, _confirmation: unknown, run: { runId?: string }) => !!run.runId
}));

const id = (letter: string) => `${letter.repeat(8)}-${letter.repeat(4)}-${letter.repeat(4)}-${letter.repeat(4)}-${letter.repeat(12)}`;
let container: HTMLDivElement | undefined;
afterEach(() => { container?.remove(); container = undefined; });
const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

it('keeps not-run, selected confirmation, running and server failure states separate without editing Word', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const edits = vi.fn(), selection = { type: 'range', startOffset: 0, endOffset: 0 };
  const runtime = { editor: { getRootId: () => 'root', selection }, exportNativeDocument: () => ({}),
    captureInputIntent: () => () => true, flushCommands: edits } as unknown as WordRuntime;
  const option: WordWorkView['options'][number] = { projectId: id('a'), projectTitle: 'Project', workId: id('b'),
    resultId: id('c'), resultName: 'Result', requesterIdentityId: id('d'),
    attemptActorIdentityId: id('a'), attemptId: id('e'), phase: 'applied',
    reason: null, proposal: 'Proposed', pinId: id('f'), referenceText: 'reference',
    inputRevision: 2, inputHash: 'a'.repeat(64), inputText: 'original', outputRevision: 3, outputHash: 'b'.repeat(64) };
  const confirmation = { schemaVersion: 1, confirmationId: id('1'), tenantId: id('2'), documentId: id('3'),
    actorIdentityId: id('d'), confirmedAt: '2026-10-09T00:00:00.000Z', documentRevision: 2, snapshotHash: 'a'.repeat(64),
    context: { decision: { version: 1, snapshotText: 'reference', locator: { bookmarkId: 'protected' } } },
    authorityEpoch: 'editor:1:44', idempotencyKey: 'confirm', requestHash: 'c'.repeat(64),
    verification: 'not-run', scope: 'writer-self-confirmation' } as unknown as WordWorkView['confirmations'][number];
  const view: WordWorkView = { options: [option], confirmations: [confirmation], runs: [],
    currentRevision: 3, currentHash: 'b'.repeat(64), currentText: 'current', pendingKeys: [],
    currentActorIdentityId: id('d'), currentAuthorityEpoch: 'editor:1:44', currentCriterionContext: 'available' };
  let resolveRun!: (value: WordWorkView['runs'][number]) => void;
  const host: WordWorkHost = { load: vi.fn(async () => view), run: vi.fn(() => new Promise<WordWorkReceipt>(resolve => { resolveRun = resolve; })) };
  container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(<WorkResultVerificationPanel runtime={runtime} host={host} readOnly={false} />); });
  await settle();
  expect(container.textContent).toContain('작업 결과를 선택하지 않음');
  const optionSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Word 작업 결과 선택"]')!;
  await act(async () => { optionSelect.value = [option.projectId, option.workId, option.resultId, option.attemptId].join(':');
    optionSelect.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(container.textContent).toContain('작성자 확인 기록 미선택');
  const confirmSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Word 기준 확인 기록 선택"]')!;
  await act(async () => { confirmSelect.value = confirmation.confirmationId;
    confirmSelect.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(container.textContent).toContain('실행하지 않음');
  const button = [...container.querySelectorAll('button')].find(one => one.textContent?.includes('선택한 작업 결과 검사'))!;
  await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
  expect(container.textContent).toContain('검사 중');
  expect(host.run).toHaveBeenCalledTimes(1);
  expect(edits).not.toHaveBeenCalled();
  await act(async () => { resolveRun({ runId: id('9'), confirmationId: confirmation.confirmationId, outcome: 'failed',
    specimen: { kind: 'native-word-work-result', projectId: option.projectId, workId: option.workId,
      attemptId: option.attemptId!, resultId: option.resultId, inputRevision: 2, inputHash: option.inputHash!,
      outputRevision: 3, outputHash: option.outputHash! },
    startedAt: '2026-10-09T00:00:01.000Z', endedAt: '2026-10-09T00:00:02.000Z',
    outputHash: 'f'.repeat(64), outputText: '{"outcome":"failed"}' } as WordWorkView['runs'][number]); });
  expect(container.textContent).toContain('검사 결과 · 실패');
  view.currentAuthorityEpoch = 'editor:2:45';
  const reload = [...container.querySelectorAll('button')].find(one => one.textContent?.includes('기록 읽기'))!;
  await act(async () => { reload.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
  expect(container.textContent).toContain('확인 기록의 권한이 현재 계정 권한과 다릅니다');
  expect([...container.querySelectorAll('button')].find(one => one.textContent?.includes('작업 결과 검사'))?.disabled).toBe(true);
  await act(async () => { root.unmount(); });
});

it('explains a changed protected criterion separately from denied account access', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const runtime = { editor: { getRootId: () => 'root', selection: null }, exportNativeDocument: () => ({}),
    captureInputIntent: () => () => true } as unknown as WordRuntime;
  const view: WordWorkView = { options: [], confirmations: [], runs: [{ runId: id('9'),
    confirmationId: id('1'), outcome: 'failed', startedAt: '2026-10-09T00:00:01.000Z',
    endedAt: '2026-10-09T00:00:02.000Z', specimen: { workId: id('2'), attemptId: id('3'),
      inputRevision: 2, outputRevision: 3 } } as WordWorkReceipt], currentRevision: 3,
    currentHash: 'b'.repeat(64), currentText: 'current', pendingKeys: [],
    currentActorIdentityId: null, currentAuthorityEpoch: null,
    currentCriterionContext: 'unavailable' };
  const host: WordWorkHost = { load: vi.fn(async () => view), run: vi.fn() };
  container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(<WorkResultVerificationPanel runtime={runtime} host={host} readOnly={false} />); });
  await settle();
  expect(container.textContent).toContain('현재 저장본의 보호 기준이 변경되어');
  expect(container.textContent).toContain('이전 작업 검사 기록 · 1건');
  expect(container.textContent).toContain('실패 · 현재 결과에 자동 적용하지 않음');
  vi.mocked(host.load).mockRejectedValueOnce(new ServerWordError(403, 'forbidden'));
  const reload = [...container.querySelectorAll('button')].find(one => one.textContent?.includes('기록 읽기'))!;
  await act(async () => { reload.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
  expect(container.textContent).toContain('계정 접근이 거부되었습니다');
  expect(container.textContent).not.toContain('현재 Word 서버 저장본');
  await act(async () => { root.unmount(); });
});
