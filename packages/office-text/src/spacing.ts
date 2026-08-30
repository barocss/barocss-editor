/**
 * When a paragraph does not get the space it asks for.
 *
 * Word's `contextualSpacing` — the "Don't add space between paragraphs of the
 * same style" box — is what makes a list sit tight. Every item states the space
 * a paragraph of its style gets, and every item with a neighbour of the same
 * style gives it up; the space comes back at the ends, where the list meets
 * ordinary text.
 *
 * It cannot be answered from the paragraph alone, and that is the whole of the
 * difficulty: the answer is about its neighbours. It also has to be answered the
 * same way twice — the renderer draws the margin and the paginator measures it —
 * and a disagreement between the two is a page whose blocks do not add up to its
 * height. So the rule lives here, and both ask it.
 */
import { childrenOf, type DocumentAccess, type DocumentNode } from './document-access';
import type { StyleResolver } from './style-resolver';

/** Which of a block's own spaces are suppressed. */
export interface SuppressedSpacing {
  before: boolean;
  after: boolean;
}

const NONE: SuppressedSpacing = { before: false, after: false };

/**
 * What "the same style" means for two neighbours.
 *
 * The style if they name one, and the kind of block if they do not: two list
 * items that name no style are the same thing as each other, and a heading and a
 * paragraph that name none are not. Comparing only the style id would make every
 * unstyled block in a document identical to every other.
 */
function kindOf(node: DocumentNode): string {
  const styleId = node.attributes?.styleId;
  return `${node.stype ?? ''}:${typeof styleId === 'string' ? styleId : ''}`;
}

/**
 * The spaces this block gives up because its neighbours are of its own style.
 *
 * Only the block's own flag is read, which is Word's rule and not an oversight:
 * the property says what *this* paragraph does about the space around it. Where
 * one neighbour has it and the other does not, the space between them is
 * whatever the one without it asked for.
 */
export function suppressedSpacing(
  doc: DocumentAccess | undefined,
  styles: StyleResolver | undefined,
  node: DocumentNode
): SuppressedSpacing {
  if (!doc || !styles || !node.parentId) return NONE;
  if (styles.resolveNode(node, 'paragraph').contextualSpacing !== true) return NONE;

  const siblings = childrenOf(doc, doc.getNode(node.parentId));
  const at = siblings.findIndex((each) => each.sid === node.sid);
  if (at < 0) return NONE;

  const kind = kindOf(node);
  const matches = (other: DocumentNode | undefined) => other !== undefined && kindOf(other) === kind;

  return { before: matches(siblings[at - 1]), after: matches(siblings[at + 1]) };
}

/**
 * Which of a block's four edges are **shared with a neighbour**, and so drawn as one line.
 *
 * ## What Word does, and what this drew instead
 *
 * A run of consecutive paragraphs that ask for the same borders is one bordered *box* in Word, not a
 * stack of boxes: the top border is drawn above the first, the bottom below the last, and between
 * each pair there is a single line — `w:pBdr/w:between`, the fifth border. Drawing each paragraph's
 * own top and bottom instead puts **two** lines between every pair, at twice the weight, with the
 * space between them showing through.
 *
 * `borderBetween` has been in the schema as long as the other four and nothing read it: the comment
 * over `betweenBorderAttrs` said so in as many words — *"Nothing draws it here yet."* Twelve of
 * Word's unread attributes were this one border on three node types.
 *
 * ## Why it is here rather than in `css.ts`
 *
 * For the reason this file exists at all. The answer is about the block's **neighbours**, so it
 * cannot come from the format; and it has to be answered the same way twice, because the renderer
 * draws the border and the paginator measures the height it adds. `suppressedSpacing` above is the
 * same shape and the same pair of callers.
 *
 * Two blocks share an edge when they ask for the *same* border there — a paragraph with a thin rule
 * beside one with a thick one is two boxes, and Word draws both edges. Comparing the resolved
 * values rather than the style id, because two paragraphs of different styles can land on the same
 * border and should join.
 */
export interface SharedBorders {
  /** The block above asks for the same borders, so this block's top is a shared line. */
  before: boolean;
  /** The block below does, so this block's bottom is. */
  after: boolean;
}

const UNSHARED: SharedBorders = { before: false, after: false };

/** The four values that decide whether two blocks are inside one bordered box. */
const EDGES = ['Top', 'Bottom', 'Left', 'Right'] as const;

function borderSignature(format: Record<string, unknown>): string {
  const of = (prefix: string) =>
    `${format[`${prefix}Style`] ?? ''}/${format[`${prefix}Width`] ?? ''}/${format[`${prefix}Color`] ?? ''}`;
  return EDGES.map((side) => of(`border${side}`)).join('|');
}

/** Whether a block asks for any border at all — an unbordered pair shares nothing. */
function hasAnyBorder(format: Record<string, unknown>): boolean {
  return EDGES.some((side) => {
    const style = format[`border${side}Style`];
    return typeof style === 'string' && style.length > 0 && style !== 'none';
  });
}

export function sharedBorders(
  doc: DocumentAccess | undefined,
  styles: StyleResolver | undefined,
  node: DocumentNode
): SharedBorders {
  if (!doc || !styles || !node.parentId) return UNSHARED;

  const own = styles.resolveNode(node, 'paragraph') as Record<string, unknown>;
  // A block with no borders has no edge to share, and `borderBetween` on its own is not a border:
  // it says how the line *between* two bordered blocks is drawn, not that there is one.
  if (!hasAnyBorder(own)) return UNSHARED;

  const siblings = childrenOf(doc, doc.getNode(node.parentId));
  const at = siblings.findIndex((each) => each.sid === node.sid);
  if (at < 0) return UNSHARED;

  const mine = borderSignature(own);
  const matches = (other: DocumentNode | undefined) =>
    other !== undefined &&
    borderSignature(styles.resolveNode(other, 'paragraph') as Record<string, unknown>) === mine;

  return { before: matches(siblings[at - 1]), after: matches(siblings[at + 1]) };
}
