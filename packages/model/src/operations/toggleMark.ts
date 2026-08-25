import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL, type DSLOperationDescriptor } from './define-operation-dsl';

/**
 * toggleMark operation (runtime)
 *
 * 목적
 * - 단일 노드에서 특정 범위(range)의 특정 타입(markType) 마크를 토글한다.
 *   - 동일 범위/타입이 존재하면 제거, 없으면 추가한다.
 * - 전체 범위(range: { startNodeId, startOffset, endNodeId, endOffset })를 넘기면
 *   DataStore.range.toggleMark에 위임하여 단일/복수 노드 자동 처리.
 * - 마크 정규화/검증 정책은 DataStore 전용 API에 위임한다.
 *
 * 입력 형태(DSL)
 * - toggleMark(range, markType, attrs?) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, markType, attrs? }
 * - control(nodeId, [ toggleMark(markType, range, attrs?) ]) → payload: { nodeId, markType, range, attrs? }
 * - toggleMark(nodeId, markType, range, attrs?) → payload: { nodeId, markType, range, attrs? }
 *
 * Selection 매핑
 * - 마크 토글은 selection 이동을 유발하지 않는다. preserve.
 *
 * 예외 처리
 * - DataStore.marks.toggleMark / DataStore.range.toggleMark 실패 시 예외 승격.
 */

/**
 * toggleMark operation DSL
 *
 * 목적
 * - 지정한 범위에 마크를 토글한다. DataStore.range.toggleMark 또는 DataStore.marks.toggleMark를 사용한다.
 *
 * 입력 형태(DSL)
 * - control(target, [ toggleMark(markType, range, attrs?) ]) → payload: { nodeId, markType, range, attrs? }
 * - toggleMark(nodeId, markType, range, attrs?) → payload: { nodeId, markType, range, attrs? }
 * - toggleMark(startId, startOffset, endId, endOffset, markType, attrs?) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, markType, attrs? }
 */

type ToggleMarkOperationPayload =
  | {
      range: { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number };
      markType: string;
      attrs?: Record<string, any>;
    }
  | { markType: string; range: [number, number]; attrs?: Record<string, any> }
  | { nodeId: string; markType: string; range: [number, number]; attrs?: Record<string, any> };

export const toggleMark = defineOperationDSL(
  (
    ...args:
      | [string, [number, number], (Record<string, any>)?]
      | [string, string, [number, number], (Record<string, any>)?]
      | [string, number, string, number, string, (Record<string, any>)?]
  ): DSLOperationDescriptor<ToggleMarkOperationPayload> => {
    // cross-node: (startId, startOffset, endId, endOffset, markType, attrs?)
    if (args.length >= 5 && typeof args[0] === 'string' && typeof args[1] === 'number' && typeof args[2] === 'string' && typeof args[3] === 'number' && typeof args[4] === 'string') {
      const [startId, startOffset, endId, endOffset, markType, attrs] = args as [string, number, string, number, string, (Record<string, any>)?];
      return { type: 'toggleMark', payload: { range: { startNodeId: startId, startOffset, endNodeId: endId, endOffset }, markType, attrs } };
    }
    // control / single-node: (markType, range, attrs?)
    if (args.length >= 2 && typeof args[0] === 'string' && Array.isArray(args[1])) {
      const [markType, range, attrs] = args as [string, [number, number], (Record<string, any>)?];
      return { type: 'toggleMark', payload: { markType, range, attrs } };
    }
    // direct single-node: (nodeId, markType, range, attrs?)
    const [nodeId, markType, range, attrs] = args as [string, string, [number, number], (Record<string, any>)?];
    return { type: 'toggleMark', payload: { nodeId, markType, range, attrs } };
  },
  { atom: false, category: 'marks' }
);

/**
 * The marks a node had, so undo can put exactly those back.
 *
 * Toggling twice is only the identity if nothing happened in between, and
 * something usually does — the text can be rewritten, and the mark that was
 * toggled on can be gone by the time undo toggles it "off", which then puts it
 * on. Measured: bold applied, the text wrapped in asterisks (which dropped the
 * marks), and undoing both left the text bold that had started plain.
 *
 * `applyMark` learned this first. Restoring the list is exact, and it is a
 * short list on one node.
 */
const marksBefore = (dataStore: any, nodeId: string) => {
  const node = dataStore.getNode(nodeId);
  return Array.isArray(node?.marks) ? JSON.parse(JSON.stringify(node.marks)) : [];
};

defineOperation('toggleMark', async (operation: any, context: TransactionContext) => {
  const payload = operation.payload;
  const markType = payload.markType;
  const attrs = payload.attrs;

  // 전체 범위(selection) 형태: range: { startNodeId, startOffset, endNodeId, endOffset }
  if (payload.range && 'startNodeId' in payload.range && 'endNodeId' in payload.range) {
    const range = payload.range as { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number };
    let { startNodeId, startOffset, endNodeId, endOffset } = range;

    // Collapsed(커서): 1글자 구간으로 확장하여 토글 적용
    if (startNodeId === endNodeId && startOffset === endOffset) {
      const node = context.dataStore.getNode(startNodeId);
      if (node && typeof node.text === 'string') {
        endOffset = Math.min(startOffset + 1, node.text.length);
      }
    }

    if (!context.dataStore.range || typeof context.dataStore.range.toggleMark !== 'function') {
      throw new Error('DataStore.range.toggleMark is not available');
    }

    const contentRange = { type: 'range' as const, startNodeId, startOffset, endNodeId, endOffset };
    const before = startNodeId === endNodeId ? marksBefore(context.dataStore, startNodeId) : null;
    context.dataStore.range.toggleMark(contentRange, markType, attrs);

    return {
      ok: true,
      // Exactly what the run carried before, not "toggle it again".
      // A mark spanning several nodes has no single operation that restores
      // them all, so it says nothing rather than restoring only the first.
      ...(before ? { inverse: { type: 'setMarks', payload: { nodeId: startNodeId, marks: before } } } : {})
    };
  }

  // 단일 노드 형태: nodeId + range [start, end]
  const { nodeId, range } = payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);
  const beforeSingle = marksBefore(context.dataStore, nodeId);

  if (!context.dataStore.marks || typeof context.dataStore.marks.toggleMark !== 'function') {
    throw new Error('DataStore.marks.toggleMark is not available');
  }

  const result = context.dataStore.marks.toggleMark(nodeId, markType, range, attrs);
  if (!result || result.valid !== true) {
    const message = result?.errors?.[0] || 'Toggle mark failed';
    throw new Error(message);
  }

  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    inverse: { type: 'setMarks', payload: { nodeId, marks: beforeSingle } }
  };
});

