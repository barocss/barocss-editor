import { beforeEach, describe, expect, it } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { assetsOf } from '../src/assets';

describe('asset attachment history', () => {
  let editor: ReturnType<typeof createSiteEditor>;
  let store: DataStore;
  let pictures: string[];
  const payload = { label: '교체.svg', type: 'image/svg+xml', data: 'PHN2Zy8+' };
  const assets = () => assetsOf({ rootId: editor.getRootId(), getNode: id => store.getNode(id) } as never);
  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    pictures = [];
    const walk = (id: string) => {
      const node = store.getNode(id);
      if (node?.stype === 'picture') pictures.push(id);
      for (const child of node?.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId());
  });

  it('undoes and redoes the asset and all selected picture references together', async () => {
    const ids = pictures.slice(0, 2);
    const before = ids.map(id => store.getNode(id)?.attributes?.src);
    const count = assets().length;
    await editor.executeCommand('setNode', { nodeIds: ids });
    const selection = { ...editor.selection };
    expect(await editor.executeCommand('insertAsset', { ...payload, applyTo: { command: 'setBlockFormat', attr: 'src', nodeIds: ids } })).toBe(true);
    const after = ids.map(id => store.getNode(id)?.attributes?.src);
    expect(after[0]).toBe(after[1]); expect(after).not.toEqual(before);
    expect(assets()).toHaveLength(count + 1);
    expect(editor.selection).toEqual(selection);
    await editor.executeCommand('undo');
    expect(ids.map(id => store.getNode(id)?.attributes?.src)).toEqual(before);
    expect(assets()).toHaveLength(count);
    await editor.executeCommand('redo');
    expect(ids.map(id => store.getNode(id)?.attributes?.src)).toEqual(after);
    expect(assets()).toHaveLength(count + 1);
  });

  it('undoes the site icon and its new asset together', async () => {
    const root = editor.getRootId(), before = store.getNode(root)?.attributes?.icon;
    const count = assets().length;
    expect(await editor.executeCommand('insertAsset', { ...payload, applyTo: { command: 'setSiteFiles', attr: 'icon' } })).toBe(true);
    expect(store.getNode(root)?.attributes?.icon).not.toBe(before);
    await editor.executeCommand('undo');
    expect(store.getNode(root)?.attributes?.icon).toBe(before);
    expect(assets()).toHaveLength(count);
  });

  it('rejects the entire replacement if one of several targets is missing', async () => {
    const before = JSON.stringify(editor.exportDocument());
    expect(await editor.executeCommand('insertAsset', {
      ...payload, applyTo: { command: 'setBlockFormat', attr: 'src', nodeIds: [pictures[0], 'missing'] },
    })).toBe(false);
    expect(JSON.stringify(editor.exportDocument())).toBe(before);
  });

  it.each([
    { command: 'setBlockFormat', attr: 'src', nodeIds: ['missing'] },
    { command: 'setBlockFormat', attr: 'fill', nodeIds: [] },
    { command: 'setSiteFiles', attr: 'noIndex' },
  ])('refuses invalid attachment without creating an asset: %j', async applyTo => {
    const before = JSON.stringify(editor.exportDocument());
    expect(await editor.executeCommand('insertAsset', { ...payload, applyTo })).toBe(false);
    expect(JSON.stringify(editor.exportDocument())).toBe(before);
  });
});
