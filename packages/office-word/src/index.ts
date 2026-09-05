/**
 * @barocss/office-word — the Word product layer.
 *
 * Word is a product over the shared Office model, not a model of its own. This
 * package owns the word-processor decisions: which node types are available,
 * how they are formatted, which keys do what, and how pages are laid out. The
 * engine below it knows none of that.
 */
export { getWordSchemaDefinition } from './word-schema';
export { WORD_KEYBINDINGS, WORD_KEYS, WORD_VIEW_KEYS } from './word-keymap';
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
} from '@barocss/office-text';

export {
  createStyleResolver,
  type StyleResolver,
  type EffectiveFormat,
  type FormatScope
} from '@barocss/office-text';
export {
  createNumberingResolver,
  type NumberingResolver,
  type NumberedItem
} from '@barocss/office-text';
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
} from '@barocss/office-text';
/**
 * **셀 선택은 `office-text` 로 갔다.** 여기서 다시 내보내는 것은 이미 이 이름으로 가져다 쓰는
 * `apps/word`·`apps/slide` 때문이고, 새로 쓰는 쪽은 `@barocss/office-text` 에서 가져간다.
 *
 * 옮긴 이유: 사이트의 표 메뉴에 **셀 합치기**가 있는데 그 선택을 만드는 제스처가 Word 안에 있었다.
 * 그리고 그 제스처가 찾는 `.w-cell` 은 Word 것이 아니라 `office-text/renderers.ts` 가 쓰는
 * 클래스이고, 그것을 칠하는 `[data-cell-selected]` 도 `office-text/text.css` 에 있다 — 셋 중 둘이
 * 이미 저쪽에 있었다.
 */
export {
  cellRectangle,
  cellsInRectangle,
  cellsBetween,
  cellContaining,
  rowsCovered,
  columnsCovered,
  installCellSelection,
  isCellType,
  CELL_SELECTED_ATTRIBUTE,
  type CellRectangle,
  type CellSelectionHandle
} from '@barocss/office-text';
export {
  borderCss,
  borderOf,
  cellBorders,
  cellMargins,
  gridOf,
  type CellPosition
} from '@barocss/office-text';
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
} from '@barocss/office-text';

/**
 * The renderers, in two halves that a product may take one of.
 *
 * `registerWordRenderers` is both — text and pages — and is what Word installs. `registerTextRenderers`
 * is the half that knows nothing about pages, which is what makes it shareable: `surface` reads the
 * layout, and one file registering both meant importing text dragged in pagination, furniture, line
 * numbers and the contents page.
 */
export { registerWordRenderers } from './renderers/word';
export { registerTextRenderers } from '@barocss/office-text';
export { registerPageRenderers } from './renderers/page';
export { registerShapeRenderers } from './renderers/shapes';
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
} from '@barocss/office-text';

export {
  paginate,
  type MeasuredBlock,
  type Page,
  type PageFragment,
  type PaginationOptions
} from './pagination';

export { measureBlocks, type MeasureOptions } from './measurement';
export { suppressedSpacing, type SuppressedSpacing } from '@barocss/office-text';
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
export { flowCss, twipToPx } from '@barocss/office-text';

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

export { createFieldResolver, type FieldResolver } from '@barocss/office-text';

export { lineStartOffsets, type LineAnchor } from './line-offsets';
export { registerPageBreakWidget, PAGE_BREAK_STYPE } from './page-break-widget';
export {
  registerTableBreakWidget,
  registerTableHeaderRepeat,
  TABLE_BREAK_STYPE,
  TABLE_HEADER_REPEAT_STYPE
} from './table-break-widget';
export { formatDateField } from '@barocss/office-text';
export { printCss } from './print';
export { imageCss, isInFlow, polygonCss, type ImageAttributes, type WrapMode, type WrapSide } from '@barocss/office-text';
/*
 * **찾기는 `office-text` 로 갔습니다** — Word 를 하나도 모르는 파일이었고, 데크가 그것 하나 때문에
 * `office-word` 를 의존하고 있었습니다. 다시 내보내는 이유는 이 제품의 호출부가 짧은 import 를
 * 유지하기 위해서입니다.
 */
export {
  findMatches,
  replaceMatches,
  replaceOperations,
  shiftAfter,
  step,
  type FindOptions,
  type Match
} from '@barocss/office-text';
export {
  DEFAULT_TAB_INTERVAL,
  leaderStyle,
  resolveTab,
  tabStopsOf,
  type ResolvedTab,
  type TabAlign,
  type TabLeader,
  type TabStop
} from '@barocss/office-text';
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
  documentFontFamilies,
} from './fonts';
/* 카탈로그는 `office-controls` 의 것이다 — 여기서 다시 내보낸다. `fonts.ts` 에 이유가 있다. */
export {
  WORD_FONTS,
  WORD_FONT_SIZES,
  WORD_FONT_CATALOGUE,
  isWebFont,
  googleFontUrl,
  fontFaceSpecs,
  type FontFamily,
} from '@barocss/office-controls';


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
  WORD_TOOLBAR,
  WORD_STYLES,
  WORD_TEXT_COLOR,
  WORD_TEXT_HIGHLIGHT,
  WORD_CELL_SHADING,
  type ToolbarControl,
  type ToolbarGroup
} from './toolbar-model';
export {
  WORD_RULER,
  wordRulerAttrs,
  wordRulerCommands,
  type RulerControl
} from './ruler-model';
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
/*
 * **도형의 기하는 `office-canvas` 의 것이다** — 여기서 다시 내보낸다.
 *
 * `shapes.ts` 가 이 패키지에 있었고, 그래서 `office-site` 가 `frameCss` 하나 때문에 `office-word`
 * 를 의존했다. 제품은 제품에 의존하지 않는다(`docs/specs/architecture.md`). 그 파일이 쓰는 것은
 * `twipToPx`·`CssStyle` 뿐이었으니 워드의 것이 아니라 **그림의 낱말** 이었다.
 *
 * 다시 내보내는 것은 값이 있다: 워드의 도형을 찾는 사람이 여기서 찾는다.
 */
export { canvasCss, canvasViewBox, frameCss } from '@barocss/office-canvas';

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
  fillChildren,
  fillsChildren,
  childrenToLayOut,
  laysOut,
  reorderIndexAt,
  layoutModeOf,
  type LayoutMode,
  type LaidOutChild,
  /** What an arrangement decided about one child — read by whoever applies it. */
  type LaidOutPlace
} from '@barocss/office-canvas';
export { createLayoutCommands, CanvasLayoutExtension } from '@barocss/office-canvas';

/**
 * A **component** and what a placement of one draws.
 *
 * Here for the same reason the arrangement and the connector are, and the reason is the schema: the
 * office schema declares `component`, `instance`, `componentVar`, `componentBind` and
 * `componentValue`, so Word's canvas already has cards in its document format — it simply has
 * nothing that reads them yet. Two products reading the same node types differently is one of them
 * being wrong, which is `docs/SHARED-LAYER.md`'s rule; and every function here passes that
 * document's test for a shared thing, because none of it can be said with the word "slide" in it.
 *
 * A product keeps what needs a product: the commands (making a card out of a selection needs the
 * surface the reader is on), the panels, and importing a card from another file.
 */
export {
  componentsOf,
  componentOf,
  definitionOf,
  definitionAt,
  partIdOf,
  partSignature,
  componentSignature,
  definitionSignature,
  importComponentPlan,
  componentSourceOf,
  componentBehindSource,
  instanceVars,
  instanceValues,
  instanceResizable,
  slotNameOf,
  type ComponentDef,
  type ComponentVar,
  type ComponentBind,
  type ComponentSource,
  type ImportPlan
} from '@barocss/office-canvas';
/**
 * What a placement **draws**, resolved where a node's children are read.
 *
 * Registered as the store's content resolver by the product (`DataStore.setContentResolver`), which
 * is the one place a node's children are read for a reader. See `canvas-model.md` §10b-2a for why
 * it is there rather than in a renderer — measured both ways.
 */
export {
  instanceParts,
  /**
   * How deep a card holds a card, and why the drawing stopped when it did.
   *
   * The limit is the **cycle guard** — a card holding a badge is ordinary, a card holding itself is an
   * infinite descent — and what makes a number honest is that the deck's own check reports a document
   * that reaches it. Measured: a chain twelve deep drew nine levels and lost the rest in silence.
   */
  nestingOf,
  NEST_LIMIT,
  type NestingCut,
  /**
   * The children a node draws when its **words** come from a variable — one run, the first one's
   * formatting, the variable's characters. The same rule a card's bound part follows.
   */
  contentWithWords
} from '@barocss/office-canvas';
/**
 * The document's own **named values** — one place says what a value is, everything else says its
 * name.
 *
 * Shared for the reason the component model is: the office schema declares `variables` and
 * `variable`, so this is part of the document format both products read, and "what is this document
 * called" is a sentence with no product in it. What is *not* here is where a reference is resolved:
 * a product resolves it where it resolves its theme, because that is where a product draws.
 */
export {
  documentVars,
  documentVar,
  /**
   * The scope chain: a **page's** own declarations, then the document's.
   *
   * The narrower scope wins, which is what a page's variables are for — one exception is written
   * where it lives: a card's own declaration beats both (`instanceValues`), so carrying a card onto a
   * page cannot change what the card means.
   */
  surfaceVars,
  surfaceOf,
  varInScope,
  resolveVarValue,
  isVarRef,
  varNameOf,
  varRef,
  varUses,
  /**
   * Every place that names one — the walk the count and the **rename** both ask.
   *
   * A variable's name *is* the reference, so renaming is a migration: `renameVarPlan` answers the
   * writes and the command puts them in one transaction, or a half-renamed deck draws nothing in
   * the places it missed.
   */
  varSites,
  renameVarPlan,
  type VarSite,
  type VarRename,
  /**
   * Where an imported value came from, whether the source has moved on, and what bringing one in
   * would write.
   *
   * The brand kit's argument applied to a value: another document is not in this one, so it is a copy
   * that remembers its source (§10f). A clash **overwrites** where a card's clash renames, because a
   * variable's name *is* the reference — see `importVariablePlan`.
   */
  variableSourceOf,
  variableBehindSource,
  importVariablePlan,
  type VariableSource,
  type VariableImport,
  /**
   * What a **shape** takes from a variable, for the attributes a reference cannot sit in.
   *
   * A number, a state and a shape's words could follow a variable only inside a card, where a
   * binding is a declaration; this is that declaration for a bare shape. `UNBINDABLE` is the
   * measured half — geometry is refused, because a bound size would be drawn in one place and
   * answered in another, and the overlay reads the answer.
   */
  varBindsOf,
  boundAttrs,
  boundText,
  /**
   * A **size** a variable owns, and whether a shape has one.
   *
   * Written into the document by the pass that settles derived geometry rather than resolved at draw
   * time, and that was counted rather than argued: `boxOf` is read in 31 places across 14 files, so a
   * size that was only drawn would be answered differently by every one of them.
   */
  boundGeometry,
  sizeIsBound,
  placeIsBound,
  turnIsBound,
  UNBINDABLE,
  DRAWN_BY_WRITE,
  type VarBind,
  type DocumentVar
} from '@barocss/office-canvas';
/**
 * What a canvas reader needs of a document, and the two walks all of them do.
 *
 * `childrenOf` answers **sids** here, where the text stack's answers nodes: a canvas is addressed
 * by id (a placement names a definition, a connector remembers an end), and a fixture tree holds
 * objects where a loaded document holds sids.
 */
export {
  childrenOf as canvasChildrenOf,
  copyOf,
  /**
   * Which container **places** what is in it, and the walk to the nearest one.
   *
   * The one question the insert and the pointer both ask, and the one place two products differ: a
   * page's canvas is a `canvasBlock` in the flow, a deck's is the `surface` itself. Said without
   * naming either — a container whose children carry coordinates rather than flowing.
   */
  isCanvasContainer,
  canvasAt,
  type CanvasAccess,
  type CanvasNode
} from '@barocss/office-canvas';
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
} from '@barocss/office-canvas';

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
} from '@barocss/office-canvas';
/**
 * **표 명령은 `office-text` 의 것이다** — 여기서 다시 내보낸다.
 *
 * 위 프로세가 *"a deck needs for the same reason Word does"* 라고 적어 뒀고, 그게 바로 이것이
 * 워드의 것이 아니라는 근거였다. `office-slides` 가 그 하나 때문에 `office-word` 를 의존했고,
 * **제품은 제품에 의존하지 않는다**(`docs/specs/architecture.md`). 표는 **글의 낱말** 이다.
 */
export {
  createWordTables,
  WordTableExtension,
  type WordTableOptions
} from '@barocss/office-text';
export { nextTextDirection } from '@barocss/office-text';
export {
  createWordFrames,
  WordFrameExtension,
  frameNode,
  FRAME_LAYOUTS,
  type FrameLayout,
  type InsertFrameOptions
} from './frame-commands';
/**
 * A **drawing** in a page, and the shapes on it.
 *
 * The commands are Word's — where a new thing goes is the one question a product answers for
 * itself — and everything they compute is in `canvas-insert`, which names no product: a new shape
 * is a quarter of what holds it, in the middle, painted so it can be seen.
 */
export {
  createWordCanvasInsert,
  WordCanvasInsertExtension,
  type InsertShapeOptions
} from './canvas-insert-commands';
export {
  createWordCanvasShapes,
  WordCanvasShapeExtension,
  type MoveShapesOptions
} from './canvas-shape-commands';
/**
 * The box vocabulary, and **dragging one** — the arithmetic a canvas editor is made of.
 *
 * Moved out of the deck, which is where it was written and where it named a product three times,
 * all three as a parameter name: a resize handle, a marquee, a snap and a turned box's hit test are
 * the same problem on a page as on a slide, and this package is where the canvas lives.
 */
export { boxOf, isVisible, type Box, type Placement } from '@barocss/office-canvas';
export {
  RESIZE_HANDLES,
  moveBox,
  resizeBox,
  angleOf,
  snapAngle,
  unionOf,
  contains,
  unrotate,
  intersects,
  alignBoxes,
  distributeBoxes,
  intoFrame,
  outOfFrame,
  guidesFor,
  snapBox,
  snapResize,
  type Align,
  type Delta,
  type Guide,
  type Handle,
  type ResizeOptions
} from '@barocss/office-canvas';
export {
  SHAPE_PAINT,
  canvasNode,
  defaultShapeBox,
  shapeNode,
  textWidthOf,
  type CanvasBox,
  type PageWidth
} from '@barocss/office-canvas';
export {
  WORD_MENUS,
  wordMenuCommands,
  wordMenuEntry,
  wordMenuId,
  type WordMenu,
  type WordMenuBlock,
  type WordMenuEntry
} from './menu-model';

/**
 * 글꼴을 **가져오는** 쪽 — 목록(`office-controls`)이 아니라 그것을 실제로 싣는 일.
 *
 * 문서는 "Merriweather" 라고만 말하고 바이트가 어디서 오는지는 말하지 않는다. 그것을 정하는 것은
 * 호스트지만, *언제 기다려야 하는가* 는 제품의 것이다 — 쪽 나눔이 글자를 **재기** 때문이다.
 */
export { createFontLoader, type FontLoader } from './font-loader';

/**
 * 종이를 **만든다** — 브라우저에게 설명하지 않는다.
 *
 * React 가 필요 없으므로 루트(`.`)에서 나간다: 경계는 *React 가 필요한가* 이지 *DOM 을 만지는가*
 * 가 아니다. 그리고 `printCss` 가 이미 여기 있으니, 종이의 규칙과 종이를 만드는 것이 한 자리에 산다.
 */
export {
  createPrintPages,
  type PrintPages,
  type PrintPagesOptions
} from './print-pages';

/**
 * 이 제품이 자기를 보이는 문서 — 스키마가 약속한 것을 실제로 담은 한 벌.
 *
 * 앱의 픽스처가 아니라 **제품의 것**이다: 무엇이 문서에 들어갈 수 있는지는 `word-schema` 가 말하고,
 * 그것이 실제로 담기는 모양을 이 파일이 말한다. 앱에 두면 다음 호스트가 자기 것을 다시 쓴다.
 */
export { createSampleDocument } from './sample-document';
