import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * mergeBlockNodes operation (runtime)
 *
 * 목적
 * - 동일 타입의 인접 블록 노드 두 개를 병합한다. DataStore.splitMerge.mergeBlockNodes 사용.
 *
 * 입력 형태(DSL)
 * - mergeBlockNodes(leftNodeId, rightNodeId)
 * - control(leftNodeId, [ mergeBlockNodes(rightNodeId) ]) → payload: { rightNodeId } (left는 control이 주입)
 */

defineOperation('mergeBlockNodes', async (operation: any, context: TransactionContext) => {
  const { leftNodeId, rightNodeId } = operation.payload;

  const left = context.dataStore.getNode(leftNodeId);
  const right = context.dataStore.getNode(rightNodeId);
  if (!left) throw new Error(`Node not found: ${leftNodeId}`);
  if (!right) throw new Error(`Node not found: ${rightNodeId}`);
  if (left.type !== right.type) throw new Error(`Cannot merge different node types: ${left.type} and ${right.type}`);

  const leftChildrenCount = Array.isArray((left as any).content) ? (left as any).content.length : 0;
  const mergedNodeId = context.dataStore.splitMerge.mergeBlockNodes(leftNodeId, rightNodeId);
  return {
    ok: true,
    data: mergedNodeId,
    inverse: { type: 'splitBlockNode', payload: { nodeId: mergedNodeId, splitPosition: leftChildrenCount } }
  };
});



