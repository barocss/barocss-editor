import { describe, it, expect } from 'vitest';
import '../../src/operations/register-operations';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { buildFuzzWorld, dieRoll, chooseMove, shapeOf } from './fuzz.exec.test';

type Step = { type: string; payload: any; operationFields?: any; caret?: [string, number] };

/** Play a recorded run literally, then undo it. True if the document came back. */
async function replay(steps: Step[]): Promise<boolean> {
  const { dataStore, context } = buildFuzzWorld();
  const before = JSON.stringify(shapeOf(dataStore));
  const inverses: any[] = [];
  for (const step of steps) {
    if (step.caret) { try { context.selection.setCaret(step.caret[0], step.caret[1]); } catch { /* gone */ } }
    const op = globalOperationRegistry.get(step.type);
    if (!op) continue;
    try {
      const r: any = await op.execute({ type: step.type, payload: step.payload, ...(step.operationFields ?? {}) } as any, context);
      if (r?.inverse) inverses.unshift(r.inverse);
    } catch { /* a refusal */ }
  }
  try {
    for (const inv of inverses) {
      const op = globalOperationRegistry.get(inv.type);
      if (op) await op.execute({ type: inv.type, payload: inv.payload, ...inv } as any, context);
    }
  } catch { return false; }
  return JSON.stringify(shapeOf(dataStore)) === before;
}

/** The concrete moves a seed produces, recorded as they are chosen. */
async function recordRun(seed: number, steps = 8): Promise<Step[]> {
  const { dataStore, context } = buildFuzzWorld();
  const roll = dieRoll(seed);
  const recorded: Step[] = [];
  for (let i = 0; i < steps; i += 1) {
    const move = chooseMove(dataStore, roll);
    if (!move) continue;
    if (move.caret) { try { context.selection.setCaret(move.caret[0], move.caret[1]); } catch { /* gone */ } }
    const op = globalOperationRegistry.get(move.type);
    if (!op) continue;
    try {
      await op.execute({ type: move.type, payload: move.payload, ...((move as any).operationFields ?? {}) } as any, context);
      recorded.push(move as Step);
    } catch { /* refused */ }
  }
  return recorded;
}

/**
 * Every run that does not come back, cut down to the smallest part of it that
 * still does not.
 *
 * A run of eight operations that fails to undo says only that the eight of them
 * together do. Dropping one step at a time until none can be dropped turns that
 * into the shortest sequence with the fault still in it — usually one operation
 * with particular arguments, which is something to go and fix.
 *
 * It is how the wide pool went from 41 failing runs to 7: the die produces
 * argument shapes no hand-written fixture had, and this says which. The last
 * time it ran it named six single operations, five of them acting on a run that
 * carried a mark, and every one of them turned out to be an inverse that put the
 * text back and not what was over it.
 *
 * A ratchet on the number of distinct sequences: it may go down, not up, and it
 * prints them with their arguments so the next one to fix is in front of
 * whoever runs the suite.
 */
describe('narrowing the runs that do not come back', () => {
  /** Distinct minimal failing sequences. Lower this; never raise it. */
  const DISTINCT = 2;

  it(`cuts them down to ${DISTINCT} distinct sequences, and no more`, async () => {
    const minimal = new Map<string, { steps: string[]; seed: number }>();

    for (let seed = 1; seed <= 60; seed += 1) {
      const run = await recordRun(seed);
      if (await replay(run)) continue;

      // Greedy: drop any step the run still fails without.
      let current = run;
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = 0; i < current.length; i += 1) {
          const without = current.filter((_, index) => index !== i);
          if (without.length && !(await replay(without))) {
            current = without;
            changed = true;
            break;
          }
        }
      }
      const key = current.map((s) => s.type).join(' → ');
      if (!minimal.has(key)) {
        minimal.set(key, { steps: current.map((s) => s.type), seed });
        // eslint-disable-next-line no-console
        console.log(`  === ${key} (seed ${seed}) ===`);
        for (const step of current) {
          // eslint-disable-next-line no-console
          console.log(`     ${step.type} ${JSON.stringify(step.payload)}${step.operationFields ? ' | op:' + JSON.stringify(step.operationFields) : ''}${step.caret ? ' caret:' + JSON.stringify(step.caret) : ''}`);
        }
      }
    }

    const rows = [...minimal.entries()].sort((a, b) => a[1].steps.length - b[1].steps.length);
    // eslint-disable-next-line no-console
    console.log(`  ${rows.length} distinct minimal sequences:`);
    for (const [key, { steps, seed }] of rows) {
      // eslint-disable-next-line no-console
      console.log(`   [${steps.length}] ${key}   (seed ${seed})`);
    }
    expect(
      rows.length,
      `되돌아오지 않는 최소 시퀀스가 ${rows.length}가지입니다 (기준 ${DISTINCT}). 늘었다면 회귀입니다.`
    ).toBeLessThanOrEqual(DISTINCT);
  }, 300000);
});
