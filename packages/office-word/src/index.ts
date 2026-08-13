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
export {
  parseTableLook,
  formatTableLook,
  tableStylesOf,
  tableOf,
  bandSizesOf,
  regionsAt,
  cellPlacementOf,
  cellStyleLayers,
  tableStyleLayer,
  blockStyleLayers,
  DEFAULT_TABLE_LOOK,
  type TableLook,
  type TableStyleRegion,
  type BandSizes,
  type CellPlacement,
  type CellStyleLayers
} from './table-style';
export {
  borderCss,
  borderOf,
  cellBorders,
  gridOf,
  type CellPosition
} from './table-format';
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
export {
  createWordEnv,
  wordEnv,
  WORD_ENV_KEY,
  getWordStyles,
  getWordNumbering,
  getWordDocument,
  getWordFields,
  getWordNow,
  getWordLayout,
  getBlockPush,
  type WordEnv
} from './render-context';
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

export { measureBlocks, type MeasureOptions } from './measurement';
export {
  layoutSurface,
  sheetMetrics,
  DEFAULT_SHEET_GAP,
  type SheetMetrics,
  type SurfaceLayout
} from './layout';
export { flowCss, twipToPx } from './css';

export {
  createWordLayoutPass,
  type WordLayoutPassOptions,
  type PageBreakWidget,
  type TableBreakWidget
} from './word-layout-pass';

export {
  furnitureFor,
  furnitureTemplate,
  pageNumberFor,
  pageNumberText,
  type FurnitureBinding,
  type PageContext
} from './page-furniture';

export { tocEntries, tocPageNumber, parseLevels, type TocEntry } from './toc';

export { createFieldResolver, type FieldResolver } from './field-resolver';

export { lineStartOffsets, type LineAnchor } from './line-offsets';
export { registerPageBreakWidget, PAGE_BREAK_STYPE } from './page-break-widget';
export {
  registerTableBreakWidget,
  registerTableHeaderRepeat,
  TABLE_BREAK_STYPE,
  TABLE_HEADER_REPEAT_STYPE
} from './table-break-widget';
export { formatDateField } from './date-field';
export { printCss } from './print';
export { imageCss, isInFlow, polygonCss, type ImageAttributes, type WrapMode, type WrapSide } from './image-layout';
export {
  findMatches,
  replaceMatches,
  replaceOperations,
  shiftAfter,
  step,
  type FindOptions,
  type Match
} from './find';
export {
  DEFAULT_TAB_INTERVAL,
  leaderStyle,
  resolveTab,
  tabStopsOf,
  type ResolvedTab,
  type TabAlign,
  type TabLeader,
  type TabStop
} from './tabs';
export {
  WORD_FONT_CATALOGUE,
  isWebFont,
  googleFontUrl,
  documentFontFamilies,
  fontFaceSpecs,
  type FontFamily
} from './fonts';

export {
  currentChoice,
  inheritedChoice,
  listState,
  currentStyle,
  toolbarMarkTypes,
  toolbarCommands,
  WORD_FONTS,
  WORD_FONT_SIZES,
  WORD_TOOLBAR,
  WORD_STYLES,
  type ToolbarChoice,
  type ToolbarControl,
  type ToolbarGroup
} from './toolbar-model';
export { createWordToolbar, type WordToolbar } from './toolbar-dom';
export { createWordCommands, WordExtension } from './word-commands';
export {
  commentThreads,
  freeThreadId,
  type CommentAnchor,
  type CommentEntry,
  type CommentThread
} from './comments';
export { createWordComments, WordCommentExtension, type CommentAuthor } from './comment-commands';
export { createWordRevisions, WordRevisionExtension } from './revision-commands';
export { createWordTracking, WordTrackingExtension } from './tracking-commands';
export {
  recordDeletion,
  recordInsertion,
  backspaceTargetOffset,
  type CoveredRun,
  type Reviewer,
  type RunMark
} from './revision-record';
export {
  revisions,
  revisionAt,
  revisionById,
  revisionAfter,
  moveCounterpart,
  REVISION_KINDS,
  type Revision,
  type RevisionKind,
  type RevisionSpan
} from './revision-index';
export { dispositionOf, resolveRevisionOps, resolveAllOps, type Disposition } from './revision-resolve';
export {
  createWordListCommands,
  WordListExtension,
  numberingDefinition,
  definitionKind,
  listKindOf,
  freeNumberingId,
  listToJoin,
  INDENT_STEP,
  MAX_LIST_LEVEL,
  type ListKind
} from './list-commands';
