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
