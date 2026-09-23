// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor, type ModelSelection } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { FragmentEditor, defineEditingRule } from '@barocss/model';
import { FRAGMENT_DRAG_TYPE, FRAGMENT_CLIPBOARD_TYPE } from '@barocss/shared';
import { CopyPasteExtension } from '../src/copy-paste';
const editors: Editor[] = [];
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); vi.unstubAllGlobals(); });
const selection = (id: string, from: number, to = from): ModelSelection => ({ type: 'range', startNodeId: id, startOffset: from, endNodeId: id, endOffset: to, collapsed: from === to });
function fixture(schema = new Schema('drag', { topNode: 'document', nodes: { document: { name: 'document', content: 'body+' }, body: { name: 'body', group: 'block', content: 'inline*' }, glyph: { name: 'glyph', group: 'inline' } } })) {
  const editor = new Editor({ schema, extensions: [new CopyPasteExtension()] }); editors.push(editor);
  editor.loadDocument({ stype: 'document', content: ['a','b','c'].map(id => ({ sid: id, stype: 'body', content: [{ sid: id+'t', stype: 'glyph', text: id==='a' ? 'ABCD' : 'xy' }] })) });
  editor.updateSelection(selection('at',1,3));
  return { editor, schema, editing: FragmentEditor.forEditor(editor), root: editor.getRootId()! };
}
const snapshot = (editor: Editor) => structuredClone(editor.dataStore.getAllNodes().sort((a,b) => a.sid!.localeCompare(b.sid!)));
const text = (editor: Editor, id: string): string => { const node = editor.dataStore.getNode(id)!; return node.text ?? (node.content as string[]).map(id => text(editor,id)).join(''); };
async function begin(editor: Editor, nodeIds?: string[]) {
  const values = new Map<string,string>(); let started = false;
  const pending = editor.executeCommand('beginFragmentDrag', { nodeIds, dataTransfer: { setData: (type: string,value: string) => values.set(type,value) }, onStart: () => { started = true; } });
  expect(started).toBe(true); expect(await pending).toBe(true); return { token: values.get(FRAGMENT_DRAG_TYPE), clipboardFragment: values.get(FRAGMENT_CLIPBOARD_TYPE), clipboardHtml: values.get('text/html'), clipboardText: values.get('text/plain') };
}
const target = { kind: 'text', nodeId: 'bt', from: 1, to: 1 };
describe('drag source authority and policy commands', () => {
  it('moves a local range even after cursor-only changes and records one undo entry', async () => {
    const { editor } = fixture(), payload = await begin(editor); editor.updateSelection(selection('ct',1));
    const before = snapshot(editor);
    expect(await editor.executeCommand('dropFragment',{...payload,target,intent:'move'})).toBe(true);
    expect(text(editor,'a')).toBe('AD'); expect(text(editor,'b')).toBe('xBCy');
    const after = snapshot(editor); expect(await editor.undo()).toBe(true); expect(snapshot(editor)).toEqual(before);
    expect(await editor.redo()).toBe(true); expect(snapshot(editor)).toEqual(after); expect(editor.getHistoryStats().totalEntries).toBe(1);
  });
  it('copies when the view requests copy, with no source deletion', async () => {
    const { editor } = fixture(), payload = await begin(editor);
    expect(await editor.executeCommand('dropFragment',{...payload,target,intent:'copy'})).toBe(true);
    expect(text(editor,'a')).toBe('ABCD'); expect(text(editor,'b')).toBe('xBCy');
  });
  it('does not trust another editor or serialized source IDs as local move authority', async () => {
    const source = fixture(), destination = fixture(source.schema), payload = await begin(source.editor);
    const sourceBefore = snapshot(source.editor);
    expect(await destination.editor.executeCommand('dropFragment',{...payload,target,intent:'move'})).toBe(true);
    expect(snapshot(source.editor)).toEqual(sourceBefore); expect(text(destination.editor,'a')).toBe('ABCD'); expect(text(destination.editor,'b')).toBe('xBCy');
  });
  it.each(['document','schema','policy','cancel'] as const)('rejects a local session after %s change without copy fallback', async reason => {
    const f = fixture(), payload = await begin(f.editor);
    if (reason==='document') f.editor.dataStore.updateNode('ct',{text:'changed'});
    if (reason==='schema') f.schema.getNodeType('body')!.isolating = true;
    if (reason==='policy') f.editing.configure({});
    if (reason==='cancel') await f.editor.executeCommand('cancelFragmentDrag');
    const before = snapshot(f.editor);
    expect(await f.editor.executeCommand('dropFragment',{...payload,target,intent:'move'})).toBe(false);
    expect(snapshot(f.editor)).toEqual(before); expect(f.editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('rejects a document change caused by the drop plan observer', async () => {
    const f = fixture(), payload = await begin(f.editor);
    f.editor.on('editor:drag.plan', () => f.editor.dataStore.updateNode('ct',{text:'observer'}));
    expect(await f.editor.executeCommand('dropFragment',{...payload,target,intent:'move'})).toBe(false);
    expect(text(f.editor,'a')).toBe('ABCD'); expect(text(f.editor,'b')).toBe('xy'); expect(text(f.editor,'c')).toBe('observer'); expect(f.editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('preserves all node identities through node move and copies to new identities', async () => {
    const f = fixture(), payload = await begin(f.editor,['a','c']);
    expect(await f.editor.executeCommand('dropFragment',{...payload,target:{kind:'children',parentId:f.root,index:3},intent:'move'})).toBe(true);
    expect(f.editor.dataStore.getNode(f.root)?.content).toEqual(['b','a','c']);
    expect(await f.editor.undo()).toBe(true);
    expect(await f.editor.executeCommand('transferNodes',{nodeIds:['a'],target:{kind:'children',parentId:f.root,index:3},intent:'copy'})).toBe(true);
    const ids = f.editor.dataStore.getNode(f.root)!.content as string[];
    expect(ids.slice(0,3)).toEqual(['a','b','c']); expect(ids[3]).not.toBe('a'); expect(text(f.editor,ids[3])).toBe('ABCD');
  });
  it('previews without changing the document and uses the same rejection policy on drop', async () => {
    const f = fixture(); f.editing.configure({ rules: [defineEditingRule({id:'no',match:{sourceType:'*',targetType:'*',boundary:'open',attributes:'any'},effect:'reject',reason:'Not here'})] });
    const payload = await begin(f.editor), before = snapshot(f.editor), onDecision = vi.fn();
    expect(await f.editor.executeCommand('previewFragmentDrop',{...payload,target,onDecision})).toBe(false);
    expect(onDecision).toHaveBeenCalledWith(expect.objectContaining({accepted:false,reason:'Not here'}));
    expect(await f.editor.executeCommand('dropFragment',{...payload,target})).toBe(false); expect(snapshot(f.editor)).toEqual(before);
  });
  it('imports external text at the explicit drop target rather than the prior caret', async () => {
    const f = fixture(); f.editor.updateSelection(selection('at',0));
    expect(await f.editor.executeCommand('dropFragment',{target,clipboardText:'NEW',intent:'move'})).toBe(true);
    expect(text(f.editor,'a')).toBe('ABCD'); expect(text(f.editor,'b')).toBe('xNEWy');
  });
  it('does not read the clipboard for an empty or unrelated drop', async () => {
    const f = fixture(), read = vi.fn(); vi.stubGlobal('navigator',{clipboard:{read}});
    expect(await f.editor.executeCommand('dropFragment',{target})).toBe(false); expect(read).not.toHaveBeenCalled();
  });
  it('rejects read-only drops and unsupported multi-run moves', async () => {
    const f = fixture(); f.editor.updateSelection({...selection('at',1),endNodeId:'bt',endOffset:1,collapsed:false});
    const payload = await begin(f.editor); expect(await f.editor.executeCommand('dropFragment',{...payload,target,intent:'move'})).toBe(false);
    const fresh = await begin(f.editor); f.editor.setEditable(false);
    expect(await f.editor.executeCommand('dropFragment',{...fresh,target,intent:'copy'})).toBe(false); expect(f.editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('uses schema drag/drop flags and never bypasses them with a product move', async () => {
    const f=fixture(); f.schema.getNodeType('body')!.draggable=false;
    expect(await f.editor.executeCommand('beginFragmentDrag',{nodeIds:['a'],dataTransfer:{setData:vi.fn()}})).toBe(false);
    expect(await f.editor.executeCommand('transferNodes',{nodeIds:['a'],target:{kind:'children',parentId:f.root,index:3}})).toBe(false);
    f.schema.getNodeType('body')!.draggable=true; const payload=await begin(f.editor);
    f.schema.getNodeType('body')!.droppable=false;
    expect(await f.editor.executeCommand('dropFragment',{...payload,target,intent:'copy'})).toBe(false);
    expect(text(f.editor,'b')).toBe('xy');expect(f.editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('combines external copy, explicit schema conversion and inline join', async () => {
    const f=fixture(); const fragment=structuredClone(f.editing.captureText('at',1,3));
    fragment.origin={format:'foreign',schemaId:'custom',schemaRevision:'1'};
    f.editing.configure({adapters:[{format:'foreign',schemaId:'custom',convert:input=>({content:{...input,content:[{stype:'glyph',text:'converted'}],openStart:0,openEnd:0,references:[]},outcome:'converted',losses:[]})}]});
    let actions: unknown;
    f.editor.on('editor:drag.plan',(value: unknown)=>{actions=(value as {plan?:{actions:unknown}}).plan?.actions;});
    expect(await f.editor.executeCommand('dropFragment',{clipboardFragment:JSON.stringify(fragment),target,intent:'move'})).toBe(true);
    expect(actions).toEqual(expect.arrayContaining(['transform','join']));expect(text(f.editor,'a')).toBe('ABCD');expect(text(f.editor,'b')).toBe('xconvertedy');
  });
  it('copies literal text to code with reported conversion', async () => {
    const f=fixture(); f.schema.getNodeType('body')!.code=true;
    let actions: unknown; f.editor.on('editor:drag.plan',(value: unknown)=>{actions=(value as {plan?:{actions:unknown}}).plan?.actions;});
    const payload=await begin(f.editor);
    expect(await f.editor.executeCommand('dropFragment',{...payload,target,intent:'copy'})).toBe(true);
    expect(actions).toEqual(expect.arrayContaining(['transform','join']));expect(text(f.editor,'a')).toBe('ABCD');expect(text(f.editor,'b')).toBe('xBCy');
  });

  it('honors content and deletion locks for native and product moves', async () => {
    const f=fixture();f.editor.dataStore.updateNode('a',{attributes:{lockContent:true}});
    let payload=await begin(f.editor);
    expect(await f.editor.executeCommand('dropFragment',{...payload,target})).toBe(false);
    f.editor.dataStore.updateNode('a',{attributes:{lockDelete:true}});
    expect(await f.editor.executeCommand('transferNodes',{nodeIds:['a'],target:{kind:'children',parentId:f.root,index:3}})).toBe(false);
    f.editor.dataStore.updateNode('a',{attributes:{}});f.editor.dataStore.updateNode('b',{attributes:{lockContent:true}});payload=await begin(f.editor);
    expect(await f.editor.executeCommand('dropFragment',{...payload,target,intent:'copy'})).toBe(false);expect(f.editor.getHistoryStats().totalEntries).toBe(0);
  });

});
