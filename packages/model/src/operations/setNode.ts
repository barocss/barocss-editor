import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';
import type { INode } from '@barocss/datastore';

export interface SetNodeOperation {
  type: 'setNode';
  node: INode;
  validate?: boolean;
}

/**
 * Node set/create operation
 * 
 * Sets or creates a node in DataStore.
 * Uses DataStore's setNode method for efficient processing.
 */
defineOperation('setNode', async (operation: SetNodeOperation, context: TransactionContext) => {
  /**
   * From either place, because its own DSL puts it in one and this read the
   * other: `setNode(node)` builds `{ payload: { node } }` and this took
   * `operation.node`, so every descriptor the DSL produced threw "Node must
   * have an id" on a node that had one.
   */
  const payload = (operation as unknown as { payload?: SetNodeOperation }).payload;
  const node = operation.node ?? payload?.node;
  const validate = operation.validate ?? payload?.validate ?? true;

  // 1. Check node ID
  if (!node?.sid) {
    throw new Error('Node must have an id');
  }

  /**
   * What was there before, which is what undo writes back.
   *
   * A whole-node write is undone by a whole-node write, and by nothing else:
   * the node may have changed type, text, attributes and children at once. If
   * there was nothing there, the way back is to take the new node out again.
   */
  const before = context.dataStore.getNode(node.sid);
  const previous = before ? JSON.parse(JSON.stringify(before)) : null;

  // 2. Use DataStore's setNode method
  // This method automatically handles ID generation, validation, timestamp updates, etc.
  context.dataStore.setNode(node, validate);

  const written = context.dataStore.getNode(node.sid);
  const parentId = previous ? null : written?.parentId;

  // 3. Return set node
  return {
    ok: true,
    data: written,
    ...(previous
      ? { inverse: { type: 'setNode', payload: { node: previous, validate: false } } }
      : parentId
        ? { inverse: { type: 'removeChild', payload: { parentId, childId: node.sid } } }
        : { inverse: { type: 'delete', payload: { nodeId: node.sid } } })
  };
});

export const setNode = defineOperationDSL(
  (node: INode, validate?: boolean) => ({
    type: 'setNode',
    payload: { node, validate }
  }),
  { atom: false, category: 'content' }
);
