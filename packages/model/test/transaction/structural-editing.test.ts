// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor, type ModelSelection } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { FragmentEditor, type EditingDecision, type EditingPolicy } from '../../src/editing';
import '../../src/operations';
const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));
const range = (startNodeId = 'at', startOffset = 1, endNodeId = startNodeId, endOffset = startOffset): ModelSelection => ({ type: 'range', startNodeId, startOffset, endNodeId, endOffset, collapsed: startNodeId === endNodeId && startOffset === endOffset });
function fixture(policy: EditingPolicy = {}) {
  const schema = new Schema('structural-custom', { topNode: 'document', nodes: {
    document: { name: 'document', content: 'block+' },
    body: { name: 'body', group: 'block', content: 'inline*', attrs: { align: { type: 'string', default: 'left' } } },
    title: { name: 'title', group: 'block', content: 'inline*' },
    glyph: { name: 'glyph', group: 'inline' },
    group: { name: 'group', group: 'block', content: 'title body+' },
    ref: { name: 'ref', group: 'inline', atom: true, attrs: { to: { type: 'string', required: true } } }
  }, marks: { strong: { name: 'strong' } } });
  const editor = new Editor({ schema }); editors.push(editor);
  editor.loadDocument({ stype: 'document', content: ['a','b','c'].map(id => ({ sid: id, stype: 'body', content: [{ sid: id+'t', stype: 'glyph', text: 'ABCD', marks: [{ stype: 'strong', range: [1,3] }] }] })) });
  editor.updateSelection(range());
  const editing = new FragmentEditor(editor, { rangeReplacement: 'preserve-boundaries', references: { ref: { to: { kind: 'node', outside: 'same-document' } } }, ...policy });
  return { editor, editing, schema };
}
function accepted(decision: EditingDecision) { if (!decision.ok) throw new Error(decision.reason); return decision.plan; }
const snapshot = (editor: Editor) => structuredClone(editor.dataStore.getAllNodes().sort((a,b) => a.sid!.localeCompare(b.sid!)));
async function apply(f: ReturnType<typeof fixture>, decision: EditingDecision) {
  const before = snapshot(f.editor), selection = structuredClone(f.editor.selection);
  expect((await f.editing.apply(accepted(decision))).committed).toBe(true);
  const after = snapshot(f.editor), caret = structuredClone(f.editor.selection);
  expect(await f.editor.undo()).toBe(true); expect(snapshot(f.editor)).toEqual(before); expect(f.editor.selection).toEqual(selection);
  expect(await f.editor.redo()).toBe(true); expect(snapshot(f.editor)).toEqual(after); expect(f.editor.selection).toEqual(caret);
}
describe('structural editing plans', () => {
  it('deletes a marked range without mutating or allocating IDs during planning', async () => {
    const f=fixture(), before=snapshot(f.editor), ids=vi.spyOn(f.editor.dataStore,'generateId');
    const decision=await f.editing.planStructure({ intent:'delete',range:range('at',1,'at',3) });
    expect(snapshot(f.editor)).toEqual(before); expect(ids).not.toHaveBeenCalled();
    await apply(f,decision); expect(f.editor.dataStore.getNode('at')?.text).toBe('AD');
    expect(f.editor.dataStore.getNode('at')?.marks).toEqual([]);
  });
  it('joins adjacent compatible containers and restores their exact IDs', async () => {
    const f=fixture(); await apply(f,await f.editing.planStructure({intent:'join',leftId:'a',rightId:'b'}));
    expect(f.editor.dataStore.getNode('a')?.content).toEqual(['at','bt']);
    expect(f.editor.dataStore.getNode('b')).toBeUndefined();
    expect(f.editor.selection).toMatchObject({startNodeId:'at',startOffset:4});
  });
  it('deletes across three containers and inserts selected replacement text once', async () => {
    const f=fixture(); await apply(f,await f.editing.planStructure({intent:'replace',range:range('at',1,'ct',3),text:'x'}));
    expect(f.editor.dataStore.getNode('at')?.text).toBe('Ax'); expect(f.editor.dataStore.getNode('ct')?.text).toBe('D');
    expect(f.editor.dataStore.getNode(f.editor.getRootId()!)?.content).toEqual(['a']);
  });
  it('splits a custom text vocabulary without inline-text and keeps marks and history', async () => {
    const f=fixture(); await apply(f,await f.editing.planStructure({intent:'split',range:range('at',2)}));
    const root=f.editor.dataStore.getNode(f.editor.getRootId()!)!;
    expect(root.content).toHaveLength(4); expect(f.editor.dataStore.getNode('at')?.text).toBe('AB');
    expect(f.editor.dataStore.getNode(f.editor.selection!.startNodeId)?.text).toBe('CD');
  });
  it('uses the configured next type at the end of a custom block', async () => {
    const f=fixture({splits:{body:{mode:'same',atEnd:'title'}}});
    await apply(f,await f.editing.planStructure({intent:'split',range:range('at',4)}));
    const leaf=f.editor.dataStore.getNode(f.editor.selection!.startNodeId)!;
    expect(leaf.stype).toBe('glyph'); expect(f.editor.dataStore.getNode(leaf.parentId!)?.stype).toBe('title');
  });
  it('rejects a policy-denied join, split, and removal of a referenced block', async () => {
    const f=fixture({splits:{body:{mode:'reject'}},rules:[{id:'deny',match:{sourceType:'body',targetType:'body',boundary:'open',attributes:'any'},effect:'reject',reason:'Keep boundary'}]});
    expect((await f.editing.planStructure({intent:'join',leftId:'a',rightId:'b'})).ok).toBe(false);
    expect((await f.editing.planStructure({intent:'split',range:range()})).ok).toBe(false);
    f.editing.configure({references:{ref:{to:{kind:'node',outside:'same-document'}}}});
    f.editor.dataStore.content.addChild('c',{stype:'ref',attributes:{to:'b'}});
    expect((await f.editing.planStructure({intent:'join',leftId:'a',rightId:'b'})).ok).toBe(false);
  });
  it('rejects stale plans and restores writes, selection, and history after failure', async () => {
    const f=fixture(), plan=accepted(await f.editing.planStructure({intent:'split',range:range()}));
    f.editor.updateSelection(range('at',2)); expect((await f.editing.apply(plan)).success).toBe(false);
    const next=accepted(await f.editing.planStructure({intent:'split',range:range('at',2)})), before=snapshot(f.editor),selection=structuredClone(f.editor.selection);
    const add=f.editor.dataStore.content.addChild.bind(f.editor.dataStore.content);
    vi.spyOn(f.editor.dataStore.content,'addChild').mockImplementationOnce((...args)=>{add(...args);throw new Error('injected');});
    expect((await f.editing.apply(next)).committed).toBe(false); expect(snapshot(f.editor)).toEqual(before); expect(f.editor.selection).toEqual(selection); expect(f.editor.getHistoryStats().totalEntries).toBe(0);
  });
});

describe('structural boundaries and state', () => {
  it('preserves different roles by default and rejects a boundary-only join', async () => {
    const f=fixture(); f.editor.dataStore.setNode({...f.editor.dataStore.getNode('b')!,stype:'title'},false);
    expect((await f.editing.planStructure({intent:'join',leftId:'a',rightId:'b'})).ok).toBe(false);
    await apply(f,await f.editing.planStructure({intent:'delete',range:range('at',1,'bt',3)}));
    expect(f.editor.dataStore.getNode('a')?.content).toEqual(['at']); expect(f.editor.dataStore.getNode('b')?.content).toEqual(['bt']);
    expect(f.editor.dataStore.getNode('at')?.text).toBe('A'); expect(f.editor.dataStore.getNode('bt')?.text).toBe('D');
  });
  it('preserves required title and body shells without inventing a schema type', async () => {
    const f=fixture();
    f.editor.loadDocument({stype:'document',content:[{sid:'g',stype:'group',content:[{sid:'title',stype:'title',content:[{sid:'tt',stype:'glyph',text:'Title'}]},{sid:'body',stype:'body',content:[{sid:'bt',stype:'glyph',text:'Body'}]}]}]});
    f.editor.updateSelection(range('tt',0,'bt',4));
    await apply(f,await f.editing.planStructure({intent:'delete',range:range('tt',0,'bt',4)}));
    expect(f.editor.dataStore.getNode('g')?.content).toEqual(['title','body']);
    expect(f.editor.dataStore.getNode('tt')?.text).toBe(''); expect(f.editor.dataStore.getNode('bt')?.text).toBe('');
  });
  it.each(['isolating','atom'] as const)('refuses crossing a %s boundary', async flag => {
    const f=fixture(); f.schema.getNodeType('body')![flag]=true;
    const before=snapshot(f.editor);
    expect((await f.editing.planStructure({intent:'delete',range:range('at',1,'bt',2)})).ok).toBe(false);
    expect((await f.editing.planStructure({intent:'split',range:range()})).ok).toBe(false);
    expect(snapshot(f.editor)).toEqual(before);
  });
  it('honours attributes even when the type names match', async () => {
    const f=fixture(); f.editor.dataStore.updateNode('b',{attributes:{align:'center'}});
    expect((await f.editing.planStructure({intent:'join',leftId:'a',rightId:'b'})).ok).toBe(false);
    await apply(f,await f.editing.planStructure({intent:'delete',range:range('at',2,'bt',2)}));
    expect(f.editor.dataStore.getNode('b')?.attributes?.align).toBe('center');
  });
  it('keeps a referenced text ID and refuses to erase a referenced container', async () => {
    const f=fixture(); f.editor.dataStore.content.addChild('a',{sid:'r',stype:'ref',attributes:{to:'ct'}});
    expect((await f.editing.planStructure({intent:'delete',range:range('bt',0,'ct',4)})).ok).toBe(true);
    f.editor.dataStore.updateNode('r',{attributes:{to:'b'}}); const before=snapshot(f.editor);
    expect((await f.editing.planStructure({intent:'join',leftId:'a',rightId:'b'})).ok).toBe(false);
    expect(snapshot(f.editor)).toEqual(before);
    expect(f.editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('does not remove locks or allocate history for an empty deletion', async () => {
    const f=fixture(); const empty=accepted(await f.editing.planStructure({intent:'delete',range:range()}));
    expect((await f.editing.apply(empty)).committed).toBe(false); expect(f.editor.getHistoryStats().totalEntries).toBe(0);
    f.editor.dataStore.setNode({...f.editor.dataStore.getNode('a')!,attributes:{lockContent:true}},false);
    expect((await f.editing.planStructure({intent:'delete',range:range('at',0,'at',1)})).ok).toBe(false);
  });
  it('rejects state changes during asynchronous planning and changed policy before applying', async () => {
    const f=fixture(); const pending=f.editing.planStructure({intent:'split',range:range()});
    f.editor.dataStore.updateNode('ct',{text:'changed'}); expect((await pending).ok).toBe(false);
    const value=accepted(await f.editing.planStructure({intent:'split',range:range()}));
    f.editing.configure({splits:{body:{mode:'reject'}}}); expect((await f.editing.apply(value)).success).toBe(false);
  });
  it('rejects unsupported host operations without running them', async () => {
    const f=fixture(), before=snapshot(f.editor);
    const decision=await f.editing.planStructure({intent:'split',range:range(),operations:[{type:'unknown'} as never]});
    expect(decision.ok).toBe(false); expect(snapshot(f.editor)).toEqual(before);
  });
  it('plans delete plus Enter as one edit across multiple marked runs', async () => {
    const f=fixture(); f.editor.dataStore.content.addChild('a',{sid:'a2',stype:'glyph',text:'EFGH',marks:[{stype:'strong',range:[0,4]}]});
    await apply(f,await f.editing.planStructure({intent:'split',range:range('at',2,'a2',2)}));
    expect(f.editor.dataStore.getNode('at')?.text).toBe('AB'); expect(f.editor.dataStore.getNode('a2')?.text).toBe('GH');
    expect(f.editor.dataStore.getNode('a2')?.marks).toEqual([{stype:'strong',range:[0,2]}]);
    expect(f.editor.selection?.startNodeId).toBe('a2'); expect(f.editor.getHistoryStats().totalEntries).toBe(1);
  });
});


describe('structural references and inline-object defaults', () => {
  it('preserves external references through edits and exact history restoration', async () => {
    const f = fixture({ references: { ref: { to: { kind: 'external', outside: 'preserve' } } } });
    f.editor.dataStore.content.addChild('b', { sid: 'external', stype: 'ref', attributes: { to: 'https://example.test/record' } });
    await apply(f, await f.editing.planStructure({ intent: 'join', leftId: 'a', rightId: 'b' }));
    expect(f.editor.dataStore.getNode('external')?.attributes?.to).toBe('https://example.test/record');
  });
  it('requires an explicit custom text type when removing the last inline object', async () => {
    const f = fixture({ references: { ref: { to: { kind: 'external', outside: 'preserve' } } } });
    f.editor.loadDocument({ stype: 'document', content: [{ sid: 'a', stype: 'body', content: [{ sid: 'r', stype: 'ref', attributes: { to: 'remote' } }] }] });
    f.editor.setNode({ nodeId: 'r' });
    expect((await f.editing.planStructure({ intent: 'remove', nodeIds: ['r'] })).ok).toBe(false);
    f.editing.configure({ defaultText: 'glyph', references: { ref: { to: { kind: 'external', outside: 'preserve' } } } });
    await apply(f, await f.editing.planStructure({ intent: 'remove', nodeIds: ['r'] }));
    expect(f.editor.dataStore.getNode(f.editor.selection!.startNodeId)).toMatchObject({ stype: 'glyph', text: '' });
  });
  it('rejects deleting a locked boundary and applying after schema changes', async () => {
    const f = fixture();
    f.editor.dataStore.updateNode('b', { attributes: { lockDelete: true } });
    expect((await f.editing.planStructure({ intent: 'delete', range: range('at', 1, 'ct', 1) })).ok).toBe(false);
    const plan = accepted(await f.editing.planStructure({ intent: 'split', range: range() }));
    f.schema.getNodeType('body')!.isolating = true;
    expect((await f.editing.apply(plan)).success).toBe(false);
    expect(f.editor.getHistoryStats().totalEntries).toBe(0);
  });
});

describe('explicit empty boundary removal', () => {
  it('keeps the right role and exact history only when the type pair is allowed', async () => {
    const f = fixture();
    f.editor.dataStore.updateNode('at', { text: '', marks: [] });
    f.editor.dataStore.setNode({ ...f.editor.dataStore.getNode('b')!, stype: 'title' }, false);
    const request = { intent: 'remove-gap' as const, leftId: 'a', rightId: 'b' };
    expect((await f.editing.planStructure(request)).ok).toBe(false);
    f.editing.configure({ removeEmptyBefore: { body: ['title'] } });
    f.editor.dataStore.updateNode('a', { text: 'Keep' });
    expect((await f.editing.planStructure(request)).ok).toBe(false);
    f.editor.dataStore.updateNode('a', { text: undefined });
    f.editor.updateSelection(range('bt', 0));
    const title = structuredClone(f.editor.dataStore.getNode('b'));
    await apply(f, await f.editing.planStructure(request));
    expect(f.editor.dataStore.getNode('a')).toBeUndefined();
    expect(f.editor.dataStore.getNode('b')).toEqual(title);
    expect(f.editor.selection).toMatchObject({ startNodeId: 'bt', startOffset: 0 });
  });
  it.each(['preserve', 'reject'] as const)('honours an explicit %s rule even for an empty gap', async effect => {
    const f = fixture({ removeEmptyBefore: { body: ['body'] }, rules: [{ id: 'protected', match: { sourceType: 'body', targetType: 'body', boundary: 'open', attributes: 'any' }, effect, reason: 'Keep this boundary' }] });
    f.editor.dataStore.updateNode('at', { text: '', marks: [] });
    const before = snapshot(f.editor);
    expect((await f.editing.planStructure({ intent: 'remove-gap', leftId: 'a', rightId: 'b' })).ok).toBe(false);
    expect(snapshot(f.editor)).toEqual(before);
  });
  it('rejects a referenced empty container instead of leaving a dangling reference', async () => {
    const f = fixture({ removeEmptyBefore: { body: ['body'] } });
    f.editor.dataStore.updateNode('at', { text: '', marks: [] });
    f.editor.dataStore.content.addChild('c', { stype: 'ref', attributes: { to: 'a' } });
    expect((await f.editing.planStructure({ intent: 'remove-gap', leftId: 'a', rightId: 'b' })).ok).toBe(false);
    expect(f.editor.getHistoryStats().totalEntries).toBe(0);
  });
});
