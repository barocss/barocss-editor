import type { Editor } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import type { MathDocument } from '@barocss/math-editor/core';
import { enclosingMath } from './math-navigation';
import { mathEditorToWord, type WordMathNode } from './math-editor-bridge';
export interface WordMathTarget { rootId: string; id: string; before: string; offset?: number; math?: WordMathNode }
export function mathTree(editor: Editor, id: string): WordMathNode {
 const n = editor.dataStore.getNode(id); if (!n) throw new Error('수식을 찾을 수 없습니다.');
 return { stype: n.stype, ...(n.text === undefined ? {} : { text: n.text }), attributes: n.attributes, marks: n.marks, content: (n.content ?? []).map(c => mathTree(editor, typeof c === 'string' ? c : c.sid!)) } as WordMathNode;
}
export function captureWordMathTarget(editor: Editor): WordMathTarget | undefined {
 if (!editor.isEditable) return;
 const selection = editor.selection;
 if (selection?.type === 'node' && selection.nodeIds?.length === 1) {
  const id = selection.nodeIds[0];
  if (editor.dataStore.getNode(id)?.stype !== 'oMath') return;
  const tree = mathTree(editor, id);
  return { rootId: editor.getRootId()!, id, before: JSON.stringify(tree), math: tree };
 }
 if (selection?.type !== 'range') return;
 const math = enclosingMath({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) }, selection.startNodeId);
 if (math?.sid) { const tree = mathTree(editor, math.sid); return { rootId: editor.getRootId()!, id: math.sid, before: JSON.stringify(tree), math: tree }; }
 if (selection.startNodeId !== selection.endNodeId || selection.startOffset !== selection.endOffset) return;
 const run = editor.dataStore.getNode(selection.startNodeId);
 const parent = run?.parentId && editor.dataStore.getNode(run.parentId);
 if (run?.stype !== 'inline-text' || !parent || !['paragraph', 'heading'].includes(parent.stype)) return;
 return { rootId: editor.getRootId()!, id: selection.startNodeId, before: JSON.stringify(mathTree(editor, selection.startNodeId)), offset: selection.startOffset };
}
export async function applyWordMathDraft(editor: Editor, target: WordMathTarget, draft: MathDocument, options: { caretAfter?: boolean } = {}): Promise<void> {
 if (!editor.isEditable || editor.getRootId() !== target.rootId || JSON.stringify(mathTree(editor, target.id)) !== target.before) throw new Error('편집 중 원본이 변경되었습니다. 팝업을 닫고 다시 열어 주세요.');
 const source = editor.dataStore.getNode(target.id)!;
 if (!source.parentId) throw new Error('수식 위치를 찾을 수 없습니다.');
 const parent = editor.dataStore.getNode(source.parentId)!;
 const at = (parent.content ?? []).findIndex(c => (typeof c === 'string' ? c : c.sid) === target.id);
 const math = mathEditorToWord(draft);
 // The draft owns mathematical content; the equation's presentation stays in Word.
 if (target.math) math.attributes = { ...source.attributes };
 const mathCaret = editor.dataStore.generateId();
 const markFirstText = (n: WordMathNode): boolean => {
  if (n.stype === 'inline-text') { Object.assign(n, { sid: mathCaret }); return true; }
  return (n.content ?? []).some(markFirstText);
 };
 const hasCaret = markFirstText(math);
 const caret = editor.dataStore.generateId();
 // Store normalized nodes only inside the transaction, so one undo restores the source.
 const ops: unknown[] = [];
 if (target.math) {
  ops.push({ type: 'addChild', payload: { parentId: source.parentId, position: at + 1, children: [math] } }, { type: 'delete', payload: { nodeId: target.id } });
 } else {
  const offset = target.offset!;
  if (offset < 0 || offset > (source.text ?? '').length) throw new Error('수식 삽입 위치가 변경되었습니다.');
  if (offset === 0) ops.push({ type: 'addChild', payload: { parentId: source.parentId, position: at, children: [{ stype: 'inline-text', text: '' }, math] } });
  else if (offset === source.text?.length) ops.push({ type: 'addChild', payload: { parentId: source.parentId, position: at + 1, children: [math, { stype: 'inline-text', sid: caret, text: '' }] } });
  else ops.push({ type: 'splitTextNode', payload: { nodeId: target.id, splitPosition: offset, newNodeId: caret } }, { type: 'addChild', payload: { parentId: source.parentId, position: at + 1, children: [math] } });
 }
 let selectionCaret = mathCaret;
 if (options.caretAfter) {
  if (target.math) {
   const nextId = parent.content?.[at + 1];
   const next = nextId ? editor.dataStore.getNode(typeof nextId === 'string' ? nextId : nextId.sid!) : undefined;
   if (next?.stype === 'inline-text') selectionCaret = next.sid!;
   else { ops.push({ type: 'addChild', payload: { parentId: source.parentId, position: at + 1, children: [{ stype: 'inline-text', sid: caret, text: '' }] } }); selectionCaret = caret; }
  } else selectionCaret = target.offset === 0 ? target.id : caret;
 }
 if (hasCaret || options.caretAfter) ops.push({ type: 'setSelection', payload: { anchor: { nodeId: selectionCaret, offset: 0 }, head: { nodeId: selectionCaret, offset: 0 } } });
 const result = await transaction(editor, ops as never).commit();
 if (!result.success) throw new Error('수식을 적용하지 못했습니다. 원본을 유지했습니다.');
}
