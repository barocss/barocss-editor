/** A box, as the arrangement needs it. The same shape `office-slides` uses. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A box with its negatives normalised.
 *
 * A width may be negative — that is how a line says it runs right to left — and
 * an arrangement wants the rectangle either way. Written here rather than
 * imported from Slides' geometry, which is the package that depends on this one
 * and not the other way round.
 */
function boxOf(attributes: Record<string, unknown> | undefined): Box {
  const number = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const x = number(attributes?.x);
  const y = number(attributes?.y);
  const width = number(attributes?.width);
  const height = number(attributes?.height);
  return {
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
    width: Math.abs(width),
    height: Math.abs(height)
  };
}

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

/** One child, as the arrangement needs it: a size and nothing else. */
export interface LaidOutChild {
  sid: string;
  box: Box;
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
): Map<string, { x: number; y: number }> {
  const moved = new Map<string, { x: number; y: number }>();

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

  const place = (sid: string, x: number, y: number, box: Box) => {
    const at = { x: Math.round(x), y: Math.round(y) };
    if (at.x !== box.x || at.y !== box.y) moved.set(sid, at);
  };

  if (mode === 'row' || mode === 'column') {
    const room = Math.max(
      0,
      (mode === 'row'
        ? number(frame?.attributes?.height, 0)
        : number(frame?.attributes?.width, 0)) -
        padding * 2
    );

    let along = padding;
    for (const child of children) {
      if (mode === 'row') {
        place(child.sid, along, across(child.box.height, room), child.box);
        along += child.box.width + gap;
      } else {
        place(child.sid, across(child.box.width, room), along, child.box);
        along += child.box.height + gap;
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
      const y = align === 'center'
        ? top + (tallest - child.box.height) / 2
        : align === 'end'
          ? top + (tallest - child.box.height)
          : top;
      place(child.sid, left, y, child.box);
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
    .map((entry) => ({ sid: entry.sid, box: boxOf(entry.node!.attributes as never) }));
}
