import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * mergeTextNodes operation (runtime)
 *
 * 목적
 * - 인접한 두 텍스트 노드를 하나로 병합한다. DataStore.splitMerge.mergeTextNodes 사용.
 *
 * 입력 형태(DSL)
 * - mergeTextNodes(leftNodeId, rightNodeId)
 * - control(leftNodeId, [ mergeTextNodes(rightNodeId) ])
 *   → payload: { leftNodeId?, rightNodeId }
 *   - control 형태에서는 빌더가 leftNodeId를 주입한다.
 */

defineOperation('mergeTextNodes', async (operation: any, context: TransactionContext) => {
  const { leftNodeId, rightNodeId } = operation.payload;

  const left = context.dataStore.getNode(leftNodeId);
  const right = context.dataStore.getNode(rightNodeId);
  if (!left) throw new Error(`Node not found: ${leftNodeId}`);
  if (!right) throw new Error(`Node not found: ${rightNodeId}`);
  
  // 노드는 stype 필드를 사용합니다
  const leftType = left.stype;
  const rightType = right.stype;
  
  if (typeof left.text !== 'string') {
    throw new Error(`Left node is not a text node: ${leftType || 'unknown'}`);
  }
  if (typeof right.text !== 'string') {
    throw new Error(`Right node is not a text node: ${rightType || 'unknown'}`);
  }

  const leftTextLen = (left.text as string).length;
  const mergedNodeId = context.dataStore.splitMerge.mergeTextNodes(leftNodeId, rightNodeId);
  return {
    ok: true,
    data: mergedNodeId,
    inverse: { type: 'splitTextNode', payload: { nodeId: mergedNodeId, splitPosition: leftTextLen } }
  };
});



