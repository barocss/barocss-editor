// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readNoteV1SnapshotFile, serializeNoteFile, type NoteDocument } from '@barocss/office-note/file';
import { NATIVE_NOTE_FIXTURES } from './native2-scenario-fixtures';
import { createExperimentalNative2NoteReader } from './experimental-native2-reader';
import { ServerNoteWorkspace } from './server-workspace';
import type { NoteSaveAttempt } from './server-documents';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const sourceId = '11111111-1111-4111-8111-111111111111';
const targetId = '33333333-3333-4333-8333-333333333333';
const note: NoteDocument = { stype: 'note', attributes: { title: 'Mounted legacy source', pageId: sourceId },
  content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Original retained body' }] }] };
const fixtures = vi.hoisted(() => ({ client: undefined as unknown as {
  list: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn>;
  receipt: ReturnType<typeof vi.fn>; confirm: ReturnType<typeof vi.fn>;
} }));
vi.mock('./server-documents', async original => ({ ...await original<typeof import('./server-documents')>(),
  createServerNoteClient: () => fixtures.client }));

const opened = (snapshotText: string) => {
  const parsed = readNoteV1SnapshotFile(snapshotText);
  if ('error' in parsed) throw new Error(parsed.error);
  return { mode: 'snapshot', document: { documentId: sourceId, tenantId, workspaceId, product: 'note',
    title: 'Mounted legacy source', revision: 1, pageId: sourceId }, note: parsed.document, snapshotText };
};

async function targetRead() {
  const original = NATIVE_NOTE_FIXTURES.SOURCE_B;
  const snapshotText = JSON.stringify(original);
  const snapshotHash = createHash('sha256').update(snapshotText).digest('hex');
  const document = { documentId: targetId, tenantId, workspaceId, product: 'note', title: 'Pinned B',
    creatorUserId: null, metadataRevision: 1, mode: 'snapshot', pageId: original.document.attributes.pageId,
    documentKey: `wonffice-${tenantId}-${targetId}`, fileFormat: 'barocss-note', fileVersion: 2, revision: 2, snapshotHash };
  const responses = [Response.json({ document, snapshotText }), Response.json({ status: 'pinned', documentId: targetId,
    documentRevision: 2, snapshotHash, nativeFormat: { format: 'barocss-note', version: 2 }, bundle: original.schemaBundle })];
  const requests: string[] = [];
  const reader = createExperimentalNative2NoteReader({ tenantId, workspaceId, apiBase: '/controlled-native2',
    isCurrent: () => true, authorizedFetch: async (_input, init) => {
      requests.push(init?.method ?? 'GET');
      const response = responses.shift();
      if (!response) throw new Error('Unexpected controlled request');
      return response;
    } });
  return { read: await reader.open(targetId), requests };
}

let root: Root, host: HTMLDivElement;
let original = serializeNoteFile(note);
let subject = 'controlled-subject', authorized = true, epoch = 1;
const listeners = new Set<() => void>();
const fetcher = vi.fn() as unknown as typeof fetch;
const openFactory = vi.fn();
function readLifetime() {
  let current = true;
  const callbacks = new Set<() => void>();
  return {
    isCurrent: () => current,
    retire: () => {
      if (!current) return;
      current = false;
      for (const callback of [...callbacks]) callback();
      callbacks.clear();
    },
    subscribeRetirement: (callback: () => void) => {
      if (!current) callback();
      else callbacks.add(callback);
      return () => { callbacks.delete(callback); };
    },
    listenerCount: () => callbacks.size,
  };
}
const render = () => root.render(<ServerNoteWorkspace tenantId={tenantId} workspaceId={workspaceId}
  issuer="controlled-issuer" subject={subject} currentUserId={null} initialDocumentId={sourceId}
  authorizedFetch={fetcher} role="editor" authorityEpoch={epoch} isAuthorized={() => authorized}
  subscribeAuthority={retire => { listeners.add(retire); return () => { listeners.delete(retire); }; }}
  createNative2ReadLease={openFactory} />);

async function setTarget() {
  const input = host.querySelector<HTMLInputElement>('input[aria-label="읽을 native2 문서 ID"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, targetId);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(input.value).toBe(targetId);
}
async function readClick() {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(one => one.textContent === '읽기 전용으로 확인')!;
  await act(async () => { button.click(); });
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  localStorage.clear(); original = serializeNoteFile(note); subject = 'controlled-subject'; authorized = true; epoch = 1;
  listeners.clear(); openFactory.mockReset();
  fixtures.client = { list: vi.fn(async () => [opened(original).document]), open: vi.fn(async () => opened(original)),
    save: vi.fn(async (attempt: NoteSaveAttempt) => attempt), receipt: vi.fn(), confirm: vi.fn() };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { render(); });
  await vi.waitFor(() => expect(host.querySelector('.on-doc p')?.textContent).toBe('Original retained body'));
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); listeners.clear(); vi.unstubAllGlobals(); localStorage.clear();
});

it('opens an exact supported B in a second readonly Note view and closes only that view', async () => {
  const prepared = await targetRead();
  const factoryLife = readLifetime(), resultLife = readLifetime();
  factoryLife.subscribeRetirement(resultLife.retire);
  const factory = { ...factoryLife, open: vi.fn(async () => ({ ...resultLife, read: prepared.read,
    provenance: { issuer: 'controlled-issuer', subject, currentUserId: null, tenantId, workspaceId,
      documentId: targetId, role: 'editor' as const } })) };
  openFactory.mockResolvedValue(factory);
  const source = host.querySelector<HTMLElement>('.nw-document')!;
  const sourceText = source.textContent, stored = original;
  const storage = localStorage.length;
  const sourceEditor = source.querySelector<HTMLElement>('[data-note-editor]')!;
  const sourceParagraph = source.querySelector('.on-doc p')!;
  const sourceLeaf = document.createTreeWalker(sourceParagraph, NodeFilter.SHOW_TEXT).nextNode()!;
  sourceEditor.tabIndex = -1; sourceEditor.focus(); sourceEditor.scrollTop = 23;
  const range = document.createRange(); range.setStart(sourceLeaf, 0); range.setEnd(sourceLeaf, 8);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  const focusBefore = document.activeElement, rangeBefore = selection.getRangeAt(0).cloneRange();
  await setTarget(); await readClick();
  expect(openFactory).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(host.querySelector('[data-native2-stage]')).not.toBeNull());
  const staged = host.querySelector<HTMLElement>('[data-native2-stage]')!;
  expect(staged.textContent).toContain('읽기 전용 문서');
  expect(staged.textContent).toContain('검토 B');
  expect(staged.querySelector('[data-note-editor]')?.getAttribute('data-note-editable')).toBe('false');
  expect(source.isConnected).toBe(true);
  expect(source.textContent).toBe(sourceText);
  expect(sourceEditor.scrollTop).toBe(23);
  expect(document.activeElement).toBe(focusBefore);
  expect(selection.rangeCount).toBe(1);
  expect(selection.getRangeAt(0).toString()).toBe(rangeBefore.toString());
  expect(original).toBe(stored);
  expect(factory.open).toHaveBeenCalledWith({ tenantId, workspaceId, documentId: targetId });
  expect(prepared.requests).toEqual(['GET', 'GET']);
  expect(fixtures.client.save).not.toHaveBeenCalled();
  expect(fixtures.client.receipt).not.toHaveBeenCalled();
  expect(fixtures.client.confirm).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(storage);
  await act(async () => { staged.querySelector<HTMLButtonElement>('button')!.click(); });
  expect(host.querySelector('[data-native2-stage]')).toBeNull();
  expect(source.isConnected).toBe(true);
  expect(factoryLife.isCurrent()).toBe(false);
  expect(resultLife.isCurrent()).toBe(false);
});

it('refuses nonexact legacy source bytes before opening an authenticated factory', async () => {
  const parsed = JSON.parse(serializeNoteFile(note));
  original = JSON.stringify(parsed, null, 2);
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => { render(); });
  await vi.waitFor(() => expect(host.querySelector('.on-doc p')?.textContent).toBe('Original retained body'));
  await setTarget(); await readClick();
  expect(openFactory).not.toHaveBeenCalled();
  expect(host.querySelector('[data-native2-stage]')).toBeNull();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('원본 상태');
  expect(fixtures.client.save).not.toHaveBeenCalled();
});

it('refuses a composing source without flushing or acknowledging the input', async () => {
  await setTarget();
  const paragraph = host.querySelector('.nw-document .on-doc p')!;
  await act(async () => { paragraph.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
  await readClick();
  expect(openFactory).not.toHaveBeenCalled();
  expect(host.querySelector('[data-native2-stage]')).toBeNull();
  expect(host.querySelector('.nw-document .on-doc p')?.textContent).toBe('Original retained body');
  expect(fixtures.client.save).not.toHaveBeenCalled();
  await act(async () => { paragraph.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); });
});

it('retires a visible stage after observed authority loss and keeps the source mounted', async () => {
  const prepared = await targetRead();
  const lifetime = readLifetime();
  const factory = { ...lifetime, open: vi.fn(async () => ({ ...lifetime, read: prepared.read,
    provenance: { issuer: 'controlled-issuer', subject, currentUserId: null, tenantId, workspaceId,
      documentId: targetId, role: 'viewer' as const } })) };
  openFactory.mockResolvedValue(factory);
  await setTarget(); await readClick();
  expect(openFactory).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(host.querySelector('[data-native2-stage]')).not.toBeNull());
  authorized = false; epoch++;
  await act(async () => { for (const retire of [...listeners]) retire(); render(); });
  expect(host.querySelector('[data-native2-stage]')).toBeNull();
  expect(lifetime.isCurrent()).toBe(false);
  expect(host.querySelector('.nw-document .on-doc p')?.textContent).toBe('Original retained body');
  expect(fixtures.client.save).not.toHaveBeenCalled();
});

it('retires a late factory after an observed account ABA without displaying its result', async () => {
  const prepared = await targetRead();
  let release!: (value: typeof factory) => void;
  const lifetime = readLifetime();
  const factory = { ...lifetime, open: vi.fn(async () => ({ ...lifetime, read: prepared.read,
    provenance: { issuer: 'controlled-issuer', subject: 'controlled-subject', currentUserId: null,
      tenantId, workspaceId, documentId: targetId, role: 'editor' as const } })) };
  openFactory.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  await setTarget(); await readClick();
  expect(openFactory).toHaveBeenCalledTimes(1);
  subject = 'other-subject'; await act(async () => { render(); });
  subject = 'controlled-subject'; await act(async () => { render(); });
  await act(async () => { release(factory); });
  expect(factory.open).not.toHaveBeenCalled();
  expect(lifetime.isCurrent()).toBe(false);
  expect(host.querySelector('[data-native2-stage]')).toBeNull();
  expect(host.querySelector('.nw-document .on-doc p')?.textContent).toBe('Original retained body');
  expect(fixtures.client.save).not.toHaveBeenCalled();
});

for (const retiredOwner of ['factory', 'result'] as const) {
  it(`removes a visible stage on ${retiredOwner} retirement without a source event or host rerender`, async () => {
    const prepared = await targetRead();
    const factoryLife = readLifetime(), resultLife = readLifetime();
    factoryLife.subscribeRetirement(resultLife.retire);
    const factory = { ...factoryLife, open: vi.fn(async () => ({ ...resultLife, read: prepared.read,
      provenance: { issuer: 'controlled-issuer', subject, currentUserId: null, tenantId, workspaceId,
        documentId: targetId, role: 'editor' as const } })) };
    openFactory.mockResolvedValue(factory);
    const source = host.querySelector<HTMLElement>('.nw-document')!;
    const sourceEditor = source.querySelector<HTMLElement>('[data-note-editor]')!;
    sourceEditor.tabIndex = -1; sourceEditor.focus(); sourceEditor.scrollTop = 31;
    const leaf = document.createTreeWalker(source.querySelector('.on-doc p')!, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange(); range.setStart(leaf, 0); range.setEnd(leaf, 8);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    const selected = range.toString();
    const focus = document.activeElement, text = source.textContent, storage = localStorage.length;
    await setTarget(); await readClick();
    await vi.waitFor(() => expect(host.querySelector('[data-native2-stage]')).not.toBeNull());
    // This terminal signal is the captured read's own lifetime. No prop, source
    // content event or host-authority notification causes a React render here.
    await act(async () => { (retiredOwner === 'factory' ? factoryLife : resultLife).retire(); });
    expect(host.querySelector('[data-native2-stage]')).toBeNull();
    expect(source.isConnected).toBe(true);
    expect(source.textContent).toBe(text);
    expect(sourceEditor.scrollTop).toBe(31);
    expect(document.activeElement).toBe(focus);
    expect(selection.rangeCount).toBe(1);
    expect(selection.getRangeAt(0).toString()).toBe(selected);
    expect(selection.getRangeAt(0).startContainer).toBe(leaf);
    expect(original).toBe(serializeNoteFile(note));
    expect(localStorage.length).toBe(storage);
    expect(fixtures.client.save).not.toHaveBeenCalled();
    expect(fixtures.client.receipt).not.toHaveBeenCalled();
    expect(fixtures.client.confirm).not.toHaveBeenCalled();
    expect(resultLife.listenerCount()).toBe(0);
  });
}
