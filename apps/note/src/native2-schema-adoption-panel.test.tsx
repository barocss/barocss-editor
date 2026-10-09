// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createNoteNative2Context, openNoteNativeSnapshot, openNoteTree } from '@barocss/office-note';
import type { createAuthenticatedNative2Mutation, Native2MutationAttempt, Native2Validation } from '../../office/src/native2-authenticated-mutation';
import type { createAuthenticatedNative2ReceiptRecovery } from '../../office/src/native2-authenticated-receipt-recovery';
import type { Native2StageSource, Native2ReadonlyStage, Native2StageReadFactory } from './experimental-native2-authenticated-stage';
import { NATIVE_NOTE_FIXTURES } from './native2-scenario-fixtures';
import { createNative2SchemaAdoptionOperation } from './native2-schema-adoption-operation';
import { createExperimentalNative2AdoptJournal } from './experimental-native2-adopt-pending';
import { Native2MutationError } from '../../office/src/native2-authenticated-mutation';
import { Native2SchemaAdoptionPanel } from './native2-schema-adoption-panel';
const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const documentId = '33333333-3333-4333-8333-333333333333';
const sourceText = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_A), candidateText = JSON.stringify(NATIVE_NOTE_FIXTURES.TARGET_A2, null, 2) + '\n';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
type Factory = ReturnType<typeof createAuthenticatedNative2Mutation>;
type Context = Awaited<ReturnType<Factory['open']>>;
afterEach(() => vi.restoreAllMocks());
class MemoryStorage implements Storage {
  items = new Map<string, string>(); fail = false;
  get length() { return this.items.size; } clear() { this.items.clear(); } key(i: number) { return [...this.items.keys()][i] ?? null; }
  getItem(key: string) { return this.items.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw Error('controlled quota'); this.items.set(key, value); }
  removeItem(key: string) { this.items.delete(key); }
}
function setup() {
  const authority = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Preserved mounted source S' }] }] });
  const staged = openNoteNativeSnapshot(createNoteNative2Context(sourceText));
  const intrinsic = createNoteNative2Context(sourceText);
  const read: Context['source'] = { document: { documentId, tenantId, workspaceId, product: 'note', title: 'Full A1', creatorUserId: null,
    metadataRevision: 1, mode: 'snapshot', pageId: 'native2-note-A', documentKey: `wonffice-${tenantId}-${documentId}`,
    fileFormat: 'barocss-note', fileVersion: 2, revision: 1, snapshotHash: hash(sourceText) }, snapshotText: sourceText,
    file: { fileVersion: 2, schemaBundle: intrinsic.schemaBundle, document: intrinsic.document, savedAt: intrinsic.savedAt } };
  let current = true; const callbacks = new Set<() => void>(), authorityCallbacks = new Set<() => void>();
  const prior = hash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', tenantId, workspaceId, documentId, 'pinned', read.file.schemaBundle.selected.map(r => [r.schemaId, r.version, r.digest])]));
  const prepare = vi.fn(async (input: { snapshotText: string; schemaAction: 'adopt' | 'preserve'; idempotencyKey: string }) => Object.freeze({ ...input,
    expectedRevision: 1, expectedSnapshotHash: hash(sourceText), expectedPriorPinDigest: prior,
    candidateSnapshotHash: hash(input.snapshotText), requestHash: hash(JSON.stringify(['note-native2-snapshot-v1', tenantId, workspaceId, documentId,
      input.schemaAction, 1, hash(sourceText), prior, input.snapshotText])) }));
  const context: Context = { source: read, prepare, isCurrent: () => current, retire: vi.fn(),
    subscribeRetirement: callback => { callbacks.add(callback); return () => { callbacks.delete(callback); }; },
    validateSource: vi.fn(async (): Promise<Native2Validation> => ({ status: 'structurally_valid', kind: 'document', documentId, documentRevision: 1,
      snapshotHash: hash(sourceText), priorPinDigest: prior, checks: ['current_authority', 'current_source'] })),
    validate: vi.fn(async (attempt: Native2MutationAttempt): Promise<Native2Validation> => ({ status: 'structurally_valid', kind: 'candidate', documentId, documentRevision: 1,
      snapshotHash: hash(sourceText), priorPinDigest: prior, candidateSnapshotHash: attempt.candidateSnapshotHash, action: 'adopt', checks: ['candidate_file'] })),
    update: vi.fn(async (): Promise<Awaited<ReturnType<Context['update']>>> => { throw Error('Not configured'); }),
    recover: vi.fn(async () => { throw Error('No recovery effect from preview/validation'); }) };
  const factory: Factory = { open: vi.fn(async () => context), isCurrent: () => current, retire: vi.fn(), subscribeRetirement: context.subscribeRetirement };
  const createMutationLease = vi.fn(async () => factory);
  const source: Native2StageSource = { session: authority, authority, resourceIds: [],
    scope: { issuer: 'controlled-issuer', subject: 'controlled-subject', currentUserId: null, tenantId, workspaceId, documentId },
    sourceSnapshot: () => JSON.stringify(authority.editor.exportDocument()), isCurrent: () => current,
    subscribeAuthority: callback => { authorityCallbacks.add(callback); return () => { authorityCallbacks.delete(callback); }; } };
  const stage: Native2ReadonlyStage = { session: staged, read, isCurrent: () => current, dispose: vi.fn() };
  const storage = new MemoryStorage();
  const journal = createExperimentalNative2AdoptJournal({ scope: { issuer: source.scope.issuer, subject: source.scope.subject, tenantId, workspaceId }, documentId, storage, isWritableCurrent: () => current });
  const receipt = (attempt: Native2MutationAttempt) => ({ operation: 'update' as const, idempotencyKey: attempt.idempotencyKey,
    requestHash: attempt.requestHash, document: { ...read.document, revision: 2, snapshotHash: attempt.candidateSnapshotHash },
    snapshotText: attempt.snapshotText, selectedPinsChanged: true });
  vi.mocked(context.update).mockImplementation(async attempt => {
    expect((await journal.office.read())?.fixed?.requestHash).toBe(attempt.requestHash);
    return receipt(attempt);
  });
  const target = createNoteNative2Context(candidateText);
  const nextRead: Context['source'] = { document: { ...read.document, revision: 2, snapshotHash: hash(candidateText) }, snapshotText: candidateText,
    file: { fileVersion: 2, schemaBundle: target.schemaBundle, document: target.document, savedAt: target.savedAt } };
  const nextCallbacks = new Set<() => void>();
  const nextLease = { read: nextRead, provenance: { ...source.scope, role: 'owner' as const }, isCurrent: () => current,
    retire: vi.fn(), subscribeRetirement: (callback: () => void) => { nextCallbacks.add(callback); return () => { nextCallbacks.delete(callback); }; } };
  const reader: Native2StageReadFactory = { open: vi.fn(async () => nextLease), retire: vi.fn(), isCurrent: () => current,
    subscribeRetirement: nextLease.subscribeRetirement };
  const createReadLease = vi.fn(async () => reader);
  const recovery: ReturnType<typeof createAuthenticatedNative2ReceiptRecovery> = { isCurrent: () => current, retire: vi.fn(),
    subscribeRetirement: context.subscribeRetirement,
    recover: vi.fn(async original => ({ kind: 'historical_acknowledgment' as const, original,
      receipt: { operation: 'update' as const, idempotencyKey: original.idempotencyKey,
        requestHash: hash(JSON.stringify(['note-native2-snapshot-v1', tenantId, workspaceId, documentId, original.schemaAction,
          original.expectedRevision, original.expectedSnapshotHash, original.expectedPriorPinDigest, original.snapshotText])),
        document: nextRead.document, snapshotText: original.snapshotText }, isCurrent: () => current,
      retire: vi.fn(), subscribeRetirement: context.subscribeRetirement })) };
  const createReceiptRecoveryLease = vi.fn(async () => recovery);
  const operation = createNative2SchemaAdoptionOperation({ source, stage, journal: journal.office,
    createMutationLease, createReadLease, createReceiptRecoveryLease });
  return { operation, authority, source, stage, context, factory, createMutationLease, storage, journal,
    reader, nextLease, recovery, createReadLease, createReceiptRecoveryLease, receipt,
    retire: () => { current = false; [...callbacks, ...authorityCallbacks, ...nextCallbacks].forEach(callback => callback()); },
    cleanup: () => { operation.dispose(); staged.close(); authority.close(); } };
}

let root: Root, host: HTMLDivElement, h: ReturnType<typeof setup>, lastTask: Promise<unknown> | undefined;
function panelOperation(operation: ReturnType<typeof createNative2SchemaAdoptionOperation>) {
  return { ...operation,
    preview: (input: Parameters<typeof operation.preview>[0]) => {
      const proposal = operation.preview(input);
      return { ...proposal, validate: () => { const task = proposal.validate(); lastTask = task; return task; } };
    },
    confirm: () => { const task = operation.confirm(); lastTask = task; return task; },
    recordCandidate: (text: string) => { const task = operation.recordCandidate(text); lastTask = task; return task; },
    recoverHistorical: () => { const task = operation.recoverHistorical(); lastTask = task; return task; },
    retryFixed: () => { const task = operation.retryFixed(); lastTask = task; return task; },
  };
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // jsdom geometry only. Native model and actual NoteEditor remain real.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => ({ x: 0, y: 0, width: 0, height: 0 }) });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); h = setup();
  const operation = panelOperation(h.operation);
  await act(async () => root.render(<Native2SchemaAdoptionPanel createOperation={() => operation} />));
});
afterEach(async () => { await act(async () => root.unmount()); h.cleanup(); host.remove(); vi.unstubAllGlobals(); });
const button = (label: string) => {
  const value = [...host.querySelectorAll<HTMLButtonElement>('button')].find(one => one.textContent === label);
  if (!value) throw Error('Missing button '+label); return value;
};
async function settle(assert: () => void | Promise<void>) {
  await vi.waitFor(async () => { await act(async () => { await Promise.resolve(); }); await assert(); });
}
async function click(label: string, wait = false) { await act(async () => { lastTask = undefined; button(label).click(); if (wait) { try { await lastTask; } catch { /* The panel presents named refusal. */ } } }); }
async function fill(label: string, value: string) {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function preview() {
  await fill('전체 후보 문서', candidateText); await fill('데이터 경로', '4,0'); await fill('요청 키', 'panel-1');
  await click('후보 미리보기');
}
it('renders full readonly candidate and receipt A2 through real NoteEditor; only explicit confirmation writes', async () => {
  const original = h.authority.editor.exportDocument(), index = h.authority.editor.historyManager.getCurrentIndex();
  await preview();
  const candidate = host.querySelector('[aria-label="채택 후보 읽기 전용"]');
  expect(candidate?.querySelector('[contenteditable="false"]')).not.toBeNull();
  expect(candidate?.textContent).toContain('후보 문서');
  expect(h.createMutationLease).not.toHaveBeenCalled(); expect(h.storage.length).toBe(0);
  expect(button('채택 확인').disabled).toBe(true);
  await click('구조 검사', true); expect(h.context.update).not.toHaveBeenCalled(); expect(h.storage.length).toBe(0);
  expect(host.textContent).toContain('채택 확인은 별도'); expect(button('채택 확인').disabled).toBe(false);
  await click('채택 확인', true); await settle(() => expect(host.textContent).toContain('영수증과 현재 읽기 결과가 일치')); expect(h.context.update).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[aria-label="영수증과 일치하는 현재 문서"] [contenteditable="false"]')).not.toBeNull();
  expect(h.authority.editor.exportDocument()).toEqual(original); expect(h.authority.editor.historyManager.getCurrentIndex()).toBe(index);
  expect(h.stage.dispose).not.toHaveBeenCalled(); expect(h.stage.session.exportSnapshot()).toBe(sourceText);
});
it('retains a later textarea draft while held advisory validation resolves and refuses confirming the old proposal', async () => {
  await preview(); let release!: (value: Native2Validation) => void;
  const validation = await h.context.validate(await h.context.prepare({ snapshotText: candidateText, schemaAction: 'adopt', idempotencyKey: 'panel-1' }));
  vi.mocked(h.context.validate).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  await click('구조 검사'); await fill('전체 후보 문서', '{incomplete later draft');
  await act(async () => release(validation));
  expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('{incomplete later draft');
  expect(button('채택 확인').disabled).toBe(true); expect(h.context.update).not.toHaveBeenCalled();
  await click('초안 보관', true); await settle(async () => expect((await h.journal.office.read())?.latestCandidate.snapshotText).toBe('{incomplete later draft'));
});
it('does not install held validation or perform a PUT after explicit panel close; caller A1 stays alive', async () => {
  await preview(); let release!: (value: Native2Validation) => void;
  const validation = await h.context.validate(await h.context.prepare({ snapshotText: candidateText, schemaAction: 'adopt', idempotencyKey: 'panel-1' }));
  vi.mocked(h.context.validate).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  await click('구조 검사'); await click('채택 화면 닫기');
  expect(h.operation.isCurrent()).toBe(false); expect(h.stage.dispose).not.toHaveBeenCalled(); expect(host.childElementCount).toBe(0);
  await act(async () => release(validation)); expect(h.context.update).not.toHaveBeenCalled(); expect(h.storage.length).toBe(0);
});
it('unmount disposes idle preview immediately without disposing caller source/stage', async () => {
  await preview();
  await act(async () => root.render(null));
  expect(h.operation.isCurrent()).toBe(false);
  expect(h.stage.dispose).not.toHaveBeenCalled(); expect(h.stage.session.exportSnapshot()).toBe(sourceText);
});
it('rejects wrong dataset and unrelated body changes without transport', async () => {
  await preview(); await fill('데이터 경로', '4,1'); await click('후보 미리보기');
  expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(button('채택 확인').disabled).toBe(true);
  await fill('데이터 경로', '4,0'); await fill('전체 후보 문서', JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B)); await click('후보 미리보기');
  expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(h.createMutationLease).not.toHaveBeenCalled();
});
it('keeps lost ACK and later draft separate; historical recovery alone never grants current-read success', async () => {
  await preview(); await click('구조 검사', true); vi.mocked(h.context.update).mockRejectedValueOnce(Error('controlled_lost_ack'));
  await click('채택 확인', true); await settle(() => expect(host.textContent).toContain('controlled_lost_ack')); const fixed = (await h.journal.office.read())!.fixed!;
  expect((await h.journal.office.read())?.phase).toBe('unknown'); expect(host.textContent).toContain('controlled_lost_ack');
  await fill('전체 후보 문서', '{later'); await click('초안 보관', true); await settle(async () => expect((await h.journal.office.read())?.latestCandidate.snapshotText).toBe('{later')); await click('과거 요청 영수증 확인', true); await settle(() => expect(host.textContent).toContain('현재 저장 상태는 별도'));
  const record = (await h.journal.office.read())!;
  expect(record.fixed?.original).toEqual(fixed.original); expect(record.latestCandidate.snapshotText).toBe('{later');
  expect(host.textContent).toContain('현재 저장 상태는 별도'); expect(h.context.update).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[aria-label="영수증과 일치하는 현재 문서"]')).toBeNull();
});

it('preserves later local input during held confirmation and discards held result after close', async () => {
  await preview(); await click('구조 검사', true);
  let release!: (value: Awaited<ReturnType<Context['update']>>) => void;
  vi.mocked(h.context.update).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  await click('채택 확인'); await settle(() => expect(h.context.update).toHaveBeenCalledTimes(1));
  await fill('전체 후보 문서', '{later during PUT'); expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('{later during PUT');
  const attempt = vi.mocked(h.context.update).mock.calls[0][0], original = (await h.journal.office.read())!.fixed!;
  expect(original.original.snapshotText).toBe(candidateText);
  await click('채택 화면 닫기'); await act(async () => release(h.receipt(attempt)));
  expect(host.childElementCount).toBe(0); expect(h.createReadLease).not.toHaveBeenCalled();
  expect(h.stage.dispose).not.toHaveBeenCalled(); expect(h.stage.session.exportSnapshot()).toBe(sourceText);
});
it('retires the old operation on host factory replacement; late old validation cannot update new panel', async () => {
  await preview(); let release!: (value: Native2Validation) => void;
  const validation = await h.context.validate(await h.context.prepare({ snapshotText: candidateText, schemaAction: 'adopt', idempotencyKey: 'panel-1' }));
  vi.mocked(h.context.validate).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  await click('구조 검사'); const next = setup();
  try {
    await act(async () => root.render(<Native2SchemaAdoptionPanel createOperation={() => next.operation} />));
    expect(h.operation.isCurrent()).toBe(false);
    await act(async () => release(validation));
    expect(host.querySelector('[role="status"]')).toBeNull(); expect(button('채택 확인').disabled).toBe(true);
    expect(next.context.update).not.toHaveBeenCalled(); expect(next.operation.isCurrent()).toBe(true);
    await act(async () => root.render(null)); expect(next.operation.isCurrent()).toBe(false);
  } finally { next.cleanup(); }
});
it('rejects ambiguous or unsafe paths before preview and retains full raw input', async () => {
  await fill('전체 후보 문서', candidateText); await fill('요청 키', 'panel-1');
  for (const path of ['4, 0', '04,0', '-1', '9007199254740992']) {
    await fill('데이터 경로', path); await click('후보 미리보기');
    expect(host.textContent).toContain('native2_adoption_invalid_dataset_path');
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe(candidateText);
  }
  expect(h.createMutationLease).not.toHaveBeenCalled(); expect(h.storage.length).toBe(0);
});

it('refuses a captured authority retirement at action time even before the host rerenders', async () => {
  await preview(); await act(async () => h.retire());
  await click('구조 검사', true);
  expect(h.createMutationLease).not.toHaveBeenCalled(); expect(h.context.update).not.toHaveBeenCalled();
  expect(h.storage.length).toBe(0); expect(h.operation.isCurrent()).toBe(false);
});

async function lostAck() {
  await preview(); await click('구조 검사', true); vi.mocked(h.context.update).mockRejectedValueOnce(Error('controlled_lost_ack'));
  await click('채택 확인', true); expect((await h.journal.office.read())?.phase).toBe('unknown');
}
it('only explicit original retry submits the immutable fixed operation while later text/key/path/durable draft stay separate', async () => {
  await lostAck(); const fixed = (await h.journal.office.read())!.fixed!;
  await fill('전체 후보 문서', '{later retry UI draft'); await fill('데이터 경로', '0'); await fill('요청 키', 'later-ui-key');
  await click('초안 보관', true); const stored = h.storage.getItem(h.journal.key);
  expect(h.context.update).toHaveBeenCalledTimes(1); expect(h.recovery.recover).not.toHaveBeenCalled();
  vi.mocked(h.recovery.recover).mockRejectedValueOnce(new Native2MutationError('not_found', 404));
  await click('고정 원래 요청 재시도', true);
  expect(h.context.update).toHaveBeenCalledTimes(2); const attempt = vi.mocked(h.context.update).mock.calls[1][0];
  expect(attempt.snapshotText).toBe(fixed.original.snapshotText); expect(attempt.idempotencyKey).toBe('panel-1');
  expect(attempt.requestHash).toBe(fixed.requestHash); expect(h.storage.getItem(h.journal.key)).toBe(stored);
  expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('{later retry UI draft');
  expect(host.querySelector<HTMLInputElement>('[aria-label="요청 키"]')!.value).toBe('later-ui-key');
  expect(host.querySelector<HTMLInputElement>('[aria-label="데이터 경로"]')!.value).toBe('0');
  expect(host.querySelector('[aria-label="영수증과 일치하는 현재 문서"]')).not.toBeNull();
  expect(button('고정 원래 요청 재시도').disabled).toBe(true); expect(h.stage.dispose).not.toHaveBeenCalled();
});
it('known receipt refuses explicit retry without a second PUT or current-read success', async () => {
  await lostAck(); const stored = h.storage.getItem(h.journal.key);
  await click('고정 원래 요청 재시도', true);
  expect(h.context.update).toHaveBeenCalledTimes(1); expect(host.textContent).toContain('receipt_already_exists');
  expect(host.querySelector('[aria-label="영수증과 일치하는 현재 문서"]')).toBeNull(); expect(h.storage.getItem(h.journal.key)).toBe(stored);
});
it('close during held retry qualification prevents a new writer and late UI installation', async () => {
  await lostAck(); let release!: () => void;
  vi.mocked(h.recovery.recover).mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); throw new Native2MutationError('not_found', 404); });
  await click('고정 원래 요청 재시도'); await settle(() => expect(release).toBeTypeOf('function'));
  await click('채택 화면 닫기'); await act(async () => release());
  expect(h.createMutationLease).toHaveBeenCalledTimes(2); // Advisory and original confirm only.
  expect(h.context.update).toHaveBeenCalledTimes(1); expect(host.childElementCount).toBe(0); expect(h.stage.dispose).not.toHaveBeenCalled();
});
it('a missing fixed operation is a named refusal and does not infer authority from the current textarea', async () => {
  await preview(); await click('고정 원래 요청 재시도', true);
  expect(host.textContent).toContain('no_fixed_operation'); expect(h.context.update).not.toHaveBeenCalled();
  expect(h.createMutationLease).not.toHaveBeenCalled(); expect(h.storage.length).toBe(0);
});
