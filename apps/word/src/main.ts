import { DataStore } from '@barocss/datastore';
import { getGlobalRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createSchema } from '@barocss/schema';
import {
  createWordEditor,
  getWordSchemaDefinition,
  registerWordRenderers,
  setWordDocument
} from '@barocss/office-word';
import { createSampleDocument } from './sample-document';
import './style.css';

declare global {
  interface Window {
    editor?: any;
    editorView?: any;
  }
}

const container = document.getElementById('editor');
if (!container) throw new Error('#editor not found');

registerWordRenderers();

const schema = createSchema('word', getWordSchemaDefinition());
const dataStore = new DataStore(undefined, schema);

const editor = createWordEditor({ editable: true, schema, dataStore });
editor.loadDocument(createSampleDocument(), 'word');

/**
 * Point the renderers at the document, and keep them pointed at it.
 *
 * The resolvers cache — numbering is a single ordered walk, styles memoise their
 * chains — so a stale context renders old list numbers and old styles. Rebuilding
 * on every content change is the simple correct thing; making it incremental is
 * an optimisation to reach for only if a profile says so.
 */
const syncRenderContext = () => {
  setWordDocument({
    getNode: (id: string) => dataStore.getNode(id) as never,
    rootId: editor.getRootId()!
  });
};
syncRenderContext();
editor.on('editor:content.change', syncRenderContext);

const view = new EditorViewDOM(editor, { container, registry: getGlobalRegistry() });
view.render();

// For browser-driven checks; this app exists to be measured.
window.editor = editor;
window.editorView = view;
