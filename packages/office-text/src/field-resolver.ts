/**
 * Fields whose value is a fact about the document: caption numbers, references
 * to them, and the running heading in a header.
 *
 * All three are computed the same way and for the same reason page numbers are:
 * writing "Figure 3" into the text means the document is wrong the moment a
 * figure is inserted above it. The document stores what is referred to; what the
 * reader sees is worked out here.
 *
 * A single ordered walk, like numbering. Resolving each field where it is drawn
 * would be quadratic, and a caption's number depends on how many captions came
 * before it — which is a question about the whole document, not about the field.
 */
import { formatCounter, type NumberFormatValue } from '@barocss/shared';
import { childrenOf, walkBlocks, type DocumentAccess, type DocumentNode } from './document-access';

export interface FieldResolver {
  /** The document's title, from its metadata rather than from the flow. */
  documentTitle(): string | undefined;
  /** The document's author. */
  documentAuthor(): string | undefined;
  /** The number a caption field shows, e.g. the 3 in "Figure 3". */
  sequenceNumber(sid: string): string | undefined;
  /** What a reference to a bookmark shows, given what it asked for. */
  reference(targetId: string, format: string, fromSid?: string): string | undefined;
  /** The nearest heading in a style, which is what a running header shows. */
  styleReference(styleId: string, fromSid: string | undefined, fromBottom: boolean): string | undefined;
}

/** Text of a node, flattened. */
function textOf(doc: DocumentAccess, node: DocumentNode, depth = 0): string {
  if (depth > 32) return '';
  if (typeof node.text === 'string') return node.text;
  return childrenOf(doc, node)
    .map((child) => textOf(doc, child, depth + 1))
    .join('');
}

export function createFieldResolver(doc: DocumentAccess): FieldResolver {
  // Title and author live in docMeta, not in the flow: where a title *appears*
  // is a layout decision, and a field referring to it is asking the document
  // what it is called, not what its first heading says.
  const meta = childrenOf(doc, doc.getNode(doc.rootId)).find((child) => child.stype === 'docMeta');
  const metaText = (stype: string): string | undefined => {
    const node = childrenOf(doc, meta).find((child) => child.stype === stype);
    return node ? textOf(doc, node).trim() || undefined : undefined;
  };

  /** Caption numbers, per sequence name, in document order. */
  const sequenceNumbers = new Map<string, string>();
  /** Where each bookmark starts, and what its block says. */
  const bookmarks = new Map<string, { blockSid: string; text: string; order: number }>();
  /** Blocks in document order, so "nearest above" can be answered. */
  const order: string[] = [];
  const blocks = new Map<string, DocumentNode>();

  const counters = new Map<string, number>();
  const root = doc.getNode(doc.rootId);

  for (const block of walkBlocks(doc, root)) {
    if (!block.sid) continue;
    order.push(block.sid);
    blocks.set(block.sid, block);

    // A bookmark is a mark over a range; a reference to it shows the text of the
    // block it starts in, which is what "see Figure 3" needs to say.
    for (const mark of block.marks ?? []) {
      if (mark.stype !== 'bookmark') continue;
      const name = mark.attrs?.name;
      if (typeof name !== 'string' || bookmarks.has(name)) continue;

      // A bookmark covers a range, and a reference shows what is inside it —
      // not the whole node it happens to live in. Taking the node would make
      // "see X" quote the punctuation and the words around the bookmark too.
      const whole = textOf(doc, block);
      const range = mark.range;
      const text =
        typeof block.text === 'string' && range
          ? whole.slice(range[0], range[1])
          : whole;

      bookmarks.set(name, {
        blockSid: block.sid,
        text: text.trim(),
        order: order.length - 1
      });
    }

    // Caption numbers count per sequence: figures and tables are numbered apart
    for (const child of childrenOf(doc, block)) {
      if (child.stype !== 'fieldSeq' || !child.sid) continue;
      const sequence = child.attributes?.sequence;
      if (typeof sequence !== 'string') continue;

      const next = (counters.get(sequence) ?? 0) + 1;
      counters.set(sequence, next);

      const format = (child.attributes?.format as NumberFormatValue) ?? 'decimal';
      sequenceNumbers.set(child.sid, formatCounter(next, format));
    }
  }

  const positionOf = (sid: string | undefined): number =>
    sid === undefined ? order.length : order.indexOf(sid);

  return {
    documentTitle: () => metaText('docTitle'),
    documentAuthor: () => metaText('docAuthor'),

    sequenceNumber: (sid) => sequenceNumbers.get(sid),

    reference: (targetId, format, fromSid) => {
      const target = bookmarks.get(targetId);
      if (!target) return undefined;

      switch (format) {
        case 'aboveBelow': {
          // Word's "above"/"below", which is why the field has to know where it
          // is being read from.
          const here = positionOf(fromSid);
          return target.order < here ? 'above' : 'below';
        }
        case 'pageNumber':
          // The page a bookmark is on is a layout fact, and this resolver does
          // not have one. Reported as unresolved rather than as page 1.
          return undefined;
        default:
          return target.text;
      }
    },

    styleReference: (styleId, fromSid, fromBottom) => {
      const here = positionOf(fromSid);
      const candidates = order
        .map((sid, index) => ({ sid, index, node: blocks.get(sid)! }))
        .filter(({ node }) => node.attributes?.styleId === styleId);

      // A running header shows the heading this page is under, which is the
      // nearest one *above*. `searchFromBottom` asks for the last one instead,
      // which is what a header for a spread wants.
      const above = candidates.filter((c) => c.index <= here);
      const chosen = fromBottom ? above[above.length - 1] : above[0];
      if (!chosen) return undefined;

      return textOf(doc, chosen.node).trim() || undefined;
    }
  };
}
