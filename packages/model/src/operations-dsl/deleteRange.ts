import { defineOperationDSL } from '../operations/define-operation-dsl';

/**
 * deleteRange operation DSL
 *
 * 목적
 * - 지정한 범위(단일/복수 노드)의 텍스트를 삭제한다. DataStore.range.deleteText에 위임한다.
 *
 * 입력 형태(DSL)
 * - deleteRange(range) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset } }
 */
export const deleteRange = defineOperationDSL(
  (range: { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number }) => ({
    type: 'deleteRange',
    payload: { range }
  }),
  { atom: false, category: 'text' }
);
