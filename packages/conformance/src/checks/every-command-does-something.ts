import type { Check, Finding } from '../types';

/**
 * A command a surface offers **changes the document when it runs**.
 *
 * ## The fault class this exists for, which is the commonest one here
 *
 * Every other command check asks about the command's *description*: does the schema know what it
 * makes, can the product draw that, can a reader reach it. None of them can ask the only question a
 * reader asks, which is whether pressing it does anything — and that is where the last several
 * faults have been:
 *
 * - 편집 › 찾기 lit up, ran, reported success and drew nothing, in every product that offered it,
 *   and every check passed. **Written here for two years as "`find` is registered by the engine as
 *   `execute: () => true`, a stub" — which was never true.** `editor-core` registers no `find` at
 *   all; `FindReplaceExtension` has been a complete implementation since the day it was written; and
 *   **nothing installed it**, which from a keyboard is indistinguishable from reaching a stub.
 *
 *   Kept, corrected, because the correction is the better lesson: this check finds *symptoms*
 *   honestly and says nothing about causes, and a cause guessed from a symptom and written down
 *   becomes a fact nobody re-measures. Word's key map took ⌘F out over it and the site deleted a
 *   menu entry over it.
 * - Four `canExecute`s were looser than their `execute` — `moveBlockUp`, `moveBlockDown`, `copy`,
 *   `removeLink`. The control lights up, the reader presses it, and the reason it declined goes to a
 *   console nobody is watching.
 * - A menubar's whole 삽입 menu was greyed on a fresh page, because the entries did not say they
 *   needed one. That one the *other* direction catches — a control that can never be enabled — and
 *   it is the same family.
 *
 * ## How it can be asked at all
 *
 * The naive version is not available: running a command changes the document, so a probe would be
 * measuring a moving target. What makes it tractable is **undo**. Run the command, ask whether the
 * document moved, put it back. Which is two answers for the price of one, because a command that
 * cannot be undone is its own fault and a worse one.
 *
 * The running is the **product's**, not this package's: what state a command needs — a selection, a
 * page, a caret in a table — is a fact about that product, and a harness that tried to guess would
 * be guessing differently for each of the three. So the probe answers three ways:
 *
 * - `true` — it ran and the document moved.
 * - `false` — it ran, said it could, and **nothing changed**. A finding.
 * - `null` — the product could not put itself in a state where the command says it can run. Not a
 *   finding and not a pass: counted as unanswered, so a probe that quietly stopped setting anything
 *   up is visible as a check that has stopped asking.
 *
 * ## What is legitimately exempt
 *
 * A command that changes the **application** rather than the document, and there are three kinds:
 * one that moves the selection (`setNode`, `selectAllBlocks`), one that reads the document out
 * (`copyBlocks`, `exportSite`), and one that opens something (`find`). Each is an exemption with a
 * reason, and a reason that stops being true fails the way every claim here does.
 */
export function everyCommandDoesSomething(
  /** The commands a reader can reach — the product's surfaces, already collected for the other checks. */
  offered: string[],
  /** Whether running it moves the document; `null` when the product cannot get into a state to try. */
  probe: (command: string) => boolean | null
): Check {
  return {
    name: 'every-command-does-something',
    describe: 'a command a surface offers changes the document when it says it can run',

    run: () => {
      const findings: Finding[] = [];
      let examined = 0;
      const unanswered: string[] = [];

      for (const command of [...new Set(offered)].sort()) {
        const moved = probe(command);
        if (moved === null) {
          unanswered.push(command);
          continue;
        }
        examined += 1;
        if (moved) continue;
        findings.push({
          check: 'every-command-does-something',
          subject: command,
          detail:
            `\`${command}\` said it could run and then changed nothing. A control that lights up and ` +
            `does nothing is worse than one that is missing, because a reader stops believing the ` +
            `rest of the surface. Either its \`canExecute\` is looser than its \`execute\`, or the ` +
            `\`execute\` is a stub — or it changes the application rather than the document, which is ` +
            `an exemption with a reason.`
        });
      }

      return { findings, examined, unanswered };
    }
  };
}
