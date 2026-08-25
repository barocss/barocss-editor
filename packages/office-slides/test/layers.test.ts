import { describe, it, expect } from 'vitest';
import { kindOfBox, labelOfBox, layerRows, namedKinds, positionFromRow } from '../src/layers';
import type { DeckAccess, DeckNode } from '../src/deck';

/**
 * The slide's contents as a list.
 *
 * Two things a canvas cannot do: picking what is underneath something, and saying
 * *where in the stack* a thing goes — the deck's four order buttons are four
 * answers to a question whose answer is a position.
 *
 * The rows are a question about the document, so they are answered here in
 * milliseconds. What only a browser shows is the dragging.
 */
const deck = (nodes: Record<string, unknown>): DeckAccess =>
  ({ rootId: 'root', getNode: (sid: string) => (nodes as never)[sid] }) as never;

const box = (stype: string, over: Record<string, unknown> = {}) => ({
  sid: 'x',
  stype,
  attributes: over
});

describe('what a canvas node is called', () => {
  it('has a word for every kind this product draws', () => {
    expect(kindOfBox('rectangle')).toBe('사각형');
    expect(kindOfBox('mediaAudio')).toBe('오디오');
  });

  /**
   * Nothing, rather than a fallback, for a type it does not know.
   *
   * A fallback makes a missing name look like a name — the whole failure
   * `every-drawing-can-be-named` is about, and the reason that check can see
   * anything at all.
   */
  it('has nothing for a type it does not know', () => {
    expect(kindOfBox('sunburst')).toBeUndefined();
    expect(kindOfBox(undefined)).toBeUndefined();
  });

  it('names the three the schema declares and nothing draws yet', () => {
    // A deck arriving from a tool that has them draws *something*, and a row
    // saying 상자 about it is a row a reader cannot act on.
    for (const stype of ['connector', 'component', 'instance']) {
      expect(kindOfBox(stype), stype).toBeTruthy();
    }
    expect(namedKinds().length).toBeGreaterThan(10);
  });
});

describe('what to call a box', () => {
  /**
   * `name` is not a label, which took two failing tests to establish.
   *
   * A conformance check reported `name` as read by no renderer and a layer list looks
   * like where a name belongs — but in this product `name` is how *motion* names a
   * box: `setBoxBuild` assigns `shape-1`, `shape-2` as it goes and `namedBoxes`
   * resolves a step's target through them. Labelling by it put `shape-2` in the
   * timeline where `동영상` had been.
   */
  it('is not the machine name motion uses to find it', () => {
    const doc = deck({ a: { ...box('mediaVideo', { name: 'shape-2' }), sid: 'a' } });
    expect(labelOfBox(doc, 'a')).toBe('동영상');
  });

  it('is its role before anything else', () => {
    const doc = deck({ a: { ...box('textFrame', { role: 'title' }), sid: 'a' } });
    expect(labelOfBox(doc, 'a')).toBe('제목');
  });

  it('is its first words when it has no role', () => {
    const doc = deck({
      a: { sid: 'a', stype: 'textFrame', attributes: {}, content: ['t'] },
      t: { sid: 't', stype: 'inline-text', text: '두 번째 제품이 든 값' }
    });
    expect(labelOfBox(doc, 'a')).toBe('두 번째 제품이 든 값');
  });

  it('is cut short, so one long line cannot push a list sideways', () => {
    const doc = deck({
      a: { sid: 'a', stype: 'textFrame', attributes: {}, content: ['t'] },
      t: { sid: 't', stype: 'inline-text', text: 'x'.repeat(40) }
    });
    expect(labelOfBox(doc, 'a')).toHaveLength(19); // 18 and the ellipsis
  });

  it('falls back to the kind, and to 상자 for a type with no word', () => {
    expect(labelOfBox(deck({ a: { ...box('ellipse'), sid: 'a' } }), 'a')).toBe('타원');
    expect(labelOfBox(deck({ a: { ...box('sunburst'), sid: 'a' } }), 'a')).toBe('상자');
  });
});

describe('the rows for a slide', () => {
  /** Three shapes, and the last one drawn on top. */
  const slide = deck({
    s: { sid: 's', stype: 'surface', attributes: {}, content: ['a', 'b', 'c'] },
    a: { sid: 'a', stype: 'rectangle', attributes: {} },
    b: { sid: 'b', stype: 'picture', attributes: { locked: true } },
    c: { sid: 'c', stype: 'ellipse', attributes: { visible: false } }
  });

  /**
   * Front at the top.
   *
   * Document order is paint order — the last child is drawn over the others — so
   * the list is the children reversed. A list that ran the other way would be
   * correct about the model and wrong about the reader.
   */
  it('puts the front of the slide at the top', () => {
    expect(layerRows(slide, 's').map((row) => row.sid)).toEqual(['c', 'b', 'a']);
  });

  it('carries what each row has to draw', () => {
    const rows = layerRows(slide, 's', { selected: ['b'] });
    expect(rows[0]).toMatchObject({ sid: 'c', kind: '타원', visible: false, depth: 0 });
    expect(rows[1]).toMatchObject({ sid: 'b', locked: true, selected: true });
    expect(rows[2]).toMatchObject({ sid: 'a', visible: true, locked: false, selected: false });
  });

  it('marks the rows something animates', () => {
    const rows = layerRows(slide, 's', { animated: new Set(['a']) });
    expect(rows.map((row) => row.motion)).toEqual([false, false, true]);
  });

  it('is empty for no slide and for a slide that is not there', () => {
    expect(layerRows(slide, undefined)).toEqual([]);
    expect(layerRows(slide, 'nope')).toEqual([]);
  });

  /**
   * A group's children come under it, indented — one level's rule applied at every
   * level rather than a tree of rows.
   */
  it('walks into a group and says how deep each row is', () => {
    const nested = deck({
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['g', 'z'] },
      g: { sid: 'g', stype: 'group', attributes: {}, content: ['g1', 'g2'] },
      g1: { sid: 'g1', stype: 'rectangle', attributes: {} },
      g2: { sid: 'g2', stype: 'ellipse', attributes: {} },
      z: { sid: 'z', stype: 'picture', attributes: {} }
    });

    const rows = layerRows(nested, 's');
    // `z` is in front of the whole group; inside it, `g2` is in front of `g1`.
    expect(rows.map((row) => [row.sid, row.depth])).toEqual([
      ['z', 0],
      ['g2', 1],
      ['g1', 1],
      ['g', 0]
    ]);
  });

  it('does not walk into a text frame', () => {
    // Its children are words. Words are not layers.
    const withText = deck({
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['t'] },
      t: { sid: 't', stype: 'textFrame', attributes: {}, content: ['p'] },
      p: { sid: 'p', stype: 'paragraph', attributes: {} }
    });
    expect(layerRows(withText, 's').map((row) => row.sid)).toEqual(['t']);
  });
});

/**
 * Where a dragged row lands in the document.
 *
 * The list is reversed, so dragging a row *up* moves a shape *later* in its
 * parent's children. Getting that inversion wrong is a drag that reorders the
 * stack backwards — the one bug this control can have that a reader cannot
 * explain — so the conversion has a test rather than living in a pointer handler.
 */
describe('a row dropped at a place in the list', () => {
  it('inverts, because the list is upside down', () => {
    // Six shapes: the top row is the last child, the bottom row is the first.
    expect(positionFromRow(0, 6)).toBe(5);
    expect(positionFromRow(5, 6)).toBe(0);
    expect(positionFromRow(2, 6)).toBe(3);
  });

  it('is its own place for a list of one', () => {
    expect(positionFromRow(0, 1)).toBe(0);
  });

  it('is held inside the list, however far the pointer went', () => {
    // A drag does not stop at the edge of the panel, and a position outside the
    // children is a move the command would refuse — silently, from the reader's
    // side, which reads as a drag that did nothing.
    expect(positionFromRow(-3, 4)).toBe(3);
    expect(positionFromRow(99, 4)).toBe(0);
  });

  it('answers zero for a list with nothing in it', () => {
    expect(positionFromRow(0, 0)).toBe(0);
  });
});

/**
 * A **placement's** parts are rows too.
 *
 * The list descended into a group and a frame and stopped at a placement — which is the one
 * container a reader could not get into from here. A card's badge is a real box: covered by
 * nothing that would let a click through, reachable only by hitting exactly it. Picking what is
 * underneath is the whole reason this list exists, so leaving out the container that holds five
 * boxes was leaving out the case.
 */
describe('what is inside a placement', () => {
  /**
   * A placement holds the reader's own things and **nothing else**: its parts are the definition's
   * and are resolved at draw time (§10b-2a). So this list shows a card as one row with the
   * reader's own boxes under it — which is the cost of references, written down here rather than
   * only in the spec: the parts of a card cannot be reordered or hidden from the layer list.
   */
  const deck = (): DeckAccess => {
    const nodes: Record<string, DeckNode> = {
      slide: { sid: 'slide', stype: 'surface', attributes: {}, content: ['card', 'note'] },
      card: {
        sid: 'card',
        stype: 'instance',
        attributes: { componentId: 'metric' },
        content: ['said', 'own']
      },
      said: { sid: 'said', stype: 'componentValue', attributes: { name: 'title', value: '매출' } },
      // What the reader added in the slot: theirs, with its own sid, so it is a row they can act on.
      own: { sid: 'own', stype: 'textFrame', attributes: {} },
      note: { sid: 'note', stype: 'sticky', attributes: {} }
    };
    return { rootId: 'doc', getNode: (sid) => nodes[sid] };
  };

  it('lists the reader’s own things under the card, and not what it was asked for', () => {
    const rows = layerRows(deck(), 'slide');
    // Front first: the sticky on top of the card, the reader's box, then the card's own row —
    // which is how a container has always come out here (the whole list is reversed once, so a
    // parent collected before its children ends up after them).
    expect(rows.map((row) => row.sid)).toEqual(['note', 'own', 'card']);
    // A `componentValue` is not a box: "값" is not a name a reader could tell a row by, and the
    // conformance exemption for it says it never appears in a list.
    expect(rows.some((row) => row.sid === 'said')).toBe(false);
  });

  it('names a part while the reader is standing in the definition', () => {
    /*
     * The other side of the same list. Inside a card, the parts *are* the boxes in front of the
     * reader, and "the badge" is a different thing to be looking at from "a rectangle" — so a row
     * carries the name the definition gave it.
     */
    const nodes: Record<string, DeckNode> = {
      card: {
        sid: 'card',
        stype: 'component',
        attributes: { id: 'metric' },
        content: ['back', 'badge']
      },
      back: { sid: 'back', stype: 'rectangle', attributes: { partId: 'back' } },
      badge: { sid: 'badge', stype: 'ellipse', attributes: {} }
    };
    const rows = layerRows({ rootId: 'doc', getNode: (sid) => nodes[sid] }, 'card');
    const from = (sid: string) => rows.find((row) => row.sid === sid)?.partName;
    expect(from('back')).toBe('back');
    // A part with no name of its own says nothing, which is the ordinary case: a background
    // usually takes no value and needs no name.
    expect(from('badge')).toBeUndefined();
  });
});
