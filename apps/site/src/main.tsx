import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { DataStore } from '@barocss/datastore';
import { getGlobalRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { WORD_ENV_KEY, createTextEnv } from '@barocss/office-text';
import {
  createSampleSite,
  createSiteEditor,
  getSiteSchemaDefinition,
  registerSiteRenderers
} from '@barocss/office-site';
import { App } from './app';
import './style.css';

declare global {
  interface Window {
    editor?: Editor;
    editorView?: EditorViewDOM;
  }
}

registerSiteRenderers();

/**
 * Stand a site up.
 *
 * Shorter than the deck's mount, which was already shorter than Word's, and the shrinking is the
 * measurement rather than a boast. Word registers a layout pass, a print-page builder, a font
 * loader, three widget renderers and a revision counter — all in service of one problem, that a
 * page does not know where it ends until its text has been measured. A slide knows, because every
 * scene node carries its own position, so a deck's mount is one render.
 *
 * A site does not know either — and does not need to. Its height is a **consequence**, worked out by
 * the browser from the stacks it was given, which is exactly the thing a site builder's output has
 * to be laid out by anyway. So there is no pass, no measurement and nothing to converge: the
 * document is drawn, and the browser does the rest.
 */
export function mountSite(container: HTMLElement): { editor: Editor; view: EditorViewDOM } {
  const schema = createSchema('site', getSiteSchemaDefinition());
  const dataStore = new DataStore(undefined, schema);

  const editor = createSiteEditor({ editable: true, schema, dataStore });
  editor.loadDocument(createSampleSite() as never, 'site');

  const doc = {
    rootId: (editor as never as { getRootId: () => string }).getRootId(),
    getNode: (sid: string) => dataStore.getNode(sid) as never
  };

  const view = new EditorViewDOM(editor, {
    container,
    registry: getGlobalRegistry(),
    /**
     * The **text** environment, which is all a page needs.
     *
     * The document and the resolvers built from it — styles, list numbering, fields. Not
     * `createWordEnv`, which also builds the layout's half: the pushes, the splits, the page
     * numbers. A site has no pages to number, and asking for that environment would have been
     * asking for maps that are always empty (`docs/specs/site-builder.md`).
     */
    env: { [WORD_ENV_KEY]: createTextEnv(doc as never) }
  } as never);

  view.render();

  // For the console and for tests, the same two handles the other two apps expose.
  window.editor = editor;
  window.editorView = view;

  return { editor, view };
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(createElement(StrictMode, null, createElement(App, { mount: mountSite })));
}
