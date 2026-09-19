import { describe, it, expect } from 'vitest';
import { createWordEditor } from '../src/word-kit';
import { captureTocSession } from '../src/structure-commands';

function setup(offset = 3) {
  const editor = createWordEditor();
  editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow', marginLeft: 1800, headerId: 'shared' }, content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'ABCDEF', marks: [{ stype: 'bold', range: [1, 5] }] }] },
    { stype: 'heading', attributes: { level: 1 }, content: [{ stype: 'inline-text', text: 'Chapter' }] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Tail' }] }
  ] }] } as never);
  const surfaces = () => editor.dataStore.getNode(editor.getRootId()!)!.content!.map(id => editor.dataStore.getNode(String(id))!).filter(n => n.stype === 'surface');
  const textId = String(editor.dataStore.getNode(String(surfaces()[0].content![0]))!.content![0]);
  editor.updateSelection({ type: 'range', startNodeId: textId, endNodeId: textId, startOffset: offset, endOffset: offset, collapsed: true });
  const snapshot = () => editor.exportDocument(editor.getRootId()!);
  return { editor, surfaces, textId, snapshot };
}
describe('Word document structure', () => {
  for (const offset of [0, 3, 6]) it(`splits at offset ${offset}, preserves following node IDs, and undoes once`, async () => {
    const { editor, surfaces, snapshot } = setup(offset);
    const original = snapshot(); const following = surfaces()[0].content!.slice(1);
    expect(await editor.run('insertSectionBreak')).toBe(true);
    expect(surfaces()).toHaveLength(2);
    expect(surfaces()[1].content!.slice(1)).toEqual(following);
    expect(surfaces()[1].attributes?.marginLeft).toBe(1800);
    expect(surfaces()[1].attributes?.headerId).toBe('shared');
    const paragraphs = surfaces().map(surface => editor.dataStore.getNode(String(surface.content![0]))!);
    const texts = paragraphs.map(p => p.content!.map(id => editor.dataStore.getNode(String(id))?.text ?? '').join(''));
    expect(texts).toEqual([offset === 0 ? '' : 'ABCDEF'.slice(0, offset), 'ABCDEF'.slice(offset)]);
    expect(editor.dataStore.getNode(editor.selection!.startNodeId)?.parentId).toBe(paragraphs[1].sid);
    const split = snapshot(); await editor.run('undo'); expect(snapshot()).toEqual(original);
    const semantic = (value: unknown) => JSON.parse(JSON.stringify(value, (key, item) => ['sid', 'metadata'].includes(key) ? undefined : item));
    await editor.run('redo'); expect(semantic(snapshot())).toEqual(semantic(split));
    expect(surfaces()[1].content!.slice(1)).toEqual(following);
    editor.loadDocument(split as never); expect(surfaces()).toHaveLength(2); editor.destroy();
  });
  it('rejects a noncollapsed range without changing any text', async () => {
    const { editor, textId, snapshot } = setup(); const before = snapshot();
    editor.updateSelection({ type: 'range', startNodeId: textId, endNodeId: textId, startOffset: 1, endOffset: 4, collapsed: false });
    expect(editor.canRun('insertSectionBreak')).toBe(false);
    expect(await editor.run('insertSectionBreak')).toBe(false); expect(snapshot()).toEqual(before); editor.destroy();
  });
  it('inserts before the selected paragraph, updates the existing TOC and rejects stale targets', async () => {
    const { editor, surfaces, snapshot } = setup(); const before = snapshot();
    const session = captureTocSession(editor)!;
    const settings = { levels: '1-3', scope: 'document', showPageNumbers: true, useHyperlinks: true, leader: 'dot' };
    expect(await editor.run('setTableOfContents', { ...session, settings })).toBe(true);
    const toc = editor.dataStore.getNode(String(surfaces()[0].content![0]))!;
    expect(toc.stype).toBe('tableOfContents'); expect(toc.attributes?.scope).toBe('document');
    await editor.run('undo'); expect(snapshot()).toEqual(before); await editor.run('redo');
    const next = captureTocSession(editor)!; expect(next.tocId).toBe(toc.sid);
    expect(await editor.run('setTableOfContents', { ...next, settings: { ...settings, levels: '1-1' }, action: 'update' })).toBe(true);
    expect(surfaces()[0].content).toHaveLength(4);
    const saved = snapshot();
    expect(await editor.run('setTableOfContents', { ...next, rootId: 'stale', settings, action: 'remove' })).toBe(false);
    expect(await editor.run('setTableOfContents', { ...next, settings: { ...settings, levels: 'broken' } })).toBe(false);
    expect(snapshot()).toEqual(saved);
    expect(await editor.run('setTableOfContents', { ...next, settings, action: 'remove' })).toBe(true);
    await editor.run('undo'); expect(snapshot()).toEqual(saved); editor.destroy();
  });
});
