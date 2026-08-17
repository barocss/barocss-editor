import type { Check, Finding } from '../types';
import type { CommandProducing } from './every-command-can-be-seen';

/**
 * Every command that looks like it makes a node says which one.
 *
 * The two command checks are only as good as the list a product hands them, and
 * the list is written by hand — because a command is a function and the engine
 * cannot see what it builds. So a command added without a line in that list is
 * a command neither check covers, and nothing says so.
 *
 * This is the closest thing to saying so. It is a **convention check**, not a
 * proof: it holds a product to the naming its own commands already follow —
 * `insertTable`, `insertImage`, `insertFootnote` — and asks that anything
 * called `insert*` either appears in the list or is exempted with a reason.
 *
 * A command that makes a node and is not called `insert` still slips through.
 * That is the honest limit, and it is written here rather than left for
 * somebody to discover: the check narrows the gap, and does not close it.
 */
export function everyInsertIsAccountedFor(
  commands: string[],
  produces: CommandProducing[]
): Check {
  const accounted = new Set(produces.map((entry) => entry.command));

  return {
    name: 'every-insert-is-accounted-for',
    describe:
      'a command named `insert…` says which node type it produces, or says why it produces none',

    run: () => {
      const findings: Finding[] = [];
      const inserts = commands.filter((command) => /^insert[A-Z]/.test(command));

      for (const command of inserts) {
        if (accounted.has(command)) continue;
        findings.push({
          check: 'every-insert-is-accounted-for',
          subject: command,
          detail:
            `\`${command}\` is named as though it puts a node in the document and is not in ` +
            `the product's \`produces\` list, so neither command check covers it. Say which ` +
            `node type it makes, or exempt it with the reason it makes none.`
        });
      }

      return { findings, examined: inserts.length };
    }
  };
}
