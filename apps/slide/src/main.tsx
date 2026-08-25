import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { DataStore } from '@barocss/datastore';
import { getGlobalRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { WORD_ENV_KEY } from '@barocss/office-text';
import { installCellSelection } from '@barocss/office-word';
import {
  createSampleDeck,
  createSlidesEditor,
  getSlidesSchemaDefinition,
  registerSlidesRenderers,
  createConnectorPass,
  createDeckEnv,
  trackPropertyCss
} from '@barocss/office-slides';
import { App } from './app';
import './style.css';

declare global {
  interface Window {
    editor?: Editor;
    editorView?: EditorViewDOM;
  }
}

registerSlidesRenderers();

/**
 * Stand a deck up.
 *
 * The interesting part is what is missing. Word's mount registers a layout
 * pass, a print-page builder, a font loader, three widget renderers and a
 * revision counter the pass needs to know the document moved — all of it in
 * service of one problem, which is that a page does not know where it ends
 * until the text has been measured.
 *
 * A slide knows. Every scene node carries its own position, so there is one
 * render and nothing to converge, and this function is the whole of it.
 */
export function mountSlides(container: HTMLElement): { editor: Editor; view: EditorViewDOM } {
  const schema = createSchema('slides', getSlidesSchemaDefinition());
  const dataStore = new DataStore(undefined, schema);

  const editor = createSlidesEditor({ editable: true, schema, dataStore });
  editor.loadDocument(createSampleDeck(), 'slides');

  /**
   * The Word environment, in a deck.
   *
   * Not an oversight and not a shortcut. A slide's text is drawn by Word's
   * renderers, and those renderers do not read a paragraph's attributes
   * directly — they resolve it against the document, so a paragraph with no
   * attributes at all still inherits from its style and from the document
   * defaults. That resolution needs the document, and this is the channel it
   * travels on.
   *
   * The first version of this app left it out, and the deck drew: every slide
   * in the right place, every box the right size, and every word in it at the
   * default size, left aligned and unstyled. Placement is Slides' and
   * formatting is Word's, and reusing the second means carrying its
   * environment.
   *
   * What a deck does *not* supply is the rest of it: no layouts, because there
   * is no pagination; no fields, no page numbers, no tabs, no header being
   * edited. Those are a page's, and `createWordEnv` is happy without them.
   */
  /**
   * The document the renderers resolve formatting against — with a **live** root.
   *
   * `rootId: editor.getRootId()!` was captured here once, and a captured root is
   * the wrong root the moment a reader opens a file or starts a new deck:
   * `loadDocument` makes a new one. Measured after 새로 만들기 — the new deck's
   * title drew in `system-ui` where the sample's drew in Georgia, because the
   * theme and the master it inherits from were being looked for under the old
   * document's root and were not there.
   *
   * A getter rather than a re-created env, because the env is handed to the view
   * once and the resolvers hold this object: making `rootId` a question rather
   * than an answer is the whole of the fix.
   */
  const doc = {
    getNode: (id: string) => dataStore.getNode(id) as never,
    get rootId() {
      return editor.getRootId()!;
    }
  };
  const view = new EditorViewDOM(editor, {
    container,
    registry: getGlobalRegistry(),
    env: { [WORD_ENV_KEY]: createDeckEnv(doc as never) }
  });
  /**
   * Where every connector goes, worked out once per render.
   *
   * A line's route depends on the shapes it joins, the shapes in the way and any line an
   * end holds — none of which are the line's own node, so the view had no reason to
   * redraw it when they moved. Lines *appeared* to follow only because a reaction wrote
   * the ends back into the connector, and the write was the redraw. This is the
   * mechanism the engine has for exactly that, and it keeps the document out of it. See
   * `connector-pass.ts`.
   */
  view.registerLayoutPass(createConnectorPass({ doc }) as never);

  view.render();

  /**
   * Dragging across the cells of a table on a slide selects them.
   *
   * The same install Word makes, and it works here for a reason worth stating:
   * the overlay is `pointer-events: none` while the reader is *editing* a box,
   * so a pointer inside an entered text frame reaches the document exactly as it
   * does in a page. Outside that, the overlay takes every pointer — which is
   * correct, because on a slide a click means "select this box" until the reader
   * has said otherwise by going inside one.
   *
   * So a cell drag on a slide is a drag inside a box the reader has entered, and
   * that is the only state in which a table's cells are what a pointer is about.
   */
  installCellSelection(editor, container, doc as never);

  // For the console and for tests, the same two handles Word exposes.
  window.editor = editor;
  window.editorView = view;

  return { editor, view };
}

/**
 * The motion tracks, registered on the page.
 *
 * A track is a custom property the *renderer* writes into a value — a gradient's
 * angle is `calc(180deg + var(--sl-sweep, 0deg))` — and an unregistered custom
 * property is a string, so it has no midpoint and the gradient would jump rather
 * than turn (measured). `@property` is what makes it a number.
 *
 * Injected rather than written in `style.css` so that the table in
 * `motion-tracks.ts` is the only place a track is declared: a hand-written block
 * beside that list is exactly the two-places-for-one-fact fault this repository
 * keeps finding in itself.
 *
 * Any *second* host of this deck needs the same registration — a presenter window
 * opened with `window.open`, or a captured HTML snapshot. Which is why every
 * `var()` the renderer writes carries its neutral value as a fallback: without
 * the registration the variable is invalid at computed-value time and the whole
 * declaration is dropped, so a shape would lose its gradient rather than lose its
 * animation.
 */
const tracks = document.createElement('style');
tracks.dataset.slTracks = '';
tracks.textContent = trackPropertyCss();
document.head.append(tracks);

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(createElement(StrictMode, null, createElement(App, { mount: mountSlides })));
}
