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
