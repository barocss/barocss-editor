import { childrenOf, type DeckAccess, type DeckNode } from './deck';
import { CANVAS_NAMES, nameOfNode } from '@barocss/office-controls';
import { isVisible } from './geometry';
import { isContainerType } from './selection';

/**
 * The slide's contents as a list, in the order they are stacked.
 *
 * ## Why a list beside the canvas
 *
 * Two things a canvas cannot do. **Picking what is underneath**: a shape covered
 * by another is reached by luck — click through it, or move the thing on top out
 * of the way and put it back. And **saying where in the stack something goes**: the
 * deck has 맨 앞으로 / 앞으로 / 뒤로 / 맨 뒤로, which is four buttons for a
 * question whose answer is a *position*, and moving the fourth of six shapes to
 * second means pressing one of them twice and counting.
 *
 * Every design tool answers both with the same control, and it is the same
 * control in all of them: a dense list, one row per thing, the front at the top.
 *
 * ## Front at the top
 *
 * Document order is paint order — the last child is drawn over the others — so the
 * list is the children **reversed**. What a reader sees in front of everything is
 * what they look for at the top of a list, and a list that ran the other way would
 * be correct about the model and wrong about the reader.
 *
 * ## Why this is a model and not a component
 *
 * The rows are a question about the document: what is on this slide, what is each
 * one called, which of them is hidden or locked, which has motion. All of it is
 * answerable without a browser, which means it can be tested in milliseconds and
 * checked against the schema — see `every-drawing-can-be-named`, which exists
 * because the table below is exactly the kind that falls behind a schema quietly.
 */

/**
 * What a canvas node is called, in the reader's words.
 *
 * The one table, asked by three things: the row's badge, the name a shape gets
 * when it has no text (`labelOfBox`), and the conformance check that makes sure a
 * node type the schema declares cannot appear in a list with no name.
 *
 * It was inside `labelOfBox` and fell through to "상자" for anything it did not
 * know — which is a name a reader cannot use to tell two rows apart, and which is
 * silent. `connector`, `component` and `instance` were all in that state.
 */
/**
 * What a canvas node is called: the suite's words, plus this product's own.
 *
 * The shared ones are in `@barocss/office-controls` — a rectangle is a rectangle
 * whether it is on a slide, on a page or on a board, and two products naming them
 * separately is two tables that can disagree about what a reader is looking at.
 * These two are a deck's: nothing else in the suite puts a film on a page.
 */
const OWN: Record<string, string> = {
  mediaVideo: '동영상',
  mediaAudio: '오디오'
};

/** What this node type is called, or nothing when this product has no word for it. */
export function kindOfBox(stype: string | undefined): string | undefined {
  return nameOfNode(stype, OWN);
}

/** Every canvas node type this product can name, for the check that asks. */
export function namedKinds(): string[] {
  return [...Object.keys(CANVAS_NAMES), ...Object.keys(OWN)];
}

/**
 * What to call a box, in a list a reader reads.
 *
 * Moved here from `timeline.ts`, where it named a track, because naming belongs
 * with the table it asks: the timeline, this list, and the conformance check all
 * want one answer to "what is this shape called" and there is no reason for the
 * clock to own it.
 *
 * Its role first — "제목" says more than "텍스트 상자" — then the first words of its
 * text, then what kind of thing it is. A reader looking at four rows needs to know
 * which shape each one is about, and "textFrame" tells them nothing.
 */
export function labelOfBox(doc: DeckAccess, sid: string | undefined): string {
  const node = sid ? doc.getNode(sid) : undefined;
  if (!node) return '없는 상자';

  /**
   * Not `name`, which is not a label.
   *
   * Tried, because a conformance check reported `name` as read by nothing and a layer
   * list is where a name looks like it belongs. Two timeline tests failed at once, and
   * they were right: `name` is how **motion** names a box — `setBoxBuild` assigns
   * `shape-1`, `shape-2` as it goes, `namedBoxes` resolves a step's target through it,
   * and the deck file format is written in those names. Preferring it here put
   * `shape-2` in the timeline where `동영상` had been.
   *
   * So a reader-given name is a *different* attribute this product does not have yet,
   * and the check's exemption says what reads this one.
   */
  const role = attrString(node, 'role');
  if (role === 'title') return '제목';
  if (role === 'subtitle') return '부제목';
  if (role === 'body') return '본문';

  const text = firstText(doc, sid!, 0).trim();
  if (text) return text.length > 18 ? `${text.slice(0, 18)}…` : text;

  /**
   * What kind of thing it is, from the one table.
   *
   * The table was here and fell through to "상자" for anything it did not know —
   * silently, and `connector`, `component` and `instance` were all in that state.
   * It is `kindOfBox` in `layers.ts` now, where a conformance check can ask it
   * whether the schema has grown a node type it cannot name.
   */
  return kindOfBox(node.stype) ?? '상자';
}

function firstText(doc: DeckAccess, sid: string, depth: number): string {
  if (depth > 8) return '';
  const node = doc.getNode(sid);
  const own = (node as { text?: unknown } | undefined)?.text;
  if (typeof own === 'string') return own;
  for (const child of childrenOf(node)) {
    const found = firstText(doc, child, depth + 1);
    if (found) return found;
  }
  return '';
}

/** A node's own attribute as a string, or nothing. */
function attrString(node: DeckNode | undefined, key: string): string | undefined {
  const value = node?.attributes?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** One row of the list. */
export interface LayerRow {
  sid: string;
  /** What to write: its text, its role, or what kind of thing it is. */
  label: string;
  /** The kind, for the badge — absent when the product has no word for it. */
  kind?: string;
  /** Whether it is drawn at all. `visible: false` is the schema's own word. */
  visible: boolean;
  locked: boolean;
  /** Whether anything animates it, so a reader can see which rows have motion. */
  motion: boolean;
  selected: boolean;
  /**
   * How deep inside a group or frame it is, so the list can be indented.
   *
   * Flat with a depth rather than a tree of rows: a reader scans a stack, and the
   * one thing they are doing — "which of these is in front" — is answered by the
   * order. A tree would make two shapes' relative order unreadable whenever they
   * sit in different groups.
   */
  depth: number;
  /**
   * The name this row has **as a part of a card**, when it has one.
   *
   * Only ever set while the reader is standing inside a definition, and that is the whole of
   * what it is for now: a card's parts are the boxes in front of them, and "the badge" is a
   * different thing to be looking at from "a rectangle". A *placement's* rows no longer carry
   * one, because a placement holds no copies to carry it — what it draws is the definition, and
   * the list shows the reader's own things in its slot (§10b-2a).
   */
  partName?: string;
}

/**
 * The rows for a slide, front first.
 *
 * `animated` is passed in rather than read here: which shapes have motion is the
 * timeline's answer and it needs the deck's motion track, which is a different
 * walk of the document. Passing it keeps this function about the *stack*.
 */
export function layerRows(
  doc: DeckAccess,
  surfaceSid: string | undefined,
  where: { selected?: string[]; animated?: Set<string> } = {}
): LayerRow[] {
  if (!surfaceSid) return [];
  const surface = doc.getNode(surfaceSid);
  if (!surface) return [];

  const chosen = new Set(where.selected ?? []);
  const rows: LayerRow[] = [];

  const walk = (sid: string, depth: number) => {
    const node = doc.getNode(sid);
    if (!node) return;

    const partName = node.attributes?.partId;
    rows.push({
      sid,
      label: labelOfBox(doc, sid),
      kind: kindOfBox(node.stype),
      visible: isVisible(node.attributes as never),
      locked: node.attributes?.locked === true,
      motion: where.animated?.has(sid) === true,
      selected: chosen.has(sid),
      depth,
      ...(typeof partName === 'string' && partName.length > 0 ? { partName } : {})
    });

    /**
     * A group's children after it, and *not* reversed twice.
     *
     * The whole list is reversed at the end, so a group's children are collected
     * in document order here and come out under their parent with their own front
     * on top — the same rule at every level, applied once.
     */
    /**
     * Into a group, a frame — and a **placement**.
     *
     * A placement was left out and it was the one container a reader could not get into from
     * here: a card's badge is a real box, covered by nothing and reachable only by clicking
     * exactly on it. Which is the whole reason this list exists (picking what is underneath),
     * so leaving out the container that holds five boxes was leaving out the case.
     *
     * A placement's `componentValue` children are skipped, because they are not boxes: they are
     * what the card was *asked for*, and "값" is not a name a reader could tell one row from
     * another with. The conformance exemption for `componentValue` says exactly that, and this
     * is the code that keeps it true.
     */
    if (isContainerType(node.stype)) {
      for (const child of childrenOf(node)) {
        if (doc.getNode(child)?.stype === 'componentValue') continue;
        walk(child, depth + 1);
      }
    }
  };

  for (const child of childrenOf(surface)) walk(child, 0);

  // Front at the top: document order is paint order.
  return rows.reverse();
}

/**
 * Where a row dragged to this place in the *list* lands in the document.
 *
 * The list is reversed, so dragging a row up moves a shape *later* in its parent's
 * children — and getting that inversion wrong is a drag that reorders the stack
 * backwards, which is the one bug this control can have that a reader cannot
 * explain. So the conversion is here, with a test, rather than inline in a
 * pointer handler.
 *
 * `count` is how many children the parent has. A row dropped at the top of the
 * list is the last child; at the bottom, the first.
 */
export function positionFromRow(rowIndex: number, count: number): number {
  // Nothing to drop into. Without this the arithmetic answers −1, which is a
  // *position* no parent has: the command refuses it, so the drag would look like
  // it did nothing rather than like it could not have happened.
  if (count <= 0) return 0;

  const clamped = Math.max(0, Math.min(rowIndex, count - 1));
  return count - 1 - clamped;
}
