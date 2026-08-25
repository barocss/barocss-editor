import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { DataStore } from '@barocss/datastore';
import { data, defineDecorator, element, getGlobalRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createFontLoader, type FontLoader } from './font-loader';
import { createPrintPages } from './print-pages';
import { MATCH_STYPE } from './find-panel';
import { ANCHOR_STYPE } from './comments-pane';
import { createSchema } from '@barocss/schema';
import {
  WORD_ENV_KEY
} from '@barocss/office-text';
import {
  createWordEditor,
  createWordEnv,
  documentFontFamilies,
  printCss,
  createWordLayoutPass,
  registerPageBreakWidget,
  registerTableBreakWidget,
  PAGE_BREAK_STYPE,
  type PageBreakWidget,
  type TableBreakWidget,
  TABLE_BREAK_STYPE,
  TABLE_HEADER_REPEAT_STYPE,
  registerTableHeaderRepeat,
  getWordSchemaDefinition,
  registerWordRenderers,
  installCellSelection,
  type SurfaceLayout
} from '@barocss/office-word';
import type { Editor } from '@barocss/editor-core';
import { App } from './app';
import { createSampleDocument } from './sample-document';
import './style.css';

declare global {
  interface Window {
    editor?: any;
    editorView?: any;
    wordLayout?: Map<string, SurfaceLayout>;
    setEditingFurniture?: (id: string | undefined) => void;
    pageBreaks?: PageBreakWidget[];
    wordFonts?: FontLoader;
    wordPrintPages?: { build(): number; clear(): void };
  }
}

registerWordRenderers();
registerPageBreakWidget();
registerTableBreakWidget();
registerTableHeaderRepeat();

/**
 * How a search result is drawn.
 *
 * A decorator rather than a mark: which words a reader is looking for is not
 * part of the document, and writing it in would put a search in the undo stack
 * and in anything the document was saved to.
 */
/**
 * How commented text is marked.
 *
 * A decorator, not a mark: the `commentRef` mark is what the *document* records,
 * and this is the highlight a reader sees while the pane is open. Writing the
 * highlight into the document would put "somebody has this pane open" into
 * everything the document is saved to.
 */
defineDecorator(
  ANCHOR_STYPE,
  element('span', {
    className: (d: Record<string, any>) =>
      d?.selected ? 'w-comment-hit is-selected' : 'w-comment-hit',
    'data-bc-chrome': 'true'
  }, [data('text')])
);

defineDecorator(
  MATCH_STYPE,
  element('span', {
    // The decorator's own data arrives flattened, the same way the page break
    // widget reads its height.
    className: (d: Record<string, any>) => (d?.current ? 'w-find-hit is-current' : 'w-find-hit'),
    'data-bc-chrome': 'true'
  }, [data('text')])
);

/**
 * Build the editor into a host element.
 *
 * React owns the chrome and calls this once with a div it then leaves alone —
 * the editor owns that subtree, and a re-render must not touch it.
 */
export function mountWord(container: HTMLElement): { editor: Editor; view: EditorViewDOM; fonts: FontLoader } {

  const schema = createSchema('word', getWordSchemaDefinition());
  const dataStore = new DataStore(undefined, schema);

  const editor = createWordEditor({
    editable: true,
    schema,
    dataStore,
    // Who is reading. Supplied by the host for the same reason the instant a
    // date field shows is — an editor that invented a name would be guessing.
    author: { name: 'Jinho', date: () => '2026-08-10' }
  });
  editor.loadDocument(createSampleDocument(), 'word');

  /**
   * How many times the document has changed.
   *
   * The layout pass rebuilds the resolvers, and they cache — so it has to know
   * the document moved on even when the layout did not. Making a paragraph a
   * list adds no height and moves no page, and without this the list is in the
   * document and nowhere on the screen.
   *
   * Registered before the view, because the view listens for the same event and
   * renders from it: handlers run in the order they were added, so a counter
   * added afterwards is still on its old value when the render it is meant to
   * inform goes out.
   */
  let revision = 0;
  editor.on('editor:content.change', () => {
    revision += 1;
  });

  /**
   * The document the renderers resolve against — with a **live** root.
   *
   * A getter rather than a value, because a captured root is the wrong root the
   * moment a document is replaced: `loadDocument` makes a new one, and every
   * lookup that goes through here (a style, a numbering, a resource) would be
   * looking under a root that is no longer the document's. Word replaces nothing
   * today; the deck does, and it was measured there — a new deck's title drew in
   * `system-ui` because its theme was being looked for under the old root. Written
   * the same way here so the pair cannot disagree later.
   */
  const doc = {
    getNode: (id: string) => dataStore.getNode(id) as never,
    get rootId() {
      return editor.getRootId()!;
    }
  };

  /**
   * The environment travels with the render rather than sitting in module state,
   * so it is scoped to this view: a second editor on the page would carry its own
   * and neither would see the other's.
   */
  const view = new EditorViewDOM(editor, {
    container,
    registry: getGlobalRegistry(),
    // The instant a date field shows is the host's to supply: a renderer that
    // read the clock could not be tested and would make every layout pass look
    // like a change.
    env: { [WORD_ENV_KEY]: createWordEnv(doc, undefined, undefined, new Date('2026-08-05T09:00:00Z')) }
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
      revision: () => revision,
      now: new Date('2026-08-05T09:00:00Z'),
      splitBlocks: true,
      onPageBreaks: (breaks) => applyPageBreaks(breaks),
      onTableBreaks: (breaks) => applyTableBreaks(breaks),
      // This app exists to be measured, and the layout is the part worth looking
      // at: where the breaks fell, and how tall each page turned out.
      onLayout: (layouts) => {
        window.wordLayout = layouts;
        updatePrintStyles(layouts);
      }
    })
  );

  /**
   * Keep the print stylesheet matching the pages that were computed.
   *
   * Printing is not a second pagination — it is this one, honoured. The sheet
   * size and margins come from the layout that was actually measured, so paper
   * and screen cannot disagree about where a page ends.
   */
  let printStyle: HTMLStyleElement | undefined;
  const updatePrintStyles = (layouts: Map<string, SurfaceLayout>): void => {
    const css = printCss([...layouts.values()][0]?.metrics);
    if (!css) return;
    if (!printStyle) {
      printStyle = document.createElement('style');
      printStyle.setAttribute('data-word-print', 'true');
      document.head.appendChild(printStyle);
    }
    if (printStyle.textContent !== css) printStyle.textContent = css;
  };

  /**
   * Draw the page breaks that fall inside a paragraph.
   *
   * Decorations rather than content: where a paragraph breaks is a fact about the
   * layout, and putting it in the document would mean the text changed because the
   * window was resized.
   */
  const drawnBreaks = new Map<string, string>();

  /** What a break looks like, so an unchanged one can be left alone. */
  const shapeOf = (item: PageBreakWidget): string =>
    `${item.target.sid}:${item.target.offset}:${Math.round(item.height)}`;

  const drawnTableBreaks = new Map<string, string>();

  const applyPageBreaks = (breaks: PageBreakWidget[]): void => {
    window.pageBreaks = breaks;
    const wanted = new Map(breaks.map((item) => [item.sid, shapeOf(item)]));

    // One render for the whole set. Repagination moves many breaks at once —
    // pressing Enter near the top of the document moves every one below it — and
    // a render each was twenty-five renders for a single keystroke.
    view.batchDecorators(() => {
      // Only what actually moved. Replacing a decorator re-renders the paragraph
      // it is in, and re-rendering a long paragraph produces hundreds of DOM
      // mutations for a break that is exactly where it was.
      for (const sid of [...drawnBreaks.keys()]) {
        if (!wanted.has(sid)) {
          view.removeDecorator(sid);
          drawnBreaks.delete(sid);
        }
      }

      for (const item of breaks) {
        if (drawnBreaks.get(item.sid) === wanted.get(item.sid)) continue;
        if (drawnBreaks.has(item.sid)) view.removeDecorator(item.sid);

        view.addDecorator({
          sid: item.sid,
          stype: PAGE_BREAK_STYPE,
          category: 'inline',
          // Start and end at the same offset: this marks a position between two
          // characters, not a claim about either of them.
          target: { sid: item.target.sid, startOffset: item.target.offset, endOffset: item.target.offset },
          data: { height: item.height }
        } as never);
        drawnBreaks.set(item.sid, wanted.get(item.sid)!);
      }
    });
  };

  /** What a table's break looks like, so an unchanged one can be left alone. */
  const tableShapeOf = (item: TableBreakWidget): string =>
    `${item.rowSid}:${item.columns}:${Math.round(item.height)}:${item.header.map((c) => c.text).join('|')}`;

  /**
   * Draw the page breaks that fall between two rows of a table.
   *
   * Before the row, not after the one above it: the gap belongs to the page it
   * starts, and a table whose last row is the last thing on a page would
   * otherwise be given a gap with nothing after it.
   */
  const applyTableBreaks = (breaks: TableBreakWidget[]): void => {
    const wanted = new Map(breaks.map((item) => [item.sid, tableShapeOf(item)]));

    view.batchDecorators(() => {
      for (const sid of [...drawnTableBreaks.keys()]) {
        if (!wanted.has(sid)) {
          view.removeDecorator(sid);
          view.removeDecorator(`${sid}-header`);
          drawnTableBreaks.delete(sid);
        }
      }

      for (const item of breaks) {
        if (drawnTableBreaks.get(item.sid) === wanted.get(item.sid)) continue;
        if (drawnTableBreaks.has(item.sid)) {
          view.removeDecorator(item.sid);
          view.removeDecorator(`${item.sid}-header`);
        }

        view.addDecorator({
          sid: item.sid,
          stype: TABLE_BREAK_STYPE,
          category: 'block',
          position: 'before',
          target: { sid: item.rowSid },
          data: { height: item.height, columns: item.columns }
        } as never);

        // The header again, under the gap, so the columns are named on every
        // page the table reaches.
        if (item.header.length > 0) {
          view.addDecorator({
            sid: `${item.sid}-header`,
            stype: TABLE_HEADER_REPEAT_STYPE,
            category: 'block',
            position: 'before',
            target: { sid: item.rowSid },
            data: { cells: item.header }
          } as never);
        }
        drawnTableBreaks.set(item.sid, wanted.get(item.sid)!);
      }
    });
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

    // Opening the mode puts the caret in it. Without this a reader
    // double-clicks a header, sees it outlined, types — and the characters go
    // wherever the caret happened to be, which is usually the body text they
    // were reading. The gesture asked to edit *this*, so this is what it edits.
    if (!id) return;
    requestAnimationFrame(() => {
      const region = container.querySelector('.w-header-source.is-editing, .w-footer-source.is-editing');
      const walker = region
        ? document.createTreeWalker(region, NodeFilter.SHOW_TEXT)
        : undefined;
      const text = walker?.nextNode();
      if (!text) return;

      const range = document.createRange();
      range.setStart(text, (text.textContent ?? '').length);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
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

  /**
   * A line of the table of contents takes you to what it stands for.
   *
   * The entry is a drawing of a heading, computed on every render, so there is
   * nothing in it to edit — which leaves the click meaning the only other thing
   * it can mean. Word wants Ctrl for this because its entries are also text you
   * can type over; ours are not, so a plain click is enough and needs no
   * explaining.
   */
  container.addEventListener('click', (event) => {
    const entry = (event.target as Element | null)?.closest?.('.w-toc-entry');
    const target = entry?.getAttribute('data-toc-target');
    if (!target) return;

    const heading = container.querySelector(`[data-bc-sid="${CSS.escape(target)}"]`);
    if (!heading) return;

    heading.scrollIntoView({ block: 'center', behavior: 'smooth' });

    // ...and the caret goes with the reader, so they can start typing where they
    // asked to be.
    const text = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT).nextNode();
    if (!text) return;
    const range = document.createRange();
    range.setStart(text, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });

  // On the document, not the container: leaving the mode should not depend on
  // where the focus happens to be, and after a double-click it is often nowhere.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && editing) setEditing(undefined);
  });

  /**
   * Clicking into the document leaves the mode, which is the other way out.
   *
   * Escape alone is a way out only for somebody who knows it is. Word ends the
   * mode when you click back into the body, and a reader who does that expects
   * to be typing in the body — instead the caret stayed in the header and the
   * next thing they typed went into it.
   *
   * On the container, so the ribbon is not "clicking away": changing the font of
   * the header you are editing is part of editing it, and a toolbar that closed
   * the mode could not be used on it.
   */
  container.addEventListener('mousedown', (event) => {
    if (!editing) return;
    const target = event.target as Element | null;
    if (target?.closest?.('.w-header-source.is-editing, .w-footer-source.is-editing')) return;
    setEditing(undefined);
  });

  /**
   * The fonts the document arrives set in.
   *
   * Fetched before anything is believed about the layout. Pagination measures
   * what is on the page, so a page measured in a fallback and repainted in the
   * real face has its breaks computed for a font it is not set in — and every
   * page after the first lands wrong. The layout is run again once they are
   * here, which is the only moment the measurement is worth anything.
   */
  const fonts = createFontLoader();
  const named = documentFontFamilies(doc);
  if (named.length > 0) {
    void Promise.all(named.map((family) => fonts.ensure(family))).then(() => view.render());
  }
  window.wordFonts = fonts;

  /**
   * Pages, built only while something is printing.
   *
   * The browser's own events, so this covers the print dialog and a PDF asked
   * for programmatically alike.
   */
  const printPages = createPrintPages(() => container.querySelector('.w-document'), document, {
    prepare: () => {
      const wasEditing = editing;
      if (wasEditing === undefined) return;
      editing = undefined;
      view.render(undefined, { sync: true });
      return () => {
        editing = wasEditing;
        view.render(undefined, { sync: true });
      };
    }
  });
  printPages.attach();
  window.wordPrintPages = printPages;

  /**
   * Dragging across cells selects them.
   *
   * Installed here rather than inside the kit because it is about *pointers on
   * this container* — the kit is what can be done to a document, and this is how
   * one reader says which cells they mean. The same reason the deck's overlay
   * lives in its app.
   */
  installCellSelection(editor, container, doc as never);

  window.editor = editor;
  window.editorView = view;
  window.setEditingFurniture = setEditing;

  return { editor, view, fonts };
}

createRoot(document.getElementById('root')!).render(
  createElement(StrictMode, null, createElement(App, { mount: mountWord }))
);
