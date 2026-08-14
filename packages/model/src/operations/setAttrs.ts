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
  const { nodeId, attrs, replace = false } = operation.payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  /**
   * What the node had, copied — not the node's own object.
   *
   * The inverse used to carry `node.attributes` itself, which the store then
   * went on to update: by the time undo read it, it held the new values and
   * putting them back changed nothing. Setting the same attribute twice and
   * undoing twice left the second value in place.
   */
  const previous = { ...(node.attributes || {}) };

  // Use updateNode to go through schema validation
  const next = replace ? { ...attrs } : { ...previous, ...attrs };
  const result = context.dataStore.updateNode(nodeId, { attributes: next });
  if (!result || result.valid !== true) {
    const message = result?.errors?.[0] || 'Update failed';
    throw new Error(message);
  }
  if (replace) {
    // `updateNode` merges, so an attribute the node no longer has would survive
    // the merge. Undo has to be able to take one away.
    const current = context.dataStore.getNode(nodeId);
    if (current) context.dataStore.setNode({ ...current, attributes: { ...attrs } } as any, false);
  }
  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    // Replaced, not merged: this operation adds attributes, and undoing it has
    // to be able to remove the ones it added.
    inverse: { type: 'setAttrs', payload: { nodeId, attrs: previous, replace: true } }
  };
});


