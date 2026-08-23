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
  betweenBorderAttrs,
  boxBorderAttrs,
  insideBorderAttrs,
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
  cellOf,
  bandSizesOf,
  regionsAt,
  cellPlacementOf,
  cellStyleLayers,
  rowRegionsAt,
  rowPlacementOf,
  rowStyleLayer,
  rowFormat,
  tableStyleLayer,
  blockStyleLayers,
  DEFAULT_TABLE_LOOK,
  type TableLook,
  type TableStyleRegion,
  type BandSizes,
  type CellPlacement,
  type CellStyleLayers,
  type RowPlacement
} from './table-style';
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
export {
  borderCss,
  borderOf,
  cellBorders,
  cellMargins,
  gridOf,
  type CellPosition
} from './table-format';
// Re-exported for convenience; the implementation is shared because list
// levels, page numbers, notes and captions all reference the same format names.
export { formatCounter, NumberFormat, type NumberFormatValue } from '@barocss/shared';
export {
  childrenOf,
  childOfType,
  documentSettings,
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
  paragraphCss, characterCss, pageCss, tableCss, tableRowCss, tableCellCss, shadingCss,
  rowClipHeight, verticalTextCss,
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
export { suppressedSpacing, type SuppressedSpacing } from './spacing';
export {
  lineNumberingOf,
  lineNumbersOf,
  type LineNumbering,
  type LineNumberMark
} from './line-numbers';
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
  lineNumberTemplate,
  pageNumberFor,
  pageNumberText,
  type FurnitureBinding,
  type FurnitureSwitches,
  type PageContext
} from './page-furniture';

export { tocEntries, tocPageNumber, parseLevels, type TocEntry } from './toc';

/**
 * Word's `1-1`: a page number carrying the number of the chapter it is in.
 *
 * Pure, and separate from the furniture that calls it, because which chapter a
 * page is under is arithmetic over the headings and the layout — the kind that
 * is worth testing in milliseconds rather than in a browser.
 */
export {
  chapterAt,
  chapterNumber,
  chapterSeparator,
  pageNumberWithChapter
} from './chapter-numbering';

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
  TWIPS_PER_INCH,
  TAB_ALIGN_CYCLE,
  SNAP,
  toPixels,
  toTwips,
  snap,
  ticksFor,
  stopsToDraw,
  stopAt,
  withStop,
  nextAlign,
  markersOf,
  draggedTo,
  type RulerScale,
  type RulerTicks,
  type IndentMarkers
} from './ruler';
export {
  WORD_FONT_CATALOGUE,
  isWebFont,
  googleFontUrl,
  documentFontFamilies,
  fontFaceSpecs,
  type FontFamily
} from './fonts';

export {
  choiceOptions,
  currentChoice,
  inheritedChoice,
  listState,
  tableLookState,
  cellAttributeState,
  currentStyle,
  toolbarMarkTypes,
  toolbarCommands,
  toolbarIcons,
  currentPaletteColor,
  WORD_FONTS,
  WORD_FONT_SIZES,
  WORD_TOOLBAR,
  WORD_STYLES,
  WORD_TEXT_COLOR,
  WORD_TEXT_HIGHLIGHT,
  WORD_CELL_SHADING,
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

/**
 * The canvas's own measurements.
 *
 * Exported so the check that both products measure the model in the same unit
 * can see Word's half of it — see `office-slides/test/one-unit.test.ts`. A
 * claim about two packages agreeing has to be testable from a place that can
 * see both.
 */
export { canvasCss, canvasViewBox, frameCss } from './shapes';

/**
 * A frame that arranges what is in it.
 *
 * Canvas behaviour, which is this package's — `shapes.ts` and the shape
 * renderers are here and a frame is reachable in a Word document through
 * `canvasBlock`. Slides installs the same extension, so one document arranges
 * the same way in both.
 */
export {
  layoutChildren,
  childrenToLayOut,
  laysOut,
  reorderIndexAt,
  layoutModeOf,
  type LayoutMode,
  type LaidOutChild
} from './canvas-layout';
export { createLayoutCommands, CanvasLayoutExtension } from './canvas-layout-commands';
/**
 * A line that remembers **what it joins** — the canvas's, for the same reason the
 * arrangement is: a connector is a scene node, and two products with two answers for
 * where a line leaves a circle would be one document drawn two ways.
 *
 * See `docs/specs/canvas-model.md` §8 for the decisions this holds to.
 */
export {
  borderPoint,
  capAngle,
  capDrawing,
  capInset,
  capSizeOf,
  CAP_MIN,
  centreOf,
  connectorBoxOf,
  connectorBounds,
  connectorCapsOf,
  connectorChanges,
  connectorPath,
  segmentCrossings,
  JUMP,
  connectorPoints,
  connectorSpecOf,
  curvePoints,
  magnetPoints,
  nearestMagnet,
  labelAt,
  labelNear,
  endLabelOf,
  LABEL_INSET,
  labelBox,
  labelOf,
  arcPoints,
  avoidArc,
  connectorTrack,
  midHandleOf,
  CORNER,
  bendFromDrag,
  canBendByDrag,
  nearestOnPath,
  pairKeyOf,
  separationBend,
  hasOwnBend,
  SEPARATION,
  pointOnPath,
  readWaypoints,
  throughWaypoints,
  LABEL_MAX,
  LABEL_SIZE,
  MAGNET_SNAP,
  elbowPoints,
  nearestSides,
  normalOf,
  pulledBack,
  resolveEnds,
  rotateAround,
  sidePoint,
  sideTowards,
  withEndPlaces,
  withoutMissing,
  type CapDrawing,
  type ConnectorBox,
  type ConnectorCap,
  type ConnectorEnd,
  type ConnectorKind,
  type ConnectorSide,
  type ConnectorSpec,
  type Point,
  type ResolvedEnds
} from './canvas-connector';

/**
 * Tidying a diagram: where the shapes go, given what joins them. The canvas's, like the
 * connector geometry beside it — the slides product re-exports both.
 */
export {
  layoutGraph,
  rankGapFor,
  RANK_GAP,
  NODE_GAP,
  type GraphNode,
  type GraphEdge,
  type GraphDirection,
  type GraphLayoutOptions,
  type GraphPlacement
} from './canvas-graph-layout';
/**
 * Word's table commands, which a deck needs for the same reason Word does: the
 * shared kit's were written for a schema without the header/body group between a
 * table and its rows, and both products store tables with it.
 */
export {
  createWordTables,
  WordTableExtension,
  nextTextDirection,
  type WordTableOptions
} from './table-commands';
export {
  createWordFrames,
  WordFrameExtension,
  frameNode,
  FRAME_LAYOUTS,
  type FrameLayout,
  type InsertFrameOptions
} from './frame-commands';
