/*
 * The box vocabulary is `canvas-box.ts` now.
 *
 * This file had its **own** `boxOf`, with the same normalisation as the deck's and a comment saying
 * it was written again rather than imported because the dependency runs the other way. That was
 * true and it was still two copies of one rule — so the rule moved down to where both can reach it,
 * which is what this package is for.
 */
export type { Box } from './canvas-box';
import { boxOf, type Box } from './canvas-box';

/**
 * A frame that arranges what is in it.
 *
 * In `office-word` rather than in `office-slides`, and not because a document
 * arranges frames. The canvas is *already* Word's — `shapes.ts`, `canvasBlock`
 * and the shape renderers all live here and Slides overrides them — and a frame
 * is reachable in a Word document through `canvasBlock`, which holds `scene*`.
 * Two products disagreeing about where a frame's children go would mean one
 * file drawn two ways, which is the test `docs/SHARED-LAYER.md` sets for what
 * has to be shared.
 *
 * `layoutMode` was declared with the canvas nodes and read by nothing until
 * this. What it buys a deck is the half of presentation work that is not
 * writing: three boxes in a row with an even gap, which *stays* even when a
 * fourth arrives or the second one grows.
 *
 * ## Into the model, not into CSS
 *
 * The browser could do this with `display: flex` and static children, and it
 * would be wrong here. A slide **places** — `x` and `y` say where a box is, the
 * selection handles are drawn from them, the panel reads them, an exporter
 * writes them — so a layout only CSS knew about would leave every one of those
 * describing something that is not on the screen. The decision is written up in
 * `docs/specs/canvas-model.md`; this is the arithmetic it implies.
 *
 * Pure, and therefore testable in milliseconds: settings and sizes in,
 * positions out. Nothing here touches a document.
 */

export type LayoutMode = 'none' | 'row' | 'column' | 'grid';

/** What a frame says about the arrangement. Every length is twips. */
export interface FrameLayout {
  mode?: unknown;
  gap?: unknown;
  padding?: unknown;
  alignItems?: unknown;
  columns?: unknown;
}

/** One child, as the arrangement needs it: a size, and what it asks of the frame. */
export interface LaidOutChild {
  sid: string;
  box: Box;
  /**
   * That it fills the frame **across** the arrangement's axis.
   *
   * The half of Figma's auto-layout that this had none of. Measured before it existed: widening
   * a frame from 6000 to 10000 twips moved its children (`x: 0 → 4000`, re-centred on the new
   * width) and left every one of them its old size — so a card built out of a frame could be
   * made wider and its rows would sit in the middle of it, which is not what anybody means by
   * a wider card.
   *
   * A boolean rather than a per-edge constraint: "as wide as its frame" is the case that comes
   * up, and the general answer (what is pinned to which edge, what scales) is a layout model
   * this schema does not have — see `docs/BACKLOG.md`.
   */
  stretch?: boolean;
  /**
   * Its share of what is left **along** the axis.
   *
   * `flex-grow`'s meaning, with the child's own size as the basis: the leftover room is shared
   * out in proportion. Nothing **shrinks** — a frame too small for its children overflows, which
   * is what a canvas does everywhere else in this engine, and shrinking is a separate decision
   * with its own minimum-size question.
   */
  grow?: number;
}

/** What the arrangement decides for one child: where it goes, and how big it is. */
export interface LaidOutPlace {
  x: number;
  y: number;
  /** Present only when the arrangement changes it — a stretch or a share of the room. */
  width?: number;
  height?: number;
}

const number = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** The mode a frame is in, with anything unrecognised meaning none. */
export function layoutModeOf(attributes: FrameLayout | undefined): LayoutMode {
  const mode = attributes?.mode;
  return mode === 'row' || mode === 'column' || mode === 'grid' ? mode : 'none';
}

/** Whether a frame arranges what is in it, which decides what a drag means. */
export function laysOut(attributes: Record<string, unknown> | undefined): boolean {
  return layoutModeOf({ mode: attributes?.layoutMode }) !== 'none';
}

/**
 * Which place in the order a drag inside an arranging frame means.
 *
 * ## Why a drag has to mean *something*
 *
 * A frame that arranges owns its children's coordinates (canvas-model §5), so a drag of
 * one of them has nowhere to go: measured — `setBoxGeometry` reported success, the layout
 * put the shape straight back, and pressing undo did nothing because the reader's own
 * entry restored the number the layout had already restored. A gesture that reports
 * success and changes nothing is the worst of the three possible answers.
 *
 * The other two are refusing it and giving it a meaning. Refusing leaves a reader holding
 * a shape they cannot put anywhere; the meaning is the one every auto-layout tool settled
 * on — **the order**, which is the one thing about an arranged child that is still the
 * reader's to decide.
 *
 * ## Here rather than in a pointer handler
 *
 * The same reason `positionFromRow` is in the model: an off-by-one is a drag that
 * reorders backwards, which is the one fault a reader cannot explain. And the index is
 * one *without the moving shape in the list*, because that is what `moveNode` takes — it
 * removes first and inserts into the shortened array.
 */
export function reorderIndexAt(
  /** The siblings in document order, boxed in the same space as `at`. */
  items: { sid: string; box: { x: number; y: number; width: number; height: number } }[],
  at: { x: number; y: number },
  mode: LayoutMode,
  /** The shape being dragged, which is not one of the places it can go. */
  moving?: string
): number {
  // A frame that does not arrange gives a drag its plain meaning — a move — so there is
  // no order to answer about. −1 rather than 0, which is a real position and would
  // silently send the shape to the front.
  if (mode === 'none') return -1;

  const others = items.filter((item) => item.sid !== moving);
  if (others.length === 0) return 0;

  const centre = (item: (typeof others)[number]) => ({
    x: item.box.x + item.box.width / 2,
    y: item.box.y + item.box.height / 2
  });

  let before = 0;
  for (const item of others) {
    const middle = centre(item);
    if (mode === 'row') {
      if (middle.x < at.x) before += 1;
      continue;
    }
    if (mode === 'column') {
      if (middle.y < at.y) before += 1;
      continue;
    }
    /**
     * A grid is read the way it is written: earlier rows first, then left to right.
     *
     * The row is decided by the shape's own half-height rather than a fixed band, because
     * a grid of cards and a grid of thumbnails have nothing in common but their order.
     */
    const band = item.box.height / 2;
    if (middle.y < at.y - band) before += 1;
    else if (Math.abs(middle.y - at.y) <= band && middle.x < at.x) before += 1;
  }

  return Math.max(0, Math.min(before, others.length));
}

/**
 * Where each child goes, in the frame's own coordinates.
 *
 * Returns only the children whose position *changes*, which is what lets the
 * reaction that calls this run on every content change without feeding itself:
 * an empty answer is a document that already agrees with its frames.
 *
 * The cross-axis is where `alignItems` applies — `start`, `center` or `end`
 * against the tallest item in a row, or the widest in a column. A grid aligns
 * within its cell the same way.
 */
export function layoutChildren(
  frame: { attributes?: Record<string, unknown> } | undefined,
  children: LaidOutChild[]
): Map<string, LaidOutPlace> {
  const moved = new Map<string, LaidOutPlace>();

  const attributes = frame?.attributes ?? {};
  const mode = layoutModeOf({ mode: attributes.layoutMode });
  if (mode === 'none' || children.length === 0) return moved;

  const gap = Math.max(0, number(attributes.gap, 0));
  const padding = Math.max(0, number(attributes.padding, 0));
  const align = attributes.alignItems === 'center' || attributes.alignItems === 'end'
    ? (attributes.alignItems as 'center' | 'end')
    : 'start';

  /** Where the run sits across its axis, given how much room it is offered. */
  const across = (size: number, room: number): number => {
    if (align === 'center') return padding + Math.max(0, (room - size) / 2);
    if (align === 'end') return padding + Math.max(0, room - size);
    return padding;
  };

  /**
   * What differs, and only what differs — which is what lets the reaction that calls this run
   * on every content change without feeding itself. A size is in the answer on the same terms
   * as a position: written when the arrangement decides it and the child does not already say
   * it.
   */
  const place = (sid: string, x: number, y: number, was: Box, size?: Partial<Box>) => {
    const at: LaidOutPlace = { x: Math.round(x), y: Math.round(y) };
    if (typeof size?.width === 'number' && Math.round(size.width) !== was.width) {
      at.width = Math.round(size.width);
    }
    if (typeof size?.height === 'number' && Math.round(size.height) !== was.height) {
      at.height = Math.round(size.height);
    }
    if (at.x !== was.x || at.y !== was.y || at.width !== undefined || at.height !== undefined) {
      moved.set(sid, at);
    }
  };

  if (mode === 'row' || mode === 'column') {
    /** How much room there is across the axis, which is what a stretch fills. */
    const room = Math.max(
      0,
      (mode === 'row'
        ? number(frame?.attributes?.height, 0)
        : number(frame?.attributes?.width, 0)) -
        padding * 2
    );

    /**
     * And how much is left **along** it, for the children that asked to share it.
     *
     * The leftover after everything's own size and every gap — `flex-grow` with the child's
     * size as the basis. Never negative: a frame too small for its children overflows rather
     * than squeezing them, which is what a canvas does everywhere else here, and shrinking
     * would need a minimum size per shape to be anything but a guess.
     */
    const along = Math.max(0, number(mode === 'row' ? attributes.width : attributes.height, 0)) -
      padding * 2;
    const used =
      children.reduce(
        (total, child) => total + (mode === 'row' ? child.box.width : child.box.height),
        0
      ) + gap * Math.max(0, children.length - 1);
    const shares = children.reduce((total, child) => total + Math.max(0, child.grow ?? 0), 0);
    const spare = shares > 0 ? Math.max(0, along - used) : 0;

    /** The size this child ends up with along the axis, and across it. */
    const sizeOf = (child: LaidOutChild) => {
      const share = Math.max(0, child.grow ?? 0);
      const extra = shares > 0 && share > 0 ? (spare * share) / shares : 0;
      if (mode === 'row') {
        return {
          width: child.box.width + extra,
          height: child.stretch ? room : child.box.height
        };
      }
      return {
        width: child.stretch ? room : child.box.width,
        height: child.box.height + extra
      };
    };

    let at = padding;
    for (const child of children) {
      const size = sizeOf(child);
      if (mode === 'row') {
        // A stretched child starts at the padding: there is no room left to align it in.
        const y = child.stretch ? padding : across(size.height, room);
        place(child.sid, at, y, child.box, size);
        at += size.width + gap;
      } else {
        const x = child.stretch ? padding : across(size.width, room);
        place(child.sid, x, at, child.box, size);
        at += size.height + gap;
      }
    }
    return moved;
  }

  /**
   * A grid, by row.
   *
   * Rows are as tall as their tallest item rather than uniform, which is what
   * keeps a grid of mixed shapes from leaving holes — and what a reader means by
   * "two across" when one of them is a picture.
   */
  const columns = Math.max(1, Math.round(number(attributes.columns, 2)));
  const widths: number[] = [];
  for (let column = 0; column < columns; column += 1) {
    let widest = 0;
    for (let index = column; index < children.length; index += columns) {
      widest = Math.max(widest, children[index].box.width);
    }
    widths.push(widest);
  }

  let top = padding;
  for (let start = 0; start < children.length; start += columns) {
    const row = children.slice(start, start + columns);
    const tallest = row.reduce((most, child) => Math.max(most, child.box.height), 0);

    let left = padding;
    row.forEach((child, column) => {
      /**
       * A stretch in a grid fills its **cell**, which is the column's width.
       *
       * `grow` has no meaning here and is ignored: a grid's main axis is the one thing a grid
       * does not have — it wraps — so "a share of what is left along it" is a question with no
       * answer rather than one worth guessing at.
       */
      const size = child.stretch ? { width: widths[column], height: tallest } : undefined;
      const height = size?.height ?? child.box.height;
      const y = child.stretch
        ? top
        : align === 'center'
          ? top + (tallest - height) / 2
          : align === 'end'
            ? top + (tallest - height)
            : top;
      place(child.sid, left, y, child.box, size);
      left += widths[column] + gap;
    });

    top += tallest + gap;
  }

  return moved;
}

/**
 * Whether this child is one the arithmetic may move.
 *
 * A frame holds placed things on a canvas and ordinary blocks in a document,
 * and only the first kind has anywhere to be put. Writing `x` and `y` onto a
 * paragraph would be writing coordinates into a node that has no use for them
 * and no renderer that reads them — the value would sit in the document,
 * survive a save, and mean nothing.
 *
 * A size is what separates the two, and truthfully rather than by luck: the
 * schema requires a width and a height of every scene node, because a shape of
 * no stated size cannot be drawn, and no flow block has either. A frame is the
 * one node that may be either kind, and its own size is exactly what says which
 * — a frame placed on a canvas is given one, and a frame in the flow takes the
 * column's width and has none.
 *
 * Not `x`, which every scene node has a default `0` for, so a shape that has
 * genuinely never been placed is indistinguishable from one placed at the
 * origin.
 */
function isPlaced(attributes: Record<string, unknown> | undefined): boolean {
  const stated = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
  return stated(attributes?.width) || stated(attributes?.height);
}

/**
 * A **placement**'s children that were told to fill it.
 *
 * The one other container that sizes what is in it, and the reason it is here rather than in
 * `office-slides`: a placement (`instance`) is a canvas node in the shared schema, and this is
 * the file that knows what "fill your container" means. It is not the frame's arrangement —
 * a placement has no `layoutMode`, no gap and no order — it is the single sentence that makes a
 * card resizable: *what was told to fill the card is as big as the card.*
 *
 * A group is deliberately not on this list. Its box is **derived** from its children (measured:
 * writing 8000×4000 onto a group came back 2000×1000), so sizing a child from the group's box
 * would be a loop between two answers to the same question.
 *
 * Answers what differs, like `layoutChildren`, so the reaction that calls it cannot feed itself.
 */
/**
 * Whether a container **sizes** the children that were told to fill it.
 *
 * The question `setBoxLayout` has to ask before it offers 가득: filling a container that puts
 * nothing anywhere is a setting nothing would read. A frame answers it through `laysOut`; these
 * two answer it by being containers whose box is a decision rather than a consequence.
 *
 * A `component` is on the list beside an `instance` because a definition being *edited* has to
 * show what a placement of it will draw — the part fills the card on the definition's own surface
 * too, or the reader designs one thing and places another.
 */
export function fillsChildren(node: { stype?: string } | undefined): boolean {
  return node?.stype === 'instance' || node?.stype === 'component';
}

export function fillChildren(
  container: { attributes?: Record<string, unknown> } | undefined,
  children: LaidOutChild[]
): Map<string, LaidOutPlace> {
  const filled = new Map<string, LaidOutPlace>();
  const width = number(container?.attributes?.width, 0);
  const height = number(container?.attributes?.height, 0);
  if (width <= 0 || height <= 0) return filled;

  for (const child of children) {
    if (!child.stretch) continue;
    const at: LaidOutPlace = { x: 0, y: 0 };
    if (Math.round(width) !== child.box.width) at.width = Math.round(width);
    if (Math.round(height) !== child.box.height) at.height = Math.round(height);
    if (at.x !== child.box.x || at.y !== child.box.y || at.width !== undefined || at.height !== undefined) {
      filled.set(child.sid, at);
    }
  }
  return filled;
}

/**
 * The children of a frame, in document order, as the arrangement needs them.
 *
 * Flow children are left out rather than laid out — see `isPlaced`. A frame of
 * paragraphs therefore answers "nothing moves", and its arrangement is the CSS
 * `frameCss` writes, which is the browser's business and better at it.
 */
export function childrenToLayOut(
  getNode: (sid: string) => { sid?: string; stype?: string; attributes?: Record<string, unknown> } | undefined,
  content: unknown
): LaidOutChild[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((sid): sid is string => typeof sid === 'string')
    .map((sid) => ({ sid, node: getNode(sid) }))
    .filter((entry) => !!entry.node && isPlaced(entry.node.attributes))
    .map((entry) => ({
      sid: entry.sid,
      box: boxOf(entry.node!.attributes as never),
      /*
       * What the child asks of the frame, read from the child — because it is the child's
       * decision: two rows in one frame, one filling its width and one keeping its own, is an
       * ordinary card.
       */
      stretch: entry.node!.attributes?.layoutStretch === true,
      grow: number(entry.node!.attributes?.layoutGrow, 0)
    }));
}
