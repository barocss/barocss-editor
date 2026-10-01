import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createSlidesEditor } from '../src/slides-kit';
import { createSampleDeck } from '../src/sample-deck';
import { deckSlides } from '../src/deck';
import { deckFileText } from '../src/deck-file';
import { Ribbon } from '../src/ribbon';
import { captureSlidesSelectionOwner, changeSlidesSelectionContext, createSlidesSelectionLifetime, ownsSlidesSelection, trackSlidesSelectionLifetime } from '../src/selection-owner';

let host: HTMLDivElement, root: Root, editor: ReturnType<typeof createSlidesEditor>, dispose: () => void;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  editor = createSlidesEditor(); editor.loadDocument(createSampleDeck(), 'ribbon427');
});
afterEach(() => { act(() => root.unmount()); host.remove(); dispose?.(); editor.destroy(); });
it('full Ribbon refuses a field command from a retired canvas intent and accepts a fresh intent', async () => {
  const slides = deckSlides({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) });
  const slide = slides[0].sid, lifetime = createSlidesSelectionLifetime(editor, slide);
  dispose = trackSlidesSelectionLifetime(lifetime);
  const container = createRef<HTMLElement>(); container.current = host;
  const render = () => {
    const owner = captureSlidesSelectionOwner(lifetime);
    root.render(createElement(Ribbon, { editor, slides, current: slide, portalContainer: container, canRunIntent: () => ownsSlidesSelection(owner) }));
  };
  act(render);
  const before = deckFileText(editor.exportDocument());
  changeSlidesSelectionContext(lifetime, slide, 'notes'); changeSlidesSelectionContext(lifetime, slide, 'canvas');
  await act(async () => host.querySelector<HTMLButtonElement>('[data-control="insert-rectangle"]')!.click());
  expect(deckFileText(editor.exportDocument())).toBe(before); expect(editor.canRun('undo')).toBe(false);
  act(render);
  await act(async () => host.querySelector<HTMLButtonElement>('[data-control="insert-rectangle"]')!.click());
  const inserted = deckFileText(editor.exportDocument()); expect(inserted).not.toBe(before);
  await act(async () => { await editor.undo(); }); expect(deckFileText(editor.exportDocument())).toBe(before);
  await act(async () => { await editor.redo(); }); expect(deckFileText(editor.exportDocument())).toBe(inserted);
});
