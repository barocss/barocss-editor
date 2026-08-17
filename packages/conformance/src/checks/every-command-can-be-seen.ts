import type { Check, Finding } from '../types';

/**
 * A command that makes a node has something that draws one.
 *
 * The other side of `every-node-is-drawn`, and the side that produced the bug.
 * That check asks what the *schema* declares; this asks what the *product
 * offers*, and the two disagree in the direction that matters: a node type
 * declared and unreachable is dead weight, while a node type reachable and
 * undrawn is a reader typing into a document and watching nothing appear.
 *
 * Measured in a shipped product before this existed: ten node types were
 * reachable from 166 commands and drew nothing. `insertCallout` reported
 * success, put a `callout` in the document, and left the text invisible on the
 * page — through 588 unit tests and 291 end-to-end tests, none of which could
 * have failed. Nobody writes a test for a node they cannot see.
 *
 * The subject is a command, not a node, because that is what a reader can
 * press. A finding here reads "this button makes something nobody can see".
 */

export interface CommandProducing {
  /** The command a reader can run. */
  command: string;
  /** The node type running it puts in the document. */
  produces: string;
}

/**
 * Build the check from what the product says its commands make.
 *
 * Passed in rather than discovered: which node a command produces is not
 * something the engine can see — a command is a function — and a guess from the
 * name would be a check that lies in both directions.
 */
export function everyCommandCanBeSeen(commands: CommandProducing[]): Check {
  return {
    name: 'every-command-can-be-seen',
    describe:
      'a command that puts a node in the document has something that draws that node',

    run: ({ hasRenderer }) => {
      const findings: Finding[] = [];

      for (const { command, produces } of commands) {
        if (hasRenderer(produces)) continue;
        findings.push({
          check: 'every-command-can-be-seen',
          subject: command,
          detail:
            `\`${command}\` puts a \`${produces}\` in the document and nothing draws one — ` +
            `a reader who runs it sees no change and has changed their document. ` +
            `Register a renderer, give the extension a \`defaultRenderers\`, or stop ` +
            `offering the command.`
        });
      }

      return { findings, examined: commands.length };
    }
  };
}
