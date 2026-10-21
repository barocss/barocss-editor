// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSlidesEditor } from '../src/slides-kit';
import { createSampleDeck } from '../src/sample-deck';
import { deckSlides } from '../src/deck';
import { deckFileText } from '../src/deck-file';
import { SlidesDocumentChrome } from '../src/selection-chrome';
import { SLIDES_TOOLBAR } from '../src/toolbar-model';

let root: Root, scope: HTMLDivElement, header: HTMLDivElement, owner: HTMLDivElement;
let editor: ReturnType<typeof createSlidesEditor>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  scope = document.createElement('div'); header = document.createElement('div'); owner = document.createElement('div');
  document.body.append(header, scope); scope.append(owner); root = createRoot(owner);
  editor = createSlidesEditor(); editor.loadDocument(createSampleDeck(), 'header468');
});
afterEach(() => { act(() => root.unmount()); editor.destroy(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
const render = (active = true) => {
  const slides = deckSlides({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) });
  act(() => root.render(createElement(SlidesDocumentChrome, { editor, slides, current: slides[0].sid,
    scope: { current: scope }, headerHost: header, active, onInspect: vi.fn() })));
};

it('portals only global tools and exposes the complete insertion model without changing the native deck', async () => {
  const native = deckFileText(editor.exportDocument()), history = editor.getHistoryStats(), selection = JSON.stringify(editor.selection);
  render();
  expect(header.querySelector('.sl-insertion-chrome')).not.toBeNull();
  expect(owner.querySelector('.sl-insertion-chrome')).toBeNull();
  expect(header.querySelectorAll('[data-control="undo"], [data-control="redo"]')).toHaveLength(2);
  await act(async () => header.querySelector<HTMLButtonElement>('[data-secondary-trigger]')!.click());
  for (const group of SLIDES_TOOLBAR.filter(group => ['insert', 'slide'].includes(group.id))) {
    for (const control of group.controls) expect(header.querySelector(`[data-control="${control.id}"]`)).not.toBeNull();
  }
  expect(deckFileText(editor.exportDocument())).toBe(native);
  expect(editor.getHistoryStats()).toEqual(history); expect(JSON.stringify(editor.selection)).toBe(selection);
});

it('hides the portal while its owner is inactive and keeps the native root', () => {
  render(); const nativeRoot = editor.dataStore.getNode(editor.getRootId()!);
  render(false);
  expect(header.querySelector<HTMLElement>('.sl-insertion-chrome')!.hidden).toBe(true);
  expect(header.querySelector('.sl-insertion-chrome')!.hasAttribute('inert')).toBe(true);
  render();
  expect(header.querySelector<HTMLElement>('.sl-insertion-chrome')!.hidden).toBe(false);
  expect(editor.dataStore.getNode(editor.getRootId()!)).toBe(nativeRoot);
});
