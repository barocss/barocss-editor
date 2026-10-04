// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSlidesEditor } from '../src/slides-kit';
import { createSampleDeck } from '../src/sample-deck';
import { deckSlides } from '../src/deck';
import { SlidesDocumentChrome } from '../src/selection-chrome';

let editor: ReturnType<typeof createSlidesEditor>, root: Root, scope: HTMLDivElement, owner: HTMLDivElement;
let slide: string, object: HTMLDivElement, overlay: HTMLDivElement, handle: HTMLSpanElement;
let objectBox: DOMRect, handleBox: DOMRect;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  scope = document.createElement('div'); owner = document.createElement('div'); scope.append(owner); document.body.append(scope);
  root = createRoot(owner); editor = createSlidesEditor(); editor.loadDocument(createSampleDeck(), 'chrome-clearance');
  slide = deckSlides({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) })[0].sid;
  await editor.executeCommand('insertRectangle', { slideId: slide });
  object = document.createElement('div'); object.dataset.bcSid = editor.selection!.nodeIds![0];
  object.className = 'sl-stage'; scope.append(object);
  objectBox = new DOMRect(400, 300, 80, 50); handleBox = new DOMRect(436, 260, 8, 8);
  overlay = document.createElement('div'); overlay.dataset.slideOverlay = slide; handle = document.createElement('span');
  handle.dataset.handle = 'rotate'; overlay.append(handle); scope.append(overlay);
  vi.spyOn(object, 'getBoundingClientRect').mockImplementation(() => objectBox);
  vi.spyOn(object, 'getClientRects').mockImplementation(() => [objectBox] as unknown as DOMRectList);
  vi.spyOn(handle, 'getBoundingClientRect').mockImplementation(() => handleBox);
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-floating-surface') ? new DOMRect(0, 0, 300, 40) : original.call(this);
  });
});
afterEach(() => { act(() => root.unmount()); editor.destroy(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const render = async () => {
  const slides = deckSlides({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) });
  await act(async () => root.render(createElement(SlidesDocumentChrome, { editor, slides, current: slide,
    scope: { current: scope }, onInspect: vi.fn() })));
  await act(async () => object.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
};
const chrome = () => scope.querySelector<HTMLElement>('[data-slides-formatting][data-floating-ready="true"]')!;
it('keeps actual rotation and moving path hit rectangles clear without changing native bytes or history', async () => {
  const bytes = JSON.stringify(editor.exportDocument()), history = editor.getHistoryStats();
  await render(); expect(chrome()).not.toBeNull();
  expect(parseFloat(chrome().style.top) + 40).toBeLessThan(handleBox.top);
  handle.removeAttribute('data-handle'); handle.dataset.pathAdd = '0'; handleBox = new DOMRect(440, 180, 8, 8);
  await act(async () => { handle.style.top = '180px'; });
  expect(parseFloat(chrome().style.top) + 40).toBeLessThan(handleBox.top);
  const retired = document.createElement('div'); retired.dataset.slideOverlay = 'retired';
  const old = document.createElement('span'); old.dataset.handle = 'rotate'; retired.append(old); scope.append(retired);
  vi.spyOn(old, 'getBoundingClientRect').mockReturnValue(new DOMRect(440, 20, 8, 8));
  await act(async () => { handle.style.left = '440px'; });
  expect(parseFloat(chrome().style.top)).toBeGreaterThan(20);
  expect(JSON.stringify(editor.exportDocument())).toBe(bytes); expect(editor.getHistoryStats()).toEqual(history);
});
it('flips below near the viewport top and preserves the compact toolbar controls', async () => {
  objectBox = new DOMRect(400, 50, 80, 50); handleBox = new DOMRect(436, 10, 8, 8);
  await render(); expect(chrome()).not.toBeNull();
  expect(parseFloat(chrome().style.top)).toBeGreaterThan(objectBox.bottom);
  expect(parseFloat(chrome().style.top) + 40).toBeLessThan(window.innerHeight);
  expect(chrome().dataset.compact).toBe('true'); expect(chrome().querySelectorAll('button').length).toBeGreaterThan(0);
});
