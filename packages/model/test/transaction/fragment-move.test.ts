// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { FragmentEditor, defineEditingRule, type EditingDecision, type EditingPlan, type EditingSource, type EditingTarget } from '../../src/editing';
const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));
function fixture() {
  const schema = new Schema('move-fixture', { topNode: 'document', nodes: {
    document: { name: 'document', content: 'block+' }, body: { name: 'body', group: 'block', content: 'inline*' },
    group: { name: 'group', group: 'block', content: 'title body+' }, title: { name: 'title', content: 'inline*' },
    glyph: { name: 'glyph', group: 'inline' }, pointer: { name: 'pointer', group: 'inline', atom: true, attrs: { to: { type: 'string', required: true } } },
  }, marks: { strong: { name: 'strong' } } });
  const editor = new Editor({ schema }); editors.push(editor);
  editor.loadDocument({ stype: 'document', content: ['a', 'b', 'c', 'd'].map(id => ({ sid: id, stype: 'body', content: [{ sid: id + 't', stype: 'glyph', text: 'ABCDEF', marks: [{ stype: 'strong', range: [1, 3] }] }] })) });
  editor.updateSelection({ type: 'range', startNodeId: 'at', startOffset: 1, endNodeId: 'at', endOffset: 3, collapsed: false });
  const editing = new FragmentEditor(editor, { references: { pointer: { to: { kind: 'node', outside: 'same-document' } } } });
  return { editor, editing, schema, root: editor.getRootId()! };
}
const snapshot = (editor: Editor) => structuredClone(editor.dataStore.getAllNodes().sort((a, b) => a.sid!.localeCompare(b.sid!)));
const text = (editor: Editor, id: string): string => { const node = editor.dataStore.getNode(id)!; return node.text ?? (node.content as string[]).map(id => text(editor, id)).join(''); };
const accepted = (decision: EditingDecision): EditingPlan => { expect(decision).toMatchObject({ ok: true }); if (!decision.ok) throw new Error(decision.reason); return decision.plan; };
function plan(f: ReturnType<typeof fixture>, source: EditingSource, target: EditingTarget) {
  return f.editing.plan({ intent: 'move', source, target, fragment: source.kind === 'nodes' ? f.editing.captureNodes(source.nodeIds, false) : f.editing.captureText(source.nodeId, source.from, source.to) });
}
async function roundtrip(f: ReturnType<typeof fixture>, value: EditingPlan) {
  const before = snapshot(f.editor), selection = structuredClone(f.editor.selection);
  expect((await f.editing.apply(value)).committed).toBe(true);
  const after = snapshot(f.editor), caret = structuredClone(f.editor.selection);
  expect(await f.editor.undo()).toBe(true); expect(snapshot(f.editor)).toEqual(before); expect(f.editor.selection).toEqual(selection);
  expect(await f.editor.redo()).toBe(true); expect(snapshot(f.editor)).toEqual(after); expect(f.editor.selection).toEqual(caret);
  expect(f.editor.getHistoryStats().totalEntries).toBe(1);
}
describe('local fragment moves', () => {
  it.each([[['a'], 4, ['b','c','d','a']], [['c'], 0, ['c','a','b','d']], [['a','c'], 4, ['b','d','a','c']]] as const)('moves %j at original gap %i and restores exact noncontiguous order', async (ids, index, expected) => {
    const f = fixture(); f.editor.dataStore.setNode({ ...f.editor.dataStore.getNode('a')!, metadata: { owner: 'local' } });
    const before = snapshot(f.editor), allocate = vi.spyOn(f.editor.dataStore, 'generateId');
    const value = accepted(plan(f, { kind: 'nodes', nodeIds: [...ids] }, { kind: 'children', parentId: f.root, index }));
    expect(snapshot(f.editor)).toEqual(before); expect(allocate).not.toHaveBeenCalled();
    await roundtrip(f, value);
    expect(f.editor.dataStore.getNode(f.root)?.content).toEqual(expected); expect(allocate).not.toHaveBeenCalled();
    expect(f.editor.dataStore.getNode('a')?.metadata).toEqual({ owner: 'local' });
  });
  it('moves across parents while preserving internal and incoming references', async () => {
    const f = fixture();
    f.editor.dataStore.content.addChild('a', { sid: 'p', stype: 'pointer', attributes: { to: 'at' } });
    f.editor.dataStore.content.addChild(f.root, { sid: 'g', stype: 'group', content: [{ sid: 'title', stype: 'title', content: [] }, { sid: 'e', stype: 'body', content: [] }] });
    const value = accepted(plan(f, { kind: 'nodes', nodeIds: ['a'] }, { kind: 'children', parentId: 'g', index: 1 }));
    await roundtrip(f, value);
    expect(f.editor.dataStore.getNode('a')?.parentId).toBe('g'); expect(f.editor.dataStore.getNode('p')?.attributes?.to).toBe('at');
  });
  it.each([0,1,2])('makes an unchanged contiguous move a noop at gap %i', async index => {
    const f = fixture(), before = snapshot(f.editor), selection = structuredClone(f.editor.selection);
    const value = accepted(plan(f, { kind: 'nodes', nodeIds: ['a','b'] }, { kind: 'children', parentId: f.root, index }));
    expect(value.noop).toBe(true); expect((await f.editing.apply(value)).success).toBe(true);
    expect(snapshot(f.editor)).toEqual(before); expect(f.editor.selection).toEqual(selection); expect(f.editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('refuses cycles, required-child destruction, isolation, and policy rejection', () => {
    const f = fixture();
    f.editor.dataStore.content.addChild(f.root, { sid: 'g', stype: 'group', content: [{ sid: 'title', stype: 'title', content: [] }, { sid: 'e', stype: 'body', content: [] }] });
    expect(plan(f, { kind: 'nodes', nodeIds: ['g'] }, { kind: 'children', parentId: 'e', index: 0 }).ok).toBe(false);
    expect(plan(f, { kind: 'nodes', nodeIds: ['e'] }, { kind: 'children', parentId: f.root, index: 0 }).ok).toBe(false);
    f.schema.getNodeType('group')!.isolating = true;
    expect(plan(f, { kind: 'nodes', nodeIds: ['a'] }, { kind: 'children', parentId: 'g', index: 1 }).ok).toBe(false);
    f.editing.configure({ rules: [defineEditingRule({ id: 'reject', match: { sourceType: '*', targetType: '*', boundary: 'closed', attributes: 'any' }, effect: 'reject', reason: 'Moves disabled' })] });
    expect(plan(f, { kind: 'nodes', nodeIds: ['a'] }, { kind: 'children', parentId: f.root, index: 4 }).ok).toBe(false);
  });
  it.each([[0,'BCADEF'],[6,'ADEFBC']] as const)('moves a marked range within one run at offset %i', async (at, expected) => {
    const f = fixture(); const value = accepted(plan(f, { kind: 'text', nodeId: 'at', from: 1, to: 3 }, { kind: 'text', nodeId: 'at', from: at, to: at }));
    await roundtrip(f, value); expect(text(f.editor, 'a')).toBe(expected);
    const node = f.editor.dataStore.getNode(f.editor.selection!.startNodeId)!;
    expect(node.marks).toEqual([{ stype: 'strong', range: [0,2] }]); expect(f.editor.selection!.startOffset).toBe(2);
  });
  it('moves a marked range between text containers and keeps the remaining source identity', async () => {
    const f = fixture(); const value = accepted(plan(f, { kind: 'text', nodeId: 'at', from: 1, to: 3 }, { kind: 'text', nodeId: 'bt', from: 2, to: 2 }));
    await roundtrip(f, value); expect(text(f.editor, 'a')).toBe('ADEF'); expect(text(f.editor, 'b')).toBe('ABBCCDEF'); expect(f.editor.dataStore.getNode('at')?.text).toBe('ADEF');
  });
  it('keeps same-parent source and destination runs distinct', async () => {
    const f = fixture(); f.editor.dataStore.content.addChild('a', { sid: 'a2', stype: 'glyph', text: 'xy' });
    const value = accepted(plan(f, { kind: 'text', nodeId: 'at', from: 1, to: 3 }, { kind: 'text', nodeId: 'a2', from: 1, to: 1 }));
    await roundtrip(f, value); expect(text(f.editor, 'a')).toBe('ADEFxBCy');
  });
  it('refuses stale application including an otherwise unchanged move', async () => {
    const f = fixture(); const value = accepted(plan(f, { kind: 'nodes', nodeIds: ['a'] }, { kind: 'children', parentId: f.root, index: 0 }));
    f.editor.dataStore.updateNode('bt', { text: 'changed' }); const before = snapshot(f.editor);
    expect((await f.editing.apply(value)).success).toBe(false); expect(snapshot(f.editor)).toEqual(before); expect(f.editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('restores both source and destination if application fails after writes begin', async () => {
    const f = fixture(); const value = accepted(plan(f, { kind: 'nodes', nodeIds: ['a','c'] }, { kind: 'children', parentId: f.root, index: 4 }));
    const before = snapshot(f.editor), selection = structuredClone(f.editor.selection), add = f.editor.dataStore.content.addChild.bind(f.editor.dataStore.content);
    vi.spyOn(f.editor.dataStore.content, 'addChild').mockImplementationOnce((...args) => { add(...args); throw new Error('injected'); });
    expect((await f.editing.apply(value)).committed).toBe(false); expect(snapshot(f.editor)).toEqual(before); expect(f.editor.selection).toEqual(selection); expect(f.editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('refuses a noop issued by a replaced policy owner', async () => {
    const f=fixture(); const value=accepted(plan(f,{kind:'nodes',nodeIds:['a']},{kind:'children',parentId:f.root,index:0}));
    new FragmentEditor(f.editor);
    expect((await f.editing.apply(value)).success).toBe(false);expect(f.editor.getHistoryStats().totalEntries).toBe(0);
  });

});
