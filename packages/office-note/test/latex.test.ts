import { afterEach, expect, it } from 'vitest';
import { openNoteTree, type NoteSession } from '../src/session';
import { normalizeProseTree } from '@barocss/office-text';
import { validateTree } from '@barocss/schema';
const sessions: NoteSession[] = [];
afterEach(() => sessions.splice(0).forEach(s => s.close()));
it.each([0, 2, 4])('inserts inline math at offset %s with valid content and atomic undo', async offset => {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'ABCD', marks: [] }] }] }); sessions.push(session);
  const editor = session.editor, run = editor.dataStore.getAllNodes().find(n => n.text === 'ABCD')!;
  editor.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: offset, endOffset: offset, collapsed: true });
  const before = editor.exportDocument();
  expect(await editor.executeCommand('insertMathInline', { tex: 'x^2' })).toBe(true);
  expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
  const paragraph = editor.exportDocument().content![0] as any;
  expect(paragraph.content.map((n: any) => n.stype === 'mathInline' ? '[math]' : n.text).join('')).toBe('ABCD'.slice(0, offset) + '[math]' + 'ABCD'.slice(offset));
  await editor.undo(); expect(editor.exportDocument()).toEqual(before);
  await editor.redo(); expect(editor.dataStore.getAllNodes().some(n => n.stype === 'mathInline')).toBe(true);
});
it('block source edits persist, undo and reject readonly updates', async () => {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'A', marks: [] }] }] }); sessions.push(session);
  const editor = session.editor, run = editor.dataStore.getAllNodes().find(n => n.text === 'A')!;
  editor.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 1, endOffset: 1, collapsed: true });
  expect(await editor.executeCommand('insertMathBlock')).toBe(true);
  const nodeId = editor.dataStore.getAllNodes().find(n => n.stype === 'mathBlock')!.sid!;
  expect(await editor.executeCommand('setMathSource', { nodeId, tex: '\\frac{a}{b}', fontSize: 32 })).toBe(true);
  expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
  expect(editor.dataStore.getNode(nodeId)?.attributes?.fontSize).toBe(32);
  expect(await editor.executeCommand('setMathSource', { nodeId, tex: 'x', fontSize: 500 })).toBe(false);
  await editor.undo(); expect(editor.dataStore.getNode(nodeId)?.attributes?.tex).toBe('');
  editor.setEditable(false); expect(await editor.executeCommand('setMathSource', { nodeId, tex: 'x' })).toBe(false);
});
it('normalizes imported adjacent math atoms with stable editable boundaries', () => {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [
    { stype: 'mathInline', attributes: { tex: 'x' } }, { stype: 'mathInline', attributes: { tex: 'y' } }
  ] }] }); sessions.push(session);
  const tree = session.editor.exportDocument();
  expect((tree.content![0] as any).content.map((n: any) => n.stype)).toEqual(['inline-text', 'mathInline', 'inline-text', 'mathInline', 'inline-text']);
  const reopened = openNoteTree(tree); sessions.push(reopened);
  expect(normalizeProseTree(normalizeProseTree(tree))).toEqual(normalizeProseTree(tree));
  expect((reopened.editor.exportDocument().content![0] as any).content.map((n: any) => [n.stype, n.text, n.attributes])).toEqual((tree.content![0] as any).content.map((n: any) => [n.stype, n.text, n.attributes]));
});

it('stores validated math structure with source, survives reopen, and clears it on a source edit', async () => {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'mathBlock', attributes: { tex: 'old' } }] }); sessions.push(session);
  const editor = session.editor;
  const nodeId = editor.dataStore.getAllNodes().find(n => n.stype === 'mathBlock')!.sid!;
  const document = { version: 1, root: { id: 'r', children: [{ type: 'text', id: 't', text: 'x' }] } };
  const mathDocument = JSON.stringify(document);
  expect(await editor.executeCommand('setMathSource', { nodeId, tex: 'x', mathDocument })).toBe(true);
  expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
  const reopened = openNoteTree(editor.exportDocument()); sessions.push(reopened);
  expect(reopened.editor.dataStore.getAllNodes().find(n => n.stype === 'mathBlock')?.attributes?.mathDocument).toBe(mathDocument);
  await editor.undo(); expect(editor.dataStore.getNode(nodeId)?.attributes?.tex).toBe('old');
  await editor.redo();
  expect(await editor.executeCommand('setMathSource', { nodeId, tex: 'x', fontSize: 32 })).toBe(true);
  expect(editor.dataStore.getNode(nodeId)?.attributes?.mathDocument).toBe(mathDocument);
  expect(await editor.executeCommand('setMathSource', { nodeId, tex: 'y' })).toBe(true);
  expect(editor.dataStore.getNode(nodeId)?.attributes?.mathDocument).toBe('');
  expect(await editor.executeCommand('setMathSource', { nodeId, tex: 'y', mathDocument })).toBe(false);
  expect(await editor.executeCommand('setMathSource', { nodeId, tex: 'x', mathDocument: '{bad' })).toBe(false);
});
