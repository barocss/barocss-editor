import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The chrome uses the suite's controls, and this is the ratchet that keeps it.
 *
 * ## What went wrong without it
 *
 * `office-ui` exported a colour field, a Radix dropdown, a dialog, a toolbar and
 * nine property-panel rows — and no button and no bare field. So every new
 * control in this app was hand-written, and by 2026-08-20 there were 47
 * `<button>`s, 17 `<select>`s and 15 `<input>`s with their own rules in a
 * 1,619-line stylesheet.
 *
 * Two things came of that, both measured in a browser:
 *
 * - **Two visual languages in one row.** A hand-rolled select in the step
 *   inspector was 22px tall with a `#d8dce4` border and 3px corners; the shared
 *   colour field beside it was 28px, `#d4d4d4` and 4px. Which made hand-rolling
 *   the *cheaper* option every time — the shared control looked foreign.
 * - **A control that was wrong, not just different.** The inspector's length
 *   field wrote to the document on every keystroke, so typing `1.8` a character
 *   at a time put **10.68 seconds** in it: React rewrote the field from the model
 *   between keystrokes and the characters interleaved. `NumberField` holds its own
 *   text until blur, which is why it exists.
 *
 * ## Why a count rather than a ban
 *
 * Because a ban would have to be paid for in one commit, and it should not be:
 * the remaining ones are real work with real risk, listed below with what each is
 * waiting for. A number that can only go down is how this repository has done
 * this before — Slides' own conformance check started as a ratchet at 64 of 64
 * undrawn — and it is the only version that is both honest today and pressure
 * tomorrow.
 *
 * **A raw control is not a sin.** A canvas overlay's handles, a slider, a
 * contenteditable — these are not fields, and `office-ui` has no primitive for
 * them because there should not be one. Those files are exempt by name.
 *
 * ## The fault that arrives from the other side
 *
 * A file can reach zero here and still draw its own controls, because a
 * *stylesheet* can restyle a shared one. `.sl-topbar-actions button` was four
 * rules of this app's border, padding and radius, and being a descendant selector
 * it beat everything `office-ui`'s own classes could say — so the row's buttons
 * came out in this app's language whether they were hand-rolled or not. Deleted
 * with the last hand-rolled button in that row; a control that needs tuning is
 * tuned through `className`, where the merge is decided at the call site instead
 * of by which stylesheet loaded last.
 */

/** Files whose raw elements are *not* chrome, with the reason. */
const NOT_CHROME: Record<string, string> = {
  'overlay.tsx': 'the selection overlay: handles, a rubber band, path points — a canvas, not a form',
  'stage.tsx': 'the deck itself, drawn from the model',
  'thumbnail.tsx': 'a slide drawn small; no controls at all',
  'main.tsx': 'the mount, which draws nothing',
  'present.tsx': 'the show: a full-screen surface whose two buttons are its own furniture'
};

/**
 * What is still hand-rolled, and what each is waiting for.
 *
 * Every number here is a promise that it will not grow. When one reaches 0 its
 * line comes out, which is the only way this list ever gets shorter.
 */
/**
 * The find bar came off this list when `office-ui` grew a **text field**, and the
 * extraction turned up something worth keeping: the three callers waiting for one did
 * not want the same control. A **name** is committed — writing every keystroke to the
 * document is a hundred history entries for one word — and a **search box** is live,
 * because the count beside it answers the query as it grows. `TextField` does both, and
 * the difference is one prop rather than two components.
 */
const REMAINING: Record<string, { count: number; why: string }> = {
  'paint-panel.tsx': {
    count: 1,
    why: 'a gradient stop: a handle dragged along a bar, which is a canvas and not a field. The rest of this file is `StackList`/`StackRow` now — the list control this line used to be waiting for'
  },
  'timeline.tsx': {
    count: 16,
    why: 'the axis and the transport — bars, a playhead, a ruler and a curve editor, which are an instrument rather than a form. Its *inspector* is migrated; these are what is left'
  },
  'preset-gallery.tsx': { count: 3, why: 'tiles that play their own motion on hover — a gallery, not a button' },
  'filmstrip.tsx': { count: 1, why: 'a slide row: a picture, a name and two badges' },
  'audit-panel.tsx': {
    count: 1,
    why: 'a finding’s row — three columns of text that is a *place to go*, not a control with a label. The same shape as the layer list’s row and the filmstrip’s, and waiting on the same thing: a list row `office-ui` has no primitive for'
  },
  'component-panel.tsx': {
    count: 1,
    why: 'a component’s row — a name, a part count and a “behind” badge that is a *place to go* rather than a control with a label. The same shape as the layer list’s row, the filmstrip’s and the audit list’s, and waiting on the same thing: a list row `office-ui` has no primitive for'
  },
  'deck-dialogs.tsx': {
    count: 1,
    why: 'a template tile: it draws the *shape* of a deck — its slides as small boxes, from the document itself — which is a gallery rather than a button, the same as `preset-gallery.tsx`'
  },
  'deck-map-view.tsx': {
    count: 2,
    why: 'a page in the map — the slide *drawn*, with its number and two fault badges over it, which is a place to go rather than a control with a label (the same shape as the filmstrip’s row and the template tile) — and the **grip** on an arrow’s end, which is a handle dragged onto a page, the same kind of thing as a gradient stop in `paint-panel.tsx`. Both are waiting on the same thing: `office-ui` has no primitive for a picture that is somewhere to go, or for a handle'
  },
  'layer-panel.tsx': {
    count: 1,
    why: 'the row itself — a picture, a name and two badges that are a *place to go* rather than a control with a label. The same shape as the filmstrip’s row and the audit list’s, and waiting on the same thing: a list row `office-ui` has no primitive for. Its four icon buttons came off when `IconButton` was extracted'
  }
};

/**
 * A raw control, counted as text.
 *
 * Prose counts. A comment explaining what a `<select>` does trips this, which
 * cost a few minutes once — and it stays this way deliberately: a
 * comment-stripper good enough to be safe here would have to know a string from a
 * comment (`'http://…'` starts with two slashes), and a check that silently
 * mis-parses is worse than one that occasionally objects to a sentence. Write
 * "a select", without the brackets, and the check is quiet.
 */
const RAW = /<(select|input|button)[\s>]/g;

/**
 * The source with its **comments taken out**, because this counts controls and not mentions of them.
 *
 * Measured: a comment saying *"the suite's own control, not a bare `<button>`"* — written beside the
 * very change that removed a raw button — counted as a raw button, and the check reported a file
 * going up while it was coming down. A guard that can be tripped by prose teaches the next person to
 * write worse prose.
 */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, (_all, before) => before);

test('the deck’s chrome does not grow its own controls', () => {
  // ESM: the tests run as modules, so there is no `__dirname` to ask.
  const source = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const findings: string[] = [];

  for (const file of readdirSync(source).filter((name) => name.endsWith('.tsx'))) {
    if (NOT_CHROME[file]) continue;

    const raw = (code(readFileSync(join(source, file), 'utf8')).match(RAW) ?? []).length;
    const allowed = REMAINING[file]?.count ?? 0;

    if (raw > allowed) {
      findings.push(
        `${file}: ${raw} raw controls, ${allowed} allowed. Use @barocss/office-ui — ` +
          `Button, Choice, NumberField, Field, FieldGroup — or add the reason here.`
      );
    }
    // A ratchet only ratchets if it is tightened: a file that has come down and
    // not been recorded is a file that can silently go back up.
    if (raw < allowed) {
      findings.push(
        `${file}: ${raw} raw controls, and this list still allows ${allowed}. ` +
          `Lower it (or delete the line at 0) so the number cannot climb back.`
      );
    }
  }

  expect(findings).toEqual([]);
});

/**
 * And the tokens are mapped, which is what makes a shared control match.
 *
 * A `var(--ou-…)` with no value is **invalid at computed-value time** and takes
 * the whole declaration with it — so a product that imports the components and
 * not the tokens draws a panel with no borders rather than one with the wrong
 * grey. Worth a test precisely because the failure is silent and total.
 */
/**
 * Every icon-only button says what it does.
 *
 * The reason `IconButton` is a component rather than a class name: an icon has no text, so
 * the accessible name is the only name it has — and it is the thing a hand-rolled one
 * forgets. Of the callers migrated into it, three had a `title` and no `aria-label` and one
 * had neither.
 *
 * A check rather than a review, because the next hand-rolled one will forget it too. It asks
 * the *rendered chrome*, so it cannot be satisfied by a component nobody used.
 */
test('every button with no words has a name', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.sl-overlay');

  // Open the panes, or their buttons are not in the DOM to be asked about.
  for (const opener of ['[data-audit]', '.sl-layers-closed']) {
    const found = page.locator(opener).first();
    if ((await found.count()) > 0) await found.click();
  }
  await page.waitForTimeout(400);

  const nameless = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((button) => (button.textContent ?? '').trim() === '')
      .filter((button) => !button.getAttribute('aria-label') && !button.getAttribute('title'))
      .map((button) => button.outerHTML.slice(0, 120))
  );

  expect(nameless, '아이콘만 있는 버튼에 이름이 없습니다').toEqual([]);
});

test('the suite’s control tokens are mapped to this deck’s palette', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.sl-overlay');

  const tokens = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const named = ['--ou-line', '--ou-panel', '--ou-ink', '--ou-muted', '--ou-accent', '--ou-faint'];
    return Object.fromEntries(named.map((name) => [name, root.getPropertyValue(name).trim()]));
  });

  for (const [name, value] of Object.entries(tokens)) {
    expect(value, `${name} has no value, so every control that reads it loses its whole rule`).not.toBe('');
  }
  // And they are *this deck's*, not the package's defaults.
  expect(tokens['--ou-line']).toBe('#d8dce4');
});
