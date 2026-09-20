// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { Editor, type ModelSelection } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { FragmentEditor, FRAGMENT_CLIPBOARD_TYPE, decodeClipboardFragment, defineEditingRule } from '@barocss/model';
import { CopyPasteExtension } from '../src/copy-paste';
import { standardClipboardPolicy } from '../src/standard-clipboard';

const editors: Editor[] = [];
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); vi.unstubAllGlobals(); });
const selection = (startNodeId: string, startOffset: number, endNodeId = startNodeId, endOffset = startOffset): ModelSelection => ({ type: 'range', startNodeId, startOffset, endNodeId, endOffset, collapsed: startNodeId === endNodeId && startOffset === endOffset });
function fixture(schema = new Schema('custom-clipboard', { topNode: 'document', nodes: {
  document: { name: 'document', content: 'body+' }, body: { name: 'body', group: 'block', content: 'inline*' }, glyph: { name: 'glyph', group: 'inline' },
}, marks: { strong: { name: 'strong' } } })) {
  const editor = new Editor({ schema, extensions: [new CopyPasteExtension()] }); editors.push(editor);
  editor.loadDocument({ stype: 'document', content: [
    { sid: 'a', stype: 'body', content: [{ sid: 'a1', stype: 'glyph', text: 'abcd', marks: [{ stype: 'strong', range: [1, 3] }] }] },
    { sid: 'b', stype: 'body', content: [{ sid: 'b1', stype: 'glyph', text: 'efgh' }] },
    { sid: 'x', stype: 'body', content: [{ sid: 'x1', stype: 'glyph', text: '12' }] },
    { sid: 'y', stype: 'body', content: [{ sid: 'y1', stype: 'glyph', text: '34' }] },
  ] });
  const editing = FragmentEditor.forEditor(editor);
  return { editor, editing };
}
const snapshot = (editor: Editor) => structuredClone(editor.dataStore.getAllNodes().sort((a, b) => a.sid!.localeCompare(b.sid!)));
const text = (editor: Editor, id: string): string => { const node = editor.dataStore.getNode(id)!; return node.text ?? (node.content ?? []).map(child => text(editor, String(child))).join(''); };
const bodies = (editor: Editor) => (editor.dataStore.getNode(editor.getRootId()!)!.content as string[]).map(id => text(editor, id));
async function copy(editor: Editor, range: ModelSelection) {
  const data = new Map<string, string>(); let handled = false;
  const result = editor.executeCommand('copy', { selection: range, clipboardData: { setData: (type: string, value: string) => data.set(type, value) }, onClipboardWrite: () => { handled = true; } });
  expect(handled, 'native clipboard must be written before the first asynchronous boundary').toBe(true);
  expect(await result).toBe(true);
  return data;
}
function memoryClipboard() {
  let held: { data: Record<string, Blob>; types: string[]; getType(type: string): Promise<Blob> }[] = [];
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('ClipboardItem', class {
    types: string[];
    constructor(public data: Record<string, Blob>) { this.types = Object.keys(data); }
    getType(type: string) { return Promise.resolve(this.data[type]); }
  });
  const write = vi.fn(async (items: typeof held) => { held = items; });
  const read = vi.fn(async () => held);
  vi.stubGlobal('navigator', { clipboard: { write, read } });
  return { read, write, get: () => held };
}

describe('native and asynchronous fragment clipboard', () => {
  it('round-trips an open custom-schema range through native MIME with marks and one undo unit', async () => {
    const { editor } = fixture();
    const data = await copy(editor, selection('a1', 1, 'a1', 3));
    expect(decodeClipboardFragment(data.get(FRAGMENT_CLIPBOARD_TYPE)!)).toMatchObject({ selection: 'range', openStart: 1, openEnd: 1 });
    editor.updateSelection(selection('x1', 1));
    const before = snapshot(editor), beforeSelection = structuredClone(editor.selection);
    expect(await editor.executeCommand('paste', { clipboardFragment: data.get(FRAGMENT_CLIPBOARD_TYPE) })).toBe(true);
    expect(text(editor, 'x')).toBe('1bc2');
    const inserted = editor.dataStore.getNode(editor.dataStore.getNode('x')!.content![1] as string)!;
    expect(inserted.marks).toEqual([{ stype: 'strong', range: [0, 2] }]);
    const after = snapshot(editor), caret = structuredClone(editor.selection);
    expect(await editor.undo()).toBe(true); expect(snapshot(editor)).toEqual(before); expect(editor.selection).toEqual(beforeSelection);
    expect(await editor.redo()).toBe(true); expect(snapshot(editor)).toEqual(after); expect(editor.selection).toEqual(caret);
    expect(editor.getHistoryStats().totalEntries).toBe(1);
  });
  it('preserves the same fragment through HTML-only clipboard transport', async () => {
    const { editor } = fixture(), data = await copy(editor, selection('a1', 1, 'a1', 3));
    editor.updateSelection(selection('x1', 1));
    expect(await editor.executeCommand('paste', { clipboardHtml: data.get('text/html'), clipboardText: data.get('text/plain') })).toBe(true);
    expect(text(editor, 'x')).toBe('1bc2');
  });
  it('uses copyBlocks and the browser clipboard API to keep whole blocks closed', async () => {
    const clipboard = memoryClipboard(), { editor } = fixture();
    expect(await editor.executeCommand('copyBlocks', { nodeIds: ['a'] })).toBe(true);
    expect(clipboard.write).toHaveBeenCalledOnce();
    editor.updateSelection(selection('x1', 1));
    expect(await editor.executeCommand('paste')).toBe(true);
    expect(bodies(editor)).toEqual(['abcd', 'efgh', '1', 'abcd', '2', '34']);
  });
  it('round-trips multiple paragraphs and replaces a sibling range with exact boundaries', async () => {
    const { editor } = fixture(), data = await copy(editor, selection('a1', 1, 'b1', 2));
    editor.updateSelection(selection('x1', 1, 'y1', 1));
    const before = snapshot(editor);
    expect(await editor.executeCommand('paste', { clipboardHtml: data.get('text/html') })).toBe(true);
    expect(bodies(editor)).toEqual(['abcd', 'efgh', '1bcd', 'ef4']);
    const after = snapshot(editor);
    expect(await editor.undo()).toBe(true); expect(snapshot(editor)).toEqual(before);
    expect(await editor.redo()).toBe(true); expect(snapshot(editor)).toEqual(after);
  });
  it('replaces a range across several text runs without dropping surrounding runs', async () => {
    const { editor } = fixture();
    editor.dataStore.content.addChild('x', { sid: 'x2', stype: 'glyph', text: '56' });
    const data = await copy(editor, selection('a1', 1, 'a1', 2));
    editor.updateSelection(selection('x1', 1, 'x2', 1));
    expect(await editor.executeCommand('paste', { clipboardHtml: data.get('text/html') })).toBe(true);
    expect(text(editor, 'x')).toBe('1b6');
    expect(editor.dataStore.getNode('x2')?.text).toBe('6');
  });
  it('does not bypass a reject rule by falling back to the visible HTML or text', async () => {
    const { editor, editing } = fixture(), data = await copy(editor, selection('a1', 0, 'a1', 4));
    editing.configure({ rules: [defineEditingRule({ id: 'body.no-join', match: { sourceType: 'body', targetType: 'body', boundary: 'open', attributes: 'any' }, effect: 'reject', reason: 'Body joins disabled' })] });
    editor.updateSelection(selection('x1', 1)); const before = snapshot(editor);
    const plans: unknown[] = []; editor.on('editor:clipboard.plan', (event: unknown) => plans.push(event));
    expect(await editor.executeCommand('paste', { clipboardHtml: data.get('text/html'), clipboardText: 'abcd' })).toBe(false);
    expect(snapshot(editor)).toEqual(before); expect(editor.getHistoryStats().totalEntries).toBe(0);
    expect(plans).toContainEqual(expect.objectContaining({ ok: false, reason: 'Body joins disabled' }));
  });
  it('refuses equal type names from a different schema without an explicit adapter', async () => {
    const source = fixture(), target = fixture(), data = await copy(source.editor, selection('a1', 0, 'a1', 4));
    target.editor.updateSelection(selection('x1', 1)); const before = snapshot(target.editor);
    expect(await target.editor.executeCommand('paste', { clipboardHtml: data.get('text/html') })).toBe(false);
    expect(snapshot(target.editor)).toEqual(before);
  });
  it.each(['selection', 'document', 'policy', 'schema', 'read-only', 'unrelated-write'] as const)('refuses an asynchronous clipboard result after a %s change', async change => {
    const clipboard = memoryClipboard(), { editor, editing } = fixture();
    expect(await editor.executeCommand('copyBlocks', { nodeIds: ['a'] })).toBe(true);
    editor.updateSelection(selection('x1', 1));
    let finish!: (value: ReturnType<typeof clipboard.get>) => void;
    clipboard.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = editor.executeCommand('paste');
    if (change === 'selection') editor.updateSelection(selection('y1', 1));
    if (change === 'document') editor.dataStore.restoreFromSnapshot(structuredClone(editor.dataStore.getNodes()), editor.getRootId()!);
    if (change === 'policy') editing.configure({});
    if (change === 'schema') editor.dataStore.getActiveSchema()!.getNodeType('body')!.code = true;
    if (change === 'read-only') editor.setEditable(false);
    if (change === 'unrelated-write') editor.dataStore.updateNode('b1', { text: 'changed elsewhere' }, false);
    const before = snapshot(editor), beforeSelection = structuredClone(editor.selection);
    finish(clipboard.get()); expect(await pending).toBe(false);
    expect(snapshot(editor)).toEqual(before); expect(editor.selection).toEqual(beforeSelection);
    expect(editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('rejects unsupported datastore metadata in a clipboard fragment', async () => {
    const { editor } = fixture(), data = await copy(editor, selection('a1', 1, 'a1', 3));
    const input = JSON.parse(data.get(FRAGMENT_CLIPBOARD_TYPE)!);
    input.content[0].metadata = { owner: 'foreign' };
    editor.updateSelection(selection('x1', 1)); const before = snapshot(editor);
    expect(await editor.executeCommand('paste', { clipboardFragment: JSON.stringify(input) })).toBe(false);
    expect(snapshot(editor)).toEqual(before); expect(editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('rejects duplicate source identities before allocating destination IDs', async () => {
    const { editor } = fixture();
    editor.dataStore.content.addChild('a', { sid: 'a2', stype: 'glyph', text: 'EF' });
    const data = await copy(editor, selection('a1', 1, 'a2', 1));
    const fragment = decodeClipboardFragment(data.get(FRAGMENT_CLIPBOARD_TYPE)!);
    fragment.content[0].content![1].sourceId = fragment.content[0].content![0].sourceId;
    editor.updateSelection(selection('x1', 1)); const before = snapshot(editor);
    const allocate = vi.spyOn(editor.dataStore, 'generateId');
    expect(await editor.executeCommand('paste', { clipboardFragment: JSON.stringify(fragment) })).toBe(false);
    expect(snapshot(editor)).toEqual(before); expect(allocate).not.toHaveBeenCalled();
    allocate.mockRestore();
  });
  it('rejects malformed metadata even if a readable fallback is present', async () => {
    const { editor } = fixture(); editor.updateSelection(selection('x1', 1));
    const before = snapshot(editor);
    expect(await editor.executeCommand('paste', { clipboardFragment: '{broken', clipboardText: 'fallback' })).toBe(false);
    expect(await editor.executeCommand('paste', { clipboardHtml: '<div data-wonffice-fragment="%">fallback</div>' })).toBe(false);
    expect(snapshot(editor)).toEqual(before);
  });
});


describe('clipboard policy boundaries', () => {
  it('imports plain text and blank lines using destination schema types', async () => {
    const { editor } = fixture(); editor.updateSelection(selection('x1', 1));
    const before = snapshot(editor);
    expect(await editor.executeCommand('paste', { clipboardText: 'A\r\n\r\nB' })).toBe(true);
    expect(bodies(editor)).toEqual(['abcd', 'efgh', '1A', '', 'B2', '34']);
    expect(editor.dataStore.getAllNodes().every(node => ['document', 'body', 'glyph'].includes(node.stype))).toBe(true);
    const after = snapshot(editor);
    expect(await editor.undo()).toBe(true); expect(snapshot(editor)).toEqual(before);
    expect(await editor.redo()).toBe(true); expect(snapshot(editor)).toEqual(after);
  });
  it('uses schema code semantics for literal multiline text without fixed node names', async () => {
    const { editor } = fixture();
    editor.dataStore.getActiveSchema()!.getNodeType('body')!.code = true;
    editor.updateSelection(selection('x1', 1));
    expect(await editor.executeCommand('paste', { clipboardText: '# Header\n\n\t- item', clipboardHtml: '<h1>Header</h1>' })).toBe(true);
    expect(text(editor, 'x')).toBe('1# Header\n\n\t- item2');
    expect(bodies(editor)).toHaveLength(4);
  });
  it('reports formatting loss when a code-region policy selects literal import', async () => {
    const { editor } = fixture();
    editor.dataStore.getActiveSchema()!.nodes.set('codeBody', { name: 'codeBody', group: 'block', content: 'inline*', code: true });
    editor.dataStore.getActiveSchema()!.getNodeType('document')!.content = 'block+';
    editor.dataStore.setNode({ ...editor.dataStore.getNode('x')!, stype: 'codeBody' }, false);
    const data = await copy(editor, selection('a1', 1, 'a1', 3));
    editor.updateSelection(selection('x1', 1));
    const plans: unknown[] = []; editor.on('editor:clipboard.plan', (value: unknown) => plans.push(value));
    expect(await editor.executeCommand('paste', { clipboardHtml: data.get('text/html'), clipboardText: 'bc' })).toBe(true);
    expect(text(editor, 'x')).toBe('1bc2');
    expect(plans[0]).toMatchObject({ ok: true, plan: { outcome: 'converted', losses: expect.arrayContaining([expect.objectContaining({ kind: 'mark' })]) } });
    expect(editor.dataStore.getAllNodes().find(node => node.text === 'bc')?.marks ?? []).toEqual([]);
  });
  it('requires a declared portable contract to copy between different schema instances', async () => {
    const source = fixture(), target = fixture();
    source.editing.configure({ schemaId: 'acme/body', schemaRevision: '1' });
    target.editing.configure({ schemaId: 'acme/body', schemaRevision: '1' });
    const data = await copy(source.editor, selection('a1', 1, 'a1', 3));
    target.editor.updateSelection(selection('x1', 1));
    expect(await target.editor.executeCommand('paste', { clipboardHtml: data.get('text/html') })).toBe(true);
    expect(text(target.editor, 'x')).toBe('1bc2');
    target.editing.configure({ schemaId: 'acme/body', schemaRevision: '2' });
    const before = snapshot(target.editor);
    expect(await target.editor.executeCommand('paste', { clipboardHtml: data.get('text/html') })).toBe(false);
    expect(snapshot(target.editor)).toEqual(before);
  });
  it('keeps HTML metadata when the browser refuses custom MIME', async () => {
    const { editor } = fixture(), data = new Map<string, string>();
    expect(await editor.executeCommand('copy', {
      selection: selection('a1', 0, 'a1', 2),
      clipboardData: { setData(type: string, value: string) { if (type === FRAGMENT_CLIPBOARD_TYPE) throw new Error('Unsupported MIME'); data.set(type, value); } }
    })).toBe(true);
    editor.updateSelection(selection('x1', 1));
    expect(await editor.executeCommand('paste', { clipboardHtml: data.get('text/html') })).toBe(true);
    expect(text(editor, 'x')).toBe('1ab2');
  });
  it('remaps internal references through the clipboard and restores IDs on undo/redo', async () => {
    const { editor, editing } = fixture();
    editor.dataStore.getActiveSchema()!.nodes.set('pointer', { name: 'pointer', group: 'inline', atom: true, attrs: { dest: { type: 'string', required: true } } });
    editing.configure({ references: { pointer: { dest: { kind: 'node', outside: 'same-document' } } } });
    editor.dataStore.content.addChild('a', { sid: 'ref', stype: 'pointer', attributes: { dest: 'a1' } });
    editor.dataStore.content.addChild('a', { sid: 'a2', stype: 'glyph', text: 'END' });
    const data = await copy(editor, selection('a1', 1, 'a2', 2));
    editor.updateSelection(selection('x1', 1)); const before = snapshot(editor);
    expect(await editor.executeCommand('paste', { clipboardHtml: data.get('text/html') })).toBe(true);
    const inserted = editor.dataStore.getNode('x')!.content as string[];
    const pointer = inserted.map(id => editor.dataStore.getNode(id)!).find(node => node.stype === 'pointer')!;
    expect(pointer.attributes?.dest).toBe(inserted[1]); expect(pointer.attributes?.dest).not.toBe('a1');
    expect(editor.selection).toMatchObject({ startNodeId: inserted[3], startOffset: 2 });
    const after = snapshot(editor);
    expect(await editor.undo()).toBe(true); expect(snapshot(editor)).toEqual(before);
    expect(await editor.redo()).toBe(true); expect(snapshot(editor)).toEqual(after);
  });
  it.each(['isolating', 'required-order', 'incompatible-target'] as const)('rejects %s without changing selection or history', async kind => {
    const { editor } = fixture(), schema = editor.dataStore.getActiveSchema()!;
    if (kind === 'isolating') schema.getNodeType('body')!.isolating = true;
    if (kind === 'required-order') {
      schema.getNodeType('document')!.content = 'block+';
      schema.nodes.set('section', { name: 'section', group: 'block', content: 'caption body+' });
      schema.nodes.set('caption', { name: 'caption', content: 'inline*' });
      editor.loadDocument({ stype: 'document', content: [
        { stype: 'body', content: [{ sid: 'x1', stype: 'glyph', text: '12' }] },
        { stype: 'section', content: [{ stype: 'caption', content: [{ sid: 'a1', stype: 'glyph', text: 'AB' }] }, { stype: 'body', content: [{ stype: 'glyph', text: 'tail' }] }] }
      ] });
    }
    if (kind === 'incompatible-target') {
      schema.nodes.set('other', { name: 'other', group: 'block', content: 'inline*' });
      schema.getNodeType('document')!.content = 'block+';
      editor.dataStore.setNode({ ...editor.dataStore.getNode('y')!, stype: 'other' }, false);
    }
    const data = await copy(editor, selection('a1', 0, 'a1', 2));
    editor.updateSelection(kind === 'incompatible-target' ? selection('x1', 1, 'y1', 1) : selection('x1', 1));
    const before = snapshot(editor), selected = structuredClone(editor.selection);
    expect(await editor.executeCommand('paste', { clipboardHtml: data.get('text/html') })).toBe(false);
    expect(snapshot(editor)).toEqual(before); expect(editor.selection).toEqual(selected); expect(editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('rechecks after plan observers and leaves a rejected edit out of history', async () => {
    const { editor } = fixture(), data = await copy(editor, selection('a1', 1, 'a1', 2));
    editor.updateSelection(selection('x1', 1));
    editor.on('editor:clipboard.plan', () => editor.dataStore.updateNode('b1', { text: 'observer changed' }, false));
    expect(await editor.executeCommand('paste', { clipboardHtml: data.get('text/html') })).toBe(false);
    expect(text(editor, 'x')).toBe('12'); expect(text(editor, 'b')).toBe('observer changed');
    expect(editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('allows copy but refuses cut and paste in a read-only editor', async () => {
    const { editor } = fixture(); editor.updateSelection(selection('a1', 1, 'a1', 2)); editor.setEditable(false);
    const before = snapshot(editor), data = await copy(editor, editor.selection!);
    expect(await editor.executeCommand('cut', { clipboardData: { setData: vi.fn() } })).toBe(false);
    expect(await editor.executeCommand('paste', { clipboardHtml: data.get('text/html') })).toBe(false);
    expect(snapshot(editor)).toEqual(before);
  });
  it('keeps custom policies in place and requires an explicit adapter for metadata-free rich nodes', async () => {
    const { editor, editing } = fixture(); editor.updateSelection(selection('x1', 1));
    expect(await editor.executeCommand('paste', { nodes: [{ stype: 'glyph', text: 'custom' }] })).toBe(false);
    editing.configure(standardClipboardPolicy(type => editor.dataStore.getActiveSchema()!.hasNodeType(type)));
    expect(await editor.executeCommand('paste', { nodes: [{ stype: 'glyph', text: 'custom' }] })).toBe(false);
    expect(text(editor, 'x')).toBe('12');
  });
});
