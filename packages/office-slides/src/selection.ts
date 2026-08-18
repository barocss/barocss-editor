import type { DeckAccess, DeckNode } from './deck';

/**
 * Which box the reader is in.
 *
 * A deck's properties panel needs to know what is selected, and a deck has two
 * kinds of selection that a document does not have to reconcile: a caret in
 * text, and a box on a surface. Multi-node selection is not built yet — it is
 * the next thing this product needs — so this answers the question that *can*
 * be answered today, and answers it exactly: **the nearest placed box above the
 * caret.**
 *
 * That is not a stand-in for node selection. It is the honest reading of where
 * the reader is when they are typing, and it is what a properties panel is for
 * most of the time: the title they are editing is in a box, and the box has a
 * position, a size and a fill.
 *
 * Pure, so the panel, the future handles and the eventual node selection all
 * read the same answer rather than three that drift.
 */

/**
 * Everything that can sit on a surface, as the office schema groups it.
 *
 * Written out rather than read from the schema at runtime because this is a
 * *product* statement — these are the types Slides places and draws — and a
 * check keeps it honest: `test/selection.test.ts` asserts the list is exactly
 * the schema's `scene` group, so a node type added to the group without a
 * thought here fails rather than being silently unselectable.
 */
export const SCENE_TYPES = [
  'frame',
  'group',
  'rectangle',
  'ellipse',
  'line',
  'connector',
  'path',
  'sticky',
  'textFrame',
  'component',
  'instance'
] as const;

export type SceneType = (typeof SCENE_TYPES)[number];

const SCENE = new Set<string>(SCENE_TYPES);

export const isSceneType = (stype: unknown): stype is SceneType =>
  typeof stype === 'string' && SCENE.has(stype);

/** A placed box, and enough about it for a panel to draw. */
export interface PlacedBox {
  sid: string;
  stype: SceneType;
  /** Which slot of the layout it fills, for a `textFrame` that says. */
  role?: string;
  attributes: Record<string, unknown>;
}

/**
 * The nearest placed box at or above a node.
 *
 * Nearest, not outermost: a shape inside a frame inside a group is three boxes
 * deep, and the one the reader means is the one they are in. Dragging the frame
 * is a separate act, reached by selecting the frame.
 *
 * Depth-limited like every other walk here — this reads an author's document,
 * and a malformed one must not take the chrome down with it.
 */
export function boxAt(doc: DeckAccess, sid: string | undefined): PlacedBox | undefined {
  let current: DeckNode | undefined = sid ? doc.getNode(sid) : undefined;
  let depth = 0;

  while (current && depth++ < 64) {
    if (isSceneType(current.stype)) {
      const attributes = current.attributes ?? {};
      const role = attributes.role;
      return {
        sid: (current.sid ?? sid) as string,
        stype: current.stype,
        role: typeof role === 'string' ? role : undefined,
        attributes
      };
    }

    const parentId = (current as { parentId?: unknown }).parentId;
    current = typeof parentId === 'string' ? doc.getNode(parentId) : undefined;
  }

  return undefined;
}

/**
 * The slide a node is on.
 *
 * Walks past every box to the `surface`, so a panel can show the slide's own
 * properties when the caret is not in a box — and so a command that needs to
 * know which slide it is editing does not have to be told.
 */
export function slideAt(doc: DeckAccess, sid: string | undefined): string | undefined {
  let current: DeckNode | undefined = sid ? doc.getNode(sid) : undefined;
  let depth = 0;

  while (current && depth++ < 64) {
    if (current.stype === 'surface') return current.sid as string | undefined;
    const parentId = (current as { parentId?: unknown }).parentId;
    current = typeof parentId === 'string' ? doc.getNode(parentId) : undefined;
  }

  return undefined;
}

/**
 * The origin a node's coordinates are measured from, in the slide's own.
 *
 * A scene node's `x` and `y` are measured from the nearest scene ancestor, and a
 * node with no scene ancestor is measured from the slide — which is the
 * container of last resort. That rule is stated in
 * `docs/specs/canvas-model.md`; this is the only code that implements it.
 *
 * The overlay implemented it inline — walking `parentId` to add the entered
 * container's origin when it read a box and taking it off when it wrote one —
 * and a clipboard would have implemented it again. Two derivations of one
 * arithmetic rule is how they come to disagree.
 *
 * Grouping is *not* one of them, though it looks like it. It rebases against a
 * frame it is in the middle of creating, so there is no node to walk to and
 * `intoFrame` — the pure one, given the box explicitly — is the right tool. The
 * difference is whether the container exists yet, and it is worth keeping the
 * two apart rather than making one serve both badly.
 *
 * Depth-limited like every other walk here: this reads an author's document.
 */
function originOf(doc: DeckAccess, containerId: string | undefined): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let current: DeckNode | undefined = containerId ? doc.getNode(containerId) : undefined;
  let depth = 0;

  while (current && depth++ < 64) {
    if (!isSceneType(current.stype)) break;
    const attributes = current.attributes ?? {};
    if (typeof attributes.x === 'number') x += attributes.x;
    if (typeof attributes.y === 'number') y += attributes.y;
    const parentId = (current as { parentId?: unknown }).parentId;
    current = typeof parentId === 'string' ? doc.getNode(parentId) : undefined;
  }

  return { x, y };
}

/** Anything with a position; the size travels untouched. */
export interface Positioned {
  x: number;
  y: number;
  [key: string]: unknown;
}

/**
 * A box in its container's coordinates, expressed in the slide's.
 *
 * `sid` is the node the box *belongs to* — its own container is walked from
 * there — so a caller that has just read a node's attributes can convert them
 * without first working out where the node lives.
 *
 * Only `x` and `y` change. A width is a width in any container, since nothing
 * here scales, and rotation is about a box's own centre.
 */
export function toSurface<T extends Positioned>(doc: DeckAccess, sid: string, box: T): T {
  const parentId = (doc.getNode(sid) as { parentId?: unknown } | undefined)?.parentId;
  const origin = originOf(doc, typeof parentId === 'string' ? parentId : undefined);
  return { ...box, x: box.x + origin.x, y: box.y + origin.y };
}

/**
 * A box in the slide's coordinates, expressed in a container's.
 *
 * The other direction, and the one a paste needs: a shape copied out of a frame
 * and dropped on the slide keeps the place it looked like it was in, which means
 * its numbers have to change.
 *
 * `containerId` is the container the box is going *into*, which is the whole
 * difference from `toSurface` — a move across containers has two of them, and
 * naming the destination is what makes that visible at the call site.
 */
export function fromSurface<T extends Positioned>(
  doc: DeckAccess,
  containerId: string | undefined,
  box: T
): T {
  const origin = originOf(doc, containerId);
  return { ...box, x: box.x - origin.x, y: box.y - origin.y };
}
