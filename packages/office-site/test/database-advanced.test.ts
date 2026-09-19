import { expect, it } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { datasetNamed } from '../src/data';
import { registerSiteRenderers } from '../src/renderers';
import { exportSite } from '../src/export-html';

it('Site preserves advanced metadata and prevents generic overwrites without blocking unrelated basic fields', async () => {
  const schema = createSchema('site-advanced', getSiteSchemaDefinition());
  const editor = createSiteEditor({ schema, dataStore: new DataStore(undefined, schema) } as never);
  const tree: any = createSampleSite();
  const resources = tree.content.find((node: any) => node.stype === 'resources');
  resources.content.push({ stype: 'dataset', attributes: { name: 'advanced', rowIds: ['one'], fields: [
    { name: 'Title', kind: 'text' }, { name: 'Cost', kind: 'number' },
    { name: 'Double', kind: 'formula', formula: { expression: 'prop("Cost") * 2' } }
  ], records: [{ Title: 'A', Cost: 8 }] } });
  editor.loadDocument(tree, 'advanced-site');
  const doc = { rootId: editor.getRootId()!, getNode: (id: string) => editor.dataStore.getNode(id) };
  const read = () => datasetNamed(doc, 'advanced')!;
  const nodeId = read().sid!;
  expect(read().records[0].Double).toBe(16);
  const before = editor.exportDocument();
  for (const [command, payload] of [
    ['setDatasetCell', { row: 0, field: 'Double', value: 'overwrite' }],
    ['setDatasetCells', { row: 0, field: 'Cost', values: [['5', 'overwrite']] }],
    ['setDatasetField', { field: 'Cost', rename: 'Broken reference' }],
    ['setDatasetField', { field: 'Cost', remove: true }],
    ['setDatasetField', { field: 'NewFormula', kind: 'formula' }],
    ['duplicateDataset', {}]
  ] as const) expect(await editor.executeCommand(command, { nodeId, ...payload })).toBe(false);
  expect(editor.exportDocument()).toEqual(before);
  expect(await editor.executeCommand('setDatasetField', { nodeId, field: 'Title', rename: 'Name' })).toBe(true);
  expect(read().fields.find(field => field.name === 'Double')?.formula?.expression).toBe('prop("Cost") * 2');
  expect(await editor.executeCommand('setDatasetCell', { nodeId, row: 0, field: 'Cost', value: '9' })).toBe(true);
  expect(read().records[0].Double).toBe(18);
  expect(editor.dataStore.getNode(nodeId)?.attributes?.records[0]).not.toHaveProperty('Double');
  expect(await editor.executeCommand('addDatasetRow', { nodeId, at: 0 })).toBe(true);
  expect(editor.dataStore.getNode(nodeId)?.attributes?.rowIds[1]).toBe('one');
  expect(await editor.executeCommand('removeDatasetRow', { nodeId, row: 0 })).toBe(true);
  expect(editor.dataStore.getNode(nodeId)?.attributes?.rowIds).toEqual(['one']);
  await editor.undo(); expect(editor.dataStore.getNode(nodeId)?.attributes?.rowIds[1]).toBe('one');
  editor.destroy();
});

it('Site HTML evaluates relations and rollups using the embedded local resource scope', async () => {
  registerSiteRenderers();
  const schema = createSchema('site-evaluated-export', getSiteSchemaDefinition());
  const editor = createSiteEditor({ schema, dataStore: new DataStore(undefined, schema) } as never);
  editor.loadDocument(createSampleSite(), 'export-advanced');
  const body = [...editor.dataStore.getNodes().values()].find(node => node.stype === 'richText' && node.attributes?.id === '요약-스택')!;
  expect(await editor.executeCommand('setRichText', { nodeId: body.sid, blocks: [
    { stype: 'noteDatabase', attributes: { source: 'reports', where: 'Name', equals: 'Wrong legacy value', activeViewId: 'saved', views: [{ id: 'saved', name: 'Published view', view: 'table', where: 'Name', equals: 'Report', hiddenFields: ['Extra'] }] } },
    { stype: 'resources', content: [
      { stype: 'dataset', attributes: { name: 'reports', label: 'Computed local proof', rowIds: ['report'], fields: [
        { name: 'Name', kind: 'text' }, { name: 'Extra', kind: 'text' }, { name: 'Items', kind: 'relation', relation: { source: '상품' } },
        { name: 'Total', kind: 'rollup', rollup: { relationField: 'Items', field: 'Double', operation: 'sum' } }
      ], records: [{ Name: 'Report', Extra: 'Hidden export column', Items: ['local-item'] }] } },
      { stype: 'dataset', attributes: { name: '상품', rowIds: ['local-item'], fields: [
        { name: 'Name', kind: 'text' }, { name: 'Cost', kind: 'number' }, { name: 'Double', kind: 'formula', formula: { expression: 'prop("Cost") * 2' } }
      ], records: [{ Name: 'Local item', Cost: 7 }] } }
    ] }
  ] })).toBe(true);
  const html = exportSite(editor).map(page => new DOMParser().parseFromString(page.html, 'text/html'));
  const table = html.flatMap(page => [...page.querySelectorAll('.w-note-database')]).find(node => node.textContent?.includes('Computed local proof'));
  expect(table).toBeDefined();
  expect(table!.querySelector('tbody tr')?.textContent).toBe('ReportLocal item14');
  expect(table!.querySelectorAll('thead th')).toHaveLength(3);
  expect(table!.textContent).not.toContain('Hidden export column');
  editor.destroy();
});

it('exports calendar saved compound filters and ordered rows without changing source records', async () => {
  registerSiteRenderers();
  const schema = createSchema('site-compound-export', getSiteSchemaDefinition());
  const editor = createSiteEditor({ schema, dataStore: new DataStore(undefined, schema) } as never);
  editor.loadDocument(createSampleSite(), 'export-query');
  try {
    const body = [...editor.dataStore.getNodes().values()].find(node => node.stype === 'richText' && node.attributes?.id === '요약-스택')!;
    await editor.executeCommand('setRichText', { nodeId: body.sid, blocks: [
      { stype: 'noteDatabase', attributes: { source: 'query-proof', views: [{ id: 'calendar', name: 'Schedule', view: 'calendar', where: 'Name', equals: 'legacy-missing', filters: { mode: 'or', rules: [{ id: 'cost', field: 'Cost', operator: 'gte', value: 10 }] }, sorts: [{ field: 'Cost', direction: 'asc' }, { field: 'Name', direction: 'desc' }] }], activeViewId: 'calendar' } },
      { stype: 'resources', content: [{ stype: 'dataset', attributes: { name: 'query-proof', fields: [{ name: 'Name', kind: 'text' }, { name: 'Cost', kind: 'number' }], records: [{ Name: 'Alpha', Cost: 10 }, { Name: 'Beta', Cost: 10 }, { Name: 'Omitted', Cost: 1 }] } }] }
    ] });
    const before = editor.exportDocument();
    const html = exportSite(editor).map(page => new DOMParser().parseFromString(page.html, 'text/html'));
    const table = html.flatMap(page => [...page.querySelectorAll('.w-note-database')]).find(node => node.textContent?.includes('query-proof'))!;
    expect([...table.querySelectorAll('tbody tr')].map(row => row.textContent)).toEqual(['Beta10', 'Alpha10']);
    expect(editor.exportDocument()).toEqual(before);
  } finally { editor.destroy(); }
});
