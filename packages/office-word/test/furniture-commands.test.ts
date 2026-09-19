import { describe, it, expect } from 'vitest';
import { createWordEditor } from '../src/word-kit';
import { captureFurnitureTarget, furnitureNode } from '../src/furniture-commands';

function setup() {
  const editor = createWordEditor();
  editor.loadDocument({ stype: 'document', content: [1, 2].map(i => ({ stype: 'surface', attributes: { kind: 'flow' }, content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: `Body ${i}` }] }
  ] })) } as never);
  const surfaces = editor.dataStore.getNode(editor.getRootId()!)!.content!.filter(id => editor.dataStore.getNode(String(id))?.stype === 'surface').map(String);
  const target = { rootId: editor.getRootId()!, surfaceId: surfaces[1] };
  const snapshot = () => editor.exportDocument(editor.getRootId()!);
  return { editor, surfaces, target, snapshot };
}
describe('page furniture authoring', () => {
  it('creates in the requested section and undoes resource and binding together', async () => {
    const { editor, target, surfaces, snapshot } = setup(); const before = snapshot();
    expect(await editor.run('setPageFurniture', { ...target, role: 'header', action: 'create', text: 'Report', variant: 'first' })).toBe(true);
    expect(furnitureNode(editor, target, 'header', 'first')).toBeDefined();
    expect(editor.dataStore.getNode(target.surfaceId)?.attributes?.titlePage).toBe(true);
    expect(editor.dataStore.getNode(surfaces[0])?.attributes?.firstPageHeaderId).toBeUndefined();
    const after = snapshot(); await editor.run('undo'); expect(snapshot()).toEqual(before);
    await editor.run('redo'); expect(snapshot()).toEqual(after); editor.destroy();
  });
  it('adds one number paragraph, keeps authored content, and updates without duplication', async () => {
    const { editor, target, snapshot } = setup();
    await editor.run('setPageFurniture', { ...target, role: 'footer', action: 'create', text: 'Confidential' });
    const node = furnitureNode(editor, target, 'footer')!;
    const original = editor.exportDocument(String(node.sid));
    const payload = { ...target, role: 'footer', action: 'number', format: 'upperRoman', start: 3, alignment: 'right' };
    expect(await editor.run('setPageFurniture', payload)).toBe(true);
    expect(editor.dataStore.getNode(String(node.sid))?.content).toHaveLength(2);
    expect(editor.exportDocument(String(node.sid))?.content?.[0]).toEqual(original?.content?.[0]);
    const before = snapshot();
    expect(await editor.run('setPageFurniture', { ...payload, start: 7, alignment: 'left' })).toBe(true);
    expect(editor.dataStore.getNode(String(node.sid))?.content).toHaveLength(2);
    expect(editor.dataStore.getNode(target.surfaceId)?.attributes?.pageNumberStart).toBe(7);
    await editor.run('undo'); expect(snapshot()).toEqual(before); editor.destroy();
  });
  it('unlinks one section without deleting a shared resource', async () => {
    const { editor, target, surfaces } = setup();
    await editor.run('setPageFurniture', { ...target, role: 'header', action: 'create', text: 'Shared' });
    const node = furnitureNode(editor, target, 'header')!;
    editor.dataStore.updateNode(surfaces[0], { attributes: { headerId: node.attributes!.id } });
    expect(await editor.run('setPageFurniture', { ...target, role: 'header', action: 'remove' })).toBe(true);
    expect(furnitureNode(editor, target, 'header')).toBeUndefined();
    expect(furnitureNode(editor, { ...target, surfaceId: surfaces[0] }, 'header')?.sid).toBe(node.sid);
    expect(editor.dataStore.getNode(String(node.sid))).toBeDefined(); editor.destroy();
  });
  it('rejects stale documents, invalid numbers, and duplicate header creation', async () => {
    const { editor, target, snapshot } = setup();
    await editor.run('setPageFurniture', { ...target, role: 'header', action: 'create', text: 'Keep' });
    const before = snapshot();
    for (const payload of [
      { ...target, role: 'header', action: 'create', text: 'Replace' },
      { ...target, rootId: 'stale', role: 'footer', action: 'number' },
      ...[0, -1, 2.5, NaN, 10000].map(start => ({ ...target, role: 'footer', action: 'number', start }))
    ]) expect(await editor.run('setPageFurniture', payload)).toBe(false);
    expect(snapshot()).toEqual(before); expect(captureFurnitureTarget(editor)).toBeDefined(); editor.destroy();
  });
});

it('finds a section from resource text and enables a previously unused even-page header', async () => {
  const { editor, target } = setup();
  await editor.run('setPageFurniture', { ...target, role: 'header', variant: 'even', action: 'create', text: 'Even' });
  const node = furnitureNode(editor, target, 'header', 'even')!;
  const paragraph = editor.dataStore.getNode(String(node.content![0]))!;
  const sid = String(paragraph.content![0]);
  editor.updateSelection({ type: 'range', startNodeId: sid, endNodeId: sid, startOffset: 0, endOffset: 0, collapsed: true });
  expect(captureFurnitureTarget(editor)).toEqual(target);
  const surface = editor.dataStore.getNode(target.surfaceId)!;
  editor.dataStore.updateNode(target.surfaceId, { attributes: { ...surface.attributes, differentOddEven: false } });
  expect(await editor.run('setPageFurniture', { ...target, role: 'header', variant: 'even', action: 'edit' })).toBe(true);
  expect(editor.dataStore.getNode(target.surfaceId)?.attributes?.differentOddEven).toBe(true);
  expect(furnitureNode(editor, target, 'header', 'even')?.sid).toBe(node.sid);
  editor.destroy();
});
