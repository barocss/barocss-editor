import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';


/**
 * The **menubar** — what acts on the document and the application.
 *
 * Word carried 71 toolbar controls in one flat strip and 72 keyboard shortcuts whose only home was a
 * tooltip, which teaches a shortcut to the reader who has already found the button. And two of the
 * oldest items in the oldest menu there is had nowhere to live: printing was a `beforeprint` hook and
 * an object on `window`, and 찾기 was bound to a chord and on no control at all.
 *
 * `menu-model.test.ts` holds what the model claims. What only a browser shows is that the entries do
 * what they say.
 */
const bar = (page: Page) => page.locator('.w-menubar');

const openWord = async (page: Page) => {
  await page.goto('/');
  await page.waitForSelector('.w-toolbar');
  await page.waitForTimeout(600);
};

test.describe('the menubar', () => {
  test('stands beside the ribbon rather than instead of it', async ({ page }) => {
    await openWord(page);

    // Both, because they answer different questions: a menubar holds what acts on the document and
    // the application, a ribbon holds what acts on the selection.
    await expect(bar(page).getByRole('menuitem', { name: '파일' })).toBeVisible();
    await expect(page.locator('[data-control="bold"]')).toBeVisible();
  });

  test('teaches the shortcuts, which had nowhere to be read', async ({ page }) => {
    await openWord(page);
    await bar(page).locator('[data-menu="edit"]').click();

    await expect(page.locator('[data-menu-item="edit.history.0"]')).toContainText('⌘Z');
    await expect(page.locator('[data-menu-item="edit.find.0"]')).toContainText('⌘F');
  });

  test('opens the search box, which was reachable only by a chord', async ({ page }) => {
    await openWord(page);
    await expect(page.locator('.w-find-panel')).toHaveCount(0);

    await bar(page).locator('[data-menu="edit"]').click();
    await page.locator('[data-menu-item="edit.find.0"]').click();
    await page.waitForTimeout(300);

    // A shortcut is a *second* way to reach something, never the only one.
    await expect(page.locator('.w-find-panel')).toHaveCount(1);
  });

  test('shows and hides the panes, which is a view rather than a command', async ({ page }) => {
    await openWord(page);
    const outline = page.locator('.w-outline');
    await expect(outline).toHaveCount(1);

    await bar(page).locator('[data-menu="view"]').click();
    await page.locator('[data-menu-item="view.panes.0"]').click();
    await page.waitForTimeout(300);

    /*
     * Whether a reader has the outline showing is not a fact about what they wrote, so it is not a
     * command — an entry that declared one would be telling the harness something exists that does
     * not.
     */
    await expect(outline).toHaveCount(0);
  });

  test('greys what the document cannot do right now', async ({ page }) => {
    await openWord(page);
    await bar(page).locator('[data-menu="edit"]').click();

    // Nothing has been typed, so there is nothing to undo.
    await expect(page.locator('[data-menu-item="edit.history.0"]')).toBeDisabled();
  });

  test('walks between menus with the arrows', async ({ page }) => {
    await openWord(page);
    await bar(page).locator('[data-menu="file"]').click();
    await expect(page.locator('[data-menu-item="file.print.0"]')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    await expect(page.locator('[data-menu-item="edit.history.0"]')).toBeVisible();
  });
});
