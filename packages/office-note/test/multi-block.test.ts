import { afterEach, expect, it } from 'vitest';
import { openNoteTree, type NoteSession } from '../src/session';
const sessions: NoteSession[] = [];
afterEach(() => sessions.splice(0).forEach(s => s.close()));
function setup() {
  const session = openNoteTree({ stype: 'note', content: ['A', 'B', 'C', 'D'].map(text => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] })) });
  sessions.push(session); return session.editor;
}
for (const [action, expected] of [['up', 'BCAD'], ['down', 'ADBC'], ['duplicate', 'ABCBCD'], ['delete', 'AD']]) it(`${action} is ordered and one undoable transaction`, async () => {
  const editor = setup(), before = editor.exportDocument();
  const ids = editor.dataStore.getNode(editor.getRootId()!)!.content!.slice(1, 3);
  expect(await editor.executeCommand(`batchNoteBlocks:${action}`, { nodeIds: ids })).toBe(true);
  const after = editor.exportDocument();
  expect(after.content!.map((n: any) => n.content[0].text).join('')).toBe(expected);
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
  expect(await editor.redo()).toBe(true); expect(editor.exportDocument()).toEqual(after);
});
it('deleting all blocks leaves a writable paragraph and undo restores everything', async () => {
  const editor = setup(), before = editor.exportDocument();
  expect(await editor.executeCommand('batchNoteBlocks:delete', { nodeIds: editor.dataStore.getNode(editor.getRootId()!)!.content })).toBe(true);
  expect(editor.exportDocument().content).toHaveLength(1);
  expect(editor.dataStore.getNode(editor.selection!.startNodeId)?.text).toBe('');
  await editor.undo(); expect(editor.exportDocument()).toEqual(before);
});
it('rejects stale, disjoint and boundary actions', () => {
  const editor = setup(), ids = editor.dataStore.getNode(editor.getRootId()!)!.content!;
  expect(editor.canExecuteCommand('batchNoteBlocks:up', { nodeIds: ids.slice(0, 2) })).toBe(false);
  expect(editor.canExecuteCommand('batchNoteBlocks:down', { nodeIds: ids.slice(2) })).toBe(false);
  expect(editor.canExecuteCommand('batchNoteBlocks:delete', { nodeIds: [ids[0], ids[2]] })).toBe(false);
  expect(editor.canExecuteCommand('batchNoteBlocks:delete', { nodeIds: [ids[0], 'missing'] })).toBe(false);
});
for (const [at, expected] of [[0, 'BCAD'], [2, 'ADBC']] as const) it(`group drag to ${at} preserves order and undo`, async () => {
  const editor = setup(), before = editor.exportDocument();
  const nodeIds = editor.dataStore.getNode(editor.getRootId()!)!.content!.slice(1, 3);
  expect(await editor.executeCommand('batchNoteBlocks:move', { nodeIds, at })).toBe(true);
  expect(editor.exportDocument().content!.map((n: any) => n.content[0].text).join('')).toBe(expected);
  await editor.undo(); expect(editor.exportDocument()).toEqual(before);
});
it('Enter uses the visible caret after undoing a block-only move', async () => {
  const editor = setup(); const ids = editor.dataStore.getNode(editor.getRootId()!)!.content!;
  await editor.executeCommand('batchNoteBlocks:move', { nodeIds: ids.slice(1, 3), at: 2 }); await editor.undo();
  const run = editor.dataStore.getNode(String(ids[3]))!.content![0] as string;
  const selection = { type: 'range', startNodeId: run, endNodeId: run, startOffset: 1, endOffset: 1, collapsed: true };
  expect(await editor.executeCommand('insertParagraph', { selection })).toBe(true);
  expect(editor.exportDocument().content).toHaveLength(5);
});
