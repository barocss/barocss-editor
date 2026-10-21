// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { captureProductNavigation, productDocumentHost, registerProductReplacementPreparation } from '@barocss/shared';
import { noteTreeOf, openNoteTree, type NoteSession } from '@barocss/office-note';
import { serializeNoteFile } from '@barocss/office-note/file';
import { Workspace } from './workspace';

const f = vi.hoisted(() => ({
  library: {} as Record<string, unknown>, recovery: {} as Record<string, unknown>,
  native: undefined as NoteSession['editor'] | undefined, delivery: async () => true,
  readyGate: undefined as Promise<void> | undefined
}));
vi.mock('@barocss/shared', async original => ({ ...await original<typeof import('@barocss/shared')>(), documentLibrary: () => f.recovery }));
vi.mock('@barocss/office-note', async original => ({ ...await original<typeof import('@barocss/office-note')>(), noteLibrary: f.library }));
vi.mock('./workspace-backup-ui', () => ({ WorkspaceBackupControls: () => null }));
vi.mock('@barocss/office-ui', () => {
  type Props = { children?: ReactNode; actions?: ReactNode; onClick?: () => void; 'aria-label'?: string; className?: string };
  const Box = ({ children, className }: Props) => <div className={className}>{children}</div>;
  return { useOfficeLocale: () => ({ t: (key: string) => key }), AdaptiveWorkspace: Box, WorkspaceSidePanel: Box,
    PanelHeader: Box, EmptyState: Box, StatusNotice: Box, StatusIndicator: Box, Icon: () => null, Dialog: () => null, Choice: Box,
    EditorHeader: ({ actions }: Props) => <div>{actions}</div>, DocumentMenu: () => null,
    Button: ({ children, onClick }: Props) => <button onClick={onClick}>{children}</button>, IconButton: () => null,
    NavigationItem: ({ children, onClick, 'aria-label': label }: Props) => <button aria-label={label} onClick={onClick}>{children}</button>,
    TextField: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <input value={value} onChange={event => onChange(event.target.value)} /> };
});
vi.mock('@barocss/office-note/view', () => ({ NoteEditor: ({ editor, rootId, registerBeforeSnapshot }: {
  editor: NoteSession['editor']; rootId: string; registerBeforeSnapshot: (flush: () => Promise<boolean>) => () => void;
}) => {
  useEffect(() => {
    let retired = false, unregister: (() => void) | undefined;
    const ready = () => { if (!retired) { f.native = editor; unregister = registerBeforeSnapshot(() => f.delivery()); } };
    if (f.readyGate) void f.readyGate.then(ready); else ready();
    return () => { retired = true; unregister?.(); };
  }, [editor, registerBeforeSnapshot]);
  return <div data-mounted-native-root={rootId} />;
} }));

const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const document = (id: string, text: string) => ({ stype: 'note' as const, attributes: { title: id === a ? 'A original' : 'B original', pageId: id }, content: [
  { stype: 'paragraph', content: [{ stype: 'inline-text', text, marks: [{ stype: 'bold', range: [0, 1] }] }, { stype: 'pageReference', attributes: { pageId: id, title: 'Self' } }] },
  { stype: 'codeBlock', attributes: { language: 'javascript' }, content: [{ stype: 'inline-text', text: 'const retained = true;' }] }
] });
type Snapshot = { row: { name: string; title: string; revision: number; savedAt: number; metadata: Record<string, unknown> }; text: string };
let originals: Map<string, Snapshot>, root: Root, container: HTMLDivElement;
let readHold: Promise<void> | undefined, keepHold: Promise<void> | undefined, failKeep: boolean;
const seed = (id: string, text: string, revision = 1) => {
  const original = document(id, text), native = openNoteTree(original);
  try {
    const tree = noteTreeOf({ getNode: sid => native.editor.dataStore.getNode(sid) as never }, native.rootId)!;
    return { row: { name: id, title: original.attributes.title, revision, savedAt: 10, metadata: { favorite: true } },
      text: serializeNoteFile({ ...original, content: tree.content as unknown[] }) };
  } finally { native.close(); }
};
const mount = () => flushSync(() => root.render(<Workspace />));
async function ready(id = a) { await vi.waitFor(() => expect(productDocumentHost()?.id()).toBe(id)); }
const click = (name: string) => {
  const button = [...container.querySelectorAll('button')].find(one => one.getAttribute('aria-label') === name);
  expect(button).toBeDefined(); button!.click();
};
const nativeTree = () => noteTreeOf({ getNode: sid => f.native!.dataStore.getNode(sid) as never }, f.native!.getRootId()!)!;
async function insert(text: string) {
  const editor = f.native!, run = editor.dataStore.getAllNodes().find(node => node.stype === 'inline-text' && String(node.text).startsWith('B body'))!;
  const offset = String(run.text).length;
  expect(await editor.executeCommand('insertText', { text, selection: { type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: offset, endOffset: offset, collapsed: true } })).toBe(true);
}
beforeEach(() => {
  localStorage.clear(); history.replaceState(null, '', `/#${a}`); f.delivery = async () => true; f.readyGate = undefined; f.native = undefined;
  readHold = undefined; keepHold = undefined; failKeep = false;
  originals = new Map([[a, seed(a, 'A body')], [b, seed(b, 'B body')]]);
  f.library.rows = vi.fn(async () => [...originals.values()].map(snapshot => structuredClone(snapshot.row)));
  f.library.read = vi.fn(async (id: string) => { if (readHold && id === a) await readHold; const value = originals.get(id); return value && structuredClone(value); });
  f.library.keep = vi.fn(async (row: Snapshot['row'], text: string, options: { expectedRevision: number }) => {
    if (keepHold) await keepHold; if (failKeep) throw new Error('controlled quota');
    expect(options.expectedRevision).toBe(originals.get(row.name)!.row.revision);
    const saved = { ...originals.get(row.name)!.row, ...row, revision: options.expectedRevision + 1 };
    originals.set(row.name, { row: saved, text }); return saved;
  });
  f.recovery.rows = vi.fn(async () => []); f.recovery.keep = vi.fn();
  container = window.document.createElement('div'); window.document.body.append(container); root = createRoot(container);
});
afterEach(() => { flushSync(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

it('reads only the selected fresh original instead of the resolved archive cache and returns its mounted witness', async () => {
  mount(); await ready(); click('B original'); await ready(b);
  const source = f.native!; const oldGuard = captureProductNavigation()!;
  const fresh = seed(a, 'Fresh A full native body', 9); originals.set(a, fresh);
  vi.mocked(f.library.read as (id: string) => Promise<Snapshot>).mockClear();
  const installed = await oldGuard.open!(a);
  expect(installed && installed.id).toBe(a); expect(installed && installed.isCurrent()).toBe(true); expect(oldGuard.isCurrent()).toBe(false);
  expect(f.native).not.toBe(source); expect(nativeTree().content).toEqual(JSON.parse(fresh.text).document.content.map((node: unknown) => node));
  expect(f.library.read).toHaveBeenCalledTimes(1); expect(f.library.read).toHaveBeenCalledWith(a);
  expect(originals.get(a)).toEqual(fresh);
});
it('does not publish native readiness until the real mounted input delivery callback exists', async () => {
  let release!: () => void; f.readyGate = new Promise<void>(resolve => { release = resolve; }); mount();
  await vi.waitFor(() => expect(productDocumentHost()).toBeDefined()); expect(productDocumentHost()!.id()).toBe('');
  expect(await captureProductNavigation()!.prepare()).toBe(false);
  f.readyGate = undefined; release(); await ready();
});
it('retains the original native model, history and URL when delivery or actual persistence fails', async () => {
  mount(); await ready(); click('B original'); await ready(b); await insert(' protected source input');
  const source = f.native!, before = source.exportDocument(), url = location.href;
  f.delivery = async () => false; expect(await captureProductNavigation()!.open!(a)).toBe(false);
  expect(f.native).toBe(source); expect(source.exportDocument()).toEqual(before); expect(location.href).toBe(url);
  f.delivery = async () => true; failKeep = true; expect(await captureProductNavigation()!.open!(a)).toBe(false);
  expect(f.native).toBe(source); expect(source.exportDocument()).toEqual(before); expect(location.href).toBe(url);
  expect(JSON.parse(originals.get(b)!.text).document.content[0].content[0].text).toBe('B body');
  failKeep = false; const installed = await captureProductNavigation()!.open!(a); expect(installed && installed.isCurrent()).toBe(true);
  expect(originals.get(b)!.text).toContain('protected source input');
});
it('awaits the actual source write before reading a target and flushes later source input after a held target read', async () => {
  mount(); await ready(); click('B original'); await ready(b); await insert(' first input');
  let releaseKeep!: () => void, releaseRead!: () => void;
  keepHold = new Promise<void>(resolve => { releaseKeep = resolve; }); readHold = new Promise<void>(resolve => { releaseRead = resolve; });
  vi.mocked(f.library.read as (id: string) => Promise<Snapshot>).mockClear();
  const source = f.native!, url = location.href, operation = captureProductNavigation()!.open!(a);
  await vi.waitFor(() => expect(f.library.keep).toHaveBeenCalled()); expect(f.library.read).not.toHaveBeenCalled(); expect(location.href).toBe(url);
  keepHold = undefined; releaseKeep(); await vi.waitFor(() => expect(f.library.read).toHaveBeenCalledWith(a));
  await insert(' during target read'); expect(f.native).toBe(source); expect(location.href).toBe(url);
  readHold = undefined; releaseRead(); const installed = await operation; expect(installed && installed.id).toBe(a);
  const saved = JSON.parse(originals.get(b)!.text).document;
  expect(saved.content[0].content[0].text).toBe('B body first input during target read'); expect(saved.content[1]).toMatchObject(document(b, '').content[1]);
});
it('keeps the native source when a target is missing or fails full schema validation', async () => {
  mount(); await ready(); click('B original'); await ready(b);
  const source = f.native!, before = source.exportDocument(), url = location.href;
  originals.delete(a); expect(await captureProductNavigation()!.open!(a)).toBe(false);
  originals.set(a, { ...seed(a, 'Invalid'), text: JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', content: [{ stype: 'not-supported' }] } }) });
  expect(await captureProductNavigation()!.open!(a)).toBe(false);
  expect(f.native).toBe(source); expect(source.exportDocument()).toEqual(before); expect(location.href).toBe(url);
});
it('preserves same-original undo history and refuses a retired parent or replacement preparation witness', async () => {
  mount(); await ready(); click('B original'); await ready(b); await insert(' native undo input');
  const source = f.native!, before = source.exportDocument(), guard = captureProductNavigation()!;
  const same = await guard.open!(b); expect(same && same.isCurrent()).toBe(true); expect(f.native).toBe(source);
  expect(await source.undo()).toBe(true); expect(source.exportDocument()).not.toEqual(before); expect(await source.redo()).toBe(true);
  const unregister = registerProductReplacementPreparation(() => ({ prepare: async () => true, isPrepared: () => false }));
  expect(await captureProductNavigation()!.open!(a)).toBe(false); unregister(); expect(f.native).toBe(source);
  expect(await captureProductNavigation()!.open!(a, () => false)).toBe(false); expect(f.native).toBe(source);
});

it('refreshes the requested original when a later mounted workspace reuses the archive discovery cache', async () => {
  mount(); await ready(); flushSync(() => root.unmount());
  const fresh = seed(a, 'Fresh initial native source', 12); originals.set(a, fresh);
  vi.mocked(f.library.read as (id: string) => Promise<Snapshot>).mockClear();
  root = createRoot(container); mount(); await ready();
  expect(nativeTree().content).toEqual(JSON.parse(fresh.text).document.content);
  expect(f.library.read).toHaveBeenCalledTimes(1); expect(f.library.read).toHaveBeenCalledWith(a); expect(originals.get(a)).toEqual(fresh);
});
it('does not install a held target after the parent intent retires', async () => {
  mount(); await ready(); click('B original'); await ready(b);
  const source = f.native!, before = source.exportDocument(), url = location.href;
  let release!: () => void, current = true; readHold = new Promise<void>(resolve => { release = resolve; });
  vi.mocked(f.library.read as (id: string) => Promise<Snapshot>).mockClear();
  const opening = captureProductNavigation()!.open!(a, () => current);
  await vi.waitFor(() => expect(f.library.read).toHaveBeenCalledWith(a));
  current = false; readHold = undefined; release(); expect(await opening).toBe(false);
  expect(f.native).toBe(source); expect(source.exportDocument()).toEqual(before); expect(location.href).toBe(url);
});
