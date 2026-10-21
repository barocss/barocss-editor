import { afterEach, expect, it } from 'vitest';
import { registerPreCommitGuard } from '@barocss/model';
import { openNoteTree, type NoteSession } from '../src/session';
import { createNoteNative2Context, openNoteNativeSnapshot } from '../src/native-session';
import { NATIVE_NOTE_FIXTURES } from '../../../apps/note/src/native2-scenario-fixtures';
const tree = { stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'kept' }] }] };
const sessions: NoteSession[] = [];
const make = (authority?: NoteSession['editor']) => { const one = openNoteTree(tree, { authority } as never); sessions.push(one); return one; };
afterEach(() => { sessions.splice(0).reverse().forEach(one => one.close()); });
it.each([{ name: 'A', source: NATIVE_NOTE_FIXTURES.SOURCE_A }, { name: 'B', source: NATIVE_NOTE_FIXTURES.SOURCE_B }])('native2 explicit parent authority changes cannot grant queued old-generation input: $name', async ({ source }) => {
  const host = make(), context = createNoteNative2Context(JSON.stringify(source));
  const child = openNoteNativeSnapshot(context, { authority: host.editor }); sessions.push(child);
  const first = child.editor.dataStore.getNode(child.rootId)?.content?.[0];
  if (typeof first !== 'string') throw new Error('Actual heading must have an owned SID');
  const run = child.editor.dataStore.getNode(first)?.content?.[0];
  if (typeof run !== 'string') throw new Error('Actual heading run must exist');
  const before = { document: child.editor.exportDocument(), native: child.exportSnapshot(), history: child.editor.getHistoryStats() };
  const lock = await child.editor.dataStore.acquireLock();
  const pending = child.editor.executeCommand('replaceText', { range: { type: 'range', startNodeId: run, endNodeId: run, startOffset: 4, endOffset: 4, collapsed: true }, text: ' stale' });
  host.editor.setEditable(false); host.editor.setEditable(true); child.editor.dataStore.releaseLock(lock);
  expect(await pending).toBe(false);
  expect({ document: child.editor.exportDocument(), native: child.exportSnapshot(), history: child.editor.getHistoryStats() }).toStrictEqual(before);
  host.editor.setEditable(false); expect(child.editor.isEditable).toBe(false);
  expect(await child.editor.executeCommand('replaceText', { range: { type: 'range', startNodeId: run, endNodeId: run, startOffset: 4, endOffset: 4, collapsed: true }, text: ' denied' })).toBe(false);
});
it.each([{ name: 'A', source: NATIVE_NOTE_FIXTURES.SOURCE_A }, { name: 'B', source: NATIVE_NOTE_FIXTURES.SOURCE_B }])('native2 parent root-generation replacement retires descendant writes and refuses old-context export: $name', ({ source }) => {
  const host = make(), child = openNoteNativeSnapshot(createNoteNative2Context(JSON.stringify(source)), { authority: host.editor }); sessions.push(child);
  const before = child.editor.exportDocument(); host.editor.loadDocument(tree, host.session);
  expect(child.editor.isEditable).toBe(false); expect(() => child.exportSnapshot()).toThrow('native_context_changed');
  expect(child.editor.exportDocument()).toStrictEqual(before);
});
const edit = (one: NoteSession, text: string) => {
  const paragraph = one.editor.dataStore.getNode(one.rootId)!.content![0] as string;
  const run = one.editor.dataStore.getNode(paragraph)!.content![0] as string;
  return one.editor.executeCommand('replaceText', { range: { type: 'range', startNodeId: run, endNodeId: run, startOffset: 0, endOffset: 4, collapsed: false }, text });
};
it('propagates the current authority through nested sessions and preserves reader state', async () => {
  const host = make(); host.editor.setEditable(false);
  const child = make(host.editor); const grandchild = make(child.editor);
  expect(child.editor.isEditable).toBe(false); expect(grandchild.editor.isEditable).toBe(false);
  const before = grandchild.editor.exportDocument();
  expect(await edit(grandchild, 'denied')).toBe(false);
  expect(grandchild.editor.exportDocument()).toEqual(before);
  host.editor.setEditable(true);
  expect(child.editor.isEditable).toBe(true); expect(grandchild.editor.isEditable).toBe(true);
  expect(await edit(grandchild, 'allowed')).toBe(true);
});
it('rejects a child edit queued before revoke/restore without consuming history', async () => {
  const host = make(); const child = make(host.editor); const before = child.editor.exportDocument();
  const lock = await child.editor.dataStore.acquireLock('hold-child');
  const pending = edit(child, 'stale');
  host.editor.setEditable(false); host.editor.setEditable(true);
  child.editor.dataStore.releaseLock(lock);
  expect(await pending).toBe(false);
  expect(child.editor.exportDocument()).toEqual(before); expect(child.editor.canUndo()).toBe(false);
  expect(await edit(child, 'fresh')).toBe(true);
});
it('retires old descendant authority after parent reload even if the session name is reused', async () => {
  const host = make(); const child = make(host.editor);
  host.editor.loadDocument(tree, host.session);
  expect(child.editor.isEditable).toBe(false);
  expect(await edit(child, 'old')).toBe(false);
});
it('retains captured authority across an awaited child commit guard', async () => {
  const host = make(); const child = make(host.editor); const before = child.editor.exportDocument();
  let release!: () => void; let entered!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const remove = registerPreCommitGuard(child.editor, async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); });
  const pending = edit(child, 'stale'); await waiting;
  host.editor.setEditable(false); host.editor.setEditable(true); release();
  expect(await pending).toBe(false); expect(child.editor.exportDocument()).toEqual(before);
  remove();
});
it('signals dirty descendant input immediately and preserves native metadata through reopen', async () => {
  const { observeNoteSessionChanges, noteTreeOf } = await import('../src/session');
  const host = make(); const child = make(host.editor); let notifications = 0;
  const off = observeNoteSessionChanges(host.editor, () => { notifications++; });
  const source = { stype: 'note', content: [{ stype: 'paragraph', attributes: {}, metadata: { loadedAt: 'original-native', keep: ['yes'] }, content: [
    { stype: 'inline-text', attributes: {}, text: 'kept', marks: [], metadata: { loadedAt: 'native-run', owner: 'author' } }
  ] }] };
  child.editor.loadDocument(source, child.session); notifications = 0;
  expect(await edit(child, 'next')).toBe(true); expect(notifications).toBe(1);
  const expected = structuredClone(source); expected.content[0].content[0].text = 'next';
  expect(noteTreeOf(child.editor.dataStore, child.rootId)).toEqual(expected);
  const reopened = openNoteTree(expected); sessions.push(reopened);
  expect(noteTreeOf(reopened.editor.dataStore, reopened.rootId)).toEqual(expected);
  off();
});
