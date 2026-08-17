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
