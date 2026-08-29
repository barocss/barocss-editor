import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * How many places switch the compiler off over this package's own type.
 *
 * ## What was measured
 *
 * `(editor as any).executeCommand?.(…)` and its cousins appeared **942 times across the repository**,
 * in 152 files, and every one of them cast away a type that is already correct. `Editor` declares
 * `executeCommand`, `canExecuteCommand`, `commandNames`, `dataStore`, `getRootId`, `selection` and
 * `registerCommand` as public members, and a file that calls all seven **without** a cast typechecks
 * unchanged — measured, not assumed. There was never a reason; the idiom copied itself.
 *
 * ## Why it is worth a number rather than a comment
 *
 * A cast is not a style problem. It is a place where a rename, a changed signature or a typo is *not*
 * reported: `(editor as any).exectueCommand?.()` is valid TypeScript, evaluates to `undefined`, and
 * does nothing at run time. The `?.` makes it worse — a call on a method that always exists cannot
 * be absent, so the optional chain only hides the day it becomes absent.
 *
 * That is the same failure this repository's conformance harness exists to catch one layer up: a
 * thing that looks done, breaks nothing, and does nothing.
 *
 * ## The ratchet
 *
 * 942 was not a sitting's work; 599 of them turned out to be. A ratchet is what this repository uses
 * for a count being worked off, and it fails in **both** directions: up means a new cast was
 * written, and down means the number here has become a lie about how much is left and should be
 * lowered in the same commit that earned it. It has now been lowered once, which is the only way a
 * ratchet is supposed to move.
 *
 * ## What the compiler found the moment it was switched back on
 *
 * Not style. Four latent faults, in code that has shipped:
 *
 * - **`currentNode.text.length` on a node with no text** (`move-selection.ts`). Guarded by a boolean
 *   that TypeScript cannot narrow through, so the guard was the only thing between this and a crash
 *   and nothing said so.
 * - **`?.` on the wrong thing, nineteen times** (`apps/slide`). `editor.executeCommand?.()` guards a
 *   method that always exists; `editor` is the part that can be null, and it was bare.
 * - **A `ModelSelection` with no `type`** handed to `toggleMark` (`input-handler.ts`) — a range in
 *   every sense except the one nobody had to write down.
 * - **A command returning a string** (`revision-commands.ts`). `_move` answers *which* revision it
 *   landed on and a command answers *whether it ran*; a string is truthy, so it worked and told
 *   every caller checking `=== true` that it had not.
 * - and **`getRootId()` is `string | undefined`** — a document that is not loaded has no root, at
 *   six sites that assumed one.
 */
describe('the editor is a type, not an escape hatch', () => {
  /** What the casts reach for. Beside the count, so the claim can be re-checked rather than believed. */
  const PUBLIC = [
    'executeCommand',
    'canExecuteCommand',
    'commandNames',
    'dataStore',
    'getRootId',
    'selection',
    'registerCommand'
  ];

  /**
   * Occurrences, not lines — `grep -c` says 940 because some lines carry two, and the honest unit
   * for "how many places is the compiler switched off" is the cast.
   */
  /*
   * 343 → 339. Four came off in the round that gave a code block its own Enter, and they were all
   * the same shape: `(editor as never as { getRootId?: () => string }).getRootId?.()` and
   * `(editor as never as { dataStore?: … }).dataStore` — over two members the class declares
   * publicly. Which is the finding this file was written about, arriving again.
   *
   * 339 → 338 when the site builder's `keydown` stopped restating its own key map: two branches that
   * each cast the editor to call `executeCommand` became one `runEntry`. A cast disappearing because
   * a duplicate declaration was removed is the ordinary way this number falls.
   *
   * 338 → 337 when `removeHeading`'s guard stopped being `return true`. Its `execute` walked to the
   * block through `(editor as any).dataStore`; the walk moved into one method that both the guard and
   * the run call, and the cast went with the duplicate. The same shape twice over: the cast was not
   * the fault, it was standing next to it.
   *
   * 337 → 332 when `FindReplaceExtension` stopped drawing its own panel. Six untyped registrations
   * became one typed `register`, and the DOM the casts were reaching around went with them. Five at
   * once is what a *layer* being wrong looks like from here: a shared model package building UI
   * reaches for the escape hatch at every line, and the count is the symptom.
   *
   * 332 → 331 when the command probe moved into `@barocss/conformance`. It exports the shape it
   * needs of an editor, so a product's tables are typed by that rather than by `any` — and the
   * extensions' own run stopped reaching into `_commands` for a list the engine publishes as
   * `commandNames()`.
   *
   * Two of those were **comments**: this counts the phrase, not the code, so writing the escape
   * hatch's name inside a note about avoiding it adds to the number. Worth knowing about the
   * measurement rather than working around — a count that reads prose is a count that can be argued
   * with, and the argument is cheaper than the alternative, which is a count nobody keeps.
   *
   * 331 → 330 when the slash menu stopped drawing its own. The floating toolbar went with it —
   * deleted rather than rewritten, because it registered no commands at all: a selection toolbar,
   * entirely UI, sitting in the model layer, that no product had ever built the equivalent of.
   */
  const ALLOWED = 330;

  it('declares everything the casts are casting away', () => {
    const source = readFileSync(join(__dirname, '..', 'src', 'editor.ts'), 'utf8');
    /*
     * Public members, at the class's own indentation. A private field would be a reason to cast and
     * none of these is one — which is the whole finding: the escape hatch is over a door that is
     * already open.
     */
    for (const name of PUBLIC) {
      expect(new RegExp(`^  (?:async |get )?${name}[(:<]`, 'm').test(source), name).toBe(true);
    }
  });

  it('is cast away in no more places than it was', () => {
    const root = join(__dirname, '..', '..', '..');
    const cast = /editor as (?:any|never|unknown)/g;
    let found = 0;

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === 'test-results') continue;
        const path = join(dir, entry);
        // Not itself. The prose above quotes the pattern twice, and a count that includes the file
        // describing the count is a number nobody can reason about.
        if (path === __filename) continue;
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry)) found += (readFileSync(path, 'utf8').match(cast) ?? []).length;
      }
    };
    walk(join(root, 'apps'));
    walk(join(root, 'packages'));

    expect(
      found,
      found > ALLOWED ? 'a new cast was written' : 'casts were removed — lower ALLOWED to what is left'
    ).toBe(ALLOWED);
  });
});
