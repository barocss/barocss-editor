// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { FragmentEditor, defineEditingRule } from '@barocss/model';
import { ReorderExtension } from '../src/reorder';
const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));
function fixture() {
  const schema = new Schema('reorder', { topNode: 'document', nodes: {
    document: { name: 'document', content: 'block+' }, body: { name: 'body', group: 'block', content: 'inline*' }, glyph: { name: 'glyph', group: 'inline' }
  } });
  const editor = new Editor({ schema, extensions: [new ReorderExtension()] }); editors.push(editor);
  editor.loadDocument({ stype: 'document', content: ['a','b','c'].map(sid => ({ sid, stype: 'body', content: [{ sid: sid+'t', stype: 'glyph', text: sid }] })) });
  const order = () => editor.dataStore.getNode(editor.getRootId()!)?.content;
  return { editor, order };
}
describe('ReorderExtension common editing policy', () => {
  it.each([['c',0,['c','a','b']],['a',2,['b','c','a']],['a',99,['b','c','a']]] as const)('moves %s to product slot %i and restores identity on undo', async (blockId,targetIndex,expected) => {
    const { editor, order } = fixture();
    expect(await editor.executeCommand('moveBlockToPosition',{blockId,targetIndex})).toBe(true);
    expect(order()).toEqual(expected); expect(editor.getHistoryStats().totalEntries).toBe(1);
    expect(await editor.undo()).toBe(true); expect(order()).toEqual(['a','b','c']);
    expect(await editor.redo()).toBe(true); expect(order()).toEqual(expected);
  });
  it.each([['b',1],['missing',0],['a',NaN],['a',-1],['a',0.5]] as const)('rejects unchanged or invalid input %s %s without history', async (blockId,targetIndex) => {
    const { editor, order } = fixture();
    expect(await editor.executeCommand('moveBlockToPosition',{blockId,targetIndex})).toBe(false);
    expect(order()).toEqual(['a','b','c']); expect(editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('honors the editor policy and readonly state', async () => {
    const { editor, order } = fixture();
    FragmentEditor.forEditor(editor).configure({ rules: [defineEditingRule({ id:'locked',match:{sourceType:'*',targetType:'*',boundary:'closed',attributes:'any'},effect:'reject',reason:'Locked' })] });
    expect(await editor.executeCommand('moveBlockToPosition',{blockId:'a',targetIndex:2})).toBe(false);
    expect(order()).toEqual(['a','b','c']);
    editor.setEditable(false);
    expect(editor.canExecuteCommand('moveBlockToPosition',{blockId:'a',targetIndex:2})).toBe(false);
  });
});
