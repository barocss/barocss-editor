import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';

/**
 * Putting the words back into the runs they were taken out of.
 *
 * ## The fault this is the answer to
 *
 * `deleteRange` offered **no inverse at all** for a range spanning more than one text node, and said
 * why: *"A deletion spanning several nodes removes structure as well as characters, and re-inserting
 * a string would not rebuild it — so rather than offer an inverse that half-works, it offers none."*
 *
 * The reasoning is careful and the premise is wrong. `range.deleteText` **removes no structure**: it
 * truncates the run the range starts in, empties the runs between, and trims the run it ends in.
 * Nothing is added and nothing is taken away — only text and marks are rewritten, on a set of nodes
 * that all still exist afterwards. So the deletion is exactly reversible, and choosing not to try
 * cost the worst thing in this repository:
 *
 * **Select across two paragraphs, press Backspace, press ⌘Z, and the words are gone for good.** The
 * everyday gesture, in all three products, losing text silently. Found by the extensions'
 * conformance run the first time its probe was given a range that spanned two nodes.
 *
 * ## Why an operation rather than several
 *
 * An inverse is one operation, and putting a cross-node deletion back is several nodes' worth of
 * text and marks. `restoreTextNodes` is the precedent and the argument: `autoMergeTextNodes` was
 * recorded here as the last operation with no way back, on the grounds that undoing it would mean
 * knowing where each join had been — and the answer was that it can be **told**. So can this.
 *
 * Its own inverse is itself, with what was there before it ran, which is what makes redo work.
 */
export interface RestoreRunsPayload {
  /** Each run, by its durable id, with the whole of what it held. */
  runs: { sid: string; text: string; marks?: unknown[] }[];
}

export const restoreRuns = defineOperationDSL(
  (runs: RestoreRunsPayload['runs']) => ({ type: 'restoreRuns', payload: { runs } } as never),
  { atom: false, category: 'content' }
);

defineOperation('restoreRuns', async (operation: { payload: RestoreRunsPayload }, context: TransactionContext) => {
  const runs = operation.payload?.runs;
  if (!Array.isArray(runs) || runs.length === 0) {
    return { ok: false, error: 'restoreRuns: nothing to restore' };
  }

  /*
   * What is there now, captured before anything is written — which is this operation's own inverse
   * and therefore what makes a redo of the deletion possible.
   */
  const held: RestoreRunsPayload['runs'] = [];
  for (const run of runs) {
    const node = context.dataStore.getNode(run.sid) as { text?: string; marks?: unknown[] } | undefined;
    if (!node || typeof node.text !== 'string') {
      return { ok: false, error: `restoreRuns: ${run.sid} is not a run of text` };
    }
    held.push({ sid: run.sid, text: node.text, marks: node.marks ? JSON.parse(JSON.stringify(node.marks)) : [] });
  }

  for (const run of runs) {
    context.dataStore.updateNode(run.sid, { text: run.text, marks: run.marks ?? [] } as never, false);
  }

  return {
    ok: true,
    data: runs.length,
    inverse: { type: 'restoreRuns', payload: { runs: held } }
  };
});
