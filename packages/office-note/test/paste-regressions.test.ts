import { afterEach, describe, expect, it } from 'vitest';
import { validateTree } from '@barocss/schema';
import { openNoteTree, type NoteSession } from '../src/session';
const sessions: NoteSession[] = [];
afterEach(() => sessions.splice(0).forEach(session => session.close()));
const p = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });
function setup() {
  const session = openNoteTree({ stype: 'note', content: [p('ABCD'), p('Tail')] }); sessions.push(session);
  const editor = session.editor;
  const run = editor.dataStore.getAllNodes().find(node => node.text === 'ABCD')!;
  editor.selectionManager.setSelection({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 2, endOffset: 2, collapsed: true });
  return editor;
}
const words = (node: any): string => node.text ?? (node.content ?? []).map(words).join('');
describe('paste into real Note prose', () => {
  it.each(['X', 'one\ntwo'])('inserts %j at the caret, retains the suffix and supports exact undo/redo', async clipboardText => {
    const editor = setup(), before = editor.exportDocument();
    expect(await editor.executeCommand('paste', { clipboardText })).toBe(true);
    const after = editor.exportDocument() as any;
    expect(after.content.map(words)).toEqual(clipboardText === 'X' ? ['ABXCD', 'Tail'] : ['ABone', 'twoCD', 'Tail']);
    expect(validateTree(editor.dataStore.getActiveSchema()!, after)).toEqual([]);
    expect(editor.selection?.collapsed).toBe(true);
    const caret = editor.dataStore.getNode(editor.selection!.startNodeId)!;
    expect(caret.text?.slice(0, editor.selection!.startOffset)).toBe(clipboardText === 'X' ? 'X' : 'two');
    expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
    expect(await editor.redo()).toBe(true); expect(editor.exportDocument()).toEqual(after);
  });
  it('replaces the selected characters with HTML and retains imported bold marks', async () => {
    const editor = setup(), before = editor.exportDocument();
    editor.selectionManager.setSelection({ ...editor.selection!, startOffset: 1, endOffset: 3, collapsed: false });
    expect(await editor.executeCommand('paste', { clipboardHtml: '<p><strong>bold</strong></p>', clipboardText: 'bold' })).toBe(true);
    const after = editor.exportDocument() as any;
    expect(after.content.map(words)).toEqual(['AboldD', 'Tail']);
    const imported = editor.dataStore.getAllNodes().find(node => node.text === 'bold');
    expect(imported?.marks?.some(mark => mark.stype === 'bold')).toBe(true);
    expect(validateTree(editor.dataStore.getActiveSchema()!, after)).toEqual([]);
    expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
  });
});

it('keeps HTML spaces, nested emphasis, links and line breaks in their original order', async () => {
  const editor = setup();
  expect(await editor.executeCommand('paste', { clipboardHtml: '<p>Hello <strong>bold <em>inside</em></strong> <a href="https://example.com">link</a><br>next</p>' })).toBe(true);
  expect(words(editor.exportDocument())).toBe('ABHello bold inside linknextCDTail');
  const leaves = editor.dataStore.getAllNodes();
  expect(leaves.find(node => node.text === 'inside')?.marks?.map(mark => mark.stype).sort()).toEqual(['bold', 'italic']);
  expect(leaves.find(node => node.text === 'link')?.marks?.find(mark => mark.stype === 'link')?.attrs?.href).toBe('https://example.com');
  expect(leaves.some(node => node.stype === 'hardBreak')).toBe(true);
  expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
});
it('replaces across paragraphs without keeping selected text or deleting the outer suffix', async () => {
  const editor = setup(), before = editor.exportDocument();
  const tail = editor.dataStore.getAllNodes().find(node => node.text === 'Tail')!;
  editor.selectionManager.setSelection({ ...editor.selection!, startOffset: 1, endNodeId: tail.sid!, endOffset: 2, collapsed: false });
  expect(await editor.executeCommand('paste', { clipboardText: 'X\nY' })).toBe(true);
  expect((editor.exportDocument() as any).content.map(words)).toEqual(['AX', 'Yil']);
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
});
it('retains the required body when a replacement starts in a callout title', async () => {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'callout', attributes: { type: 'note' }, content: [
    { stype: 'calloutTitle', content: [{ stype: 'inline-text', text: 'Title' }] }, p('Body')
  ] }] }); sessions.push(session);
  const editor = session.editor, before = editor.exportDocument();
  const title = editor.dataStore.getAllNodes().find(node => node.text === 'Title')!, body = editor.dataStore.getAllNodes().find(node => node.text === 'Body')!;
  editor.selectionManager.setSelection({ type: 'range', startNodeId: title.sid!, endNodeId: body.sid!, startOffset: 2, endOffset: 2, collapsed: false });
  expect(await editor.executeCommand('paste', { clipboardText: 'X' })).toBe(true);
  expect(words(editor.exportDocument())).toBe('TiXdy');
  expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
});

it('preserves the space between top-level HTML inline fragments', async () => {
  const editor = setup();
  expect(await editor.executeCommand('paste', { clipboardHtml: '<strong>one</strong>\n<strong>two</strong>' })).toBe(true);
  expect(words(editor.exportDocument())).toBe('ABone twoCDTail');
});
it('imports a preformatted code fragment with its blank lines, indentation and language', async () => {
  const editor = setup();
  expect(await editor.executeCommand('paste', { clipboardHtml: '<pre><code class="language-python">def f():\n\treturn 1\n\n</code></pre>' })).toBe(true);
  const code = editor.dataStore.getAllNodes().find(node => node.stype === 'codeBlock')!;
  expect(code.attributes?.language).toBe('python');
  const runId = code.content![0] as string;
  expect(editor.dataStore.getNode(runId)?.text).toBe('def f():\n\treturn 1\n\n');
  expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
});
it('copies only the selected runs and inline atoms, and preserves them through an HTML clipboard round trip', async () => {
  const source = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [
    { stype: 'inline-text', text: 'ABCD', marks: [{ stype: 'bold', range: [1, 3] }, { stype: 'link', attrs: { href: 'https://example.com' }, range: [2, 4] }] },
    { stype: 'emoji', attributes: { unicode: '🙂' } }, { stype: 'hardBreak' },
    { stype: 'inline-text', text: 'EFGH', marks: [{ stype: 'italic', range: [0, 3] }] }
  ] }] }); sessions.push(source);
  const editor = source.editor;
  const start = editor.dataStore.getAllNodes().find(node => node.text === 'ABCD')!, end = editor.dataStore.getAllNodes().find(node => node.text === 'EFGH')!;
  const selection = { type: 'range' as const, startNodeId: start.sid!, endNodeId: end.sid!, startOffset: 2, endOffset: 2, collapsed: false };
  const json = editor.dataStore.serializeRange(selection);
  expect(json.map(node => node.stype)).toEqual(['inline-text', 'emoji', 'hardBreak', 'inline-text']);
  expect(json[0].text).toBe('CD'); expect(json[3].text).toBe('EF');
  expect(json[0].marks?.find(mark => mark.stype === 'bold')?.range).toEqual([0, 1]);
  expect(json[0].marks?.find(mark => mark.stype === 'link')?.range).toEqual([0, 2]);
  const { HTMLConverter } = await import('../../converter/src');
  const html = new HTMLConverter().convert(json);
  const target = setup();
  expect(await target.executeCommand('paste', { clipboardHtml: html })).toBe(true);
  const all = target.dataStore.getAllNodes();
  expect(words(target.exportDocument())).toBe('ABCDEFCDTail');
  expect(all.find(node => node.stype === 'emoji')?.attributes?.unicode).toBe('🙂');
  expect(all.some(node => node.stype === 'hardBreak')).toBe(true);
  const c = all.find(node => node.text === 'C')!, d = all.find(node => node.text === 'D')!;
  expect(c.marks?.some(mark => mark.stype === 'bold')).toBe(true);
  expect(d.marks?.some(mark => mark.stype === 'bold')).toBe(false);
  expect(d.marks?.find(mark => mark.stype === 'link')?.attrs?.href).toBe('https://example.com');
  expect(validateTree(target.dataStore.getActiveSchema()!, target.exportDocument())).toEqual([]);
});
it('writes plain clipboard text with paragraph boundaries, inline breaks and emoji intact', async () => {
  const session = openNoteTree({ stype: 'note', content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'AB' }, { stype: 'emoji', attributes: { unicode: '🙂' } }, { stype: 'hardBreak' }, { stype: 'inline-text', text: 'CD' }] }, p('EF')
  ] }); sessions.push(session);
  const editor = session.editor;
  const start = editor.dataStore.getAllNodes().find(node => node.text === 'AB')!, end = editor.dataStore.getAllNodes().find(node => node.text === 'EF')!;
  editor.selectionManager.setSelection({ type: 'range', startNodeId: start.sid!, endNodeId: end.sid!, startOffset: 1, endOffset: 1, collapsed: false });
  const { CopyPasteExtension } = await import('../../extensions/src/copy-paste');
  class ClipboardCapture extends CopyPasteExtension {
    text = '';
    protected async _writeClipboard(data: { text?: string }) { this.text = data.text ?? ''; }
  }
  const capture = new ClipboardCapture(); capture.onCreate(editor);
  expect(await editor.executeCommand('copy')).toBe(true);
  expect(capture.text).toBe('B🙂\nCD\nE');
});
