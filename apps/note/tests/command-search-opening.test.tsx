import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NoteEditor, type NoteCommandTarget, type NoteInputDelivery } from '@barocss/office-note/view';
import { openNoteTree, noteTreeOf, type NoteSession } from '@barocss/office-note';
import { useNoteCommandSearch } from '../src/use-note-command-search';

// The search presentation is controlled here; the registered editors and native targets are real.
vi.mock('@barocss/office-ui', async importOriginal => ({
  ...await importOriginal<typeof import('@barocss/office-ui')>(),
  useOfficeLocale: () => ({ t: (key: string) => key }),
  CommandSearch: ({ open, onPickIntent }: { open: boolean; onPickIntent(id: string): (() => void) | undefined }) => open ?
    createElement('button', { 'data-search-result': '', onClick: () => onPickIntent('find')?.() }, 'Find') : null,
  StatusNotice: ({ children }: { children: React.ReactNode }) => createElement('div', { role: 'alert' }, children),
}));
let root: Root, container: HTMLDivElement, sessions: NoteSession[], targets: NoteCommandTarget[];
let search: ReturnType<typeof useNoteCommandSearch>, pending: { resolve(value: boolean): void }[];
const flush = Object.assign(() => new Promise<boolean>(resolve => pending.push({ resolve })), {
  captureInputIntent: () => () => true,
}) as NoteInputDelivery;
const fixture = (title: string) => ({ stype: 'note', attributes: { title }, content: [
  { stype: 'paragraph', content: [{ stype: 'inline-text', text: title }] },
] });
const registrations = [0, 1].map(index => (target: NoteCommandTarget) => {
  targets[index] = target; return search.registerCommandTarget(target);
});
function Harness() {
  search = useNoteCommandSearch({ captureHost: () => ({ flush, isCurrent: () => true, capturePrepared: () => () => true }) });
  return createElement('div', {}, sessions.map((session, index) => createElement(NoteEditor, {
    key: index, editor: session.editor, rootId: session.rootId,
    registerCommandTarget: registrations[index],
  })), search.dialog);
}
async function focus(index: number) {
  // jsdom's contentEditable needs a focus scaffold; focusin still follows the real registered DOM.
  targets[index].element.tabIndex = -1;
  await act(async () => targets[index].element.focus());
}
const native = () => sessions.map(session => noteTreeOf(session.editor.dataStore, session.rootId));
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  sessions = [openNoteTree(fixture('First')), openNoteTree(fixture('Second'))]; targets = []; pending = [];
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(Harness)));
  await focus(0);
});
afterEach(async () => {
  await act(async () => root.unmount()); sessions.forEach(session => session.close()); container.remove();
  delete (Range.prototype as unknown as Record<string, unknown>).getClientRects;
  delete (Range.prototype as unknown as Record<string, unknown>).getBoundingClientRect;
  vi.unstubAllGlobals();
});
it('refuses a held opening after focus moves to another actual registered native body', async () => {
  const before = native(); let request!: Promise<void>;
  await act(async () => { request = search.openSearch(); });
  await focus(1);
  await act(async () => { pending[0].resolve(true); await request; });
  expect(container.querySelector('[data-search-result]')).toBeNull(); expect(native()).toEqual(before);
});
it('retires a held opening across genuine native-body focus ABA', async () => {
  const before = native(); let request!: Promise<void>;
  await act(async () => { request = search.openSearch(); });
  await focus(1); await focus(0);
  await act(async () => { pending[0].resolve(true); await request; });
  expect(container.querySelector('[data-search-result]')).toBeNull(); expect(native()).toEqual(before);
});
it('keeps the newer body request when the older held opening finishes last', async () => {
  const before = native(); let first!: Promise<void>, second!: Promise<void>;
  await act(async () => { first = search.openSearch(); }); await focus(1);
  await act(async () => { second = search.openSearch(); });
  await act(async () => { pending[1].resolve(true); await second; });
  const newest = vi.spyOn(targets[1], 'openNavigation'); const old = vi.spyOn(targets[0], 'openNavigation');
  await act(async () => { pending[0].resolve(true); await first; });
  await act(async () => (container.querySelector('[data-search-result]') as HTMLButtonElement).click());
  expect(newest).toHaveBeenCalledWith('find'); expect(old).not.toHaveBeenCalled(); expect(native()).toEqual(before);
});
it('retires an older same-body request when the newer request refuses its delivery', async () => {
  let first!: Promise<void>, second!: Promise<void>;
  await act(async () => { first = search.openSearch(); second = search.openSearch(); });
  await act(async () => { pending[1].resolve(false); await second; });
  await act(async () => { pending[0].resolve(true); await first; });
  expect(container.querySelector('[data-search-result]')).toBeNull();
});
it('permits the same native owner when header focus moves outside its input', async () => {
  let request!: Promise<void>; await act(async () => { request = search.openSearch(); });
  const header = document.createElement('button'); container.append(header); await act(async () => header.focus());
  await act(async () => { pending[0].resolve(true); await request; });
  expect(container.querySelector('[data-search-result]')).not.toBeNull();
});
it('does not reopen or publish an error after its owning hook unmounts', async () => {
  let request!: Promise<void>; await act(async () => { request = search.openSearch(); });
  await act(async () => root.render(null));
  await act(async () => { pending[0].resolve(false); await request; });
  expect(container.childElementCount).toBe(0);
});
