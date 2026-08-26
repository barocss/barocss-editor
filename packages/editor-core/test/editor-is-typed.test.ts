import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * How many places switch the compiler off over this package's own type.
 *
 * ## What was measured
 *
 * `(editor as any).executeCommand?.(…)` and its cousins appear **942 times across the repository**,
 * in 152 files, and every one of them casts away a type that is already correct. `Editor` declares
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
 * 942 is not a sitting's work and does not have to be. A ratchet is what this repository uses for a
 * count being worked off, and it fails in **both** directions: up means a new cast was written, and
 * down means the number here has become a lie about how much is left, and should be lowered in the
 * same commit that earned it.
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
  const ALLOWED = 942;

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
