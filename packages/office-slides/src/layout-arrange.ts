import type { Box } from './geometry';

/**
 * Applying a layout to a slide that already has something on it.
 *
 * ## The gesture this is
 *
 * Canva's *Layouts* tab, and the reason it is the thing readers reach for: "make this page
 * look like that one" is a question about **arrangement**, asked with content that already
 * exists. Until now a deck could say which layout a slide *follows* — which decides what its
 * formatting inherits (`layout-format.ts`) — and nothing moved.
 *
 * ## Matched by role, never by position
 *
 * The same rule the formatting cascade already follows, for the same reason and it is worth
 * repeating: a slide may have moved its title, added boxes the layout never had, or deleted
 * one. Pairing the slide's third box with the layout's third slot would move the wrong one,
 * and would do it more often the more a reader had edited — the worst failure shape there
 * is, because it looks like the tool rearranging your work at random.
 *
 * ## What it will not do
 *
 * **Nothing is added and nothing is deleted.** A box whose role the layout does not declare
 * stays exactly where it is, and a slot with no box to fill it is left empty rather than
 * filled with an empty text box. Canva does add its slots; this does not, and the reason is
 * that "apply a layout" would then be able to put content on a slide that nobody typed — a
 * box that prints as nothing, shows up in the deck's own check, and has to be found and
 * deleted. A reader who wants a subtitle adds one.
 *
 * So the answer is a list of **moves**, and a slide with nothing the layout knows about
 * answers with none — which the caller reports as "nothing happened" rather than writing an
 * entry that undoes to itself.
 */

/** A box on the slide, as this needs it: what it is for, and where it is. */
export interface Arrangeable {
  sid: string;
  role?: string;
  box: Box;
}

/** A slot in the layout: the role it is for, and the room it gives. */
export interface LayoutSlot {
  role?: string;
  box: Box;
}

/** Where one box goes, once the layout has been applied. */
export interface LayoutMove {
  sid: string;
  box: Box;
}

/**
 * The moves that put a slide's boxes into a layout's slots.
 *
 * Only the ones that **change** something: a box already in its slot is not a move, and a
 * transaction of no-ops is an undo entry a reader watches do nothing.
 *
 * One slot fills one box. Two title boxes on a slide is a document a reader can make, and
 * the second of them is not a title the layout has anywhere to put — so it keeps its place
 * rather than being stacked on top of the first.
 */
export function layoutMoves(boxes: Arrangeable[], slots: LayoutSlot[]): LayoutMove[] {
  const spare = slots.filter((slot) => !!slot.role);
  const taken = new Set<number>();
  const moves: LayoutMove[] = [];

  for (const box of boxes) {
    if (!box.role) continue;
    const found = spare.findIndex((slot, index) => !taken.has(index) && slot.role === box.role);
    if (found < 0) continue;
    taken.add(found);

    const slot = spare[found].box;
    const same =
      box.box.x === slot.x &&
      box.box.y === slot.y &&
      box.box.width === slot.width &&
      box.box.height === slot.height;
    if (same) continue;

    moves.push({
      sid: box.sid,
      box: { x: slot.x, y: slot.y, width: slot.width, height: slot.height }
    });
  }

  return moves;
}
