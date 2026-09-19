import { describe, expect, it } from 'vitest';
import { createWordEditor } from '../src/word-kit';
import { bookmarkSelection, wordBookmarks } from '../src/bookmark-commands';
import { createFieldResolver, walkBlocks } from '@barocss/office-text';
function setup() {
  const editor = createWordEditor();
  editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Alpha ' }, { stype: 'inline-text', text: 'Beta', marks: [{ stype: 'bold', range: [0, 4] }] }] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'BeforeAfter' }] }
  ] }] } as never);
  const doc = { rootId: editor.getRootId()!, getNode: (id: string) => editor.dataStore.getNode(id) };
  const runs = [...walkBlocks(doc, doc.getNode(doc.rootId))].filter(n => n.stype === 'inline-text');
  const select = (start: number, from: number, end = start, to = from) => editor.updateSelection({ type: 'range', startNodeId: runs[start].sid!, startOffset: from, endNodeId: runs[end].sid!, endOffset: to, collapsed: start === end && from === to });
  const fields = () => createFieldResolver(doc);
  return { editor, doc, runs, select, fields };
}
describe('Word bookmarks and references', () => {
  it('collects a multi-run bookmark and renames its reference in one undoable edit', async () => {
    const { editor, select, fields, doc } = setup();
    select(0, 0, 1, 4);
    expect(await editor.run('addWordBookmark', { name: 'Goal' })).toBe(true);
    expect(fields().reference('Goal', 'text')).toBe('Alpha Beta');
    select(2, 6);
    expect(await editor.run('insertWordReference', { name: 'Goal' })).toBe(true);
    const ref = [...walkBlocks(doc, doc.getNode(doc.rootId))].find(n => n.stype === 'fieldRef')!;
    expect(await editor.run('renameWordBookmark', { name: 'Goal', nextName: 'Target' })).toBe(true);
    expect(doc.getNode(ref.sid!)!.attributes?.targetId).toBe('Target');
    expect(fields().reference('Target', 'text')).toBe('Alpha Beta');
    await editor.run('deleteWordBookmark', { name: 'Target' });
    expect(fields().reference('Target', 'text')).toBeUndefined();
    await editor.run('undo'); expect(fields().reference('Target', 'text')).toBe('Alpha Beta');
    await editor.run('undo'); expect(doc.getNode(ref.sid!)!.attributes?.targetId).toBe('Goal');
    editor.destroy();
  });
  it('inserts a point at the actual caret and preserves the surrounding text and navigation', async () => {
    const { editor, select, doc, fields } = setup(); select(2, 6);
    expect(await editor.run('addWordBookmark', { name: 'Point' })).toBe(true);
    const nodes = [...walkBlocks(doc, doc.getNode(doc.rootId))];
    const anchorIndex = nodes.findIndex(n => n.stype === 'bookmarkAnchor');
    expect(nodes[anchorIndex - 1].text).toBe('Before');
    expect(nodes[anchorIndex + 1].text).toBe('After');
    expect(bookmarkSelection(editor, 'Point')?.startNodeId).toBe(nodes[anchorIndex + 1].sid);
    expect(fields().reference('Point', 'text')).toBe('Point');
    await editor.run('undo'); expect(wordBookmarks(editor)).toHaveLength(0);
    expect([...walkBlocks(doc, doc.getNode(doc.rootId))].some(n => n.text === 'BeforeAfter')).toBe(true);
    editor.destroy();
  });
  it('does not replace a selection with a reference or accept duplicate names and stale roots', async () => {
    const { editor, select } = setup(); select(0, 0, 1, 4);
    await editor.run('addWordBookmark', { name: 'Goal' });
    expect(await editor.run('insertWordReference', { name: 'Goal' })).toBe(false);
    expect(await editor.run('addWordBookmark', { name: 'goal' })).toBe(false);
    expect(await editor.run('deleteWordBookmark', { name: 'Goal', rootId: 'stale' })).toBe(false);
    await editor.run('toggleTrackChanges'); expect(await editor.run('deleteWordBookmark', { name: 'Goal' })).toBe(false);
    await editor.run('toggleTrackChanges'); editor.setEditable(false);
    expect(await editor.run('deleteWordBookmark', { name: 'Goal' })).toBe(false);
    editor.destroy();
  });
});
