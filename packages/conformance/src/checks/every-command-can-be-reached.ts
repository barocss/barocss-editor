import type { Check, Finding } from '../types';

/**
 * A command the product adds is one a reader can run.
 *
 * The other command checks ask what a command *produces* and whether the
 * product can draw it. This one asks the question underneath both: can anybody
 * get at it at all.
 *
 * It exists because of a failure, and a recent one. `copyBoxes`, `cutBoxes` and
 * `pasteBoxes` were written, tested, registered and reachable by nothing — no
 * key, no button — and stayed that way for a day. Every check passed. The
 * harness could see what a product's toolbar offered and had no way to see what
 * its keys did, so a feature that existed and could not be used was invisible to
 * exactly the machinery built to find features that exist and cannot be used.
 *
 * ## What "the product's own" means, and why it is measured
 *
 * A deck registers something like a hundred and twenty commands, and almost all
 * of them are the shared kit's: `deleteWordBackward`, `moveCursorLeft`,
 * `splitListItem`. Demanding a button for those would be nonsense — they are
 * the editor's behaviour, bound by the engine's own key map or by nothing at
 * all.
 *
 * So the subject is the commands *this product* adds, and that is measured
 * rather than listed: a product builds an editor with its own extensions and
 * one without them, and the difference is its own. A list would be a fourth
 * place to forget the thing this check exists to catch.
 *
 * ## What counts as reachable
 *
 * A toolbar control or a key binding, both read from the product's own
 * declarations. A command reached some third way — a dialog, a context menu —
 * is exempted with the reason, which is a claim like every other exemption here
 * and fails when it stops being true.
 */
export function everyCommandCanBeReached(
  /** The commands this product adds, measured against a kit without them. */
  own: string[],
  /** The commands a reader can run: toolbar controls and key bindings. */
  reachable: string[]
): Check {
  const surfaced = new Set(reachable);

  return {
    name: 'every-command-can-be-reached',
    describe:
      'a command the product adds is on its toolbar or bound to a key, or is exempted with the way it is reached',

    run: () => {
      const findings: Finding[] = [];

      for (const command of own) {
        if (surfaced.has(command)) continue;

        findings.push({
          check: 'every-command-can-be-reached',
          subject: command,
          detail:
            `\`${command}\` is a command this product adds and nothing surfaces — it is on no ` +
            `toolbar control and bound to no key, so a reader cannot run it however well it ` +
            `works. Put it on the toolbar, bind it, or exempt it with the way it is reached.`
        });
      }

      return { findings, examined: own.length };
    }
  };
}
