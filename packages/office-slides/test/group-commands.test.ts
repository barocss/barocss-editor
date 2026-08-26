import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { selectedNodeIds, type Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';

/**
 * Making several boxes into one thing.
 *
 * `group` has been in the schema since the canvas nodes were declared and drawn
 * since this product had renderers, and nothing had ever made one.
 */
describe('grouping', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;

  const run = async (command: string) => await editor.executeCommand(command);
  const can = (command: string) => editor?.canExecuteCommand(command);
  const node = (sid: string) => store.getNode(sid) as any;
  const children = (sid: string) => (node(sid).content ?? []) as string[];
  const named = (name: string): string => {
    const find = (sid: string): string | undefined => {
      if (node(sid)?.attributes?.name === name) return sid;
      for (const child of children(sid)) {
        const found = find(child);
        if (found) return found;
      }
      return undefined;
    };
    return find(slide)!;
  };
  const at = (name: string) => {
    const { x, y } = node(named(name)).attributes;
    return { x, y };
  };

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
              { stype: 'rectangle', attributes: { name: 'a', x: 1000, y: 2000, width: 500, height: 500 } },
              { stype: 'rectangle', attributes: { name: 'b', x: 3000, y: 4000, width: 500, height: 500 } },
              { stype: 'rectangle', attributes: { name: 'c', x: 8000, y: 8000, width: 500, height: 500 } }
            ]
          }
        ]
      } as never,
      'slides'
    );
    slide = (store.getNode(editor.getRootId()) as any).content[0];
  });

  const select = (names: string[]) =>
    editor.setNode({ nodeIds: names.map((name) => named(name)) });

  it('takes two', () => {
    select(['a']);
    expect(can('groupBoxes')).toBe(false);
    select(['a', 'b']);
    expect(can('groupBoxes')).toBe(true);
  });

  it('puts them inside a group whose box is their union', async () => {
    select(['a', 'b']);
    expect(await run('groupBoxes')).toBeTruthy();

    const group = children(slide).map(node).find((n) => n.stype === 'group');
    expect(group).toBeTruthy();
    expect(group.attributes).toMatchObject({ x: 1000, y: 2000, width: 2500, height: 2500 });
    expect(group.content).toHaveLength(2);
  });

  it('keeps their sids, so nothing pointing at them is left pointing at nothing', async () => {
    const before = [named('a'), named('b')];
    select(['a', 'b']);
    await run('groupBoxes');
    expect([named('a'), named('b')]).toEqual(before);
  });

  it('rebases them onto the group, so nothing moves on screen', async () => {
    select(['a', 'b']);
    await run('groupBoxes');

    // a was at the union's origin; b was 2000 across and down from it.
    expect(at('a')).toEqual({ x: 0, y: 0 });
    expect(at('b')).toEqual({ x: 2000, y: 2000 });
  });

  it('keeps the group where the topmost of them was', async () => {
    // Not at the front: grouping is not a reason to jump over everything else.
    select(['a', 'b']);
    await run('groupBoxes');
    expect(children(slide).map((sid) => node(sid).stype)).toEqual(['group', 'rectangle']);
  });

  it('selects the group, which is the thing the reader made', async () => {
    select(['a', 'b']);
    await run('groupBoxes');
    const ids = selectedNodeIds(editor.selection);
    expect(ids).toHaveLength(1);
    expect(node(ids[0]).stype).toBe('group');
  });

  it('is one thing to undo', async () => {
    select(['a', 'b']);
    await run('groupBoxes');
    await editor.undo();

    expect(children(slide).map((sid) => node(sid).stype)).toEqual([
      'rectangle',
      'rectangle',
      'rectangle'
    ]);
    expect(at('a')).toEqual({ x: 1000, y: 2000 });
  });

  describe('taking one apart', () => {
    beforeEach(async () => {
      select(['a', 'b']);
      await run('groupBoxes');
    });

    it('needs a group', async () => {
      select(['c']);
      expect(can('ungroupBoxes')).toBe(false);
    });

    it('puts them back where they were on screen', async () => {
      expect(await run('ungroupBoxes')).toBeTruthy();
      expect(at('a')).toEqual({ x: 1000, y: 2000 });
      expect(at('b')).toEqual({ x: 3000, y: 4000 });
    });

    it('throws the group away, because an empty group is not a group', async () => {
      await run('ungroupBoxes');
      expect(children(slide).map((sid) => node(sid).stype)).not.toContain('group');
    });

    it('selects what came out', async () => {
      await run('ungroupBoxes');
      expect(selectedNodeIds(editor.selection)).toHaveLength(2);
    });

    it('undoes back into the group', async () => {
      await run('ungroupBoxes');
      await editor.undo();
      const group = children(slide).map(node).find((n) => n.stype === 'group');
      expect(group?.content).toHaveLength(2);
      expect(at('a')).toEqual({ x: 0, y: 0 });
    });
  });
});

/**
 * Undoing a move inside a group.
 *
 * The group's rectangle follows what is in it, which nothing kept true until a reaction
 * was written to keep it — and *that* is where this got interesting. The fit is not only
 * derived numbers: it **re-origins**, moving the group one way and every child the other
 * by the same amount, which together change nothing on screen. Both of the obvious
 * answers about the history were measured and both were wrong.
 */
describe('a move inside a group, and the undo of it', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;

  const node = (sid: string) => store.getNode(sid) as any;
  const named = (name: string): string => {
    const find = (sid: string): string | undefined => {
      if (node(sid)?.attributes?.name === name) return sid;
      for (const child of (node(sid)?.content ?? []) as string[]) {
        const found = find(child);
        if (found) return found;
      }
      return undefined;
    };
    return find(editor.getRootId())!;
  };
  const boxOf = (name: string) => {
    const { x, y, width, height } = node(named(name)).attributes;
    return { x, y, width, height };
  };
  /** The reaction runs on the document change, so a beat has to pass. */
  const settle = async () => await new Promise((resolve) => setTimeout(resolve, 20));

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
                stype: 'group',
                attributes: { name: 'g', x: 1000, y: 1000, width: 4000, height: 2000 },
                content: [
                  { stype: 'rectangle', attributes: { name: 'a', x: 0, y: 0, width: 1000, height: 1000 } },
                  { stype: 'rectangle', attributes: { name: 'b', x: 3000, y: 1000, width: 1000, height: 1000 } }
                ]
              }
            ]
          }
        ]
      } as never,
      'slides'
    );
    slide = (store.getNode(editor.getRootId()) as any).content[0];
    void slide;
    await settle();
  });

  it('is taken back by one press, exactly', async () => {
    const before = { a: boxOf('a'), b: boxOf('b'), g: boxOf('g') };

    await editor.executeCommand('setBoxGeometry', { nodeId: named('a'), x: 6000 });
    await settle();
    expect(boxOf('a')).not.toEqual(before.a);
    // The fit re-origined: the group moved right and both children moved left by the
    // same amount, so nothing moved on screen.
    expect(boxOf('g').x).toBeGreaterThan(before.g.x);

    await editor.executeCommand('historyUndo');
    await settle();

    /*
     * All three, from one press. Measured before this was fixed: recorded as its own
     * entry, **three** presses of undo changed nothing at all — each undid the fit and
     * the reaction wrote it straight back. Left out of the history entirely, the child
     * came back and the group did not: the reader's relative `x` was restored into a
     * coordinate space that had since moved, putting the shape somewhere it had never
     * been.
     */
    expect(boxOf('a')).toEqual(before.a);
    expect(boxOf('b')).toEqual(before.b);
    expect(boxOf('g')).toEqual(before.g);
  });

  it('is put back by a redo, both halves of it', async () => {
    await editor.executeCommand('setBoxGeometry', { nodeId: named('a'), x: 6000 });
    await settle();
    const after = { a: boxOf('a'), b: boxOf('b'), g: boxOf('g') };

    await editor.executeCommand('historyUndo');
    await settle();
    await editor.executeCommand('historyRedo');
    await settle();

    // A redo replays the edit and its consequence together, because they are one entry.
    expect({ a: boxOf('a'), b: boxOf('b'), g: boxOf('g') }).toEqual(after);
  });

  it('keeps the group honest while the reader works', async () => {
    // The reason the reaction exists at all: a child moved out left a group describing an
    // area its contents had left, and the handles, the marquee, the hit test and aligning
    // were all reading a rectangle that had stopped meaning anything.
    await editor.executeCommand('setBoxGeometry', { nodeId: named('b'), x: 9000 });
    await settle();

    const group = boxOf('g');
    const b = boxOf('b');
    expect(b.x + b.width).toBeLessThanOrEqual(group.width);
    expect(b.x).toBeGreaterThanOrEqual(0);
  });
});
