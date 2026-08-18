import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { transaction } from '@barocss/model';
import type { Editor } from '@barocss/editor-core';
import { layoutChildren, laysOut, layoutModeOf } from '../src/auto-layout';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';

/**
 * A frame that arranges what is in it.
 *
 * Pure arithmetic — settings and sizes in, positions out — so all of it runs in
 * milliseconds and none of it needs a document. The decision it implements is
 * in `docs/specs/canvas-model.md`: the layout is computed into the *model*,
 * because a slide places and every other part of the product reads `x` and `y`
 * to find out where something is.
 */
describe('arranging what is in a frame', () => {
  const child = (sid: string, x: number, y: number, width: number, height: number) => ({
    sid,
    box: { x, y, width, height }
  });

  const frame = (attributes: Record<string, unknown>) => ({
    attributes: { width: 10000, height: 6000, ...attributes }
  });

  it('leaves a frame that says nothing alone', () => {
    expect(laysOut({})).toBe(false);
    expect(laysOut({ layoutMode: 'none' })).toBe(false);
    expect(laysOut({ layoutMode: 'row' })).toBe(true);
    expect(layoutModeOf({ mode: 'sideways' })).toBe('none');

    const moved = layoutChildren(frame({}), [child('a', 5, 7, 100, 100)]);
    expect(moved.size).toBe(0);
  });

  it('lays a row out left to right, with the gap between', () => {
    const moved = layoutChildren(
      frame({ layoutMode: 'row', gap: 200, padding: 100 }),
      [child('a', 0, 0, 1000, 500), child('b', 0, 0, 600, 500), child('c', 0, 0, 400, 500)]
    );
    expect(moved.get('a')).toEqual({ x: 100, y: 100 });
    expect(moved.get('b')).toEqual({ x: 1300, y: 100 });
    expect(moved.get('c')).toEqual({ x: 2100, y: 100 });
  });

  it('lays a column out top to bottom', () => {
    // Started somewhere else on purpose: the answer is what *changes*, so a
    // child already in its place is correctly absent from it.
    const moved = layoutChildren(
      frame({ layoutMode: 'column', gap: 150 }),
      [child('a', 700, 700, 400, 300), child('b', 700, 700, 400, 200)]
    );
    expect(moved.get('a')).toEqual({ x: 0, y: 0 });
    expect(moved.get('b')).toEqual({ x: 0, y: 450 });
  });

  /**
   * The answer is what *changes*, which is what lets the reaction that calls
   * this run on every content change without feeding itself.
   */
  it('says nothing about a child that is already where it belongs', () => {
    const settings = frame({ layoutMode: 'row', gap: 100 });
    const children = [child('a', 0, 0, 500, 400), child('b', 600, 0, 500, 400)];

    expect(layoutChildren(settings, children).size).toBe(0);

    // Move one and only that one comes back.
    const moved = layoutChildren(settings, [children[0], child('b', 999, 0, 500, 400)]);
    expect([...moved.keys()]).toEqual(['b']);
  });

  describe('across the run', () => {
    const children = [child('tall', 0, 0, 400, 1000), child('short', 0, 0, 400, 200)];

    it('starts them level by default', () => {
      const moved = layoutChildren(frame({ layoutMode: 'row', gap: 0 }), children);
      expect(moved.get('short')?.y).toBe(0);
    });

    it('centres them when asked', () => {
      // The frame is 6000 tall, so a 200-tall child centres at 2900.
      const moved = layoutChildren(
        frame({ layoutMode: 'row', alignItems: 'center' }),
        children
      );
      expect(moved.get('short')?.y).toBe(2900);
      expect(moved.get('tall')?.y).toBe(2500);
    });

    it('drops them to the end when asked', () => {
      const moved = layoutChildren(frame({ layoutMode: 'row', alignItems: 'end' }), children);
      expect(moved.get('short')?.y).toBe(5800);
    });
  });

  describe('a grid', () => {
    // All four start away from where they belong, so every one of them appears
    // in the answer; a child already in place is left out by design.
    const four = [
      child('a', 900, 900, 400, 300),
      child('b', 900, 900, 600, 300),
      child('c', 900, 900, 400, 300),
      child('d', 900, 900, 400, 300)
    ];

    it('wraps at the column count', () => {
      const moved = layoutChildren(frame({ layoutMode: 'grid', columns: 2, gap: 100 }), four);
      expect(moved.get('a')).toEqual({ x: 0, y: 0 });
      expect(moved.get('b')).toEqual({ x: 500, y: 0 });
      // The second row starts under the first, and column one is as wide as its
      // widest item.
      expect(moved.get('c')).toEqual({ x: 0, y: 400 });
      expect(moved.get('d')).toEqual({ x: 500, y: 400 });
    });

    /**
     * Rows are as tall as their tallest item rather than uniform, which is what
     * keeps a grid of mixed shapes from leaving holes.
     */
    it('gives a row the height its tallest item needs', () => {
      const moved = layoutChildren(frame({ layoutMode: 'grid', columns: 2, gap: 0 }), [
        child('a', 900, 900, 400, 900),
        child('b', 900, 900, 400, 300),
        child('c', 900, 900, 400, 300),
        child('d', 900, 900, 400, 300)
      ]);
      expect(moved.get('c')?.y).toBe(900);
    });

    it('takes at least one column, however it is asked', () => {
      const moved = layoutChildren(frame({ layoutMode: 'grid', columns: 0 }), four);
      expect(moved.get('b')?.y).toBeGreaterThan(0);
    });
  });
});

/**
 * The command that turns a layout on, and the reaction that keeps it true.
 *
 * The arithmetic above needs no document; these do, because what is being
 * checked is that an arrangement survives the next edit — which is the whole
 * difference between a layout and a one-off tidy-up.
 */
describe('a frame that keeps its arrangement', () => {
  let editor: Editor;
  let store: DataStore;
  let frame: string;
  let children: string[];

  const run = async (command: string, payload?: unknown) =>
    await (editor as any).executeCommand(command, payload);
  const at = (sid: string) => {
    const a = (store.getNode(sid) as any).attributes;
    return `${a.x},${a.y}`;
  };

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
              {
                stype: 'frame',
                attributes: { x: 0, y: 0, width: 10000, height: 4000 },
                content: [
                  { stype: 'rectangle', attributes: { x: 800, y: 900, width: 1000, height: 500 } },
                  { stype: 'rectangle', attributes: { x: 3000, y: 2000, width: 1000, height: 500 } }
                ]
              }
            ]
          }
        ]
      } as never,
      'slides'
    );

    const slide = (store.getNode((editor as any).getRootId()) as any).content[0];
    [frame] = (store.getNode(slide) as any).content;
    children = (store.getNode(frame) as any).content;
  });

  it('refuses a frame that is not one, and a change that says nothing', () => {
    const can = (payload: unknown) => (editor as any).canExecuteCommand?.('setFrameLayout', payload);
    expect(can({ nodeId: children[0], layoutMode: 'row' })).toBe(false);
    expect(can({ nodeId: frame })).toBe(false);
    expect(can({ nodeId: frame, layoutMode: 'row' })).toBe(true);
  });

  /**
   * A reader who presses "row" and watches nothing move has been told the
   * button does nothing, so the setting and the arrangement are one command.
   */
  it('arranges the moment it is turned on', async () => {
    expect(await run('setFrameLayout', { nodeId: frame, layoutMode: 'row', gap: 200 })).toBeTruthy();
    expect(at(children[0])).toBe('0,0');
    expect(at(children[1])).toBe('1200,0');
  });

  it('undoes the setting and the arrangement together', async () => {
    await run('setFrameLayout', { nodeId: frame, layoutMode: 'row', gap: 200 });
    await (editor as any).undo();

    expect(at(children[0])).toBe('800,900');
    expect((store.getNode(frame) as any).attributes.layoutMode).toBeUndefined();
  });

  /** The difference between a layout and a tidy-up: it holds. */
  it('arranges a child that arrives afterwards', async () => {
    await run('setFrameLayout', { nodeId: frame, layoutMode: 'row', gap: 200 });

    await transaction(editor, [
      {
        type: 'addChild',
        payload: {
          parentId: frame,
          child: { stype: 'rectangle', attributes: { x: 7777, y: 7777, width: 500, height: 500 } }
        }
      }
    ] as never).commit();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const third = (store.getNode(frame) as any).content[2];
    expect(at(third)).toBe('2400,0');
  });

  it('closes the gap when a child is taken away', async () => {
    await run('setFrameLayout', { nodeId: frame, layoutMode: 'row', gap: 200 });
    await transaction(editor, [
      { type: 'removeChild', payload: { parentId: frame, childId: children[0] } }
    ] as never).commit();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(at(children[1])).toBe('0,0');
  });

  it('follows a child that changes size', async () => {
    await run('setFrameLayout', { nodeId: frame, layoutMode: 'row', gap: 200 });
    await run('setBoxGeometry', { nodeId: children[0], width: 2000 });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(at(children[1])).toBe('2200,0');
  });

  /**
   * The reaction writes, and writing is a change. It settles because the
   * arithmetic answers with what *differs*: run against a document that already
   * agrees, there is nothing to commit.
   */
  it('settles rather than feeding itself', async () => {
    await run('setFrameLayout', { nodeId: frame, layoutMode: 'row', gap: 200 });
    const settled = at(children[1]);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(at(children[1])).toBe(settled);
  });
});
