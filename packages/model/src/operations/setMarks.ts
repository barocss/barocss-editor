import { defineOperationDSL } from './define-operation-dsl';
import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * setMarks operation (DSL + runtime)
 *
 * 목적
 * - 단일 텍스트 노드의 marks 배열을 지정된 목록으로 설정한다.
 * - 마크 정규화/검증 정책은 DataStore 전용 API에 위임한다.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ setMarks(marks) ]) → payload: { marks }
 * - setMarks(nodeId, marks) → payload: { nodeId, marks }
 *   - 빌더는 control(target, …)에서 target을 nodeId로 주입한다.
 *
 * Selection 매핑
 * - marks 변경은 selection 이동을 유발하지 않는다. preserve.
 *
 * 예외 처리
 * - DataStore의 전용 API가 실패를 던지거나, fallback(updateNode)에서 valid=false이면 예외 승격한다.
 */

export interface MarkSpec {
  stype: string;
  attrs?: Record<string, any>;
  range?: [number, number];
}

// DSL: Used in control(target, [setMarks(marks)]) form
export const setMarks = defineOperationDSL(
  (marks: MarkSpec[]) => ({
    type: 'setMarks',
    payload: { marks }
  }),
  { atom: false, category: 'marks' }
);

// Runtime operation implementation
defineOperation('setMarks', async (operation: any, context: TransactionContext) => {
  const { nodeId, marks, restoreAbsent } = operation.payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const marksBefore = Array.isArray(node.marks)
    ? JSON.parse(JSON.stringify(node.marks))
    : undefined;
  
  // Undo must preserve an omitted native marks field. Normal writes and array
  // restoration still use the dedicated API and its existing normalization.
  const result = restoreAbsent === true && marks === undefined
    ? context.dataStore.updateNode(nodeId, { marks: undefined }, false)
    : context.dataStore.marks.setMarks(nodeId, marks);
  
  if (!result || result.valid !== true) {
    const message = result?.errors?.[0] || 'Update marks failed';
    throw new Error(message);
  }

  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    inverse: {
      type: 'setMarks',
      payload: { nodeId, marks: marksBefore, restoreAbsent: marksBefore === undefined }
    }
  };
});


