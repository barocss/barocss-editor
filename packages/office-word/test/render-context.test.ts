import { describe, it, expect } from 'vitest';
import {
  WORD_ENV_KEY,
  createWordEnv,
  wordEnv,
  getWordDocument,
  getWordNow,
  getEditingFurniture,
  getFurniturePlacement,
  getBlockPosition,
  getBlockPush
} from '../src/render-context';
import type { DocumentAccess } from '../src/document-access';
import type { SurfaceLayout } from '../src/layout';

/**
 * The environment a Word render reads from.
 *
 * Every renderer in this package reaches the layout through these accessors, so
 * a wrong answer here moves text on the page — and it moves it in a way that
 * looks like a pagination bug, several layers from the cause. They were covered
 * only by loading the app, which is a slow way to check a Map lookup.
 *
 * The accessors are deliberately total: a render with no environment at all is
 * an ordinary case (a test, a server-side pass, the first paint before anything
 * has been measured), and it has to draw rather than throw.
 */
const doc: DocumentAccess = {
  getNode: (id: string) => ({ sid: id }),
  rootId: 'root'
};

const layout = (over: Partial<SurfaceLayout> = {}): SurfaceLayout =>
  ({
    pushBySid: new Map(),
    positionBySid: new Map(),
    splitBySid: new Map(),
    originTop: 0,
    originLeft: 0,
    footnotesByPage: new Map(),
    pageOfBlock: new Map(),
    metrics: {
      width: 816,
      height: 1056,
      marginTop: 96,
      marginBottom: 96,
      marginLeft: 96,
      marginRight: 96,
      columnCount: 1,
      columnGap: 0,
      columnWidth: 624
    },
    ...over
  }) as unknown as SurfaceLayout;

const envOf = (word: unknown) => ({ [WORD_ENV_KEY]: word }) as any;

describe('an environment with nothing in it', () => {
  it('answers every question without throwing', () => {
    // The first paint happens before anything has been measured, and a renderer
    // that threw then would mean the document could never appear at all.
    for (const env of [undefined, {} as any]) {
      expect(wordEnv(env)).toBeUndefined();
      expect(getWordDocument(env)).toBeUndefined();
      expect(getWordNow(env)).toBeUndefined();
      expect(getEditingFurniture(env)).toBeUndefined();
      expect(getBlockPush(env, 'p1')).toBeUndefined();
      expect(getBlockPosition(env, 'p1')).toBeUndefined();
      expect(getFurniturePlacement(env, 'h1', 'header')).toBeUndefined();
    }
  });
});

describe('building the environment', () => {
  it('flattens pushes and positions from every surface into one lookup', () => {
    // A renderer has a block's sid and no idea which surface laid it out, so the
    // per-surface layouts are flattened once here rather than searched per block.
    const env = createWordEnv(
      doc,
      new Map([
        ['s1', layout({ pushBySid: new Map([['p1', 40]]) })],
        [
          's2',
          layout({
            pushBySid: new Map([['p2', 12]]),
            positionBySid: new Map([['p3', { top: 5, left: 6, width: 300 }]])
          })
        ]
      ])
    );

    expect(env.pushes.get('p1')).toBe(40);
    expect(env.pushes.get('p2')).toBe(12);
    expect(env.positions.get('p3')).toEqual({ top: 5, left: 6, width: 300 });
  });

  it('starts empty when nothing has been measured', () => {
    const env = createWordEnv(doc);
    expect(env.layouts.size).toBe(0);
    expect(env.pushes.size).toBe(0);
    expect(getBlockPush(envOf(env), 'p1')).toBeUndefined();
  });

  it('carries the host instant rather than reading the clock', () => {
    // A renderer that read the clock would produce different output on two runs,
    // which no test can pin and which makes every layout pass look like a change.
    const now = new Date('2026-08-05T09:00:00Z');
    expect(getWordNow(envOf(createWordEnv(doc, new Map(), undefined, now)))).toBe(now);
  });
});

describe('a header or footer being edited', () => {
  const measured = new Map([['s1', layout({ originTop: 20, originLeft: 10 })]]);

  it('places the real node where the first page drew its copy', () => {
    // Editing the header of page 4 and of page 1 are the same edit, so the first
    // page's copy is the one replaced.
    const env = envOf(createWordEnv(doc, measured, 'h1'));
    expect(getFurniturePlacement(env, 'h1', 'header')).toEqual({
      left: 10 + 96,
      top: 20 + 96 / 2,
      width: 816 - 96 - 96
    });
  });

  it('puts a footer at the bottom margin instead', () => {
    const env = envOf(createWordEnv(doc, measured, 'f1'));
    expect(getFurniturePlacement(env, 'f1', 'footer')?.top).toBe(20 + 1056 - 96);
  });

  it('places nothing while a different one, or none, is being edited', () => {
    // Two headers are not one edit: only the one named is shown in place.
    expect(getFurniturePlacement(envOf(createWordEnv(doc, measured, 'h1')), 'h2', 'header'))
      .toBeUndefined();
    expect(getFurniturePlacement(envOf(createWordEnv(doc, measured)), 'h1', 'header'))
      .toBeUndefined();
  });

  it('places nothing before the document has been measured', () => {
    // There is no first page to stand in for yet.
    const env = envOf(createWordEnv(doc, new Map(), 'h1'));
    expect(getEditingFurniture(env)).toBe('h1');
    expect(getFurniturePlacement(env, 'h1', 'header')).toBeUndefined();
  });
});
