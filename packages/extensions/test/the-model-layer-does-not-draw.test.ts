import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **This package holds commands and state. It does not draw, and it does not guess.**
 *
 * Two claims, each of which was false in several files a week ago, and each of which cost something
 * measurable.
 *
 * ## It does not draw
 *
 * Three extensions built their own DOM — `FindReplaceExtension`, `SlashCommandExtension`,
 * `FloatingToolbarExtension` — and two more carried a stylesheet and a drag handle. A shared model
 * package drawing UI is one a product **cannot use**: it cannot be themed, placed or styled by it,
 * and it would have been white-on-white in the dark theme all three products honour. The proof is
 * what happened to each of them:
 *
 * - `FindReplaceExtension` was called a **stub** in three places for months. It was complete, and
 *   nothing installed it — which from a keyboard is the same thing. Word removed a key binding over
 *   that belief and the site deleted a menu entry.
 * - `FloatingToolbarExtension` registered **no commands at all** and no product had ever built the
 *   equivalent. Deleted.
 * - `DragDropExtension` was the one that was **installed** — by all three — and used by none. It
 *   bound four global pointer listeners and drew a handle styled by a stylesheet nothing injected,
 *   while every product did its own dragging. 180 of its 230 lines were drawing and listening.
 *
 * The drawing lives in `office-ui` now, where three products already theme by the same tokens, and
 * `FloatingSurface` is what the site's selection toolbar and `/` menu are both built from.
 *
 * ## It does not guess
 *
 * `canExecute: () => true` is not a guard, it is the absence of one — and it was in **nineteen**
 * files. The conformance run found 42 commands that light up over a held box and decline; 37 of them
 * were this, almost all one sentence written thirty times. A control that lights up and does nothing
 * is worse than one that is missing, because a reader stops believing the rest of the surface.
 *
 * Both are asserted rather than remembered, because both grew back once already.
 */
describe('the model layer', () => {
  const src = join(process.cwd(), 'src');
  const files = readdirSync(src).filter((one) => one.endsWith('.ts'));

  /** Comments talk about `document.createElement`; only code does it. */
  const codeOf = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

  it('does not draw', () => {
    const draws = files.filter((one) =>
      /document\.createElement|document\.body|style\.cssText|document\.head\.append/.test(
        codeOf(readFileSync(join(src, one), 'utf8'))
      )
    );
    expect(draws).toEqual([]);
    expect(files.length).toBeGreaterThan(40);
  });

  it('has no command whose guard is the absence of one', () => {
    const guessing: string[] = [];
    for (const one of files) {
      const count = (codeOf(readFileSync(join(src, one), 'utf8')).match(/canExecute:\s*\(\s*\)\s*=>\s*true/g) ?? [])
        .length;
      if (count > 0) guessing.push(`${one} × ${count}`);
    }
    expect(guessing).toEqual([]);
  });
});
