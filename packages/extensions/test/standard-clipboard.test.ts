// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';
import { CopyPasteExtension } from '../src/copy-paste';
import { FragmentEditor, defineEditingRule, type EditingDecision } from '@barocss/model';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));
function fixture() {
  const schema = createSchema('standard-clipboard', getStandardSchemaDefinition());
  const editor = new Editor({ schema, extensions: [new CopyPasteExtension()] }); editors.push(editor);
  editor.loadDocument({ stype: 'document', content: [{ sid: 'p', stype: 'paragraph', content: [{ sid: 't', stype: 'inline-text', text: 'xy' }] }] });
  editor.updateSelection({ type: 'range', startNodeId: 't', startOffset: 1, endNodeId: 't', endOffset: 1, collapsed: true });
  return editor;
}
function text(editor: Editor, id: string): string {
  const node = editor.dataStore.getNode(id)!;
  return node.text ?? (node.content ?? []).map(child => text(editor, String(child))).join('');
}

describe('standard metadata-free clipboard contract', () => {
  it('imports external HTML paragraphs and bold marks with one history entry', async () => {
    const editor = fixture();
    expect(await editor.executeCommand('paste', { clipboardHtml: '<p><strong>A</strong></p><p>B</p>' })).toBe(true);
    const blocks = editor.dataStore.getNode(editor.getRootId()!)!.content as string[];
    expect(blocks.map(id => text(editor, id))).toEqual(['xA', 'By']);
    expect(editor.dataStore.getAllNodes().find(node => node.text === 'A')?.marks).toContainEqual(expect.objectContaining({ stype: 'bold', range: [0, 1] }));
    expect(editor.getHistoryStats().totalEntries).toBe(1);
    expect(await editor.undo()).toBe(true); expect(text(editor, 'p')).toBe('xy');
  });
  it('retains public nested nodes and explicit link attributes', async () => {
    const editor = fixture();
    expect(await editor.executeCommand('paste', { nodes: [{ stype: 'paragraph', content: [{ stype: 'link', attributes: { href: 'https://example.com', title: 'Example' }, content: [{ stype: 'inline-text', text: 'link' }] }] }] })).toBe(true);
    expect(text(editor, 'p')).toBe('xlinky');
    const link = editor.dataStore.getAllNodes().find(node => node.text === 'link')!;
    expect(link.marks).toContainEqual(expect.objectContaining({ stype: 'link', attrs: { href: 'https://example.com', title: 'Example' } }));
  });
  it('refuses a known reference loss until the caller accepts the reported conversion', async () => {
    const editor = fixture();
    const plans: EditingDecision[] = []; editor.on('editor:clipboard.plan', (decision: EditingDecision) => plans.push(decision));
    const payload = { nodes: [{ stype: 'pageReference', attributes: { title: 'Read me', pageId: 'page-1' } }] };
    expect(await editor.executeCommand('paste', payload)).toBe(false);
    expect(text(editor, 'p')).toBe('xy'); expect(editor.getHistoryStats().totalEntries).toBe(0);
    expect(plans[0]).toMatchObject({ ok: true, plan: { losses: [{ kind: 'reference' }] } });
    expect(await editor.executeCommand('paste', { ...payload, acceptLosses: true })).toBe(true);
    expect(text(editor, 'p')).toBe('xRead mey');
  });
  it('reports an explicit join conversion instead of silently discarding boundary meaning', async () => {
    const editor = fixture();
    editor.loadDocument({ stype: 'document', content: [
      { stype: 'heading', attributes: { level: 2 }, content: [{ sid: 'h', stype: 'inline-text', text: 'Title' }] },
      { sid: 'p', stype: 'paragraph', content: [{ sid: 't', stype: 'inline-text', text: 'xy' }] }
    ] });
    const editing = FragmentEditor.forEditor(editor, { rules: [defineEditingRule({ id: 'heading.to-body', match: { sourceType: 'heading', targetType: 'paragraph', boundary: 'open', attributes: 'any' }, effect: 'join-inline', reason: 'Caller permits heading text in body' })] });
    const serialized = JSON.stringify(editing.captureText('h', 0, 5));
    editor.updateSelection({ type: 'range', startNodeId: 't', startOffset: 1, endNodeId: 't', endOffset: 1, collapsed: true });
    expect(await editor.executeCommand('paste', { clipboardFragment: serialized })).toBe(false);
    expect(await editor.executeCommand('paste', { clipboardFragment: serialized, acceptLosses: true })).toBe(true);
    expect(text(editor, 'p')).toBe('xTitley');
  });
});
