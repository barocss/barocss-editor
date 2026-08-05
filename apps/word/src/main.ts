import { DataStore } from '@barocss/datastore';
import { getGlobalRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createSchema } from '@barocss/schema';
import {
  createWordEditor,
  createWordEnv,
  createWordLayoutPass,
  registerPageBreakWidget,
  PAGE_BREAK_STYPE,
  type PageBreakWidget,
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
    setEditingFurniture?: (id: string | undefined) => void;
    pageBreaks?: PageBreakWidget[];
  }
}

const container = document.getElementById('editor');
if (!container) throw new Error('#editor not found');

registerWordRenderers();
registerPageBreakWidget();

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
/**
 * Which header or footer is being edited.
 *
 * A mode rather than a document property: it is a fact about what this reader is
 * doing, and two people editing the same document are not editing the same
 * header.
 */
let editing: string | undefined;

view.registerLayoutPass(
  createWordLayoutPass({
    container,
    doc,
    editing: () => editing,
    // Off until the churn below is dealt with: replacing the break decorators
    // re-renders the whole paragraph, and the MutationObserver reads those
    // renderer mutations as user input. See page-break-widget.
    splitBlocks: false,
    onPageBreaks: (breaks) => applyPageBreaks(breaks),
    // This app exists to be measured, and the layout is the part worth looking
    // at: where the breaks fell, and how tall each page turned out.
    onLayout: (layouts) => {
      window.wordLayout = layouts;
    }
  })
);

/**
 * Draw the page breaks that fall inside a paragraph.
 *
 * Decorations rather than content: where a paragraph breaks is a fact about the
 * layout, and putting it in the document would mean the text changed because the
 * window was resized.
 */
let drawnBreaks: string[] = [];

const applyPageBreaks = (breaks: PageBreakWidget[]): void => {
  window.pageBreaks = breaks;
  const wanted = breaks.map((item) => item.sid);
  if (wanted.join(',') === drawnBreaks.join(',')) return;

  for (const sid of drawnBreaks) view.removeDecorator(sid);
  for (const item of breaks) {
    view.addDecorator({
      sid: item.sid,
      stype: PAGE_BREAK_STYPE,
      category: 'inline',
      // Start and end at the same offset: this marks a position between two
      // characters, not a claim about either of them.
      target: { sid: item.target.sid, startOffset: item.target.offset, endOffset: item.target.offset },
      data: { height: item.height }
    } as never);
  }
  drawnBreaks = wanted;
};

view.render();

/**
 * Double-click a header or footer to edit it, Escape to leave — which is what
 * Word does, and for the same reason: the drawn copies are not the document, so
 * there has to be a moment where the real one takes their place.
 */
const setEditing = (id: string | undefined) => {
  if (editing === id) return;
  editing = id;
  view.render();
};

/**
 * Which drawn header or footer a point falls in.
 *
 * By coordinates rather than by event target: the drawn copies are chrome and
 * take no pointer events, so a double-click on a header lands on the page
 * beneath it. That is also what Word does — you double-click the *area*, not the
 * text — and it means the gesture works on a page whose header happens to be
 * empty.
 */
const furnitureAt = (x: number, y: number): string | undefined => {
  for (const el of Array.from(container.querySelectorAll('.w-header, .w-footer'))) {
    const rect = el.getBoundingClientRect();
    if (x < rect.left || x > rect.right) continue;
    // Generous vertically: the drawn line is a few pixels tall and the margin
    // around it is what the reader is aiming at.
    if (y < rect.top - 24 || y > rect.bottom + 24) continue;
    return el.getAttribute('data-furniture') ?? undefined;
  }
  return undefined;
};

container.addEventListener('dblclick', (event) => {
  const id = furnitureAt(event.clientX, event.clientY);
  if (id) setEditing(id);
});

// On the document, not the container: leaving the mode should not depend on
// where the focus happens to be, and after a double-click it is often nowhere.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && editing) setEditing(undefined);
});

window.editor = editor;
window.editorView = view;
window.setEditingFurniture = setEditing;
