import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';

/**
 * transformNode operation (DSL + runtime)
 *
 * 노드 타입을 변환합니다 (paragraph → heading, heading → paragraph 등).
 * 
 * - transformNode(nodeId, newType, newAttrs?) → { type: 'transformNode', payload: { nodeId, newType, newAttrs? } }
 * - control(nodeId, [ transformNode(newType, newAttrs?) ]) → { type: 'transformNode', payload: { newType, newAttrs? } }
 */
export const transformNode = defineOperationDSL(
  (...args: [string, (Record<string, any>)?] | [string, string, (Record<string, any>)?]) => {
    if (args.length >= 2 && typeof args[1] === 'string') {
      const [nodeId, newType, newAttrs] = args as [string, string, (Record<string, any>)?];
      return { type: 'transformNode', payload: { nodeId, newType, newAttrs } };
    }
    const [newType, newAttrs] = args as [string, (Record<string, any>)?];
    return { type: 'transformNode', payload: { newType, newAttrs } };
  },
  { atom: false, category: 'content' }
);

// Runtime operation implementation
defineOperation('transformNode', async (operation: any, context: TransactionContext) => {
  const { nodeId, newType, newAttrs } = operation.payload;
  
  if (!nodeId) {
    throw new Error('Node ID is required for transformNode operation');
  }
  
  if (!newType) {
    throw new Error('New type is required for transformNode operation');
  }

  const node = context.dataStore.getNode(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const result = context.dataStore.transformNode(nodeId, newType, newAttrs);
  if (!result || result.valid !== true) {
    const message = result?.errors?.[0] || 'Transform node failed';
    throw new Error(message);
  }

  return {
    ok: true,
    data: context.dataStore.getNode(result.newNodeId || nodeId),
    inverse: { 
      type: 'transformNode', 
      payload: { nodeId: result.newNodeId || nodeId, newType: node.stype, newAttrs: node.attributes } 
    }
  };
});

