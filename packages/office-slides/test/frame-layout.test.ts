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
