import { describe, it, expect } from 'vitest';
import { createSchema } from '@barocss/schema';
import { agreed, agreedAttr, boxAt, isSceneType, SCENE_TYPES, slideAt } from '../src/selection';
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
   *
   * The scene group **and `frame`**, which is the one exception and is written
   * down rather than absorbed. A frame is a *layout box* — a thing that holds
   * other things and decides where they go — which is as useful in a document
   * as on a slide, so the schema makes it a block and the canvas containers
   * name it. On a slide it is still a box a reader selects, drags and gives a
   * fill, so this product treats it as one.
   */
  it('lists the schema’s scene group, and the frame that left it', () => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    const inGroup = [...(schema as any).nodes.values()]
      .filter((node: any) => node.group === 'scene')
      .map((node: any) => node.name)
      .sort();

    expect([...SCENE_TYPES].sort()).toEqual([...inGroup, 'frame'].sort());
    for (const name of inGroup) expect(isSceneType(name)).toBe(true);
    expect(isSceneType('frame')).toBe(true);
  });

  it('says no to anything that is not one', () => {
    expect(isSceneType('paragraph')).toBe(false);
    expect(isSceneType(undefined)).toBe(false);
    expect(isSceneType(42)).toBe(false);
  });
});

/**
 * What several boxes agree on.
 *
 * The fault this was written for was measured in a browser: with a 6000-twip
 * rectangle and a 2000-twip ellipse both selected, the properties panel showed
 * the rectangle's width as if it were the selection's, and typing a width changed
 * the rectangle and left the ellipse alone. The controls had been ready for it
 * since Word's ruler — `PropertyNumber` draws a `null` as an empty field with a
 * placeholder — and nothing ever passed one.
 */
describe('what a selection agrees on', () => {
  it('is the shared value, or nothing at all', () => {
    expect(agreed([4, 4, 4])).toBe(4);
    expect(agreed([4, 9])).toBeNull();
    // One box is a selection that agrees with itself.
    expect(agreed(['x'])).toBe('x');
    // And nothing selected has nothing to say, which is not the same as zero.
    expect(agreed([])).toBeNull();
    expect(agreed([false, false])).toBe(false);
  });

  /**
   * A box that has never heard of the attribute is skipped rather than counted as
   * a disagreement: a rectangle and an ellipse differ about `cornerRadius` only in
   * that one of them does not have corners, and blanking the row would answer a
   * question nobody asked.
   */
  it('skips the boxes that do not declare it', () => {
    const doc = {
      rootId: 'root',
      getNode: (sid: string) =>
        ({
          rect: { sid: 'rect', stype: 'rectangle', attributes: { width: 6000, cornerRadius: 120 } },
          oval: { sid: 'oval', stype: 'ellipse', attributes: { width: 6000 } },
          wide: { sid: 'wide', stype: 'rectangle', attributes: { width: 2000, cornerRadius: 120 } }
        })[sid] as never
    };

    // They agree about the width…
    expect(agreedAttr(doc as never, ['rect', 'oval'], 'width')).toBe(6000);
    // …and the radius is the rectangle's alone, so it is the answer.
    expect(agreedAttr(doc as never, ['rect', 'oval'], 'cornerRadius')).toBe(120);
    // Two rectangles at different widths agree about nothing.
    expect(agreedAttr(doc as never, ['rect', 'wide'], 'width')).toBeNull();
    // And an attribute none of them has is nothing rather than `undefined`, so a
    // field draws its placeholder instead of the word "undefined".
    expect(agreedAttr(doc as never, ['rect', 'oval'], 'nonsense')).toBeNull();
    expect(agreedAttr(doc as never, [], 'width')).toBeNull();
  });
});
