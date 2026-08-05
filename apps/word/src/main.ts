import { DataStore } from '@barocss/datastore';
import { getGlobalRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createSchema } from '@barocss/schema';
import {
  createWordEditor,
  createWordEnv,
  createWordLayoutPass,
  getWordSchemaDefinition,
  registerWordRenderers,
  WORD_ENV_KEY,
  type SurfaceLayout
} from '@barocss/office-word';
import { createSampleDocument } from './sample-document';
import './style.css';

declare global {
  interface Window {
    editor?: any;
    editorView?: any;
    wordLayout?: Map<string, SurfaceLayout>;
  }
}

const container = document.getElementById('editor');
if (!container) throw new Error('#editor not found');

registerWordRenderers();

const schema = createSchema('word', getWordSchemaDefinition());
const dataStore = new DataStore(undefined, schema);

const editor = createWordEditor({ editable: true, schema, dataStore });
editor.loadDocument(createSampleDocument(), 'word');

const doc = {
  getNode: (id: string) => dataStore.getNode(id) as never,
  rootId: editor.getRootId()!
};

/**
 * The environment travels with the render rather than sitting in module state,
 * so it is scoped to this view: a second editor on the page would carry its own
 * and neither would see the other's.
 */
const view = new EditorViewDOM(editor, {
  container,
  registry: getGlobalRegistry(),
  env: { [WORD_ENV_KEY]: createWordEnv(doc) }
});

/**
 * Pagination measures a finished render, so the view runs it after each one and
 * renders again with the result. Nothing here has to schedule that, or decide
 * when a re-render is needed, or argue about why the loop terminates — that is
 * the pass's contract and it is stated where the pass is written.
 */
view.registerLayoutPass(
  createWordLayoutPass({
    container,
    doc,
    // This app exists to be measured, and the layout is the part worth looking
    // at: where the breaks fell, and how tall each page turned out.
    onLayout: (layouts) => {
      window.wordLayout = layouts;
    }
  })
);

view.render();

window.editor = editor;
window.editorView = view;
