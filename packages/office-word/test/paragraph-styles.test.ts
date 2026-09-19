import { describe, expect, it } from 'vitest';
import { createWordEditor } from '../src/word-kit';
import { captureStyleSession, paragraphStylesOf, paragraphStyleFormat } from '../src/paragraph-styles';

function setup() {
  const editor = createWordEditor();
  editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', content: [
    { stype: 'paragraph', attributes: { alignment: 'center', fontSize: 32, spacingAfter: 240 }, content: [{ stype: 'inline-text', text: 'Source' }] },
    { stype: 'paragraph', attributes: { alignment: 'right' }, content: [{ stype: 'inline-text', text: 'Target', marks: [{ stype: 'bold', range: [0, 3] }, { stype: 'link', attrs: { href: 'https://example.test' }, range: [0, 6] }] }] }
  ] }] } as never);
  const root = editor.dataStore.getNode(editor.getRootId()!)!;
  const surface = root.content!.map(id => editor.dataStore.getNode(String(id))).find(n => n?.stype === 'surface')!;
  const blocks = surface.content!.map(id => editor.dataStore.getNode(String(id))!);
  const select = (index: number) => editor.updateSelection({ type: 'range', startNodeId: String(blocks[index].content![0]), endNodeId: String(blocks[index].content![0]), startOffset: 0, endOffset: 0, collapsed: true });
  select(0);
  const sample = captureStyleSession(editor)!;
  return { editor, blocks, select, sample };
}

describe('paragraph style management', () => {
  it('creates and applies a reusable style in one undo step without changing inline emphasis or links', async () => {
    const { editor, blocks, sample, select } = setup();
    expect(await editor.run('createParagraphStyle', { ...sample, name: 'Report', format: sample.format })).toBe(true);
    const entry = paragraphStylesOf(editor).find(s => s.name === 'Report')!;
    expect(editor.dataStore.getNode(blocks[0].sid!)!.attributes?.styleId).toBe(entry.id);
    expect(editor.dataStore.getNode(blocks[0].sid!)!.attributes?.fontSize).toBeUndefined();
    expect(paragraphStyleFormat(editor, entry.id).fontSize).toBe(32);
    select(1);
    const marks = structuredClone(editor.dataStore.getNode(String(blocks[1].content![0]))!.marks);
    expect(await editor.run('applyParagraphStyle', { id: entry.id })).toBe(true);
    expect(editor.dataStore.getNode(blocks[1].sid!)!.attributes?.alignment).toBeUndefined();
    expect(editor.dataStore.getNode(String(blocks[1].content![0]))!.marks).toEqual(marks);
    await editor.run('undo');
    expect(editor.dataStore.getNode(blocks[1].sid!)!.attributes?.alignment).toBe('right');
    await editor.run('undo');
    expect(paragraphStylesOf(editor).some(s => s.name === 'Report')).toBe(false);
    expect(editor.dataStore.getNode(blocks[0].sid!)!.attributes?.fontSize).toBe(32);
    editor.destroy();
  });
  it('updates and renames the same definition and undoes the change', async () => {
    const { editor, sample } = setup();
    const original = paragraphStyleFormat(editor, 'Body');
    expect(await editor.run('updateParagraphStyle', { rootId: sample.rootId, id: 'Body', name: 'Report body', format: sample.format })).toBe(true);
    expect(paragraphStyleFormat(editor, 'Body').fontSize).toBe(32);
    expect(paragraphStylesOf(editor).find(s => s.id === 'Body')?.name).toBe('Report body');
    await editor.run('undo');
    expect(paragraphStyleFormat(editor, 'Body')).toEqual(original);
    editor.destroy();
  });
  it('rejects duplicate names, invalid formats, stale roots, read-only and tracked changes', async () => {
    const { editor, sample } = setup();
    const payload = { ...sample, name: 'Report', format: sample.format };
    for (const invalid of [{ ...payload, name: 'Body text' }, { ...payload, rootId: 'old' }, { ...payload, format: { ...sample.format, fontSize: NaN } }]) {
      expect(await editor.run('createParagraphStyle', invalid)).toBe(false);
    }
    await editor.run('toggleTrackChanges');
    expect(await editor.run('createParagraphStyle', payload)).toBe(false);
    await editor.run('toggleTrackChanges');
    editor.setEditable(false);
    expect(await editor.run('createParagraphStyle', payload)).toBe(false);
    expect(paragraphStylesOf(editor).some(s => s.name === 'Report')).toBe(false);
    editor.destroy();
  });
});
