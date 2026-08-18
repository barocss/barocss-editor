import { test, expect } from '@playwright/test';
import { openDeck, currentSlide } from './helpers';

/**
 * The chrome around the deck, and what it says about the deck.
 *
 * Every test here is a bug that shipped. The rail draws each slide again and
 * the stage draws every slide and hides all but one, so a query for `.sl-slide`
 * has three answers — a thumbnail's, a hidden slide's, and the right one's — and
 * the chrome asked it twice without saying which it meant.
 */
test.describe('the deck around the slide', () => {
  /**
   * The zoom control read 10%: it measured the first `.sl-slide` in the page,
   * which is a thumbnail, 128 pixels over 1280. Then, scoped to the stage but
   * still unnamed, it read 0% — the stage's first slide is hidden whenever the
   * reader is on any other one.
   */
  test('says the zoom the stage is actually drawing', async ({ page }) => {
    await openDeck(page);

    const check = async () => {
      const shown = await page.locator('input[aria-label], .sl-zoom input').first().inputValue();
      const actual = await page.evaluate((sid) => {
        const el = document.querySelector(`.sl-stage .sl-slide[data-bc-sid="${sid}"]`);
        return el ? Math.round((el.getBoundingClientRect().width / 1280) * 100) : -1;
      }, await currentSlide(page));

      expect(actual).toBeGreaterThan(20);
      expect(Number.parseInt(shown, 10)).toBe(actual);
    };

    await check();
    // And after a change of slide, which is where the second reading went wrong.
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(600);
    await check();
  });

  /**
   * The rail is read for the names. With a picture in the same row they had
   * fifty pixels and every slide was called "T…".
   */
  test('shows each slide’s name in full beside its picture', async ({ page }) => {
    await openDeck(page);

    const names = await page.locator('.sl-filmstrip-name').allTextContents();
    expect(names.length).toBeGreaterThan(1);
    for (const name of names) expect(name).not.toContain('…');

    // And the picture is the slide drawn again, not a grey box.
    const drawn = await page.evaluate(
      () => document.querySelectorAll('.sl-thumb [data-bc-sid]').length
    );
    expect(drawn).toBeGreaterThan(5);
  });

  test('draws a thumbnail at the slide’s own shape', async ({ page }) => {
    await openDeck(page);
    const box = await page.locator('.sl-thumb').first().boundingBox();
    // 16:9, whatever the width the rail gives it.
    expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1);
  });

  test('follows the slide the reader picks', async ({ page }) => {
    await openDeck(page);
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(500);

    await expect(page.locator('.sl-filmstrip button[data-current="true"] .sl-filmstrip-number')).toHaveText('3');
    await expect(page.locator('.sl-count')).toHaveText('3 / 5');
  });
});
