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

  const run = async (command: string) => await (editor as any).executeCommand(command);
  const can = (command: string) => (editor as any).canExecuteCommand?.(command);
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
    slide = (store.getNode((editor as any).getRootId()) as any).content[0];
  });

  const select = (names: string[]) =>
    (editor as any).setNode({ nodeIds: names.map((name) => named(name)) });

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
    await (editor as any).undo();

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
      await (editor as any).undo();
      const group = children(slide).map(node).find((n) => n.stype === 'group');
      expect(group?.content).toHaveLength(2);
      expect(at('a')).toEqual({ x: 0, y: 0 });
    });
  });
});
