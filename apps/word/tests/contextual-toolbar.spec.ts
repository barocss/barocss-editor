import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { placeCaret, settled } from './helpers';

/**
 * A toolbar that shows **what the selection can be asked**.
 *
 * Measured on 2026-08-27 with a caret in an ordinary paragraph: of Word's 69 toolbar controls,
 * **arrange was 12 of 12 disabled and table was 15 of 15**, and everything else was live. Twenty-seven
 * glyphs that could do nothing, on screen always — and the second row of the strip existed because
 * of them.
 *
 * Every serious editor has answered this the same way for twenty years, Word's own *Table Tools*
 * included. What is worth holding here is the boundary: "hide a group where nothing can run" is
 * nearly the right rule and would have hidden almost the whole toolbar, because with **nothing**
 * selected `character`, `list`, `paragraph`, `drawing` and `layout` are all wholly disabled too. Those
 * are disabled for want of a *selection*; these are disabled for want of a *kind* of one.
 */
const groups = async (page: Page) =>
  await page.evaluate(() =>
    [...document.querySelectorAll('[data-group]')].map((one) => one.getAttribute('data-group'))
  );

test.describe('a toolbar that answers to the selection', () => {
  test('does not offer the shape and table groups to a caret in prose', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await placeCaret(page, '.barocss-editor-content p:not(.w-frame p)', 3);

    const shown = await groups(page);
    expect(shown).not.toContain('arrange');
    expect(shown).not.toContain('table');

    // And everything that *is* about prose is still there — the rule must not take the toolbar with
    // it, which is what the simpler version of it did.
    expect(shown).toEqual(expect.arrayContaining(['character', 'list', 'paragraph', 'drawing']));
  });

  test('offers the table group to a caret inside a table, and takes it back', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const cell = page.locator('.w-document table td, .w-document table th').first();
    test.skip((await cell.count()) === 0, 'this document has no table');
    await cell.click();
    await page.waitForTimeout(400);
    expect(await groups(page)).toContain('table');

    /*
     * A table is the one **around the caret**, which the ribbon already computes for the look flags
     * — an exact reading rather than a guess at whether some table command happens to be runnable.
     */
    await placeCaret(page, '.barocss-editor-content p:not(.w-frame p)', 3);
    await page.waitForTimeout(400);
    expect(await groups(page)).not.toContain('table');
  });

  test('offers the arrange group once there is a shape to arrange', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await placeCaret(page, '.barocss-editor-content p:not(.w-frame p)', 3);
    expect(await groups(page)).not.toContain('arrange');

    await page.locator('[data-control="insert-rectangle"]').click();
    await settled(page);

    /*
     * And **selected**, which inserting does not do on its own: the arrange commands act on chosen
     * shapes, and a shape that has just been drawn is not one. Worth knowing rather than working
     * around — a reader who inserts a rectangle and looks for 앞으로 가져오기 has to click it first,
     * which is what every canvas tool asks and what this test now says out loud.
     */
    await page.locator('.w-canvas rect').first().click();
    await page.waitForTimeout(400);

    /*
     * A shape has no anchor the way a table does — what "a shape is selected" means is exactly what
     * the arrange commands answer, so the group asks its own controls. Neither reading is a guess at
     * the other's question.
     */
    expect(await groups(page)).toContain('arrange');
  });

  test('is shorter for it, which is the whole point', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await placeCaret(page, '.barocss-editor-content p:not(.w-frame p)', 3);

    const drawn = await page.evaluate(
      () => document.querySelectorAll('[data-group] button').length
    );
    // 69 controls were declared and 27 of them could do nothing. A number rather than a shrug, so
    // that a group quietly losing its `when` shows up here.
    expect(drawn).toBeLessThan(50);
  });
});
