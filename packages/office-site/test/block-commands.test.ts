import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { blocksIn, pagesOf } from '../src/selection';

/**
 * Moving a block, copying it, taking it away.
 *
 * Held here rather than in a browser because an off-by-one in a reorder is a drag that goes
 * backwards — the one fault a reader cannot explain — and it is settled in a millisecond by asking
 * the document what order it is in.
 */
describe('what a reader can do to a block', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;
  let page: string;
  let cardRow: string;

  const run = async (name: string, payload?: Record<string, unknown>) =>
    await editor.executeCommand(name, payload);

  const order = (sid: string) => blocksIn(doc, sid).map((child: string) => doc.getNode(child).stype);

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    page = pagesOf(doc)[0].sid;
    cardRow = blocksIn(doc, page).find((sid: string) => blocksIn(doc, sid).length === 3)!;
  });

  it('takes a block away, and lets go of it', async () => {
    const [first] = blocksIn(doc, cardRow);
    editor.executeCommand('setNode', { nodeIds: [first] });

    expect(await run('removeBlocks')).toBe(true);
    expect(blocksIn(doc, cardRow)).toHaveLength(2);
    // A selection naming a node that is gone is a panel describing something nobody can see.
    expect(editor.selection?.nodeIds ?? []).toEqual([]);
  });

  it('refuses what a reader cannot remove', async () => {
    // The page is the board, not a block on it.
    expect(editor.canExecuteCommand('removeBlocks', { nodeIds: [page] })).toBe(false);
  });

  it('copies a block next to it, not to the end of the stack', async () => {
    const before = blocksIn(doc, cardRow);
    expect(await run('duplicateBlocks', { nodeIds: [before[0]] })).toBe(true);

    const after = blocksIn(doc, cardRow);
    expect(after).toHaveLength(4);
    // Beside the original, which is where a reader looks for it — a duplicate at the bottom of the
    // page is a duplicate they have to go and find.
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[1]);

    // A copy, with its own identity all the way down: two nodes claiming one sid is the store's
    // rule broken, and the words are the reader's so they come along.
    const copy = doc.getNode(after[1]);
    expect(copy.sid).not.toBe(before[0]);
    expect(copy.attributes.layoutMode).toBe(doc.getNode(before[0]).attributes.layoutMode);
    expect(blocksIn(doc, after[1]).map((sid: string) => doc.getNode(sid).stype)).toEqual(
      blocksIn(doc, before[0]).map((sid: string) => doc.getNode(sid).stype)
    );
  });

  it('copies each of several without shifting the next one out from under it', async () => {
    const before = blocksIn(doc, cardRow);
    expect(await run('duplicateBlocks', { nodeIds: [before[0], before[1]] })).toBe(true);

    const after = blocksIn(doc, cardRow);
    expect(after).toHaveLength(5);
    // original, copy, original, copy, original — which is only true if each copy was placed from
    // the end backwards.
    expect([after[0], after[2], after[4]]).toEqual(before);
  });

  it('moves a block into a stack, at a place', async () => {
    const [first, , third] = blocksIn(doc, cardRow);
    expect(await run('moveBlockInto', { nodeId: third, parentId: cardRow, index: 0 })).toBe(true);
    expect(blocksIn(doc, cardRow)[0]).toBe(third);
    expect(blocksIn(doc, cardRow)[1]).toBe(first);
  });

  it('moves a block into another stack entirely', async () => {
    const [first] = blocksIn(doc, cardRow);
    const hero = blocksIn(doc, page)[1];
    expect(await run('moveBlockInto', { nodeId: first, parentId: hero, index: 0 })).toBe(true);

    expect(blocksIn(doc, cardRow)).toHaveLength(2);
    expect(blocksIn(doc, hero)[0]).toBe(first);
    expect(order(hero)[0]).toBe('frame');
  });

  it('refuses a move that would make the document its own child', async () => {
    const [first] = blocksIn(doc, cardRow);
    // Into itself.
    expect(editor.canExecuteCommand('moveBlockInto', { nodeId: cardRow, parentId: cardRow })).toBe(false);
    // And into something it holds, which is the case a visited set alone would miss.
    expect(editor.canExecuteCommand('moveBlockInto', { nodeId: cardRow, parentId: first })).toBe(false);
  });

  it('is one entry in the history, so one undo puts it back', async () => {
    const before = blocksIn(doc, cardRow);
    await run('duplicateBlocks', { nodeIds: [before[0]] });
    expect(blocksIn(doc, cardRow)).toHaveLength(4);

    await editor.executeCommand('undo');
    expect(blocksIn(doc, cardRow)).toEqual(before);
  });
});

/**
 * A block at the top of a page, which is the one a reader reaches for first.
 *
 * Written after a browser probe said duplicating a section did nothing and a `console.log` was about
 * to be added to find out why. This answers the same question in a millisecond, and it answers it
 * about the *model* — so if it passes and the browser still refuses, the fault is in the app and the
 * search is already halved.
 */
describe('a block at the top of a page', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;
  let page: string;

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    page = pagesOf(doc)[0].sid;
  });

  it('can be copied, and the copy is on the page beside it', async () => {
    const before = blocksIn(doc, page);
    const section = before[1];

    expect(editor.canExecuteCommand('duplicateBlocks', { nodeIds: [section] })).toBe(true);
    expect(await editor.executeCommand('duplicateBlocks', { nodeIds: [section] })).toBe(true);

    const after = blocksIn(doc, page);
    expect(after).toHaveLength(before.length + 1);
    expect(after[1]).toBe(section);
    expect(doc.getNode(after[2]).stype).toBe(doc.getNode(section).stype);
  });

  it('can be taken away, and the page keeps the rest', async () => {
    const before = blocksIn(doc, page);
    expect(await editor.executeCommand('removeBlocks', { nodeIds: [before[1]] })).toBe(true);
    expect(blocksIn(doc, page)).toHaveLength(before.length - 1);
    // And the document still matches the schema, which is the thing a delete is most likely to break.
    expect(editor.documentFaults).toEqual([]);
  });
});

/**
 * Reordering **inside one stack**, at every place it can go.
 *
 * The case a browser found and could not explain: a card dragged to the end of its own row came out
 * with two of its neighbours swapped. A move within one parent removes and re-inserts in the same
 * array, which is the one arithmetic that can be off by one in both directions at once — so it is
 * asked here, at every index, in a millisecond.
 */
describe('reordering inside one stack', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;
  let cardRow: string;

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    const page = pagesOf(doc)[0].sid;
    cardRow = blocksIn(doc, page).find((sid: string) => blocksIn(doc, sid).length === 3)!;
  });

  const names = () =>
    blocksIn(doc, cardRow).map((sid: string) => {
      const heading = blocksIn(doc, sid)[0];
      const run = (doc.getNode(heading)?.content ?? [])[0];
      return doc.getNode(run)?.text;
    });

  it('starts as the sample wrote it', () => {
    expect(names()).toEqual(['문서', '덱', '사이트']);
  });

  it('moves the first to the end', async () => {
    const [first] = blocksIn(doc, cardRow);
    expect(await editor.executeCommand('moveBlockInto', { nodeId: first, parentId: cardRow, index: 2 })).toBe(true);
    expect(names()).toEqual(['덱', '사이트', '문서']);
  });

  it('moves the first to the middle', async () => {
    const [first] = blocksIn(doc, cardRow);
    await editor.executeCommand('moveBlockInto', { nodeId: first, parentId: cardRow, index: 1 });
    expect(names()).toEqual(['덱', '문서', '사이트']);
  });

  it('moves the last to the front', async () => {
    const last = blocksIn(doc, cardRow)[2];
    await editor.executeCommand('moveBlockInto', { nodeId: last, parentId: cardRow, index: 0 });
    expect(names()).toEqual(['사이트', '문서', '덱']);
  });

  it('leaves the order alone when a block is put back where it was', async () => {
    const [, second] = blocksIn(doc, cardRow);
    await editor.executeCommand('moveBlockInto', { nodeId: second, parentId: cardRow, index: 1 });
    expect(names()).toEqual(['문서', '덱', '사이트']);
  });
});

/**
 * The sequence a reader actually performs: select, copy, delete.
 *
 * Each command works on its own — the tests above say so — and the browser still refused the delete
 * that followed a copy. So the sequence is asked about here rather than there.
 */
describe('one thing after another', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;
  let page: string;

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    page = pagesOf(doc)[0].sid;
  });

  it('copies what is selected and then removes it, reading the selection each time', async () => {
    const before = blocksIn(doc, page);
    const section = before[1];
    editor.executeCommand('setNode', { nodeIds: [section] });

    expect(await editor.executeCommand('duplicateBlocks')).toBe(true);
    expect(blocksIn(doc, page)).toHaveLength(before.length + 1);

    /*
     * The **copy** is what is selected now — what every tool of this kind does, and the only way the
     * next command is safe. An edit rewrites the selection: measured, it came back as a *range* with
     * its ends inside the new nodes, so `selectedNodeIds` answered nothing and `Delete` refused.
     */
    const copy = blocksIn(doc, page)[2];
    expect(editor.selection?.nodeIds).toEqual([copy]);

    expect(await editor.executeCommand('removeBlocks')).toBe(true);
    expect(blocksIn(doc, page)).toHaveLength(before.length);
    // And the one that was copied is still there: Delete took the copy, not the original.
    expect(blocksIn(doc, page)).toContain(section);
  });
});
