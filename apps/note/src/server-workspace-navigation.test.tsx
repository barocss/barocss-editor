// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { captureProductNavigation, productDocumentHost } from '@barocss/shared';
import { serializeNoteFile, readNoteV1SnapshotFile as readNoteSnapshotFile } from '@barocss/office-note/file';
import type { NoteDocument } from '@barocss/office-note/file';
import type { NoteSaveAttempt } from './server-documents';
import { ServerNoteWorkspace } from './server-workspace';

type BoxProps = { children?: ReactNode; onClick?: () => void; disabled?: boolean; actions?: ReactNode; menus?: ReactNode };
type NativeFixture = { editor: { id: string }; close: ReturnType<typeof vi.fn>; change: (content: unknown[]) => void; flush: () => void; retireRoot: () => void };
type ClientFixture = { list: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn>; receipt: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn>; confirm: ReturnType<typeof vi.fn> };
const f = vi.hoisted(() => ({
  sessions: [] as NativeFixture[], client: undefined as unknown as ClientFixture,
  onConstruct: () => {}, onMount: (_id: string) => {}, navigate: vi.fn(),
  delivery: async () => true, failSave: false, failNative: false, saveHold: undefined as Promise<void> | undefined,
}));
vi.mock('@barocss/shared', async original => ({ ...await original<typeof import('@barocss/shared')>(), ...await import('../../../packages/shared/src/document-save/product-host') }));
vi.mock('@barocss/office-ui', async original => {
  const React = await import('react');
  const { useOfficeLocale } = await import('../../../packages/office-ui/src/locale');
  const { AdaptiveWorkspace, WorkspaceSidePanel } = await import('../../../packages/office-ui/src/adaptive-workspace');
  const { DocumentMenu } = await import('../../../packages/office-ui/src/document-bar');
  const Box = ({ children }: BoxProps) => React.createElement('div', {}, children);
  return { ...await original<typeof import('@barocss/office-ui')>(), useOfficeLocale, AdaptiveWorkspace, WorkspaceSidePanel, NavigationItem: ({ children, onClick }: BoxProps) => React.createElement('button', { onClick }, children),
    Button: ({ children, ...props }: React.ComponentPropsWithRef<'button'>) => React.createElement('button', props, children),
    DocumentMenu, EditorHeader: ({ children, actions, menus }: BoxProps) => React.createElement('div', {}, children, menus, actions), StatusIndicator: Box, StatusNotice: Box };
});
vi.mock('@barocss/office-note/view', () => ({ NoteEditor: ({ registerBeforeSnapshot, editor }: { registerBeforeSnapshot: (flush: () => Promise<boolean>) => () => void; editor: { id: string } }) => {
  useEffect(() => { const off = registerBeforeSnapshot(() => f.delivery()); f.onMount(editor.id); return off; }, [registerBeforeSnapshot, editor]);
  return <div data-native-note={editor.id} />;
} }));
vi.mock('@barocss/office-note', async original => ({
  ...await original<typeof import('@barocss/office-note')>(),
  noteTreeOf: (store: { getNode: (id: string) => { content: unknown[] } }) => ({ stype: 'note', content: store.getNode('root').content }),
  openNoteTree: (note: NoteDocument, options: { onChange: (blocks: unknown[]) => void }) => {
    if (f.failNative) throw new Error('native load failed');
    f.onConstruct();
    const node = { ...note, content: structuredClone(note.content) }; let epoch = 1;
    const editor = { id: String(f.sessions.length), getRootId: () => 'root', setEditable: vi.fn(), on: vi.fn(), off: vi.fn(),
      dataStore: { getNode: () => node, getDocumentEpoch: () => epoch } };
    const session = { editor, rootId: 'root', session: editor.id, flush: () => options.onChange(node.content), close: vi.fn(),
      change: (content: unknown[]) => { node.content = content; }, retireRoot: () => { epoch++; } };
    f.sessions.push(session); return session;
  }
}));
vi.mock('./server-documents', async original => {
  const actual = await original<typeof import('./server-documents')>();
  return { ...actual, createServerNoteClient: () => f.client };
});
vi.mock('./server-local-copy', () => ({ ServerLocalNoteCopy: () => null }));
const tenantId = '11111111-1111-4111-8111-111111111111', workspaceId = '22222222-2222-4222-8222-222222222222';
const a = '33333333-3333-4333-8333-333333333333', b = '44444444-4444-4444-8444-444444444444';
const note = (id: string) => ({ stype: 'note' as const, attributes: { title: id, pageId: id },
  content: [{ stype: 'paragraph', attributes: { custom: 'preserved' }, content: [{ stype: 'inline-text', text: 'before', marks: [{ type: 'bold' }] }] }] });
const opened = (id: string, snapshotText = serializeNoteFile(note(id))) => {
  const read = readNoteSnapshotFile(snapshotText); if ('error' in read) throw new Error(read.error);
  return { mode: 'snapshot', document: { documentId: id, tenantId, workspaceId, product: 'note', title: id, revision: 1, pageId: id }, note: read.document, snapshotText };
};
let root: Root, container: HTMLDivElement;
const render = (role: 'editor' | 'viewer' = 'editor', subject = 'A', workspaceNavigation = false) => flushSync(() => root.render(<ServerNoteWorkspace tenantId={tenantId} workspaceId={workspaceId}
  issuer="https://idp.example.test" subject={subject} initialDocumentId={a} authorizedFetch={transport} role={role} workspaceNavigation={workspaceNavigation} onNavigate={f.navigate} />));
const transport: typeof fetch = vi.fn();
async function mounted() { await vi.waitFor(() => expect(productDocumentHost()?.id()).toBe(a)); }
beforeEach(async () => {
  // jsdom lacks CSS.escape. This fixture uses only the fixed ASCII menu id.
  vi.stubGlobal('CSS', { escape: (value: string) => { if (!/^[a-z0-9_-]+$/i.test(value)) throw new Error('unsupported test selector'); return value; } });
  // Layout is verified in Chromium; this fixture only exercises menu ownership.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  localStorage.clear(); f.sessions = []; f.onConstruct = () => {}; f.onMount = () => {}; f.navigate.mockClear(); f.delivery = async () => true; f.failSave = false; f.failNative = false; f.saveHold = undefined;
  f.client = { list: vi.fn(async () => [opened(a).document, opened(b).document]), open: vi.fn(async (id: string) => opened(id)),
    receipt: vi.fn(async () => { const { ServerNoteError } = await import('./server-documents'); throw new ServerNoteError(404, 'missing'); }),
    save: vi.fn(async (attempt: NoteSaveAttempt) => { if (f.saveHold) await f.saveHold; if (f.failSave) throw new Error('lost acknowledgement'); return attempt; }),
    confirm: vi.fn(async (attempt: NoteSaveAttempt) => opened(attempt.operation === 'update' ? attempt.documentId : a, attempt.snapshotText)) };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container); render(); await mounted();
});
afterEach(() => { flushSync(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// Controlled client/native fixture, with the actual mounted workspace and guard.
async function reloadConfirmedSource(sourceText: string) {
  flushSync(() => root.unmount());
  f.sessions = [];
  let stored = sourceText;
  f.client.open.mockImplementation(async (id: string) => opened(id, id === a ? stored : serializeNoteFile(note(id))));
  f.client.save.mockImplementation(async (attempt: NoteSaveAttempt) => {
    if (f.saveHold) await f.saveHold;
    if (f.failSave) throw new Error('lost acknowledgement');
    if (attempt.operation === 'update' && attempt.documentId === a) stored = attempt.snapshotText;
    return attempt;
  });
  for (const call of [f.client.open, f.client.save, f.client.receipt, f.client.confirm]) call.mockClear();
  root = createRoot(container); render(); await mounted();
  return { sourceText: () => stored };
}

it.each(['2026-10-01T00:00:00Z', 'authored source stamp', undefined])('keeps the exact confirmed envelope with savedAt %s on cleared navigation without a write', async savedAt => {
  const original = serializeNoteFile(note(a), { savedAt });
  const stored = await reloadConfirmedSource(original);
  expect(await captureProductNavigation()!.open!(b)).toMatchObject({ id: b });
  expect(stored.sourceText()).toBe(original);
  expect(Object.hasOwn(JSON.parse(stored.sourceText()), 'savedAt')).toBe(savedAt !== undefined);
  expect(f.client.save).not.toHaveBeenCalled();
  expect(f.client.receipt).not.toHaveBeenCalled();
  expect(f.client.confirm).not.toHaveBeenCalled();
  expect(f.client.open.mock.calls.map(call => call[0])).toEqual([a, b]);
});

it('still saves deeply delivered changes from a source with savedAt before navigation', async () => {
  const original = serializeNoteFile(note(a), { savedAt: '2026-10-01T00:00:00Z' });
  const stored = await reloadConfirmedSource(original);
  let deliver!: () => void;
  const content = [{ stype: 'paragraph', attributes: { custom: 'last' },
    content: [{ stype: 'inline-text', text: 'last savedAt source input', marks: [{ type: 'italic' }] }] }];
  f.delivery = () => new Promise<boolean>(resolve => { deliver = () => { f.sessions[0].change(content); resolve(true); }; });
  const task = captureProductNavigation()!.open!(b);
  await vi.waitFor(() => expect(deliver).toBeTypeOf('function'));
  expect(f.client.save).not.toHaveBeenCalled(); expect(stored.sourceText()).toBe(original);
  f.delivery = async () => true; deliver();
  expect(await task).toMatchObject({ id: b });
  expect(f.client.save).toHaveBeenCalledTimes(1); expect(f.client.confirm).toHaveBeenCalledTimes(1);
  const attempt = f.client.save.mock.calls[0][0];
  expect(JSON.parse(attempt.snapshotText).document).toEqual({ ...note(a), content });
  expect(stored.sourceText()).toBe(attempt.snapshotText);
});

it('preserves savedAt source bytes and the fixed failed attempt when navigation save fails', async () => {
  const original = serializeNoteFile(note(a), { savedAt: '2026-10-01T00:00:00Z' });
  const stored = await reloadConfirmedSource(original);
  f.sessions[0].change([{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'failed savedAt source input' }] }]);
  f.failSave = true;
  expect(await captureProductNavigation()!.open!(b)).toBe(false);
  expect(stored.sourceText()).toBe(original); expect(productDocumentHost()?.id()).toBe(a);
  expect(f.client.save).toHaveBeenCalledTimes(1); expect(f.client.confirm).not.toHaveBeenCalled();
  const fixed = structuredClone(f.client.save.mock.calls[0][0]);
  const rows = Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index)!));
  expect(rows.some(value => value && JSON.stringify(JSON.parse(value).attempt) === JSON.stringify(fixed))).toBe(true);
  render('viewer'); await mounted();
  expect(await captureProductNavigation()!.open!(b)).toBe(false);
  expect(f.client.save).toHaveBeenCalledTimes(1); expect(stored.sourceText()).toBe(original);
  expect(Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index)!))).toEqual(rows);
});

it('keeps the exact fixed request and durable rows when account exit settles a failed savedAt source Save', async () => {
  const original = serializeNoteFile(note(a), { savedAt: '2026-10-01T00:00:00Z' });
  const stored = await reloadConfirmedSource(original);
  f.sessions[0].change([{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'held savedAt source input' }] }]);
  flushSync(() => f.sessions[0].flush());
  let release!: () => void; f.saveHold = new Promise<void>(resolve => { release = resolve; });
  f.failSave = true;
  const save = [...container.querySelectorAll<HTMLButtonElement>('button')].find(one => one.textContent === '저장')!;
  await vi.waitFor(() => expect(save.disabled).toBe(false));
  flushSync(() => save.click());
  await vi.waitFor(() => expect(f.client.save).toHaveBeenCalledTimes(1));
  const fixed = structuredClone(f.client.save.mock.calls[0][0]);
  const rows = Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index)!));
  try {
    const exiting = productDocumentHost()!.beforeAccountExit!();
    release();
    expect(await exiting).toBe(true);
    expect(f.client.save).toHaveBeenCalledTimes(1); expect(f.client.save.mock.calls[0][0]).toEqual(fixed);
    expect(f.client.receipt).not.toHaveBeenCalled(); expect(f.client.confirm).not.toHaveBeenCalled();
    expect(stored.sourceText()).toBe(original); expect(productDocumentHost()?.id()).toBe(a);
    expect(Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index)!))).toEqual(rows);
  } finally { release(); }
});

it('returns the exact mounted target witness and retires the old guard', async () => {
  const old = captureProductNavigation()!;
  const installed = await old.open!(b);
  expect(installed && installed.id).toBe(b); expect(installed && installed.isCurrent()).toBe(true);
  expect(old.isCurrent()).toBe(false); expect(f.sessions).toHaveLength(2);
});
it('same-original aliases retain the native session without flushing or reopening', async () => {
  const delivery = vi.fn(async () => true); f.delivery = delivery;
  const guard = captureProductNavigation()!; const session = f.sessions[0];
  expect(await guard.open!(a)).toMatchObject({ id: a });
  expect(f.sessions[0]).toBe(session); expect(f.client.open).toHaveBeenCalledTimes(1); expect(delivery).not.toHaveBeenCalled();
});
it('awaits deepest delivery and saves full nested attributes and marks before opening', async () => {
  let deliver!: () => void;
  f.delivery = () => new Promise<boolean>(resolve => { deliver = () => { f.sessions[0].change([{ stype: 'paragraph', attributes: { custom: 'last' }, content: [{ stype: 'inline-text', text: 'last nested input', marks: [{ type: 'italic' }] }] }]); resolve(true); }; });
  const task = captureProductNavigation()!.open!(b);
  await vi.waitFor(() => expect(deliver).toBeTypeOf('function'));
  expect(f.client.open).toHaveBeenCalledTimes(1);
  f.delivery = async () => true; deliver();
  expect(await task).toMatchObject({ id: b });
  const text = f.client.save.mock.calls[0][0].snapshotText;
  expect(text).toContain('last nested input'); expect(text).toContain('italic'); expect(text).toContain('custom');
});
it('refuses unfinished nested delivery and keeps the current native session', async () => {
  f.delivery = async () => false;
  const session = f.sessions[0]; expect(await captureProductNavigation()!.open!(b)).toBe(false);
  expect(f.sessions).toHaveLength(1); expect(f.sessions[0]).toBe(session); expect(productDocumentHost()?.id()).toBe(a);
});
it('rejects a changed native epoch during a delayed deepest delivery', async () => {
  let done!: (value: boolean) => void; f.delivery = () => new Promise(resolve => { done = resolve; });
  const task = captureProductNavigation()!.open!(b); await vi.waitFor(() => expect(done).toBeTypeOf('function'));
  f.sessions[0].retireRoot(); done(true); expect(await task).toBe(false); expect(f.client.open).toHaveBeenCalledTimes(1);
});
it('rejects duplicate in-flight opens and a retired account ABA callback', async () => {
  let done!: (value: boolean) => void; f.delivery = () => new Promise(resolve => { done = resolve; });
  const old = captureProductNavigation()!, first = old.open!(b);
  await vi.waitFor(() => expect(done).toBeTypeOf('function'));
  expect(await old.open!(b)).toBe(false);
  render('editor', 'B'); await mounted(); render('editor', 'A'); await mounted(); done(true);
  expect(await first).toBe(false); expect(await old.open!(b)).toBe(false);
});
it('retains a failed fixed request and retries the same key and bytes', async () => {
  f.sessions[0].change([{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'durable' }] }]);
  f.failSave = true; expect(await captureProductNavigation()!.open!(b)).toBe(false);
  const first = f.client.save.mock.calls[0][0]; expect(productDocumentHost()?.id()).toBe(a);
  f.failSave = false; expect(await captureProductNavigation()!.open!(b)).toMatchObject({ id: b });
  expect(f.client.save.mock.calls[1][0]).toEqual(first); expect(f.client.receipt).toHaveBeenCalled();
});
it('refuses viewer native changes without writing', async () => {
  render('viewer'); await mounted(); f.sessions.at(-1)!.change([{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'unexpected' }] }]);
  expect(await captureProductNavigation()!.open!(b)).toBe(false); expect(f.client.save).not.toHaveBeenCalled();
});

it('does not send or navigate when pending protection fails', async () => {
  f.sessions[0].change([{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'unprotected' }] }]);
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
  expect(await captureProductNavigation()!.open!(b)).toBe(false);
  expect(f.client.save).not.toHaveBeenCalled(); expect(productDocumentHost()?.id()).toBe(a);
  expect(f.sessions).toHaveLength(1); write.mockRestore();
});
it('awaits an actual pending save before proceeding to target load', async () => {
  f.sessions[0].change([{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'held save' }] }]);
  let finish!: () => void; f.saveHold = new Promise<void>(resolve => { finish = resolve; });
  const task = captureProductNavigation()!.open!(b);
  await vi.waitFor(() => expect(f.client.save).toHaveBeenCalledTimes(1));
  expect(f.client.open).toHaveBeenCalledTimes(1); expect(productDocumentHost()?.id()).toBe(a);
  finish(); expect(await task).toMatchObject({ id: b });
});
it('refuses target installation after authority ABA during delayed load', async () => {
  let finish!: (value: ReturnType<typeof opened>) => void;
  f.client.open.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const old = captureProductNavigation()!, task = old.open!(b);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  render('viewer'); await mounted(); render('editor'); await mounted(); finish(opened(b));
  expect(await task).toBe(false); expect(productDocumentHost()?.id()).toBe(a); expect(old.isCurrent()).toBe(false);
});
it('refuses a target when native bytes change after preparation', async () => {
  let finish!: (value: ReturnType<typeof opened>) => void;
  f.client.open.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const task = captureProductNavigation()!.open!(b); await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  f.sessions[0].change([{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'later native input' }] }]);
  finish(opened(b)); expect(await task).toBe(false); expect(productDocumentHost()?.id()).toBe(a);
});

it('preserves the original native session when target native construction fails', async () => {
  const native = f.sessions[0]; f.failNative = true;
  expect(await captureProductNavigation()!.open!(b)).toBe(false);
  expect(productDocumentHost()?.id()).toBe(a); expect(f.sessions).toHaveLength(1); expect(f.sessions[0]).toBe(native);
});
it('retires a held writer target-open token and permits a fresh viewer open before the old response', async () => {
  let finish!: (value: ReturnType<typeof opened>) => void;
  f.client.open.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const old = captureProductNavigation()!, held = old.open!(b);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  render('viewer'); await mounted();
  const next = await captureProductNavigation()!.open!(b);
  expect(next).toMatchObject({ id: b });
  expect(next && next.isCurrent()).toBe(true);
  finish(opened(b)); expect(await held).toBe(false);
  expect(productDocumentHost()?.id()).toBe(b);
});

it('rechecks parent intent after held target loading before native installation', async () => {
  let finish!: (value: ReturnType<typeof opened>) => void, current = true;
  f.client.open.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  f.navigate.mockClear();
  const task = captureProductNavigation()!.open!(b, () => current);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  current = false; finish(opened(b)); expect(await task).toBe(false);
  expect(productDocumentHost()?.id()).toBe(a); expect(f.sessions).toHaveLength(1); expect(f.navigate).not.toHaveBeenCalled();
});
it('rechecks parent intent after native construction and preserves the installed original', async () => {
  let current = true; f.onConstruct = () => { current = false; }; f.navigate.mockClear();
  expect(await captureProductNavigation()!.open!(b, () => current)).toBe(false);
  expect(productDocumentHost()?.id()).toBe(a); expect(f.sessions[1].close).toHaveBeenCalled(); expect(f.navigate).not.toHaveBeenCalled();
});
it('rechecks standalone parent intent at installation completion before navigation callback', async () => {
  let current = true; f.navigate.mockClear(); f.onMount = id => { if (id !== '0') current = false; };
  expect(await captureProductNavigation()!.open!(b, () => current)).toBe(false);
  expect(f.navigate).not.toHaveBeenCalled();
});
it('does not publish navigation when parent intent retires after witness resolution', async () => {
  let current = true; f.navigate.mockClear();
  f.onMount = id => { if (id !== '0') queueMicrotask(() => { current = false; }); };
  expect(await captureProductNavigation()!.open!(b, () => current)).toBe(false);
  expect(productDocumentHost()?.id()).toBe(b); expect(f.navigate).not.toHaveBeenCalled();
});
it('role retirement preserves the separate in-flight save and its frozen recovery envelope', async () => {
  f.sessions[0].change([{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'fixed pending input' }] }]);
  let finish!: () => void; f.saveHold = new Promise<void>(resolve => { finish = resolve; });
  const old = captureProductNavigation()!.open!(b);
  await vi.waitFor(() => expect(f.client.save).toHaveBeenCalledTimes(1));
  const records = Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index)!));
  expect(records.some(value => value?.includes('fixed pending input'))).toBe(true);
  render('viewer'); await mounted();
  let settled = false;
  const fresh = captureProductNavigation()!.open!(b); void fresh.then(() => { settled = true; });
  await Promise.resolve(); await Promise.resolve();
  expect(settled).toBe(false);
  expect(f.client.save).toHaveBeenCalledTimes(1); expect(f.client.open).toHaveBeenCalledTimes(1);
  expect(Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index)!))).toEqual(records);
  finish(); expect(await old).toBe(false); expect(await fresh).toBe(false); expect(f.client.confirm).not.toHaveBeenCalled();
  expect(productDocumentHost()?.id()).toBe(a);
});

it.each([1200, 600])('keeps optional native document actions closed at width %s with the outer tree', async width => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
  render('editor', 'A', true); await mounted();
  flushSync(() => window.dispatchEvent(new Event('resize')));
  expect(container.querySelector('.office-adaptive-workspace')?.hasAttribute('data-compact')).toBe(width < 960);
  const panel = container.querySelector<HTMLElement>('[data-workspace-panel="navigation"]')!;
  const toggle = container.querySelector<HTMLButtonElement>('[data-menu="document"]')!;
  expect(panel.hidden).toBe(true); expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(container.querySelector('[aria-label="서버 문서 목록"]')).toBeNull();
  expect(container.textContent).not.toContain('목록 새로고침');
  expect(container.querySelector('[aria-label="문서 작업"]')?.textContent).toContain('새 노트');
  expect(container.querySelector('.office-workspace-panel-controls')).toBeNull();
  const openActions = () => {
    flushSync(() => toggle.click());
    const item = document.querySelector<HTMLButtonElement>('[data-menu-item="document-actions"]')!;
    expect(item.textContent).toContain('문서 작업'); expect(item.getAttribute('aria-checked')).toBe('false');
    flushSync(() => item.click());
  };
  openActions(); expect(panel.hidden).toBe(false);
  flushSync(() => panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(panel.hidden).toBe(true); expect(document.activeElement).toBe(toggle);
  openActions();
  const newNote = [...panel.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '새 노트')!;
  flushSync(() => newNote.click());
  await vi.waitFor(() => expect(panel.hidden).toBe(true));
  expect(container.querySelector('[data-native-note]')).not.toBeNull();
});
it('keeps standalone discovery and native find/outline separate from workspace document actions', async () => {
  expect(container.querySelector('[aria-label="서버 문서 목록"]')).not.toBeNull();
  expect(container.textContent).toContain('목록 새로고침');
  expect(container.querySelector('[aria-label="서버 문서 목록"]')?.textContent).toContain(b);
});

it('refreshes the authorized tree after a current Note save is confirmed and installed', async () => {
  const refresh = vi.fn(); window.addEventListener('wonffice:catalog-refresh', refresh);
  try {
    f.sessions[0].change([{ stype: 'paragraph', attributes: { custom: 'retained' },
      content: [{ stype: 'inline-text', text: 'confirmed new input', marks: [{ type: 'italic' }] }] }]);
    flushSync(() => f.sessions[0].flush());
    const save = [...container.querySelectorAll<HTMLButtonElement>('button')].find(one => one.textContent === '저장')!;
    await vi.waitFor(() => expect(save.disabled).toBe(false));
    flushSync(() => save.click());
    await vi.waitFor(() => expect(f.client.confirm).toHaveBeenCalledTimes(1));
    expect(productDocumentHost()?.id()).toBe(a);
    expect(f.client.save).toHaveBeenCalledTimes(1);
    expect(f.client.save.mock.calls[0][0].snapshotText).toContain('confirmed new input');
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  } finally { window.removeEventListener('wonffice:catalog-refresh', refresh); }
});

it('does not refresh the tree while a save is pending or after its delivery fails', async () => {
  const refresh = vi.fn(); window.addEventListener('wonffice:catalog-refresh', refresh);
  try {
    f.sessions[0].change([{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'held input' }] }]);
    let release!: () => void; f.saveHold = new Promise<void>(resolve => { release = resolve; });
    f.failSave = true;
    const opening = captureProductNavigation()!.open!(b);
    await vi.waitFor(() => expect(f.client.save).toHaveBeenCalledTimes(1));
    expect(f.client.confirm).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
    release(); expect(await opening).toBe(false);
    expect(f.client.confirm).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
    expect(productDocumentHost()?.id()).toBe(a);
  } finally { window.removeEventListener('wonffice:catalog-refresh', refresh); }
});

it('does not refresh the tree from a late confirmation after account and role retirement', async () => {
  const refresh = vi.fn(); window.addEventListener('wonffice:catalog-refresh', refresh);
  try {
    let release!: (value: ReturnType<typeof opened>) => void;
    f.client.confirm.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    f.sessions[0].change([{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'retired input' }] }]);
    const opening = captureProductNavigation()!.open!(b);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(refresh).not.toHaveBeenCalled();
    render('viewer', 'B'); await mounted(); render('editor', 'A'); await mounted();
    release(opened(a, f.client.save.mock.calls[0][0].snapshotText));
    expect(await opening).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  } finally { window.removeEventListener('wonffice:catalog-refresh', refresh); }
});

it('does not refresh the tree from a late confirmation after the native root retires', async () => {
  const refresh = vi.fn(); window.addEventListener('wonffice:catalog-refresh', refresh);
  try {
    let release!: (value: ReturnType<typeof opened>) => void;
    f.client.confirm.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    f.sessions[0].change([{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'retired root input' }] }]);
    const opening = captureProductNavigation()!.open!(b);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(refresh).not.toHaveBeenCalled();
    f.sessions[0].retireRoot(); release(opened(a, f.client.save.mock.calls[0][0].snapshotText));
    expect(await opening).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  } finally { window.removeEventListener('wonffice:catalog-refresh', refresh); }
});
