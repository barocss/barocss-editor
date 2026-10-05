// @vitest-environment jsdom
// Controlled transport and child-delivery harness; not actual OIDC/API qualification.
import { act, createElement, useEffect, useRef, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blocksIn, createSampleSite, pagesOf, SITE_FORMAT, SITE_FILE_VERSION } from '@barocss/office-site';
import { captureProductNavigation, productDocumentHost } from '@barocss/shared';
import type { App } from '../src/app';
import type { SiteRuntime } from '../src/runtime';
import { ServerSiteWorkspace } from '../src/server-workspace';
import { serverSiteFileText } from '../src/server-file';
import { createServerPendingStore } from '../src/server-pending';
import { ServerSiteError, type ServerSiteHead, type SiteSaveAttempt } from '../src/server-documents';

const controls = vi.hoisted(() => ({ clients: new Map<unknown, unknown>() }));
vi.mock('../src/server-documents', async importOriginal => {
  const original = await importOriginal<typeof import('../src/server-documents')>();
  return { ...original, createServerSiteClient: ({ authorizedFetch }: { authorizedFetch: unknown }) => {
    const client = controls.clients.get(authorizedFetch);
    if (!client) throw new Error('unregistered_controlled_transport');
    return client;
  } };
});
vi.mock('../src/app', () => ({ App: ControlledNativeApp }));

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
type Delivery = ReturnType<typeof deferred<void>>;
type Mounted = {
  runtime: SiteRuntime; host: HTMLElement; entered: number; next?: Delivery;
  version: number; pending: boolean; disposed: boolean;
};
const mounted: Mounted[] = [];
function ControlledNativeApp({ mount, server }: ComponentProps<typeof App>) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(server); latest.current = server;
  useEffect(() => {
    const runtime = mount(host.current!);
    const one: Mounted = { runtime, host: host.current!, entered: 0, version: 0, pending: false, disposed: false };
    mounted.push(one);
    latest.current!.onRuntime(runtime, {
      beforeSnapshot: async () => { one.entered++; const delivery = one.next; one.next = undefined; if (delivery) await delivery.promise; },
      hasPendingInput: () => one.pending,
      captureInputIntent: () => {
        const version = one.version, root = runtime.editor.getRootId(), epoch = runtime.editor.dataStore.getDocumentEpoch();
        return () => !one.disposed && one.version === version && !one.pending &&
          runtime.editor.getRootId() === root && runtime.editor.dataStore.getDocumentEpoch() === epoch;
      }
    });
    return () => { one.disposed = true; runtime.dispose(); };
  }, [mount]);
  return createElement('section', { 'data-controlled-native-app': true },
    createElement('div', { ref: host, 'data-controlled-native-root': true }),
    server?.headerActions, server?.navigation);
}
const tenantId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const sourceId = '33333333-3333-4333-8333-333333333333';
const targetId = '44444444-4444-4444-8444-444444444444';
const issuer = 'https://controlled-login.example.test';
function snapshot(label: string) {
  const document = createSampleSite();
  document.metadata = { ...(document.metadata as Record<string, unknown> | undefined), controlledFixture: label };
  return serverSiteFileText(document, '');
}
function head(documentId: string, title: string, revision = 1): ServerSiteHead {
  return { documentId, tenantId, workspaceId, product: 'site', title, metadataRevision: 1,
    mode: 'snapshot', pageId: null, documentKey: `wonffice-${tenantId}-${documentId}`,
    fileFormat: SITE_FORMAT, fileVersion: SITE_FILE_VERSION, revision, snapshotHash: 'a'.repeat(64) };
}
function transport(label: string) {
  const sourceText = snapshot(label), targetText = snapshot(`${label}-target`);
  const source = head(sourceId, `${label} source`), target = head(targetId, `${label} target`);
  const client = {
    list: vi.fn(async () => [source, target]),
    open: vi.fn(async (id: string) => ({ mode: 'snapshot' as const, document: id === sourceId ? source : target,
      snapshotText: id === sourceId ? sourceText : targetText })),
    receipt: vi.fn(async () => { throw new ServerSiteError(404, 'receipt_not_found'); }),
    save: vi.fn(async (attempt: SiteSaveAttempt) => ({ operation: attempt.operation, idempotencyKey: attempt.idempotencyKey,
      requestHash: 'b'.repeat(64), document: head(sourceId, `${label} saved`, 2), snapshotText: attempt.snapshotText })),
    confirm: vi.fn(async (attempt: SiteSaveAttempt) => ({ mode: 'snapshot' as const,
      document: head(sourceId, `${label} saved`, 2), snapshotText: attempt.snapshotText }))
  };
  const authorizedFetch = vi.fn() as unknown as typeof fetch;
  controls.clients.set(authorizedFetch, client);
  return { client, authorizedFetch, sourceText, targetText };
}
let root: Root;
let container: HTMLDivElement;
let props: ComponentProps<typeof ServerSiteWorkspace>;
async function render(next: Partial<typeof props> = {}) {
  props = { ...props, ...next };
  await act(async () => root.render(createElement(ServerSiteWorkspace, props)));
}
function button(name: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find(one => one.textContent === name);
  expect(found, `actual named server action ${name}`).toBeDefined();
  return found!;
}
async function click(name: string) { await act(async () => button(name).click()); }
function nativeText(one: Mounted) { return serverSiteFileText(one.runtime.exportNativeDocument(), ''); }
async function editNative(one: Mounted) {
  const editor = one.runtime.editor;
  const access = { rootId: editor.getRootId()!, getNode: (sid: string) => editor.dataStore.getNode(sid) };
  const page = pagesOf(access)[0].sid, block = blocksIn(access, page)[0];
  await act(async () => {
    expect(await editor.executeCommand('setNode', { nodeIds: [block] })).not.toBe(false);
    expect(await editor.executeCommand('duplicateBlocks')).not.toBe(false);
    one.version++;
  });
}
function stored(subject = props.subject) {
  return createServerPendingStore({ tenantId, workspaceId, issuer, subject }).list();
}
async function ready() {
  await expect.poll(() => mounted.filter(one => !one.disposed).length).toBe(1);
  return mounted.find(one => !one.disposed)!;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, 1024, 768));
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => [new DOMRect(0, 0, 1024, 768)] as unknown as DOMRectList);
  if (!globalThis.CSS?.escape) vi.stubGlobal('CSS', { ...globalThis.CSS, escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&') });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:controlled-export') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  localStorage.clear(); controls.clients.clear(); mounted.length = 0;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  const account = transport('A');
  props = { tenantId, workspaceId, issuer, subject: 'account-a', initialDocumentId: sourceId,
    authorizedFetch: account.authorizedFetch, role: 'editor', onNavigate: vi.fn() };
});
afterEach(async () => {
  await act(async () => root.unmount());
  expect(productDocumentHost()).toBeUndefined();
  document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('controlled mounted Site workspace ownership', () => {
  it('does not let account B join account A unfinished child delivery', async () => {
    await render(); const a = await ready(), aDelivery = deferred(); a.next = aDelivery;
    await click('Site 파일 내보내기'); expect(a.entered).toBe(1);
    const accountB = transport('B');
    await render({ subject: 'account-b', authorizedFetch: accountB.authorizedFetch });
    const b = await ready(), bDelivery = deferred(); b.next = bDelivery;
    const bBefore = nativeText(b);
    await click('Site 파일 내보내기');
    // This assertion is the genuine preserved a745 unscoped flushLock regression.
    expect(b.entered).toBe(1);
    await act(async () => { aDelivery.resolve(); await aDelivery.promise; });
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(nativeText(b)).toBe(bBefore); expect(props.onNavigate).not.toHaveBeenCalled();
    await act(async () => { bDelivery.resolve(); await bDelivery.promise; });
    await expect.poll(() => vi.mocked(HTMLAnchorElement.prototype.click).mock.calls.length).toBe(1);
    expect(accountB.client.save).not.toHaveBeenCalled();
  });

  it('keeps B save ownership when a held A acknowledgment completes', async () => {
    const accountA = controls.clients.get(props.authorizedFetch) as ReturnType<typeof transport>['client'];
    const heldA = deferred<Awaited<ReturnType<typeof accountA.confirm>>>();
    accountA.confirm.mockImplementationOnce(() => heldA.promise);
    await render(); const a = await ready(); await editNative(a); await click('저장');
    await expect.poll(() => accountA.confirm.mock.calls.length).toBe(1);
    const accountB = transport('B'); const heldB = deferred<Awaited<ReturnType<typeof accountB.client.confirm>>>();
    accountB.client.confirm.mockImplementationOnce(() => heldB.promise);
    await render({ subject: 'account-b', authorizedFetch: accountB.authorizedFetch });
    const b = await ready(); await editNative(b); const bBytes = nativeText(b); await click('저장');
    await expect.poll(() => accountB.client.confirm.mock.calls.length).toBe(1);
    const aAttempt = accountA.save.mock.calls[0][0], bAttempt = accountB.client.save.mock.calls[0][0];
    await act(async () => heldA.resolve({ mode: 'snapshot', document: head(sourceId, 'A saved', 2), snapshotText: aAttempt.snapshotText }));
    expect(button('저장 확인·재시도').disabled).toBe(true);
    expect(container.querySelector('[data-save-status]')?.textContent).toBe('저장 중…');
    expect(nativeText(b)).toBe(bBytes); expect(props.onNavigate).not.toHaveBeenCalled();
    expect(stored('account-b').find(one => one.status === 'pending')?.attempt).toEqual(bAttempt);
    await act(async () => heldB.resolve({ mode: 'snapshot', document: head(sourceId, 'B saved', 2), snapshotText: bAttempt.snapshotText }));
    await expect.poll(() => container.querySelector('[data-save-status]')?.textContent).toBe('서버 저장 확인됨');
    expect(props.onNavigate).toHaveBeenCalledExactlyOnceWith(sourceId);
    expect(stored('account-a').find(one => one.status === 'pending')?.attempt).toEqual(aAttempt);
  });

  it('refuses a held guarded target after actual source native input', async () => {
    const account = controls.clients.get(props.authorizedFetch) as ReturnType<typeof transport>['client'];
    await render(); const one = await ready(), guard = captureProductNavigation()!;
    const target = deferred<Awaited<ReturnType<typeof account.open>>>(); account.open.mockImplementationOnce(() => target.promise);
    let opening!: Promise<unknown>;
    await act(async () => { opening = guard.open!(targetId); });
    await expect.poll(() => account.open.mock.calls.length).toBe(2);
    await editNative(one); const changed = nativeText(one), history = one.runtime.editor.getHistoryStats();
    await act(async () => { target.resolve({ mode: 'snapshot', document: head(targetId, 'target'), snapshotText: snapshot('target') }); expect(await opening).toBe(false); });
    expect(mounted.filter(value => !value.disposed)).toEqual([one]);
    expect(nativeText(one)).toBe(changed); expect(one.runtime.editor.getHistoryStats()).toEqual(history);
    expect(props.onNavigate).not.toHaveBeenCalled(); expect(stored().some(record => record.snapshotText === changed)).toBe(true);
  });

  it.each(['create', 'recover'] as const)('refuses held %s validation after later native source input', async operation => {
    const account = controls.clients.get(props.authorizedFetch) as ReturnType<typeof transport>['client'];
    const recovery = operation === 'recover' ? createServerPendingStore({ tenantId, workspaceId, issuer, subject: props.subject }).write({
      draftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', documentRef: targetId,
      base: { operation: 'update', documentId: targetId, expectedRevision: 1 }, status: 'draft', snapshotText: snapshot('recover-target')
    }) : undefined;
    await render(); const one = await ready();
    const heldList = deferred<ServerSiteHead[]>(), heldRead = deferred<Awaited<ReturnType<typeof account.open>>>();
    if (operation === 'create') account.list.mockImplementationOnce(() => heldList.promise);
    else account.open.mockImplementationOnce(() => heldRead.promise);
    const action = operation === 'create' ? '새 Site' : `저장된 Site 초안 복구 · ${recovery!.savedAt}`;
    await click(action);
    await expect.poll(() => operation === 'create' ? account.list.mock.calls.length : account.open.mock.calls.length).toBe(2);
    await editNative(one); const changed = nativeText(one), history = one.runtime.editor.getHistoryStats();
    const durable = stored();
    await act(async () => {
      if (operation === 'create') heldList.resolve([head(sourceId, 'source'), head(targetId, 'target')]);
      else heldRead.resolve({ mode: 'snapshot', document: head(targetId, 'target'), snapshotText: snapshot('server-target') });
    });
    await expect.poll(() => button(action).disabled).toBe(false);
    expect(mounted.filter(value => !value.disposed)).toEqual([one]);
    expect(nativeText(one)).toBe(changed); expect(one.runtime.editor.getHistoryStats()).toEqual(history);
    expect(stored()).toEqual(durable); expect(props.onNavigate).not.toHaveBeenCalled();
    if (recovery) expect(stored().find(record => record.draftId === recovery.draftId)).toEqual(recovery);
    expect(account.save).not.toHaveBeenCalled();
  });

  it('refuses account exit on real durable-write failure and retains native input and history', async () => {
    const account = controls.clients.get(props.authorizedFetch) as ReturnType<typeof transport>['client'];
    await render(); const one = await ready(), durable = stored();
    const failWrite = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('controlled quota', 'QuotaExceededError'); });
    await editNative(one); const changed = nativeText(one), history = one.runtime.editor.getHistoryStats();
    let exited!: boolean;
    await act(async () => { exited = await captureProductNavigation()!.prepareAccountExit!(); });
    expect(exited).toBe(false); expect(nativeText(one)).toBe(changed);
    expect(one.runtime.editor.getHistoryStats()).toEqual(history); expect(stored()).toEqual(durable);
    expect(account.receipt).not.toHaveBeenCalled(); expect(account.save).not.toHaveBeenCalled(); expect(account.confirm).not.toHaveBeenCalled();
    expect(props.onNavigate).not.toHaveBeenCalled();
    expect(container.textContent).toContain('현재 입력을 보관하지 못했습니다.');
    failWrite.mockRestore();
  });

  it('retains pending attempt and later native draft on account exit without server publication', async () => {
    const account = controls.clients.get(props.authorizedFetch) as ReturnType<typeof transport>['client'];
    account.save.mockRejectedValueOnce(new ServerSiteError(null, 'controlled_connection_lost'));
    await render(); const one = await ready(); await editNative(one); await click('저장');
    await expect.poll(() => container.querySelector('[role="alert"]')?.textContent).toContain('같은 요청');
    const pinned = stored().find(record => record.status === 'pending')!;
    expect(pinned.attempt).toBeDefined();
    await editNative(one); const latest = nativeText(one), rawBefore = stored();
    const calls = [account.list.mock.calls.length, account.receipt.mock.calls.length, account.save.mock.calls.length, account.confirm.mock.calls.length];
    let exited!: boolean;
    await act(async () => { exited = await captureProductNavigation()!.prepareAccountExit!(); });
    expect(exited).toBe(true);
    expect([account.list.mock.calls.length, account.receipt.mock.calls.length, account.save.mock.calls.length, account.confirm.mock.calls.length]).toEqual(calls);
    expect(stored()).toEqual(rawBefore); expect(stored().find(record => record.draftId === pinned.draftId)).toEqual(pinned);
    expect(stored().some(record => record.status === 'draft' && record.snapshotText === latest)).toBe(true);
    expect(props.onNavigate).not.toHaveBeenCalled(); expect(nativeText(one)).toBe(latest);
  });
});
it.each(['new', 'recovery'] as const)('refuses held %s preparation after live host authority retirement with no mounted native', async operation => {
  const one = transport('empty-current-authority');
  let authorized = true;
  if (operation === 'recovery') createServerPendingStore({ tenantId, workspaceId, issuer, subject: props.subject }).write({
    draftId: targetId, documentRef: sourceId, base: { operation: 'create', workspaceId }, status: 'draft', snapshotText: one.sourceText });
  await render({ authorizedFetch: one.authorizedFetch, initialDocumentId: undefined, isAuthorized: () => authorized, authorityEpoch: 1 });
  expect(mounted).toHaveLength(0);
  const originals = stored(), held = deferred<ServerSiteHead[]>();
  one.client.list.mockImplementationOnce(() => held.promise);
  const action = operation === 'new' ? '새 Site' : `저장된 Site 초안 복구 · ${originals[0].savedAt}`;
  await click(action);
  // The host retires synchronously before a React permission render can run.
  authorized = false;
  await act(async () => held.resolve([head(sourceId, 'source'), head(targetId, 'target')]));
  expect(mounted).toHaveLength(0);
  expect(stored()).toEqual(originals);
  expect(one.client.save).not.toHaveBeenCalled();
  authorized = true;
  await render({ authorityEpoch: 2 });
  await click(action);
  const native = await ready();
  if (operation === 'recovery') {
    expect(JSON.parse(nativeText(native))).toEqual(JSON.parse(one.sourceText));
    expect(stored()).toEqual(originals);
  }
  expect(one.client.save).not.toHaveBeenCalled();
});
