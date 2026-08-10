/**
 * Finding text in a document.
 *
 * Searching is a question about the document, so it is answered here; showing
 * the answer is a question about a window, and is not. The shared kit's find
 * builds its own panel out of `document.createElement` and fixed positioning,
 * which forces every host to be a DOM host and gives the product no say in what
 * the panel looks like — the same reason the toolbar ships as a model rather
 * than as markup.
 *
 * What a match is, then: a node and a range inside it. Not a DOM range, which
 * would be gone by the next render, and not an offset into the whole document,
 * which nothing else in the model speaks.
 */
import { transaction } from '@barocss/model';
import type { Editor } from '@barocss/editor-core';
import { childrenOf, type DocumentAccess, type DocumentNode } from './document-access';

export interface Match {
  sid: string;
  start: number;
  end: number;
}

export interface FindOptions {
  caseSensitive?: boolean;
  /** Only whole words, so "one" does not match "money". */
  wholeWord?: boolean;
}

/**
 * Definitions are read by the document, not read *in* it.
 *
 * A style is not text a reader can find, and offering to replace inside one is
 * offering to break the document's formatting from a search box.
 */
const NOT_SEARCHED = new Set(['resources', 'docMeta']);

/** Whether the character at an edge of a match is part of a word. */
const isWordChar = (char: string | undefined): boolean => !!char && /[\p{L}\p{N}_]/u.test(char);

/**
 * Every match, in reading order.
 *
 * Reading order is what makes "next" mean anything: the order the matches come
 * back in is the order a reader would meet them.
 */
export function findMatches(
  doc: DocumentAccess,
  query: string,
  options: FindOptions = {}
): Match[] {
  if (!query) return [];

  const matches: Match[] = [];
  const needle = options.caseSensitive ? query : query.toLowerCase();

  const visit = (node: DocumentNode | undefined, depth: number): void => {
    if (!node || depth > 64) return;
    if (node.stype && NOT_SEARCHED.has(node.stype)) return;

    if (typeof node.text === 'string' && node.sid) {
      const hay = options.caseSensitive ? node.text : node.text.toLowerCase();
      let from = 0;
      for (;;) {
        const at = hay.indexOf(needle, from);
        if (at < 0) break;
        const end = at + needle.length;

        const whole =
          !options.wholeWord ||
          (!isWordChar(node.text[at - 1]) && !isWordChar(node.text[end]));
        if (whole) matches.push({ sid: node.sid, start: at, end });

        // Past the match, not past one character: overlapping matches of the
        // same text are one match to a reader replacing them.
        from = end > at ? end : at + 1;
      }
    }

    for (const child of childrenOf(doc, node)) visit(child, depth + 1);
  };

  visit(doc.getNode(doc.rootId), 0);
  return matches;
}

/**
 * Where the search should go next from wherever it is.
 *
 * Wraps, because a search that stopped at the end would make the last match a
 * dead end — and a reader who has read to the bottom is usually looking for the
 * one they passed at the top.
 */
export function step(count: number, current: number, direction: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0) return direction > 0 ? 0 : count - 1;
  return (current + direction + count) % count;
}

/**
 * The matches left after replacing one of them, with their offsets moved.
 *
 * Replacing changes the length of the text it sits in, so every later match in
 * the same node is now somewhere else. Recomputing the search instead would be
 * simpler and wrong: the replacement may itself contain the search text, and
 * "replace all" would find its own output and run forever.
 */
export function shiftAfter(matches: Match[], replaced: Match, replacement: number): Match[] {
  const delta = replacement - (replaced.end - replaced.start);
  const out: Match[] = [];
  for (const match of matches) {
    if (match === replaced) continue;
    if (match.sid !== replaced.sid || match.start < replaced.start) {
      out.push(match);
      continue;
    }
    out.push({ sid: match.sid, start: match.start + delta, end: match.end + delta });
  }
  return out;
}

/**
 * The operations that replace a set of matches, in the order they must run.
 *
 * Back to front within each node. Replacing changes the length of the text, so
 * a match earlier in the same node moves every later one — going backwards
 * means the offsets still describe the text when each operation reaches it, and
 * nothing has to be recalculated between them.
 *
 * One transaction's worth, because replacing all of something is one edit: undo
 * puts them all back, and a document with half its occurrences replaced is not
 * a state anyone asked for.
 */
export function replaceOperations(matches: Match[], replacement: string): unknown[] {
  const ordered = [...matches].sort((a, b) =>
    a.sid === b.sid ? b.start - a.start : a.sid < b.sid ? -1 : 1
  );

  return ordered.map((match) => ({
    type: 'replaceText',
    payload: { nodeId: match.sid, start: match.start, end: match.end, newText: replacement }
  }));
}

/**
 * Replace matches, all in one edit.
 *
 * Here rather than in the app because building a transaction is model work, and
 * a window has no business doing it — the app asks for a replacement and is told
 * whether it happened.
 *
 * One transaction for however many matches: replacing all occurrences is one
 * thing a reader did, so one Ctrl+Z should undo it. A document with half its
 * occurrences replaced is not a state anyone asked for.
 */
export async function replaceMatches(
  editor: Editor,
  matches: Match[],
  replacement: string
): Promise<boolean> {
  const operations = replaceOperations(matches, replacement);
  if (operations.length === 0) return false;
  const result = await transaction(editor, operations as never).commit();
  return result.success;
}
