import { defineOperationDSL } from './define-operation-dsl';
import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * setAttrs operation (DSL + runtime)
 *
 * - control(nodeId, [ setAttrs(attrs) ]) → { type: 'setAttrs', payload: { attrs } }
 * - setAttrs(nodeId, attrs) → { type: 'setAttrs', payload: { nodeId, attrs } }
 */
export const setAttrs = defineOperationDSL(
  (...args: [Record<string, any>] | [string, Record<string, any>]) => {
    if (args.length === 1) {
      const [attrs] = args;
      return { type: 'setAttrs', payload: { attrs } } as any;
    }
    const [nodeId, attrs] = args as [string, Record<string, any>];
    return { type: 'setAttrs', payload: { nodeId, attrs } } as any;
  },
  { atom: true, category: 'attributes' }
);

// Runtime operation implementation
defineOperation('setAttrs', async (operation: any, context: TransactionContext) => {
  const { nodeId, attrs } = operation.payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  // Use updateNode to go through schema validation
  const result = context.dataStore.updateNode(nodeId, { attributes: { ...(node.attributes || {}), ...attrs } });
  if (!result || result.valid !== true) {
    const message = result?.errors?.[0] || 'Update failed';
    throw new Error(message);
  }
  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    inverse: { type: 'setAttrs', payload: { nodeId, attrs: node.attributes } }
  };
});


