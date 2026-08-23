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

  /**
   * `null` **removes** the attribute.
   *
   * Because there was no other way to take one off. A string could pretend with `''`
   * and an array with `null` — which stored a null rather than removing anything — and
   * a **number** had nothing at all: `0` is a value, and the schema refuses `''` for a
   * number, so the whole transaction was rejected. Measured on a connector's `endT`,
   * the fraction along a line an end holds: moving that end onto a shape returned
   * false and the reader's drag did nothing.
   *
   * So "not set" is expressible for every type, once, here — rather than each product
   * inventing a value that means absent and every reader of the attribute having to
   * know which one it was.
   *
   * Only on the **merge**. `replace` is the inverse's path and restores exactly what
   * the node had, nulls included: a document that arrived with one keeps it through an
   * undo rather than being quietly tidied.
   */
  const removing = replace
    ? []
    : Object.keys(attrs ?? {}).filter((key) => attrs[key] === null || attrs[key] === undefined);

  const merged = { ...previous, ...attrs };
  for (const key of removing) delete merged[key];

  // Use updateNode to go through schema validation
  const next = replace ? { ...attrs } : merged;
  const result = context.dataStore.updateNode(nodeId, { attributes: next });
  if (!result || result.valid !== true) {
    const message = result?.errors?.[0] || 'Update failed';
    throw new Error(message);
  }
  if (replace || removing.length > 0) {
    // `updateNode` merges, so an attribute the node no longer has would survive the
    // merge — which is true of a removal for the same reason it is true of undo.
    const current = context.dataStore.getNode(nodeId);
    if (current) context.dataStore.setNode({ ...current, attributes: { ...next } } as any, false);
  }
  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    // Replaced, not merged: this operation adds attributes, and undoing it has
    // to be able to remove the ones it added.
    inverse: { type: 'setAttrs', payload: { nodeId, attrs: previous, replace: true } }
  };
});


