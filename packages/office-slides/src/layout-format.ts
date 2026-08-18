import { characterFormatAttrs, paragraphFormatAttrs } from '@barocss/office-word';
import { deckSlides, layoutPlaceholderSids, type DeckAccess, type DeckNode } from './deck';
import { boxAt, slideAt } from './selection';

/**
 * Where a slide's formatting comes from.
 *
 * Word resolves formatting through a cascade, root-first and later winning:
 * document defaults, then the style's `basedOn` ancestors, then whatever is set
 * on the node itself. A deck had nothing. `slideLayout` was in the schema, was
 * drawn (hidden), and was read by exactly one thing — `insertSlide`, which
 * copies a layout's placeholders into a new slide and then leaves the copy on
 * its own.
 *
 * That is why the deck's font controls showed "—" for text that plainly has a
 * font: the ribbon deliberately did not pass Word's `inherited` resolver,
 * because a deck's answer would have been wrong.
 *
 * The order, settled in `docs/specs/canvas-model.md`:
 *
 *   1. the deck's defaults
 *   2. the layout's placeholder **of the same role**
 *   3. direct formatting on the node
 *
 * ## Why role and not position
 *
 * A slide may have moved its title, added boxes the layout never had, or
 * deleted one. Pairing a slide's third box with the layout's third box would
 * silently format the wrong one, and would do it more often the more a reader
 * had edited — which is the worst possible failure shape for formatting. A box
 * whose role the layout does not declare inherits nothing, which is the honest
 * answer rather than a guess.
 *
 * ## What a paragraph inside a placeholder inherits from
 *
 * The placeholder's paragraph at the same index, and the last one after that.
 * PowerPoint formats a body placeholder *per outline level* — level one bold and
 * large, level two smaller — and this is the nearest thing to that which the
 * schema can express today, since a paragraph here carries no level of its own.
 * Written down rather than smoothed over: a real per-level cascade needs the
 * schema to say what a level is, and that is a decision this does not make.
 */

/** What is being asked for, in the same two scopes Word resolves. */
export type DeckFormatScope = 'paragraph' | 'character';

const PARAGRAPH_KEYS = new Set(Object.keys(paragraphFormatAttrs()));
const CHARACTER_KEYS = new Set(Object.keys(characterFormatAttrs()));

/**
 * Keys that describe *where a placeholder is*, not how its text looks.
 *
 * A layout's title sits at a particular place on the slide and a slide's title
 * may have been moved off it. Cascading these would drag every title on every
 * slide back to where the layout's is, the first time anybody asked what font
 * it was in.
 */
const NEVER_CASCADE = new Set([
  'role',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'opacity',
  'locked',
  'visible'
]);

function keysFor(scope: DeckFormatScope): Set<string> {
  return scope === 'paragraph' ? PARAGRAPH_KEYS : CHARACTER_KEYS;
}

/** Only the formatting a scope owns, and never a placeholder's position. */
function formatOnly(
  attributes: Record<string, unknown> | undefined,
  scope: DeckFormatScope
): Record<string, unknown> {
  const keys = keysFor(scope);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (NEVER_CASCADE.has(key)) continue;
    if (!keys.has(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

const childrenOf = (node: DeckNode | undefined): string[] =>
  Array.isArray(node?.content)
    ? (node!.content as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];

/**
 * The layout placeholder a box inherits from, or nothing.
 *
 * Exported because "which placeholder is this box following" is a question a
 * panel will want to show a reader, and answering it twice is how the panel and
 * the resolver come to disagree.
 */
export function placeholderFor(doc: DeckAccess, sid: string | undefined): DeckNode | undefined {
  const box = boxAt(doc, sid);
  if (!box?.role) return undefined;

  const slide = slideAt(doc, sid);
  if (!slide) return undefined;

  const layoutId = deckSlides(doc).find((entry) => entry.sid === slide)?.layoutId;
  if (!layoutId) return undefined;

  /**
   * The live node, not `layoutPlaceholders`' copy. A copy's children are nested
   * nodes rather than sids, so reading the paragraphs that carry the formatting
   * would find nothing — which is exactly what it did.
   */
  return layoutPlaceholderSids(doc, layoutId)
    .map((sid) => doc.getNode(sid))
    .find((candidate) => candidate?.attributes?.role === box.role);
}

/**
 * The effective formatting for a node, following the layout.
 *
 * `sid` is any node inside a box — a paragraph, a run, or the box itself. The
 * answer is what the node's *block* would be formatted as, which is what a
 * toolbar control needs in order to show a font that nothing on the slide sets
 * directly.
 */
export function resolveDeckFormat(
  doc: DeckAccess,
  sid: string | undefined,
  scope: DeckFormatScope
): Record<string, unknown> {
  const node = sid ? doc.getNode(sid) : undefined;
  if (!node) return {};

  const placeholder = placeholderFor(doc, sid);
  const inherited = placeholder ? fromPlaceholder(doc, placeholder, node, scope) : {};

  return { ...inherited, ...formatOnly(node.attributes, scope) };
}

/**
 * What the placeholder contributes, for the paragraph this node is in.
 *
 * The placeholder's own attributes first — a `verticalAlign` belongs to the box
 * — then the paragraph at the matching index, so a title's size comes from the
 * layout's title paragraph rather than from the box that holds it.
 */
function fromPlaceholder(
  doc: DeckAccess,
  placeholder: DeckNode,
  node: DeckNode | undefined,
  scope: DeckFormatScope
): Record<string, unknown> {
  const own = formatOnly(placeholder.attributes, scope);

  const paragraphs = childrenOf(placeholder);
  if (paragraphs.length === 0 || !node) return own;

  const index = indexOfBlock(doc, node);
  const chosen = paragraphs[Math.min(index, paragraphs.length - 1)];
  const paragraph = chosen ? doc.getNode(chosen) : undefined;

  return { ...own, ...formatOnly(paragraph?.attributes, scope) };
}

/**
 * Which block of its box a node is in, counting from zero.
 *
 * Walks up to the block that sits directly inside a scene node, so a run three
 * levels deep answers for the paragraph it belongs to rather than for itself.
 */
function indexOfBlock(doc: DeckAccess, node: DeckNode): number {
  let current: DeckNode | undefined = node;
  let depth = 0;

  while (current && depth++ < 64) {
    const parentId: unknown = (current as { parentId?: unknown }).parentId;
    const parent: DeckNode | undefined =
      typeof parentId === 'string' ? doc.getNode(parentId) : undefined;
    if (!parent) return 0;

    // The box's own children are its blocks; anything above that is a run.
    if (parent.stype === 'textFrame' || parent.stype === 'sticky') {
      const at = childrenOf(parent).indexOf((current.sid ?? '') as string);
      return at < 0 ? 0 : at;
    }

    current = parent;
  }

  return 0;
}
