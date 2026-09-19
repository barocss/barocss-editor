import { afterEach, describe, expect, it } from 'vitest';
import { openNoteTree, readNoteFile, noteFileText, type NoteDocument, type NoteSession } from '../src/index';

const sessions: NoteSession[] = [];
afterEach(() => { for (const session of sessions.splice(0)) session.close(); });
const paragraph = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });
const setup = (title = '') => {
  const session = openNoteTree({ stype: 'note', content: [paragraph('밖의 문단'), {
    stype: 'callout', attributes: { title, type: 'note' }, content: [{ stype: 'blockQuote', content: [paragraph('본문은 그대로')] }]
  }] });
  sessions.push(session);
  const store = session.editor.dataStore;
  const all: NonNullable<ReturnType<typeof store.getNode>>[] = [];
  const visit = (sid: string) => {
    const node = store.getNode(sid);
    if (!node) return;
    all.push(node);
    for (const child of node.content ?? []) if (typeof child === 'string') visit(child);
  };
  visit(session.rootId);
  return { editor: session.editor, callout: all.find(node => node.stype === 'callout')!, body: all.find(node => node.text === '본문은 그대로')!, outside: all.find(node => node.text === '밖의 문단')! };
};

describe('a callout title is ordinary inline content', () => {
  it('migrates an attribute title once and keeps the nested body intact', () => {
    const { editor, callout } = setup('기존 제목');
    expect(callout.attributes?.title).toBeUndefined();
    const titleId = callout.content?.[0];
    expect(typeof titleId).toBe('string');
    const title = editor.dataStore.getNode(titleId as string)!;
    expect(title.stype).toBe('calloutTitle');
    expect(JSON.stringify(editor.exportDocument())).toContain('기존 제목');
    expect(JSON.stringify(editor.exportDocument())).toContain('본문은 그대로');
    expect(editor.canUndo()).toBe(false);
  });
  it('migrates old files before validation, preserving title/body and rejecting duplicate titles', () => {
    const old: NoteDocument = { stype: 'note', attributes: { title: '문서' }, content: [{ stype: 'callout', attributes: { title: '이전 제목', type: 'info' }, content: [paragraph('보존할 본문')] }] };
    const read = readNoteFile(noteFileText(old));
    if ('error' in read) throw new Error(read.error);
    const callout = read.document.content[0] as { attributes: Record<string, unknown>; content: { stype: string }[] };
    expect(callout.attributes.title).toBeUndefined();
    expect(callout.content.map(node => node.stype)).toEqual(['calloutTitle', 'paragraph']);
    expect(JSON.stringify(read.document)).toContain('이전 제목');
    expect(JSON.stringify(read.document)).toContain('보존할 본문');
    callout.content.unshift(callout.content[0]);
    expect(readNoteFile(noteFileText(read.document))).toHaveProperty('error');
  });
  it('edits Korean title through replaceText, saves and supports undo/redo', async () => {
    const { editor, callout } = setup();
    const title = editor.dataStore.getNode(callout.content![0] as string)!;
    const sid = title.content![0] as string;
    editor.selectionManager.setSelection({ type: 'range', startNodeId: sid, endNodeId: sid, startOffset: 0, endOffset: 0, collapsed: true });
    expect(await editor.executeCommand('replaceText', { range: editor.selection, text: '이번 회의의 결정' })).toBe(true);
    const saved = readNoteFile(noteFileText(editor.exportDocument() as NoteDocument));
    if ('error' in saved) throw new Error(saved.error);
    expect(JSON.stringify(saved.document)).toContain('이번 회의의 결정');
    expect(JSON.stringify(saved.document)).toContain('본문은 그대로');
    expect(await editor.undo()).toBe(true);
    expect(editor.dataStore.getNode(sid)?.text).toBe('');
    expect(await editor.redo()).toBe(true);
    expect(editor.dataStore.getNode(sid)?.text).toBe('이번 회의의 결정');
  });
});
