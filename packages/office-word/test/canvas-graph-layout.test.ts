import { describe, it, expect } from 'vitest';
import {
  layoutGraph,
  rankGapFor,
  NODE_GAP,
  RANK_GAP,
  type GraphEdge,
  type GraphNode
} from '../src/canvas-graph-layout';

/**
 * Tidying a diagram.
 *
 * Every one of these is a picture that came out wrong in one of the passes, which is why
 * the passes are separate: a rank fault and an ordering fault look the same on a slide
 * (a messy diagram) and are two different bugs.
 */

const box = (sid: string, width = 3000, height = 1200): GraphNode => ({ sid, width, height });
const edge = (from: string, to: string): GraphEdge => ({ from, to });

/** Where a placement put a shape, by sid. */
const at = (placements: { sid: string; x: number; y: number }[], sid: string) =>
  placements.find((one) => one.sid === sid)!;

describe('tidying a graph', () => {
  it('puts a chain in rows, one below the next', () => {
    const laid = layoutGraph(
      [box('a'), box('b'), box('c')],
      [edge('a', 'b'), edge('b', 'c')]
    );

    expect(at(laid, 'a').y).toBe(0);
    expect(at(laid, 'b').y).toBe(1200 + RANK_GAP);
    expect(at(laid, 'c').y).toBe(2 * (1200 + RANK_GAP));
    // And in one column, because each is the only thing in its row and each is pulled
    // onto its parent's centre.
    expect(at(laid, 'b').x).toBe(at(laid, 'a').x);
    expect(at(laid, 'c').x).toBe(at(laid, 'a').x);
  });

  it('runs the ranks sideways when asked, which is what a process looks like', () => {
    const laid = layoutGraph([box('a'), box('b')], [edge('a', 'b')], { direction: 'right' });

    expect(at(laid, 'b').x).toBe(3000 + RANK_GAP);
    expect(at(laid, 'b').y).toBe(at(laid, 'a').y);
  });

  it('centres a parent over its children rather than over the first of them', () => {
    // The pass that makes it look drawn instead of tabulated. Without the pull, `a` sits
    // at x = 0 — above the left edge of `b` — and the picture reads as a list.
    const laid = layoutGraph(
      [box('a'), box('b'), box('c')],
      [edge('a', 'b'), edge('a', 'c')]
    );

    const parent = at(laid, 'a');
    const left = at(laid, 'b');
    const right = at(laid, 'c');
    expect(parent.x + 1500).toBeCloseTo((left.x + right.x + 3000) / 2, 0);
    // The children are beside each other, a gap apart, and not on top of one another.
    expect(right.x - left.x).toBe(3000 + NODE_GAP);
  });

  it('ranks a join by its deepest parent, not its nearest', () => {
    /*
     * A diamond: a → b, a → c → d, b → d. By *shortest* path `d` lands in row 1 beside
     * its own parent `c`, and an edge points sideways — the picture the reader pressed
     * the button to be rid of.
     */
    const laid = layoutGraph(
      [box('a'), box('b'), box('c'), box('d')],
      [edge('a', 'b'), edge('a', 'c'), edge('c', 'd'), edge('b', 'd')]
    );

    const row = (sid: string) => Math.round(at(laid, sid).y / (1200 + RANK_GAP));
    expect(row('a')).toBe(0);
    expect(row('b')).toBe(1);
    expect(row('c')).toBe(1);
    expect(row('d')).toBe(2);
  });

  it('lays out a loop instead of giving up on it', () => {
    // A retry, a review that sends work back: a cycle is a real diagram, and ranking it
    // by longest path with the loop still in would never finish.
    const laid = layoutGraph(
      [box('a'), box('b'), box('c')],
      [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]
    );

    expect(laid).toHaveLength(3);
    expect(at(laid, 'a').y).toBeLessThan(at(laid, 'b').y);
    expect(at(laid, 'b').y).toBeLessThan(at(laid, 'c').y);
  });

  it('leaves alone what no line touches', () => {
    // A title, a note, a logo. Moving it because it shares the slide would be the button
    // doing something nobody asked for — and it is what makes "tidy" safe to press with
    // everything selected.
    const laid = layoutGraph(
      [box('a'), box('b'), box('note')],
      [edge('a', 'b')]
    );

    expect(laid.map((one) => one.sid).sort()).toEqual(['a', 'b']);
  });

  it('sets two unjoined diagrams beside each other rather than shuffling them', () => {
    /*
     * Ranked together, the first row of one would sit beside the first row of the other
     * and a reader would see two pictures interleaved instead of two pictures.
     */
    const laid = layoutGraph(
      [box('a'), box('b'), box('x'), box('y')],
      [edge('a', 'b'), edge('x', 'y')]
    );

    // Same rows, different columns: nothing of the second diagram overlaps the first.
    expect(at(laid, 'x').y).toBe(at(laid, 'a').y);
    expect(at(laid, 'x').x).toBeGreaterThan(at(laid, 'a').x + 3000);
  });

  it('starts where it was told to, and never at a negative corner', () => {
    // The pulls move nodes both ways, so a component's own left edge drifts negative and
    // a caller who asked for a corner would get shapes off the side of the slide.
    const laid = layoutGraph(
      [box('a'), box('b'), box('c')],
      [edge('a', 'b'), edge('a', 'c')],
      { origin: { x: 1000, y: 2000 } }
    );

    expect(Math.min(...laid.map((one) => one.x))).toBe(1000);
    expect(Math.min(...laid.map((one) => one.y))).toBe(2000);
  });

  it('ignores a line that joins a shape to itself', () => {
    // Legal on the canvas — a state that stays put — and it would rank a node below
    // itself, which has no answer.
    const laid = layoutGraph([box('a'), box('b')], [edge('a', 'a'), edge('a', 'b')]);
    expect(at(laid, 'b').y).toBe(1200 + RANK_GAP);
  });

  it('answers nothing when there is nothing joined', () => {
    // Three shapes and no line is not a diagram, and a tidy that moves them is a tidy
    // that scattered a reader's work.
    expect(layoutGraph([box('a'), box('b')], [])).toEqual([]);
    // Nor does a line to a shape that is not here — another slide's, or one just deleted.
    expect(layoutGraph([box('a')], [edge('a', 'gone')])).toEqual([]);
  });

  it('gives a wide row room, measuring each shape rather than assuming one size', () => {
    const laid = layoutGraph(
      [box('a'), box('wide', 9000), box('b')],
      [edge('a', 'wide'), edge('a', 'b')]
    );

    const left = at(laid, 'wide');
    const right = at(laid, 'b');
    const first = left.x < right.x ? left : right;
    const second = left.x < right.x ? right : left;
    const width = first === left ? 9000 : 3000;
    expect(second.x - first.x).toBeGreaterThanOrEqual(width + NODE_GAP);
  });

  it('puts the taller rows further apart, and centres a short shape in its row', () => {
    const laid = layoutGraph(
      [box('a'), box('tall', 3000, 4000), box('short')],
      [edge('a', 'tall'), edge('a', 'short')]
    );

    // The row is as thick as the tallest thing in it, and the short one sits in the
    // middle of that band — not at its top, which would leave the row looking ragged.
    expect(at(laid, 'short').y).toBe(at(laid, 'tall').y + (4000 - 1200) / 2);
  });
});

/**
 * Where the gap between two ranks comes from.
 *
 * The honest answer to "is this number just picked?" — the floor is `dot`'s own
 * `ranksep`, and above that it is **measured** from what the diagram's lines draw.
 */
describe('how far apart two ranks have to be', () => {
  it('falls back to the convention when nothing is written on the lines', () => {
    // A diagram with no labels still needs ranks a reader can tell apart, and 0.5in is
    // what thirty years of `dot` output has been read at.
    expect(rankGapFor([{}, {}])).toBe(RANK_GAP);
    expect(rankGapFor([])).toBe(RANK_GAP);
  });

  it('grows to hold a label, because a pill that does not fit is drawn over a shape', () => {
    const plain = rankGapFor([{ label: '예' }]);
    expect(plain).toBeGreaterThanOrEqual(RANK_GAP);

    // A long Korean label is the case that shows it: every character is about as wide as
    // the type is tall, so across the ranks it is far wider than it is deep.
    const long = '검토가 필요한 경우 여기로';
    expect(rankGapFor([{ label: long }], 'right')).toBeGreaterThan(
      rankGapFor([{ label: long }], 'down')
    );
  });

  it('measures the pill along the axis the gap runs, not the other one', () => {
    /*
     * A flow chart's gap runs *down*, so the pill's height has to fit in it; a process
     * runs across, so its width does. The wrong way round is invisible on a short label
     * and unmissable on a sentence.
     */
    const one = rankGapFor([{ label: 'A' }], 'down');
    const other = rankGapFor([{ label: 'AAAAAAAAAAAAAAAAAAAA' }], 'down');
    // Down the page, twenty letters are no deeper than one.
    expect(other).toBe(one);
    expect(rankGapFor([{ label: 'AAAAAAAAAAAAAAAAAAAA' }], 'right')).toBeGreaterThan(
      rankGapFor([{ label: 'A' }], 'right')
    );
  });

  it('leaves room for the arrowhead as well, and a heavy line has a bigger one', () => {
    // The cap size is the renderer's own rule, asked of the model rather than copied —
    // `max(180, width * 4)`.
    const thin = rankGapFor([{ label: '검토가 필요한 경우', strokeWidth: 15 }], 'right');
    const thick = rankGapFor([{ label: '검토가 필요한 경우', strokeWidth: 120 }], 'right');
    expect(thick).toBeGreaterThan(thin);
  });

  it('takes the widest label on any line, not the first one', () => {
    const many = rankGapFor(
      [{ label: '예' }, { label: '아주 긴 이름표가 붙은 관계' }, {}],
      'right'
    );
    expect(many).toBe(rankGapFor([{ label: '아주 긴 이름표가 붙은 관계' }], 'right'));
  });
});

/**
 * A shape the reader has already placed.
 *
 * The answer to "is the tidy a mode?" — it is not. It runs once and writes plain
 * coordinates, so a reader arranges what they like afterwards. A pin is how they say
 * which part of that arrangement was deliberate, and it survives the *next* press.
 */
describe('a pinned shape', () => {
  const pinned = (sid: string, x: number, y: number): GraphNode => ({
    sid,
    width: 3000,
    height: 1200,
    at: { x, y },
    pinned: true
  });

  it('does not move, and is not even written', () => {
    const laid = layoutGraph(
      [pinned('a', 4000, 800), box('b'), box('c')],
      [edge('a', 'b'), edge('a', 'c')]
    );

    // No placement at all: a move that lands on the same numbers is still an entry in
    // the history, and the reader asked for this one to stay.
    expect(laid.map((one) => one.sid).sort()).toEqual(['b', 'c']);
  });

  it('has the diagram arranged around it', () => {
    const laid = layoutGraph(
      [pinned('a', 4000, 800), box('b'), box('c')],
      [edge('a', 'b'), edge('a', 'c')]
    );

    // Below the pin, and centred on it: everything is hung from the place the reader
    // chose rather than from a corner.
    expect(at(laid, 'b').y).toBe(800 + 1200 + RANK_GAP);
    expect((at(laid, 'b').x + at(laid, 'c').x + 3000) / 2).toBeCloseTo(4000 + 1500, 0);
  });

  it('wins over the origin a caller asked for, because it is the reader’s own answer', () => {
    const laid = layoutGraph([pinned('a', 4000, 800), box('b')], [edge('a', 'b')], {
      origin: { x: 0, y: 0 }
    });
    expect(at(laid, 'b').x).toBe(4000);
  });

  it('anchors only its own diagram, and the other one still starts at the origin', () => {
    const laid = layoutGraph(
      [pinned('a', 9000, 6000), box('b'), box('x'), box('y')],
      [edge('a', 'b'), edge('x', 'y')],
      { origin: { x: 500, y: 500 } }
    );

    expect(at(laid, 'b').y).toBe(6000 + 1200 + RANK_GAP);
    expect(at(laid, 'x').x).toBe(500);
    expect(at(laid, 'x').y).toBe(500);
  });

  it('honours the first pin only, because two of them can disagree', () => {
    /*
     * Honouring both would mean stretching the ranks to reach them, and a picture
     * stretched to obey two pins is one neither reader asked for. The second is a shape
     * that does not move — it is never written — and the layout treats it as ordinary.
     */
    const laid = layoutGraph(
      [pinned('a', 4000, 800), pinned('b', 20000, 20000)],
      [edge('a', 'b')]
    );
    expect(laid).toEqual([]);
  });

  it('still is not moved when nothing says where it is, but cannot anchor either', () => {
    /*
     * Two different jobs, and only one of them needs `at`. `pinned` means **never
     * written**, which the document alone can honour — the shape simply keeps the
     * coordinates it has. Anchoring the *diagram* on it needs to know where that is, and
     * with no answer the rest is laid out from the origin rather than from a guess.
     * Treating a missing place as zero would drag the whole picture into the corner.
     */
    const laid = layoutGraph(
      [{ sid: 'a', width: 3000, height: 1200, pinned: true }, box('b')],
      [edge('a', 'b')],
      { origin: { x: 700, y: 900 } }
    );
    expect(laid.map((one) => one.sid)).toEqual(['b']);
    expect(at(laid, 'b').x).toBe(700);
  });
});
