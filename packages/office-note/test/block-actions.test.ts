import { afterEach, expect, it } from 'vitest';
import { validateTree } from '@barocss/schema';
import { openNoteTree, type NoteSession } from '../src/session';
const sessions: NoteSession[] = [];
afterEach(() => sessions.splice(0).forEach(session => session.close()));
const run = (text: string) => ({ stype: 'inline-text', text, marks: [{ stype: 'bold', range: [0, text.length] }] });
const p = (text: string) => ({ stype: 'paragraph', content: [run(text)] });
function setup(content: unknown[]) {
  const session = openNoteTree({ stype: 'note', content }); sessions.push(session);
  const editor = session.editor;
  const children = () => editor.dataStore.getNode(editor.getRootId()!)!.content as string[];
  const snapshot = () => semantic(editor.exportDocument());
  return { editor, children, snapshot };
}
const semantic = (node: any): unknown => ({ stype: node.stype, text: node.text, attributes: node.attributes ?? {}, marks: node.marks ?? [], ...(node.content ? { content: node.content.map(semantic) } : {}) });

for (const kind of ['heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6', 'taskItem', 'blockQuote']) {
  it(`converts marked text to ${kind} with atomic undo/redo`, async () => {
    const { editor, children, snapshot } = setup([p('Words')]);
    const before = snapshot();
    expect(await editor.executeCommand('convertNoteBlock', { nodeId: children()[0], kind })).toBe(true);
    expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
    const after = snapshot();
    expect(JSON.stringify(after)).toContain('Words');
    expect(JSON.stringify(after)).toContain('bold');
    expect(editor.selection?.collapsed).toBe(true);
    const target = editor.dataStore.getNode(editor.selection!.startNodeId);
    expect(target?.text).toBe('Words');
    expect(await editor.undo()).toBe(true); expect(snapshot()).toEqual(before);
    expect(await editor.redo()).toBe(true); expect(snapshot()).toEqual(after);
  });
}

it('unwraps a single quote without flattening several paragraphs or special headers', async () => {
  const { editor, children } = setup([{ stype: 'blockQuote', content: [p('Quote')] }, { stype: 'blockQuote', content: [p('One'), p('Two')] }, { stype: 'callout', content: [{ stype: 'calloutTitle', content: [run('Title')] }, p('Body')] }]);
  expect(editor.canExecuteCommand('convertNoteBlock', { nodeId: children()[1], kind: 'paragraph' })).toBe(false);
  const callout = editor.dataStore.getNode(children()[2])!;
  expect(editor.canExecuteCommand('convertNoteBlock', { nodeId: callout.content![0], kind: 'paragraph' })).toBe(false);
  expect(await editor.executeCommand('convertNoteBlock', { nodeId: children()[0], kind: 'paragraph' })).toBe(true);
  expect(editor.dataStore.getNode(children()[0])?.stype).toBe('paragraph');
});

it('duplicates a nested callout beside its source with independent ids and undo/redo', async () => {
  const { editor, children, snapshot } = setup([{ stype: 'callout', attributes: { type: 'tip' }, content: [{ stype: 'calloutTitle', content: [run('Title')] }, p('Body')] }, p('After')]);
  const original = children()[0], before = snapshot();
  expect(await editor.executeCommand('duplicateNoteBlock', { nodeId: original })).toBe(true);
  expect(children()[0]).toBe(original); expect(children()[1]).not.toBe(original);
  const originalTree = (editor.exportDocument() as any).content[0];
  const copiedTree = (editor.exportDocument() as any).content[1];
  expect(semantic(copiedTree)).toEqual(semantic(originalTree));
  expect(copiedTree.content[0].sid).not.toBe(originalTree.content[0].sid);
  const after = snapshot();
  expect(await editor.undo()).toBe(true); expect(snapshot()).toEqual(before);
  expect(await editor.redo()).toBe(true); expect(snapshot()).toEqual(after);
});

it('nests in a previous quote and outdents with exact order restored on undo', async () => {
  const { editor, children, snapshot } = setup([{ stype: 'blockQuote', content: [p('Quote')] }, p('Move'), p('After')]);
  const moving = children()[1], quote = children()[0], before = snapshot();
  expect(await editor.executeCommand('indentNoteBlock', { nodeId: moving })).toBe(true);
  expect(editor.dataStore.getNode(moving)?.parentId).toBe(quote);
  const nested = snapshot();
  expect(await editor.undo()).toBe(true); expect(snapshot()).toEqual(before);
  expect(await editor.redo()).toBe(true); expect(snapshot()).toEqual(nested);
  expect(await editor.executeCommand('outdentNoteBlock', { nodeId: moving })).toBe(true);
  expect(snapshot()).toEqual(before);
  expect(await editor.undo()).toBe(true); expect(snapshot()).toEqual(nested);
});

it('rejects nesting into inline paragraphs and outdenting the last required body', async () => {
  const { editor, children, snapshot } = setup([p('First'), p('Second'), { stype: 'bDetails', content: [{ stype: 'bSummary', content: [run('Summary')] }, p('Only')] }]);
  const before = snapshot();
  expect(await editor.executeCommand('indentNoteBlock', { nodeId: children()[1] })).toBe(false);
  const details = editor.dataStore.getNode(children()[2])!;
  expect(await editor.executeCommand('outdentNoteBlock', { nodeId: details.content![1] })).toBe(false);
  expect(snapshot()).toEqual(before);
});

it('conversion preserves mixed inline runs, atoms and caret offset through undo', async () => {
  const { editor, children, snapshot } = setup([{ stype: 'paragraph', content: [run('Bold'), { stype: 'emoji', attributes: { unicode: '🙂' } }, { stype: 'inline-text', text: 'Tail', marks: [{ stype: 'italic', range: [0, 4] }] }] }]);
  const original = editor.dataStore.getNode(children()[0])!;
  const last = String(original.content![2]);
  editor.setRange({ type: 'range', startNodeId: last, endNodeId: last, startOffset: 2, endOffset: 2, collapsed: true });
  const before = snapshot();
  expect(await editor.executeCommand('convertNoteBlock', { nodeId: children()[0], kind: 'taskItem' })).toBe(true);
  expect(editor.selection?.startOffset).toBe(2);
  expect(editor.dataStore.getNode(editor.selection!.startNodeId)?.text).toBe('Tail');
  expect(JSON.stringify(snapshot())).toContain('🙂');
  expect(JSON.stringify(snapshot())).toContain('italic');
  expect(await editor.undo()).toBe(true);
  expect(snapshot()).toEqual(before);
  expect(editor.selection).toMatchObject({ startNodeId: last, startOffset: 2 });
});

for (const kind of ['heading6', 'heading1', 'paragraph']) {
  it(`preserves a text range, inline marks and atoms converting a heading to ${kind}`, async () => {
    const { editor, children, snapshot } = setup([{ stype: 'heading', attributes: { level: 3 }, content: [run('Bold'), { stype: 'emoji', attributes: { unicode: '🙂' } }, run('End')] }]);
    const block = editor.dataStore.getNode(children()[0])!;
    const start = String(block.content![0]), end = String(block.content![2]);
    editor.setRange({ type: 'range', startNodeId: start, endNodeId: end, startOffset: 1, endOffset: 2, collapsed: false });
    expect(editor.selection).toMatchObject({ startNodeId: start, endNodeId: end, startOffset: 1, endOffset: 2 });
    const before = snapshot();
    expect(await editor.executeCommand('convertNoteBlock', { nodeId: block.sid, kind })).toBe(true);
    expect(editor.selection).toMatchObject({ startOffset: 1, endOffset: 2, collapsed: false });
    expect(editor.dataStore.getNode(editor.selection!.startNodeId)?.text).toBe('Bold');
    expect(editor.dataStore.getNode(editor.selection!.endNodeId)?.text).toBe('End');
    expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
    const after = snapshot();
    expect(JSON.stringify(after)).toContain('🙂');
    expect(await editor.undo()).toBe(true); expect(snapshot()).toEqual(before);
    expect(editor.selection).toMatchObject({ startNodeId: start, endNodeId: end, startOffset: 1, endOffset: 2 });
    expect(await editor.redo()).toBe(true); expect(snapshot()).toEqual(after);
  });
}
