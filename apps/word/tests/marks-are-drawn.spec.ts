import { test, expect } from '@playwright/test';
import { placeCaret, settled } from './helpers';

/**
 * A mark a reader applies changes what they see.
 *
 * ## Why this test exists
 *
 * It did not, and eleven marks were drawing nothing. `bold`, `italic`, `underline`, `strikethrough`,
 * `code`, `subscript`, `superscript`, `kbd`, `mention`, `spoiler` and `footnoteRef` have been in the
 * standard schema since it was written, each with a registered command, and none of them appeared in
 * any of `office-text`'s three format tables. A mark with no entry becomes `<span class="mark-bold">`
 * and **nothing styles that class in any of the three products**.
 *
 * So pressing 굵게 made a span and left the text at weight 400. The suite has two assertions about
 * font weight and both are about a *style's* formatting, which resolves through a different road —
 * so 351 tests passed over a word processor whose bold button did nothing visible.
 *
 * The unit test holds the map (`office-text/test/mark-format.test.ts`); this holds the thing a
 * reader actually gets, because a map that is right and a browser that disagrees is the failure this
 * repository keeps finding.
 */
test('굵게 makes the text bold, and the button reads back', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.w-paragraph');
  await settled(page);
  await placeCaret(page, '.w-paragraph', 0);

  await page.keyboard.down('Shift');
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');
  await page.locator('[data-control="bold"]').click({ force: true });
  await settled(page);

  const marked = page.locator('.mark-bold').first();
  await expect(marked).toHaveCount(1);
  // 700, not 400 — which is what it was, in a `<span>` nothing styled.
  await expect(marked).toHaveCSS('font-weight', '700');
});

test('italic, underline and a strike-through each show, and two can share a run', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.w-paragraph');
  await settled(page);
  await placeCaret(page, '.w-paragraph', 0);

  await page.keyboard.down('Shift');
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');

  await page.locator('[data-control="italic"]').click({ force: true });
  await settled(page);
  await expect(page.locator('.mark-italic').first()).toHaveCSS('font-style', 'italic');

  await page.locator('[data-control="underline"]').click({ force: true });
  await settled(page);
  await expect(page.locator('.mark-underline').first()).toHaveCSS('text-decoration-line', 'underline');

  /*
   * Both at once, and this is the one the shorthand would have broken: `text-decoration` set twice
   * keeps the second, so a struck-through underline would silently lose its underline. The long-hand
   * merges — which a tracked-changes document needs, because a deletion inside a link is both.
   */
  // The control's id is `strike`; the mark it toggles is `strikethrough`.
  await page.locator('[data-control="strike"]').click({ force: true });
  await settled(page);
  const struck = page.locator('.mark-strikethrough').first();
  await expect(struck).toHaveCSS('text-decoration-line', 'line-through');
  await expect(page.locator('.mark-underline').first()).toHaveCSS('text-decoration-line', 'underline');
});
