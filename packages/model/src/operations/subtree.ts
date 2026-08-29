import type { TransactionContext } from '../types';

/**
 * A node **and everything under it**, as a tree — what an inverse has to keep.
 *
 * ## The fault this exists for
 *
 * `removeChild` and `removeChildren` both built their inverse out of
 * `dataStore.getNode(childId)`. A stored node's `content` is an array of **sids**, and the moment
 * the node is removed those sids resolve to nothing — so `addChild` put the node back with an empty
 * `content`. Measured: delete a paragraph, press undo, and the paragraph comes back **without its
 * words**. The document has the right shape and the writing is gone, which is the one class of fault
 * worse than a command that does nothing.
 *
 * It survived because everything about it looks right. The removal works, the undo runs, the node
 * reappears, the count of paragraphs is correct, and no test compared what was inside one. It was
 * found by asking a different question entirely — the extensions' conformance run put every command
 * through *change the document, then undo it, then compare* — which is the question the check's own
 * documentation says is two answers for the price of one.
 *
 * ## Why here rather than `DataStoreExporter`
 *
 * The exporter is the right shape and takes a whole document from its root; an inverse needs one
 * branch, resolved the same way, without the loading machinery around it. Six lines, and it is the
 * thing both removals were missing.
 */
export function subtreeOf(context: TransactionContext, sid: string): Record<string, unknown> | null {
  const node = context.dataStore.getNode(sid) as unknown as Record<string, unknown> | undefined;
  if (!node) return null;

  const held = node.content;
  if (!Array.isArray(held)) return { ...node };

  return {
    ...node,
    /*
     * A child that is already a node rather than a sid is passed through: the store hands out both
     * shapes depending on how a tree was built, and resolving only the strings keeps this honest
     * about which is which.
     */
    content: held.map((child) => (typeof child === 'string' ? subtreeOf(context, child) : child)).filter(Boolean)
  };
}
