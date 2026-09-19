import { HTMLConverter, registerDefaultHTMLRules } from '../../converter/src/index';
import { afterEach, expect, it, vi } from 'vitest';
import { validateTree } from '@barocss/schema';
import { openNoteTree, type NoteSession } from '../src/session';
const sessions: NoteSession[] = [];
afterEach(() => { sessions.splice(0).forEach(held => held.close()); vi.unstubAllGlobals(); });
const text = (value: string) => ({ stype: 'inline-text', text: value, marks: [] });
function setup(content: unknown[] = [text('ABCD')]) {
  const held = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content }] }); sessions.push(held);
  return held.editor;
}
const references = (editor: ReturnType<typeof setup>) => editor.dataStore.getAllNodes().filter(node => node.stype === 'pageReference');
const range = (start: string, from: number, end = start, to = from) => ({ type: 'range' as const, startNodeId: start, startOffset: from, endNodeId: end, endOffset: to, collapsed: start === end && from === to });

it.each([0, 2, 4])('inserts at offset %s, preserves suffix/marks and restores exact undo and redo', async offset => {
  const editor = setup([{ ...text('ABCD'), marks: [{ stype: 'bold', range: [0, 4] }] }]);
  const run = editor.dataStore.getAllNodes().find(node => node.text === 'ABCD')!;
  editor.setRange(range(run.sid!, offset));
  const before = editor.exportDocument();
  expect(await editor.executeCommand('insertNotePageReference', { pageId: 'page-target', title: 'Target page' })).toBe(true);
  const after = editor.exportDocument();
  expect(references(editor)).toHaveLength(1);
  expect(references(editor)[0].attributes).toMatchObject({ pageId: 'page-target', title: 'Target page' });
  expect(editor.selection?.collapsed).toBe(true);
  expect(typeof editor.dataStore.getNode(editor.selection!.startNodeId)?.text).toBe('string');
  expect(editor.selection!.startNodeId).not.toBe(references(editor)[0].sid);
  expect(validateTree(editor.dataStore.getActiveSchema()!, after)).toEqual([]);
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
  expect(await editor.redo()).toBe(true); expect(editor.exportDocument()).toEqual(after);
});

it('replaces a query spanning marked runs and an inline atom in one undo step', async () => {
  const editor = setup([text('Before [['), { ...text('tar'), marks: [{ stype: 'italic', range: [0, 3] }] }, { stype: 'emoji', attributes: { unicode: '🙂' } }, text('get After')]);
  const first = editor.dataStore.getAllNodes().find(node => node.text === 'Before [[')!, last = editor.dataStore.getAllNodes().find(node => node.text === 'get After')!;
  const replaceRange = range(first.sid!, 7, last.sid!, 3);
  editor.setRange(replaceRange); const before = editor.exportDocument();
  expect(await editor.executeCommand('insertNotePageReference', { pageId: 'target', title: 'Target', replaceRange })).toBe(true);
  const json = JSON.stringify(editor.exportDocument());
  expect(json).toContain('Before '); expect(json).toContain(' After'); expect(json).not.toContain('🙂'); expect(json).not.toContain('[[');
  expect(references(editor)).toHaveLength(1);
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
  expect(await editor.redo()).toBe(true); expect(references(editor)).toHaveLength(1);
});

it('supports atom deletion and native range clipboard serialization without losing identity on reopen', async () => {
  const editor = setup();
  const run = editor.dataStore.getAllNodes().find(node => node.text === 'ABCD')!;
  editor.setRange(range(run.sid!, 2));
  await editor.executeCommand('insertNotePageReference', { pageId: 'target', title: 'Snapshot title' });
  const saved = editor.exportDocument(), selection = editor.selection!;
  const fragment = editor.dataStore.serialization.serializeRange(range(run.sid!, 1, selection.startNodeId, 1));
  expect(JSON.stringify(fragment)).toContain('pageReference');
  expect(JSON.stringify(fragment)).toContain('Snapshot title');
  expect(await editor.executeCommand('backspace')).toBe(true);
  expect(references(editor)).toHaveLength(0);
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(saved);
  const reopened = openNoteTree(saved); sessions.push(reopened);
  expect(references(reopened.editor)[0].attributes?.pageId).toBe('target');
  const second = setup([text('Paste here')]);
  const pasteAt = second.dataStore.getAllNodes().find(node => node.text === 'Paste here')!;
  second.setRange(range(pasteAt.sid!, 5));
  expect(await second.executeCommand('paste', { nodes: fragment })).toBe(true);
  expect(references(second)[0].attributes).toMatchObject({ pageId: 'target', title: 'Snapshot title' });
  expect(validateTree(second.dataStore.getActiveSchema()!, second.exportDocument())).toEqual([]);
});

it('rejects missing identities and read-only edits without changes', async () => {
  const editor = setup();
  const run = editor.dataStore.getAllNodes().find(node => node.text === 'ABCD')!;
  editor.setRange(range(run.sid!, 1)); const before = editor.exportDocument();
  expect(await editor.executeCommand('insertNotePageReference', { pageId: '', title: 'Missing' })).toBe(false);
  editor.setEditable(false);
  expect(await editor.executeCommand('insertNotePageReference', { pageId: 'target', title: 'Readonly' })).toBe(false);
  expect(editor.exportDocument()).toEqual(before);
});


it('copies the visible fallback label to plain text for clipboard consumers without the native node format', async () => {
  const editor = setup(), run = editor.dataStore.getAllNodes().find(node => node.text === 'ABCD')!;
  editor.setRange(range(run.sid!, 2));
  await editor.executeCommand('insertNotePageReference', { pageId: 'target', title: 'Snapshot title' });
  const copyRange = range(run.sid!, 1, editor.selection!.startNodeId, 1);
  const writeText = vi.fn(async () => {});
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  vi.stubGlobal('ClipboardItem', undefined);
  expect(await editor.executeCommand('copy', { selection: copyRange })).toBe(true);
  expect(writeText).toHaveBeenCalledWith('BSnapshot titleC');
});


it('roundtrips the real HTML clipboard representation and escapes label markup', async () => {
  registerDefaultHTMLRules();
  const converter = new HTMLConverter();
  const title = 'Target <script>unsafe</script> "quoted"';
  const html = converter.convert([{ stype: 'pageReference', attributes: { pageId: 'target', title } }], 'html');
  expect(html).not.toContain('<script>'); expect(html).not.toContain('href=');
  const editor = setup(), run = editor.dataStore.getAllNodes().find(node => node.text === 'ABCD')!;
  editor.setRange(range(run.sid!, 2));
  expect(await editor.executeCommand('paste', { clipboardHtml: html, clipboardText: title })).toBe(true);
  expect(references(editor)[0].attributes).toMatchObject({ pageId: 'target', title });
});

it('refuses a replacement crossing block structure without changing text or selection', async () => {
  const held = openNoteTree({ stype: 'note', content: [
    { stype: 'paragraph', content: [text('First')] },
    { stype: 'paragraph', content: [text('Second')] }
  ] }); sessions.push(held);
  const editor = held.editor, runs = editor.dataStore.getAllNodes().filter(node => typeof node.text === 'string');
  const selection = range(runs[0].sid!, 1, runs[1].sid!, 2);
  editor.setRange(selection); const before = editor.exportDocument();
  expect(await editor.executeCommand('insertNotePageReference', { pageId: 'target', title: 'Target', replaceRange: selection })).toBe(false);
  expect(editor.exportDocument()).toEqual(before);
  expect(editor.selection).toMatchObject(selection);
});
