/**
 * Footnotes: which page each body belongs on, and how much room it takes there.
 *
 * A footnote is referenced from the flow by a `footnoteRef` mark and its body
 * lives in `resources`. What the reader sees is the body at the foot of the page
 * holding the reference — which means the body competes for space with the very
 * paragraph that referenced it, and pagination has to know that before it
 * decides where the page ends.
 *
 * The height of a body is a property of the body at a given width, not of the
 * page it lands on, and pagination never changes the width. That is what keeps
 * this from being circular: heights are measured once, the reservation follows
 * from them, and the breaks follow from the reservation.
 */
import { childrenOf, type DocumentAccess, type DocumentNode } from '@barocss/office-text';

/** Footnote ids referenced from a block, in the order they appear in it. */
export function footnoteRefsIn(doc: DocumentAccess, block: DocumentNode): string[] {
  const ids: string[] = [];

  const walk = (node: DocumentNode, depth: number): void => {
    if (depth > 32) return;
    for (const mark of node.marks ?? []) {
      if (mark.stype !== 'footnoteRef') continue;
      const id = mark.attrs?.id;
      if (typeof id === 'string' && !ids.includes(id)) ids.push(id);
    }
    for (const child of childrenOf(doc, node)) walk(child, depth + 1);
  };

  walk(block, 0);
  return ids;
}

export interface FootnoteAssignment {
  /** Footnote ids on each page, in reading order. */
  byPage: Map<number, string[]>;
  /** The page a footnote's body is drawn on. */
  pageOf: Map<string, number>;
  /** The number the reader sees, which counts references and not definitions. */
  numberOf: Map<string, number>;
}

export interface AssignOptions {
  /** Blocks in document order, with the footnotes each one references. */
  refsByBlock: Map<string, string[]>;
  /** Which page each block starts on. */
  pageOfBlock: Map<string, number>;
  /** Blocks in document order, which decides the numbering. */
  order: string[];
}

/**
 * Put each footnote on the page its reference starts on.
 *
 * Numbered in document order rather than per page: a footnote is "note 4" for
 * the whole document, and renumbering it when a break moves would change the
 * text of the document to describe its own layout.
 */
export function assignFootnotes(options: AssignOptions): FootnoteAssignment {
  const byPage = new Map<number, string[]>();
  const pageOf = new Map<string, number>();
  const numberOf = new Map<string, number>();

  let counter = 0;
  for (const blockSid of options.order) {
    const refs = options.refsByBlock.get(blockSid);
    if (!refs || refs.length === 0) continue;

    const page = options.pageOfBlock.get(blockSid);
    for (const id of refs) {
      if (numberOf.has(id)) continue;
      numberOf.set(id, ++counter);
      if (page === undefined) continue;

      pageOf.set(id, page);
      const onPage = byPage.get(page);
      if (onPage) onPage.push(id);
      else byPage.set(page, [id]);
    }
  }

  return { byPage, pageOf, numberOf };
}

/**
 * How much room a block's footnotes need at the foot of its page.
 *
 * Zero for a footnote whose height has not been measured yet. The first render
 * necessarily has none — the bodies have not been drawn, so nothing can have
 * been measured — and reserving a guessed height would move the breaks to a
 * place the second pass then has to move them back from.
 */
export function reserveFor(
  refs: string[] | undefined,
  heights: Map<string, number>,
  separator: number
): number {
  if (!refs || refs.length === 0) return 0;

  let total = 0;
  let counted = 0;
  for (const id of refs) {
    const height = heights.get(id);
    if (height === undefined) continue;
    total += height;
    counted++;
  }

  // The rule above the notes is part of what they cost the page
  return counted > 0 ? total + separator : 0;
}
