import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { type Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';

/**
 * **Taking a value back**, through the commands a panel writes with.
 *
 * The site builder found this one layer down: `transaction` copied every operation through JSON, and
 * JSON has no word for `undefined`, so the removal branch of `setAttrs` could not be reached from a
 * command at all. That was fixed; this suite is the probe the backlog asked for afterwards — *does
 * the deck lose it one layer earlier, for a different reason?*
 *
 * It did. `_valuesFor` walks the attributes the schema declares, takes the ones the payload
 * mentions, and then requires `typeof value === 'number'` — so a mentioned `undefined` matched no
 * branch and was dropped without a word. Which mattered most exactly where a document has two
 * different silences to tell apart:
 *
 * - a corner **stated as 0** draws square and overrides the radius; a corner **not stated** follows
 *   the radius. The panel draws them the same and a reader had no way back to the second.
 * - a padding side is the same shape one attribute up.
 *
 * The tests go through `executeCommand` on purpose. The lesson the site's version left behind was
 * that *a test that skips the layer that transports the work cannot see the transport lose it* — and
 * there are now two such layers under a panel row.
 */
describe('taking a value back, through the commands a panel writes with', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;
  let box: string;

  const run = async (command: string, payload?: unknown) => await editor.executeCommand(command, payload);
  const attrs = (sid: string) => ((store.getNode(sid) as any)?.attributes ?? {}) as Record<string, unknown>;

  beforeEach(async () => {
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
    slide = (store.getNode(editor.getRootId()) as any).content[0];
    await run('insertRectangle', { slideId: slide });
    box = (store.getNode(slide) as any).content[0];
  });

  it('removes a stated corner, so it follows the radius again', async () => {
    await run('setBoxStyle', { nodeIds: [box], cornerRadius: 240, cornerTopLeft: 0 });
    expect(attrs(box).cornerTopLeft).toBe(0);

    await run('setBoxStyle', { nodeIds: [box], cornerTopLeft: undefined });
    // Not 0, and not still 0: gone. `corners.ts` reads "no number of its own" as *follow the
    // radius*, and that reading is only reachable if the attribute can be removed.
    expect('cornerTopLeft' in attrs(box)).toBe(false);
    expect(attrs(box).cornerRadius).toBe(240);
  });

  it('leaves alone what the payload does not mention', async () => {
    await run('setBoxStyle', { nodeIds: [box], cornerRadius: 240, cornerTopLeft: 120 });
    await run('setBoxStyle', { nodeIds: [box], cornerTopLeft: undefined });

    // The `in` check is what separates "not mentioned" from "mentioned as nothing", and it is the
    // whole reason a removal can be expressed by one payload key without touching its neighbours.
    expect(attrs(box).cornerRadius).toBe(240);
  });

  it('removes a stated side of a padding, through the layout command', async () => {
    // A frame, and `nodeId` — `setFrameLayout` is asked about one arranging frame at a time, which
    // is the second command with the same fault and its own copy of the filter.
    await run('insertFrame', { slideId: slide });
    const frame = (store.getNode(slide) as any).content[1];

    await run('setFrameLayout', { nodeId: frame, layoutMode: 'row', padding: 120, paddingTop: 0 });
    expect(attrs(frame).paddingTop).toBe(0);

    await run('setFrameLayout', { nodeId: frame, paddingTop: undefined });
    expect('paddingTop' in attrs(frame)).toBe(false);
    expect(attrs(frame).padding).toBe(120);
  });

  it('is something the command agrees it can do', async () => {
    await run('setBoxStyle', { nodeIds: [box], cornerTopLeft: 120 });
    // `canExecute` counts the values a payload produced. A removal that reported "nothing to do"
    // would be refused before it ran — which is how this failed the first time it was written.
    expect(editor.canExecuteCommand('setBoxStyle', { nodeIds: [box], cornerTopLeft: undefined })).toBe(true);
  });

  it('does not turn a mentioned nothing into a zero', async () => {
    await run('setBoxStyle', { nodeIds: [box], cornerRadius: 240 });
    await run('setBoxStyle', { nodeIds: [box], cornerRadius: undefined });
    // The failure this is guarding is the quiet one: a number field that cannot say "nothing" ends
    // up saying "0", and 0 is a value a reader then has to notice is wrong.
    expect(attrs(box).cornerRadius).toBeUndefined();
  });

  it('is taken back again by undo', async () => {
    await run('setBoxStyle', { nodeIds: [box], cornerTopLeft: 120 });
    await run('setBoxStyle', { nodeIds: [box], cornerTopLeft: undefined });
    expect('cornerTopLeft' in attrs(box)).toBe(false);

    await run('undo');
    expect(attrs(box).cornerTopLeft).toBe(120);
  });
});
