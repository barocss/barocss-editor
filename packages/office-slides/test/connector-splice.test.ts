import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';

/**
 * A shape dropped **into** a line.
 *
 * The gesture a flow chart is edited with, after the one that draws it: a reader who has
 * `수집 → 저장` and needs a check in between drops the shape on the line, and the line
 * becomes two. Every tool built for diagrams answers a drop on an edge this way.
 */
describe('splicing a shape into a line', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;

  const node = (sid: string) => store.getNode(sid) as any;
  const children = () => (node(slide).content ?? []) as string[];
  const named = (name: string) => children().find((sid) => node(sid).attributes?.name === name)!;
  const lines = () =>
    children()
      .filter((sid) => node(sid).stype === 'connector')
      .map((sid) => ({
        sid,
        from: node(sid).attributes.startNodeId,
        to: node(sid).attributes.endNodeId,
        attrs: node(sid).attributes
      }));
  const run = async (payload: unknown) =>
    await (editor as any).executeCommand('spliceIntoConnector', payload);

  beforeEach(async () => {
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
              { stype: 'rectangle', attributes: { name: 'a', x: 0, y: 0, width: 2000, height: 1000 } },
              { stype: 'rectangle', attributes: { name: 'b', x: 9000, y: 0, width: 2000, height: 1000 } },
              { stype: 'rectangle', attributes: { name: 'c', x: 4000, y: 4000, width: 2000, height: 1000 } }
            ]
          }
        ]
      } as never,
      'slides'
    );
    slide = (store.getNode((editor as any).getRootId()) as any).content[0];

    await (editor as any).executeCommand('insertConnector', {
      startNodeId: named('a'),
      endNodeId: named('b'),
      kind: 'elbow'
    });
  });

  it('turns one relationship into two, through the shape', async () => {
    expect(lines()).toHaveLength(1);
    const line = lines()[0].sid;

    expect(await run({ nodeId: named('c'), connectorId: line })).toBe(true);

    const now = lines();
    expect(now).toHaveLength(2);
    expect(now.map((one) => [one.from, one.to])).toEqual([
      [named('a'), named('c')],
      [named('c'), named('b')]
    ]);
    // And the line that was there is gone: three lines would leave the diagram saying
    // both the old relationship and the two new ones.
    expect(children()).not.toContain(line);
  });

  it('carries the look onto both halves and leaves the route behind', async () => {
    const line = lines()[0].sid;
    await (editor as any).executeCommand('setConnector', {
      nodeIds: [line],
      kind: 'curve',
      strokeDash: 'dash',
      stroke: '#16a34a',
      endCap: 'diamond',
      bend: 900,
      waypoints: [{ x: 5000, y: 2000 }]
    });

    await run({ nodeId: named('c'), connectorId: line });

    for (const half of lines()) {
      // A reader who dashed a line green has not asked for one green line and one
      // default one.
      expect(half.attrs.kind).toBe('curve');
      expect(half.attrs.strokeDash).toBe('dash');
      expect(half.attrs.stroke).toBe('#16a34a');
      expect(half.attrs.endCap).toBe('diamond');
      // What is left behind is where it *went*: a bow and a hand-placed bend describe a
      // route through a picture that no longer exists (the same rule the tidy follows).
      expect(half.attrs.bend).toBeUndefined();
      expect(half.attrs.waypoints).toBeUndefined();
    }
  });

  it('keeps the outer magnets and leaves the new inner ends to be worked out', async () => {
    const line = lines()[0].sid;
    await (editor as any).executeCommand('setConnector', {
      nodeIds: [line],
      startSide: 'e',
      endSide: 'w'
    });

    await run({ nodeId: named('c'), connectorId: line });
    const [first, second] = lines();
    expect(first.attrs.startSide).toBe('e');
    expect(first.attrs.endSide).toBe('auto');
    expect(second.attrs.startSide).toBe('auto');
    expect(second.attrs.endSide).toBe('w');
  });

  it('puts the label on the first half only', async () => {
    const line = lines()[0].sid;
    await (editor as any).executeCommand('setConnector', { nodeIds: [line], label: '검토' });

    await run({ nodeId: named('c'), connectorId: line });
    const [first, second] = lines();
    // It named the relationship, and the first half is the one that still starts where
    // the relationship did. On both it would be said twice; on neither, a word the
    // reader typed would be lost.
    expect(first.attrs.label).toBe('검토');
    expect(second.attrs.label).toBeUndefined();
  });

  it('takes the drop’s own move in the same entry', async () => {
    const line = lines()[0].sid;
    const was = { ...node(named('c')).attributes };

    await run({ nodeId: named('c'), connectorId: line, x: 5000, y: 2500 });
    expect(node(named('c')).attributes.x).toBe(5000);

    /*
     * One press. The gesture put the shape there and split the line; undoing it three
     * times would have a reader watching their diagram rebuild itself in stages.
     */
    await (editor as any).executeCommand('historyUndo');
    expect(node(named('c')).attributes.x).toBe(was.x);
    expect(lines()).toHaveLength(1);
    expect(lines()[0].sid).toBe(line);
  });

  it('keeps the two halves where the line was in paint order', async () => {
    const line = lines()[0].sid;
    const at = children().indexOf(line);
    await run({ nodeId: named('c'), connectorId: line });

    const now = children();
    expect(now[at]).toBe(lines()[0].sid);
    expect(now[at + 1]).toBe(lines()[1].sid);
  });

  describe('refuses what would leave a diagram lying', () => {
    it('a shape that is already an end of that line', async () => {
      const line = lines()[0].sid;
      // `a → b` with `b` dropped on it would become `a → b` and `b → b`, and a line from
      // a shape to itself has no route.
      expect(await run({ nodeId: named('b'), connectorId: line })).toBe(false);
      expect(lines()).toHaveLength(1);
    });

    it('a line with a free end', async () => {
      await (editor as any).executeCommand('setConnector', {
        nodeIds: [lines()[0].sid],
        endNodeId: null
      });
      // There is no second relationship to make: half of what the reader sees is a point
      // in space rather than a shape.
      expect(await run({ nodeId: named('c'), connectorId: lines()[0].sid })).toBe(false);
    });

    it('another line, because that is a branch and not a splice', async () => {
      const line = lines()[0].sid;
      await (editor as any).executeCommand('insertConnector', {
        startNodeId: named('c'),
        endNodeId: named('a')
      });
      const other = lines().find((one) => one.sid !== line)!.sid;
      // A line joined to the middle of a line is `endT` — a different gesture with a
      // different answer (§8.6).
      expect(await run({ nodeId: other, connectorId: line })).toBe(false);
    });

    it('a shape on another slide', async () => {
      const away = await (editor as any).executeCommand('insertSlide', {});
      void away;
      const other = ((store.getNode((editor as any).getRootId()) as any).content as string[]).find(
        (sid) => sid !== slide && (store.getNode(sid) as any)?.stype === 'surface'
      )!;
      await (editor as any).executeCommand('insertRectangle', {
        slideId: other,
        width: 1000,
        height: 1000
      });
      const elsewhere = ((store.getNode(other) as any).content as string[])[0];
      // A line's coordinates are its parent's, so a shape on another slide cannot be in
      // this chain.
      expect(await run({ nodeId: elsewhere, connectorId: lines()[0].sid })).toBe(false);
    });
  });
});

/**
 * Turning a line round.
 *
 * A connector is a relationship and a relationship has a direction — the arrowhead is on
 * the end. Drawn the wrong way round, which happens whenever a reader picks the two shapes
 * in the order they were thinking of them, the ways back were deleting the line and drawing
 * it again or dragging both ends past each other.
 */
describe('reversing a line', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;

  const node = (sid: string) => store.getNode(sid) as any;
  const children = () => (node(slide).content ?? []) as string[];
  const named = (name: string) => children().find((sid) => node(sid).attributes?.name === name)!;
  const line = () => children().find((sid) => node(sid).stype === 'connector')!;
  const attrs = () => node(line()).attributes as Record<string, unknown>;

  beforeEach(async () => {
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
              { stype: 'rectangle', attributes: { name: 'a', x: 0, y: 0, width: 2000, height: 1000 } },
              { stype: 'rectangle', attributes: { name: 'b', x: 9000, y: 0, width: 2000, height: 1000 } }
            ]
          }
        ]
      } as never,
      'slides'
    );
    slide = (store.getNode((editor as any).getRootId()) as any).content[0];
    await (editor as any).executeCommand('insertConnector', {
      startNodeId: named('a'),
      endNodeId: named('b')
    });
  });

  const reverse = async () =>
    await (editor as any).executeCommand('reverseConnector', { nodeIds: [line()] });

  it('swaps which shape is which end', async () => {
    const a = named('a');
    const b = named('b');
    expect(await reverse()).toBe(true);
    expect(attrs().startNodeId).toBe(b);
    expect(attrs().endNodeId).toBe(a);
  });

  it('takes the magnets and the frozen places with it', async () => {
    await (editor as any).executeCommand('setConnector', {
      nodeIds: [line()],
      startSide: 'e',
      endSide: 'w'
    });
    const before = { ...attrs() };

    await reverse();
    // A half-swapped line points at one shape and is clipped to another: the magnet a
    // reader chose for a shape has to travel with that shape.
    expect(attrs().startSide).toBe('w');
    expect(attrs().endSide).toBe('e');
    expect(attrs().startX).toBe(before.endX);
    expect(attrs().endY).toBe(before.startY);
  });

  it('leaves the caps alone, which is what moves them to the other shapes', async () => {
    await (editor as any).executeCommand('setConnector', {
      nodeIds: [line()],
      startCap: 'diamond',
      endCap: 'arrow'
    });

    await reverse();
    /*
     * Measured, because I had written the opposite: swapping the caps as well leaves every
     * arrowhead on the shape it was already on, and a reader watching sees *nothing*
     * happen — a cap drawn at a shape looks the same whether it is that line's start or
     * its end. A cap is notation attached to the **direction** (the arrow at the end,
     * UML's diamond at the whole), so leaving these two alone is what moves the drawn
     * caps to the other shapes.
     */
    expect(attrs().startCap).toBe('diamond');
    expect(attrs().endCap).toBe('arrow');
  });

  it('reads the reader’s bends backwards, and mirrors the bow', async () => {
    await (editor as any).executeCommand('setConnector', {
      nodeIds: [line()],
      bend: 600,
      waypoints: [
        { x: 3000, y: 2000 },
        { x: 6000, y: 4000 }
      ]
    });

    await reverse();
    /*
     * A waypoint list is walked from the start, so the same list on a reversed line is a
     * visibly different route — on a line the reader only asked to turn round. The bow is
     * measured across the line from start to end, and that direction has changed.
     */
    expect(attrs().waypoints).toEqual([
      { x: 6000, y: 4000 },
      { x: 3000, y: 2000 }
    ]);
    expect(attrs().bend).toBe(-600);
  });

  it('is its own inverse', async () => {
    const before = { ...attrs() };
    await reverse();
    await reverse();
    expect(attrs().startNodeId).toBe(before.startNodeId);
    expect(attrs().endNodeId).toBe(before.endNodeId);
    // Untouched throughout, which is the point of leaving them alone.
    expect(attrs().endCap).toBe('arrow');
    expect(attrs().startCap).toBeUndefined();
  });

  it('takes an end off nothing rather than leaving a stale number', async () => {
    // A free end: `endNodeId` is absent, so after the swap `startNodeId` must be *absent*
    // too rather than holding the shape that used to be at the other end.
    await (editor as any).executeCommand('setConnector', { nodeIds: [line()], endNodeId: null });
    await reverse();
    expect(attrs().startNodeId).toBeUndefined();
    expect(attrs().endNodeId).toBe(named('a'));
  });

  it('reverses every line the payload names, in one entry', async () => {
    await (editor as any).executeCommand('insertConnector', {
      startNodeId: named('b'),
      endNodeId: named('a')
    });
    const both = children().filter((sid) => node(sid).stype === 'connector');
    const was = both.map((sid) => node(sid).attributes.startNodeId);

    await (editor as any).executeCommand('reverseConnector', { nodeIds: both });
    expect(both.map((sid) => node(sid).attributes.startNodeId)).not.toEqual(was);

    await (editor as any).executeCommand('historyUndo');
    expect(both.map((sid) => node(sid).attributes.startNodeId)).toEqual(was);
  });
});
