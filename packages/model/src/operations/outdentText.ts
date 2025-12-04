import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import type { ModelSelection } from '@barocss/editor-core';

/**
 * outdentText operation (runtime)
 *
 * 목적
 * - 지정 범위의 각 줄 앞에서 들여쓰기 문자열을 제거한다. DataStore.range.outdent 사용.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ outdentText(start, end, indentStr?) ]) → payload: { start, end, indent? }
 * - outdentText(startId, startOffset, endId, endOffset, indentStr?) → payload: { range, indent? }
 * - outdentText(nodeId, start, end, indentStr?) → payload: { nodeId, start, end, indent? }
 */

type OutdentTextOperationPayload =
  | { type: 'outdentText'; nodeId: string; start: number; end: number; indent?: string }
  | { type: 'outdentText'; range: ModelSelection; indent?: string };

defineOperation('outdentText', async (operation: any, context: TransactionContext) => {
  try {
    const payload = operation.payload;
    const indent = payload.indent ?? '  ';
    
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
      if (typeof startOffset !== 'number' || typeof endOffset !== 'number') {
        throw new Error('Invalid range');
      }
      const result = context.dataStore.range.outdent(range, indent);
      return {
        ok: true,
        data: result,
        inverse: { type: 'indentText', payload: { range, indent } }
      };
    }
    
    const { nodeId, start, end } = payload;
    const node = context.dataStore.getNode(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (typeof node.text !== 'string') {
      throw new Error(`Node ${nodeId} is not a text node`);
    }
    if (typeof start !== 'number' || typeof end !== 'number' || start > end || start < 0 || end > (node.text as string).length) {
      throw new Error('Invalid range');
    }
    const range: ModelSelection = {
      type: 'range',
      startNodeId: nodeId,
      startOffset: start,
      endNodeId: nodeId,
      endOffset: end,
      collapsed: false,
      direction: 'forward'
    };
    const result = context.dataStore.range.outdent(range, indent);
    return {
      ok: true,
      data: result,
      inverse: { type: 'indentText', payload: { nodeId, start, end, indent } }
    };
  } catch (e) {
    throw new Error(`Failed to outdent text: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
});

