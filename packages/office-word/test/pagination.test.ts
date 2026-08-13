import { describe, it, expect } from 'vitest';
import { paginate, type MeasuredBlock, type Page } from '../src/pagination';

/**
 * Heights are synthetic on purpose. Pagination is a pure function of measured
 * heights, so the rules can be pinned down here without a browser, and the
 * browser is left to answer the one question it is actually needed for: how tall
 * is this block at this width.
 */
const LINE = 20;

function block(sid: string, lineCount: number, rules: Partial<MeasuredBlock> = {}): MeasuredBlock {
  return { sid, lines: Array(lineCount).fill(LINE), ...rules };
}

/** Which sids sit on each page, for readable assertions. */
function sidsPerPage(pages: Page[]): string[][] {
  return pages.map((page) => page.fragments.map((f) => f.sid));
}

describe('filling pages', () => {
  it('puts blocks on one page while they fit', () => {
    const pages = paginate([block('a', 2), block('b', 2), block('c', 1)], { contentHeight: 100 });
    expect(sidsPerPage(pages)).toEqual([['a', 'b', 'c']]);
  });

  it('starts a new page when the next block does not fit', () => {
    const pages = paginate([block('a', 5), block('b', 5)], { contentHeight: 100 });
    expect(sidsPerPage(pages)).toEqual([['a'], ['b']]);
  });

  it('numbers pages in order', () => {
    const pages = paginate([block('a', 5), block('b', 5), block('c', 5)], { contentHeight: 100 });
    expect(pages.map((p) => p.index)).toEqual([0, 1, 2]);
  });

  it('always returns a page, even for an empty document', () => {
    const pages = paginate([], { contentHeight: 100 });
    expect(pages).toHaveLength(1);
    expect(pages[0].fragments).toEqual([]);
  });

  it('counts the space that travels with a block', () => {
    // 4 lines = 80px, and 20px of trailing space fills the 100px page
    const pages = paginate(
      [block('a', 4, { spaceBefore: 10, spaceAfter: 20 }), block('b', 1)],
      { contentHeight: 100 }
    );
    expect(sidsPerPage(pages)).toEqual([['a'], ['b']]);
  });

  it('collapses spacing at a page boundary, as Word does', () => {
    // Space before is suppressed at the top of a page, so 'a' is 80px, not 90px,
    // and 'b' still fits underneath it.
    const pages = paginate(
      [block('a', 4, { spaceBefore: 10 }), block('b', 1)],
      { contentHeight: 100 }
    );
    expect(sidsPerPage(pages)).toEqual([['a', 'b']]);
  });

  it('clips trailing space rather than splitting a paragraph for it', () => {
    // 5 lines exactly fill the page; the 40px of space after must not push a
    // line overleaf on its own.
    const pages = paginate([block('a', 5, { spaceAfter: 40 })], { contentHeight: 100 });
    expect(sidsPerPage(pages)).toEqual([['a']]);
    expect(pages[0].fragments[0]).toMatchObject({ fromLine: 0, toLine: 5, continues: false });
  });
});

describe('splitting a block across pages', () => {
  it('splits a paragraph rather than moving all of it', () => {
    const pages = paginate([block('a', 2), block('long', 8)], { contentHeight: 100 });

    expect(sidsPerPage(pages)).toEqual([['a', 'long'], ['long']]);
    const first = pages[0].fragments[1];
    expect(first).toMatchObject({ fromLine: 0, toLine: 3, continues: true, continued: false });
    expect(pages[1].fragments[0]).toMatchObject({ fromLine: 3, toLine: 8, continued: true, continues: false });
  });

  it('splits across as many pages as it takes', () => {
    const pages = paginate([block('huge', 25)], { contentHeight: 100 });
    expect(pages).toHaveLength(5);
    expect(pages.flatMap((p) => p.fragments.map((f) => f.toLine - f.fromLine))).toEqual([5, 5, 5, 5, 5]);
  });

  it('keeps keepLines blocks whole, moving them instead', () => {
    const pages = paginate([block('a', 2), block('heading', 8, { keepLines: true })], {
      contentHeight: 100
    });
    expect(sidsPerPage(pages)).toEqual([['a'], ['heading']]);
  });

  it('lets a block taller than a page overflow rather than disappear', () => {
    // Nothing can rescue it, and dropping content is worse than clipping it
    const pages = paginate([block('giant', 10, { keepLines: true })], { contentHeight: 100 });
    expect(sidsPerPage(pages)).toEqual([['giant']]);
    expect(pages[0].fragments[0]).toMatchObject({ fromLine: 0, toLine: 10 });
  });
});

describe('widow and orphan control', () => {
  it('never leaves a single line behind', () => {
    // 4 lines fit, but that would carry only 1 line over
    const pages = paginate([block('a', 1), block('p', 5, { widowControl: true })], {
      contentHeight: 100
    });
    const split = pages[0].fragments.find((f) => f.sid === 'p');
    expect(split?.toLine).toBe(3);
    expect(pages[1].fragments[0]).toMatchObject({ fromLine: 3, toLine: 5 });
  });

  it('never leaves a single line ahead', () => {
    // Only 1 line fits on this page, which would orphan it
    const pages = paginate([block('a', 4), block('p', 5, { widowControl: true })], {
      contentHeight: 100
    });
    expect(sidsPerPage(pages)).toEqual([['a'], ['p']]);
  });

  it('moves a paragraph too short to split legally', () => {
    const pages = paginate([block('a', 3), block('p', 3, { widowControl: true })], {
      contentHeight: 100
    });
    expect(sidsPerPage(pages)).toEqual([['a'], ['p']]);
  });

  it('splits freely when widow control is off', () => {
    const pages = paginate([block('a', 4), block('p', 5)], { contentHeight: 100 });
    expect(pages[0].fragments.find((f) => f.sid === 'p')?.toLine).toBe(1);
  });
});

describe('explicit breaks', () => {
  it('breaks before a block that asks for it', () => {
    const pages = paginate([block('a', 1), block('b', 1, { breakBefore: true })], {
      contentHeight: 100
    });
    expect(sidsPerPage(pages)).toEqual([['a'], ['b']]);
  });

  it('does not leave a blank page when the break lands on an empty page', () => {
    const pages = paginate([block('a', 1, { breakBefore: true }), block('b', 1)], {
      contentHeight: 100
    });
    expect(sidsPerPage(pages)).toEqual([['a', 'b']]);
  });

  it('places a zero-height break marker without consuming a line', () => {
    const pages = paginate(
      [block('a', 1), { sid: 'br', lines: [] }, block('b', 1, { breakBefore: true })],
      { contentHeight: 100 }
    );
    expect(sidsPerPage(pages)).toEqual([['a', 'br'], ['b']]);
  });
});

describe('keeping a block with the next one', () => {
  it('moves a heading forward rather than stranding it', () => {
    // 'h' fits at the bottom of page 1, but its body would start on page 2
    const pages = paginate(
      [block('a', 4), block('h', 1, { keepNext: true }), block('body', 3)],
      { contentHeight: 100 }
    );
    expect(sidsPerPage(pages)).toEqual([['a'], ['h', 'body']]);
  });

  it('leaves a satisfied keepNext alone', () => {
    const pages = paginate(
      [block('h', 1, { keepNext: true }), block('body', 2)],
      { contentHeight: 100 }
    );
    expect(sidsPerPage(pages)).toEqual([['h', 'body']]);
  });

  it('is satisfied when the next block merely starts on the page the block ends on', () => {
    // A split block ends on page 2, and its follower starts there: not a violation
    const pages = paginate(
      [block('long', 8, { keepNext: true }), block('after', 1)],
      { contentHeight: 100 }
    );
    const span = sidsPerPage(pages);
    expect(span[1]).toContain('after');
  });

  it('gives up rather than looping when the block already starts its page', () => {
    // 'h' starts page 2 and its body still cannot fit there; forcing another
    // break would move it forever.
    const pages = paginate(
      [block('a', 5), block('h', 1, { keepNext: true }), block('body', 8, { keepLines: true })],
      { contentHeight: 100 }
    );
    expect(sidsPerPage(pages)).toEqual([['a'], ['h'], ['body']]);
  });

  it('resolves a chain of headings that must stay together', () => {
    const pages = paginate(
      [
        block('a', 4),
        block('h1', 1, { keepNext: true }),
        block('h2', 1, { keepNext: true }),
        block('body', 3)
      ],
      { contentHeight: 100 }
    );
    expect(sidsPerPage(pages)).toEqual([['a'], ['h1', 'h2', 'body']]);
  });
});

describe('table rows', () => {
  it('treats a row that cannot split as an unsplittable block', () => {
    // The caller flattens rows into blocks with keepLines, so the paginator
    // needs no notion of tables at all.
    // r2 does not fit under r1 and cannot be split, so it moves whole
    const pages = paginate(
      [block('r1', 3), block('r2', 3, { keepLines: true }), block('r3', 2)],
      { contentHeight: 100 }
    );
    expect(sidsPerPage(pages)).toEqual([['r1'], ['r2', 'r3']]);
  });

  it('breaks a table between rows, which is what a row that cannot split needs', () => {
    // A table arrives as one block whose lines are its rows, so a break can only
    // fall between two of them. Every row is therefore whole on the page it
    // lands on, and Word's per-row `cantSplit` is satisfied for all of them at
    // once — the attribute asks for what the model can only do.
    const table: MeasuredBlock = { sid: 'table', lines: [40, 40, 40, 40, 40], widowControl: false };
    const fragments = paginate([table], { contentHeight: 100 }).flatMap((page) => page.fragments);

    expect(fragments.map((f) => [f.fromLine, f.toLine])).toEqual([
      [0, 2],
      [2, 4],
      [4, 5]
    ]);
    // Each page holds a whole number of rows, never part of one
    for (const fragment of fragments) expect(fragment.height % 40).toBe(0);
  });
});

/**
 * A footnote takes room from the page its reference lands on, so the block that
 * causes it competes with it for space.
 */
describe('space held at the foot of a page', () => {
  it('leaves less room on the page holding the reference', () => {
    // Without the reservation all five blocks fit; the 40px footnote pushes one off
    const pages = paginate(
      [
        block('a', 1),
        block('b', 1, { reserve: 40 }),
        block('c', 1),
        block('d', 1),
        block('e', 1)
      ],
      { contentHeight: 100 }
    );

    expect(sidsPerPage(pages)).toEqual([['a', 'b', 'c'], ['d', 'e']]);
    expect(pages[0].reserved).toBe(40);
    expect(pages[1].reserved).toBe(0);
  });

  it('moves a block whose own reservation will not fit beside it', () => {
    // 'b' fits, but not together with the 60px its footnote needs
    const pages = paginate([block('a', 2), block('b', 1, { reserve: 60 })], {
      contentHeight: 100
    });

    expect(sidsPerPage(pages)).toEqual([['a'], ['b']]);
  });

  it('adds up several footnotes on one page', () => {
    // 40px of body plus 40px of footnotes leaves 20px, so an unsplittable
    // 40px block has to go overleaf.
    const pages = paginate(
      [
        block('a', 1, { reserve: 20 }),
        block('b', 1, { reserve: 20 }),
        block('c', 2, { keepLines: true })
      ],
      { contentHeight: 100 }
    );

    expect(pages[0].reserved).toBe(40);
    expect(sidsPerPage(pages)).toEqual([['a', 'b'], ['c']]);
  });

  it('charges a split block only once, on the page it starts', () => {
    // The reservation belongs to the reference, and the reference is in the
    // fragment that begins the block — not in every continuation of it.
    const pages = paginate([block('long', 8, { reserve: 20 })], { contentHeight: 100 });

    expect(pages[0].reserved).toBe(20);
    expect(pages[1].reserved).toBe(0);
  });

  it('changes nothing when nothing reserves', () => {
    const pages = paginate([block('a', 5), block('b', 5)], { contentHeight: 100 });
    expect(pages.every((page) => page.reserved === 0)).toBe(true);
  });
});

