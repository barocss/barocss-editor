// @vitest-environment jsdom
import { act, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { productDocumentHost, type ProductDocumentHost } from '@barocss/shared';
import { createSampleDocument } from '@barocss/office-word';
import { registerPreCommitGuard } from '../../../packages/model/src';
import type { WordRuntime } from '../src/runtime';
import { serverWordFileText, WORD_FORMAT, WORD_FILE_VERSION } from '../src/server-file';
import type { ServerWordHead } from '../src/server-documents';
import { createServerPendingStore } from '../src/server-pending';
import type { App } from '../src/app';
import { ServerWordWorkspace, type ServerWordWorkspaceProps } from '../src/server-workspace';

type AppProps = Parameters<typeof App>[0];
const bridge = vi.hoisted(() => ({ runtime: undefined as WordRuntime | undefined, server: undefined as AppProps['server'] }));
// The native runtime/input/store/client are real. Only unrelated editor chrome is omitted.
vi.mock('../src/app', () => ({ App: ({ mount, server }: AppProps) => {
  const host = useRef<HTMLDivElement>(null);
  bridge.server = server;
  useEffect(() => {
    const runtime = mount!(host.current!); bridge.runtime = runtime; server!.onRuntime(runtime);
    return () => { runtime.dispose(); if (bridge.runtime === runtime) bridge.runtime = undefined; };
  }, [mount]);
  return <div ref={host} />;
} }));
const tenantId = '10000000-0000-4000-8000-000000000001';
const workspaceId = '20000000-0000-4000-8000-000000000002';
const documentId = '30000000-0000-4000-8000-000000000003';
const scope = { tenantId, workspaceId, issuer: 'local-test', subject: 'writer' };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve };
}
let root: Root | undefined, container: HTMLDivElement;
beforeEach(() => {
  localStorage.clear(); bridge.runtime = undefined; bridge.server = undefined;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`) });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root?.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function transport() {
  const text = serverWordFileText(createSampleDocument(), '');
  const head: ServerWordHead = { documentId, tenantId, workspaceId, product: 'word', title: 'Full native original', metadataRevision: 1,
    mode: 'snapshot', pageId: null, documentKey: 'word-exit', fileFormat: WORD_FORMAT, fileVersion: WORD_FILE_VERSION,
    revision: 1, snapshotHash: digest(text) };
  const entered = deferred(), released = deferred(); let hold = false, writes = 0;
  const authorizedFetch = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.includes('/receipts/')) return Response.json({ status: 'not_found' }, { status: 404 });
    if (init?.method === 'PUT' || init?.method === 'POST') {
      writes++; entered.resolve(); if (hold) await released.promise;
      return Response.json({ status: 'unavailable' }, { status: 503 });
    }
    if (url.includes('/documents?')) return Response.json({ documents: [head], nextCursor: null });
    return Response.json({ document: head, snapshotText: text });
  });
  return { authorizedFetch, writes: () => writes, hold: () => { hold = true; return { entered: entered.promise, release: released.resolve }; } };
}
async function fixture(role: ServerWordWorkspaceProps['role'] = 'editor') {
  const remote = transport();
  const props: ServerWordWorkspaceProps = { ...scope, initialDocumentId: documentId, role, authorizedFetch: remote.authorizedFetch };
  await act(async () => root!.render(<ServerWordWorkspace {...props} />));
  await act(async () => { await vi.waitFor(() => expect(productDocumentHost()?.id()).toBe(documentId)); });
  const runtime = bridge.runtime!;
  const run = [...runtime.editor.dataStore.getNodes().values()].find(node => node.stype === 'inline-text' && node.text && runtime.view.contentEditableElement.querySelector(`[data-bc-sid="${node.sid}"]`))!;
  expect(run).toBeDefined();
  const leaf = document.createTreeWalker(runtime.view.contentEditableElement.querySelector(`[data-bc-sid="${run.sid}"]`)!, NodeFilter.SHOW_TEXT).nextNode() as Text;
  const range = document.createRange(); range.setStart(leaf, 0); range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  runtime.editor.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 0, collapsed: true });
  const exitHost = productDocumentHost() as ProductDocumentHost & { beforeAccountExit(): Promise<boolean> };
  expect(exitHost.beforeAccountExit).toBeTypeOf('function');
  const records = () => createServerPendingStore(scope).list();
  const raw = () => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]));
  const type = async (text: string) => { await act(async () => { expect(await runtime.editor.run('insertText', { text })).toBe(true); }); };
  const exit = async () => { let result = false; await act(async () => { result = await exitHost.beforeAccountExit(); }); return result; };
  return { runtime, run, remote, props, exitHost, records, raw, type, exit };
}

it('lets an unchanged confirmed viewer exit without local recovery writes or server requests', async () => {
  const one = await fixture('viewer');
  const original = one.runtime.exportNativeDocument(), history = one.runtime.editor.getHistoryStats(), calls = one.remote.authorizedFetch.mock.calls.length;
  expect(await one.exit()).toBe(true);
  expect(one.records()).toEqual([]); expect(one.remote.authorizedFetch).toHaveBeenCalledTimes(calls);
  expect(one.runtime.exportNativeDocument()).toEqual(original); expect(one.runtime.editor.getHistoryStats()).toEqual(history);
});
it('delivers real pending DOM input and durably protects the whole native without publishing it', async () => {
  const one = await fixture(); const original = one.runtime.exportNativeDocument();
  type Node = { stype?: string; text?: string; marks?: unknown[]; content?: Node[] };
  const expected = structuredClone(original) as Node; let changed = false;
  const prefix = (node: Node) => {
    if (!changed && node.stype === 'inline-text' && node.text === one.run.text) { node.text = `LAST INPUT ${node.text}`; node.marks ??= []; changed = true; }
    node.content?.forEach(prefix);
  };
  prefix(expected); expect(changed).toBe(true);
  const node = one.runtime.view.contentEditableElement.querySelector(`[data-bc-sid="${one.run.sid}"]`)!;
  const leaf = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode() as Text;
  expect(leaf).not.toBeNull(); leaf.data = `LAST INPUT ${leaf.data}`;
  expect(one.runtime.exportNativeDocument()).toEqual(original);
  const calls = one.remote.authorizedFetch.mock.calls.length;
  expect(await one.exit()).toBe(true);
  const native = one.runtime.exportNativeDocument(); expect(native).toEqual(expected);
  expect(serverWordFileText(native, '')).toContain('LAST INPUT ');
  const records = one.records(); expect(records).toHaveLength(1); expect(records[0].status).toBe('draft');
  expect(JSON.parse(records[0].snapshotText).document).toEqual(native); expect(records[0].scope).toEqual({ ...scope, documentRef: documentId });
  expect(records[0].base).toEqual({ operation: 'update', documentId, expectedRevision: 1 });
  expect(one.remote.authorizedFetch).toHaveBeenCalledTimes(calls); expect(one.remote.writes()).toBe(0);
  const protectedBytes = one.raw(); expect(await one.exit()).toBe(true); expect(one.raw()).toEqual(protectedBytes);
});
it('keeps a failed fixed request byte-for-byte and separately protects later input on account exit', async () => {
  const one = await fixture(); await one.type('FAILED FIXED INPUT ');
  await act(async () => { bridge.server!.onFileAction('save'); });
  await act(async () => { await vi.waitFor(() => expect(container.textContent).toContain('같은 요청')); });
  expect(one.remote.writes()).toBe(1);
  const pending = one.records().find(record => record.status === 'pending')!; expect(pending).toBeDefined();
  const key = createServerPendingStore(scope).key(pending.scope.documentRef, pending.draftId), fixedRaw = localStorage.getItem(key);
  await one.type('LATER INPUT '); const native = one.runtime.exportNativeDocument(), before = one.raw(), calls = one.remote.authorizedFetch.mock.calls.length;
  expect(await one.exit()).toBe(true);
  expect(one.remote.authorizedFetch).toHaveBeenCalledTimes(calls); expect(one.remote.writes()).toBe(1);
  expect(one.raw()).toEqual(before); expect(localStorage.getItem(key)).toBe(fixedRaw);
  expect(one.records().find(record => record.status === 'draft')?.draftId).not.toBe(pending.draftId);
  expect(one.records().find(record => record.status === 'draft')?.snapshotText).toBe(serverWordFileText(native, ''));
  expect(one.runtime.exportNativeDocument()).toEqual(native);
  const history = one.runtime.editor.getHistoryStats();
  localStorage.removeItem(key);
  expect(await one.exit()).toBe(false); // A later draft cannot substitute for the missing fixed attempt.
  expect(one.runtime.exportNativeDocument()).toEqual(native); expect(one.runtime.editor.getHistoryStats()).toEqual(history);
  expect(one.remote.authorizedFetch).toHaveBeenCalledTimes(calls);
});
it('waits only for the entered save and retains its failed immutable attempt without retrying', async () => {
  const one = await fixture(); await one.type('ENTERED REQUEST '); const held = one.remote.hold();
  await act(async () => { bridge.server!.onFileAction('save'); await held.entered; });
  const pending = one.records().find(record => record.status === 'pending')!, raw = one.raw();
  let done = false, result = false;
  await act(async () => {
    const preparation = one.exitHost.beforeAccountExit().then(value => { done = true; result = value; });
    await Promise.resolve(); expect(done).toBe(false); expect(one.remote.writes()).toBe(1);
    held.release(); await preparation;
  });
  expect(result).toBe(true); expect(one.remote.writes()).toBe(1); expect(one.raw()).toEqual(raw);
  expect(one.records().find(record => record.draftId === pending.draftId)).toEqual(pending);
});
it('refuses active composition and missing durable recovery without changing native/history or publishing', async () => {
  const one = await fixture(); await one.type('PROTECTED INPUT ');
  const native = one.runtime.exportNativeDocument(), history = one.runtime.editor.getHistoryStats(), calls = one.remote.authorizedFetch.mock.calls.length;
  one.runtime.view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  expect(await one.exit()).toBe(false); one.runtime.view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  for (const key of Object.keys(one.raw())) localStorage.removeItem(key);
  expect(await one.exit()).toBe(false);
  expect(one.runtime.exportNativeDocument()).toEqual(native); expect(one.runtime.editor.getHistoryStats()).toEqual(history);
  expect(one.remote.authorizedFetch).toHaveBeenCalledTimes(calls); expect(one.records()).toEqual([]);
});
it('refuses the captured exit after role ABA while an actual native command waits', async () => {
  const one = await fixture(), entered = deferred(), release = deferred();
  const native = one.runtime.exportNativeDocument(), history = one.runtime.editor.getHistoryStats();
  const off = registerPreCommitGuard(one.runtime.editor, async () => { entered.resolve(); await release.promise; });
  const inputOwner = one.runtime.view.captureInputOwner();
  const write = one.runtime.editor.run('insertText', { text: 'OWNED COMMAND ', canApply: inputOwner });
  await entered.promise;
  let exiting!: Promise<boolean>;
  await act(async () => { exiting = one.exitHost.beforeAccountExit(); await Promise.resolve(); });
  await act(async () => root!.render(<ServerWordWorkspace {...one.props} role="viewer" />));
  await act(async () => root!.render(<ServerWordWorkspace {...one.props} role="editor" />));
  let result = true;
  await act(async () => { release.resolve(); expect(await write).toBe(false); result = await exiting; });
  off(); expect(result).toBe(false); expect(one.remote.writes()).toBe(0);
  expect(one.runtime.exportNativeDocument()).toEqual(native); expect(one.runtime.editor.getHistoryStats()).toEqual(history);
});
it('refuses a same-original native reload while the old owned input is held, preserving the replacement and history', async () => {
  const one = await fixture(), entered = deferred(), release = deferred();
  const native = one.runtime.exportNativeDocument(), inputOwner = one.runtime.view.captureInputOwner();
  const off = registerPreCommitGuard(one.runtime.editor, async () => { entered.resolve(); await release.promise; });
  const write = one.runtime.editor.run('insertText', { text: 'OLD ROOT INPUT ', canApply: inputOwner }); await entered.promise;
  let exiting!: Promise<boolean>;
  await act(async () => { exiting = one.exitHost.beforeAccountExit(); await Promise.resolve(); });
  await act(async () => { one.runtime.loadNativeDocument(native); });
  const replacement = one.runtime.exportNativeDocument(), history = one.runtime.editor.getHistoryStats(), records = one.raw();
  await act(async () => { release.resolve(); expect(await write).toBe(false); expect(await exiting).toBe(false); });
  off(); expect(one.runtime.exportNativeDocument()).toEqual(replacement); expect(one.runtime.editor.getHistoryStats()).toEqual(history);
  expect(one.raw()).toEqual(records); expect(one.remote.writes()).toBe(0);
});
it('refuses an old account or disposed runtime instead of acknowledging its retained host', async () => {
  const one = await fixture(); const native = one.runtime.exportNativeDocument();
  await act(async () => root!.render(<ServerWordWorkspace {...one.props} subject="other-account" role="viewer" />));
  expect(await one.exitHost.beforeAccountExit()).toBe(false); expect(one.remote.writes()).toBe(0);
  await act(async () => { root!.unmount(); root = undefined; });
  expect(await one.exitHost.beforeAccountExit()).toBe(false);
  expect(native).toBeDefined();
});
