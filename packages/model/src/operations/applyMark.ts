import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';
import { marksAllowed } from './marks-allowed';

/**
 * applyMark operation (DSL + runtime)
 *
 * 목적
 * - 지정한 범위에 마크를 적용한다. DataStore.range.applyMark를 사용한다.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ applyMark(start, end, markType, attrs?) ])
 *   → payload: { start, end, markType, attrs? }
 * - control(nodeId, [ applyMark(startId, startOffset, endId, endOffset, markType, attrs?) ])
 *   → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, markType, attrs? }
 * - applyMark(nodeId, start, end, markType, attrs?)
 *   → payload: { nodeId, start, end, markType, attrs? }
 * - applyMark(startId, startOffset, endId, endOffset, markType, attrs?)
 *   → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, markType, attrs? }
 *
 * Selection 매핑
 * - 마크 적용은 selection 이동을 유발하지 않는다.
 *
 * 예외 처리
 * - 노드 존재/타입(텍스트) 검증 및 범위 검증을 수행하고, 실패 시 명확한 예외를 던진다.
 */

type ApplyMarkOperationPayload =
  | {
      type: 'applyMark';
      nodeId: string;
      start: number;
      end: number;
      markType: string;
      attrs?: Record<string, any>;
    }
  | {
      type: 'applyMark';
      range: { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number };
      markType: string;
      attrs?: Record<string, any>;
    };


/**
 * applyMark operation DSL
 *
 * 목적
 * - 지정한 범위에 마크를 적용한다. DataStore.range.applyMark를 사용한다.
 *
 * 입력 형태(DSL)
 * - control(target, [ applyMark(start, end, markType, attrs?) ]) → payload: { start, end, markType, attrs? }
 * - applyMark(nodeId, start, end, markType, attrs?) → payload: { nodeId, start, end, markType, attrs? }
 * - applyMark(startId, startOffset, endId, endOffset, markType, attrs?) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, markType, attrs? }
 */

export const applyMark = defineOperationDSL(
  (
    ...args:
      | [number, number, string, (Record<string, any>)?]
      | [string, number, string, number, string, (Record<string, any>)?]
      | [string, number, number, string, (Record<string, any>)?]
  ) => {
    // control: (start, end, markType, attrs?)
    if (args.length >= 3 && typeof args[0] === 'number' && typeof args[2] === 'string') {
      const [start, end, markType, attrs] = args as [number, number, string, (Record<string, any>)?];
      return { type: 'applyMark', payload: { start, end, markType, attrs } } as unknown as ApplyMarkOperationPayload;
    }
    // cross-node: (startId, startOffset, endId, endOffset, markType, attrs?)
    if (args.length >= 5 && typeof args[0] === 'string' && typeof args[2] === 'string' && typeof args[4] === 'string') {
      const [startId, startOffset, endId, endOffset, markType, attrs] = args as [string, number, string, number, string, (Record<string, any>)?];
      return { type: 'applyMark', payload: { range: { type: 'range' as const, startNodeId: startId, startOffset, endNodeId: endId, endOffset }, markType, attrs } } as unknown as ApplyMarkOperationPayload;
    }
    // direct single-node: (nodeId, start, end, markType, attrs?)
    const [nodeId, start, end, markType, attrs] = args as [string, number, number, string, (Record<string, any>)?];
    return { type: 'applyMark', payload: { nodeId, start, end, markType, attrs } } as unknown as ApplyMarkOperationPayload;
  },
  { atom: false, category: 'marks' }
);

/**
 * The marks a node had, so that undo can put exactly those back.
 *
 * Taking the mark off the range it was applied to is not the inverse of putting
 * it on: a range that was already partly bold comes back not-bold, because
 * `removeMark` clears the range rather than reversing what this did. Applying
 * bold over overlapping ranges and undoing in reverse left text unbolded that
 * had been bold before anyone touched it.
 *
 * Restoring the whole list is exact, and marks are a small list on one node.
 */
const marksBefore = (dataStore: any, nodeId: string) => {
  const node = dataStore.getNode(nodeId);
  return Array.isArray(node?.marks) ? JSON.parse(JSON.stringify(node.marks)) : [];
};

defineOperation('applyMark', async (operation: { payload: ApplyMarkOperationPayload }, context: TransactionContext) => {
  try {
    const payload = operation.payload;
    if (!payload) throw new Error('Operation payload is required');
    const markType = payload.markType;
    const attrs = payload.attrs;

    // 전체 범위(selection): DataStore.range.applyMark에 위임 (단일/복수 노드 동일 처리)
    if ('range' in payload) {
      const { range } = payload;
      const { startNodeId, endNodeId, startOffset, endOffset } = range;
      const startNode = context.dataStore.getNode(startNodeId);
      const endNode = context.dataStore.getNode(endNodeId);
      if (!startNode) throw new Error(`Node not found: ${startNodeId}`);
      if (!endNode) throw new Error(`Node not found: ${endNodeId}`);
      if (typeof startNode.text !== 'string' || typeof endNode.text !== 'string') {
        throw new Error('Range endpoints must be text nodes');
      }
      if (typeof startOffset !== 'number' || typeof endOffset !== 'number') throw new Error('Invalid range');
      if (!marksAllowed(context, startNodeId, markType) || !marksAllowed(context, endNodeId, markType)) {
        throw new Error(`Mark '${markType}' is not allowed here`);
      }
      if (!context.dataStore.range || typeof context.dataStore.range.applyMark !== 'function') {
        throw new Error('DataStore.range.applyMark is not available');
      }
      const contentRange = { type: 'range' as const, startNodeId, startOffset, endNodeId, endOffset };
      const mark = { stype: markType, attrs };
      /**
       * Every node this will write to, as it was.
       *
       * Both ends, not just the first. Applying a mark now *replaces* the marks
       * of its type over the range — a run has one colour, and appending left
       * the reader with the older of two — so an inverse that restored only the
       * start node would undo half of it and leave the far end recoloured with
       * nothing said. `range.applyMark` writes to the two endpoints and no
       * further, which is the same lightweight path this has always taken.
       */
      const before: Array<{ nodeId: string; marks: unknown[] }> = [
        { nodeId: startNodeId, marks: marksBefore(context.dataStore, startNodeId) },
        ...(startNodeId === endNodeId
          ? []
          : [{ nodeId: endNodeId, marks: marksBefore(context.dataStore, endNodeId) }])
      ];
      context.dataStore.range.applyMark(contentRange, mark);
      /**
       * An inverse, so that undo takes the mark off again.
       *
       * Only the single-node form used to report one, so applying bold across a
       * selection — the way a reader actually applies bold — produced nothing
       * for undo to do, and Ctrl+Z left the text bold.
       *
       * Exactly what each node carried before, not "take this range off": the
       * range may have been partly marked already, and clearing it would take
       * away formatting this operation never added.
       */
      const undo = before.map((was) => ({
        type: 'setMarks',
        payload: { nodeId: was.nodeId, marks: was.marks }
      }));
      return {
        ok: true,
        data: context.dataStore.getNode(startNodeId === endNodeId ? startNodeId : endNodeId),
        inverse:
          undo.length === 1 ? undo[0] : { type: 'batch', payload: { operations: undo } }
      };
    }

    // 단일 노드(nodeId + start + end): marks.setMarks로 적용 (inverse 반환용)
    const { nodeId, start, end } = payload;
    const node = context.dataStore.getNode(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (typeof node.text !== 'string') throw new Error(`Node ${nodeId} is not a text node`);
    if (typeof start !== 'number' || typeof end !== 'number' || start >= end || start < 0 || end > (node.text as string).length) {
      throw new Error('Invalid range');
    }
    if (!marksAllowed(context, nodeId, markType)) {
      throw new Error(`Mark '${markType}' is not allowed here`);
    }
    // Read before the write, since the write is what it is the inverse of.
    const had = marksBefore(context.dataStore, nodeId);
    /**
     * Applied through the store's own range path rather than by writing the
     * mark list here.
     *
     * That path makes room before it adds — a character has one colour, and
     * appending left a recoloured run carrying both marks with the older one
     * winning — and which marks that happens to is the schema's answer, not this
     * operation's. Writing the list here meant a second copy of that rule, and
     * a second copy is where the two would disagree.
     */
    if (!context.dataStore.range || typeof context.dataStore.range.applyMark !== 'function') {
      throw new Error('DataStore.range.applyMark is not available');
    }
    context.dataStore.range.applyMark(
      { type: 'range' as const, startNodeId: nodeId, startOffset: start, endNodeId: nodeId, endOffset: end },
      { stype: markType, attrs } as never
    );
    
    return {
      ok: true,
      data: context.dataStore.getNode(nodeId),
      /**
       * What the node carried, rather than "take this range off".
       *
       * `removeMark` over the range was near enough while applying only
       * appended; now that it replaces, the marks it cut have to come back, and
       * only the list can say what they were.
       */
      inverse: { type: 'setMarks', payload: { nodeId, marks: had } }
    };
  } catch (e) {
    throw new Error(`Failed to apply mark: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
});

// DSL (control/direct, single/cross node)
// DSL definition will be separated into a separate file


