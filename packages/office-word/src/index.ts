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
  formatCounter,
  type NumberingResolver,
  type NumberedItem
} from './numbering-resolver';
export {
  childrenOf,
  childOfType,
  indexResources,
  walkBlocks,
  type DocumentAccess,
  type DocumentNode
} from './document-access';
