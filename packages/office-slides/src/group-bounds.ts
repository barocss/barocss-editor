import { boxOf, type Box, type Placement } from './geometry';
import { unionOf } from './manipulate';

/**
 * A group's box, brought back into agreement with what is in it.
 *
 * A group is not a shape a reader drew — it is the fact that these things move
 * together — so its rectangle has one honest value: the bounds of its children.
 * Nothing kept it there. Moving a child out of a group is legitimate in the
 * model, and it left the group's own rectangle describing an area its contents
 * had left: measured, a child nudged 6000 twips to the right stuck that far out
 * of a group whose width never changed. Everything that reads a group's box —
 * the handles, the marquee, the hit test, aligning against it — was then reading
 * a rectangle that meant nothing.
 *
 * ## Why the children move too
 *
 * A child's coordinates are its *container's*, so a group's origin is the zero
 * its children are measured from. If the bounds start above or left of that
 * origin, the group has to move to meet them — and every child has to shift by
 * the same amount in the other direction, or the whole group jumps across the
 * slide the moment one child is nudged. The rebasing is what makes this
 * invisible: the reader sees a group's outline tighten around its contents and
 * nothing else move.
 *
 * ## Why it returns differences
 *
 * The same reason the frame layout does: this runs on every content change, and
 * an answer that always writes is an answer that triggers itself forever. A
 * group that already agrees with its children produces nothing, so the first
 * pass settles it and the second finds nothing to do.
 */
export interface GroupFit {
  /** The group's new box, in its parent's coordinates. */
  group?: Box;
  /** The children that have to shift, and to where, in the group's coordinates. */
  children: Map<string, { x: number; y: number }>;
}

/** Nothing to do — the shape every caller checks for. */
const SETTLED: GroupFit = { children: new Map() };

const round = (value: number): number => Math.round(value);

/**
 * What a group's box and its children's positions should be.
 *
 * `group` is the group's own placement in its parent; `children` are the
 * children's placements in the group's coordinates, which is how the document
 * stores them.
 */
export function fitGroupToChildren(
  group: Placement | undefined,
  children: Array<{ sid: string; placement: Placement | undefined }>
): GroupFit {
  if (children.length === 0) return SETTLED;

  const current = boxOf(group);
  const bounds = unionOf(children.map((child) => boxOf(child.placement)));
  if (!bounds) return SETTLED;

  /**
   * Where the group has to be for its children to start at its origin.
   *
   * The bounds are in the group's coordinates, so a `minX` of 480 means the
   * leftmost child sits 480 inside the group and the group's left edge should
   * move right by that much.
   */
  const wanted: Box = {
    x: round(current.x + bounds.x),
    y: round(current.y + bounds.y),
    width: round(bounds.width),
    height: round(bounds.height)
  };

  const moved = new Map<string, { x: number; y: number }>();
  // Only when the origin moves does anything inside have to shift; a group that
  // merely grew to the right leaves its children exactly where they are.
  if (bounds.x !== 0 || bounds.y !== 0) {
    for (const child of children) {
      const box = boxOf(child.placement);
      const at = { x: round(box.x - bounds.x), y: round(box.y - bounds.y) };
      if (at.x !== box.x || at.y !== box.y) moved.set(child.sid, at);
    }
  }

  const sameBox =
    wanted.x === current.x &&
    wanted.y === current.y &&
    wanted.width === current.width &&
    wanted.height === current.height;

  if (sameBox && moved.size === 0) return SETTLED;
  return { group: sameBox ? undefined : wanted, children: moved };
}
