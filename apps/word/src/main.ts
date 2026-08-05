import { DataStore } from '@barocss/datastore';
import { getGlobalRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createSchema } from '@barocss/schema';
import {
  createWordEditor,
  createWordEnv,
  getWordSchemaDefinition,
  layoutSurface,
  measureBlocks,
  registerWordRenderers,
  sheetMetrics,
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
    relayout?: () => void;
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
 * Hand the document to the templates, and keep handing it to them.
 *
 * The environment travels with the render rather than sitting in module state,
 * so it is scoped to this view: a second editor on the page would carry its own
 * and neither would see the other's. The resolvers cache — numbering is a single
 * ordered walk, styles memoise their chains — so it is rebuilt whenever the
 * document or its layout changes. Making that incremental is an optimisation to
 * reach for only if a profile says so.
 */
const view = new EditorViewDOM(editor, {
  container,
  registry: getGlobalRegistry(),
  env: { [WORD_ENV_KEY]: createWordEnv(doc) }
});
view.render();

/**
 * Measure what was rendered, decide where the pages break, and render again.
 *
 * The second render is not a fallback for a bad first one — it is inherent. Line
 * breaking is the browser's answer to a width, and pagination is a question
 * about the answer, so there is nothing to paginate until something has been
 * laid out. What makes the loop terminate is that applying a layout only ever
 * changes vertical position: pushes are top margins, and a top margin cannot
 * change where a line breaks. So the second measurement returns what the first
 * one did, and there is no third pass.
 */
const relayout = (): void => {
  const styles = createWordEnv(doc).styles;

  const layouts = new Map<string, SurfaceLayout>();
  // Found by class rather than by node type: renderer-dom does not stamp
  // data-bc-stype, and the app knows its own renderers either way.
  for (const el of Array.from(container.querySelectorAll('.w-surface'))) {
    const sid = el.getAttribute('data-bc-sid');
    const node = sid ? dataStore.getNode(sid) : undefined;
    if (!sid || !node) continue;

    const metrics = sheetMetrics(styles.resolveNode(node as never, 'page'));
    const blocks = measureBlocks(el as HTMLElement, doc, styles);
    layouts.set(sid, layoutSurface(blocks, metrics));
  }

  view.setEnv({ [WORD_ENV_KEY]: createWordEnv(doc, layouts) });
  view.render();

  // This app exists to be measured, and the layout is the part worth looking at:
  // where the breaks fell, and how tall each page turned out.
  window.wordLayout = layouts;
};

relayout();
window.relayout = relayout;

// Editing changes heights, so the breaks are recomputed after the content
// settles. The render inside relayout() does not itself fire content.change, so
// this does not recurse.
editor.on('editor:content.change', () => queueMicrotask(relayout));

// For browser-driven checks; this app exists to be measured.
window.editor = editor;
window.editorView = view;
