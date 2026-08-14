import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';

/**
 * Cutting one run back into the runs it was made from.
 *
 * `autoMergeTextNodes` sweeps outwards from a run joining every adjacent one it
 * can, and it was the last operation here with no way back — the roster
 * recorded that as a decision, on the grounds that undoing it would mean
 * knowing where each join had been.
 *
 * Which is exactly what it can be told. A split can now be given the id the
 * new half is to carry, so the pieces can be put back with the identities they
 * had, and every inverse collected before the merge that names one of them
 * still finds it. So the sweep records the pieces it swallowed, and this puts
 * them back.
 *
 * payload
 * - nodeId: the run they were merged into
 * - pieces: the original runs, in order, as `{ sid, length }` — the first of
 *   them is `nodeId` itself and keeps the head of the text
 */

export interface RestoreTextNodesPayload {
  nodeId: string;
  pieces: { sid: string; length: number }[];
}

export const restoreTextNodes = defineOperationDSL(
  (nodeId: string, pieces: { sid: string; length: number }[]) => ({
    type: 'restoreTextNodes',
    payload: { nodeId, pieces }
  }),
  { atom: false, category: 'content' }
);

defineOperation('restoreTextNodes', async (operation: { payload: RestoreTextNodesPayload }, context: TransactionContext) => {
  const { nodeId, pieces } = operation.payload;
  const dataStore = context.dataStore;

  const node = dataStore.getNode(nodeId);
  if (!node) throw new Error(`restoreTextNodes: node not found: ${nodeId}`);
  if (typeof (node as { text?: string }).text !== 'string') {
    throw new Error(`restoreTextNodes: ${nodeId} is not a text node`);
  }
  if (!Array.isArray(pieces) || pieces.length < 2) {
    return { ok: false, error: 'restoreTextNodes: fewer than two pieces is not a split' };
  }

  const text = (node as { text: string }).text;
  const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
  if (total !== text.length) {
    return {
      ok: false,
      error:
        `restoreTextNodes: the pieces are ${total} characters and ${nodeId} holds ${text.length} — ` +
        `it is not the run they were merged into`
    };
  }

  /**
   * Cut from the end backwards.
   *
   * Each cut leaves the head in the node being split and hands the tail to the
   * new one, so working from the last boundary towards the first means every
   * offset is still an offset into the node holding it.
   */
  let carrying = nodeId;
  const restored: string[] = [];
  for (let index = pieces.length - 1; index >= 1; index -= 1) {
    const at = pieces.slice(0, index).reduce((sum, piece) => sum + piece.length, 0);
    dataStore.splitMerge.splitTextNode(carrying, at, pieces[index].sid);
    restored.unshift(pieces[index].sid);
  }

  return {
    ok: true,
    data: [nodeId, ...restored],
    // Joining them again is what this undoes, and the sweep is told where to
    // start: the run that kept the head.
    inverse: { type: 'autoMergeTextNodes', payload: { nodeId } }
  };
});
