/**
 * Where a carried block would land.
 *
 * ## Why this is not in the overlay
 *
 * It was, and the browser is where it went wrong: a card dragged along its own row came out as a
 * child of the **page**, and finding out why meant a screenshot, a `console.log` and three runs of a
 * 20-second suite. Every part of the decision is arithmetic — which stack, which place in it, which
 * index that is in the parent's content — and arithmetic belongs where a test answers it in a
 * millisecond.
 *
 * What the overlay keeps is the only part that is genuinely the DOM's: **where each block is drawn**.
 * That arrives as a function, so a test can lay out a row of cards by hand and ask the same
 * questions a pointer does.
 */
import { reorderIndexAt } from '@barocss/office-canvas';
import { attrsAt } from './responsive';
import type { BreakpointId } from './breakpoints';
import { blocksIn, contentIndexFor, dropTarget } from './selection';

type Node = Record<string, any>;
type Access = { getNode: (sid: string) => Node | undefined };

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Landing {
  /** The stack it would go into. */
  parentId: string;
  /** Where in that stack's **content** — what `moveNode` takes. */
  index: number;
  /** Where in the blocks a reader can see — what the line is drawn between. */
  among: number;
  /** The line itself, in the board's own pixels. */
  line: Box;
}

export function landingFor(
  doc: Access,
  options: {
    /** The node the pointer is over, as the drawing reported it. */
    hit: string | undefined;
    /** The pointer, in the board's own pixels. */
    at: { x: number; y: number };
    page: string;
    moving: string;
    breakpoint: BreakpointId;
    /** Where a node is drawn in this board, or nothing when it is not drawn at all. */
    boxOf: (sid: string) => Box | undefined;
  }
): Landing | null {
  const { hit, at, page, moving, breakpoint, boxOf } = options;

  const parentId = dropTarget(doc, hit, page, moving);
  if (!parentId) return null;

  const container = boxOf(parentId);
  if (!container) return null;

  /*
   * The page has no `layoutMode` and is a column all the same — its renderer says so. Without this a
   * drag onto the page itself would ask about an arrangement nobody wrote down and get "no order",
   * which is the one answer that leaves a reader holding a block they cannot put down.
   */
  const attrs = attrsAt(doc.getNode(parentId)?.attributes ?? {}, breakpoint);
  const arrangement =
    parentId === page ? 'column' : typeof attrs.layoutMode === 'string' ? attrs.layoutMode : 'none';

  const others = blocksIn(doc, parentId)
    .filter((sid) => sid !== moving)
    .map((sid) => ({ sid, box: boxOf(sid) }))
    .filter((one): one is { sid: string; box: Box } => !!one.box);

  const among = reorderIndexAt(
    others.map((one) => ({
      sid: one.sid,
      box: { x: one.box.left, y: one.box.top, width: one.box.width, height: one.box.height }
    })) as never,
    at,
    arrangement as never,
    moving
  );
  if (among < 0) return null;

  return {
    parentId,
    index: contentIndexFor(doc, parentId, moving, among),
    among,
    line: lineFor(container, others.map((one) => one.box), among, arrangement === 'column')
  };
}

/**
 * The line a reader steers by.
 *
 * Across the stack for a column and along it for a row, at the leading edge of the block it would go
 * before — or the trailing edge of the last one, when it would go after everything. An empty stack
 * gets a short mark inside it, because a line spanning nothing is a line nobody can see.
 *
 * A grid is drawn like a row on purpose: the index is right (`reorderIndexAt` reads a grid the way it
 * is written), and a line between two cells of a wrapped grid is a shape rather than a line. Said
 * out loud so the next reader knows it is a decision.
 */
function lineFor(container: Box, boxes: Box[], among: number, across: boolean): Box {
  const before = boxes[among];
  const last = boxes[boxes.length - 1];

  const edge = before
    ? across
      ? before.top
      : before.left
    : last
      ? across
        ? last.top + last.height
        : last.left + last.width
      : across
        ? container.top + 4
        : container.left + 4;

  return across
    ? { left: container.left, top: edge - 1, width: Math.max(container.width, 8), height: 2 }
    : { left: edge - 1, top: container.top, width: 2, height: Math.max(container.height, 8) };
}
