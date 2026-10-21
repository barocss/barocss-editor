import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CriterionVerificationPanel } from '../../../apps/word/src/criterion-verification-panel';
import type { WordRuntime } from '../../../apps/word/src/runtime';
import type { CriterionVerificationHost, VerificationReceipt, VerificationView } from '../../../apps/word/src/criterion-verification-client';
import { serverWordFileText } from '../../../apps/word/src/server-file';
import { captureCriterionContext, captureExecutableCriterion, CRITERION_EVALUATOR, getCriterionSpecimen, listCriterionSpecimens } from '../src/criterion-confirmation';

// Component-state fixture only: it does not certify authentication or rendered evidence.
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
function fixture() {
  const native = JSON.parse(readFileSync(resolve(process.cwd(), '../../apps/office-service/test/fixtures/criterion-verification-word.json'), 'utf8')).document;
  const snapshotText = serverWordFileText(native, ''), context = captureCriterionContext(snapshotText);
  const actorIdentityId = '33333333-3333-4333-8333-333333333333', confirmationId = '44444444-4444-4444-8444-444444444444';
  const view: VerificationView = { basis: { schemaVersion: 1, documentRevision: 1, snapshotText, snapshotHash: 'a'.repeat(64), context,
    authorityEpoch: 'membership-test', actorIdentityId, confirmationId, executable: captureExecutableCriterion(context), specimens: [...listCriterionSpecimens()], evaluator: CRITERION_EVALUATOR }, runs: [] };
  const runtime = { editor: { getRootId: () => 'root' }, exportNativeDocument: () => native } as unknown as WordRuntime;
  let release!: (value: VerificationView) => void;
  const host: CriterionVerificationHost = { load: vi.fn(() => new Promise<VerificationView>(resolve => { release = resolve; })), run: vi.fn() };
  return { native, runtime, view, host, resolve: (value: VerificationView) => release(value) };
}
const status = () => container.querySelector('[role="status"]')!.textContent;
async function render(runtime: WordRuntime, host: CriterionVerificationHost) {
  await act(async () => root.render(createElement(CriterionVerificationPanel, { runtime, host, readOnly: false })));
}
async function load() {
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '실행 문맥과 기록 읽기')!.click());
}
it('unread and delayed GET-only retrieval never claim not-run or running; loaded empty history can show not-run', async () => {
  const f = fixture(); await render(f.runtime, f.host);
  expect(status()).toBe('검증 · 실행 기록 미확인');
  await load(); expect(status()).toBe('실행 문맥과 기록을 읽는 중입니다.'); expect(f.host.run).not.toHaveBeenCalled();
  await act(async () => f.resolve(f.view));
  expect(status()).toBe('검증 · 실행하지 않음'); expect(f.host.run).not.toHaveBeenCalled();
});
it('reopen reads retained current evidence before showing a result; changed native source retains historical output without a current pass', async () => {
  const f = fixture(), basis = f.view.basis;
  const receipt: VerificationReceipt = { schemaVersion: 1, runId: '55555555-5555-4555-8555-555555555555', tenantId: '11111111-1111-4111-8111-111111111111', documentId: '22222222-2222-4222-8222-222222222222', requesterIdentityId: basis.actorIdentityId,
    confirmationId: basis.confirmationId!, documentRevision: basis.documentRevision, snapshotHash: basis.snapshotHash, context: basis.context, authorityEpoch: basis.authorityEpoch,
    idempotencyKey: 'ui-fixture', requestHash: 'b'.repeat(64), specimen: getCriterionSpecimen('dark')!, evaluator: CRITERION_EVALUATOR, outcome: 'passed', startedAt: '2026-10-03T00:00:00Z', endedAt: '2026-10-03T00:00:01Z', outputText: 'declared component-state fixture', outputHash: 'c'.repeat(64) };
  f.view.runs.push(receipt);
  await render(f.runtime, f.host); expect(status()).toBe('검증 · 실행 기록 미확인');
  await load(); await act(async () => f.resolve(f.view)); expect(status()).toBe('실행 결과 · 통과');
  f.native.metadata = { ...f.native.metadata, currentSourceChanged: true };
  await render(f.runtime, f.host);
  expect(status()).toBe('검증 · 현재 원문의 실행 기록 미확인');
  expect(container.textContent).toContain('이전 문맥'); expect(container.textContent).toContain(receipt.outputText);
  expect(f.host.run).not.toHaveBeenCalled();
});
