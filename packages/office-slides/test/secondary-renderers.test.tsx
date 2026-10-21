import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getGlobalRegistry, intoRegistry, RendererRegistry } from '@barocss/dsl';
import { registerWordRenderers } from '../../office-word/src/renderers/word';
import { createSlidesEditor } from '../src/slides-kit';
import { registerSlidesRenderers } from '../src/renderers';
import { createSampleDeck } from '../src/sample-deck';
import { deckSlides } from '../src/deck';
import { Thumbnail } from '../src/thumbnail';
import { NotesPane } from '../src/notes';
import { createSlidePrint } from '../src/print';

let host: HTMLElement, root: Root, editor: ReturnType<typeof createSlidesEditor>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`) });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  editor = createSlidesEditor(); editor.loadDocument(createSampleDeck());
});
afterEach(async () => {
  await act(async () => root.unmount()); editor.destroy(); host.remove(); vi.unstubAllGlobals();
});
const slides = () => deckSlides({ rootId: editor.getRootId()!, getNode: sid => editor.dataStore.getNode(sid) });
function privateSlidesRegistry() {
  const registry = new RendererRegistry({ global: false });
  intoRegistry(registry, registerSlidesRenderers);
  return registry;
}

it('renders actual slide thumbnails, rich notes and print pages with their private owner while global Word renderers remain unchanged', async () => {
  // A concurrently mounted legacy Word view may own the global vocabulary.
  // Each Slides secondary view must use the same private vocabulary as its stage.
  registerWordRenderers();
  const global = getGlobalRegistry(), before = global.getAll(), globalSurface = global.getComponent('surface');
  const registry = privateSlidesRegistry(), slide = slides()[0];
  expect(await editor.run('addSlideNote', { slideId: slide.sid, initialText: 'Private rich speaker note' })).toBe(true);
  const native = editor.exportDocument(), history = editor.getHistoryStats();
  await act(async () => root.render(<>
    <Thumbnail editor={editor} registry={registry} slideSid={slide.sid} width={160} revision={1} />
    <NotesPane editor={editor} registry={registry} slideSid={slide.sid} revision={1} />
  </>));
  expect(host.querySelector('.sl-thumb-inner .sl-slide')).not.toBeNull();
  expect(host.querySelector('.sl-thumb-inner .w-surface')).toBeNull();
  expect(host.querySelector('.sl-thumb-inner')!.textContent).toContain('One engine, two products');
  expect(host.querySelector('.sl-notes-host .w-paragraph')!.textContent).toContain('Private rich speaker note');
  // Opening real speaker notes puts the caret into that body. Printing must preserve it.
  const selection = editor.selection;
  const print = createSlidePrint(editor, document, registry);
  try {
    expect(print.build()).toBe(slides().filter(value => !value.hidden).length);
    expect(document.querySelector('.sl-print-page .sl-slide')).not.toBeNull();
    expect(document.querySelector('.sl-print-page .w-surface')).toBeNull();
    expect(document.querySelector('.sl-print-pages')!.textContent).not.toContain('Private rich speaker note');
  } finally { print.clear(); }
  expect(editor.exportDocument()).toEqual(native);
  expect(editor.getHistoryStats()).toEqual(history); expect(editor.selection).toEqual(selection);
  expect(global.getAll()).toEqual(before); expect(global.getComponent('surface')).toBe(globalSurface);
});

it('recreates a thumbnail renderer when its private owner changes even if the native snapshot is unchanged', async () => {
  const first = privateSlidesRegistry(), second = privateSlidesRegistry(), slide = slides()[0];
  const resolve = vi.spyOn(second, 'getComponent');
  await act(async () => root.render(<Thumbnail editor={editor} registry={first} slideSid={slide.sid} width={160} revision={0} />));
  expect(host.querySelector('.sl-slide')).not.toBeNull();
  await act(async () => root.render(<Thumbnail editor={editor} registry={second} slideSid={slide.sid} width={160} revision={0} />));
  expect(host.querySelector('.sl-slide')).not.toBeNull(); expect(host.querySelector('.w-surface')).toBeNull();
  expect(resolve).toHaveBeenCalledWith('surface');
  expect(host.querySelector('.sl-thumb-inner')!.textContent).toContain('One engine, two products');
});
