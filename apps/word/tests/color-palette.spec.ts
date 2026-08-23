import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settled } from './helpers';

/**
 * The colour controls.
 *
 * `setFontColor` and `removeFontColor` were registered in Word's kit from the
 * day the kit had marks, and were on no toolbar and bound to no key: **this word
 * processor could not change the colour of its text.** They are the kit's rather
 * than the product's, so the check that catches an unreachable command — which
 * asks about the commands a product *adds* — could not see them.
 *
 * Cell shading arrived as three fixed fills and a way back to none, with a
 * comment admitting a picker was a dialog nobody had built. One palette answers
 * both, and neither is three colours a reader has to accept.
 *
 * What only a browser can check is the part that makes a toolbar colour control
 * hard: **it must not take focus from the editor**. A command acts on the
 * selection and the selection goes with focus, so a panel that opened on click,
 * or a swatch that was an ordinary focusable button, would colour a selection
 * that no longer existed.
 */
const openPalette = async (page: Page, id: string) => {
  await page.locator(`[data-control="${id}"]`).click();
  await expect(page.locator(`[data-palette="${id}"]`)).toBeVisible();
};

const selectWords = async (page: Page, characters: number) => {
  const paragraph = page.locator('.barocss-editor-content p').nth(4);
  await paragraph.scrollIntoViewIfNeeded();
  await paragraph.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).editor?.selection?.type ?? null))
    .toBe('range');

  await page.keyboard.press('Home');
  await page.keyboard.down('Shift');
  for (let i = 0; i < characters; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');

  /**
   * Wait for the *extended* selection, not just for any.
   *
   * Selection reaches the model through `selectionchange`, which is
   * asynchronous, so reading it straight after the last Shift+Arrow gives the
   * caret as it was before the first one — measured, and it made the test that
   * checks the panel does not steal the selection fail by comparing a collapsed
   * caret with the selection that arrived a moment later.
   */
  await expect
    .poll(() => page.evaluate(() => (window as any).editor?.selection?.collapsed !== false))
    .toBe(false);
};

const colouredRuns = (page: Page, rgb: string) =>
  page.evaluate(
    (want) =>
      [...document.querySelectorAll('.barocss-editor-content span')].filter(
        (el) => getComputedStyle(el).color === want
      ).length,
    rgb
  );

test.describe('the colour of the text', () => {
  test('is set from the palette, which the ribbon never had', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await selectWords(page, 6);
    await openPalette(page, 'font-color');
    await page.locator('[data-palette="font-color"] [data-swatch="C00000"]').click();

    await expect.poll(() => colouredRuns(page, 'rgb(192, 0, 0)')).toBeGreaterThan(0);
    // The panel closes on a choice: it is a palette, not a mode.
    await expect(page.locator('[data-palette="font-color"]')).toHaveCount(0);
  });

  /**
   * The constraint the whole ribbon is built around. Every control here acts on
   * `pointerdown` with the default prevented for this reason; a colour panel is
   * the first one with something *inside* it that could take focus.
   */
  test('leaves the selection where it was while the panel is open', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await selectWords(page, 6);
    const before = await page.evaluate(() => JSON.stringify((window as any).editor.selection));

    await openPalette(page, 'font-color');
    const after = await page.evaluate(() => JSON.stringify((window as any).editor.selection));

    expect(after, '팔레트를 여는 동안 선택이 사라졌습니다').toBe(before);
  });

  test('shows the colour it would apply, and nothing when there is none', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const bar = page.locator('[data-control="font-color"] [data-current]');
    await selectWords(page, 6);
    await expect(bar).toHaveAttribute('data-current', 'none');

    await openPalette(page, 'font-color');
    await page.locator('[data-palette="font-color"] [data-swatch="70AD47"]').click();
    await expect(bar).toHaveAttribute('data-current', '70AD47');
  });

  /**
   * The defect the deck's palette turned up, which was Word's too.
   *
   * Applying a mark *appended* it, so red text made blue carried both
   * `fontColor` marks over the same characters and the reader kept the red:
   * **coloured text could not be recoloured.** This palette shipped on
   * 2026-08-18 with that behind it and nothing said so, because every test
   * coloured text that had no colour yet. Applying now makes room first — the
   * arithmetic is in `datastore/test/mark-range.test.ts`.
   */
  test('replaces the colour that was already there', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await selectWords(page, 6);

    await openPalette(page, 'font-color');
    await page.locator('[data-palette="font-color"] [data-swatch="FF0000"]').click();
    await expect.poll(() => colouredRuns(page, 'rgb(255, 0, 0)')).toBeGreaterThan(0);

    await openPalette(page, 'font-color');
    await page.locator('[data-palette="font-color"] [data-swatch="4472C4"]').click();

    await expect.poll(() => colouredRuns(page, 'rgb(68, 114, 196)')).toBeGreaterThan(0);
    expect(await colouredRuns(page, 'rgb(255, 0, 0)')).toBe(0);
  });

  test('closes on Escape, and on a press outside it', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await selectWords(page, 6);

    await openPalette(page, 'font-color');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-palette="font-color"]')).toHaveCount(0);

    await openPalette(page, 'font-color');
    await page.mouse.click(20, 400);
    await expect(page.locator('[data-palette="font-color"]')).toHaveCount(0);
  });
});

test.describe('the colour behind a block of cells', () => {
  const cellReading = (page: Page, text: string) =>
    page.locator('.w-cell').filter({ hasText: new RegExp(`^${text}$`) });

  const stableBox = async (page: Page, text: string) => {
    const target = cellReading(page, text);
    await target.scrollIntoViewIfNeeded();
    let previous = '';
    for (let attempt = 0; attempt < 20; attempt++) {
      const box = await target.boundingBox();
      const key = box ? `${Math.round(box.x)},${Math.round(box.y)}` : '';
      if (box && key === previous) return box;
      previous = key;
      await page.waitForTimeout(100);
    }
    throw new Error(`the cell reading ${text} never stopped moving`);
  };

  const selectCells = async (page: Page, from: string, to: string) => {
    const a = await stableBox(page, from);
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    const b = await stableBox(page, to);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
    await page.mouse.up();
  };

  const shaded = (page: Page, fill: string) =>
    page.evaluate((want) => {
      const store = (window as any).editor.dataStore;
      return [...document.querySelectorAll('.w-cell')].filter(
        (el) => store.getNode(el.getAttribute('data-bc-sid'))?.attributes?.shadingFill === want
      ).length;
    }, fill);

  /**
   * Only in a table, like the table style gallery beside it: a shading control
   * with no cell to shade is a button that cannot do anything.
   */
  test('is offered only where there is a cell to shade', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await expect(page.locator('[data-control="cell-shading"]')).toHaveCount(0);

    await selectCells(page, 'A1', 'B1');
    await expect(page.locator('[data-control="cell-shading"]')).toHaveCount(1);
  });

  test('shades every selected cell from one swatch', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await selectCells(page, 'A1', 'C2');
    const selected = await page.evaluate(
      () => (window as any).editor.selection?.nodeIds?.length ?? 0
    );
    expect(selected).toBe(6);

    await openPalette(page, 'cell-shading');
    await page.locator('[data-palette="cell-shading"] [data-swatch="FFC000"]').click();

    await expect.poll(() => shaded(page, 'FFC000')).toBe(selected);
    // And the trigger reports it, read from the cell rather than from a mark.
    await expect(page.locator('[data-control="cell-shading"] [data-current]')).toHaveAttribute(
      'data-current',
      'FFC000'
    );
  });

  test('takes the shading off again', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await selectCells(page, 'A1', 'B1');
    await openPalette(page, 'cell-shading');
    await page.locator('[data-palette="cell-shading"] [data-swatch="FFC000"]').click();
    await expect.poll(() => shaded(page, 'FFC000')).toBe(2);

    await openPalette(page, 'cell-shading');
    await page.locator('[data-palette="cell-shading"] [data-swatch="none"]').click();
    await expect.poll(() => shaded(page, 'FFC000')).toBe(0);
  });
});

/**
 * The highlighter's colour.
 *
 * The button in the character group applies Word's yellow in one press, which is
 * what that button means — and was the whole of the highlighter: no way to ask
 * for another colour, while `toggleHighlight` has taken one since it was
 * written. It cannot be the palette's command either, because it *toggles*:
 * pressing turquoise on text that is already yellow would take the highlight off
 * rather than turn it turquoise. So `setHighlight` applies and `removeHighlight`
 * clears, the same pair `setFontColor` has always had.
 */
test.describe('the colour behind the text', () => {
  const highlighted = (page: Page, rgb: string) =>
    page.evaluate(
      (want) =>
        [...document.querySelectorAll('.barocss-editor-content span')].filter(
          (el) => getComputedStyle(el).backgroundColor === want
        ).length,
      rgb
    );

  test('is chosen from the palette, not fixed at yellow', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await selectWords(page, 6);

    await openPalette(page, 'highlight-color');
    await page.locator('[data-palette="highlight-color"] [data-swatch="7FDBFF"]').click();

    await expect.poll(() => highlighted(page, 'rgb(127, 219, 255)')).toBeGreaterThan(0);
  });

  test('changes colour rather than switching itself off', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await selectWords(page, 6);

    await openPalette(page, 'highlight-color');
    await page.locator('[data-palette="highlight-color"] [data-swatch="FFFF00"]').click();
    await expect.poll(() => highlighted(page, 'rgb(255, 255, 0)')).toBeGreaterThan(0);

    await openPalette(page, 'highlight-color');
    await page.locator('[data-palette="highlight-color"] [data-swatch="FF9AD5"]').click();

    await expect.poll(() => highlighted(page, 'rgb(255, 154, 213)')).toBeGreaterThan(0);
    expect(await highlighted(page, 'rgb(255, 255, 0)')).toBe(0);
  });

  test('comes off again', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await selectWords(page, 6);

    await openPalette(page, 'highlight-color');
    await page.locator('[data-palette="highlight-color"] [data-swatch="FFFF00"]').click();
    await expect.poll(() => highlighted(page, 'rgb(255, 255, 0)')).toBeGreaterThan(0);

    await openPalette(page, 'highlight-color');
    await page.locator('[data-palette="highlight-color"] [data-swatch="none"]').click();

    await expect.poll(() => highlighted(page, 'rgb(255, 255, 0)')).toBe(0);
  });
});
