import { RendererRegistry, intoRegistry } from '@barocss/dsl';
import { registerTextRenderers } from '../src/renderers';
import { createTextEnv } from '../src/text-context';
import { afterEach, expect, it } from 'vitest';
import { Editor, createNodeSelection } from '@barocss/editor-core';
import { DataStore } from '../../datastore/src/index';
import { createSchema, getOfficeSchemaDefinition } from '@barocss/schema';
import { TableAppearanceExtension } from '../src/table-appearance';
import { childrenOf, type DocumentAccess } from '../src/document-access';
import { tableRowsOf, tableElementCss } from '../src/table-format';
import { tableCellCss } from '../src/css';
const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));
const cell = (text: string) => ({ stype: 'bTableCell', content: [{ stype: 'inline-text', text }] });
function setup() {
  const office = getOfficeSchemaDefinition();
  const schema = createSchema('test', { ...office, topNode: 'note', nodes: { ...office.nodes, note: { name: 'note', content: 'bTable+' } } });
  const dataStore = new DataStore(undefined as never, schema as never);
  const editor = new Editor({ dataStore, schema, extensions: [new TableAppearanceExtension()] });
  editors.push(editor);
  editor.loadDocument({ stype: 'note', content: [{ stype: 'bTable', content: [{ stype: 'bTableBody', content: [0, 1, 2].map(i => ({ stype: 'bTableRow', content: [cell(`${i} A`), cell(`${i} B`)] })) }] }] }, 'appearance');
  const doc: DocumentAccess = { rootId: editor.getRootId()!, getNode: id => dataStore.getNode(id) };
  const table = childrenOf(doc, doc.getNode(doc.rootId))[0];
  const rows = () => tableRowsOf(doc, doc.getNode(table.sid!)!);
  const cells = () => rows().flatMap(row => childrenOf(doc, row));
  return { editor, doc, tableId: table.sid!, rows, cells };
}
it('resizes a column in pixels with one undo and preserves measured neighbors', async () => {
  const { editor, doc, tableId } = setup();
  expect(await editor.executeCommand('setTableColumnWidth', { tableId, column: 0, width: 180, widths: [250, 260] })).toBe(true);
  expect(doc.getNode(tableId)?.attributes).toMatchObject({ grid: '2700,3900', width: 6600, layout: 'fixed' });
  expect(tableElementCss(doc.getNode(tableId)!.attributes!)).toMatchObject({ width: '330pt', tableLayout: 'fixed' });
  expect(await editor.undo()).toBe(true);
  expect(doc.getNode(tableId)?.attributes?.grid).toBeFalsy();
  expect(await editor.redo()).toBe(true);
  expect(doc.getNode(tableId)?.attributes?.grid).toBe('2700,3900');
});
it('colors selected cells together, clears the fill and persists portable attributes', async () => {
  const { editor, doc, cells } = setup();
  const ids = cells().slice(0, 2).map(cell => cell.sid!);
  editor.updateSelection(createNodeSelection(ids, 'cell') as never);
  expect(await editor.executeCommand('setTableCellBackground', { color: '#ffcc00' })).toBe(true);
  for (const id of ids) expect(tableCellCss(doc.getNode(id)!.attributes!).backgroundColor).toBe('#FFCC00');
  expect(await editor.undo()).toBe(true);
  for (const id of ids) expect(doc.getNode(id)?.attributes?.shadingFill).toBeFalsy();
  await editor.redo();
  expect(JSON.stringify(editor.exportDocument())).toContain('FFCC00');
  expect(await editor.executeCommand('setTableCellBackground', { cellId: ids[0], color: '' })).toBe(true);
  expect(doc.getNode(ids[0])?.attributes?.shadingFill).toBeUndefined();
});
function renderedBackground(doc: DocumentAccess, sid: string) {
  const registry = new RendererRegistry({ global: false });
  intoRegistry(registry, registerTextRenderers);
  const template = registry.get('bTableCell')?.template;
  if (!template || typeof template !== 'object' || !('type' in template) || template.type !== 'component' || !template.component) throw new Error('Expected component');
  const model = doc.getNode(sid)!;
  const drawn = template.component({}, model, { id: sid, env: { word: createTextEnv(doc) }, state: {}, props: {}, model, registry, initState() {}, getState() { return undefined; }, setState() {}, toggleState() {} });
  if (drawn.type !== 'element') throw new Error('Expected cell');
  return (drawn.attributes.style as Record<string, unknown>).backgroundColor;
}
it('persists semantic themes across row growth, static rendering and undo', async () => {
  const { editor, doc, tableId, cells } = setup();
  const before = editor.exportDocument();
  const firstId = cells()[0].sid!;
  await editor.executeCommand('setTableCellBackground', { cellId: firstId, color: '#ff0000' });
  expect(await editor.executeCommand('setTableTheme', { tableId, theme: 'blue' })).toBe(true);
  expect(doc.getNode(tableId)?.attributes?.theme).toBe('blue');
  expect(doc.getNode(firstId)?.attributes?.shadingFill).toBeUndefined();
  expect(renderedBackground(doc, firstId)).toBe('#DBEAFE');
  expect(renderedBackground(doc, cells()[2].sid!)).toBe('#EFF6FF');
  expect(await editor.undo()).toBe(true);
  expect(renderedBackground(doc, firstId)).toBe('#FF0000');
  await editor.redo();
  await editor.executeCommand('growTableRows', { tableId, cellId: cells().at(-1)!.sid!, count: 2 });
  expect(renderedBackground(doc, cells().at(-1)!.sid!)).toBe('#EFF6FF');
  const saved = editor.exportDocument();
  expect(JSON.stringify(saved)).toContain('"theme":"blue"');
  expect(await editor.undo()).toBe(true);
  expect(cells()).toHaveLength(6);
  expect(doc.getNode(tableId)?.attributes?.theme).toBe('blue');
  await editor.undo();
  await editor.undo();
  expect(editor.exportDocument()).toEqual(before);
  editor.loadDocument(saved, 'reopened-theme');
  const reopenedTable = childrenOf(doc, doc.getNode(editor.getRootId()!))[0];
  const reopenedCells = tableRowsOf(doc, reopenedTable).flatMap(row => childrenOf(doc, row));
  expect(renderedBackground(doc, reopenedCells.at(-1)!.sid!)).toBe('#EFF6FF');
});
it('keeps explicit cell color above theme and restores inherited theme on clear', async () => {
  const { editor, doc, tableId, cells } = setup();
  const cellId = cells()[0].sid!;
  await editor.executeCommand('setTableTheme', { tableId, theme: 'striped' });
  await editor.executeCommand('setTableCellBackground', { cellId, color: '#00ff00' });
  expect(renderedBackground(doc, cellId)).toBe('#00FF00');
  await editor.executeCommand('setTableCellBackground', { cellId, color: '' });
  expect(renderedBackground(doc, cellId)).toBe('#F1F5F9');
  await editor.undo();
  expect(renderedBackground(doc, cellId)).toBe('#00FF00');
});
it('adds several rows as one undo and rejects bad input without mutating data', async () => {
  const { editor, tableId, rows, cells } = setup();
  const cellId = cells().at(-1)!.sid!;
  expect(await editor.executeCommand('growTableRows', { tableId, cellId, count: 3 })).toBe(true);
  expect(rows()).toHaveLength(6);
  expect(await editor.undo()).toBe(true);
  expect(rows()).toHaveLength(3);
  const before = editor.exportDocument();
  for (const count of [0, -1, 1.2, 101, NaN]) {
    expect(editor.canExecuteCommand('growTableRows', { tableId, cellId, count })).toBe(false);
    expect(await editor.executeCommand('growTableRows', { tableId, cellId, count })).toBe(false);
  }
  for (const width of [0, Infinity, 1601]) expect(await editor.executeCommand('setTableColumnWidth', { tableId, column: 0, width })).toBe(false);
  expect(await editor.executeCommand('setTableCellBackground', { cellId, color: 'url(evil)' })).toBe(false);
  expect(editor.exportDocument()).toEqual(before);
});
