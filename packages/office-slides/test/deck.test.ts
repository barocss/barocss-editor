import { describe, it, expect } from 'vitest';
import {
  connectorFreezeSteps,
  connectorRouteOf,
  copyForPaste,
  deckSlides,
  editableSurface,
  isSlideSurface,
  stageFit,
  pastable,
  noteFor,
  spaceOriginOf,
  type DeckAccess,
  type DeckNode
} from '../src/deck';

/**
 * Reading a deck, with no DOM and no editor — which is the point of it living
 * in the package rather than in the app that draws the rail.
 */
describe('reading a deck', () => {
  /** A document held the way a loaded one is: children are sids. */
  const docOf = (nodes: Record<string, DeckNode>, rootId = 'doc'): DeckAccess => ({
    rootId,
    getNode: (sid) => nodes[sid]
  });

  const deck = () =>
    docOf({
      doc: { stype: 'document', content: ['meta', 's1', 's2', 's3', 'res'] },
      meta: { stype: 'docMeta', content: [] },

      // Named by the author.
      s1: { stype: 'surface', attributes: { name: 'Title', layoutId: 'layout-title' }, content: ['t1'] },
      t1: { stype: 'textFrame', attributes: { role: 'title' }, content: ['p1'] },
      p1: { stype: 'paragraph', content: ['x1'] },
      x1: { stype: 'inline-text', text: 'Never read, the author named this one' },

      // Named by its title placeholder.
      s2: { stype: 'surface', attributes: { noteId: 'n-2' }, content: ['body2', 't2'] },
      // A body frame first, to prove the title is found by role and not by order.
      body2: { stype: 'textFrame', attributes: { role: 'body' }, content: ['p3'] },
      p3: { stype: 'paragraph', content: ['x3'] },
      x3: { stype: 'inline-text', text: 'Bullets nobody should name a slide after' },
      t2: { stype: 'textFrame', attributes: { role: 'title' }, content: ['p2'] },
      p2: { stype: 'paragraph', content: ['x2a', 'x2b'] },
      x2a: { stype: 'inline-text', text: 'What the ' },
      x2b: { stype: 'inline-text', text: 'second product cost' },

      // Nothing to name it with, and hidden.
      s3: { stype: 'surface', attributes: { hidden: true }, content: [] },

      res: { stype: 'resources', content: ['note1', 'layout1'] },
      note1: { stype: 'surfaceNote', attributes: { id: 'n-2' }, content: ['p4'] },
      p4: { stype: 'paragraph', content: [] },
      // A layout is full of textFrames and is not a slide.
      layout1: { stype: 'slideLayout', attributes: { id: 'layout-title' }, content: ['t9'] },
      t9: { stype: 'textFrame', attributes: { role: 'title' }, content: [] }
    });

  it('finds the slides and numbers them from one', () => {
    const slides = deckSlides(deck());
    expect(slides.map((s) => s.sid)).toEqual(['s1', 's2', 's3']);
    expect(slides.map((s) => s.number)).toEqual([1, 2, 3]);
  });

  it('skips resources, so a layout never turns up in the rail', () => {
    // A `slideLayout` holds `textFrame`s and looks exactly like a slide to a
    // walk that only asks what a node contains.
    expect(deckSlides(deck()).some((s) => s.sid === 'layout1')).toBe(false);
  });

  it('skips anything that is not a surface, so docMeta is not slide one', () => {
    expect(deckSlides(deck()).some((s) => s.sid === 'meta')).toBe(false);
  });

  describe('what to call a slide', () => {
    it('uses the author’s name when there is one', () => {
      expect(deckSlides(deck())[0].name).toBe('Title');
    });

    it('uses the title placeholder otherwise, across runs and by role', () => {
      expect(deckSlides(deck())[1].name).toBe('What the second product cost');
    });

    it('invents nothing when there is nothing', () => {
      // A name made up here would be indistinguishable from one the author
      // chose. The caller draws "Slide 3".
      expect(deckSlides(deck())[2].name).toBe('');
    });
  });

  it('reports a hidden slide as hidden and still lists it', () => {
    const slides = deckSlides(deck());
    expect(slides.map((s) => s.hidden)).toEqual([false, false, true]);
  });

  it('carries the layout a slide follows', () => {
    expect(deckSlides(deck())[0].layoutId).toBe('layout-title');
    expect(deckSlides(deck())[1].layoutId).toBeUndefined();
  });

  describe('the note a slide shows its presenter', () => {
    it('is found through the slide’s noteId', () => {
      // The sid, not the text: a note is editable content, and a string would
      // have thrown away the marks and the caret.
      expect(noteFor(deck(), 's2')).toBe('note1');
    });

    it('is absent for a slide nobody wrote one for', () => {
      expect(noteFor(deck(), 's1')).toBeUndefined();
    });
  });

  it('survives a document that is not there', () => {
    expect(deckSlides(docOf({}))).toEqual([]);
    expect(noteFor(docOf({}), 's1')).toBeUndefined();
  });

  it('does not hang on a document that points at itself', () => {
    // This walks an author's document, and a malformed one must not take the
    // chrome down with it.
    const looped = docOf({
      doc: { stype: 'document', content: ['s1'] },
      s1: { stype: 'surface', attributes: {}, content: ['t1'] },
      t1: { stype: 'textFrame', attributes: { role: 'title' }, content: ['t1'] }
    });
    expect(deckSlides(looped)[0].name).toBe('');
  });
});

/**
 * A line joined to a shape **inside a group**.
 *
 * Every placed thing's `x` is its container's, so a shape put into a group keeps its
 * looks and changes its numbers. A connector on the slide that read those numbers as the
 * slide's drew to a point a group's width away from the shape it is attached to —
 * measured in a browser: an end at (9000, 6500) jumped to (1000, 5000) the moment the
 * shape was grouped, and the arrowhead pointed at nothing.
 */
describe('a connector across coordinate spaces', () => {
  const doc = (): DeckAccess => {
    const nodes: Record<string, Record<string, unknown>> = {
      root: { sid: 'root', stype: 'document', content: ['slide'] },
      slide: { sid: 'slide', stype: 'surface', parentId: 'root', content: ['a', 'group', 'line'] },
      a: {
        sid: 'a',
        stype: 'rectangle',
        parentId: 'slide',
        attributes: { x: 1000, y: 1000, width: 2000, height: 1000 }
      },
      group: {
        sid: 'group',
        stype: 'group',
        parentId: 'slide',
        content: ['b'],
        attributes: { x: 8000, y: 5000, width: 3000, height: 2000 }
      },
      // Inside the group: its own numbers are the group's, not the slide's.
      b: {
        sid: 'b',
        stype: 'rectangle',
        parentId: 'group',
        attributes: { x: 500, y: 400, width: 2000, height: 1000 }
      },
      line: {
        sid: 'line',
        stype: 'connector',
        parentId: 'slide',
        attributes: { startNodeId: 'a', endNodeId: 'b', kind: 'straight' }
      }
    };
    return { rootId: 'root', getNode: (sid: string) => nodes[sid] as never } as DeckAccess;
  };

  it('adds up the containers a shape sits in', () => {
    expect(spaceOriginOf(doc(), 'a')).toEqual({ x: 0, y: 0 });
    // The group's origin, and the surface contributes nothing — it *is* the space.
    expect(spaceOriginOf(doc(), 'b')).toEqual({ x: 8000, y: 5000 });
    expect(spaceOriginOf(doc(), 'slide')).toEqual({ x: 0, y: 0 });
  });

  it('draws to where the shape actually is on the slide', () => {
    const route = connectorRouteOf(doc(), 'line');
    const end = route[route.length - 1];
    /*
     * The shape is at 8500..10500 across and 5400..6400 down in the slide's own
     * coordinates. Read as the slide's, its numbers would have put this end near
     * (500, 400) — the top-left corner of the slide, nowhere near the shape.
     */
    expect(end.x).toBeGreaterThan(8000);
    expect(end.y).toBeGreaterThan(5000);
  });
});

/**
 * Copying a diagram.
 *
 * Copy two shapes and the line joining them, paste, and the pasted line pointed at the
 * **originals** — a duplicated diagram was two sets of shapes with both lines attached
 * to the first set. Measured in a browser, and it is the classic form of the fault: an
 * identity that means something in one place travelling to another where it means
 * something else.
 */
describe('copying shapes that are joined', () => {
  const doc = (): DeckAccess => {
    const nodes: Record<string, Record<string, unknown>> = {
      root: { sid: 'root', stype: 'document', content: ['slide'] },
      slide: { sid: 'slide', stype: 'surface', parentId: 'root', content: ['a', 'b', 'line', 'lone'] },
      a: { sid: 'a', stype: 'rectangle', parentId: 'slide', attributes: { x: 0, y: 0, width: 100, height: 100 } },
      b: { sid: 'b', stype: 'rectangle', parentId: 'slide', attributes: { x: 500, y: 0, width: 100, height: 100 } },
      line: {
        sid: 'line',
        stype: 'connector',
        parentId: 'slide',
        attributes: { startNodeId: 'a', endNodeId: 'b', kind: 'elbow' }
      },
      lone: {
        sid: 'lone',
        stype: 'connector',
        parentId: 'slide',
        attributes: { startNodeId: 'a', endNodeId: 'outside', kind: 'elbow' }
      }
    };
    return { rootId: 'root', getNode: (sid: string) => nodes[sid] as never } as DeckAccess;
  };

  /** Sids a test can read: the store's own are `session:counter`. */
  const counter = () => {
    let at = 0;
    return () => `new:${(at += 1)}`;
  };

  it('points a copied line at the copied shapes', () => {
    const copied = copyForPaste(doc(), ['a', 'b', 'line']);
    const ready = pastable(copied, counter());

    const [shapeA, shapeB, line] = ready as Array<{ sid?: string; attributes?: Record<string, unknown> }>;
    expect(line.attributes?.startNodeId).toBe(shapeA.sid);
    expect(line.attributes?.endNodeId).toBe(shapeB.sid);
    // And not at the originals, which is the whole point.
    expect(line.attributes?.startNodeId).not.toBe('a');
  });

  it('keeps a reference **out** of the copy as it was', () => {
    /*
     * A reader who copies one line and not the shapes it joins means the shapes it
     * joins. In another deck that dangles, and the connector reaction releases it —
     * leaving the line where it was drawn, which is the rule for a deleted shape too.
     */
    const ready = pastable(copyForPaste(doc(), ['lone']), counter()) as Array<{
      attributes?: Record<string, unknown>;
    }>;
    expect(ready[0].attributes?.startNodeId).toBe('a');
    expect(ready[0].attributes?.endNodeId).toBe('outside');
  });

  it('names every node, so a paste is one transaction', () => {
    /*
     * The sids are made before the commit rather than read back after it: a pasted line
     * has to point at pasted shapes, and their sids do not exist until they are added.
     * Two transactions would be two undos for one gesture.
     */
    const ready = pastable(copyForPaste(doc(), ['a', 'line']), counter()) as Array<{ sid?: string }>;
    expect(ready.every((node) => typeof node.sid === 'string')).toBe(true);
    expect(new Set(ready.map((node) => node.sid)).size).toBe(2);
  });

  it('carries none of its own bookkeeping into the document', () => {
    const ready = pastable(copyForPaste(doc(), ['a', 'b', 'line']), counter()) as Array<
      Record<string, unknown>
    >;
    for (const node of ready) {
      expect('__ref' in node).toBe(false);
      expect('__startRef' in node).toBe(false);
    }
  });

  it('copies what is inside a container too, and names all of it', () => {
    const nested = (): DeckAccess => {
      const nodes: Record<string, Record<string, unknown>> = {
        root: { sid: 'root', stype: 'document', content: ['slide'] },
        slide: { sid: 'slide', stype: 'surface', parentId: 'root', content: ['g'] },
        g: {
          sid: 'g',
          stype: 'group',
          parentId: 'slide',
          content: ['x', 'y', 'inner'],
          attributes: { x: 0, y: 0, width: 900, height: 400 }
        },
        x: { sid: 'x', stype: 'rectangle', parentId: 'g', attributes: { x: 0, y: 0, width: 100, height: 100 } },
        y: { sid: 'y', stype: 'rectangle', parentId: 'g', attributes: { x: 700, y: 0, width: 100, height: 100 } },
        inner: {
          sid: 'inner',
          stype: 'connector',
          parentId: 'g',
          attributes: { startNodeId: 'x', endNodeId: 'y', kind: 'elbow' }
        }
      };
      return { rootId: 'root', getNode: (sid: string) => nodes[sid] as never } as DeckAccess;
    };

    const ready = pastable(copyForPaste(nested(), ['g']), counter()) as Array<{
      sid?: string;
      content?: Array<{ sid?: string; stype?: string; attributes?: Record<string, unknown> }>;
    }>;
    const inside = ready[0].content ?? [];
    const line = inside.find((node) => node.stype === 'connector')!;
    // The line inside the group points at the copies of *its* siblings, not at the
    // originals in the group it came from.
    expect(line.attributes?.startNodeId).toBe(inside[0].sid);
    expect(line.attributes?.startNodeId).not.toBe('x');
  });
});

/**
 * What is written on the lines that hold a shape about to be deleted.
 *
 * Both halves have to happen while the shape still exists — the place of the end, and
 * the release of the hold — and both belong in the *deleting* transaction, which is the
 * reader's own undo entry. A reaction doing it afterwards would need its own undo, and
 * undoing the deletion would leave the line let go of a shape that had come back.
 */
describe('freezing a line when its shape goes', () => {
  const doc = (): DeckAccess => {
    const nodes: Record<string, Record<string, unknown>> = {
      root: { sid: 'root', stype: 'document', content: ['slide'] },
      slide: { sid: 'slide', stype: 'surface', parentId: 'root', content: ['a', 'b', 'line', 'other'] },
      a: { sid: 'a', stype: 'rectangle', parentId: 'slide', attributes: { x: 0, y: 0, width: 2000, height: 1000 } },
      b: { sid: 'b', stype: 'rectangle', parentId: 'slide', attributes: { x: 6000, y: 0, width: 2000, height: 1000 } },
      line: {
        sid: 'line',
        stype: 'connector',
        parentId: 'slide',
        attributes: { startNodeId: 'a', endNodeId: 'b', startSide: 'e', endSide: 'w' }
      },
      other: {
        sid: 'other',
        stype: 'connector',
        parentId: 'slide',
        attributes: { startNodeId: 'a', endNodeId: 'a', startSide: 'n', endSide: 's' }
      }
    };
    return { rootId: 'root', getNode: (sid: string) => nodes[sid] as never } as DeckAccess;
  };

  it('writes the place the end had, and lets go', () => {
    const [step] = connectorFreezeSteps(doc(), ['b']);
    expect(step.payload.nodeId).toBe('line');
    expect(step.payload.attrs).toEqual({
      // Where the end *was*, read while the shape is still there — this is what keeps the
      // line on the slide instead of vanishing with the shape.
      startX: 2000,
      startY: 500,
      endX: 6000,
      endY: 500,
      endNodeId: null
    });
  });

  it('says nothing about the lines that hold nothing going', () => {
    // Only the connectors that actually hold one of the doomed shapes: a freeze written
    // on every line would be a document rewritten for a deletion that did not touch it.
    const steps = connectorFreezeSteps(doc(), ['b']);
    expect(steps).toHaveLength(1);
    expect(connectorFreezeSteps(doc(), [])).toEqual([]);
    expect(connectorFreezeSteps(doc(), ['nothing-like-this'])).toEqual([]);
  });

  it('lets go of both ends when both shapes go', () => {
    const [step] = connectorFreezeSteps(doc(), ['a', 'b']);
    expect(step.payload.attrs).toMatchObject({ startNodeId: null, endNodeId: null });
  });

  it('says nothing about a line that is itself being deleted', () => {
    // It is going too; writing its ends first would be an edit to a node that is about
    // to be removed, and one more thing in the undo entry to put back.
    expect(connectorFreezeSteps(doc(), ['line'])).toEqual([]);
  });
});

/**
 * What the stage has to fit, and what its rulers measure.
 *
 * The stage fitted the **constant** `SLIDE_16_9`, which is wrong the moment a deck is not
 * 16:9 or a reader opens a definition. Both were measured in the browser before this was
 * written — a 4:3 deck drawn at the 16:9 scale with 662px of ruler across a 497px slide, and a
 * 5040×3960 card drawn 128px wide in a 486px pane — and both are answered here, in the model,
 * so the arithmetic is checked in milliseconds rather than in a browser round trip.
 */
describe('the box the stage has to fit', () => {
  const doc = (nodes: Record<string, DeckNode>): DeckAccess => ({
    rootId: 'doc',
    getNode: (sid) => nodes[sid]
  });

  const mixed = () =>
    doc({
      doc: { stype: 'document', content: ['wide', 'narrow', 'lib'] },
      wide: { stype: 'surface', attributes: { kind: 'slide' }, content: [] },
      narrow: {
        stype: 'surface',
        attributes: { kind: 'slide', width: 14400, height: 10800 },
        content: []
      },
      lib: { stype: 'components', content: ['card'] },
      card: {
        stype: 'component',
        attributes: { id: 'card', width: 5040, height: 3960 },
        content: []
      }
    });

  it('takes the slide the reader is on, whatever shape it is', () => {
    // A slide carries its own size because a deck may mix them: a wide diagram slide in a
    // 4:3 deck is a real thing, and the deck has no single shape to fit.
    expect(stageFit(mixed(), 'narrow')).toEqual({ width: 14400, height: 10800 });
    expect(stageFit(mixed(), 'wide')).toEqual({ width: 19200, height: 10800 });
  });

  it('takes a definition’s own size, because a card is not the shape of a deck', () => {
    expect(stageFit(mixed(), 'card')).toEqual({ width: 5040, height: 3960 });
  });

  it('takes the widest when the whole deck is drawn as a strip', () => {
    // Not the first slide: a wider one further down would overflow the pane, which is the
    // same fault as fitting the constant.
    expect(stageFit(mixed())).toEqual({ width: 19200, height: 10800 });
  });

  it('falls back to 16:9 for a deck with no slides and for what is not a surface', () => {
    expect(stageFit(doc({ doc: { stype: 'document', content: [] } }))).toEqual({
      width: 19200,
      height: 10800
    });
    // A sid that names something else — a resources container, a box — is not a surface, so
    // the answer is the deck's rather than that node's `width`.
    expect(stageFit(mixed(), 'lib')).toEqual({ width: 19200, height: 10800 });
  });
});

/**
 * What a slide is **called**, when its title is not a direct child.
 *
 * It looked at the slide's own children only, which was true for as long as a slide was a flat
 * row of boxes — and a header inside a frame that arranges, or a title inside a placed card,
 * left the filmstrip with no name at all. The same fault the deck's own check had, in the one
 * place a reader sees on every slide.
 */
describe('the name a slide gets', () => {
  const named = (holder: Record<string, unknown>): DeckAccess => {
    const nodes: Record<string, DeckNode> = {
      doc: { stype: 'document', content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: { kind: 'slide' }, content: ['holder'] },
      holder: { sid: 'holder', attributes: {}, content: ['title'], ...holder },
      title: {
        sid: 'title',
        stype: 'textFrame',
        attributes: { role: 'title' },
        content: ['line'],
        parentId: 'holder'
      },
      line: { sid: 'line', stype: 'paragraph', content: ['words'], parentId: 'title' },
      words: { sid: 'words', stype: 'inline-text', text: '무엇을 만들었나', parentId: 'line' }
    };
    return { rootId: 'doc', getNode: (sid) => nodes[sid] };
  };

  it('reads a title inside a frame', () => {
    expect(deckSlides(named({ stype: 'frame' }))[0].name).toBe('무엇을 만들었나');
  });

  it('reads a title inside a group and inside a placed card', () => {
    expect(deckSlides(named({ stype: 'group' }))[0].name).toBe('무엇을 만들었나');
    expect(
      deckSlides(named({ stype: 'instance', attributes: { componentId: 'card' } }))[0].name
    ).toBe('무엇을 만들었나');
  });

  it('does not go looking inside the words themselves', () => {
    // A `textFrame`'s children are words, not boxes: a walk that went into them would be
    // answering a question about writing with a list of shapes.
    const inText = named({ stype: 'textFrame' });
    expect(deckSlides(inText)[0].name).toBe('');
  });
});

/**
 * Which surface an action lands on — the deck's question, and the reason it stayed here when the
 * component model moved to the canvas layer.
 *
 * A definition is a surface a reader **opens and puts shapes in**, and a slide is a surface the
 * deck **counts**. Both facts are about pages, which is a product's idea rather than a canvas's:
 * what a card declares can be said without the word "slide" in it, and this cannot.
 */
describe('the surface an action lands on', () => {
  const access = (nodes: Record<string, Record<string, unknown>>): DeckAccess =>
    ({ rootId: 'root', getNode: (sid: string) => nodes[sid] as never }) as DeckAccess;

  const deck = access({
    root: { sid: 'root', stype: 'document', content: ['one', 'two', 'lib'] },
    one: { sid: 'one', stype: 'surface', attributes: { kind: 'slide' }, content: [] },
    two: { sid: 'two', stype: 'surface', attributes: { kind: 'slide' }, content: [] },
    lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['card'] },
    card: { sid: 'card', stype: 'component', attributes: { id: 'card' }, content: [] }
  });

  it('takes a definition, which is what a reader opens to put shapes in', () => {
    expect(editableSurface(deck, 'card')).toBe('card');
  });

  it('takes a slide, and defaults to the deck’s first one', () => {
    expect(editableSurface(deck, 'two')).toBe('two');
    expect(editableSurface(deck)).toBe('one');
  });

  it('refuses what is neither', () => {
    expect(editableSurface(deck, 'lib')).toBeUndefined();
    expect(editableSurface(deck, 'nowhere')).toBeUndefined();
  });

  it('counts a slide as a page and a definition as not one', () => {
    // The pair the slide list, the strip, the presenter and the count all read. A definition that
    // answered `true` here was the first design, and two of those four leaked before the third
    // was written.
    expect(isSlideSurface(deck.getNode('one') as never)).toBe(true);
    expect(isSlideSurface(deck.getNode('card') as never)).toBe(false);
  });
});
