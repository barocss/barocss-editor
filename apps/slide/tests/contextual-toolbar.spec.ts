import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, visibleBoxes } from './helpers';

/**
 * A toolbar that shows **what the selection can be asked**.
 *
 * Word's ribbon reached this first and the deck was measured the same way afterwards: with one box
 * selected, of 60 controls `align` was 10 of 12 disabled, `table` 9 of 9, `character` 5 of 5 and
 * `group` 2 of 4 — twenty-six glyphs that could do nothing; with **nothing** selected it was
 * forty-four, in two rows.
 *
 * The boundary is the one Word's version settled: `character` is dead for want of a **selection**,
 * and these four for want of a *kind* of one. A rule that hid every wholly-disabled group would take
 * the toolbar with it and leave a reader who has just opened a deck looking at an empty bar.
 */
const groups = async (page: Page) =>
  await page.evaluate(() =>
    [...document.querySelectorAll('[data-group]')].map((one) => one.getAttribute('data-group'))
  );

test.describe('a toolbar that answers to the selection', () => {
  test('offers a deck with nothing selected one row rather than two', async ({ page }) => {
    await openDeck(page);

    const shown = await groups(page);
    for (const gone of ['order', 'align', 'group', 'table']) expect(shown).not.toContain(gone);
    // And everything a reader can still do is there: making a slide, putting something on one.
    expect(shown).toEqual(expect.arrayContaining(['history', 'slide', 'insert']));

    const drawn = await page.evaluate(() => document.querySelectorAll('[data-group] button').length);
    expect(drawn).toBeLessThan(40);
  });

  test('offers the arranging groups once there is a box to arrange', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page, '.sl-text-frame, .sl-shape');
    test.skip(!box, 'this slide has nothing on it');

    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(400);

    const shown = await groups(page);
    expect(shown).toEqual(expect.arrayContaining(['order', 'align', 'group']));
    // Still not the table's, because a box is not a table.
    expect(shown).not.toContain('table');
  });

  test('offers the table group to a caret inside a cell', async ({ page }) => {
    await openDeck(page);
    await page.locator('.sl-filmstrip button').nth(3).click();
    await page.waitForTimeout(700);

    const cell = page.locator('.sl-stage td, .sl-stage th, .sl-stage [class*="cell"]').first();
    test.skip((await cell.count()) === 0, 'this slide has no table');

    /*
     * Two double-clicks: the first goes **into** the table box and the second puts a caret in the
     * cell's words. Which is worth saying because a probe that only *selected* the cell node found
     * every table command refused — `findAncestorCell` walks up from a **range**, so a node
     * selection is not a caret in a table however much it looks like one.
     */
    const box = (await cell.boundingBox())!;
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);

    expect(await groups(page)).toContain('table');
    // And the arranging groups are gone, because a caret in a cell has selected no box.
    expect(await groups(page)).not.toContain('align');
  });
});
