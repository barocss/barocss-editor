import { jumpToWordBookmark } from '@barocss/office-word/ui';
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { DataStore } from '@barocss/datastore';
import { getGlobalRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createSchema } from '@barocss/schema';
import {
  WORD_ENV_KEY
} from '@barocss/office-text';
import {
  exportWordDocx,
  readWordDocx,
  createFontLoader,
  createPrintPages,
  createSampleDocument,
  createStarterDocument,
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
  TABLE_CELL_BREAK_STYPE,
  TABLE_HEADER_REPEAT_STYPE,
  registerTableHeaderRepeat,
  getWordSchemaDefinition,
  registerWordRenderers,
  installCellSelection,
  installWordTableResize,
  installTocCompositionPreview,
  type FontLoader,
  type SurfaceLayout
} from '@barocss/office-word';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { App } from './app';
import { createMergedCellSample, createStaggeredCellSample } from './merged-cell-sample';
import { createReferenceSample } from './reference-sample';
import { createCaptionSample } from './caption-sample';
import { createStyleManagementSample } from './style-management-sample';
import { createFormatPainterSample } from './format-painter-sample';
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

/*
 * **주석 하이라이트와 찾기 하이라이트는 이제 패키지가 그린다.**
 *
 * 두 템플릿이 여기 있어서 `office-word` 는 자기 주석 닻을 그릴 수 없었다 — 이 앱 밖에서 뷰를
 * 세우면 *"Component not found for decorator type 'w-comment-anchor', using fallback div"* 가 뜨고
 * `w-comment-hit` 없는 `div` 가 그려졌다. `packages/office-word/src/highlight-decorators.ts` 로
 * 옮겼고, 그 파일이 import 될 때 등록된다 — `CommentsPane` 과 `FindPanel` 이 그 파일에서
 * 자기 stype 을 가져오므로, 둘 중 하나를 쓰면 그리는 법도 함께 온다.
 */

/**
 * Build the editor into a host element.
 *
 * React owns the chrome and calls this once with a div it then leaves alone —
 * the editor owns that subtree, and a re-render must not touch it.
 */
export function mountWord(container: HTMLElement, onFurniture?: (id?: string) => void): { editor: Editor; view: EditorViewDOM; fonts: FontLoader; editFurniture: (id?: string) => void } {

  const schema = createSchema('word', getWordSchemaDefinition());
  const dataStore = new DataStore(undefined, schema);

  const editor = createWordEditor({
    editable: true,
    schema,
    dataStore,
    // Who is reading. Supplied by the host for the same reason the instant a
    // date field shows is — an editor that invented a name would be guessing.
    author: { name: 'Jinho', date: () => new Date().toISOString().slice(0, 10) }
  });
  const demo = new URLSearchParams(location.search);
  editor.loadDocument(demo.get('sample') === 'captions' ? createCaptionSample() : ['references', 'references-docx'].includes(demo.get('sample') ?? '') ? createReferenceSample() : demo.get('sample') === 'styles' ? createStyleManagementSample() : demo.get('sample') === 'format-painter' ? createFormatPainterSample()
    : demo.get('sample') === 'merged-cell-rows' ? createStaggeredCellSample()
    : demo.get('sample') === 'merged-cell-columns' ? createMergedCellSample(false, true)
    : demo.get('sample') === 'merged-cell-lines' ? createMergedCellSample(true)
    : demo.get('sample') === 'merged-cell' ? createMergedCellSample()
    : demo.has('sample') || demo.has('lab') ? createSampleDocument() : createStarterDocument(), 'word');
  if (demo.get('sample') === 'references-docx') {
    const file = exportWordDocx(editor.exportDocument());
    editor.loadDocument(readWordDocx(file.bytes, 'DOCX 참조 교환').document, 'word');
  }

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
  installTocCompositionPreview(editor, container);
  // Inline pictures are objects. A click selects the picture, not a text offset beside it.
  container.addEventListener('mousedown', event => {
    if (event.button !== 0 || event.shiftKey) return;
    const image = (event.target as Element | null)?.closest('img.w-image');
    const id = image?.getAttribute('data-bc-sid');
    if (!id || dataStore.getNode(id)?.stype !== 'inline-image') return;
    event.preventDefault();
    event.stopPropagation();
    view.contentEditableElement.focus({ preventScroll: true });
    editor.updateSelection({ selection: { type: 'node', nodeIds: [id], startNodeId: id, endNodeId: id,
      startOffset: 0, endOffset: 0, collapsed: false }, applySelectionToView: true });
  }, true);

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
  let bodySelection: ModelSelection | null | undefined;
  let editingRoot: string | null | undefined;


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
  const drawnTableHeaders = new Map<string, string[]>();
  const removeTableHeaders = (sid: string) => {
    for (const id of drawnTableHeaders.get(sid) ?? []) view.removeDecorator(id);
    drawnTableHeaders.delete(sid);
  };

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
    `${item.rowSid}:${JSON.stringify(item.cell)}:${item.pageGapStart}:${item.pageGapHeight}:${item.columns}:${Math.round(item.height)}:${JSON.stringify(item.headerRows)}:${item.headerRowHeights.map(height => height.toFixed(2)).join(',')}`;

  /**
   * Draw the page breaks that fall between two rows of a table.
   *
   * Before the row, not after the one above it: the gap belongs to the page it
   * starts, and a table whose last row is the last thing on a page would
   * otherwise be given a gap with nothing after it.
   */
  const applyTableBreaks = (breaks: TableBreakWidget[]): void => {
    // Repeated cells are chrome, so they do not go through the model renderer.
    // Read the original cells after style resolution to keep their appearance.
    const styledBreaks = breaks.map(item => ({ ...item, headerRows: item.headerRows.map(row => row.map(cell => {
      const source = cell.sourceSid ? container.querySelector(`[data-bc-sid="${CSS.escape(cell.sourceSid)}"]`) : null;
      const style: Record<string, string> = {};
      if (source) {
        const computed = getComputedStyle(source);
        for (const property of ['backgroundColor', 'color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
          'textAlign', 'verticalAlign', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
          'borderTop', 'borderRight', 'borderBottom', 'borderLeft'] as const) style[property] = computed[property];
      }
      return { ...cell, style };
    })) }));
    const wanted = new Map(styledBreaks.map((item) => [item.sid, tableShapeOf(item)]));

    view.batchDecorators(() => {
      for (const sid of [...drawnTableBreaks.keys()]) {
        if (!wanted.has(sid)) {
          view.removeDecorator(sid);
          removeTableHeaders(sid);
          drawnTableBreaks.delete(sid);
        }
      }

      for (const item of styledBreaks) {
        if (drawnTableBreaks.get(item.sid) === wanted.get(item.sid)) continue;
        if (drawnTableBreaks.has(item.sid)) {
          view.removeDecorator(item.sid);
          removeTableHeaders(item.sid);
        }

        if (item.cell) {
          const anchor = item.cell.inline;
          view.addDecorator({ sid: item.sid, stype: TABLE_CELL_BREAK_STYPE,
            ...(anchor ? { category: 'inline', target: { sid: anchor.sid, startOffset: anchor.offset, endOffset: anchor.offset } }
              : { category: 'block', position: item.cell.after ? 'after' : 'before', target: { sid: item.cell.blockSid } }),
            data: item } as never);
          drawnTableBreaks.set(item.sid, wanted.get(item.sid)!);
          continue;
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
        const headerIds: string[] = [];
        for (const [index, cells] of item.headerRows.entries()) {
          const sid = index === 0 ? `${item.sid}-header` : `${item.sid}-header-${index}`;
          headerIds.push(sid);
          view.addDecorator({
            sid,
            stype: TABLE_HEADER_REPEAT_STYPE,
            category: 'block',
            position: 'before',
            target: { sid: item.rowSid },
            data: { cells, height: item.headerRowHeights[index] }
          } as never);
        }
        drawnTableHeaders.set(item.sid, headerIds);
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
  const setEditing = (id: string | undefined, restoreBody = true) => {
    if (editing === id) return;
    if (id && !editing) {
      bodySelection = editor.selection ? { ...editor.selection } : undefined;
      editingRoot = editor.getRootId();
    }
    editing = id;
    onFurniture?.(id);
    view.render();

    // Opening the mode puts the caret in it. Without this a reader
    // double-clicks a header, sees it outlined, types — and the characters go
    // wherever the caret happened to be, which is usually the body text they
    // were reading. The gesture asked to edit *this*, so this is what it edits.
    if (!id) {
      const saved = bodySelection;
      if (restoreBody && saved && editingRoot === editor.getRootId() && dataStore.getNode(saved.startNodeId)) {
        requestAnimationFrame(() => {
          if (editing || editingRoot !== editor.getRootId()) return;
          view.contentEditableElement.focus({ preventScroll: true });
          editor.updateSelection({ selection: saved, applySelectionToView: true });
        });
      }
      return;
    }
    requestAnimationFrame(() => {
      if (editing !== id) return;
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
  const followReference = (event: MouseEvent | KeyboardEvent) => {
    const field = (event.target as Element | null)?.closest?.('.w-field-ref[data-linked="true"]');
    const name = field?.getAttribute('data-target');
    if (!name || (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key))) return;
    event.preventDefault(); event.stopPropagation();
    jumpToWordBookmark(editor, view, name, field?.getAttribute('data-target-kind') ?? 'bookmark');
  };
  container.addEventListener('click', followReference, true);
  container.addEventListener('keydown', followReference, true);

  container.addEventListener('click', (event) => {
    const entry = (event.target as Element | null)?.closest?.('.w-toc-entry');
    const target = entry?.getAttribute('data-toc-target');
    if (!target) return;

    /*
     * **Unless the field says its entries are not links.** `useHyperlinks` is one of the three
     * things a `tableOfContents` says about itself that nothing read: an entry always took a reader
     * to its heading, so turning the switch off did nothing at all. The renderer writes the answer
     * out; this is the half of it that decides what a press does.
     */
    if (entry?.getAttribute('data-linked') === 'false') return;

    const heading = container.querySelector(`[data-bc-sid="${CSS.escape(target)}"]`);
    if (!heading) return;

    heading.scrollIntoView({ block: 'center', behavior: 'smooth' });

    const firstText = (sid: string): string | undefined => {
      const node = dataStore.getNode(sid);
      if (typeof node?.text === 'string') return sid;
      for (const child of node?.content ?? []) { const found = firstText(String(child)); if (found) return found; }
    };
    const sid = firstText(target);
    if (!sid) return;
    view.contentEditableElement.focus({ preventScroll: true });
    editor.updateSelection({ selection: { type: 'range', startNodeId: sid, endNodeId: sid, startOffset: 0, endOffset: 0, collapsed: true }, applySelectionToView: true });
  });

  container.addEventListener('keydown', event => {
    const entry = (event.target as HTMLElement)?.closest<HTMLElement>('[data-toc-target][data-linked="true"]');
    if (entry && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); entry.click(); }
  }, true);

  // On the document, not the container: leaving the mode should not depend on
  // where the focus happens to be, and after a double-click it is often nowhere.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && editing && !(event.target as Element)?.closest?.('[role=dialog]')) setEditing(undefined);
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
    setEditing(undefined, false);
  });
  editor.on('editor:content.change', (event?: { transaction?: unknown }) => {
    if (editing && (event?.transaction === null || editingRoot !== editor.getRootId())) setEditing(undefined, false);
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
  installWordTableResize(editor, container);

  window.editor = editor;
  window.editorView = view;
  window.setEditingFurniture = setEditing;

  return { editor, view, fonts, editFurniture: setEditing };
}

createRoot(document.getElementById('root')!).render(
  createElement(StrictMode, null, createElement(App, { mount: mountWord }))
);
