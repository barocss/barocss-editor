import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { slideTimeline, withTiming } from '../src/timeline';
import type { DeckAccess } from '../src/deck';
import { boxesInside } from '../src/selection';
import {
  PATH_PRESETS,
  addPoint,
  facingCss,
  movePoint,
  pathCss,
  pathData,
  pathLength,
  pathPointsOf,
  pathPreset,
  removePoint
} from '../src/motion-path';

/**
 * A path a shape travels.
 *
 * What is worth testing in milliseconds is the geometry — a curve that passes
 * through the points a reader placed, and the half-a-shape offset that makes
 * `(0, 0)` mean "where it already is". Both are invisible when wrong: a path off
 * by half a shape looks like a path, and a curve that misses its points looks
 * like a curve.
 */
describe('reading a path a document holds', () => {
  it('takes a list of points', () => {
    expect(pathPointsOf([{ x: 0, y: 0 }, { x: 100.4, y: -20.6 }])).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: -21 }
    ]);
  });

  /**
   * A path of one point is not a path: the shape travels nowhere and the step is
   * a bar a reader counts among their presses for nothing.
   */
  it('refuses what is not one', () => {
    for (const value of [
      undefined,
      null,
      'path("M 0 0")',
      [],
      [{ x: 0, y: 0 }],
      [{ x: 0, y: 0 }, { x: 1 }],
      [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }],
      Array.from({ length: 65 }, () => ({ x: 0, y: 0 }))
    ]) {
      expect(pathPointsOf(value as never), JSON.stringify(value)).toBeUndefined();
    }
  });

  it('has a preset for every shape of travel a reader starts from', () => {
    expect(PATH_PRESETS.length).toBeGreaterThanOrEqual(6);
    for (const preset of PATH_PRESETS) {
      expect(pathPointsOf(preset.points), preset.id).toBeTruthy();
      // Every one of them starts where the shape already is, so choosing a path
      // never makes a shape jump before it moves.
      expect(preset.points[0], preset.id).toEqual({ x: 0, y: 0 });
    }
    expect(pathPreset('arc')?.points).toHaveLength(3);
    // Whether a preset turns sharply travels with its points, because a zigzag
    // with rounded corners is a *wave* — a different route rather than a
    // different drawing of the same one.
    expect(pathPreset('arc')?.smooth).toBe(true);
    expect(pathPreset('zigzag')?.smooth).toBe(false);
    expect(pathPreset('nothing')).toBeUndefined();
  });
});

describe('the curve through the points', () => {
  it('is a straight line for two points', () => {
    expect(pathData([{ x: 0, y: 0 }, { x: 100, y: 50 }])).toBe('M 0 0 L 100 50');
  });

  /**
   * And a curve that **passes through** every point, which is the whole reason
   * for Catmull-Rom rather than a plain bezier: a reader who drops a point on a
   * spot expects the shape to go over that spot.
   */
  it('passes through every point it is given', () => {
    const data = pathData([
      { x: 0, y: 0 },
      { x: 50, y: -50 },
      { x: 100, y: 0 }
    ]);
    // Two cubic segments, and the middle point is where the first one ends.
    expect(data.startsWith('M 0 0 C')).toBe(true);
    expect(data).toContain('50 -50');
    expect(data.match(/C/g)).toHaveLength(2);
    expect(data.trimEnd().endsWith('100 0')).toBe(true);
  });

  it('shifts the whole path by an offset', () => {
    expect(pathData([{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 5, y: 7 })).toBe('M 5 7 L 15 7');
  });

  /**
   * The offset that matters: half the shape.
   *
   * `offset-anchor` defaults to the transform origin, so the element's *centre*
   * is what lands on the path while the path's own origin is the element's static
   * top-left. Measured — a 40×40 box at (100, 200) with a path starting at `0 0`
   * drew at (80, 180). So a point of `(0, 0)` only means "where the shape already
   * is" if the path is shifted by half the shape.
   */
  it('puts the shape where it already is for a point of zero', () => {
    // 1500 twips is 100 CSS pixels, so half of a 1500×600 box is 50 × 20.
    const css = pathCss([{ x: 0, y: 0 }, { x: 1500, y: 0 }], { width: 1500, height: 600 });
    expect(css).toBe('path("M 50 20 L 150 20")');
  });

  it('measures how far the shape travels', () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 300, y: 400 }])).toBe(500);
    expect(pathLength([{ x: 0, y: 0 }])).toBe(0);
  });

  it('says what CSS is told about facing', () => {
    expect(facingCss('path')).toBe('auto');
    expect(facingCss('fixed')).toBe('0deg');
    expect(facingCss(undefined)).toBe('0deg');
  });
});

describe('editing a path', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: -100 },
    { x: 200, y: 0 }
  ];

  it('moves a point, and rounds it to a twip', () => {
    expect(movePoint(points, 1, { x: 120.6, y: -80.2 })[1]).toEqual({ x: 121, y: -80 });
    // Off the end is the list that was there.
    expect(movePoint(points, 9, { x: 0, y: 0 })).toBe(points);
  });

  it('keeps a dragged point within reach', () => {
    expect(movePoint(points, 1, { x: 1e9, y: -1e9 })[1]).toEqual({ x: 40000, y: -40000 });
  });

  it('adds a point between two, in the middle', () => {
    const next = addPoint(points, 0);
    expect(next).toHaveLength(4);
    expect(next[1]).toEqual({ x: 50, y: -50 });
  });

  it('removes a point, but never below two', () => {
    expect(removePoint(points, 1)).toEqual([points[0], points[2]]);
    const two = [points[0], points[2]];
    expect(removePoint(two, 0)).toBe(two);
  });
});

/**
 * A path as a step, through the commands — including the one thing a path shares
 * with nothing else: it is a *kind*, so the timeline has to accept it and the
 * effect table must not be asked about it.
 */
describe('a path step in a slide’s timeline', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;
  let title: string;

  const run = async (command: string, payload?: unknown) =>
    await editor.executeCommand(command, payload);
  const can = (command: string, payload?: unknown) =>
    editor?.canExecuteCommand(command, payload);
  const doc = (): DeckAccess => ({
    rootId: editor.getRootId(),
    getNode: (sid: string) => store.getNode(sid) as never
  });

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
              {
                stype: 'textFrame',
                attributes: { role: 'title', x: 0, y: 0, width: 1500, height: 600 },
                content: [
                  {
                    stype: 'paragraph',
                    attributes: {},
                    content: [{ stype: 'inline-text', text: 'T' }]
                  }
                ]
              },
              { stype: 'rectangle', attributes: { x: 0, y: 2000, width: 900, height: 900 } }
            ]
          },
          { stype: 'resources', attributes: {}, content: [] }
        ]
      } as never,
      'slides'
    );
    slide = (store.getNode(editor.getRootId()) as any).content[0];
    title = ((store.getNode(slide) as any).content as string[])[0];
  });

  it('adds a path from a preset, and names the shape', async () => {
    expect(await run('addBoxPath', { nodeId: title, preset: 'arc' })).toBe(true);

    const steps = slideTimeline(doc(), slide);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      kind: 'path',
      facing: 'fixed',
      target: 'shape-1',
      startsWith: 'onClick'
    });
    expect(steps[0].path).toEqual(pathPreset('arc')?.points);
    expect(steps[0].smooth).toBe(true);
    // A path is not an effect, so it holds none.
    expect(steps[0].effect).toBeUndefined();
  });

  it('refuses a path that is not one', () => {
    expect(can('addBoxPath', { nodeId: title })).toBe(false);
    expect(can('addBoxPath', { nodeId: title, preset: 'nothing' })).toBe(false);
    expect(can('addBoxPath', { nodeId: title, path: [{ x: 0, y: 0 }] })).toBe(false);
    expect(can('addBoxPath', { nodeId: 'nothing', preset: 'arc' })).toBe(false);
  });

  it('takes a path the caller drew, and edits it point by point', async () => {
    await run('addBoxPath', {
      nodeId: title,
      path: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 }
      ],
      facing: 'path'
    });

    const step = slideTimeline(doc(), slide)[0];
    expect(step.facing).toBe('path');

    await run('setMotionStep', {
      stepId: step.sid,
      path: [
        { x: 0, y: 0 },
        { x: 500, y: -500 },
        { x: 1000, y: 0 }
      ]
    });
    expect(slideTimeline(doc(), slide)[0].path).toHaveLength(3);

    // And a path of one point is refused rather than written.
    expect(can('setMotionStep', { stepId: step.sid, path: [{ x: 0, y: 0 }] })).toBe(false);
  });

  /**
   * A path *composes* with the other motions — measured — so it runs alongside
   * them rather than instead of one: `offsetDistance` is a slot nobody else
   * writes, so two steps at one moment need no addition at all.
   */
  it('runs beside a build without either of them adding', async () => {
    await run('addBoxBuild', { nodeId: title, effect: 'fade' });
    const build = slideTimeline(doc(), slide)[0];
    await run('addBoxPath', { nodeId: title, preset: 'right', startsWith: 'withPrevious' });

    const timed = withTiming(slideTimeline(doc(), slide));
    expect(timed.map((step) => step.kind)).toEqual(['build', 'path']);
    // Same press, same moment.
    expect(timed[1].startAt).toBe(timed[0].startAt);
    expect(timed.map((step) => step.composite)).toEqual(['replace', 'replace']);
    // Two lanes, because they overlap in time even though they cannot collide.
    expect(timed.map((step) => step.lane)).toEqual([0, 1]);
    expect(build.sid).toBe(timed[0].sid);
  });

  /** And two paths at once *do* collide: they are the same slot. */
  it('adds a second path over the first', async () => {
    await run('addBoxPath', { nodeId: title, preset: 'right' });
    await run('addBoxPath', { nodeId: title, preset: 'up', startsWith: 'withPrevious' });

    const timed = withTiming(slideTimeline(doc(), slide));
    expect(timed[1].composite).toBe('add');
  });

});

/**
 * A path step carrying no path, which is what a deck from somewhere else may
 * hold — and what a document edited by hand can hold.
 *
 * Not listed at all. A bar that animates nothing is worse than no bar, because a
 * reader counts it among their presses and waits for something that never
 * happens. The same rule an effect this product does not have follows.
 */
describe('a path step with no path', () => {
  const fake = (path: unknown): DeckAccess => {
    const nodes: Record<string, unknown> = {
      root: { sid: 'root', stype: 'document', content: ['slide', 'res'] },
      slide: {
        sid: 'slide',
        stype: 'surface',
        attributes: { kind: 'slide', trackId: 't1' },
        content: ['box']
      },
      box: { sid: 'box', stype: 'rectangle', attributes: { name: 'shape-1' }, content: [] },
      res: { sid: 'res', stype: 'resources', content: ['track'] },
      track: { sid: 'track', stype: 'motionTrack', attributes: { id: 't1' }, content: ['step'] },
      step: {
        sid: 'step',
        stype: 'motionStep',
        attributes: { kind: 'path', target: 'shape-1', path }
      }
    };
    return { rootId: 'root', getNode: (sid: string) => nodes[sid] as never };
  };

  it('is not in the list at all', () => {
    expect(slideTimeline(fake(undefined), 'slide')).toEqual([]);
    expect(slideTimeline(fake([]), 'slide')).toEqual([]);
    expect(slideTimeline(fake([{ x: 0, y: 0 }]), 'slide')).toEqual([]);
    // And one that *is* a path is.
    expect(slideTimeline(fake(pathPreset('arc')?.points), 'slide')).toHaveLength(1);
  });
});

/**
 * One motion on several shapes, a beat apart.
 *
 * What every tool calls "apply to all", and the reason it writes N steps rather
 * than one step naming N shapes: the model already says it — three steps,
 * `withPrevious`, delays 0, 120, 240 — and each shape gets its own bar the moment
 * it is made, so making the third one a little later is a drag rather than
 * dissolving a group to get at it.
 */
describe('a motion given to several shapes at once', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;
  let boxes: string[];

  const run = async (command: string, payload?: unknown) =>
    await editor.executeCommand(command, payload);
  const can = (command: string, payload?: unknown) =>
    editor?.canExecuteCommand(command, payload);
  const doc = (): DeckAccess => ({
    rootId: editor.getRootId(),
    getNode: (sid: string) => store.getNode(sid) as never
  });

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
              { stype: 'rectangle', attributes: { x: 0, y: 0, width: 900, height: 900 } },
              { stype: 'rectangle', attributes: { x: 0, y: 1000, width: 900, height: 900 } },
              { stype: 'rectangle', attributes: { x: 0, y: 2000, width: 900, height: 900 } }
            ]
          },
          { stype: 'resources', attributes: {}, content: [] }
        ]
      } as never,
      'slides'
    );
    slide = (store.getNode(editor.getRootId()) as any).content[0];
    boxes = (store.getNode(slide) as any).content as string[];
  });

  it('gives each shape its own step, a beat apart', async () => {
    expect(await run('addBoxesMotion', { nodeIds: boxes, effect: 'fly', apart: 120 })).toBe(true);

    const steps = slideTimeline(doc(), slide);
    expect(steps).toHaveLength(3);
    /**
     * The *gap*, not the total. `withPrevious` means "with the step before this
     * one", so a delay is measured from that step's start and the offsets
     * accumulate on their own — writing `index * apart` made three shapes start
     * at 0, 200 and **600**, which the browser test read off the bars.
     */
    expect(steps.map((step) => step.delay)).toEqual([0, 120, 120]);
    // And what a reader sees on the axis is the wave: one beat apart each.
    expect(withTiming(steps).map((step) => step.startAt)).toEqual([0, 120, 240]);
    // The first starts the press and the rest run *with* it — a queue would take
    // three times as long as anybody wants, which is what `afterPrevious` is.
    expect(steps.map((step) => step.startsWith)).toEqual([
      'onClick',
      'withPrevious',
      'withPrevious'
    ]);
    // One press, and three shapes that each own a step.
    expect(steps.map((step) => step.group)).toEqual([1, 1, 1]);
    expect(new Set(steps.map((step) => step.target)).size).toBe(3);
  });

  /**
   * The names are counted *within the transaction*, because the document does not
   * change until it commits — asking for a free name three times over would have
   * called all three shapes `shape-1`.
   */
  it('names every shape distinctly', async () => {
    await run('addBoxesMotion', { nodeIds: boxes, effect: 'fade' });
    const names = boxes.map((sid) => (store.getNode(sid) as any).attributes.name);
    expect(new Set(names).size).toBe(3);
    expect(names).toEqual(['shape-1', 'shape-2', 'shape-3']);
  });

  it('is one gesture, so it is one undo', async () => {
    await run('addBoxesMotion', { nodeIds: boxes, effect: 'fade' });
    expect(slideTimeline(doc(), slide)).toHaveLength(3);

    await editor.undo();
    expect(slideTimeline(doc(), slide)).toEqual([]);
  });

  /** And it takes a path as readily as an effect — the same gesture, one kind on. */
  it('gives them a path each', async () => {
    await run('addBoxesMotion', { nodeIds: boxes, preset: 'arc', apart: 200 });

    const steps = slideTimeline(doc(), slide);
    expect(steps.map((step) => step.kind)).toEqual(['path', 'path', 'path']);
    expect(withTiming(steps).map((step) => step.startAt)).toEqual([0, 200, 400]);
    expect(steps[0].path).toHaveLength(3);
  });

  it('refuses a motion that is neither an effect nor a path', () => {
    expect(can('addBoxesMotion', { nodeIds: boxes })).toBe(false);
    expect(can('addBoxesMotion', { nodeIds: [], effect: 'fade' })).toBe(false);
    expect(can('addBoxesMotion', { nodeIds: ['nothing'], effect: 'fade' })).toBe(false);
    expect(can('addBoxesMotion', { nodeIds: boxes, effect: 'fade' })).toBe(true);
  });

  /** A gap outside the range a reader could mean is clamped, not refused. */
  it('keeps the gap inside the range a reader could mean', async () => {
    await run('addBoxesMotion', { nodeIds: boxes, effect: 'fade', apart: 99999 });
    expect(slideTimeline(doc(), slide).map((step) => step.delay)).toEqual([0, 1000, 1000]);
  });
});

/**
 * Sharp corners.
 *
 * Every path was smoothed through its points, which drew the zigzag preset as a
 * *wave* — the one shape of travel that is entirely about its corners. A path
 * with rounded corners and the same path with sharp ones are two different
 * routes, which is why the flag travels with the points rather than being a way
 * of drawing them.
 */
describe('a path that turns sharply', () => {
  const zigzag = [
    { x: 0, y: 0 },
    { x: 100, y: -100 },
    { x: 200, y: 0 }
  ];

  it('is a polyline rather than a curve', () => {
    expect(pathData(zigzag, { x: 0, y: 0 }, false)).toBe('M 0 0 L 100 -100 L 200 0');
    // Smoothed, the same points are two cubic segments.
    expect(pathData(zigzag, { x: 0, y: 0 }, true)).toContain('C');
  });

  it('carries into the CSS', () => {
    const css = pathCss(zigzag, { width: 0, height: 0 }, false);
    expect(css).toBe('path("M 0 0 L 6.67 -6.67 L 13.33 0")');
    expect(pathCss(zigzag, { width: 0, height: 0 }, true)).toContain('C');
  });

  it('is smooth unless a document says otherwise', () => {
    // Absent is *yes*, which is what a curve through placed points wants.
    expect(pathData(zigzag)).toContain('C');
  });
});

/**
 * The boxes inside a box.
 *
 * "Animate this group" means the group half the time and *the eight cards in it*
 * the other half, and the two are different animations. A parent's own motion
 * already carries its children — measured — so what was missing was never the
 * animation but this list.
 */
describe('the boxes inside a box', () => {
  const fake = (): DeckAccess => {
    const nodes: Record<string, unknown> = {
      root: { sid: 'root', stype: 'document', content: ['slide'] },
      slide: { sid: 'slide', stype: 'surface', content: ['frame', 'loose'] },
      frame: { sid: 'frame', stype: 'frame', content: ['a', 'b', 'group', 'text'] },
      a: { sid: 'a', stype: 'rectangle', content: [] },
      b: { sid: 'b', stype: 'ellipse', content: [] },
      group: { sid: 'group', stype: 'group', content: ['c'] },
      c: { sid: 'c', stype: 'rectangle', content: [] },
      // A paragraph is not a box, so it is not one of the frame's boxes.
      text: { sid: 'text', stype: 'paragraph', content: [] },
      loose: { sid: 'loose', stype: 'rectangle', content: [] }
    };
    return { rootId: 'root', getNode: (sid: string) => nodes[sid] as never };
  };

  it('is the scene children, in the order they are drawn', () => {
    expect(boxesInside(fake(), 'frame')).toEqual(['a', 'b', 'group']);
  });

  /**
   * One level down, deliberately: a frame holding two groups of four is a reader
   * who means the two groups. Walking to the leaves would animate four cards they
   * did not point at, and they can point at a group when they mean it.
   */
  it('does not walk to the leaves', () => {
    expect(boxesInside(fake(), 'frame')).toContain('group');
    expect(boxesInside(fake(), 'frame')).not.toContain('c');
  });

  it('is empty for a box with nothing in it, and for nothing', () => {
    expect(boxesInside(fake(), 'a')).toEqual([]);
    expect(boxesInside(fake(), undefined)).toEqual([]);
    expect(boxesInside(fake(), 'nothing')).toEqual([]);
  });
});
