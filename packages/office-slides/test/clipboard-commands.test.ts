import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';

/**
 * Copying objects, and what a coordinate means once it has moved.
 *
 * A box's `x` and `y` are measured from its container, so a shape copied out of
 * a frame and pasted onto a slide has to arrive with *different numbers* in
 * order to be in the same place. That is the whole of what these check: the
 * arithmetic is `toSurface` on the way out and `fromSurface` on the way in, and
 * a clipboard that skipped either would work perfectly for every shape that had
 * never been inside anything.
 */
describe('the clipboard', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;
  let otherSlide: string;
  let frame: string;
  let inFrame: string;
  let onSlide: string;

  const run = async (command: string, payload?: unknown) =>
    await (editor as any).executeCommand(command, payload);
  const can = (command: string, payload?: unknown) =>
    (editor as any).canExecuteCommand?.(command, payload);
  const attrs = (sid: string) => (store.getNode(sid) as any).attributes;
  const childrenOf = (sid: string) => ((store.getNode(sid) as any).content ?? []) as string[];
  const select = (ids: string[]) => (editor as any).setNode?.({ nodeIds: ids });

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
                stype: 'frame',
                attributes: { x: 1000, y: 500, width: 6000, height: 4000 },
                content: [
                  {
                    stype: 'rectangle',
                    attributes: { x: 200, y: 100, width: 900, height: 600, fill: '#abc' }
                  }
                ]
              },
              { stype: 'ellipse', attributes: { x: 8000, y: 300, width: 500, height: 400 } }
            ]
          },
          { stype: 'surface', attributes: { kind: 'slide' }, content: [] }
        ]
      } as never,
      'slides'
    );

    const root = store.getNode((editor as any).getRootId()) as any;
    [slide, otherSlide] = root.content;
    [frame, onSlide] = childrenOf(slide);
    [inFrame] = childrenOf(frame);
  });

  it('starts from the fixture, so a failure below is the command', () => {
    expect(childrenOf(slide)).toHaveLength(2);
    expect(attrs(inFrame)).toMatchObject({ x: 200, y: 100 });
  });

  it('refuses to copy when nothing is selected', () => {
    expect(can('copyBoxes')).toBe(false);
    expect(can('pasteBoxes')).toBe(false);
  });

  it('pastes a copy onto the same slide, nudged so it can be seen', async () => {
    select([onSlide]);
    expect(await run('copyBoxes')).toBe(true);
    expect(await run('pasteBoxes')).toBe(true);

    const made = childrenOf(slide).at(-1)!;
    expect(made).not.toBe(onSlide);
    // A tenth of an inch, the same nudge duplicating uses — a copy exactly
    // underneath the original looks like nothing happened.
    expect(attrs(made)).toMatchObject({ x: 8144, y: 444 });
  });

  it('selects what was pasted, not what was copied', async () => {
    select([onSlide]);
    await run('copyBoxes');
    await run('pasteBoxes');

    const made = childrenOf(slide).at(-1)!;
    expect((editor as any).selection?.nodeIds).toEqual([made]);
  });

  /**
   * The case the whole conversion exists for. The rectangle is at (200,100)
   * inside a frame at (1000,500), so it *looks* like it is at (1200,600); pasted
   * onto a bare slide it has to arrive at (1200,600) plus the nudge, because
   * there is no frame left to add.
   */
  it('keeps a box where it looked like it was when it leaves its frame', async () => {
    select([inFrame]);
    await run('copyBoxes');
    await run('pasteBoxes', { parentId: otherSlide });

    const made = childrenOf(otherSlide).at(-1)!;
    expect(attrs(made)).toMatchObject({ x: 1200 + 144, y: 600 + 144 });
  });

  /** And the other direction: into a frame, the container comes back off. */
  it('rebases a box on its way into a frame', async () => {
    select([onSlide]);
    await run('copyBoxes');
    await run('pasteBoxes', { parentId: frame });

    const made = childrenOf(frame).at(-1)!;
    // Looked like (8000,300), nudged to (8144,444), inside a frame at
    // (1000,500) — so it is written as (7144, -56) and drawn in the same place.
    expect(attrs(made)).toMatchObject({ x: 7144, y: -56 });
  });

  it('lands where it is told, when the app says where', async () => {
    select([onSlide]);
    await run('copyBoxes');
    await run('pasteBoxes', { parentId: otherSlide, at: { x: 2000, y: 1500 } });

    const made = childrenOf(otherSlide).at(-1)!;
    expect(attrs(made)).toMatchObject({ x: 2000, y: 1500 });
  });

  it('carries what is inside the box, not just the box', async () => {
    select([frame]);
    await run('copyBoxes');
    await run('pasteBoxes', { parentId: otherSlide });

    const made = childrenOf(otherSlide).at(-1)!;
    const inside = childrenOf(made);
    expect(inside).toHaveLength(1);
    // A copy, with its own sid: two nodes pointing at one identity is how a
    // selection ends up selecting something that is somewhere else.
    expect(inside[0]).not.toBe(inFrame);
    expect(attrs(inside[0])).toMatchObject({ x: 200, y: 100, fill: '#abc' });
  });

  it('keeps several boxes arranged as they were', async () => {
    select([frame, onSlide]);
    await run('copyBoxes');
    await run('pasteBoxes', { parentId: otherSlide, at: { x: 0, y: 0 } });

    const made = childrenOf(otherSlide);
    expect(made).toHaveLength(2);
    // The first goes where it was told and the second keeps its distance from
    // it: 8000 - 1000 across, 300 - 500 down.
    expect(attrs(made[0])).toMatchObject({ x: 0, y: 0 });
    expect(attrs(made[1])).toMatchObject({ x: 7000, y: -200 });
  });

  describe('cutting', () => {
    it('takes the box away and can put it back somewhere else', async () => {
      select([onSlide]);
      expect(await run('cutBoxes')).toBe(true);
      expect(childrenOf(slide)).toHaveLength(1);

      await run('pasteBoxes', { parentId: otherSlide });
      expect(childrenOf(otherSlide)).toHaveLength(1);
    });

    it('is one entry in the history, not two', async () => {
      select([onSlide]);
      await run('cutBoxes');
      await (editor as any).undo();
      // One press brings it back. Copy writes nothing to the document, so the
      // only thing to undo is the delete.
      expect(childrenOf(slide)).toHaveLength(2);
    });

    it('refuses a locked box, exactly as deleting does', async () => {
      await run('setBoxLocked', { nodeId: onSlide, locked: true });
      select([onSlide]);
      expect(await run('cutBoxes')).toBe(false);
      expect(childrenOf(slide)).toHaveLength(2);
    });
  });

  it('undoes a paste', async () => {
    select([onSlide]);
    await run('copyBoxes');
    await run('pasteBoxes');
    await (editor as any).undo();
    expect(childrenOf(slide)).toHaveLength(2);
  });
});
