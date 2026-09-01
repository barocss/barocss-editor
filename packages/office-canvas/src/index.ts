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
  type Align,
  type Delta,
  type Guide,
  type Handle,
  type ResizeOptions
} from './canvas-manipulate';

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
  type FrameLayout,
  type LaidOutChild,
  type LaidOutPlace,
  type LayoutMode
} from './canvas-layout';
export { createLayoutCommands, CanvasLayoutExtension } from './canvas-layout-commands';

/** A line between two shapes that follows them, and the graph a board is. */
export * from './canvas-connector';
export * from './canvas-graph-layout';

/**
 * One definition, many placements — the values a placement answers, and the one line that makes a
 * placement draw its definition on whatever store a product hands over.
 */
export * from './canvas-component';
/** How a value reads, which is not the same question as what it is. */
export { readValue, VALUE_FORMATS } from './value-format';
export * from './canvas-instance';

/** A name the document declares and a shape takes its value from. */
export * from './canvas-variable';
