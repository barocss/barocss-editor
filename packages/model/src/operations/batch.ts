import { defineOperation, globalOperationRegistry } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';

/**
 * Several operations as one, and one inverse for all of them.
 *
 * `transaction.ts` collects one `inverse` per operation, so an operation that
 * changes more than one place has had nowhere to say how to put them all back.
 * The ones that do are the structural ones — inserting a table column touches
 * every row, deleting one removes a cell from each — and every one of them
 * declared no inverse at all rather than an inverse that undid a fraction of
 * what it did. Ctrl+Z after adding a column did nothing.
 *
 * The inverse of a sequence is the inverses of its steps, in reverse. That is
 * the whole of it, and it composes: a batch inside a batch is a batch.
 *
 * A step that refuses takes the ones before it back with it. Without that a
 * batch could apply half of itself and report failure, which is the fault this
 * package keeps producing from the other direction — a change that happened
 * with nothing recorded to undo it.
 *
 * payload
 * - operations: the steps, in the order they are to run
 */

export interface BatchPayload {
  operations: { type: string; payload?: unknown }[];
}

export const batch = defineOperationDSL(
  (operations: { type: string; payload?: unknown }[]) => ({
    type: 'batch',
    payload: { operations }
  }),
  { atom: false, category: 'structure' }
);

/** Run one step, whatever shape its descriptor is in. */
async function runStep(step: { type: string; payload?: unknown }, context: TransactionContext) {
  const op = globalOperationRegistry.get(step.type);
  if (!op) throw new Error(`batch: ${step.type} is not a registered operation`);
  return op.execute({ ...step, type: step.type } as never, context);
}

defineOperation('batch', async (operation: { payload: BatchPayload }, context: TransactionContext) => {
  const steps = operation.payload?.operations;
  if (!Array.isArray(steps)) {
    return { ok: false, error: 'batch: operations must be a list' };
  }
  if (steps.length === 0) {
    // Nothing done is nothing to undo, and an inverse for it would be a lie.
    return { ok: false, error: 'batch: no operations to run' };
  }

  /** The inverses of the steps that have run, newest first — undo order. */
  const inverses: { type: string; payload?: unknown }[] = [];
  const results: unknown[] = [];

  const rollBack = async () => {
    for (const inverse of inverses) {
      try {
        await runStep(inverse, context);
      } catch {
        // Rolling back is best effort: a step that cannot be undone here is a
        // fault in that operation's inverse, and reporting the original refusal
        // is more use than replacing it with this one.
      }
    }
  };

  for (const step of steps) {
    let result: { ok?: boolean; error?: string; inverse?: { type: string; payload?: unknown } };
    try {
      result = (await runStep(step, context)) as never;
    } catch (error) {
      await rollBack();
      throw error;
    }

    if (result && result.ok === false) {
      await rollBack();
      return { ok: false, error: `batch: ${step.type} refused — ${result.error ?? 'no reason given'}` };
    }

    results.push(result);
    if (result?.inverse) inverses.unshift(result.inverse);
  }

  return {
    ok: true,
    data: results,
    // A step with no inverse of its own leaves a hole, and a batch that claims
    // to undo everything while undoing all but one is worse than one that says
    // it cannot: it is only reversible if every step is.
    ...(inverses.length === steps.length
      ? { inverse: { type: 'batch', payload: { operations: inverses } } }
      : {})
  };
});
