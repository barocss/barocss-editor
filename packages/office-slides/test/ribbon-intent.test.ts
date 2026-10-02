import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSlidesEditor } from '../src/slides-kit';
import { createSampleDeck } from '../src/sample-deck';
import { deckSlides } from '../src/deck';
import { deckFileText } from '../src/deck-file';
import { Ribbon } from '../src/ribbon';
import { SlidesDocumentChrome } from '../src/selection-chrome';
import { captureSlidesSelectionOwner, changeSlidesSelectionContext, createSlidesSelectionLifetime, ownsSlidesSelection, trackSlidesSelectionLifetime } from '../src/selection-owner';

let host: HTMLDivElement, root: Root, editor: ReturnType<typeof createSlidesEditor>, dispose: () => void;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  editor = createSlidesEditor(); editor.loadDocument(createSampleDeck(), 'ribbon427');
});
afterEach(() => { act(() => root.unmount()); host.remove(); dispose?.(); editor.destroy(); vi.unstubAllGlobals(); });
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

it('preserves the owned slide menu while refusing a retired popup and allowing a fresh menu command', async () => {
  const slides = deckSlides({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) });
  const slide = slides[0].sid, lifetime = createSlidesSelectionLifetime(editor, slide);
  dispose = trackSlidesSelectionLifetime(lifetime);
  const container = createRef<HTMLElement>(); container.current = host;
  const render = () => {
    const owner = captureSlidesSelectionOwner(lifetime);
    root.render(createElement(Ribbon, { editor, slides, current: slide, groupIds: ['slide'], portalContainer: container, canRunIntent: () => ownsSlidesSelection(owner) }));
  };
  const open = () => host.querySelector<HTMLButtonElement>('[data-menu="tools-slide"]')!.click();
  act(render); act(open);
  expect(host.querySelector('[role="menu"]')).not.toBeNull();
  const before = deckFileText(editor.exportDocument());
  const execute = vi.spyOn(editor, 'executeCommand');
  changeSlidesSelectionContext(lifetime, slide, 'notes'); changeSlidesSelectionContext(lifetime, slide, 'canvas');
  await act(async () => host.querySelector<HTMLButtonElement>('[data-menu-item="slide-new"]')!.click());
  expect(deckFileText(editor.exportDocument())).toBe(before);
  act(render); act(open);
  await act(async () => host.querySelector<HTMLButtonElement>('[data-menu-item="slide-new"]')!.click());
  await act(async () => { await Promise.all(execute.mock.results.map(result => result.value)); });
  const inserted = deckFileText(editor.exportDocument()); expect(inserted).not.toBe(before);
  await act(async () => { await editor.undo(); }); expect(deckFileText(editor.exportDocument())).toBe(before);
  await act(async () => { await editor.redo(); }); expect(deckFileText(editor.exportDocument())).toBe(inserted);
});

it('keeps a freshly reopened global menu mounted after Escape and a later parent render', async () => {
  const slides = deckSlides({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) });
  const scope = createRef<HTMLElement>(); scope.current = host;
  const render = () => root.render(createElement(SlidesDocumentChrome, {
    editor, slides, current: slides[0].sid, scope, onInspect: () => {}
  }));
  const trigger = () => host.querySelector<HTMLButtonElement>('[data-secondary-trigger]')!;
  const before = deckFileText(editor.exportDocument());
  act(render);
  act(() => { trigger().focus(); trigger().click(); });
  expect(trigger().getAttribute('aria-pressed')).toBe('true');
  act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(trigger().getAttribute('aria-pressed')).toBe('false');
  act(() => trigger().click());
  const menu = host.querySelector('[role="menu"]'); expect(menu).not.toBeNull();
  for (const id of ['slide-new', 'insert-textbox', 'insert-rectangle', 'insert-table', 'insert-image']) {
    expect(host.querySelector(`.sl-insertion-chrome [data-control="${id}"]`)).not.toBeNull();
    expect(menu!.querySelector(`[data-control="${id}"]`)).toBeNull();
  }
  expect(menu!.querySelector('[data-control="insert-ellipse"]')).not.toBeNull();
  expect(menu!.querySelector('[data-control="slide-duplicate"]')).not.toBeNull();
  act(render);
  expect(host.querySelector('[role="menu"]')).toBe(menu);
  expect(trigger().getAttribute('aria-pressed')).toBe('true');
  expect(deckFileText(editor.exportDocument())).toBe(before); expect(editor.canRun('undo')).toBe(false);
});
