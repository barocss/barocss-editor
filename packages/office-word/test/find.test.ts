import { describe, it, expect } from 'vitest';
import { findMatches, replaceOperations, shiftAfter, step } from '../src/find';
import type { DocumentAccess, DocumentNode } from '@barocss/office-text';

/**
 * Finding text.
 *
 * A match is a node and a range inside it, because that is what the rest of the
 * model speaks: a DOM range would be gone by the next render, and an offset into
 * the whole document is a number nothing else could use.
 */
const docOf = (nodes: Record<string, DocumentNode>, rootId = 'root'): DocumentAccess => ({
  getNode: (id: string) => nodes[id],
  rootId
});

/** A body of paragraphs, each holding one run of text. */
const bodyOf = (...texts: string[]): DocumentAccess => {
  const nodes: Record<string, DocumentNode> = {
    root: { sid: 'root', stype: 'document', content: ['body'] },
    body: { sid: 'body', stype: 'body', content: texts.map((_, i) => `p${i}`) }
  };
  texts.forEach((text, i) => {
    nodes[`p${i}`] = { sid: `p${i}`, stype: 'paragraph', content: [`t${i}`] };
    nodes[`t${i}`] = { sid: `t${i}`, stype: 'inline-text', text };
  });
  return docOf(nodes);
};

describe('finding', () => {
  it('reports a node and a range, in reading order', () => {
    // Reading order is what makes "next" mean anything.
    expect(findMatches(bodyOf('one two one', 'one'), 'one')).toEqual([
      { sid: 't0', start: 0, end: 3 },
      { sid: 't0', start: 8, end: 11 },
      { sid: 't1', start: 0, end: 3 }
    ]);
  });

  it('ignores case unless asked not to', () => {
    expect(findMatches(bodyOf('One one ONE'), 'one')).toHaveLength(3);
    expect(findMatches(bodyOf('One one ONE'), 'one', { caseSensitive: true })).toEqual([
      { sid: 't0', start: 4, end: 7 }
    ]);
  });

  it('matches whole words when asked', () => {
    // "one" is in "money", and a reader replacing whole words does not want it.
    expect(findMatches(bodyOf('one money oneself one'), 'one')).toHaveLength(4);
    expect(findMatches(bodyOf('one money oneself one'), 'one', { wholeWord: true })).toEqual([
      { sid: 't0', start: 0, end: 3 },
      { sid: 't0', start: 18, end: 21 }
    ]);
  });

  it('counts letters and digits of any script as part of a word', () => {
    expect(findMatches(bodyOf('한글 검색 한글검색'), '한글', { wholeWord: true })).toEqual([
      { sid: 't0', start: 0, end: 2 }
    ]);
  });

  it('does not overlap a match with itself', () => {
    // "aa" in "aaaa" is two matches to a reader replacing them, not three.
    expect(findMatches(bodyOf('aaaa'), 'aa')).toEqual([
      { sid: 't0', start: 0, end: 2 },
      { sid: 't0', start: 2, end: 4 }
    ]);
  });

  it('does not search the definitions a document is built from', () => {
    // A style is not text a reader can find, and replacing inside one is
    // breaking the formatting from a search box.
    const doc = docOf({
      root: { sid: 'root', stype: 'document', content: ['res', 'body'] },
      res: { sid: 'res', stype: 'resources', content: ['s1'] },
      s1: { sid: 's1', stype: 'styleDef', content: ['st'] },
      st: { sid: 'st', stype: 'inline-text', text: 'Normal' },
      body: { sid: 'body', stype: 'body', content: ['p'] },
      p: { sid: 'p', stype: 'paragraph', content: ['t'] },
      t: { sid: 't', stype: 'inline-text', text: 'Normal text' }
    });
    expect(findMatches(doc, 'Normal')).toEqual([{ sid: 't', start: 0, end: 6 }]);
  });

  it('finds nothing for an empty query, and in an empty document', () => {
    expect(findMatches(bodyOf('anything'), '')).toEqual([]);
    expect(findMatches(docOf({ root: { sid: 'root' } }), 'x')).toEqual([]);
  });
});

describe('stepping between matches', () => {
  it('starts at the first going forward and the last going back', () => {
    expect(step(3, -1, 1)).toBe(0);
    expect(step(3, -1, -1)).toBe(2);
  });

  it('wraps at both ends', () => {
    // A search that stopped at the end would make the last match a dead end,
    // and a reader at the bottom is usually after the one they passed at the top.
    expect(step(3, 2, 1)).toBe(0);
    expect(step(3, 0, -1)).toBe(2);
  });

  it('has nowhere to go when nothing matched', () => {
    expect(step(0, -1, 1)).toBe(-1);
  });
});

describe('after a replacement', () => {
  const matches = [
    { sid: 't0', start: 0, end: 3 },
    { sid: 't0', start: 8, end: 11 },
    { sid: 't1', start: 0, end: 3 }
  ];

  it('moves the later matches in the same node', () => {
    // The text they sit in got longer, so they are somewhere else now.
    expect(shiftAfter(matches, matches[0], 5)).toEqual([
      { sid: 't0', start: 10, end: 13 },
      { sid: 't1', start: 0, end: 3 }
    ]);
  });

  it('moves them back when the replacement is shorter', () => {
    expect(shiftAfter(matches, matches[0], 1)).toEqual([
      { sid: 't0', start: 6, end: 9 },
      { sid: 't1', start: 0, end: 3 }
    ]);
  });

  it('leaves earlier matches and other nodes alone', () => {
    expect(shiftAfter(matches, matches[1], 9)).toEqual([
      { sid: 't0', start: 0, end: 3 },
      { sid: 't1', start: 0, end: 3 }
    ]);
  });

  it('drops the one that was replaced', () => {
    // Searching again instead would be simpler and wrong: a replacement can
    // contain the text being searched for, and replace-all would find its own
    // output and never finish.
    expect(shiftAfter(matches, matches[2], 3)).toHaveLength(2);
  });
});

describe('replacing many at once', () => {
  it('works back to front within a node, so the offsets stay true', () => {
    // Replacing an earlier match moves every later one. Going backwards means
    // each offset still describes the text when its turn comes, and nothing has
    // to be recalculated in between.
    const ops = replaceOperations(
      [
        { sid: 't0', start: 0, end: 3 },
        { sid: 't0', start: 8, end: 11 }
      ],
      'X'
    ) as { payload: { start: number } }[];
    expect(ops.map((op) => op.payload.start)).toEqual([8, 0]);
  });

  it('replaces with the text it was given', () => {
    const ops = replaceOperations([{ sid: 't', start: 1, end: 4 }], 'two') as {
      type: string;
      payload: Record<string, unknown>;
    }[];
    expect(ops).toEqual([
      { type: 'replaceText', payload: { nodeId: 't', start: 1, end: 4, newText: 'two' } }
    ]);
  });

  it('has nothing to do for nothing found', () => {
    expect(replaceOperations([], 'x')).toEqual([]);
  });
});
