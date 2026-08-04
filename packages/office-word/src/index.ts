/**
 * @barocss/office-word — the Word product layer.
 *
 * Word is a product over the shared Office model, not a model of its own. This
 * package owns the word-processor decisions: which node types are available,
 * how they are formatted, which keys do what, and how pages are laid out. The
 * engine below it knows none of that.
 */
export { getWordSchemaDefinition } from './word-schema';
export { WORD_KEYBINDINGS } from './word-keymap';
export { createWordEditor, createWordExtensions, type WordEditorOptions } from './word-kit';
export {
  paragraphFormatAttrs,
  characterFormatAttrs,
  pageSetupAttrs,
  tableFormatAttrs,
  tableRowFormatAttrs,
  tableCellFormatAttrs,
  revisionAttrs,
  borderAttrs,
  boxBorderAttrs,
  shadingAttrs
} from './formatting';

export {
  createStyleResolver,
  type StyleResolver,
  type EffectiveFormat,
  type FormatScope
} from './style-resolver';
export {
  createNumberingResolver,
  type NumberingResolver,
  type NumberedItem
} from './numbering-resolver';
// Re-exported for convenience; the implementation is shared because list
// levels, page numbers, notes and captions all reference the same format names.
export { formatCounter, NumberFormat, type NumberFormatValue } from '@barocss/shared';
export {
  childrenOf,
  childOfType,
  indexResources,
  walkBlocks,
  type DocumentAccess,
  type DocumentNode
} from './document-access';

export { registerWordRenderers } from './renderers';
export { setWordDocument, getWordStyles, getWordNumbering, getWordDocument } from './render-context';
export {
  paragraphCss, characterCss, pageCss, tableCss, tableCellCss,
  twipToCss, halfPointToCss, normalizeColor, type CssStyle
} from './css';

export {
  paginate,
  type MeasuredBlock,
  type Page,
  type PageFragment,
  type PaginationOptions
} from './pagination';
