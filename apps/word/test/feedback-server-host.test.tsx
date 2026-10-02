import { act, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { productDocumentHost, prepareProductNavigation } from '@barocss/shared';
import { createStarterDocument } from '@barocss/office-word';
import { registerPreCommitGuard } from '@barocss/model';
import type { WordRuntime } from '../src/runtime';
import { serverWordFileText, WORD_FORMAT, WORD_FILE_VERSION } from '../src/server-file';
import type { ServerWordHead } from '../src/server-documents';
import type { App } from '../src/app';
type AppProps = Parameters<typeof App>[0];
import { ServerWordWorkspace, type ServerWordWorkspaceProps } from '../src/server-workspace';

// Exercise the real native runtime, save client, and host lifecycle without unrelated editor chrome.
const bridge = vi.hoisted(() => ({ runtime: undefined as WordRuntime | undefined }));
vi.mock('../src/app', () => ({ App: ({ mount, server }: AppProps) => {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const runtime = mount!(host.current!);
    bridge.runtime = runtime; server!.onRuntime(runtime);
    return () => { runtime.dispose(); if (bridge.runtime === runtime) bridge.runtime = undefined; };
  }, [mount]);
  return <div ref={host} />;
} }));
const tenantId = '10000000-0000-4000-8000-000000000001';
const workspaceId = '20000000-0000-4000-8000-000000000002';
const documentId = '30000000-0000-4000-8000-000000000003';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
let root: Root | undefined, container: HTMLDivElement;
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`) });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root?.unmount()); container.remove(); vi.unstubAllGlobals(); });
function transport() {
  let text = serverWordFileText(createStarterDocument(), '');
  let head: ServerWordHead = { documentId, tenantId, workspaceId, product: 'word', title: 'Review', metadataRevision: 1,
    mode: 'snapshot', pageId: null, documentKey: 'word-review', fileFormat: WORD_FORMAT, fileVersion: WORD_FILE_VERSION,
    revision: 1, snapshotHash: digest(text) };
  let denied = false, puts = 0;
  const authorizedFetch = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (denied) return Response.json({ status: 'forbidden' }, { status: 403 });
    if (url.includes('/receipts/')) return Response.json({ status: 'not_found' }, { status: 404 });
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { expectedRevision: number; snapshotText: string; idempotencyKey: string };
      expect(body.expectedRevision).toBe(head.revision); puts += 1; text = body.snapshotText;
      head = { ...head, revision: head.revision + 1, snapshotHash: digest(text) };
      return Response.json({ operation: 'update', idempotencyKey: body.idempotencyKey,
        requestHash: digest(JSON.stringify(['update', documentId, body.expectedRevision, text])), document: head, snapshotText: text });
    }
    if (url.includes('/documents?')) return Response.json({ documents: [head], nextCursor: null });
    return Response.json({ document: head, snapshotText: text });
  });
  return { authorizedFetch, deny: () => { denied = true; }, text: () => text, puts: () => puts };
}
async function fixture(role: ServerWordWorkspaceProps['role'] = 'editor') {
  const remote = transport();
  const props: ServerWordWorkspaceProps = { tenantId, workspaceId, issuer: 'local-test', subject: 'writer',
    initialDocumentId: documentId, role, authorizedFetch: remote.authorizedFetch };
  await act(async () => { root!.render(<ServerWordWorkspace {...props} />); });
  await act(async () => { await vi.waitFor(() => expect(bridge.runtime).toBeDefined()); });
  expect(productDocumentHost()?.id()).toBe(documentId);
  const runtime = bridge.runtime!;
  const run = [...runtime.editor.dataStore.getNodes().values()].find(node => node.stype === 'inline-text')!;
  runtime.editor.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 0, collapsed: true });
  return { remote, props, runtime };
}
it('registers the actual server document and lets an unchanged viewer leave without a write', async () => {
  const { remote, runtime } = await fixture('viewer');
  expect(runtime.editor.isEditable).toBe(false);
  let result = false;
  await act(async () => { result = await prepareProductNavigation(); });
  expect(result).toBe(true); expect(remote.puts()).toBe(0);
});
it('waits for entered native input, confirms its exact bytes, and refuses a retired host', async () => {
  const { remote, runtime } = await fixture();
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const off = registerPreCommitGuard(runtime.editor, async () => { enter(); await gate; });
  const write = runtime.editor.run('insertText', { text: '저장할 마지막 입력' });
  await entered;
  const heldHost = productDocumentHost()!;
  let done = false, result = false;
  await act(async () => {
    const flush = prepareProductNavigation().then(value => { result = value; done = true; });
    await Promise.resolve(); expect(done).toBe(false); expect(remote.puts()).toBe(0); release();
    await write; await flush;
  });
  off();
  expect(result).toBe(true); expect(remote.puts()).toBe(1);
  expect(JSON.parse(remote.text()).document).toEqual(runtime.exportNativeDocument());
  expect(remote.text()).toContain('저장할 마지막 입력');
  await act(async () => { root!.unmount(); root = undefined; });
  expect(await heldHost.beforeNavigate()).toBe(false); expect(heldHost.id()).toBe('');
});
it('keeps the native draft when server authority rejects saving', async () => {
  const { remote, runtime } = await fixture();
  await act(async () => { expect(await runtime.editor.run('insertText', { text: '보존할 초안' })).toBe(true); });
  const native = runtime.exportNativeDocument(); remote.deny();
  let result = true;
  await act(async () => { result = await prepareProductNavigation(); });
  expect(result).toBe(false); expect(remote.puts()).toBe(0);
  const records = Object.values(localStorage).map(value => JSON.parse(value) as { snapshotText?: string });
  expect(records.some(record => record.snapshotText && JSON.stringify(JSON.parse(record.snapshotText).document) === JSON.stringify(native))).toBe(true);
});
it('refuses a host from the previous authenticated account', async () => {
  const { props } = await fixture();
  const previous = productDocumentHost()!;
  await act(async () => { root!.render(<ServerWordWorkspace {...props} subject="other-account" role="viewer" />); });
  await act(async () => { await vi.waitFor(() => expect(productDocumentHost()).not.toBe(previous)); });
  expect(previous.id()).toBe(''); expect(await previous.beforeNavigate()).toBe(false);
});
