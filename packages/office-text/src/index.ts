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
export { registerTextRenderers } from './renderers';
export { blockLanguage, blockStyle, formatFor, listMarker } from './renderers/block-style';
export { registerRevisionMarks, registerValuedMarks } from './renderers/marks';
export { registerMathRenderers } from './math-renderers';
