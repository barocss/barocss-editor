import { afterEach, describe, expect, it } from 'vitest';
import { openNoteTree, noteSlashItems, type NoteSession } from '../src/index';

const sessions: NoteSession[] = [];
afterEach(() => { for (const session of sessions.splice(0)) session.close(); });
const run = (text = '') => ({ stype: 'inline-text', text });
const paragraph = (text = '') => ({ stype: 'paragraph', content: [run(text)] });
function setup(blocks = [paragraph('시작')]) {
  const session = openNoteTree({ stype: 'note', content: blocks });
  sessions.push(session);
  return session.editor;
}
function caret(editor: ReturnType<typeof setup>, sid: string, offset = 0) {
  editor.selectionManager.setSelection({ type: 'range', startNodeId: sid, endNodeId: sid, startOffset: offset, endOffset: offset, collapsed: true });
}
function nodes(editor: ReturnType<typeof setup>, stype: string) {
  const result: ReturnType<typeof editor.dataStore.getNode>[] = [];
  const visit = (sid: string) => {
    const node = editor.dataStore.getNode(sid);
    if (!node) return;
    if (node.stype === stype) result.push(node);
    for (const child of node.content ?? []) if (typeof child === 'string') visit(child);
  };
  visit(editor.getRootId()!);
  return result.filter((node): node is NonNullable<typeof node> => !!node);
}

for (const [command, stype] of [['insertChecklist', 'taskItem'], ['insertDetails', 'bDetails'], ['insertCallout', 'callout']]) {
  it(`${command} inserts editable writing and undo removes only that block`, async () => {
    const editor = setup();
    caret(editor, nodes(editor, 'inline-text')[0].sid!, 2);
    expect(noteSlashItems().some((item) => item.command === command)).toBe(true);
    expect(await editor.executeCommand(command)).toBe(true);
    expect(nodes(editor, stype)).toHaveLength(1);
    expect(await editor.undo()).toBe(true);
    expect(nodes(editor, stype)).toHaveLength(0);
    expect(nodes(editor, 'paragraph')).toHaveLength(1);
    expect(editor.selection?.startNodeId).toBe(nodes(editor, 'inline-text')[0].sid);
    expect(editor.selection?.startOffset).toBe(2);
    expect(await editor.redo()).toBe(true);
    expect(nodes(editor, stype)).toHaveLength(1);
  });
}

describe('writing block state and keyboard transactions', () => {
  it('persists checklist checked with undo and export/reopen', async () => {
    const editor = setup();
    caret(editor, nodes(editor, 'inline-text')[0].sid!, 2);
    await editor.executeCommand('insertChecklist');
    const task = nodes(editor, 'taskItem')[0];
    expect(await editor.executeCommand('toggleChecklistItem', { nodeId: task.sid })).toBe(true);
    expect(editor.dataStore.getNode(task.sid!)?.attributes?.checked).toBe(true);
    const saved = editor.exportDocument();
    expect(await editor.undo()).toBe(true);
    expect(editor.dataStore.getNode(task.sid!)?.attributes?.checked).toBe(false);
    const reopened = openNoteTree(saved);
    sessions.push(reopened);
    expect(nodes(reopened.editor, 'taskItem')[0].attributes?.checked).toBe(true);
  });

  it('types, splits, and backspaces inside a checklist without losing the item', async () => {
    const editor = setup();
    caret(editor, nodes(editor, 'inline-text')[0].sid!, 2);
    await editor.executeCommand('insertChecklist');
    expect(await editor.executeCommand('replaceText', { range: editor.selection, text: '할 일' })).toBe(true);
    expect(await editor.executeCommand('backspace')).toBe(true);
    expect(nodes(editor, 'taskItem')).toHaveLength(1);
    expect(await editor.executeCommand('insertParagraph')).toBe(true);
    expect(nodes(editor, 'taskItem')).toHaveLength(2);
    expect(nodes(editor, 'inline-text').map((one) => one.text)).toContain('할 ');
  });

  it('Enter in a toggle summary moves into editable body rather than duplicating the summary', async () => {
    const editor = setup();
    caret(editor, nodes(editor, 'inline-text')[0].sid!, 2);
    await editor.executeCommand('insertDetails');
    const summary = nodes(editor, 'bSummary')[0];
    const textId = summary.content?.[0];
    if (typeof textId !== 'string') throw new Error('The stored summary must reference its text by sid.');
    const text = editor.dataStore.getNode(textId);
    caret(editor, text!.sid!, text!.text!.length);
    expect(await editor.executeCommand('insertParagraph')).toBe(true);
    expect(nodes(editor, 'bSummary')).toHaveLength(1);
    const at = editor.dataStore.getNode(editor.selection!.startNodeId);
    expect(editor.dataStore.getNode(at!.parentId!)?.stype).toBe('paragraph');
    expect(nodes(editor, 'bDetails')).toHaveLength(1);
  });

  it('empty checklist Enter becomes a paragraph, and undo restores the checkbox', async () => {
    const editor = setup();
    caret(editor, nodes(editor, 'inline-text')[0].sid!, 2);
    await editor.executeCommand('insertChecklist');
    expect(await editor.executeCommand('insertParagraph')).toBe(true);
    expect(nodes(editor, 'taskItem')).toHaveLength(0);
    expect(nodes(editor, 'paragraph')).toHaveLength(2);
    expect(await editor.undo()).toBe(true);
    expect(nodes(editor, 'taskItem')).toHaveLength(1);
  });

  it('Enter in an empty final toggle body leaves the toggle and keeps its required body', async () => {
    const editor = setup();
    caret(editor, nodes(editor, 'inline-text')[0].sid!, 2);
    await editor.executeCommand('insertDetails');
    const details = nodes(editor, 'bDetails')[0];
    const bodyId = details.content?.[1];
    if (typeof bodyId !== 'string') throw new Error('The stored toggle must reference its body by sid.');
    const body = editor.dataStore.getNode(bodyId);
    const textId = body?.content?.[0];
    if (typeof textId !== 'string') throw new Error('The stored body must reference its text by sid.');
    caret(editor, textId);
    expect(await editor.executeCommand('insertParagraph')).toBe(true);
    const at = editor.dataStore.getNode(editor.selection!.startNodeId);
    const outside = editor.dataStore.getNode(at!.parentId!);
    expect(outside?.parentId).toBe(editor.getRootId());
    expect(editor.dataStore.getNode(details.sid!)?.content).toHaveLength(2);
    expect(await editor.undo()).toBe(true);
    expect(editor.dataStore.getNode(editor.getRootId()!)?.content).toHaveLength(2);
  });

  it('persists toggle open and callout type/title independently of their body text', async () => {
    const editor = setup();
    caret(editor, nodes(editor, 'inline-text')[0].sid!, 2);
    await editor.executeCommand('insertDetails');
    const details = nodes(editor, 'bDetails')[0];
    expect(await editor.executeCommand('toggleDetails', { nodeId: details.sid, open: false })).toBe(true);
    expect(editor.dataStore.getNode(details.sid!)?.attributes?.open).toBe(false);
    expect(await editor.undo()).toBe(true);
    expect(editor.dataStore.getNode(details.sid!)?.attributes?.open).toBe(true);
    caret(editor, nodes(editor, 'inline-text')[0].sid!, 2);
    expect(await editor.executeCommand('insertCallout', { type: 'tip', title: '도움말' })).toBe(true);
    const callout = nodes(editor, 'callout')[0];
    expect(await editor.executeCommand('setNoteAttrs', { nodeId: callout.sid, attrs: { type: 'warning' } })).toBe(true);
    const reopened = openNoteTree(editor.exportDocument());
    sessions.push(reopened);
    expect(nodes(reopened.editor, 'callout')[0].attributes).toMatchObject({ type: 'warning' });
    expect(nodes(reopened.editor, 'callout')[0].attributes?.title).toBeUndefined();
    expect(nodes(reopened.editor, 'inline-text').some(node => node.text === '도움말')).toBe(true);
    expect(nodes(reopened.editor, 'bDetails')[0].attributes?.open).toBe(true);
  });
});
