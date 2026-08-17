import { describe, it, expect } from 'vitest';
import { createSchema } from '@barocss/schema';
import { boxAt, isSceneType, SCENE_TYPES, slideAt } from '../src/selection';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import type { DeckAccess, DeckNode } from '../src/deck';

/**
 * Which box the reader is in — the question a properties panel asks, and the
 * one that can be answered before multi-node selection exists.
 */
describe('finding the box the reader is in', () => {
  /** Held as a loaded document is: children are sids, and children know their parent. */
  const docOf = (nodes: Record<string, DeckNode & { parentId?: string }>): DeckAccess => ({
    rootId: 'doc',
    getNode: (sid) => nodes[sid]
  });

  const deck = () =>
    docOf({
      doc: { stype: 'document', content: ['s1'] },
      s1: { stype: 'surface', attributes: {}, content: ['frame1'], sid: 's1', parentId: 'doc' },
      frame1: {
        stype: 'frame',
        attributes: { x: 10, y: 20, width: 100, height: 50 },
        content: ['box1'],
        sid: 'frame1',
        parentId: 's1'
      },
      box1: {
        stype: 'textFrame',
        attributes: { role: 'title', x: 1, y: 2, width: 30, height: 40, locked: true },
        content: ['p1'],
        sid: 'box1',
        parentId: 'frame1'
      },
      p1: { stype: 'paragraph', content: ['t1'], sid: 'p1', parentId: 'box1' },
      t1: { stype: 'inline-text', text: 'hello', sid: 't1', parentId: 'p1' }
    });

  it('is the nearest box, not the outermost', () => {
    // A shape inside a frame inside a group is three boxes deep, and the one the
    // reader means is the one they are in.
    const box = boxAt(deck(), 't1');
    expect(box?.sid).toBe('box1');
    expect(box?.stype).toBe('textFrame');
    expect(box?.role).toBe('title');
  });

  it('is the box itself when the box is what was asked about', () => {
    expect(boxAt(deck(), 'frame1')?.sid).toBe('frame1');
  });

  it('carries the attributes a panel draws', () => {
    expect(boxAt(deck(), 't1')?.attributes).toMatchObject({ x: 1, width: 30, locked: true });
  });

  it('is nothing when the caret is not in a box', () => {
    expect(boxAt(deck(), 's1')).toBeUndefined();
    expect(boxAt(deck(), undefined)).toBeUndefined();
    expect(boxAt(deck(), 'nope')).toBeUndefined();
  });

  it('finds the slide by walking past every box', () => {
    expect(slideAt(deck(), 't1')).toBe('s1');
    expect(slideAt(deck(), 'frame1')).toBe('s1');
    expect(slideAt(deck(), 'doc')).toBeUndefined();
  });

  it('does not hang on a document that points at itself', () => {
    const looped = docOf({
      doc: { stype: 'document', content: [] },
      a: { stype: 'paragraph', sid: 'a', parentId: 'b' },
      b: { stype: 'paragraph', sid: 'b', parentId: 'a' }
    });
    expect(boxAt(looped, 'a')).toBeUndefined();
    expect(slideAt(looped, 'a')).toBeUndefined();
  });

  /**
   * The check that keeps the product statement honest.
   *
   * `SCENE_TYPES` is written out rather than read at runtime, so a node type
   * added to the schema's `scene` group without a thought here would be silently
   * unselectable — a box nobody could get the properties of, with nothing
   * failing.
   */
  it('lists exactly the schema’s scene group', () => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    const inGroup = [...(schema as any).nodes.values()]
      .filter((node: any) => node.group === 'scene')
      .map((node: any) => node.name)
      .sort();

    expect([...SCENE_TYPES].sort()).toEqual(inGroup);
    for (const name of inGroup) expect(isSceneType(name)).toBe(true);
  });

  it('says no to anything that is not one', () => {
    expect(isSceneType('paragraph')).toBe(false);
    expect(isSceneType(undefined)).toBe(false);
    expect(isSceneType(42)).toBe(false);
  });
});
