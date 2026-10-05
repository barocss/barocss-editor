// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { openNote } from '@barocss/office-note';
import { OfficeLocaleProvider } from '@barocss/office-ui';
import { datasetsOf, siteDocuments } from '@barocss/office-site';
import { ServerSiteWorkspace } from '../src/server-workspace';
import { ServerSiteError, type createServerSiteClient } from '../src/server-documents';
import { serverSiteFileText } from '../src/server-file';
import { createServerPendingStore } from '../src/server-pending';
import { type mountSiteRuntime, type SiteRuntime } from '../src/runtime';
import { RowForm, type BodyInputDelivery } from '../src/data-editor';
import { siteNativeFixture } from '../../office/tests/helpers/site-native-fixture';

// Observe actual passive App mounts. This never substitutes native delivery or readiness.
const observed = vi.hoisted(() => ({ runtimes: [] as SiteRuntime[], notes: [] as ReturnType<typeof openNote>[], client: undefined as ReturnType<typeof createServerSiteClient> | undefined }));
vi.mock('../src/runtime', async original => {
  const actual = await original<typeof import('../src/runtime')>();
  return { ...actual, mountSiteRuntime: (...args: Parameters<typeof mountSiteRuntime>) => {
    const runtime = actual.mountSiteRuntime(...args); observed.runtimes.push(runtime); return runtime;
  } };
});
vi.mock('@barocss/office-note', async original => {
  const actual = await original<typeof import('@barocss/office-note')>();
  return { ...actual, openNote: (...args: Parameters<typeof openNote>) => {
    const note = actual.openNote(...args); observed.notes.push(note); return note;
  } };
});
vi.mock('../src/server-documents', async original => {
  const actual = await original<typeof import('../src/server-documents')>();
  return { ...actual, createServerSiteClient: () => observed.client! };
});

const scope = { issuer: 'https://controlled-login.example.test', subject: 'controlled-source-editor',
  tenantId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222' };
const sourceName = 'native-source';
const sourceText = serverSiteFileText(siteNativeFixture(), '');
let root: Root, nestedRoot: Root | undefined;
let writes: number;
const authorizedFetch: typeof fetch = async () => { throw new Error('Unexpected real transport'); };

/** Real library reads use its IndexedDB open/request/transaction path. No storage writes succeed. */
function installReadOnlyStorage() {
  writes = 0;
  const row = Object.freeze({ name: sourceName, title: 'Protected local original', text: sourceText, savedAt: 1, revision: 7 });
  vi.stubGlobal('indexedDB', { open: () => {
    const request: Record<string, unknown> = {};
    const db = { close() {}, transaction: (_store: string, mode: string) => {
      if (mode !== 'readonly') { writes++; throw new Error('Unexpected source write'); }
      const tx: Record<string, unknown> = {};
      tx.objectStore = () => ({ get: (name: string) => read(name === sourceName ? row : undefined), getAll: () => read([row]) });
      function read(result: unknown) {
        const readRequest = { result };
        queueMicrotask(() => (tx.oncomplete as (() => void) | undefined)?.());
        return readRequest;
      }
      return tx;
    } };
    request.result = db; queueMicrotask(() => (request.onsuccess as (() => void) | undefined)?.());
    return request;
  } });
}
function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(one => one.textContent?.trim() === text);
  expect(found, `Actual button: ${text}`).toBeDefined(); return found!;
}
const store = () => createServerPendingStore(scope);
const original = () => observed.runtimes[0];
const nativeState = () => structuredClone({ document: original().exportNativeDocument(), history: original().editor.historyManager.getHistory(), selection: original().editor.selection });

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1024, 768));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  localStorage.clear(); installReadOnlyStorage(); observed.runtimes = []; observed.notes = [];
  observed.client = {
    list: vi.fn(async () => []),
    open: vi.fn(async () => { throw new Error('No server original opened'); }),
    receipt: vi.fn(async () => { throw new ServerSiteError(404, 'receipt_not_found'); }),
    save: vi.fn(async () => { throw new Error('No explicit server confirmation requested'); }),
    confirm: vi.fn(async () => { throw new Error('No server receipt to confirm'); })
  } as unknown as ReturnType<typeof createServerSiteClient>;
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(OfficeLocaleProvider, { children: createElement(ServerSiteWorkspace, { ...scope, authorizedFetch, role: 'editor' }) })));
  await act(async () => button('이 기기의 로컬 문서 목록 확인').click());
  await act(async () => button('Protected local original · 새 서버 사본 준비').click());
  expect(observed.runtimes).toHaveLength(1);
  expect(document.querySelector('.st-shell')).not.toBeNull();
  expect(store().list()).toHaveLength(1);
  const pending = store().list()[0];
  expect(pending.source).toEqual({ kind: 'indexeddb-site', name: sourceName });
  expect(pending.status).toBe('pending');
  expect(pending.attempt?.snapshotText).toBe(sourceText);
});

afterEach(async () => {
  await act(async () => { nestedRoot?.unmount(); nestedRoot = undefined; root.unmount(); });
  document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  Reflect.deleteProperty(Range.prototype, 'getClientRects'); Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
});

it('keeps actual passively mounted IndexedDB source-copy editor readonly before server confirmation', async () => {
  const before = nativeState(), pending = store().list();
  expect(await siteDocuments.text(sourceName)).toBe(sourceText);
  expect(observed.client!.save).not.toHaveBeenCalled();
  expect.soft(original().editor.isEditable).toBe(false);
  const dataset = datasetsOf({ rootId: original().editor.getRootId()!, getNode: id => original().editor.dataStore.getNode(id) }).find(one => one.name === '글')!;
  const payload = { nodeId: dataset.sid!, row: 0, field: '제목', value: 'Unconfirmed local mutation' };
  expect.soft(original().editor.canExecuteCommand('setDatasetCell', payload)).toBe(false);
  await act(async () => { expect.soft(await original().editor.executeCommand('setDatasetCell', payload)).toBe(false); });
  expect.soft(nativeState()).toEqual(before);
  expect(store().list().find(one => one.draftId === pending[0].draftId)).toEqual(pending[0]);
  expect(await siteDocuments.text(sourceName)).toBe(sourceText); expect(writes).toBe(0);
});

it('refuses real nested Note body delivery from the same pending source-copy native writer', async () => {
  const runtime = original(), before = nativeState(), pending = store().list();
  const dataset = datasetsOf({ rootId: runtime.editor.getRootId()!, getNode: id => runtime.editor.dataStore.getNode(id) }).find(one => one.name === '글')!;
  const flushes = new Set<BodyInputDelivery>();
  const container = document.createElement('div'); document.body.append(container); nestedRoot = createRoot(container);
  // Actual native child factory receives the exact mounted host editor, not a synthetic authority.
  await act(async () => nestedRoot!.render(createElement(RowForm, { editor: runtime.editor, revision: 0,
    at: { sid: dataset.sid!, row: 0 }, onClose: () => {},
    run: (name, payload) => runtime.editor.executeCommand(name, payload),
    registerFlush: flush => { flushes.add(flush); return () => flushes.delete(flush); }
  })));
  let body: HTMLElement | undefined, text: Text | undefined;
  for (const candidate of document.querySelectorAll<HTMLElement>('[data-note-body]')) {
    const walker = document.createTreeWalker(candidate, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) if (node.textContent === 'Native body seed') { body = candidate; text = node as Text; break; }
  }
  expect(body).toBeDefined();
  const note = observed.notes.find(one => JSON.stringify(one.editor.exportDocument()).includes('Native body seed'));
  expect(note).toBeDefined();
  expect.soft(note!.editor.isEditable).toBe(false);
  expect.soft(body!.closest('[contenteditable="true"]')).toBeNull();
  expect(text).toBeDefined();
  text!.data += ' rejected';
  const range = document.createRange(); range.setStart(text!, text!.length); range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  body!.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' rejected' }));
  expect(flushes.size).toBe(2);
  let outcomes: PromiseSettledResult<void>[] = [];
  await act(async () => { outcomes = await Promise.allSettled([...flushes].map(delivery => delivery())); });
  expect.soft(outcomes.some(one => one.status === 'rejected')).toBe(true);
  expect.soft(nativeState()).toEqual(before);
  expect(store().list().find(one => one.draftId === pending[0].draftId)).toEqual(pending[0]);
  expect(await siteDocuments.text(sourceName)).toBe(sourceText); expect(writes).toBe(0);
  expect(observed.client!.save).not.toHaveBeenCalled();
});
