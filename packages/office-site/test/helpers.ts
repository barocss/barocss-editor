import { blocksIn } from '../src/selection';

/**
 * A block of the sample, **by the name the sample gave it** — at any depth under the page.
 *
 * ## Why this is shared, and why it walks
 *
 * Four test files wrote the same three lines, and all four wrote them the *shallow* way: look
 * through the page's own children for a name. That worked while a section was a single stack, and
 * stopped the day the sample became a page somebody would ship — a real section is a band that
 * carries the colour with a column inside it that carries the words, so everything a test wants to
 * hold moved one or two levels down and four helpers returned `undefined` at once.
 *
 * The lesson is the one the browser suite already learned and this is the third place to write it
 * down: **a block is found by what it is, never by where it currently sits.** A test that says "the
 * second stack on the page" is a test that fails the next time somebody adds a section above it, and
 * it fails with an assertion about padding rather than with the words "that block moved".
 */
export const namedBlock = (
  doc: { getNode: (sid: string) => any },
  page: string,
  name: string
): string => {
  const walk = (sid: string): string | undefined => {
    for (const child of blocksIn(doc as never, sid)) {
      if (doc.getNode(child)?.attributes?.name === name) return child;
      const found = walk(child);
      if (found) return found;
    }
    return undefined;
  };
  return walk(page)!;
};

/** The first placement under a named block, however deep the section holding it is. */
export const placementIn = (
  doc: { getNode: (sid: string) => any },
  page: string,
  name: string
): string => {
  const walk = (sid: string): string | undefined => {
    for (const child of blocksIn(doc as never, sid)) {
      if (doc.getNode(child)?.stype === 'instance') return child;
      const found = walk(child);
      if (found) return found;
    }
    return undefined;
  };
  return walk(namedBlock(doc, page, name))!;
};
