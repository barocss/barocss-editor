import type { Editor } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { mathFontScale, MATH_SCALE_MIN, MATH_SCALE_MAX } from '@barocss/office-text';
import type { WordMathTarget } from './math-editor-session';

/** One explicit size change is one undo step. No mathematical content is rewritten. */
export async function setWordMathScale(editor: Editor, target: WordMathTarget, percent: number): Promise<void> {
  const node = editor.dataStore.getNode(target.id);
  if (!editor.isEditable || editor.getRootId() !== target.rootId || node?.stype !== 'oMath')
    throw new Error('수식을 다시 선택해 주세요.');
  if (!Number.isFinite(percent) || percent < MATH_SCALE_MIN * 100 || percent > MATH_SCALE_MAX * 100)
    throw new Error('수식 크기는 50~300%로 입력해 주세요.');
  const scale = Math.round(percent) / 100;
  if (mathFontScale(node.attributes?.fontScale) === scale) return;
  const result = await transaction(editor, [{ type: 'setAttrs', payload: {
    nodeId: target.id, attrs: { fontScale: scale === 1 ? null : scale }
  } }] as never).commit();
  if (!result.success) throw new Error('수식 크기를 변경하지 못했습니다.');
}
