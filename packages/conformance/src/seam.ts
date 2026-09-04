/**
 * **A `data-*` name written on one side of a seam and not the other.**
 *
 * ## The three faults this is for
 *
 * Every one of them was a name spelled differently at each end, with nothing in between to notice:
 *
 * - The deck's renderer wrote `data-list-type` from an attribute it called `listType`, which the
 *   schema calls `type`. A reader pressing the numbered-list button got `type: 'ordered'` from the
 *   operation and a list drawn `data-list-type="bullet"` — **a numbered list with bullets.**
 * - The site's `insertBulletList` wrote `kind: 'bullet'`, an attribute nothing reads.
 * - `style.css` had `.w-math-frac[data-type='lin']` rules since it was written and **no renderer
 *   ever emitted `data-type`.** Two rules matching an attribute nothing wrote, so a linear fraction
 *   has never been drawn as one.
 *
 * Each cost months. Each is mechanical to find.
 *
 * ## Why only one direction is asked
 *
 * **A stylesheet selecting on a name nothing writes** is a rule that can never match, and there is
 * no innocent reading of it: something has to write it or the rule is dead.
 *
 * The other direction — a name a renderer writes that no stylesheet selects — is noise. Half of
 * this repository's `data-*` are for a test to find an element by, or for the app's own event
 * handlers: `data-bc-sid`, `data-toc-target`, `data-control-id`, `data-furniture`. A check that
 * reported those would report thirty true things and one fault, which is a check nobody reads.
 *
 * ## What counts as written
 *
 * Three ways, and no fourth:
 *
 * 1. A literal `data-x` anywhere in the source.
 * 2. `x` as a key of a `data={{ … }}` prop, which is `office-ui`'s convention — its shell, its
 *    controls and its stack all spread
 *    `Object.entries(data).map(([key, value]) => [\`data-${key}\`, value])`.
 * 3. `element.dataset.x`, which is the DOM's own spelling and what the deck's timeline uses to write
 *    a snap on and off during a drag.
 *
 * Each was found by the check being wrong: reading only the literals reported nine of the deck's
 * names as dead when eight were written the second way; reading *every* object key in the source
 * reported none of them and would have missed `data-type`, the one that was really wrong; and
 * `dataset.snapped` was a real fault sitting beside a real convention, so both had to be told apart.
 *
 * **Comments do not count**, which is a rule this repository already wrote down about its other
 * sweep: *"prose mentioning an attribute makes it look read."* Nor do a package's own tests: a
 * converter's fixture carries whole pages of HTML, and a dead rule answered by a string no reader
 * ever loads is a dead rule.
 */

/**
 * The source with its comments taken out.
 *
 * Line comments and block comments both, and a string that looks like one is not worth the parser it
 * would take to tell apart: a `data-*` inside a string literal is a write, and this repository does
 * not put `//` in one.
 */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Every `data-*` name a stylesheet selects on, and where it was found. */
export function dataNamesSelected(files: Array<{ path: string; text: string }>): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of files) {
    for (const match of file.text.matchAll(/\[(data-[a-z0-9-]+)/gi)) {
      const name = match[1].toLowerCase();
      if (!found.has(name)) found.set(name, file.path);
    }
  }
  return found;
}

/**
 * Every `data-*` name a source file writes.
 *
 * The two ways this repository writes one, and no third: a literal, and a key of a `data={{ … }}`
 * prop. See the note above for what happened each time the net was cast wider or narrower.
 */
export function dataNamesWritten(files: Array<{ path: string; text: string }>): Set<string> {
  const written = new Set<string>();

  for (const file of files) {
    /*
     * **Without the comments**, which is a rule this repository already wrote down about its other
     * sweep: *"prose mentioning an attribute makes it look read."* Measured here the same way — the
     * fix for the fraction was taken back out, the check passed, and what it had found was the
     * sentence in the comment above the line explaining that nothing wrote `data-type`.
     */
    const text = withoutComments(file.text);
    for (const match of text.matchAll(/(data-[a-z0-9-]+)/gi)) {
      written.add(match[1].toLowerCase());
    }

    /*
     * `data={{ … }}`, non-greedily to the first `}}`. A prop written across several lines is the
     * normal case in this repository, so the match spans newlines — and stopping at `}}` means a
     * nested object inside one ends the scan early, which is the safe direction: a name missed here
     * is reported as unwritten and looked at, and a name invented here would hide a real fault.
     */
    for (const block of text.matchAll(/\bdata=\{\{([\s\S]*?)\}\}/g)) {
      for (const key of block[1].matchAll(/(?:^|[{,\s])['"`]?([a-z][a-z0-9-]*)['"`]?\s*:/gi)) {
        written.add(`data-${key[1].toLowerCase()}`);
      }
      // `...(condition ? { presenting: 'true' } : {})` puts the key inside a nested object, which the
      // scan above stops at. The keys of a spread are the same keys, so they are read the same way.
      for (const key of block[1].matchAll(/['"`]([a-z][a-z0-9-]*)['"`]\s*:/gi)) {
        written.add(`data-${key[1].toLowerCase()}`);
      }
    }

    /*
     * `element.dataset.x`, the DOM's own spelling — and camelCase there is a hyphen in the
     * attribute, which is the browser's rule and not a choice: `dataset.stepEditor` writes
     * `data-step-editor`.
     */
    for (const match of text.matchAll(/\.dataset\.([a-zA-Z][a-zA-Z0-9]*)/g)) {
      written.add(`data-${match[1].replace(/[A-Z]/g, (upper) => `-${upper.toLowerCase()}`)}`);
    }

    /**
     * **`data-${…}` — 이름이 실행할 때 조립되는 경우.**
     *
     * `office-editor-ui`'s `Controls` writes `{...{ [`data-${mark}`]: id }}`, so what actually lands
     * on the button is decided by whichever product passed `mark`. A sweep that only reads literals
     * sees the template and nothing else, and a note's `[data-note-act]` rules came back as **rules
     * that can never match** — which they very much can.
     *
     * So the callers are read too — and the two ends are in **different packages**: the template is
     * in `office-editor-ui`, the `mark="note-act"` is in `office-note`. Tied to the component's name
     * rather than to the template, which is the coupling this check is willing to take: it knows
     * exactly one indirection, by name, and says so. Without a condition, any `mark=` prop would be
     * read as a `data-` name, and half this repository's props are called `mark`.
     */
    if (/\bControls\b|\bControlRows\b/.test(text)) {
      for (const match of text.matchAll(/\bmark=["']([a-z][a-z0-9-]*)["']/g)) {
        written.add(`data-${match[1].toLowerCase()}`);
      }
    }
  }

  return written;
}

/** The names a stylesheet selects on that nothing writes — a rule that can never match. */
export function deadSelectors(
  styles: Array<{ path: string; text: string }>,
  sources: Array<{ path: string; text: string }>
): Array<{ name: string; sheet: string }> {
  const written = dataNamesWritten(sources);
  return [...dataNamesSelected(styles)]
    .filter(([name]) => !written.has(name))
    .map(([name, sheet]) => ({ name, sheet }));
}
