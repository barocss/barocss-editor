import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSlidesEditor } from '../src/slides-kit';
import { createSampleDeck } from '../src/sample-deck';
import { deckSlides } from '../src/deck';
import { deckFileText } from '../src/deck-file';
import { SlideNavigation, type SlideNavigationProps } from '../src/slide-navigation';

// Navigation tests use the real native deck. Thumbnail rendering has separate browser coverage.
vi.mock('../src/thumbnail', () => ({ Thumbnail: () => createElement('span', { className: 'sl-thumb' }) }));
let host: HTMLDivElement, root: Root, editor: ReturnType<typeof createSlidesEditor>, props: SlideNavigationProps;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  editor = createSlidesEditor(); editor.loadDocument(createSampleDeck(), 'navigation432');
  const slides = deckSlides({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) });
  props = { editor, slides, current: slides[0].sid, revision: 0, onSelect: vi.fn(), onRename: vi.fn(), lifetimeKey: 'document-a' };
});
afterEach(() => { act(() => root.unmount()); host.remove(); editor.destroy(); vi.unstubAllGlobals(); });
const render = (next: Partial<SlideNavigationProps> = {}) => act(() => { props = { ...props, ...next }; root.render(createElement(SlideNavigation, props)); });
const fold = () => host.querySelector<HTMLButtonElement>('[data-filmstrip-toggle]')!;
const panel = () => host.querySelector<HTMLElement>('[data-filmstrip-panel]')!;
const input = () => host.querySelector<HTMLInputElement>('.sl-filmstrip-rename input')!;
const rename = () => act(() => host.querySelector<HTMLButtonElement>(`[data-slide="${props.current}"]`)!
  .dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
const clickFold = () => act(() => fold().click());

it('folding keeps one native filmstrip, its draft, selection and history; Escape returns focus', () => {
  render();
  const native = deckFileText(editor.exportDocument()), selection = JSON.stringify(editor.selection), history = editor.getHistoryStats();
  expect(panel().hidden).toBe(true); expect(panel().hasAttribute('inert')).toBe(true);
  expect(host.querySelectorAll('.sl-filmstrip')).toHaveLength(1);
  expect(host.querySelectorAll('[data-slide]')).toHaveLength(props.slides.length);
  clickFold(); rename();
  const field = input(); field.value = ' Unaccepted rename ';
  act(() => field.focus());
  clickFold();
  act(() => field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(props.onRename).not.toHaveBeenCalled();
  clickFold(); expect(input()).toBe(field); expect(field.value).toBe(' Unaccepted rename ');
  act(() => panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(panel().hidden).toBe(true); expect(document.activeElement).toBe(fold());
  expect(deckFileText(editor.exportDocument())).toBe(native); expect(JSON.stringify(editor.selection)).toBe(selection);
  expect(editor.getHistoryStats()).toEqual(history); expect(props.onSelect).not.toHaveBeenCalled();
});

it('navigation reports exact SIDs and does not silently pick slide one while editing a definition', () => {
  render();
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="다음 슬라이드"]')!.click());
  expect(props.onSelect).toHaveBeenLastCalledWith(props.slides[1].sid);
  render({ current: props.slides[2].sid });
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="이전 슬라이드"]')!.click());
  expect(props.onSelect).toHaveBeenLastCalledWith(props.slides[1].sid);
  render({ current: 'component-definition', definitionLabel: '카드 편집' });
  expect(host.querySelector<HTMLButtonElement>('[aria-label="이전 슬라이드"]')!.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('[aria-label="다음 슬라이드"]')!.disabled).toBe(true);
  expect(host.querySelector('[aria-label="현재 슬라이드"]')!.textContent).toContain('카드 편집');
});

it('a visible current rename uses its SID while a new lifetime discards the unfinished field', () => {
  render(); clickFold(); rename();
  const stale = input(); stale.value = 'Stale rename';
  render({ lifetimeKey: 'document-b' });
  expect(input()).toBeNull();
  act(() => stale.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(props.onRename).not.toHaveBeenCalled();
  clickFold(); rename();
  const field = input(); field.value = 'Accepted name';
  act(() => field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(props.onRename).toHaveBeenCalledWith(props.current, 'Accepted name');
});

it('viewer navigation remains available but viewer and newly revoked rename callbacks cannot write', () => {
  render(); clickFold(); rename(); const stale = input(); stale.value = 'Denied rename';
  act(() => editor.setEditable(false));
  expect(input()).toBeNull(); expect(panel().hidden).toBe(true);
  act(() => stale.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  clickFold(); rename(); expect(input()).toBeNull();
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="다음 슬라이드"]')!.click());
  expect(props.onSelect).toHaveBeenCalledWith(props.slides[1].sid); expect(props.onRename).not.toHaveBeenCalled();
});

it('changing the current slide and removing a slide retire its rename field without a write', () => {
  render(); clickFold(); rename();
  render({ current: props.slides[1].sid }); expect(input()).toBeNull();
  rename(); const removed = props.current;
  render({ slides: props.slides.filter(slide => slide.sid !== removed) });
  expect(input()).toBeNull(); expect(props.onRename).not.toHaveBeenCalled();
});


it.each(['multi', 'map'] as const)('%s suspends notes and the retained tray without changing the native deck', viewMode => {
  const onViewModeChange = vi.fn();
  const renderNotes = vi.fn(() => createElement('textarea', { 'aria-label': 'Retained notes' }));
  render({ viewMode: 'single', onViewModeChange, renderNotes });
  const native = deckFileText(editor.exportDocument()), history = editor.getHistoryStats();
  clickFold();
  act(() => host.querySelector<HTMLButtonElement>('[data-filmstrip-panel] [data-notes-toggle]')!.click());
  const notes = host.querySelector<HTMLElement>('[data-notes-panel]')!;
  const field = notes.querySelector('textarea');
  expect(notes.hidden).toBe(false); expect(panel().hidden).toBe(false);
  render({ viewMode });
  expect(notes.hidden).toBe(true); expect(notes.hasAttribute('inert')).toBe(true);
  expect(panel().hidden).toBe(true); expect(panel().hasAttribute('inert')).toBe(true);
  expect(host.querySelector<HTMLElement>('.sl-slide-navigation-tools')!.hidden).toBe(true);
  expect(notes.querySelector('textarea')).toBe(field);
  expect(renderNotes).toHaveBeenLastCalledWith(expect.any(Function), false);
  const switches = host.querySelectorAll<HTMLButtonElement>('.sl-slide-view-toolbar [data-slide-view]');
  expect(switches).toHaveLength(2);
  expect(switches[0].getAttribute('aria-pressed')).toBe('false');
  expect(switches[1].getAttribute('aria-pressed')).toBe(String(viewMode === 'multi'));
  act(() => switches[0].click()); expect(onViewModeChange).toHaveBeenLastCalledWith('single');
  render({ viewMode: 'single' });
  expect(notes.hidden).toBe(false); expect(panel().hidden).toBe(false);
  expect(notes.querySelector('textarea')).toBe(field);
  expect(deckFileText(editor.exportDocument())).toBe(native); expect(editor.getHistoryStats()).toEqual(history);
});
