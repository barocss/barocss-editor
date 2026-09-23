// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor, type ModelSelection } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { FragmentEditor } from '@barocss/model';
import { DeleteExtension } from '../src/delete';
import { ParagraphExtension } from '../src/paragraph';
import { TextExtension } from '../src/text';
import { CopyPasteExtension } from '../src/copy-paste';
const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));
const range = (startNodeId: string, startOffset: number, endNodeId = startNodeId, endOffset = startOffset): ModelSelection => ({type:'range',startNodeId,startOffset,endNodeId,endOffset,collapsed:startNodeId===endNodeId && startOffset===endOffset});
function fixture() {
  const schema = new Schema('input-policy',{topNode:'document',nodes:{document:{name:'document',content:'body+'},body:{name:'body',group:'block',content:'inline*'},glyph:{name:'glyph',group:'inline'},object:{name:'object',group:'inline',atom:true}}});
  const editor = new Editor({schema,extensions:[new DeleteExtension(),new ParagraphExtension(),new TextExtension(),new CopyPasteExtension()]});editors.push(editor);
  editor.loadDocument({stype:'document',content:[{sid:'a',stype:'body',content:[{sid:'at',stype:'glyph',text:'ABCD'}]},{sid:'b',stype:'body',content:[{sid:'bt',stype:'glyph',text:'EFGH'}]}]});
  const editing=FragmentEditor.forEditor(editor);
  return {editor,editing};
}
const deny = {rules:[{id:'do-not-join',match:{sourceType:'body',targetType:'body',boundary:'open' as const,attributes:'any' as const},effect:'reject' as const,reason:'Boundary is protected'}]};
describe('shared structural input policy',()=>{
  it.each([['backspace','bt',0],['deleteForward','at',4]] as const)('uses the paste boundary rule for %s',async(command,id,offset)=>{
    const {editor,editing}=fixture();editing.configure(deny);editor.updateSelection(range(id,offset));const before=editor.exportDocument();
    const fragment=editing.captureText('bt',0,1);
    expect(editing.plan({intent:'copy',fragment,target:{kind:'text',nodeId:'at',from:4,to:4}}).ok).toBe(false);
    expect(await editor.executeCommand(command)).toBe(false);expect(editor.exportDocument()).toEqual(before);expect(editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('uses the same rejection for selected typing and selected deletion',async()=>{
    const {editor,editing}=fixture();editing.configure(deny);editor.updateSelection(range('at',2,'bt',2));const before=editor.exportDocument();
    expect(await editor.executeCommand('replaceText',{range:editor.selection,text:'X'})).toBe(false);
    expect(await editor.executeCommand('backspace')).toBe(false);expect(editor.exportDocument()).toEqual(before);
  });
  it('writes native cut data synchronously but retains original text when deletion is refused',async()=>{
    const {editor,editing}=fixture();editing.configure(deny);editor.updateSelection(range('at',2,'bt',2));let wrote=false;const before=editor.exportDocument();
    const pending=editor.executeCommand('cut',{clipboardData:{setData:()=>{wrote=true;}},onClipboardWrite:()=>{}});
    expect(wrote).toBe(true);expect(await pending).toBe(false);expect(editor.exportDocument()).toEqual(before);expect(editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('splits a custom type using the product policy and supports exact undo',async()=>{
    const {editor,editing}=fixture();editing.configure({splits:{body:{mode:'same'}}});editor.updateSelection(range('at',2));const before=editor.exportDocument();
    expect(await editor.executeCommand('insertParagraph')).toBe(true);expect(editor.dataStore.getNode('at')?.text).toBe('AB');
    expect(editor.dataStore.getNode(editor.selection!.startNodeId)?.text).toBe('CD');expect(await editor.undo()).toBe(true);expect(editor.exportDocument()).toEqual(before);
  });
  it('does not move the selection before a rejected Enter',async()=>{
    const {editor,editing}=fixture();editing.configure({splits:{body:{mode:'reject'}}});editor.updateSelection(range('bt',1));const before=structuredClone(editor.selection);
    expect(await editor.executeCommand('insertParagraph',{selection:range('at',2)})).toBe(false);expect(editor.selection).toEqual(before);expect(editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('rejects read-only edits and invalidates plans changed by observers',async()=>{
    const {editor}=fixture();editor.updateSelection(range('at',1,'at',3));const before=editor.exportDocument();editor.setEditable(false);
    expect(await editor.executeCommand('replaceText',{range:editor.selection,text:'X'})).toBe(false);expect(editor.exportDocument()).toEqual(before);
    editor.setEditable(true);editor.on('editor:structure.plan',()=>editor.updateSelection(range('bt',0)));
    expect(await editor.executeCommand('replaceText',{range:range('at',1,'at',3),text:'X'})).toBe(false);expect(editor.exportDocument()).toEqual(before);expect(editor.getHistoryStats().totalEntries).toBe(0);
  });
  it('deletes an inline object and restores its seam and identity with undo',async()=>{
    const {editor}=fixture();editor.dataStore.content.addChild('a',{sid:'obj',stype:'object'});editor.dataStore.content.addChild('a',{sid:'tail',stype:'glyph',text:'tail'});
    editor.updateSelection({type:'node',nodeIds:['obj'],startNodeId:'obj',endNodeId:'obj',startOffset:0,endOffset:0,collapsed:false});const before=editor.exportDocument();
    expect(await editor.executeCommand('backspace')).toBe(true);expect(editor.dataStore.getNode('obj')).toBeUndefined();expect(editor.dataStore.getNode('at')?.text).toBe('ABCDtail');
    expect(await editor.undo()).toBe(true);expect(editor.exportDocument()).toEqual(before);
  });
});
