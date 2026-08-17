import type { Check, Finding } from '../types';
import type { CommandProducing } from './every-command-can-be-seen';

/**
 * A command makes a node the schema admits.
 *
 * The cheapest check here and the one that should have caught the worst fault:
 * a shipped product offered `insertChecklist` and its schema had no `checklist`
 * node at all. Measured in the running app, the command reported nothing and
 * added nothing — `inModel: 0` — so a reader could press it forever and change
 * nothing, and no test could fail because the transaction it built was refused
 * before it began.
 *
 * `every-command-can-be-seen` did catch it, by way of "nothing draws a
 * `checklist`". That is the wrong reason: it is true of a node the schema
 * *does* declare and the product has not drawn yet, which is a different and
 * much smaller problem. A check that catches the right fault for the wrong
 * reason will let the fault back in the moment the reason stops applying —
 * register any renderer for `checklist` and the impossible command becomes
 * invisible again.
 *
 * So this asks the question directly, and it is the first thing to ask: a
 * command whose node the schema does not know cannot work at all, whereas one
 * whose node is undrawn merely works invisibly.
 */
export function everyCommandMakesSomethingReal(commands: CommandProducing[]): Check {
  return {
    name: 'every-command-makes-something-real',
    describe: 'a command that puts a node in the document names a node the schema declares',

    run: ({ schema }) => {
      const findings: Finding[] = [];

      for (const { command, produces } of commands) {
        if (schema.nodes.has(produces)) continue;
        findings.push({
          check: 'every-command-makes-something-real',
          subject: command,
          detail:
            `\`${command}\` puts a \`${produces}\` in the document and the schema does not ` +
            `declare one — the transaction is refused and the command does nothing at all. ` +
            `Add the node type to the schema, or stop offering the command.`
        });
      }

      return { findings, examined: commands.length };
    }
  };
}
