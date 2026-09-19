import { expect, it } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema, validateTree } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { registerSiteRenderers } from '../src/renderers';
import { exportSite } from '../src/export-html';

it('exports an embedded page reference as a readable escaped label without inventing a URL', async () => {
  registerSiteRenderers();
  const schema = createSchema('site-page-reference', getSiteSchemaDefinition());
  const create = () => createSiteEditor({ schema, dataStore: new DataStore(undefined, schema) } as never);
  const editor = create(), reopened = create();
  try {
    editor.loadDocument(createSampleSite(), 'site-page-reference');
    const body = editor.dataStore.getAllNodes().find(node => node.stype === 'richText' && node.attributes?.id === '요약-스택')!;
    const title = 'Target <script>not executable</script>';
    expect(await editor.executeCommand('setRichText', { nodeId: body.sid, blocks: [{ stype: 'paragraph', content: [
      { stype: 'inline-text', text: 'See ' }, { stype: 'pageReference', attributes: { pageId: 'page-target', title } }, { stype: 'inline-text', text: ' next.' }
    ] }] })).toBe(true);
    expect(validateTree(schema, editor.exportDocument())).toEqual([]);
    reopened.loadDocument(JSON.parse(JSON.stringify(editor.exportDocument())), 'reopened-page-reference');
    const reference = reopened.dataStore.getAllNodes().find(node => node.stype === 'pageReference')!;
    expect(reference.attributes).toMatchObject({ pageId: 'page-target', title });
    const pages = exportSite(reopened).map(page => new DOMParser().parseFromString(page.html, 'text/html'));
    const drawn = pages.flatMap(page => [...page.querySelectorAll('.w-page-reference')]);
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn[0].querySelector('[data-note-page-reference-title]')?.textContent).toBe(title);
    expect(drawn[0].querySelector('script')).toBeNull();
    expect(drawn[0].hasAttribute('href')).toBe(false);
    expect(drawn[0].querySelector('[href]')).toBeNull();
    expect(await editor.undo()).toBe(true);
    expect(JSON.stringify(editor.exportDocument())).not.toContain('pageReference');
    expect(await editor.redo()).toBe(true);
    expect(editor.dataStore.getAllNodes().find(node => node.stype === 'pageReference')?.attributes?.pageId).toBe('page-target');
  } finally { editor.destroy(); reopened.destroy(); }
});
