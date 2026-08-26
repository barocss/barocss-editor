import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { transaction } from '@barocss/model';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';

/**
 * The command that turns a frame's layout on, and the reaction that keeps it.
 *
 * The arithmetic lives in `office-word` with the rest of the canvas and is
 * tested there, without a document. This half needs one — what is being checked
 * is that an arrangement survives the next edit, which is the whole difference
 * between a layout and a one-off tidy-up — and a document means a kit, which is
 * this package's.
 */
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
    await editor.executeCommand(command, payload);
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

    const slide = (store.getNode(editor.getRootId()) as any).content[0];
    [frame] = (store.getNode(slide) as any).content;
    children = (store.getNode(frame) as any).content;
  });

  it('refuses a frame that is not one, and a change that says nothing', () => {
    const can = (payload: unknown) => editor?.canExecuteCommand('setFrameLayout', payload);
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
    await editor.undo();

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

/**
 * A frame **resized**, and what reaches its children.
 *
 * The question this answers is the one that decides whether a resizable card is possible at
 * all: when a container's box changes, does anything happen to what is in it? Measured before
 * `layoutStretch` existed — a frame widened from 6000 to 10000 twips moved its children (they
 * were re-centred on the new width) and left every one of them its old size.
 *
 * So: positions propagate by themselves, through the reaction; sizes propagate for the children
 * that asked to fill or to share. Nothing here is the browser's doing — a slide *places*, and
 * an absolutely positioned child does not reflow when its parent's box changes.
 */
describe('a frame that is resized', () => {
  let editor: Editor;
  let store: DataStore;

  const run = async (command: string, payload?: unknown) =>
    await editor.executeCommand(command, payload);
  const box = (sid: string) => {
    const a = (store.getNode(sid) as any).attributes;
    return { x: a.x, y: a.y, width: a.width, height: a.height };
  };
  /** The reaction runs on the document change, so its writes land after the await. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

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
                attributes: {
                  x: 1000,
                  y: 1000,
                  width: 6000,
                  height: 6000,
                  layoutMode: 'column',
                  gap: 200,
                  padding: 300
                },
                content: [
                  {
                    stype: 'rectangle',
                    attributes: { x: 0, y: 0, width: 2000, height: 1000, layoutStretch: true }
                  },
                  { stype: 'rectangle', attributes: { x: 0, y: 0, width: 2000, height: 1000 } }
                ]
              }
            ]
          }
        ]
      } as never,
      'slides'
    );
    await settle();
  });

  const parts = () => {
    const slide = (store.getNode(editor.getRootId()) as any).content[0];
    const [frame] = (store.getNode(slide) as any).content as string[];
    return { frame, children: (store.getNode(frame) as any).content as string[] };
  };

  it('gives the child that fills it the new width, with nobody asking', async () => {
    const { frame, children } = parts();
    expect(box(children[0]).width).toBe(5400);

    await run('setBoxGeometry', { nodeIds: [frame], width: 10000 });
    await settle();

    // The reaction is the propagation: nothing told it the frame had been resized, only that
    // the document had changed, and the answer is "what differs".
    expect(box(children[0]).width).toBe(9400);
    // And the one that asked for nothing keeps its size — which is the whole reason the two
    // are a child's decision rather than the frame's.
    expect(box(children[1]).width).toBe(2000);
  });

  it('shares what is left when a child is told to grow', async () => {
    const { frame, children } = parts();
    await run('setBoxLayout', { nodeIds: [children[1]], grow: 1 });
    await settle();

    const room = 6000 - 300 * 2;
    const used = 1000 + 1000 + 200;
    expect(box(children[1]).height).toBe(1000 + (room - used));
    // Still one column: the first child's own height is untouched by the second's share.
    expect(box(children[0]).height).toBe(1000);
    void frame;
  });

  it('settles rather than looping, because the answer is what differs', async () => {
    const { frame, children } = parts();
    await run('setBoxGeometry', { nodeIds: [frame], width: 8000 });
    await settle();
    const once = box(children[0]);
    await settle();
    // A second pass finds nothing to do. The reaction writes, and writing is a document change
    // — what stops it feeding itself is the arithmetic answering with nothing.
    expect(box(children[0])).toEqual(once);
  });

  /**
   * And it converges in **one** transaction, which is not how it started.
   *
   * The reaction guards against re-entering while its own write is in flight, so a pass whose
   * writes changed a deeper pass's inputs left the tree half-arranged: the rows of a frame that
   * had just been given a new width were computed against the old one, and the pass that would
   * have fixed it never ran. Reading "what this pass has already decided" is what makes one
   * walk, parent before child, enough for any depth.
   */
  it('reaches all the way down a nest of frames', async () => {
    const { frame } = parts();
    // A frame inside the frame, filling it, arranging its own children in a row.
    const inner = await (async () => {
      const steps = [
        {
          type: 'addChild',
          payload: {
            parentId: frame,
            child: {
              stype: 'frame',
              attributes: {
                x: 0,
                y: 0,
                width: 1000,
                height: 1200,
                layoutMode: 'row',
                gap: 100,
                padding: 100,
                layoutStretch: true
              },
              content: [
                { stype: 'rectangle', attributes: { x: 0, y: 0, width: 400, height: 400, layoutStretch: true } }
              ]
            }
          }
        }
      ];
      await transaction(editor, steps as never).commit();
      await settle();
      const kids = (store.getNode(frame) as any).content as string[];
      const found = kids.find((sid) => (store.getNode(sid) as any)?.stype === 'frame');
      return found as string;
    })();

    const deepest = ((store.getNode(inner) as any).content as string[])[0];
    // The outer frame gave the inner one its width; the inner one gave its own child the height
    // that follows from that. One level per pass, and each pass is a document change.
    expect(box(inner).width).toBe(5400);
    expect(box(deepest).height).toBe(box(inner).height - 200);
  });
});
