/**
 * A list, **drawn**: one placement per row, resolved at draw time and written nowhere.
 *
 * ## Where this has to happen, and why it is the store's resolver this time
 *
 * A breakpoint override cannot live in the store's content resolver, because three views want three
 * different answers at the same instant (`breakpoints.ts`). A collection is the opposite case and it
 * is worth saying why they differ: **every view draws the same rows**. A product list is the same
 * forty products on a phone and on a desktop — what changes at a narrower width is how they are
 * arranged, which is the stack's own overrides doing their job. So the rows resolve in the one place
 * the whole document agrees: the proxy every view reads children through.
 *
 * That is also the only place they *can* resolve. A renderer that built the rows itself would
 * evaluate every one of them against the collection — the same fault measured when a renderer tried
 * to build a placement's parts, where two parts came out with the placement's box and the
 * placement's sid.
 *
 * ## What the document holds afterwards: nothing new
 *
 * One collection and one placement. Forty rows on the screen cost zero nodes, zero writes and
 * nothing to keep in step — and changing the card changes forty cards, because there is one card.
 */
import { childrenOf, instanceParts, installInstanceResolution, type CanvasAccess, type CanvasNode } from '@barocss/office-canvas';
import { datasetNamed, rowsOf, valuesForRow } from './data';

/** The one placement a collection draws for each row. */
export function templateOf(doc: CanvasAccess, node: CanvasNode | undefined): CanvasNode | undefined {
  for (const sid of childrenOf(node)) {
    const child = doc.getNode(sid) as CanvasNode | undefined;
    if (child?.stype === 'instance') return child;
  }
  return undefined;
}

/**
 * A collection's drawn children.
 *
 * Each row is an `instance` node with the definition's parts already in it, so the existing
 * placement renderer draws it: one element per row, the template's own sizing, and the parts
 * resolved exactly as a single placement's are.
 *
 * The sid is `${collection}~${index}`, which is the same shape a resolved part carries and for the
 * same two reasons — unique per drawing, so a hit test or a `querySelector` cannot answer the first
 * row for all forty; and recognisably not a document node, because `~` appears in no stored sid.
 */
export function collectionRows(doc: CanvasAccess, node: CanvasNode | undefined): CanvasNode[] {
  const template = templateOf(doc, node);
  if (!template) return [];

  const attrs = (node?.attributes ?? {}) as Record<string, unknown>;
  const dataset = datasetNamed(doc as never, attrs.source);
  // A list naming data that is not there draws nothing. Honest rather than helpful: `collectionFaults`
  // is what says *why*, in a panel, where a reader can act on it — a renderer inventing a row would
  // make a misspelt name look like working data.
  if (!dataset) return [];

  const owner = String(node?.sid ?? attrs.source ?? 'collection');

  return rowsOf(dataset, attrs).map((record, index) => ({
    ...template,
    sid: `${owner}~${index}`,
    /*
     * The row itself, on the drawn node.
     *
     * So a click, a panel or an export can ask which row it is looking at without counting siblings
     * — and so the DOM says it, which is what makes this testable from the outside.
     */
    attributes: { ...(template.attributes as Record<string, unknown>), rowIndex: index },
    content: instanceParts(doc, template, [], {
      rewrite: (values) => valuesForRow(values, record),
      owner: `${owner}~${index}`
    })
  })) as CanvasNode[];
}

/**
 * Install the site's resolution: placements draw their definitions, and lists draw their rows.
 *
 * One call, with the shared answer first and the product's second — which is the shape
 * `installInstanceResolution` was given when the deck and the page turned out to need the same
 * three lines and one different fourth.
 */
export function installSiteResolution(editor: {
  dataStore?: unknown;
  getRootId?: () => string | undefined;
}): void {
  installInstanceResolution(editor, (node, _getNode, doc) =>
    node?.stype === 'collection' ? (collectionRows(doc, node) as never) : undefined
  );
}
