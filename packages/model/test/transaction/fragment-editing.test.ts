import { describe, expect, it, vi } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { HistoryManager, SelectionManager, type Editor, type ModelSelection } from '@barocss/editor-core';
import { FragmentEditor, defineEditingPolicy, defineEditingRule, type EditingDecision, type EditingPlan, type EditingPolicy, type EditingRule } from '../../src/editing';
import { TransactionManager } from '../../src/transaction';
import '../../src/operations/register-operations';

function makeSchema(isolating = false) {
  return new Schema('custom-flow', { topNode: 'book', nodes: {
    book: { name: 'book', content: 'block+' },
    prose: { name: 'prose', group: 'block', content: 'inline*' },
    section: { name: 'section', group: 'block', content: 'caption prose+', isolating },
    caption: { name: 'caption', content: 'inline*' },
    glyph: { name: 'glyph', group: 'inline' },
    pointer: { name: 'pointer', group: 'inline', atom: true, attrs: { dest: { type: 'string', required: true } } },
    citation: { name: 'citation', group: 'inline', atom: true, attrs: { url: { type: 'string', required: true } } }
  }, marks: { strong: { name: 'strong' } } });
}
const policies: EditingPolicy = { references: {
  pointer: { dest: { kind: 'node', outside: 'same-document' } },
  citation: { url: { kind: 'external', outside: 'preserve' } }
} };
function fixture(schema = makeSchema(), policy: EditingPolicy = policies) {
  const dataStore = new DataStore(undefined, schema);
  dataStore.createNodeWithChildren({ sid: 'doc', stype: 'book', content: [
    { sid: 'section', stype: 'section', content: [
      { sid: 'caption', stype: 'caption', content: [{ sid: 'ct', stype: 'glyph', text: 'Title' }] },
      { sid: 'source', stype: 'prose', content: [{ sid: 's', stype: 'glyph', text: 'ABCD', marks: [{ stype: 'strong', range: [1, 3] }] }] }
    ] },
    { sid: 'target', stype: 'prose', content: [{ sid: 't', stype: 'glyph', text: 'xy' }] }
  ] });
  dataStore.setRootNodeId('doc');
  const selectionManager = new SelectionManager({ dataStore });
  selectionManager.setSelection({ type: 'range', collapsed: true, startNodeId: 't', endNodeId: 't', startOffset: 1, endOffset: 1 });
  const historyManager = new HistoryManager({ coalesceMs: 0 });
  const editor = {
    dataStore, selectionManager, historyManager,
    get selection() { return selectionManager.getCurrentSelection(); },
    getSortedExtensions: () => [],
    emit: vi.fn(),
    updateSelection: (selection: ModelSelection | null) => selectionManager.setSelection(selection)
  } as unknown as Editor;
  const editing = new FragmentEditor(editor, policy);
  const observed = vi.fn(); dataStore.onOperation(observed);
  return { dataStore, editor, editing, observed, schema };
}
function accepted(decision: EditingDecision): EditingPlan {
  expect(decision, decision.ok ? '' : decision.reason).toMatchObject({ ok: true });
  if (!decision.ok) throw new Error(decision.reason);
  return decision.plan;
}
function plain(store: DataStore, id: string): string {
  const node = store.getNode(id)!;
  return node.text ?? (node.content ?? []).map(child => plain(store, child as string)).join('');
}
function snapshot(store: DataStore) { return structuredClone(store.getAllNodes().sort((a, b) => a.sid!.localeCompare(b.sid!))); }
function textPlan(f: ReturnType<typeof fixture>) {
  return accepted(f.editing.plan({ intent: 'copy', fragment: f.editing.captureText('s', 1, 3), target: { kind: 'text', nodeId: 't', from: 1, to: 1 } }));
}

describe('schema-scoped fragment editing', () => {
  it('plans without document, selection, history, event or ID allocator changes', () => {
    const f = fixture(), before = snapshot(f.dataStore), selection = structuredClone(f.editor.selection);
    const allocate = vi.spyOn(f.dataStore, 'generateId');
    const plan = textPlan(f);
    expect(plan.actions).toContain('join');
    expect(snapshot(f.dataStore)).toEqual(before);
    expect(f.editor.selection).toEqual(selection);
    expect(f.editor.historyManager.getHistory()).toHaveLength(0);
    expect(f.observed).not.toHaveBeenCalled();
    expect(allocate).not.toHaveBeenCalled();
  });
  it('preserves an open required ancestor and inserts its text and marks in one undoable edit', async () => {
    const f = fixture(), before = snapshot(f.dataStore);
    const input = f.editing.captureText('s', 1, 3);
    expect(input).toMatchObject({ selection: 'range', openStart: 2, openEnd: 2, content: [{ stype: 'section', content: [{ stype: 'prose', content: [{ text: 'BC', marks: [{ stype: 'strong', range: [0, 2] }] }] }] }] });
    expect(await f.editing.apply(textPlan(f))).toMatchObject({ success: true, committed: true });
    expect(plain(f.dataStore, 'target')).toBe('xBCy');
    expect(f.dataStore.getNode('doc')!.content).toEqual(['section', 'target']);
    const inserted = f.dataStore.getNode('target')!.content![1] as string;
    expect(f.dataStore.getNode(inserted)!.marks).toEqual([{ stype: 'strong', range: [0, 2] }]);
    expect(inserted).not.toBe('s');
    expect(f.editor.historyManager.getHistory()).toHaveLength(1);
    const after = snapshot(f.dataStore);
    const manager = new TransactionManager(f.editor); manager._isUndoRedoOperation = true;
    const undo = f.editor.historyManager.undo()!;
    f.editing.configure({});
    expect((await manager.execute(undo.inverseOperations)).success).toBe(true);
    expect(snapshot(f.dataStore)).toEqual(before);
    const redo = f.editor.historyManager.redo()!;
    const allocate = vi.spyOn(f.dataStore, 'generateId');
    expect((await manager.execute(redo.operations)).success).toBe(true);
    expect(snapshot(f.dataStore)).toEqual(after);
    expect(allocate).not.toHaveBeenCalled();
  });
  it('keeps a whole block closed and splits the target instead of joining its text', async () => {
    const f = fixture();
    const plan = accepted(f.editing.plan({ intent: 'copy', fragment: f.editing.captureNodes(['source']), target: { kind: 'text', nodeId: 't', from: 1, to: 1 } }));
    expect(plan.actions).toContain('split');
    expect((await f.editing.apply(plan)).success).toBe(true);
    const children = f.dataStore.getNode('doc')!.content as string[];
    expect(children.map(id => plain(f.dataStore, id))).toEqual(['TitleABCD', 'x', 'ABCD', 'y']);
    expect(children[1]).toBe('target');
  });
  it('distinguishes the same text selected as a range and as a whole node', async () => {
    const partial = fixture(), whole = fixture();
    const target = { kind: 'text' as const, nodeId: 't', from: 1, to: 1 };
    expect((await partial.editing.apply(accepted(partial.editing.plan({ intent: 'copy', fragment: partial.editing.captureText('s', 0, 4), target })))).success).toBe(true);
    expect((await whole.editing.apply(accepted(whole.editing.plan({ intent: 'copy', fragment: whole.editing.captureNodes(['source']), target })))).success).toBe(true);
    expect(plain(partial.dataStore, 'doc')).toBe(plain(whole.dataStore, 'doc'));
    expect(partial.dataStore.getNode('doc')!.content).toHaveLength(2);
    expect(whole.dataStore.getNode('doc')!.content).toHaveLength(4);
  });
  it('can preserve an unknown source in an explicitly registered opaque target type', async () => {
    const f = fixture();
    f.schema.nodes.set('opaque', { name: 'opaque', group: 'block', atom: true, attrs: { original: { type: 'object', required: true } } });
    const input = structuredClone(f.editing.captureNodes(['source']));
    input.origin = { format: 'foreign', schemaId: 'unknown', schemaRevision: '7' };
    f.editing.configure({ adapters: [{ format: 'foreign', schemaId: 'unknown', convert: original => ({ outcome: 'preserved', losses: [], content: { ...original, content: [{ stype: 'opaque', attributes: { original } }], references: [], resources: [], openStart: 0, openEnd: 0 } }) }] });
    const plan = accepted(f.editing.plan({ intent: 'copy', fragment: input, target: { kind: 'children', parentId: 'doc', index: 2 } }));
    expect(plan.outcome).toBe('preserved');
    expect((await f.editing.apply(plan)).success).toBe(true);
    const id = f.dataStore.getNode('doc')!.content![2] as string;
    expect(f.dataStore.getNode(id)!.attributes!.original).toEqual(input);
  });
  it('uses existing declarations for a unique default block and requires policy for ambiguity', async () => {
    const f = fixture();
    const request = { intent: 'copy' as const, fragment: f.editing.captureText('s', 1, 3), target: { kind: 'children' as const, parentId: 'section', index: 2 } };
    expect((await f.editing.apply(accepted(f.editing.plan(request)))).success).toBe(true);
    expect((f.dataStore.getNode('section')!.content as string[]).map(id => f.dataStore.getNode(id)!.stype)).toEqual(['caption', 'prose', 'prose']);
    f.schema.nodes.set('alternative', { name: 'alternative', group: 'block', content: 'inline*' });
    request.fragment = f.editing.captureText('s', 1, 3);
    expect(f.editing.plan(request)).toMatchObject({ ok: false, reason: expect.stringContaining('default block') });
    f.editing.configure({ ...policies, defaultBlock: 'prose' });
    expect(f.editing.plan(request).ok).toBe(true);
  });
  it('rejects a second caption and removal of the required first caption without changing anything', () => {
    const f = fixture(), before = snapshot(f.dataStore);
    const input = f.editing.captureNodes(['caption']);
    expect(f.editing.plan({ intent: 'copy', fragment: input, target: { kind: 'children', parentId: 'section', index: 1 } }).ok).toBe(false);
    expect(f.editing.plan({ intent: 'copy', fragment: f.editing.captureNodes(['source']), target: { kind: 'children', parentId: 'section', index: 0, deleteCount: 1 } }).ok).toBe(false);
    expect(snapshot(f.dataStore)).toEqual(before);
  });
  it('allows local text editing inside an isolated section but refuses crossing its boundary', () => {
    const f = fixture(makeSchema(true));
    const fragment = f.editing.captureText('s', 1, 3);
    expect(f.editing.plan({ intent: 'copy', fragment, target: { kind: 'text', nodeId: 't', from: 1, to: 1 } })).toMatchObject({ ok: false, reason: expect.stringContaining('isolated') });
    expect(f.editing.plan({ intent: 'copy', fragment, target: { kind: 'text', nodeId: 's', from: 0, to: 0 } }).ok).toBe(true);
  });
  it('does not confuse equal names in different schemas, and accepts an explicit conversion with reported loss', () => {
    const a = fixture(), b = fixture();
    b.schema.nodes.get('prose')!.marks = [];
    b.dataStore.updateNode('s', { marks: [] }, false);
    const foreign = a.editing.captureNodes(['source']);
    const request = { intent: 'copy' as const, fragment: foreign, target: { kind: 'children' as const, parentId: 'doc', index: 2 } };
    expect(b.editing.plan(request)).toMatchObject({ ok: false, reason: expect.stringContaining('registered conversion') });
    b.editing.configure({ adapters: [{ format: foreign.origin.format, schemaId: foreign.origin.schemaId, convert: input => {
      input.content[0].content![0].marks = [];
      return { content: input, outcome: 'converted', losses: [{ kind: 'mark', reason: 'Source emphasis has no target equivalent' }] };
    } }] });
    expect(accepted(b.editing.plan(request))).toMatchObject({ outcome: 'converted', losses: [{ kind: 'mark' }] });
  });
  it('keeps policy registrations isolated when two editors share a schema', () => {
    const schema = makeSchema(); schema.nodes.set('other', { name: 'other', group: 'block', content: 'inline*' });
    const a = fixture(schema), b = fixture(schema);
    a.editing.configure({ defaultBlock: 'prose' });
    const request = { intent: 'copy' as const, fragment: a.editing.captureText('s', 1, 3), target: { kind: 'children' as const, parentId: 'doc', index: 2 } };
    expect(a.editing.plan(request).ok).toBe(true);
    expect(b.editing.plan(request).ok).toBe(false);
  });
  it('remaps internal references, preserves declared external references, and rejects a different policy', async () => {
    const schema = makeSchema(), a = fixture(schema), b = fixture(schema);
    a.dataStore.content.addChild('source', { sid: 'ref', stype: 'pointer', attributes: { dest: 's' } });
    a.dataStore.content.addChild('source', { sid: 'url', stype: 'citation', attributes: { url: 'https://example.test/source' } });
    const fragment = a.editing.captureNodes(['source']);
    const request = { intent: 'copy' as const, fragment, target: { kind: 'children' as const, parentId: 'doc', index: 2 } };
    expect((await b.editing.apply(accepted(b.editing.plan(request)))).success).toBe(true);
    const block = b.dataStore.getNode((b.dataStore.getNode('doc')!.content as string[])[2])!;
    const [text, pointer, external] = (block.content as string[]).map(id => b.dataStore.getNode(id)!);
    expect(pointer.attributes!.dest).toBe(text.sid);
    expect(text.sid).not.toBe('s');
    expect(external.attributes!.url).toBe('https://example.test/source');
    b.editing.configure({ references: { pointer: { dest: { kind: 'external', outside: 'reject' } } } });
    expect(b.editing.plan(request).ok).toBe(false);
  });
  it('rejects an outside-fragment node reference across documents and after same-store document replacement', () => {
    const schema = makeSchema(), a = fixture(schema), b = fixture(schema);
    a.dataStore.content.addChild('source', { sid: 'ref', stype: 'pointer', attributes: { dest: 't' } });
    const fragment = a.editing.captureNodes(['source']);
    const request = { intent: 'copy' as const, fragment, target: { kind: 'children' as const, parentId: 'doc', index: 2 } };
    expect(a.editing.plan(request).ok).toBe(true);
    expect(b.editing.plan(request).ok).toBe(false);
    const saved = structuredClone(a.dataStore.getNodes());
    a.dataStore.restoreFromSnapshot(saved, 'doc');
    expect(a.editing.plan(request).ok).toBe(false);
  });
  it.each(['write', 'ABA write', 'clear restore', 'map replacement', 'delete restore', 'policy', 'schema', 'selection', 'raw mutation'] as const)('rejects a stale plan after %s', async kind => {
    const f = fixture(), plan = textPlan(f);
    if (kind === 'write') f.dataStore.updateNode('t', { text: 'changed' }, false);
    if (kind === 'ABA write') { f.dataStore.updateNode('t', { text: 'changed' }, false); f.dataStore.updateNode('t', { text: 'xy' }, false); }
    if (kind === 'clear restore') f.dataStore.restoreFromSnapshot(structuredClone(f.dataStore.getNodes()), 'doc');
    if (kind === 'map replacement') f.dataStore.setNodes(structuredClone(f.dataStore.getNodes()));
    if (kind === 'delete restore') { const saved = structuredClone(f.dataStore.getNode('t')!); f.dataStore.deleteNode('t'); f.dataStore.setNode(saved, false); }
    if (kind === 'policy') f.editing.configure(policies);
    if (kind === 'schema') f.schema.nodes.get('prose')!.isolating = true;
    if (kind === 'selection') f.editor.selectionManager.setSelection({ type: 'range', collapsed: true, startNodeId: 't', endNodeId: 't', startOffset: 0, endOffset: 0 });
    if (kind === 'raw mutation') f.dataStore.getNode('t')!.text = 'raw';
    const before = snapshot(f.dataStore), selection = structuredClone(f.editor.selection);
    f.observed.mockClear();
    expect(await f.editing.apply(plan)).toMatchObject({ success: false, committed: false, errors: [expect.stringContaining('Stale')] });
    expect(snapshot(f.dataStore)).toEqual(before);
    expect(f.editor.selection).toEqual(selection);
    expect(f.editor.historyManager.getHistory()).toHaveLength(0);
    expect(f.observed).not.toHaveBeenCalled();
  });
  it('checks the revision after waiting for the transaction lock', async () => {
    const f = fixture(), plan = textPlan(f);
    const held = await f.dataStore.acquireLock('other edit');
    const result = f.editing.apply(plan);
    f.dataStore.updateNode('t', { text: 'changed while queued' }, false);
    f.dataStore.releaseLock(held);
    expect(await result).toMatchObject({ success: false, committed: false });
    expect(plain(f.dataStore, 'target')).toBe('changed while queued');
  });
  it('rolls back a failure after source removal with no history or observer output', async () => {
    const f = fixture(), plan = textPlan(f), before = snapshot(f.dataStore);
    vi.spyOn(f.dataStore.content, 'addChild').mockImplementationOnce(() => { throw new Error('injected insert failure'); });
    expect(await f.editing.apply(plan)).toMatchObject({ success: false, committed: false });
    expect(snapshot(f.dataStore)).toEqual(before);
    expect(f.editor.historyManager.getHistory()).toHaveLength(0);
    expect(f.observed).not.toHaveBeenCalled();
  });
  it('refuses a replacement that would leave a declared reference dangling', () => {
    const f = fixture();
    f.dataStore.content.addChild('source', { sid: 'outside', stype: 'pointer', attributes: { dest: 't' } });
    const before = snapshot(f.dataStore);
    const decision = f.editing.plan({ intent: 'copy', fragment: f.editing.captureNodes(['section']), target: { kind: 'children', parentId: 'doc', index: 1, deleteCount: 1 } });
    expect(decision).toMatchObject({ ok: false, reason: expect.stringContaining('reference dangling') });
    expect(snapshot(f.dataStore)).toEqual(before);
  });
  it('validates target mark restrictions after fitting and cannot override them with policy', () => {
    const f = fixture();
    f.schema.nodes.set('plain', { name: 'plain', group: 'block', content: 'inline*', marks: [] });
    f.dataStore.setNode({ ...f.dataStore.getNode('target')!, stype: 'plain' }, false);
    expect(f.dataStore.getNode('target')!.stype).toBe('plain');
    f.editing.configure({ defaultBlock: 'plain', rules: [defineEditingRule({ id: 'plain.join', match: { sourceType: 'prose', targetType: 'plain', boundary: 'open', attributes: 'any' }, effect: 'join-inline', reason: 'Join text into plain blocks' })] });
    expect(f.editing.plan({ intent: 'copy', fragment: f.editing.captureText('s', 1, 3), target: { kind: 'text', nodeId: 't', from: 1, to: 1 } })).toMatchObject({ ok: false, reason: expect.stringContaining('Mark strong') });
  });
  it('reports source boundary attributes that a partial selection does not transfer', () => {
    const f = fixture();
    f.schema.nodes.get('section')!.attrs = { role: { type: 'string' } };
    f.dataStore.updateNode('section', { attributes: { role: 'quotation' } }, false);
    expect(textPlan(f).losses).toEqual([{ kind: 'attribute', reason: 'Open section boundary attributes are not transferred to the target' }]);
  });
  it('rejects unsupported resources and move intent explicitly', () => {
    const f = fixture(), fragment = structuredClone(f.editing.captureNodes(['source']));
    const target = { kind: 'children' as const, parentId: 'doc', index: 2 };
    expect(f.editing.plan({ intent: 'move', fragment, target }).ok).toBe(false);
    fragment.resources.push({ id: 'asset', type: 'binary', data: {} });
    expect(f.editing.plan({ intent: 'copy', fragment, target }).ok).toBe(false);
  });
});

const rule = (effect: EditingRule['effect'], overrides: Partial<EditingRule> = {}) => defineEditingRule({
  id: `prose.${effect}`, match: { sourceType: 'prose', targetType: 'prose', boundary: 'open', attributes: 'any' },
  effect, reason: `Product chooses ${effect}`, ...overrides,
});
const requestText = (f: ReturnType<typeof fixture>) => ({ intent: 'copy' as const, fragment: f.editing.captureText('s', 1, 3), target: { kind: 'text' as const, nodeId: 't', from: 1, to: 1 } });
const requestRootText = (f: ReturnType<typeof fixture>) => ({ intent: 'copy' as const, fragment: f.editing.captureText('t', 0, 1), target: { kind: 'text' as const, nodeId: 's', from: 2, to: 2 } });

describe('declarative editing rules consumed by the planner', () => {
  it('rejects by editor policy with a reason and no writes, selection, history, events or ID allocation', () => {
    const f = fixture(), before = snapshot(f.dataStore), selection = structuredClone(f.editor.selection);
    const allocate = vi.spyOn(f.dataStore, 'generateId');
    f.editing.configure(defineEditingPolicy({ ...policies, rules: [rule('reject')] }));
    expect(f.editing.plan(requestText(f))).toMatchObject({ ok: false, reason: 'Product chooses reject', trace: [{ ruleIds: ['prose.reject'], effect: 'reject', sourceType: 'prose', targetType: 'prose', boundary: 'open', targetKind: 'text' }] });
    expect(snapshot(f.dataStore)).toEqual(before);
    expect(f.editor.selection).toEqual(selection);
    expect(f.editor.historyManager.getHistory()).toHaveLength(0);
    expect(f.observed).not.toHaveBeenCalled();
    expect(allocate).not.toHaveBeenCalled();
  });
  it('preserves a valid partial block, splitting the target and retaining marks through undo/redo', async () => {
    const f = fixture(), before = snapshot(f.dataStore);
    f.editing.configure({ ...policies, rules: [rule('preserve')] });
    const plan = accepted(f.editing.plan(requestRootText(f)));
    expect(plan.trace).toMatchObject([{ ruleIds: ['prose.preserve'], effect: 'preserve' }]);
    expect(plan.actions).toEqual(['insert', 'split']);
    expect(plan.losses).toEqual([]);
    expect((await f.editing.apply(plan)).committed).toBe(true);
    const blocks = (f.dataStore.getNode('section')!.content as string[]).map(id => f.dataStore.getNode(id)!);
    expect(blocks.map(block => plain(f.dataStore, block.sid!))).toEqual(['Title', 'AB', 'x', 'CD']);
    expect(blocks.map(block => block.stype)).toEqual(['caption', 'prose', 'prose', 'prose']);
    expect(f.dataStore.getNode(blocks[1].content![0] as string)!.marks).toEqual([{ stype: 'strong', range: [1, 2] }]);
    expect(f.dataStore.getNode(blocks[3].content![0] as string)!.marks).toEqual([{ stype: 'strong', range: [0, 1] }]);
    expect(blocks[2].sid).not.toBe('target');
    const after = snapshot(f.dataStore);
    f.editing.configure({ ...policies, rules: [rule('reject')] });
    const manager = new TransactionManager(f.editor); manager._isUndoRedoOperation = true;
    expect((await manager.execute(f.editor.historyManager.undo()!.inverseOperations)).success).toBe(true);
    expect(snapshot(f.dataStore)).toEqual(before);
    const allocate = vi.spyOn(f.dataStore, 'generateId');
    expect((await manager.execute(f.editor.historyManager.redo()!.operations)).success).toBe(true);
    expect(snapshot(f.dataStore)).toEqual(after);
    expect(allocate).not.toHaveBeenCalled();
  });
  it('preserves different boundary attributes by default instead of silently joining headings', async () => {
    const f = fixture();
    f.schema.nodes.get('prose')!.attrs = { level: { type: 'number', default: 1 } };
    f.dataStore.updateNode('target', { attributes: { level: 2 } }, false);
    const plan = accepted(f.editing.plan(requestRootText(f)));
    expect(plan.trace).toMatchObject([{ ruleIds: ['builtin:preserve'], effect: 'preserve' }]);
    expect(plan.content[1]).toMatchObject({ stype: 'prose', attributes: { level: 2 }, content: [{ text: 'x' }] });
    expect(plan.losses).toEqual([]);
    expect((await f.editing.apply(plan)).committed).toBe(true);
    expect((f.dataStore.getNode('section')!.content as string[]).map(id => plain(f.dataStore, id))).toEqual(['Title', 'AB', 'x', 'CD']);
  });
  it('compares effective default attributes and nested values without depending on key order', () => {
    const f = fixture();
    f.schema.nodes.get('prose')!.attrs = { level: { type: 'number', default: 1 }, style: { type: 'object' } };
    f.dataStore.updateNode('source', { attributes: { style: { a: 1, b: [2, 3] } } }, false);
    f.dataStore.updateNode('target', { attributes: { level: 1, style: { b: [2, 3], a: 1 } } }, false);
    f.editing.configure({ ...policies, rules: [rule('join-inline', { match: { sourceType: 'prose', targetType: 'prose', boundary: 'open', attributes: 'equal' } })] });
    expect(textPlan(f)).toMatchObject({ trace: [{ ruleIds: ['prose.join-inline'] }], actions: ['insert', 'join'], losses: [] });
  });
  it('reports loss of an implicit source attribute when an explicit rule joins different values', () => {
    const f = fixture();
    f.schema.nodes.get('prose')!.attrs = { level: { type: 'number', default: 1 } };
    f.dataStore.updateNode('target', { attributes: { level: 2 } }, false);
    f.editing.configure({ ...policies, rules: [rule('join-inline')] });
    expect(textPlan(f).losses).toEqual([{ kind: 'attribute', reason: 'Open prose boundary attributes are not transferred to the target' }]);
  });
  it.each([
    { source: [1, 2], target: [2, 1] },
    { source: Array(2), target: [] },
  ])('preserves different array-valued boundary semantics: %j', ({ source, target }) => {
    const f = fixture();
    f.schema.nodes.get('prose')!.attrs = { style: { type: 'object' } };
    f.dataStore.updateNode('source', { attributes: { style: { numbering: source } } }, false);
    f.dataStore.updateNode('target', { attributes: { style: { numbering: target } } }, false);
    const plan = accepted(f.editing.plan(requestRootText(f)));
    expect(plan.trace).toMatchObject([{ ruleIds: ['builtin:preserve'] }]);
    expect(plan.content[1].attributes).toEqual({ style: { numbering: target } });
  });
  it('permits an explicit cross-type join while reporting structure and attribute loss', async () => {
    const f = fixture();
    f.schema.nodes.set('aside', { name: 'aside', group: 'block', content: 'inline*', attrs: { tone: { type: 'string' } } });
    f.dataStore.setNode({ ...f.dataStore.getNode('target')!, stype: 'aside', attributes: { tone: 'note' } }, false);
    const request = requestRootText(f);
    expect(f.editing.plan(request).ok).toBe(false); // section allows prose, not aside.
    f.editing.configure({ ...policies, rules: [rule('join-inline', { id: 'aside.to-prose', match: { sourceType: 'aside', targetType: 'prose', boundary: 'open', attributes: 'any' } })] });
    const plan = accepted(f.editing.plan(request));
    expect(plan.losses).toEqual([
      { kind: 'structure', reason: 'Open aside content is joined into prose' },
      { kind: 'attribute', reason: 'Open aside boundary attributes are not transferred to the target' },
    ]);
    expect((await f.editing.apply(plan)).committed).toBe(true);
    expect(plain(f.dataStore, 'source')).toBe('ABxCD');
    expect(f.dataStore.getNode('source')!.stype).toBe('prose');
    expect(f.dataStore.getNode('target')!.attributes).toEqual({ tone: 'note' });
  });
  it('rejects conflicting top-priority rules in either registration order', () => {
    const f = fixture(), rules = [rule('join-inline'), rule('preserve')];
    const request = requestText(f), before = snapshot(f.dataStore);
    f.editing.configure({ ...policies, rules });
    const first = f.editing.plan(request);
    f.editing.configure({ ...policies, rules: [...rules].reverse() });
    expect(f.editing.plan(request)).toEqual(first);
    expect(first).toMatchObject({ ok: false, reason: expect.stringContaining('Conflicting editing rules'), trace: [{ ruleIds: ['prose.join-inline', 'prose.preserve'], effect: 'reject' }] });
    expect(snapshot(f.dataStore)).toEqual(before);
  });
  it('uses explicit priority rather than source specificity and records all equivalent winners', () => {
    const f = fixture();
    f.editing.configure({ ...policies, rules: [rule('preserve'), rule('join-inline', { id: 'b', priority: 10 }), rule('join-inline', { id: 'a', priority: 10, match: { sourceType: '*', targetType: '*', boundary: 'open', attributes: 'equal' } })] });
    expect(textPlan(f).trace).toMatchObject([{ ruleIds: ['a', 'b'], effect: 'join-inline' }]);
  });
  it('keeps registrations isolated across editors sharing a schema', () => {
    const schema = makeSchema(), a = fixture(schema), b = fixture(schema);
    a.editing.configure({ ...policies, rules: [rule('reject')] });
    expect(a.editing.plan(requestText(a)).ok).toBe(false);
    expect(textPlan(b).trace).toMatchObject([{ ruleIds: ['builtin:join-inline'] }]);
  });
  it('uses the effective wrapper as the target for child insertion rules', () => {
    const f = fixture();
    f.editing.configure({ ...policies, rules: [rule('reject', { match: { sourceType: 'prose', targetType: 'prose', boundary: 'open', attributes: 'any', targetKind: 'children' } })] });
    expect(f.editing.plan({ intent: 'copy', fragment: f.editing.captureText('s', 1, 3), target: { kind: 'children', parentId: 'section', index: 2 } })).toMatchObject({ ok: false, trace: [{ targetKind: 'children', targetType: 'prose', ruleIds: ['prose.reject'] }] });
    expect(f.editing.plan(requestText(f)).ok).toBe(true);
  });
  it('checks every closed node and keeps whole-node copy separate from open joins', () => {
    const f = fixture();
    f.editing.configure({ ...policies, rules: [rule('reject')] });
    expect(f.editing.plan({ intent: 'copy', fragment: f.editing.captureNodes(['source']), target: { kind: 'text', nodeId: 't', from: 1, to: 1 } }).ok).toBe(true);
    f.editing.configure({ ...policies, rules: [rule('reject', { match: { sourceType: 'prose', targetType: 'book', boundary: 'closed', attributes: 'any' } })] });
    expect(f.editing.plan({ intent: 'copy', fragment: f.editing.captureNodes(['section', 'target']), target: { kind: 'children', parentId: 'doc', index: 2 } })).toMatchObject({ ok: false, trace: [{ sourceType: 'section', effect: 'preserve' }, { sourceType: 'prose', effect: 'reject' }] });
  });
  it('applies open rules to bare inline ranges in child insertion instead of treating them as closed nodes', () => {
    const f = fixture(), fragment = structuredClone(f.editing.captureText('s', 1, 3));
    fragment.content = fragment.content[0].content![0].content!;
    fragment.openStart = fragment.openEnd = 0;
    const request = { intent: 'copy' as const, fragment, target: { kind: 'children' as const, parentId: 'target', index: 1 } };
    const plan = accepted(f.editing.plan(request));
    expect(plan.trace).toMatchObject([{ sourceType: 'glyph', targetType: 'prose', boundary: 'open', effect: 'join-inline' }]);
    f.editing.configure({ ...policies, rules: [rule('reject', { match: { sourceType: 'glyph', targetType: 'prose', boundary: 'open', attributes: 'any' } })] });
    expect(f.editing.plan(request)).toMatchObject({ ok: false, trace: [{ ruleIds: ['prose.reject'] }] });
  });
  it('cannot authorize opening an isolating boundary or discarding a declared reference endpoint', () => {
    const f = fixture(makeSchema(true));
    f.editing.configure({ ...policies, rules: [rule('join-inline')] });
    expect(f.editing.plan(requestText(f))).toMatchObject({ ok: false, reason: expect.stringContaining('isolated') });
    f.schema.nodes.get('section')!.isolating = false;
    f.schema.nodes.get('prose')!.attrs = { dest: { type: 'string' } };
    f.dataStore.updateNode('source', { attributes: { dest: 't' } }, false);
    f.editing.configure({ ...policies, references: { ...policies.references, prose: { dest: { kind: 'node', outside: 'same-document' } } }, rules: [rule('join-inline')] });
    expect(f.editing.plan(requestText(f))).toMatchObject({ ok: false, reason: expect.stringContaining('reference endpoint'), trace: [{ ruleIds: ['prose.join-inline'] }] });
  });
  it('refuses to manufacture missing children when a rule requests structure preservation', () => {
    const f = fixture(), before = snapshot(f.dataStore);
    f.editing.configure({ ...policies, rules: [rule('preserve')] });
    expect(f.editing.plan(requestText(f))).toMatchObject({ ok: false, trace: [{ effect: 'preserve' }] });
    expect(snapshot(f.dataStore)).toEqual(before); // partial section lacks its required caption.
  });
  it('copies caller configuration and changes policy atomically with stale-plan invalidation', async () => {
    const f = fixture(), original: EditingRule = { id: 'mutable', effect: 'join-inline', reason: 'Use text', match: { sourceType: 'prose', targetType: 'prose', boundary: 'open', attributes: 'any' } };
    f.editing.configure({ ...policies, rules: [original] });
    original.effect = 'reject'; original.match.sourceType = '*';
    const plan = textPlan(f);
    expect(plan.trace).toMatchObject([{ ruleIds: ['mutable'], effect: 'join-inline' }]);
    expect(() => f.editing.configure({ rules: [rule('reject'), rule('reject')] })).toThrow('Duplicate');
    expect((await f.editing.apply(plan)).committed).toBe(true); // Invalid configure did not replace the policy.
    const next = textPlan(f), before = snapshot(f.dataStore);
    f.editing.configure({ ...policies, rules: [rule('reject')] });
    expect((await f.editing.apply(next)).committed).toBe(false);
    expect(snapshot(f.dataStore)).toEqual(before);
  });
  it('rejects a join rule for a closed boundary at registration', () => {
    expect(() => rule('join-inline', { match: { sourceType: 'prose', targetType: 'prose', boundary: 'closed', attributes: 'any' } })).toThrow('open boundary');
  });
});
