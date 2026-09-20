// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { FragmentEditor } from '@barocss/model';
import { CopyPasteExtension } from '../src/copy-paste';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));
function fixture(isolating = false) {
  const schema = new Schema('roles', { topNode: 'document', nodes: {
    document: { name: 'document', content: 'block+' },
    prose: { name: 'prose', group: 'block', content: 'inline*' },
    panel: { name: 'panel', group: 'block', content: 'caption detail', isolating },
    caption: { name: 'caption', content: 'inline*' }, detail: { name: 'detail', content: 'inline*' },
    glyph: { name: 'glyph', group: 'inline', attrs: { peer: { type: 'string' } } },
  } });
  const editor = new Editor({ schema, extensions: [new CopyPasteExtension()] }); editors.push(editor);
  editor.loadDocument({ stype: 'document', content: [
    { sid: 'before', stype: 'prose', content: [{ sid: 'before-text', stype: 'glyph', text: 'before' }] },
    { sid: 'start', stype: 'prose', content: [{ sid: 'start-text', stype: 'glyph', text: 'abcd' }] },
    { sid: 'panel', stype: 'panel', content: [
      { sid: 'caption', stype: 'caption', content: [{ sid: 'caption-text', stype: 'glyph', text: 'title' }] },
      { sid: 'detail', stype: 'detail', content: [{ sid: 'end-text', stype: 'glyph', text: 'wxyz' }] },
    ] },
    { sid: 'after', stype: 'prose', content: [{ sid: 'after-text', stype: 'glyph', text: 'after' }] },
  ] });
  const editing = FragmentEditor.forEditor(editor, { rangeReplacement: 'preserve-boundaries', references: { glyph: { peer: { kind: 'node', outside: 'reject' } } } });
  editor.updateSelection({ type: 'range', startNodeId: 'start-text', startOffset: 2, endNodeId: 'end-text', endOffset: 2, collapsed: false });
  return { editor, editing };
}
const snapshot = (editor: Editor) => structuredClone(editor.dataStore.getAllNodes().sort((a, b) => a.sid!.localeCompare(b.sid!)));

describe('schema-declared range replacement', () => {
  it('preserves required roles, local metadata, incoming references, and exact undo/redo', async () => {
    const { editor, editing } = fixture();
    const local = { metadata: { owner: 'local' }, version: 8, createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-02-01') };
    for (const id of ['before', 'after', 'start-text', 'panel', 'caption']) editor.dataStore.setNode({ ...editor.dataStore.getNode(id)!, ...local });
    const input = structuredClone(editing.plainText('XY', 'start-text'));
    input.content = [
      { stype: 'glyph', sourceId: 'incoming-a', text: 'X', attributes: { peer: 'incoming-b' } },
      { stype: 'glyph', sourceId: 'incoming-b', text: 'Y' },
    ];
    input.references = [{ sourceId: 'incoming-a', attribute: 'peer', target: 'incoming-b', kind: 'node' }];
    const before = snapshot(editor), selection = structuredClone(editor.selection);
    const decision = editing.plan({ intent: 'copy', fragment: input, target: { kind: 'text', nodeId: 'start-text', from: 2, endNodeId: 'end-text', to: 2 } });
    expect(snapshot(editor)).toEqual(before); expect(editor.selection).toEqual(selection);
    expect(decision.ok).toBe(true); if (!decision.ok) return;
    expect(decision.plan.removeIds).toEqual(['start', 'panel']);
    expect(await editor.executeCommand('paste', { clipboardFragment: JSON.stringify(input) })).toBe(true);
    expect(editor.dataStore.getNode('start-text')?.text).toBe('ab');
    expect(editor.dataStore.getNode('end-text')?.text).toBe('yz');
    expect(editor.dataStore.getNode('panel')?.content).toEqual(['caption', 'detail']);
    expect(editor.dataStore.getNode('caption')?.content).toEqual(['caption-text']);
    expect(editor.dataStore.getNode('caption-text')?.text).toBe('');
    for (const id of ['before', 'after', 'start-text', 'panel', 'caption']) expect(editor.dataStore.getNode(id)).toMatchObject(local);
    const children = editor.dataStore.getNode('start')!.content as string[];
    expect(editor.dataStore.getNode(children[1])?.attributes?.peer).toBe(children[2]);
    expect(editor.selection).toMatchObject({ startNodeId: children[2], startOffset: 1, collapsed: true });
    const after = snapshot(editor), caret = structuredClone(editor.selection);
    expect(await editor.undo()).toBe(true); expect(snapshot(editor)).toEqual(before); expect(editor.selection).toEqual(selection);
    expect(await editor.redo()).toBe(true); expect(snapshot(editor)).toEqual(after); expect(editor.selection).toEqual(caret);
    expect(editor.getHistoryStats().totalEntries).toBe(1);
  });
  it.each(['isolating', 'no-policy'] as const)('refuses a cross-container range with %s without changing state', async reason => {
    const { editor, editing } = fixture(reason === 'isolating');
    if (reason === 'no-policy') editing.configure({});
    const before = snapshot(editor), selection = structuredClone(editor.selection);
    expect(await editor.executeCommand('paste', { clipboardText: 'X' })).toBe(false);
    expect(snapshot(editor)).toEqual(before); expect(editor.selection).toEqual(selection);
    expect(editor.getHistoryStats().totalEntries).toBe(0);
  });
});
