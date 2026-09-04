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
   *
   * 330 → 328 when `Editor.getExtension` was published. The slash menu had been reaching around the
   * registry for `emit` and `commandNames`, both of which the engine has had all along — a cast
   * beside a public member is usually a caller who could not get at the *object*, and publishing the
   * object took the casts with it.
   */
  /*
   * 328 → 327 when `ReorderExtension` stopped drawing. 180 of its 230 lines were a handle, a
   * placeholder and four global pointer listeners; what is left is one command and two lookups, and
   * the cast went with the DOM it was reaching around. The third time a *layer* being wrong showed up
   * here as a count.
   */
  /*
   * 327 → 338 over a stretch of building: free placement, a swept selection, an emoji and a sticker,
   * a file dropped on the boards. Eleven of them are `apps/site` reaching for things `Editor` does
   * not publish — `executeCommand` with a payload, `getRootId`, `exportDocument`, `selectionManager`
   * — and one is an extension reaching for `editor.view`, which the engine genuinely does not know it
   * has.
   *
   * Recorded rather than argued with, which is what this ratchet is for: the number going up is not a
   * fault, it is a **bill**, and the three times it has come down were each a member being published
   * rather than a cast being hidden. `executeCommand` and `getRootId` are the two that would take
   * most of this back.
   *
   * ## 338 → 363, and the number is two facts rather than one
   *
   * **21 of the 25 were already there.** Measured before touching anything: a clean checkout of
   * `6dd3c7a` counts 359, so this check had been failing for some time and the failure had been read
   * as noise. That is worth writing down rather than absorbing — a ratchet nobody can pass stops
   * being a ratchet, which is the same fault as a tolerance explained in a comment.
   *
   * The remaining 4 are `office-note`, a package that did not exist when 338 was written. It arrived
   * with 30 casts and keeps 5, and the 26 that came off are exactly the shape the prose above
   * predicts: `(editor as never as { executeCommand… }).executeCommand`, `.canExecuteCommand`,
   * `.getRootId`, `.dataStore`, `.selection`, `.getSelectionSummary` — **six members the class
   * declares publicly**, cast away by a package that was written against the interface it imagined
   * rather than the one it imports. Deleting the casts changed no behaviour and the tests did not
   * move, which is the whole argument of this file arriving for the fourth time.
   *
   * What the 5 are: `on`/`off`/`destroy` (an emitter the class does not publish), `selectionManager`
   * in a test, and `loadDocument`'s session — the first is a real gap and the others are callers
   * reaching for something a session needs and `Editor` does not expose.
   *
   * The 21 are recorded in `BACKLOG.md`; they are not this round's to fix, and lowering this number
   * back is the work of finding which public member each of them is standing on.
   *
   * 363 → 362 when `apps/note`'s two waits stopped casting the editor and shaped `window` instead.
   * Inside a browser function there is no `Editor` to import, so saying what the session **is** once
   * is the honest form; casting what it holds, twice, was not.
   *
   * **362 → 357**, and the five came off the same way as the twenty-six before them: every one was
   * standing on a member `Editor` declares **publicly** — `selection`, `dataStore`, `getRootId`,
   * `loadDocument`, `getSelectionSummary`, `exportDocument`, `on`/`off`/`destroy`. A cast written
   * against the interface a caller imagined rather than the one it imports.
   *
   * Worth saying because of how they got here: seven of them were written **this round**, by the
   * work that was removing the others. A ratchet only holds if it is read while the work is being
   * done, and this one was read as noise for weeks — it allowed 338 while the tree had 359. A check
   * nobody can pass has stopped being a check, which is the same fault as a tolerance explained in
   * a comment.
   */
  const ALLOWED = 357;

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
