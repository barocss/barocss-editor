import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { blocksIn, pagesOf } from '../src/selection';
import { definitionAt, definitionOf, definitionsOf, usesOf } from '../src/components';

/**
 * The definitions a site holds, and making one out of what a reader has already built.
 *
 * `createComponentFrom` is the gesture that makes a component library ever get a second entry — a
 * reader builds a card, likes it, and says so. Everything about it that can be got wrong is about
 * the document rather than the pointer, so it is asked here.
 */
describe('the definitions a site holds', () => {
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

  it('counts how many places use each, by walking rather than remembering', () => {
    const uses = usesOf(doc);
    // The header and the footer are on all five pages; the button is on two.
    expect(uses.get('site-header')).toBe(5);
    expect(uses.get('site-footer')).toBe(5);
    expect(uses.get('cta')).toBe(2);
    // A number that is *stored* is a number that goes stale, and "5곳" is a question about the
    // document as it is now.
    expect(usesOf(doc)).toEqual(uses);
  });

  it('says which node a board should draw when a reader edits one', () => {
    const header = definitionOf(doc, 'site-header')!;
    // A `component` has no renderer — a definition is never drawn where it is kept — so editing one
    // means drawing its **part**, which is an ordinary frame.
    expect(doc.getNode(header.part).stype).toBe('frame');
    expect(header.name).toBe('머리말');
    expect(definitionOf(doc, 'cta')!.asks).toEqual(['문구']);
  });

  it('knows which definition a node inside one belongs to', () => {
    const header = definitionOf(doc, 'site-header')!;
    const inside = blocksIn(doc, header.part!)[0];
    expect(definitionAt(doc, inside)?.id).toBe('site-header');
    // And a node on a page belongs to none, which is how a board knows which kind it is drawing.
    expect(definitionAt(doc, named('히어로'))).toBeUndefined();
  });
});

describe('making a definition out of what is already built', () => {
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

  it('leaves the page unchanged at the instant it runs', async () => {
    const row = named('카드 줄');
    const before = blocksIn(doc, page).length;

    editor.executeCommand('setNode', { nodeIds: [row] });
    expect(await editor.executeCommand('createComponentFrom', { name: '카드 줄' })).toBe(true);

    // Same number of blocks on the page, in the same place — a placement took the block's seat.
    const after = blocksIn(doc, page);
    expect(after).toHaveLength(before);
    const placed = after[blocksIn(doc, page).findIndex((sid: string) => doc.getNode(sid).stype === 'instance' && doc.getNode(sid).attributes.componentId === '카드-줄')];
    expect(placed).toBeTruthy();

    // And from now on the two are the same thing: the definition holds what the block held.
    const made = definitionOf(doc, '카드-줄')!;
    expect(made.name).toBe('카드 줄');
    expect(blocksIn(doc, made.part!)).toHaveLength(3);
  });

  it('selects the placement it left behind', async () => {
    editor.executeCommand('setNode', { nodeIds: [named('히어로')] });
    await editor.executeCommand('createComponentFrom', { name: '히어로' });

    const chosen = editor.selection?.nodeIds ?? [];
    expect(chosen).toHaveLength(1);
    expect(doc.getNode(chosen[0]).stype).toBe('instance');
  });

  it('gives a second one of the same name its own id', async () => {
    editor.executeCommand('setNode', { nodeIds: [named('히어로')] });
    await editor.executeCommand('createComponentFrom', { name: '블록' });
    editor.executeCommand('setNode', { nodeIds: [named('카드 줄')] });
    await editor.executeCommand('createComponentFrom', { name: '블록' });

    const ids = definitionsOf(doc).map((one) => one.id);
    // Durable, because `forFile` strips sids — and numbered rather than refused.
    expect(ids).toContain('블록');
    expect(ids).toContain('블록-2');
  });

  it('refuses a block that is already inside a definition', () => {
    const header = definitionOf(doc, 'site-header')!;
    const inside = blocksIn(doc, header.part!)[0];
    /*
     * A definition holding a placement of itself is an infinite descent that `instanceParts` refuses
     * to draw — by which time the reader has a document that cannot be drawn. Refusing here is
     * refusing while it is still a gesture.
     */
    expect(editor.canExecuteCommand('createComponentFrom', { nodeIds: [inside] })).toBe(false);
    expect(editor.canExecuteCommand('createComponentFrom', { nodeIds: [header.part] })).toBe(false);
  });

  it('refuses one paragraph, and refuses two blocks at once', () => {
    const hero = named('히어로');
    const heading = blocksIn(doc, blocksIn(doc, hero)[0])[0];
    // Something with a shape worth reusing, rather than a single run of words.
    expect(editor.canExecuteCommand('createComponentFrom', { nodeIds: [heading] })).toBe(false);
    expect(editor.canExecuteCommand('createComponentFrom', { nodeIds: [hero, named('카드 줄')] })).toBe(false);
  });

  it('is one entry in the history', async () => {
    const before = blocksIn(doc, page).map((sid: string) => doc.getNode(sid).stype);
    editor.executeCommand('setNode', { nodeIds: [named('카드 줄')] });
    await editor.executeCommand('createComponentFrom', { name: '카드' });
    await editor.executeCommand('undo');
    expect(blocksIn(doc, page).map((sid: string) => doc.getNode(sid).stype)).toEqual(before);
  });
});
