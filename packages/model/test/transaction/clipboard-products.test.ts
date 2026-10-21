// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createWordEditor } from '../../../office-word/src/word-kit';
import { createSiteEditor } from '../../../office-site/src/site-kit';
import { createSlidesEditor } from '../../../office-slides/src/slides-kit';
import { createNoteEditor } from '../../../office-note/src/note-kit';
import { getNoteSchemaDefinition } from '../../../office-note/src/note-schema';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));
const makeNote = () => { const schema = createSchema('note', getNoteSchemaDefinition()); return createNoteEditor({ schema, dataStore: new DataStore(undefined, schema) }); };
function text(editor: Editor, id: string): string {
  const node = editor.dataStore.getNode(id)!;
  return node.text ?? (node.content ?? []).map(child => text(editor, String(child))).join('');
}
const snapshot = (editor: Editor) => JSON.stringify(editor.dataStore.getAllNodes().sort((a, b) => a.sid!.localeCompare(b.sid!)), (_key, value: unknown) => typeof value === 'function' ? value.toString() : value);

describe.each([['Word', createWordEditor], ['Site', createSiteEditor], ['Slides', createSlidesEditor], ['Note', makeNote]] as const)('%s clipboard body flow', (_name, create) => {
  it('round-trips native range metadata and external input with exact undo/redo', async () => {
    const editor = create(); editors.push(editor);
    const paragraph = { sid: 'p', stype: 'paragraph', content: [{ sid: 't', stype: 'inline-text', text: 'ABCD' }] };
    editor.loadDocument(editor.dataStore.getActiveSchema()!.topNode === 'note'
      ? { stype: 'note', content: [paragraph] }
      : { stype: 'document', content: [{ stype: 'surface', content: [paragraph] }] });
    // Native loaders may allocate new session IDs. Address the loaded range,
    // rather than the fixture's pre-import IDs, for the same four product flows.
    const loadedText = editor.dataStore.getAllNodes().filter(node => node.stype === 'inline-text' && node.text === 'ABCD');
    expect(loadedText).toHaveLength(1);
    const textId = loadedText[0].sid!;
    const paragraphId = loadedText[0].parentId!;
    expect(editor.dataStore.getNode(paragraphId)?.stype).toBe('paragraph');
    const data = new Map<string, string>();
    expect(await editor.executeCommand('copy', { selection: { type: 'range', startNodeId: textId, startOffset: 1, endNodeId: textId, endOffset: 3, collapsed: false }, clipboardData: { setData: (type: string, value: string) => data.set(type, value) } })).toBe(true);
    editor.updateSelection({ type: 'range', startNodeId: textId, startOffset: 4, endNodeId: textId, endOffset: 4, collapsed: true });
    const before = snapshot(editor);
    expect(await editor.executeCommand('paste', { clipboardHtml: data.get('text/html') })).toBe(true);
    expect(text(editor, paragraphId)).toBe('ABCDBC');
    const after = snapshot(editor);
    expect(await editor.undo()).toBe(true); expect(snapshot(editor)).toEqual(before);
    expect(await editor.redo()).toBe(true); expect(snapshot(editor)).toEqual(after);
    expect(await editor.executeCommand('paste', { clipboardText: 'plain' })).toBe(true);
    expect(text(editor, paragraphId)).toBe('ABCDBCplain');
    expect(await editor.executeCommand('paste', { nodes: [{ stype: 'inline-text', text: 'legacy payload' }] })).toBe(true);
    expect(text(editor, paragraphId)).toBe('ABCDBCplainlegacy payload');
  });
});
