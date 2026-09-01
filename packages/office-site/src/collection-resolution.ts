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
import {
  childrenOf,
  componentsOf,
  contentWithWords,
  definitionAt,
  instanceParts,
  instanceValues,
  installInstanceResolution,
  readValue,
  type CanvasAccess,
  type CanvasNode
} from '@barocss/office-canvas';
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
 * The row a **definition** is being designed against, while a reader has it open.
 *
 * ## Why a card needs one at all
 *
 * A definition drawn on its own draws its declared defaults — `상품`, `설명`, `0원` — and a card
 * designed against those is a card designed against nothing. Every real title is longer, every real
 * price has a comma in it, and the two-line description that breaks the layout is in the data rather
 * than in the placeholder. So a reader who opens the card of a product list is shown **a product**,
 * and can step through the others while they work.
 *
 * That is the whole of "edit the list's card against the data": the card is one card and the data is
 * forty rows, and the only honest way to design it is to look at the rows.
 *
 * ## Why it is not written to the document
 *
 * Because it is not about the document. Which row a designer is looking at is a fact about **this
 * reader, this minute** — the same kind of fact as which width they are editing or which panel tab
 * is open — and a document that carried it would hand the next person a card mysteriously showing
 * the eleventh product. So it lives beside the editor, and the drawing asks for it.
 *
 * Per editor rather than per module: a window can hold two of them, and a value shared by both is a
 * value that belongs to neither.
 */
export interface RowPreview {
  /** The definition being drawn against data. */
  componentId: string;
  /** What each of its variables says for this row. */
  values: Record<string, string>;
  /** Which row, and which list it came from — so the chrome can say so and offer the others. */
  collection: string;
  index: number;
}

const previews = new WeakMap<object, RowPreview>();

/**
 * The preview a reader asked for by double-clicking one row of one list.
 *
 * Built here rather than in the app, because every step of it is this file's knowledge: which
 * placement a list draws, which dataset it names, which rows that query leaves, and what the
 * placement's `field:` answers become for one of them. An app that assembled this would be an app
 * that had learned the resolution — and would go stale the first time the resolution changed.
 */
export function previewForRow(
  doc: CanvasAccess,
  collection: string,
  index: number
): RowPreview | undefined {
  const node = doc.getNode(collection);
  const template = templateOf(doc, node);
  const componentId = (template?.attributes as Record<string, unknown> | undefined)?.componentId;
  if (typeof componentId !== 'string' || !componentId) return undefined;

  const attrs = (node?.attributes ?? {}) as Record<string, unknown>;
  const dataset = datasetNamed(doc as never, attrs.source);
  const rows = rowsOf(dataset, attrs);
  const record = rows[index];
  if (!record) return undefined;

  const definition = componentsOf(doc).find((one) => one.id === componentId);
  if (!definition) return undefined;

  const values = valuesForRow(instanceValues(doc, template, definition), record);
  return {
    componentId,
    collection,
    index,
    values: Object.fromEntries(values)
  };
}

/** How many rows a list is drawing, so the chrome can offer them all. */
export function rowCountOf(doc: CanvasAccess, collection: string): number {
  const node = doc.getNode(collection);
  const attrs = (node?.attributes ?? {}) as Record<string, unknown>;
  return rowsOf(datasetNamed(doc as never, attrs.source), attrs).length;
}

/** What a reader calls one row — its first text field, which is what a list is about. */
export function rowLabelsOf(doc: CanvasAccess, collection: string): string[] {
  const node = doc.getNode(collection);
  const attrs = (node?.attributes ?? {}) as Record<string, unknown>;
  const dataset = datasetNamed(doc as never, attrs.source);
  const first = dataset?.fields?.[0];
  return rowsOf(dataset, attrs).map((record, index) => {
    const said = first ? record[first] : undefined;
    return typeof said === 'string' && said.length > 0 ? said : `${index + 1}번째`;
  });
}

/** Draw this definition against this row, from now until it is taken back with `undefined`. */
export function setRowPreview(editor: object, preview: RowPreview | undefined): void {
  if (preview) previews.set(editor, preview);
  else previews.delete(editor);
}

/** Which row a definition is being drawn against, if any. */
export function rowPreviewOf(editor: object | undefined): RowPreview | undefined {
  return editor ? previews.get(editor) : undefined;
}

/**
 * What a bound part of the previewed definition should say instead of what it holds.
 *
 * Guarded twice, and both guards earn their line. The part must be **stored inside that definition**
 * — a placement's drawn part carries a `partId` too, and rewriting those would put one row's words on
 * every card on the page. And the bind must be about `text`: a bind that sets a colour is answered by
 * the placement machinery, which knows how, and not by a function whose whole vocabulary is words.
 */
function boundWords(
  doc: CanvasAccess,
  preview: RowPreview,
  node: CanvasNode | undefined
): string | undefined {
  const partId = (node?.attributes as Record<string, unknown> | undefined)?.partId;
  if (typeof partId !== 'string' || !partId) return undefined;

  const definition = componentsOf(doc).find((one) => one.id === preview.componentId);
  if (!definition || definitionAt(doc, node?.sid as string) !== definition.sid) return undefined;

  const bind = definition.binds.find((one) => one.part === partId && one.attr === 'text');
  const said = bind ? preview.values[bind.var] : undefined;
  if (typeof said !== 'string') return undefined;

  /*
   * And **read the way the card says**, which the preview needs as much as the drawing: a designer
   * editing the post card against a row should see `2026년 8월 2일` and not the ISO the column keeps.
   * The same function the placement path uses, or the preview and the page would disagree about the
   * one thing this preview exists to show.
   */
  const declared = bind ? definition.vars.find((one) => one.name === bind.var) : undefined;
  return readValue(said, declared?.kind, declared?.format);
}

/**
 * Install the site's resolution: placements draw their definitions, lists draw their rows, and a
 * definition being designed against a row draws that row's words.
 *
 * One call, with the shared answer first and the product's second — which is the shape
 * `installInstanceResolution` was given when the deck and the page turned out to need the same
 * three lines and one different fourth.
 */
export function installSiteResolution(editor: {
  dataStore?: unknown;
  getRootId?: () => string | undefined;
}): void {
  installInstanceResolution(editor, (node, _getNode, doc) => {
    if (node?.stype === 'collection') return collectionRows(doc, node) as never;

    /*
     * The words only, and the node keeps its own sid — which is what makes the preview *editable*.
     * Resolving the definition through `instanceParts` would have been shorter and would have given
     * every part a synthetic `owner~part` id, so a reader looking at a real product could not have
     * selected the heading showing it.
     */
    const preview = rowPreviewOf(editor);
    if (!preview) return undefined;
    const said = boundWords(doc, preview, node);
    return said === undefined ? undefined : (contentWithWords(doc, node, said) as never);
  });
}
