import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor, createSampleSite, getSiteSchemaDefinition } from '../src/index';

describe('사이트 전체 설정', () => {
  let editor: any, store: any;
  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
  });

  const titleOf = () => {
    const root = store.getNode(editor.getRootId());
    const meta = (root.content ?? []).find((s: string) => store.getNode(s)?.stype === 'docMeta');
    const t = meta && (store.getNode(meta).content ?? []).find((s: string) => store.getNode(s)?.stype === 'docTitle');
    const words = (sid: string): string => {
      const n = store.getNode(sid);
      if (!n) return '';
      if (typeof n.text === 'string') return n.text;
      return (n.content ?? []).map(words).join('');
    };
    return t ? words(t) : undefined;
  };

  it('writes the name, which is a node, and the rest, which are attributes', async () => {
    expect(titleOf()).toBe('바로 사이트');
    expect(await editor.executeCommand('setSiteInfo', {
      name: '새 이름', address: 'https://x.example', description: '무엇에 대한 곳', lang: 'en'
    })).toBe(true);
    expect(titleOf()).toBe('새 이름');
    const attrs = store.getNode(editor.getRootId()).attributes;
    expect(attrs.address).toBe('https://x.example');
    expect(attrs.description).toBe('무엇에 대한 곳');
    expect(attrs.lang).toBe('en');
  });

  it('makes docMeta and docTitle when a site has never been named', async () => {
    const root = store.getNode(editor.getRootId());
    const meta = (root.content ?? []).find((s: string) => store.getNode(s)?.stype === 'docMeta');
    const { transaction, removeChild } = await import('@barocss/model');
    await transaction(editor, [removeChild(editor.getRootId(), meta)] as never).commit();
    expect(titleOf()).toBeUndefined();

    expect(await editor.executeCommand('setSiteInfo', { name: '처음 이름' })).toBe(true);
    expect(titleOf()).toBe('처음 이름');
  });

  it('treats an emptied field as “not said”, which is a value', async () => {
    await editor.executeCommand('setSiteInfo', { address: '  ' });
    expect(store.getNode(editor.getRootId()).attributes.address).toBeUndefined();
  });

  it('writes them in one transaction, so one Save is one undo', async () => {
    await editor.executeCommand('setSiteInfo', { name: 'A', address: 'https://a.example', lang: 'en' });
    await editor.executeCommand('undo');
    expect(titleOf()).toBe('바로 사이트');
    expect(store.getNode(editor.getRootId()).attributes.address).toBe('https://barocss.example');
  });
});
