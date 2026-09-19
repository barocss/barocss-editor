import { expect, it } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema, validateTree } from '@barocss/schema';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSiteEditor } from '../src/site-kit';
import { createSampleSite } from '../src/sample-site';
import { registerSiteRenderers } from '../src/renderers';
import { exportSite } from '../src/export-html';

const blocks = [
  { stype: 'noteDatabase', attributes: { source: '상품', view: 'board', where: 'Status', equals: 'Open', sortBy: 'Price', sortDir: 'asc', groupBy: 'Status' } },
  { stype: 'resources', content: [{ stype: 'dataset', attributes: {
    name: '상품', label: 'Embedded database proof', kind: 'inline',
    fields: [{ name: 'Name', kind: 'text' }, { name: 'Price', kind: 'number' }, { name: 'Status', kind: 'choice' }],
    records: [{ Name: 'Local expensive', Price: 12, Status: 'Open' }, { Name: 'Local cheap', Price: 2, Status: 'Open' }, { Name: 'Local excluded', Price: 1, Status: 'Done' }]
  } }] }
];

it('roundtrips a Note-authored local dataset through Site richText and exports its queried rows', async () => {
  registerSiteRenderers();
  const schema = createSchema('site-note-database', getSiteSchemaDefinition());
  const create = () => createSiteEditor({ schema, dataStore: new DataStore(undefined, schema) } as never);
  const editor = create();
  const reopened = create();
  try {
    editor.loadDocument(createSampleSite(), 'site-db');
    const body = [...editor.dataStore.getNodes().values()].find(node => node.stype === 'richText' && node.attributes?.id === '요약-스택')!;
    expect(await editor.executeCommand('setRichText', { nodeId: body.sid, blocks })).toBe(true);
    expect(validateTree(schema, editor.exportDocument())).toEqual([]);
    const saved = editor.exportDocument();
    reopened.loadDocument(JSON.parse(JSON.stringify(saved)), 'site-db-reopened');
    const savedView = [...reopened.dataStore.getNodes().values()].find(node => node.stype === 'noteDatabase');
    expect(savedView?.attributes).toMatchObject({ view: 'board', source: '상품', groupBy: 'Status', where: 'Status', sortBy: 'Price' });
    const pages = exportSite(reopened).map(page => new DOMParser().parseFromString(page.html, 'text/html'));
    const tables = pages.flatMap(page => [...page.querySelectorAll('.w-note-database')]);
    const table = tables.find(node => node.textContent?.includes('Embedded database proof'));
    expect(table, 'a published component reading the rich-text field must resolve its local dataset').toBeDefined();
    const rows = [...table!.querySelectorAll('tbody tr')].map(row => row.textContent);
    expect(rows).toEqual(['Local cheap2Open', 'Local expensive12Open']);
    expect(table!.textContent).not.toContain('Local excluded');
    expect(await editor.undo()).toBe(true);
    expect(JSON.stringify(editor.exportDocument())).not.toContain('Embedded database proof');
    expect(await editor.redo()).toBe(true);
    expect(JSON.stringify(editor.exportDocument())).toContain('Embedded database proof');
  } finally { editor.destroy(); reopened.destroy(); }
});
