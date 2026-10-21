// @vitest-environment jsdom
import { act, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { captureProductNavigation, LibraryRevisionConflict, type LibraryEntry, type LibraryKeepOptions, type LibrarySnapshot } from '@barocss/shared';
import { createSampleDeck, deckFileText, deckSlides } from '@barocss/office-slides';
import { DeckAutosave, slideDocuments, slideDrafts } from '../../../packages/office-slides/src/deck-autosave';
import { App, type SlidesServerHost } from '../src/app';
import { createSlidesRuntime, type SlidesRuntime } from '../src/runtime';

const notesCommit = vi.hoisted(() => ({ afterEpoch: Infinity, promise: undefined as Promise<void> | undefined }));
vi.mock('@barocss/office-slides/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('@barocss/office-slides/ui')>();
  return { ...actual, NotesPane: (props: React.ComponentProps<typeof actual.NotesPane>) => {
    if (props.editor && props.editor.dataStore.getDocumentEpoch() >= notesCommit.afterEpoch && notesCommit.promise) throw notesCommit.promise;
    return <actual.NotesPane {...props} />;
  } };
});

let root: Root, host: HTMLDivElement, runtime: SlidesRuntime, session: DeckAutosave | undefined;
let server: SlidesServerHost, mount: (node: HTMLElement) => SlidesRuntime;
const renderApp = () => root.render(<Suspense fallback={<p>Native input commit pending</p>}><App localPersistence={false} server={server} mount={mount} /></Suspense>);
let deliver: ((isCurrent: () => boolean) => Promise<boolean>) | null;
const rangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
const rangeBounds = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
const originals = new Map<string, LibrarySnapshot>(), drafts = new Map<string, LibrarySnapshot>();
const installStore = (store: typeof slideDocuments, records: Map<string, LibrarySnapshot>) => {
  vi.spyOn(store, 'read').mockImplementation(async id => records.get(id));
  vi.spyOn(store, 'rows').mockImplementation(async () => [...records.values()].map(value => value.row));
  vi.spyOn(store, 'keep').mockImplementation(async (entry: LibraryEntry, text: string, options?: LibraryKeepOptions) => {
    const latest = records.get(entry.name);
    if (options && options.expectedRevision !== undefined && options.expectedRevision !== (latest?.row.revision ?? null))
      throw new LibraryRevisionConflict(options.expectedRevision, latest);
    const row = { ...entry, revision: (latest?.row.revision ?? 0) + 1, savedAt: Date.now() };
    records.set(entry.name, { row, text }); return row;
  });
};
beforeEach(async context => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`) });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  originals.clear(); drafts.clear(); deliver = null; notesCommit.afterEpoch = Infinity; notesCommit.promise = undefined;
  installStore(slideDocuments, originals); installStore(slideDrafts, drafts);
  history.replaceState(null, '', '/#slides=original');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const initial = JSON.parse(deckFileText(createSampleDeck())).document;
  server = { active: !context.task.name.includes('staged'), onRuntime: value => { runtime = value; },
    onInputDeliveryReady: (_runtime, value) => { deliver = value; }, onFileAction() {} };
  mount = node => createSlidesRuntime(node, { initialDocument: initial, editable: true });
  await act(async () => renderApp());
  expect(deliver).not.toBeNull();
});
afterEach(async () => {
  session?.stop(); session = undefined;
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  for (const [key, original] of [['getClientRects', rangeRects], ['getBoundingClientRect', rangeBounds]] as const) {
    if (original) Object.defineProperty(Range.prototype, key, original); else Reflect.deleteProperty(Range.prototype, key);
  }
});

it('prepares the actual recovered native after Notes rebinds, while retaining the newer original and exact recovered bytes', async () => {
  const originalText = deckFileText(runtime.editor.exportDocument(), '');
  originals.set('original', { row: { name: 'original', revision: 1, savedAt: 1 }, text: originalText });
  const statuses: string[] = [];
  session = new DeckAutosave(runtime.editor, status => statuses.push(status), async () => {
    if (!await deliver!(() => true)) throw new Error('Native input not ready');
  });
  await act(async () => session!.start());
  // A second writer retained its newer original; this editor's declared native edit must become a conflict draft.
  originals.set('original', { row: { name: 'original', revision: 2, savedAt: 2 }, text: originalText });
  const newer = structuredClone(originals.get('original'));
  const access = { rootId: runtime.editor.getRootId()!, getNode: (id: string) => runtime.editor.dataStore.getNode(id) };
  const box = runtime.editor.dataStore.getChildren(deckSlides(access)[0].sid).find(node => node.stype === 'textFrame')?.sid;
  expect(box).toBeDefined();
  await act(async () => { expect(await runtime.editor.run('setBoxGeometry', { nodeId: box, x: 4321 })).toBe(true); });
  const expected = deckFileText(runtime.editor.exportDocument(), '');
  await act(async () => { expect(await session!.flush()).toBe(true); });
  expect(statuses.at(-1)).toBe('conflict'); expect(drafts.size).toBe(1);
  const draft = [...drafts.values()][0]; expect(draft.text).toBe(expected);
  let releaseCommit!: () => void;
  notesCommit.afterEpoch = runtime.editor.dataStore.getDocumentEpoch() + 1;
  notesCommit.promise = new Promise<void>(resolve => { releaseCommit = resolve; });
  let preparing: Promise<boolean> | undefined, prepared = false;
  const changed = () => {
    const guard = captureProductNavigation();
    if (guard && guard.id !== 'original') preparing = guard.prepare().then(value => { prepared = true; return value; });
  };
  window.addEventListener('wonffice:host-change', changed);
  try {
    await act(async () => {
      expect(await session!.recover(draft.row)).toBe(true);
      expect(preparing).toBeDefined(); expect(prepared).toBe(false);
    });
    await act(async () => { notesCommit.promise = undefined; releaseCommit(); });
    expect(await preparing).toBe(true);
    expect(statuses.at(-1)).toBe('saved'); expect(statuses).not.toContain('save-error');
    const id = session.id; expect(id).not.toBe('original');
    expect(originals.get(id)?.text).toBe(expected);
    expect(deckFileText(runtime.editor.exportDocument(), '')).toBe(expected);
    const history = runtime.editor.getHistoryStats();
    await act(async () => { expect(await captureProductNavigation()!.prepare()).toBe(true); });
    expect(runtime.editor.getHistoryStats()).toEqual(history);
    expect(originals.get('original')).toEqual(newer); expect(drafts.get(draft.row.name)).toEqual(draft);
  } finally { window.removeEventListener('wonffice:host-change', changed); }
});

it('retires a readiness wait on replacement and on native disposal instead of accepting an old callback', async () => {
  const input = deliver!;
  const replacement = JSON.parse(deckFileText(createSampleDeck())).document;
  let current: Promise<boolean> | undefined;
  await act(async () => {
    runtime.loadNativeDocument(replacement);
    let completed = false;
    const pending = input(() => true).then(value => { completed = true; return value; });
    expect(completed).toBe(false);
    runtime.loadNativeDocument(replacement);
    expect(await pending).toBe(false);
    current = input(() => true);
    root.unmount();
  });
  expect(await current).toBe(false);
  root = createRoot(host);
});

it('refuses a pending native readiness wait when actual editing authority retires', async () => {
  const input = deliver!;
  const replacement = JSON.parse(deckFileText(createSampleDeck())).document;
  await act(async () => {
    runtime.loadNativeDocument(replacement);
    const native = deckFileText(runtime.editor.exportDocument(), ''), history = runtime.editor.getHistoryStats();
    const waiting = input(() => true);
    runtime.editor.setEditable(false);
    expect(await waiting).toBe(false);
    expect(deckFileText(runtime.editor.exportDocument(), '')).toBe(native);
    expect(runtime.editor.getHistoryStats()).toEqual(history);
  });
});


it('exports the exact staged native after activation rebinds actual Notes input owners', async () => {
  expect(server.active).toBe(false);
  expect(host.querySelector('.sl-notes-host')).not.toBeNull();
  const before = deckFileText(runtime.exportNativeDocument(), ''), history = runtime.editor.getHistoryStats();
  const sourceRuntime = runtime;
  server = { ...server, active: true };
  await act(async () => renderApp());
  expect(runtime).toBe(sourceRuntime);
  expect(await deliver!(() => true)).toBe(true);
  expect(deckFileText(runtime.exportNativeDocument(), '')).toBe(before);
  expect(runtime.editor.getHistoryStats()).toEqual(history);
  expect(originals.size).toBe(0); expect(drafts.size).toBe(0);
});

it('retires old authority delivery and prepares the exact viewer native with newly registered Notes owners', async () => {
  const before = deckFileText(runtime.exportNativeDocument(), ''), history = runtime.editor.getHistoryStats();
  const sourceRuntime = runtime, sourceInput = deliver!;
  let retired: Promise<boolean> | undefined;
  await act(async () => {
    retired = sourceInput(() => true);
    server = { ...server, readOnly: true };
    runtime.editor.setEditable(false);
    renderApp();
  });
  expect(await retired).toBe(false);
  expect(runtime).toBe(sourceRuntime); expect(runtime.editor.isEditable).toBe(false);
  expect(await deliver!(() => true)).toBe(true);
  expect(deckFileText(runtime.exportNativeDocument(), '')).toBe(before);
  expect(runtime.editor.getHistoryStats()).toEqual(history);
  expect(originals.size).toBe(0); expect(drafts.size).toBe(0);
});
