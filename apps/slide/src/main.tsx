import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { DataStore } from '@barocss/datastore';
import { getGlobalRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { WORD_ENV_KEY, createWordEnv } from '@barocss/office-word';
import {
  createSampleDeck,
  createSlidesEditor,
  getSlidesSchemaDefinition,
  registerSlidesRenderers
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
  const doc = { getNode: (id: string) => dataStore.getNode(id) as never, rootId: editor.getRootId()! };
  const view = new EditorViewDOM(editor, {
    container,
    registry: getGlobalRegistry(),
    env: { [WORD_ENV_KEY]: createWordEnv(doc) }
  });
  view.render();

  // For the console and for tests, the same two handles Word exposes.
  window.editor = editor;
  window.editorView = view;

  return { editor, view };
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(createElement(StrictMode, null, createElement(App, { mount: mountSlides })));
}
