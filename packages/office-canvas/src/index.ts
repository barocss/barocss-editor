/**
 * What two products **place things with**.
 *
 * ## Why this is a package
 *
 * `docs/SHARED-LAYER.md` proposed it and told it to wait for a third product, on one argument: two
 * products give one data point about where a line is, and a third's disagreement is what makes a
 * boundary right rather than merely tidy.
 *
 * That argument was about the *text* stack, where Slides reused Word's answers wholesale. It was
 * never true of the canvas, and the doc said so in its own fourth point: these files were written
 * for a deck and Word read none of them, so the line was already drawn by which package the code
 * was written in — waiting was buying a data point about a boundary with nothing on the other side.
 *
 * It has something on the other side now. Word grew a drawing — `canvasBlock`, shapes, a selection,
 * a drag, snapping, alignment — and reads every file here. The boundary is measured rather than
 * argued: **thirteen files that import each other, `@barocss/editor-core` and `@barocss/model`, and
 * nothing else in either product.**
 *
 * ## The test each of these passes
 *
 * *Can it be stated without naming a product?* A box with its negatives normalised; a handle that
 * holds the opposite corner still; equal gaps rather than equal centres; a definition drawn live
 * wherever it is placed; a name resolved in the narrowest scope that declares it. None of those
 * sentences mentions a page or a slide, and two products answering any of them differently would be
 * one of them being wrong.
 *
 * ## What is *not* here
 *
 * Drawing. Word draws a rectangle as an SVG `<rect>` inside a `canvasBlock`; a deck draws it as a
 * placed HTML box on a `surface`. Those are two right answers, they live in the products, and a
 * shared renderer that asked which product it was rendering for would be coupled in both directions
 * rather than shared.
 *
 * Where a new thing goes, too — and that is why the two shape *command* files stayed in
 * `office-word` rather than coming here with the arithmetic they call. `insertRectangle` has to
 * answer "where am I": a deck puts a shape on the surface the reader is looking at, and a page puts
 * a drawing after the block the caret is in, walking the flow to find it. Enter and Escape are the
 * same thing again — a page always has a line available after a block and a slide has nowhere for a
 * caret to fall out to. A command in here would have had to ask which product it was serving, which
 * is coupling in both directions wearing a shared package's name.
 *
 * ## Why every name below is written out — **214 → 198**
 *
 * Five of these blocks were `export *` (connector · graph-layout · component · instance ·
 * variable). A star exports whatever the module happens to declare, so the door was **214 names**
 * while what anything outside this package ever *calls* is **134**. The widest single stretch of
 * the difference was the obstacle avoidance in `canvas-connector.ts` (`ROUTE_GAP` · `crossesBox` ·
 * `crossCount` · `clusterBoxes` · `avoidObstacles` · `avoidStraight` · `avoidCurve` ·
 * `flattenCurve`, ≈330 lines) — which is **not dead**: `routedPoints` in the same file calls all
 * eight on every route. It had no reason to be *reachable from outside*, and a star cannot say
 * that where a list can. Sixteen names left the door that way, all of them still exported by the
 * module that declares them.
 *
 * So the rule for this file: **a name is written here when something outside this package names
 * it.** Adding one is a line; it is the deciding that is meant to be visible.
 *
 * ### The 56 that are here because a product's barrel re-exports them
 *
 * The narrowing was run twice: once at 134 names, and then the four products were typechecked.
 * `office-word/src/index.ts` reported **56** and `office-slides/src/index.ts` **23** (a subset of
 * the same 56; `office-site` and `office-note` reported none). None of the 56 is called by product
 * code — a product barrel re-exports the name, and nothing asks the barrel for it. Two wide doors
 * in series, and only the outer one is closable from in here. The list is in `docs/BACKLOG.md`; the
 * fix is one `export {…}` in each product and belongs to whoever owns that file.
 *
 * ### The 8 held open for a caller that is agreed but not yet written
 *
 * `canvas-angle`'s four and the nudge payload's four came down from the products in the round
 * before this one, and the products have not switched over yet — the four angle sites and the three
 * nudge commands are named in `docs/BACKLOG.md`. Those are doors held open for a caller that is
 * already decided, which is a different thing from a door nobody asked for. Both are marked where
 * they sit, so that when the callers land nobody has to rediscover why they were open.
 */

/**
 * The little of a document a canvas reader needs, and which container **places** what is in it.
 *
 * A page's canvas is a `canvasBlock` in the flow and a deck's is the `surface` itself; the sentence
 * that covers both — *a container whose children carry coordinates* — names neither.
 */
export {
  childrenOf,
  copyOf,
  isCanvasContainer,
  canvasAt,
  type CanvasAccess,
  type CanvasNode
} from './canvas-access';

/** A box, a placement, and the normalisation a drag produces. */
export { boxOf, isVisible, type Box, type Placement } from './canvas-box';

/** Dragging one: move, resize with the modifiers, rotate, snap, marquee, align, distribute. */
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
  /*
   * …and nudging one, which is the same `Delta` arriving from a key. Three products spell the
   * payload three ways and two of the spellings are the same shape; see `canvas-manipulate.ts` for
   * which, and for the coarse step that is 144 in two products and 150 in the third.
   *
   * **Nothing outside this package calls these four yet** — the three products still each own the
   * arithmetic. They are on the door because the callers are named in `docs/BACKLOG.md`, not
   * because a caller exists.
   */
  NUDGE_FINE,
  nudgeDelta,
  isNudge,
  type Align,
  type Delta,
  type Guide,
  type Handle,
  type NudgePayload,
  type ResizeOptions
} from './canvas-manipulate';

/**
 * A turn read as a direction — `{ x: sin θ, y: −cos θ }`, and the `-0` that comes with it.
 *
 * Written out in four places across two products before this, three of which guard the negative zero
 * separately. The site builder's copy says why it was copied rather than reinvented, and that
 * reasoning is the argument for one function.
 *
 * **The four places are still the four places** — this door is open for them and nothing outside
 * this package walks through it yet (`docs/BACKLOG.md`, 각도→방향 벡터).
 */
export { directionOf, offsetAt, notMinusZero, type Direction } from './canvas-angle';

/**
 * **도형의 기하를 CSS·SVG 로** — `office-word` 에서 왔다.
 *
 * 제품이 제품에 의존하지 않는다(`docs/specs/architecture.md`). `office-site` 가 `frameCss` 하나
 * 때문에 `office-word` 를 의존하고 있었고, 그 파일이 쓰는 것은 `twipToPx`·`CssStyle` 뿐이었다 —
 * 즉 워드의 것이 아니라 **그림의 낱말** 이었다. 옮기면서 `isVisible` 두 벌도 합쳤다.
 *
 * 여기의 여덟 중 일곱은 `office-word` 만 부른다 — 그 사실과 무엇을 해야 하는지는
 * `docs/BACKLOG.md` 에 있다. `ShapeAttributes`·`ShapeGeometry`·`ShapeStyle` 은 그 함수들의
 * 인자·반환 모양이고 밖에서 이름으로 부르는 곳이 없어 문에서 뺐다.
 */
export {
  canvasCss,
  canvasViewBox,
  ellipseAttrs,
  frameCss,
  lineAttrs,
  rectangleAttrs,
  shapePaint,
  shapeTransform
} from './canvas-shapes';

/** Making something to place: a drawing, and the shapes that go on it. */
export {
  SHAPE_PAINT,
  canvasNode,
  defaultShapeBox,
  shapeNode,
  textWidthOf,
  type CanvasBox,
  type PageWidth
} from './canvas-insert';

/** A frame that arranges what is in it, and the pass that settles the geometry it decides. */
export {
  laysOut,
  layoutModeOf,
  layoutChildren,
  reorderIndexAt,
  fillsChildren,
  fillChildren,
  childrenToLayOut,
  type LaidOutChild,
  type LaidOutPlace,
  type LayoutMode
} from './canvas-layout';
export { createLayoutCommands, CanvasLayoutExtension } from './canvas-layout-commands';

/**
 * A line between two shapes that follows them.
 *
 * The geometry a deck reads by name. What is **not** here is the obstacle avoidance —
 * `ROUTE_GAP` · `crossesBox` · `crossCount` · `clusterBoxes` · `avoidObstacles` · `avoidStraight` ·
 * `avoidCurve` · `flattenCurve` — which `routedPoints` in the same file calls on every route. It
 * runs; it is simply not something a product asks for by name, and `export *` said otherwise.
 */
export {
  type Point,
  type ConnectorBox,
  type ConnectorSide,
  type ConnectorKind,
  type ConnectorSpec,
  type ConnectorEnd,
  type ConnectorCap,
  type CapDrawing,
  type ResolvedEnds,
  rotateAround,
  centreOf,
  normalOf,
  sidePoint,
  nearestSides,
  sideTowards,
  borderPoint,
  resolveEnds,
  connectorPoints,
  elbowPoints,
  curvePoints,
  arcPoints,
  avoidArc,
  throughWaypoints,
  CORNER,
  JUMP,
  segmentCrossings,
  connectorPath,
  connectorBounds,
  withoutMissing,
  withEndPlaces,
  CAP_MIN,
  capDrawing,
  capAngle,
  capSizeOf,
  capInset,
  pulledBack,
  connectorSpecOf,
  connectorCapsOf,
  connectorBoxOf,
  connectorChanges,
  MAGNET_SNAP,
  magnetPoints,
  nearestMagnet,
  connectorTrack,
  pointOnPath,
  nearestOnPath,
  LABEL_SIZE,
  LABEL_MAX,
  LABEL_INSET,
  labelBox,
  labelOf,
  labelAt,
  labelNear,
  endLabelOf,
  SEPARATION,
  separationBend,
  hasOwnBend,
  pairKeyOf,
  midHandleOf,
  canBendByDrag,
  bendFromDrag,
  readWaypoints
} from './canvas-connector';

/** The graph a board is. */
export {
  type GraphNode,
  type GraphEdge,
  type GraphDirection,
  type GraphLayoutOptions,
  type GraphPlacement,
  RANK_GAP,
  NODE_GAP,
  rankGapFor,
  layoutGraph
} from './canvas-graph-layout';

/**
 * One definition, many placements — the values a placement answers, and the one line that makes a
 * placement draw its definition on whatever store a product hands over.
 */
export {
  type ComponentDef,
  type ComponentVar,
  type ComponentBind,
  type ComponentSource,
  type ImportPlan,
  instanceVars,
  componentsOf,
  definitionOf,
  definitionAt,
  componentOf,
  partIdOf,
  slotNameOf,
  partSignature,
  definitionSignature,
  componentSignature,
  importComponentPlan,
  componentSourceOf,
  componentBehindSource,
  instanceValues,
  instanceResizable
} from './canvas-component';
/** How a value reads, which is not the same question as what it is. */
export { readValue, VALUE_FORMATS } from './value-format';
export {
  type NestingCut,
  instanceParts,
  contentWithWords,
  detachedCopyOf,
  NEST_LIMIT,
  nestingOf,
  installInstanceResolution
} from './canvas-instance';

/** A name the document declares and a shape takes its value from. */
export {
  type DocumentVar,
  type VarSite,
  type VarRename,
  type VarBind,
  type VariableSource,
  type VariableImport,
  isVarRef,
  varNameOf,
  varWeightOf,
  varRefAt,
  varRef,
  documentVars,
  documentVar,
  surfaceOf,
  surfaceVars,
  varInScope,
  resolveVarValue,
  varUses,
  varSites,
  renameVarPlan,
  DRAWN_BY_WRITE,
  UNBINDABLE,
  varBindsOf,
  boundAttrs,
  boundText,
  boundGeometry,
  sizeIsBound,
  placeIsBound,
  turnIsBound,
  variableSourceOf,
  variableBehindSource,
  importVariablePlan
} from './canvas-variable';
