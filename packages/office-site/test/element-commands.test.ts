import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { blocksIn, pagesOf } from '../src/selection';

/**
 * Putting something on a page.
 *
 * Where a new block goes is the whole of these tests, because it is the whole of the feature: a
 * reader can predict *into the container I selected, after the block I selected, otherwise next to
 * the caret* — and cannot predict anything else.
 */
describe('putting something on a page', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;
  let page: string;

  const named = (name: string) =>
    blocksIn(doc, page).find((sid: string) => doc.getNode(sid)?.attributes?.name === name)!;

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    page = pagesOf(doc)[0].sid;
  });

  const select = (sid: string) => editor.executeCommand('setNode', { nodeIds: [sid] });
  const kinds = (sid: string) => blocksIn(doc, sid).map((one: string) => doc.getNode(one).stype);

  it('puts it inside the container that is selected, at the end', async () => {
    const hero = named('히어로');
    select(hero);
    expect(await editor.executeCommand('insertHeading')).toBe(true);

    // Which is what a reader means by selecting a section and adding a heading, and what a stack is
    // for. Not beside it, which is what "after the selected block" would have done.
    expect(kinds(hero)).toEqual(['frame', 'picture', 'heading']);
  });

  it('puts it after the block that is selected, when that block holds nothing', async () => {
    const hero = named('히어로');
    const picture = blocksIn(doc, hero)[1];
    select(picture);
    await editor.executeCommand('insertBodyText');

    expect(kinds(hero)).toEqual(['frame', 'picture', 'paragraph']);
  });

  it('selects what it made, because a reader is about to say something about it', async () => {
    select(named('히어로'));
    await editor.executeCommand('insertPicture');

    const made = editor.selection?.nodeIds ?? [];
    expect(made).toHaveLength(1);
    expect(doc.getNode(made[0]).stype).toBe('picture');
    // With a place for a picture in it: a `src` of nothing draws a broken image, and a reader who
    // has just added one should see a place for a picture rather than a fault.
    expect(String(doc.getNode(made[0]).attributes.src)).toContain('svg');
  });

  it('makes a list a reader can immediately type in', async () => {
    select(named('히어로'));
    await editor.executeCommand('insertBulletList');
    const list = editor.selection.nodeIds[0];
    expect(doc.getNode(list).stype).toBe('list');
    expect(kinds(list)).toEqual(['listItem']);
  });

  it('places a definition the document has, and refuses one it does not', async () => {
    select(named('히어로'));
    expect(editor.canExecuteCommand('insertPlacement', { componentId: 'cta' })).toBe(true);
    // A placement of nothing is an empty box on the page, so the command refuses rather than makes
    // one and lets the reader find out.
    expect(editor.canExecuteCommand('insertPlacement', { componentId: '없는것' })).toBe(false);
    expect(editor.canExecuteCommand('insertPlacement', {})).toBe(false);

    await editor.executeCommand('insertPlacement', { componentId: 'cta' });
    expect(doc.getNode(editor.selection.nodeIds[0]).attributes.componentId).toBe('cta');
  });

  it('makes a data list only when it has both halves', async () => {
    select(named('히어로'));
    // A list with no data draws nothing; a list with nothing to draw for each row draws nothing too.
    expect(editor.canExecuteCommand('insertDataList', { source: '상품' })).toBe(false);
    expect(editor.canExecuteCommand('insertDataList', { componentId: 'product-card' })).toBe(false);
    expect(
      editor.canExecuteCommand('insertDataList', { source: '상품', componentId: 'product-card' })
    ).toBe(true);

    await editor.executeCommand('insertDataList', { source: '상품', componentId: 'product-card' });
    const list = editor.selection.nodeIds[0];
    expect(doc.getNode(list).stype).toBe('collection');
    expect(kinds(list)).toEqual(['instance']);
  });

  it('is one entry in the history', async () => {
    const hero = named('히어로');
    const before = kinds(hero);
    select(hero);
    await editor.executeCommand('insertHeading');
    await editor.executeCommand('undo');
    expect(kinds(hero)).toEqual(before);
  });
});
