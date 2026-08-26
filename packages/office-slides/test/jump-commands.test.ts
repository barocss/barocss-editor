import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { childrenOf, deckSlides, type DeckAccess } from '../src/deck';
import { jumpOf, jumpsOn } from '../src/jump';

/**
 * Making a shape a **button**.
 *
 * The half worth testing is the translation: a reader points at a *page*, and the document has
 * to hold something that survives being saved — so the command writes the page's durable `id`
 * and **mints one if the page has none**. Which is exactly what motion does when a build first
 * names a shape, and the same reason: an id appears when something needs it, so a deck nobody
 * has linked carries none.
 */
describe('making a shape a button', () => {
  let editor: Editor;
  let store: DataStore;
  let doc: DeckAccess;

  const run = async (command: string, payload?: unknown) =>
    await editor.executeCommand(command, payload);
  const can = (command: string, payload?: unknown) =>
    editor.canExecuteCommand(command, payload);

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
            attributes: { kind: 'slide', name: '메뉴' },
            content: [
              { stype: 'rectangle', attributes: { x: 0, y: 0, width: 1000, height: 500 } },
              { stype: 'rectangle', attributes: { x: 0, y: 1000, width: 1000, height: 500 } }
            ]
          },
          { stype: 'surface', attributes: { kind: 'slide', name: '1부' }, content: [] },
          // Two pages a reader would call the same thing, which is why a name cannot be the id.
          { stype: 'surface', attributes: { kind: 'slide', name: '1부' }, content: [] }
        ]
      } as never,
      'slides'
    );
    doc = {
      rootId: (editor as never as { getRootId: () => string }).getRootId(),
      getNode: (sid: string) => store.getNode(sid) as never
    };
  });

  const pages = () => deckSlides(doc).map((slide) => slide.sid);
  const buttons = () => childrenOf(doc.getNode(pages()[0]));

  it('refuses a page the deck does not have, and a kind it does not know', () => {
    expect(can('setBoxJump', { nodeIds: [buttons()[0]], to: 'nowhere' })).toBe(false);
    expect(can('setBoxJump', { nodeIds: [buttons()[0]], kind: 'sideways' })).toBe(false);
    expect(can('setBoxJump', { nodeIds: [], to: pages()[1] })).toBe(false);
  });

  it('mints the page an id, derived from what the page is called', async () => {
    expect(doc.getNode(pages()[1])?.attributes?.id).toBeUndefined();
    expect(await run('setBoxJump', { nodeIds: [buttons()[0]], to: pages()[1] })).toBeTruthy();

    // A person reading the file can tell what the button points at.
    expect(doc.getNode(pages()[1])?.attributes?.id).toBe('1부');
    expect(jumpOf(doc, doc.getNode(buttons()[0]))).toEqual({
      sid: buttons()[0],
      kind: 'page',
      to: '1부',
      toSid: pages()[1]
    });
  });

  it('does not hand out an id another page is using', async () => {
    await run('setBoxJump', { nodeIds: [buttons()[0]], to: pages()[1] });
    await run('setBoxJump', { nodeIds: [buttons()[1]], to: pages()[2] });
    // Two pages called 1부: the second gets its own id rather than pointing at the first.
    expect(doc.getNode(pages()[2])?.attributes?.id).toBe('1부-2');
    expect(jumpsOn(doc, pages()[0]).map((one) => one.toSid)).toEqual([pages()[1], pages()[2]]);
  });

  it('leaves an id the page already had', async () => {
    await run('setBoxJump', { nodeIds: [buttons()[0]], to: pages()[1] });
    const was = doc.getNode(pages()[1])?.attributes?.id;
    await run('setBoxJump', { nodeIds: [buttons()[1]], to: pages()[1] });
    // Minting a second id for a page that has one would break every button already pointing at
    // it — the durable id is durable or it is nothing.
    expect(doc.getNode(pages()[1])?.attributes?.id).toBe(was);
  });

  it('takes it all back in one press of undo', async () => {
    await run('setBoxJump', { nodeIds: [buttons()[0]], to: pages()[1] });
    await editor.undo();
    // The button *and* the page's new id: one press of undo takes back "I made a button",
    // which is one thing the reader did.
    expect(jumpOf(doc, doc.getNode(buttons()[0]))).toBeUndefined();
    expect(doc.getNode(pages()[1])?.attributes?.id).toBeUndefined();
  });

  it('writes a kind with no page, and clears the other half', async () => {
    await run('setBoxJump', { nodeIds: [buttons()[0]], to: pages()[1] });
    await run('setBoxJump', { nodeIds: [buttons()[0]], kind: 'back' });
    // A shape that was a page button and is now 돌아가기 must not keep the page lying in the
    // document: one press does one thing, so one attribute holds the answer.
    expect(doc.getNode(buttons()[0])?.attributes?.goTo).toBeUndefined();
    expect(jumpOf(doc, doc.getNode(buttons()[0]))?.kind).toBe('back');
  });

  it('stops being a button at all', async () => {
    await run('setBoxJump', { nodeIds: [buttons()[0]], kind: 'next' });
    expect(await run('setBoxJump', { nodeIds: [buttons()[0]], to: null })).toBeTruthy();
    expect(jumpOf(doc, doc.getNode(buttons()[0]))).toBeUndefined();
  });

  it('makes several shapes the same button at once', async () => {
    await run('setBoxJump', { nodeIds: buttons(), kind: 'first' });
    expect(jumpsOn(doc, pages()[0]).map((one) => one.kind)).toEqual(['first', 'first']);
  });
});
