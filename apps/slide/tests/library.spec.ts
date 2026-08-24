import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck } from './helpers';

/**
 * The reader's own decks, **by name**.
 *
 * Two features asked for the same thing and neither could have it: a button into another deck could
 * only point at a source the product can fetch (canvas-model §11h), and a shared component library
 * needs definitions that live in another document (§10). Both need *"the decks I have"* to be
 * something this product can say.
 *
 * Kept in IndexedDB, and the choice was measured rather than assumed: the sample deck is 42KB of
 * JSON and the starter 8KB, both pictureless — one photograph is a base64 megabyte, and
 * `localStorage` has five in total and fails by throwing in the middle of a save. A store whose
 * predictable failure is "the reader loses the deck they were saving" is not one to build on.
 *
 * Playwright gives each test its own browser context, so each of these starts with an empty
 * library — which is also the honest thing to test: the first row a reader ever makes.
 */
const openLibrary = async (page: Page) => {
  await page.locator('[data-deck-library]').click();
  await expect(page.locator('[data-library-keep]')).toBeVisible();
};

test.describe('a library of decks', () => {
  test('starts empty, and says what a name is for', async ({ page }) => {
    await openDeck(page);
    await openLibrary(page);

    await expect(page.locator('[data-library-row]')).toHaveCount(0);
    // A list that is empty has to say what putting something in it would buy.
    await expect(page.locator('.ou-dialog, [role="dialog"]')).toContainText('누르면');
  });

  test('keeps the deck under a name taken from what it is called', async ({ page }) => {
    await openDeck(page);
    await openLibrary(page);
    await page.locator('[data-library-keep]').click();
    await page.waitForTimeout(600);

    // The sample deck's opening words are "One engine, two products".
    const row = page.locator('[data-library-row="one-engine-two-products"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('6장');

    /*
     * And saving again keeps the name rather than minting a second: saving 가격표 twice is saving
     * *that* deck, and a second name would leave every button pointing at the old copy — which is
     * the one thing a durable reference must not do.
     */
    await page.locator('[data-library-keep]').click();
    await page.waitForTimeout(600);
    await expect(page.locator('[data-library-row]')).toHaveCount(1);
    await expect(page.locator('[data-library-keep]')).toContainText('one-engine-two-products');
  });

  test('opens a deck from the library, and takes it out again', async ({ page }) => {
    await openDeck(page);
    await openLibrary(page);
    await page.locator('[data-library-keep]').click();
    await page.waitForTimeout(600);

    // Change the deck on screen, so opening the row is visibly a different document.
    await page.locator('[data-library-close]').click();
    await page.waitForTimeout(300);

    await page.evaluate(async () => {
      const editor = (window as any).editor;
      await editor.executeCommand('insertSlide', {});
    });
    await page.waitForTimeout(500);
    const grew = await page.locator('.sl-filmstrip button[data-slide]').count();
    expect(grew).toBe(7);

    // Opening the row puts the six-page deck back. It asks first, because a new document takes the
    // history with it — the same confirmation 열기 asks, and only when there is work to lose.
    page.once('dialog', (dialog) => void dialog.accept());
    await openLibrary(page);
    await page.locator('[data-library-open="one-engine-two-products"]').click();
    await page.waitForTimeout(900);
    await expect(page.locator('.sl-filmstrip button[data-slide]')).toHaveCount(6);

    // And out again.
    page.once('dialog', (dialog) => void dialog.accept());
    await openLibrary(page);
    await page.locator('[data-library-drop="one-engine-two-products"]').click();
    await page.waitForTimeout(600);
    await expect(page.locator('[data-library-row]')).toHaveCount(0);
  });

  test('is what a button into another deck can point at, by name', async ({ page }) => {
    await openDeck(page);

    // Keep this deck, then make a button that points at it *by its library name*.
    await openLibrary(page);
    await page.locator('[data-library-keep]').click();
    await page.waitForTimeout(700);
    await page.locator('[data-library-close]').click();
    await page.waitForTimeout(300);

    const made = await page.evaluate(async () => {
      const editor = (window as any).editor;
      await editor.executeCommand('insertRectangle', {});
      const sid = editor.selection?.nodeIds?.[0];
      await editor.executeCommand('setBoxJump', {
        nodeIds: [sid],
        deck: 'one-engine-two-products',
        to: 'cards'
      });
      return sid;
    });
    await page.waitForTimeout(500);

    /*
     * The name is resolved by the **host**, not by the document: `isLibraryName` says this is a
     * name rather than an address, so the library answers and nothing is fetched. Which is the
     * whole point of the library — a reference that survives the deck being moved.
     */
    await page.locator('[data-present]').click();
    await page.waitForTimeout(600);
    const box = (await page.locator(`.sl-stage [data-bc-sid="${made}"]`).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1200);

    const now = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const shown = [...document.querySelectorAll<HTMLElement>('.sl-stage .sl-slide')].find(
        (one) => getComputedStyle(one).display !== 'none'
      );
      const sid = shown?.getAttribute('data-bc-sid');
      return {
        at: sid ? store.getNode(sid)?.attributes?.id : null,
        away: !!document.querySelector('[data-jump-away]')
      };
    });
    // The kept deck is open at the page the button named, and nothing went wrong on the way.
    expect(now.away).toBe(false);
    expect(now.at).toBe('cards');

    await page.keyboard.press('Escape');
  });
});
