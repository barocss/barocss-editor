/**
 * What two products **draw text with**.
 *
 * ## Why this is a package
 *
 * `docs/SHARED-LAYER.md` asked for it and told it to wait for a third product, on an argument that
 * was true when it was written: two products give one data point about where a line falls, and
 * Slides is the product that reused everything Word had.
 *
 * What made it possible to draw the line anyway was measuring rather than arguing. `renderers.ts`
 * held the text renderers *and* `surface`, so importing the first dragged in pagination, page
 * furniture, line numbers and the contents page; the environment made it worse, because
 * `createWordEnv` computes page numbers. Splitting those two — a page half, and an environment in
 * two layers — took the text closure from 29 files and 7,220 lines to **19 files and 4,452 lines**,
 * with nothing about a page in it and nothing about a canvas either.
 *
 * ## The test each of these passes
 *
 * *Can it be stated without naming a product?* The style a paragraph inherits; the list counter that
 * precedes it; what a run's marks mean as character formatting; how a table's borders resolve onto
 * its cells; where a tab reaches. A deck and a page answering any of those differently would be one
 * of them being wrong — and the deck proved it the week it was built, when the list marker and the
 * caret filler lived in Word's stylesheet and a deck's bullets came out as four unmarked lines.
 *
 * ## What is *not* here
 *
 * Pages: `surface` drawn as sheets, the paginator, the furniture, the contents page. Those are
 * `office-word/renderers/page.ts` and the files under it.
 *
 * Drawing a canvas: Word draws a rectangle as an SVG `<rect>` and a deck draws it as a placed HTML
 * box, on purpose. Word's is `office-word/renderers/shapes.ts`; the arithmetic both share is
 * `@barocss/office-canvas`.
 */

/** The little of a document a text reader needs. */
export * from './document-access';

/** What a paragraph inherits, and from where. */
export * from './style-resolver';
export * from './numbering-resolver';
export * from './field-resolver';
export * from './formatting';
export * from './spacing';
export * from './date-field';

/** The environment a render carries, in the half that names no page. */
export * from './text-context';

/** Marks, as character formatting and as CSS. */
export * from './mark-format';
export * from './revisions';

/** Lengths, colours and the CSS a block or a run becomes. */
export * from './css';
export * from './tabs';
export * from './image-layout';

/**
 * A table's shape, its borders, and the style layers that decide them.
 *
 * `tableCss` is named rather than starred: `css.ts` has one too — the table element's own CSS —
 * and two stars would make which one a caller gets depend on the order of the lines above.
 */
export * from './table-format';
export * from './table-style';

/** The renderers themselves: text, tables, marks, equations. */
/*
 * `paintCode` was here for a round: a code block coloured by painting **ranges** over an untouched
 * flat run. It worked, and it was the wrong idea — a way to colour something rather than a way to
 * say what a code block *is*, and it made a published page depend on running a script. A site
 * tokenizes with Prism in its own renderer now (`office-site/src/code-render.ts`), which is a
 * grammar rather than a word list and puts the spans in the markup the export writes.
 */
export { registerTextRenderers } from './renderers';
export { blockLanguage, blockRevision, blockStyle, formatFor, listMarker, listTypeOf, revisionDrawing } from './renderers/block-style';
export { registerRevisionMarks, registerValuedMarks } from './renderers/marks';
export { registerMathRenderers } from './math-renderers';

/**
 * **Finding text in a document** — moved here from `office-word`, which it never knew about.
 *
 * It walks paragraphs and runs looking for characters, which is text behaviour and nothing else. The
 * deck was depending on `office-word` for it: four of the nine product-to-product edges this
 * repository had were this one file.
 */
export {
  findMatches,
  replaceMatches,
  replaceOperations,
  shiftAfter,
  step,
  type FindOptions,
  type Match
} from './find';

/**
 * **셀 선택** — 셀을 가로질러 끄는 것과, 그것이 만드는 `cell` 선택.
 *
 * `office-word` 에 있다가 여기로 왔다. 셋 중 둘이 이미 여기 있었기 때문이다: 제스처가 찾는
 * `.w-cell` 은 `renderers.ts` 가 쓰는 클래스이고, 그것을 칠하는 `[data-cell-selected]` 는
 * `text.css` 에 있다. 남은 하나만 Word 안에 있어서, 표를 가진 네 제품 중 둘만 셀을 고를 수 있었다.
 */
export {
  cellRectangle,
  cellsInRectangle,
  cellsBetween,
  cellContaining,
  rowsCovered,
  columnsCovered,
  type CellRectangle
} from './table-selection';
export {
  installCellSelection,
  isCellType,
  CELL_SELECTED_ATTRIBUTE,
  type CellSelectionHandle
} from './table-selection-view';

/**
 * **표를 다루는 명령** — `office-word` 에서 왔다.
 *
 * `office-slides` 가 `createWordTables` 하나 때문에 `office-word` 를 의존하고 있었고, 제품은
 * 제품에 의존하지 않는다(`docs/specs/architecture.md`). 그 파일이 쓰는 것은 `editor-core`·`model`
 * 과 **이 패키지** 뿐이었다 — 표는 워드의 것이 아니라 **글의 낱말** 이다.
 *
 * 이름에 `Word` 가 남은 것은 호출처 둘이 그렇게 부르기 때문이고, 이름이 옮기는 값을 막지 않는다.
 */
export {
  WordTableExtension,
  createWordTables,
  nextTextDirection,
  type WordTableOptions
} from './table-commands';

/** 쓰인 몸이 무엇으로 이루어지나 — `office-note` 에서 왔다. 왜 여기인지는 그 파일에 있다. */
export { BODY_BLOCKS, BODY_CONTENT, type BodyBlock } from './body-blocks';
