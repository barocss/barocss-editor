import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { selectedNodeIds, type Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { SLIDE_16_9 } from '../src/geometry';

/**
 * Putting something on a slide.
 *
 * The gap that stopped this being a presentation editor: a deck could hold
 * shapes, draw them and report their properties, and nothing could make one.
 */
describe('putting a box on a slide', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;

  const run = async (command: string, payload?: unknown) =>
    await (editor as any).executeCommand(command, payload);

  const boxes = () => {
    const surface = store.getNode(slide) as any;
    return ((surface.content ?? []) as string[]).map((sid) => store.getNode(sid) as any);
  };

  beforeEach(() => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [{ stype: 'surface', attributes: { kind: 'slide' }, content: [] }]
      } as never,
      'slides'
    );
    slide = (store.getNode((editor as any).getRootId()) as any).content[0];
  });

  it('starts with nothing on it, so a failure below is the command', () => {
    expect(boxes()).toHaveLength(0);
  });

  it('makes each of the four', async () => {
    for (const [command, stype] of [
      ['insertRectangle', 'rectangle'],
      ['insertEllipse', 'ellipse'],
      ['insertLine', 'line'],
      ['insertTextBox', 'textFrame']
    ] as const) {
      expect(await run(command, { slideId: slide }), command).toBeTruthy();
      expect(boxes().at(-1)!.stype, command).toBe(stype);
    }
    expect(boxes()).toHaveLength(4);
  });

  it('puts it in the middle of the slide, at a quarter of its size', async () => {
    // Not at the pointer: a shape button is pressed in the toolbar, and the
    // pointer is over the toolbar.
    await run('insertRectangle', { slideId: slide });
    const { x, y, width, height } = boxes()[0].attributes;

    expect(width).toBe(SLIDE_16_9.width / 4);
    expect(height).toBe(SLIDE_16_9.height / 4);
    expect(x + width / 2).toBe(SLIDE_16_9.width / 2);
    expect(y + height / 2).toBe(SLIDE_16_9.height / 2);
  });

  it('gives a new shape something to see', async () => {
    // A shape with no fill is a shape nobody can see or click.
    await run('insertRectangle', { slideId: slide });
    expect(boxes()[0].attributes.fill).toBeTruthy();

    // A line has no area, so it gets a stroke and a width instead.
    await run('insertLine', { slideId: slide });
    const line = boxes()[1].attributes;
    expect(line.stroke).toBeTruthy();
    expect(line.strokeWidth).toBeGreaterThan(0);
    // ...and runs left to right, not corner to corner of a square.
    expect(line.height).toBe(0);
  });

  it('gives a text box a paragraph to put a caret in', async () => {
    // `textFrame` is `block+`, so an empty one is not even legal — and a legal
    // one with no paragraph is a box a reader cannot use.
    await run('insertTextBox', { slideId: slide });
    const frame = boxes()[0];
    expect(frame.content).toHaveLength(1);
    expect((store.getNode(frame.content[0]) as any).stype).toBe('paragraph');
  });

  it('takes a box from a caller that knows better', async () => {
    // A paste, or a drag-to-draw, computes nothing.
    await run('insertRectangle', { slideId: slide, x: 10, y: 20, width: 30, height: 40 });
    expect(boxes()[0].attributes).toMatchObject({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('selects what it just made', async () => {
    // A shape a reader has to hunt for before they can move it is a shape the
    // tool made them work for.
    await run('insertEllipse', { slideId: slide });
    expect(selectedNodeIds(editor.selection)).toEqual([boxes()[0].sid]);
  });

  it('puts it on top, which is the end of the slide’s children', async () => {
    // Document order is paint order, so the newest is the topmost.
    await run('insertRectangle', { slideId: slide });
    await run('insertEllipse', { slideId: slide });
    expect(boxes().map((box) => box.stype)).toEqual(['rectangle', 'ellipse']);
  });

  it('undoes', async () => {
    await run('insertRectangle', { slideId: slide });
    await (editor as any).undo();
    expect(boxes()).toHaveLength(0);
  });

  it('falls back to the first slide, so it is useful with no argument', async () => {
    await run('insertRectangle');
    expect(boxes()).toHaveLength(1);
  });
});
