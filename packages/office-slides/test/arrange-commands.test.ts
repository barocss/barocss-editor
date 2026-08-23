import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';

/**
 * What is in front, and what lines up with what.
 *
 * Z-order is `moveNode` and nothing else: document order *is* paint order, so
 * bringing a shape to the front is moving it to the end of its parent. A
 * `zOrder` attribute would be a second ordering to keep agreeing with the
 * first.
 */
describe('arranging what is on a slide', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;

  const run = async (command: string, payload?: unknown) =>
    await (editor as any).executeCommand(command, payload);
  const can = (command: string, payload?: unknown) =>
    (editor as any).canExecuteCommand?.(command, payload);

  /** The slide's children, by the name each box was given. */
  const order = () =>
    ((store.getNode(slide) as any).content as string[]).map(
      (sid) => (store.getNode(sid) as any).attributes.name
    );
  const boxOf = (name: string) => {
    const sid = ((store.getNode(slide) as any).content as string[]).find(
      (id) => (store.getNode(id) as any).attributes.name === name
    )!;
    const { x, y, width, height } = (store.getNode(sid) as any).attributes;
    return { sid, x, y, width, height };
  };
  const select = (names: string[]) =>
    (editor as any).setNode({ nodeIds: names.map((name) => boxOf(name).sid) });

  beforeEach(() => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          {
            stype: 'surface',
            attributes: { kind: 'slide' },
            content: [
              { stype: 'rectangle', attributes: { name: 'a', x: 100, y: 100, width: 200, height: 100 } },
              { stype: 'rectangle', attributes: { name: 'b', x: 400, y: 300, width: 100, height: 200 } },
              { stype: 'rectangle', attributes: { name: 'c', x: 900, y: 50, width: 300, height: 50 } }
            ]
          }
        ]
      } as never,
      'slides'
    );
    slide = (store.getNode((editor as any).getRootId()) as any).content[0];
  });

  it('starts in the order the document holds', () => {
    expect(order()).toEqual(['a', 'b', 'c']);
  });

  describe('front and back', () => {
    it('brings one to the front', async () => {
      select(['a']);
      expect(await run('bringToFront')).toBeTruthy();
      expect(order()).toEqual(['b', 'c', 'a']);
    });

    it('sends one to the back', async () => {
      select(['c']);
      await run('sendToBack');
      expect(order()).toEqual(['c', 'a', 'b']);
    });

    it('moves one step, which is what overlapping shapes need', async () => {
      select(['a']);
      await run('bringForward');
      expect(order()).toEqual(['b', 'a', 'c']);

      await run('sendBackward');
      expect(order()).toEqual(['a', 'b', 'c']);
    });

    it('keeps a set in its own order when it moves', async () => {
      select(['a', 'b']);
      await run('bringToFront');
      expect(order()).toEqual(['c', 'a', 'b']);
    });

    it('does nothing at the edge, rather than reporting a move it did not make', async () => {
      select(['c']);
      expect(await run('bringForward')).toBeFalsy();
      expect(order()).toEqual(['a', 'b', 'c']);
    });

    it('undoes as one thing', async () => {
      select(['a', 'b']);
      await run('bringToFront');
      await (editor as any).undo();
      expect(order()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('lining up', () => {
    it('brings the others to the outermost', async () => {
      select(['a', 'b', 'c']);
      await run('alignBoxesLeft');
      expect([boxOf('a').x, boxOf('b').x, boxOf('c').x]).toEqual([100, 100, 100]);
    });

    it('aligns to the slide when asked, which one box can do alone', async () => {
      select(['a']);
      expect(can('alignBoxesLeft')).toBe(false); // nothing to align *to*
      expect(can('alignBoxesLeft', { toSlide: true })).toBe(true);

      await run('alignBoxesRight', { toSlide: true });
      expect(boxOf('a').x).toBe(19200 - 200);
    });

    it('touches only the axis it was asked about', async () => {
      select(['a', 'b']);
      const before = boxOf('b').y;
      await run('alignBoxesLeft');
      expect(boxOf('b').y).toBe(before);
    });

    it('is one thing to undo, however many boxes moved', async () => {
      select(['a', 'b', 'c']);
      await run('alignBoxesTop');
      expect([boxOf('a').y, boxOf('b').y, boxOf('c').y]).toEqual([50, 50, 50]);

      await (editor as any).undo();
      expect([boxOf('a').y, boxOf('b').y, boxOf('c').y]).toEqual([100, 300, 50]);
    });

    it('commits nothing when nothing would move', async () => {
      select(['a', 'a']);
      expect(await run('alignBoxesLeft')).toBeFalsy();
    });
  });

  describe('spreading out', () => {
    it('needs three', () => {
      select(['a', 'b']);
      expect(can('distributeBoxesHorizontally')).toBe(false);
      select(['a', 'b', 'c']);
      expect(can('distributeBoxesHorizontally')).toBe(true);
    });

    it('makes the gaps equal and leaves the ends alone', async () => {
      select(['a', 'b', 'c']);
      await run('distributeBoxesHorizontally');

      const [x, y, z] = [boxOf('a'), boxOf('b'), boxOf('c')];
      expect(x.x).toBe(100);
      expect(z.x).toBe(900);
      expect(y.x - (x.x + x.width)).toBe(z.x - (y.x + y.width));
    });
  });

  it('leaves a locked box out of all of it', async () => {
    await (editor as any).executeCommand('setBoxGeometry', {
      nodeId: boxOf('a').sid,
      x: 100
    });
    // Lock it directly: `setBoxGeometry` refuses a locked box, so locking has to
    // happen outside the command that respects the lock.
    store.updateNode(boxOf('a').sid, {
      attributes: { ...(store.getNode(boxOf('a').sid) as any).attributes, locked: true }
    } as never);

    select(['a', 'b']);
    await run('alignBoxesLeft');
    // `b` had nothing to align to but itself, so nothing moved at all.
    expect(boxOf('b').x).toBe(400);
  });
});

/**
 * A place in the order, for one shape and for several.
 *
 * One was the layer list's question. Several is a *drag inside a frame that arranges*:
 * the shapes go in at that place keeping the order they already had between them.
 */
describe('moving boxes to a place in the order', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;

  const nameOf = (sid: string) => (store.getNode(sid) as any).attributes.name;
  const order = () => ((store.getNode(slide) as any).content as string[]).map(nameOf);
  const sidOf = (name: string) =>
    ((store.getNode(slide) as any).content as string[]).find((sid) => nameOf(sid) === name)!;

  beforeEach(() => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          {
            stype: 'surface',
            attributes: { kind: 'slide' },
            content: ['a', 'b', 'c', 'd'].map((name, index) => ({
              stype: 'rectangle',
              attributes: { name, x: index * 2000, y: 0, width: 1000, height: 1000 }
            }))
          }
        ]
      } as never,
      'slides'
    );
    slide = (store.getNode((editor as any).getRootId()) as any).content[0];
  });

  it('puts one shape where it was dropped', async () => {
    expect(await (editor as any).executeCommand('moveBoxTo', { nodeId: sidOf('d'), position: 1 })).toBe(true);
    expect(order()).toEqual(['a', 'd', 'b', 'c']);
  });

  /**
   * The trap `moveNode` sets for several at once.
   *
   * It removes the node and inserts into the **shortened** array, so moving `[a, b]` to
   * place 2 of `[a, b, c, d]` one at a time gives `[c, a, d, b]` — the second move's index
   * was computed against a list the first move had already changed. The command builds the
   * whole order instead and realises it left to right.
   */
  it('moves several together, keeping the order they had between them', async () => {
    expect(
      await (editor as any).executeCommand('moveBoxTo', {
        nodeIds: [sidOf('a'), sidOf('b')],
        position: 2
      })
    ).toBe(true);
    expect(order()).toEqual(['c', 'd', 'a', 'b']);
  });

  it('does not reverse them when they are named backwards', async () => {
    // Their order between them is the document's, not the order a reader shift-clicked in.
    await (editor as any).executeCommand('moveBoxTo', {
      nodeIds: [sidOf('c'), sidOf('a')],
      position: 0
    });
    expect(order()).toEqual(['a', 'c', 'b', 'd']);
  });

  it('refuses a drop that changes nothing', async () => {
    // A drag that lands where it started should leave no entry for a reader to undo into
    // nothing.
    expect(await (editor as any).executeCommand('moveBoxTo', { nodeId: sidOf('b'), position: 1 })).toBe(false);
    expect(
      await (editor as any).executeCommand('moveBoxTo', {
        nodeIds: [sidOf('a'), sidOf('b')],
        position: 0
      })
    ).toBe(false);
  });

  it('refuses shapes that are not siblings, because a place in an order is among siblings', async () => {
    const other = ((store.getNode((editor as any).getRootId()) as any).content as string[])[0];
    void other;
    expect(
      await (editor as any).executeCommand('moveBoxTo', {
        nodeIds: [sidOf('a'), slide],
        position: 1
      })
    ).toBe(false);
  });

  it('is one entry in the history, however many moved', async () => {
    await (editor as any).executeCommand('moveBoxTo', {
      nodeIds: [sidOf('a'), sidOf('b')],
      position: 2
    });
    await (editor as any).executeCommand('historyUndo');
    expect(order()).toEqual(['a', 'b', 'c', 'd']);
  });
});

/**
 * Tidying a diagram.
 *
 * The arithmetic is `layoutGraph`, unit-tested next to the connector geometry it belongs
 * with. What is asked here is the *command's* half: which shapes it reads, which lines it
 * counts as edges, that it stays where the reader put the picture, and that the whole
 * thing is one entry in the history — the last of which is the reason anybody will press
 * a button that moves everything they drew.
 */
describe('tidying a diagram', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;

  const run = async (command: string, payload?: unknown) =>
    await (editor as any).executeCommand(command, payload);
  const sidOf = (name: string) =>
    ((store.getNode(slide) as any).content as string[]).find(
      (id) => (store.getNode(id) as any).attributes.name === name
    )!;
  const at = (name: string) => {
    const attrs = (store.getNode(sidOf(name)) as any).attributes;
    return { x: attrs.x, y: attrs.y };
  };

  /** A diagram: three boxes in a chain, placed anywhere at all. */
  const load = (content: unknown[]) => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [{ stype: 'surface', attributes: { kind: 'slide' }, content: content as never }]
      } as never,
      'slides'
    );
    slide = (store.getNode((editor as any).getRootId()) as any).content[0];
  };

  const shape = (name: string, x: number, y: number) => ({
    stype: 'rectangle',
    attributes: { name, x, y, width: 3000, height: 1200 }
  });
  /**
   * A line, drawn by the command that draws one.
   *
   * Not a fixture attribute: `startNodeId` holds a sid, and a sid does not exist until
   * the document is loaded. Writing `$a` there looks like the DSL's alias and is not one
   * — aliases are resolved for content and parents, not inside attribute values — so the
   * fixture would have held a reference to nothing and the tidy would have found no
   * edges. Which is exactly what it did.
   */
  const join = async (from: string, to: string) => {
    await (editor as any).executeCommand('insertConnector', {
      startNodeId: sidOf(from),
      endNodeId: sidOf(to)
    });
    return ((store.getNode(slide) as any).content as string[]).find((sid) => {
      const node = store.getNode(sid) as any;
      return (
        node?.stype === 'connector' &&
        node.attributes?.startNodeId === sidOf(from) &&
        node.attributes?.endNodeId === sidOf(to)
      );
    })!;
  };

  beforeEach(async () => {
    load([shape('a', 6000, 500), shape('b', 300, 4000), shape('c', 9000, 4200)]);
    await join('a', 'b');
    await join('a', 'c');
  });

  it('puts the children below the parent, and the parent over their middle', async () => {
    expect(await run('arrangeGraph')).toBe(true);

    expect(at('b').y).toBeGreaterThan(at('a').y);
    expect(at('c').y).toBe(at('b').y);
    expect(at('a').x + 1500).toBeCloseTo((at('b').x + at('c').x + 3000) / 2, 0);
  });

  it('runs the ranks across when asked', async () => {
    expect(await run('arrangeGraph', { direction: 'right' })).toBe(true);
    expect(at('b').x).toBeGreaterThan(at('a').x);
    expect(at('c').x).toBe(at('b').x);
  });

  /**
   * Where the diagram *was*, not the corner of the slide.
   *
   * A reader who put a diagram in the lower half of a slide, under a title, means it to
   * stay in the lower half. A tidy that also moves the picture is two changes wearing
   * one name.
   */
  it('leaves the picture where the reader put it', async () => {
    await run('arrangeGraph');
    expect(Math.min(at('a').x, at('b').x, at('c').x)).toBe(300);
    expect(Math.min(at('a').y, at('b').y, at('c').y)).toBe(500);
  });

  it('is one entry in the history, however many shapes moved', async () => {
    const before = [at('a'), at('b'), at('c')];
    await run('arrangeGraph');
    expect([at('a'), at('b'), at('c')]).not.toEqual(before);

    // One press. A tidy recorded as eight moves is a tidy nobody dares press.
    await run('historyUndo');
    expect([at('a'), at('b'), at('c')]).toEqual(before);
  });

  it('takes the hand-placed bends off the lines it tidied, and puts them back on undo', async () => {
    const bent = ((store.getNode(slide) as any).content as string[]).find((sid) => {
      const node = store.getNode(sid) as any;
      return node?.stype === 'connector' && node.attributes?.endNodeId === sidOf('b');
    })!;
    await (editor as any).executeCommand('setConnector', {
      nodeIds: [bent],
      waypoints: [{ x: 5000, y: 3000 }],
      bend: 600
    });

    await run('arrangeGraph');
    // A waypoint describes a route through a picture that no longer exists: a detour
    // around a shape that has moved. Clearing it is part of what "tidy" means — and it
    // is in the same transaction, so one undo puts the diagram *and* the bend back.
    expect((store.getNode(bent) as any).attributes?.waypoints).toBeUndefined();
    expect((store.getNode(bent) as any).attributes?.bend).toBeUndefined();

    await run('historyUndo');
    expect((store.getNode(bent) as any).attributes?.waypoints).toHaveLength(1);
    expect((store.getNode(bent) as any).attributes?.bend).toBe(600);
  });

  it('leaves alone the shapes no line touches', async () => {
    load([shape('a', 6000, 500), shape('b', 300, 4000), shape('title', 200, 200)]);
    await join('a', 'b');

    await run('arrangeGraph');
    // A title, a note, a logo. Moving it because it shares the slide would be the button
    // doing something nobody asked for — and it is what makes this safe with everything
    // selected.
    expect(at('title')).toEqual({ x: 200, y: 200 });
  });

  it('cannot be run when there is nothing joined', async () => {
    load([shape('a', 1000, 1000), shape('b', 5000, 5000)]);
    expect((editor as any).canExecuteCommand?.('arrangeGraph')).toBe(false);
    expect(await run('arrangeGraph')).toBe(false);
  });

  /**
   * A locked shape is a **pin**, and this is the answer to "is the tidy a mode?" in the
   * product: it is not one — it runs once and writes plain coordinates — so a reader
   * arranges what they like afterwards, and `locked` is how they say which part of that
   * was deliberate. It survives the next press.
   *
   * The first version of this *excluded* a locked shape, which took its lines out of the
   * graph with it: one locked box in a chain made the whole diagram untidiable. The test
   * asserted that as if it were the design.
   */
  it('lays the diagram out around a shape the reader locked', async () => {
    load([
      { stype: 'rectangle', attributes: { name: 'a', x: 6000, y: 500, width: 3000, height: 1200, locked: true } },
      shape('b', 300, 4000)
    ]);
    await join('a', 'b');

    expect(await run('arrangeGraph')).toBe(true);
    // Not moved, and not written either: a move that lands on the same numbers is still
    // an entry in the history.
    expect(at('a')).toEqual({ x: 6000, y: 500 });
    // And the rest is hung from it rather than from a corner.
    expect(at('b').y).toBeGreaterThan(500 + 1200);
    expect(at('b').x).toBe(6000);
  });

  it('refuses when every shape in the diagram is locked', async () => {
    load([
      { stype: 'rectangle', attributes: { name: 'a', x: 6000, y: 500, width: 3000, height: 1200, locked: true } },
      { stype: 'rectangle', attributes: { name: 'b', x: 300, y: 4000, width: 3000, height: 1200, locked: true } }
    ]);
    await join('a', 'b');

    // There is a graph, and nothing in it may move. Honouring two pins would mean
    // stretching the ranks to reach both, which is a picture neither reader asked for.
    expect(await run('arrangeGraph')).toBe(false);
    expect(at('b')).toEqual({ x: 300, y: 4000 });
  });

  /**
   * Two or more selected means *those*, so a slide holding two diagrams can have one of
   * them tidied. With one box or none it is the whole slide, because "tidy this" said
   * about a single shape cannot mean that shape alone.
   */
  it('tidies the selected diagram and leaves the other one alone', async () => {
    load([
      shape('a', 6000, 500),
      shape('b', 300, 4000),
      shape('x', 12000, 500),
      shape('y', 12000, 4000)
    ]);
    await join('a', 'b');
    await join('x', 'y');

    (editor as any).setNode({ nodeIds: [sidOf('a'), sidOf('b')] });
    await run('arrangeGraph');

    expect(at('a').x).toBe(at('b').x);
    expect(at('x')).toEqual({ x: 12000, y: 500 });
  });

  /**
   * The gap is the diagram's, not a number in the source.
   *
   * A label pill sits on the middle of the line between two ranks, so a labelled diagram
   * needs more room than an unlabelled one — and it is measured from the label the reader
   * typed rather than chosen once and hoped over.
   */
  it('leaves more room between ranks when the lines carry labels', async () => {
    await run('arrangeGraph');
    const plain = at('b').y - at('a').y;

    const line = ((store.getNode(slide) as any).content as string[]).find(
      (sid) => (store.getNode(sid) as any)?.stype === 'connector'
    )!;
    await (editor as any).executeCommand('setConnector', {
      nodeIds: [line],
      label: '검토가 필요한 경우'
    });
    await run('arrangeGraph');

    expect(at('b').y - at('a').y).toBeGreaterThan(plain);
  });

  it('takes a gap a caller names, and ignores one that is not a number', async () => {
    await run('arrangeGraph', { rankGap: 5000 });
    expect(at('b').y - at('a').y).toBe(1200 + 5000);

    // Not an answer: a negative gap would stack the ranks on each other, and a string is
    // not a measurement. Both fall back to the measured one rather than being written.
    await run('arrangeGraph', { rankGap: -400 });
    const measured = at('b').y - at('a').y;
    await run('arrangeGraph', { rankGap: 'wide' });
    expect(at('b').y - at('a').y).toBe(measured);
  });

  it('does nothing to a diagram that is already tidy', async () => {
    await run('arrangeGraph');
    const tidy = [at('a'), at('b'), at('c')];
    // No move to write, so no undo entry that changes nothing.
    expect(await run('arrangeGraph')).toBe(false);
    expect([at('a'), at('b'), at('c')]).toEqual(tidy);
  });
});
