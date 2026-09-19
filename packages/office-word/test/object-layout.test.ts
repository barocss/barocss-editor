import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { getWordSchemaDefinition } from '../src/word-schema';
import { createWordEditor } from '../src/word-kit';
import { selectedWordObject, TWIPS_PER_CM, wordMarginCells } from '../src/object-layout';

function setup(kind: 'table' | 'image') {
  const schema = createSchema('word', getWordSchemaDefinition());
  const editor = createWordEditor({ schema, dataStore: new DataStore(undefined, schema) });
  const object = kind === 'table'
    ? { stype: 'bTable', attributes: { grid: '1000,2000', width: 3000, widthType: 'dxa', layout: 'fixed' }, content: [{ stype: 'bTableBody', content: [{ stype: 'bTableRow', content: ['A', 'B'].map(text => ({ stype: 'bTableCell', content: [{ stype: 'inline-text', text }] })) }] }] }
    : { stype: 'inline-image', attributes: { src: 'test.png', width: 3000, height: 1500 } };
  editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow' }, content: kind === 'table' ? [object] : [{ stype: 'paragraph', content: [object] }] }] } as never);
  const root = editor.exportDocument(editor.getRootId()!);
  const find = (node: any): any => node.stype === (kind === 'table' ? 'inline-text' : 'inline-image') ? node.sid : node.content?.map(find).find(Boolean);
  const id = find(root);
  editor.updateSelection({ type: 'range', startNodeId: id, endNodeId: id, startOffset: 0, endOffset: 0, collapsed: true });
  return { editor, target: selectedWordObject(editor)!, attrs: () => editor.dataStore.getNode(selectedWordObject(editor)!.nodeId)!.attributes! };
}
describe('Word object layout', () => {
  it('sets selected cell margins, preserves other cells and restores all cells in one undo', async () => {
    const { editor, target } = setup('table');
    const cells = wordMarginCells(editor, target, 'table');
    expect(cells).toHaveLength(2);
    expect(wordMarginCells(editor, target, 'selection')).toHaveLength(1);
    const attrs = () => cells.map(cell => editor.dataStore.getNode(cell.sid!)?.attributes?.marginLeft);
    expect(await editor.run('setWordObjectLayout', { ...target, cellMargins: { Left: 0.5 }, marginScope: 'selection' })).toBe(true);
    expect(attrs()).toEqual([Math.round(0.5 * TWIPS_PER_CM), undefined]);
    expect(await editor.run('setWordObjectLayout', { ...target, cellMargins: { Left: 1 }, marginScope: 'table' })).toBe(true);
    expect(attrs()).toEqual([Math.round(TWIPS_PER_CM), Math.round(TWIPS_PER_CM)]);
    await editor.run('undo');
    expect(attrs()).toEqual([Math.round(0.5 * TWIPS_PER_CM), undefined]);
    await editor.run('setWordObjectLayout', { ...target, cellMargins: { Left: null }, marginScope: 'table' });
    expect(attrs()).toEqual([undefined, undefined]);
    for (const value of [-1, NaN, 6]) expect(await editor.run('setWordObjectLayout', { ...target, cellMargins: { Top: value }, marginScope: 'table' })).toBe(false);
    expect(await editor.run('setWordObjectLayout', { ...target, cellMargins: { Top: 1 }, marginScope: 'selection', marginCellIds: ['missing-cell'] })).toBe(false);
    editor.setEditable(false);
    expect(await editor.run('setWordObjectLayout', { ...target, cellMargins: { Top: 1 }, marginScope: 'table' })).toBe(false);
    editor.destroy();
  });
  it('stores image descriptions and decorative alt without changing its source', async () => {
    const { editor, target, attrs } = setup('image');
    await editor.run('setWordObjectLayout', { ...target, alt: 'Revenue increases each quarter.' });
    expect(attrs()).toMatchObject({ alt: 'Revenue increases each quarter.', src: 'test.png' });
    await editor.run('setWordObjectLayout', { ...target, alt: '' });
    expect(attrs().alt).toBe('');
    await editor.run('undo'); expect(attrs().alt).toBe('Revenue increases each quarter.');
    expect(await editor.run('setWordObjectLayout', { ...target, alt: 'x'.repeat(4001) })).toBe(false);
    editor.destroy();
  });
  it('sets one column, distributes without changing total width and undoes', async () => {
    const { editor, target, attrs } = setup('table');
    expect(await editor.run('setWordObjectLayout', { ...target, column: { index: 1, width: 7 } })).toBe(true);
    expect(String(attrs().grid).split(',')[0]).toBe('1000');
    const before = { ...attrs() };
    await editor.run('setWordObjectLayout', { ...target, distributeColumns: true });
    const grid = String(attrs().grid).split(',').map(Number);
    expect(Math.abs(grid[0] - grid[1])).toBeLessThanOrEqual(1);
    expect(grid.reduce((a,b) => a+b, 0)).toBe(before.width);
    await editor.run('undo'); expect(attrs()).toEqual(before);
    expect(await editor.run('setWordObjectLayout', { ...target, column: { index: 3, width: 7 } })).toBe(false);
    editor.destroy();
  });
  it('preserves crop source dimensions through presets, rejects bad positions and resets', async () => {
    const { editor, target, attrs } = setup('image');
    const before = { ...attrs() };
    await editor.run('setWordObjectLayout', { ...target, crop: 'square' });
    expect(attrs()).toMatchObject({ width: 1500, height: 1500, cropMode: 'cover', cropOriginalWidth: 3000, cropOriginalHeight: 1500 });
    expect(await editor.run('setWordObjectLayout', { ...target, cropPositionX: 101 })).toBe(false);
    await editor.run('setWordObjectLayout', { ...target, crop: 'portrait' });
    await editor.run('setWordObjectLayout', { ...target, crop: 'reset' });
    expect(attrs()).toEqual(before);
    await editor.run('undo'); expect(attrs().cropMode).toBe('cover');
    editor.destroy();
  });
  for (const command of ['backspace', 'deleteForward']) it(`${command} removes a selected inline picture and undo restores it`, async () => {
    const { editor, target } = setup('image');
    editor.updateSelection({ type: 'node', nodeIds: [target.nodeId], startNodeId: target.nodeId, endNodeId: target.nodeId, startOffset: 0, endOffset: 0, collapsed: false });
    expect(editor.canRun(command)).toBe(true);
    expect(await editor.run(command)).toBe(true);
    expect(editor.dataStore.getNode(target.nodeId)).toBeUndefined();
    await editor.run('undo');
    expect(editor.dataStore.getNode(target.nodeId)?.stype).toBe('inline-image');
    editor.destroy();
  });
  it('scales column proportions, clears indentation and undoes one change', async () => {
    const { editor, target, attrs } = setup('table');
    const before = { ...attrs() };
    expect(await editor.run('setWordObjectLayout', { ...target, width: 12, alignment: 'center' })).toBe(true);
    expect(attrs().width).toBe(Math.round(12 * TWIPS_PER_CM));
    const grid = String(attrs().grid).split(',').map(Number);
    expect(grid[1] / grid[0]).toBeCloseTo(2, 2);
    expect(attrs().alignment).toBe('center');
    await editor.run('undo'); expect(attrs()).toEqual(before);
    editor.destroy();
  });
  it('clears a fixed column grid for content/page fitting', async () => {
    const { editor, target, attrs } = setup('table');
    await editor.run('setWordObjectLayout', { ...target, fit: 'page' });
    expect(attrs()).toMatchObject({ width: 5000, widthType: 'pct', grid: '', layout: 'auto' });
    await editor.run('setWordObjectLayout', { ...target, fit: 'content' });
    expect(attrs()).toMatchObject({ widthType: 'auto', grid: '', layout: 'auto' });
    expect(attrs().width == null).toBe(true);
    editor.destroy();
  });
  it('writes picture dimensions and wrapping together with undo/redo', async () => {
    const { editor, target, attrs } = setup('image');
    const before = { ...attrs() };
    await editor.run('setWordObjectLayout', { ...target, width: 10, height: 5, placement: 'left' });
    expect(attrs()).toMatchObject({ width: 5669, height: 2835, wrap: 'square', side: 'left' });
    await editor.run('undo'); expect(attrs()).toEqual(before);
    await editor.run('redo'); expect(attrs().wrap).toBe('square');
    editor.destroy();
  });
  it('rejects invalid sizes, stale roots, changed selection and read-only editing', async () => {
    const { editor, target, attrs } = setup('image');
    const before = { ...attrs() };
    for (const width of [0, -1, NaN, Infinity, 56]) expect(await editor.run('setWordObjectLayout', { ...target, width })).toBe(false);
    expect(await editor.run('setWordObjectLayout', { ...target, rootId: 'old-root', width: 3 })).toBe(false);
    editor.setEditable(false);
    expect(await editor.run('setWordObjectLayout', { ...target, width: 3 })).toBe(false);
    editor.setEditable(true); editor.updateSelection(null as never);
    expect(await editor.run('setWordObjectLayout', { ...target, width: 3 })).toBe(false);
    expect(editor.dataStore.getNode(target.nodeId)!.attributes).toEqual(before);
    editor.destroy();
  });
});
