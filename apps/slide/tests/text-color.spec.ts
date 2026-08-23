import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, visibleBoxes } from './helpers';

/**
 * The colour of a slide's text.
 *
 * `setFontColor` and `removeFontColor` come with the kit and were registered in
 * this deck from the day it had marks — on no toolbar, bound to no key: **the
 * deck could not change the colour of its text.** They are the kit's rather than
 * the product's, and the check that catches an unreachable command asks only
 * about the commands a product *adds*, so it reported nothing. Word had the
 * identical gap and grew a palette for it a day earlier; this is the same
 * palette rather than a second one, for the same reason the deck's ribbon draws
 * Word's font and size boxes — two products disagreeing about what a text-colour
 * button does would be one of them wrong.
 *
 * What only a browser can check is the part that makes a colour control on a
 * toolbar hard: **it must not take focus from the stage**. A command acts on the
 * selection and the selection goes with focus, so a panel that opened on click,
 * or a swatch that was an ordinary focusable button, would colour a selection
 * that no longer existed. That is worse here than in a document: the deck's
 * overlay also holds a *box* selection, and a lost caret leaves the ribbon
 * pointing at a shape.
 */
const openPalette = async (page: Page, id: string) => {
  await page.locator(`[data-control="${id}"]`).click();
  await expect(page.locator(`[data-palette="${id}"]`)).toBeVisible();
};

/**
 * A run of text on a slide, selected — which on a stage takes two gestures.
 *
 * One click selects the *box*; the caret only goes in on a double-click, which
 * is the deck's rule for going inside anything. Then Home and Shift+End, as in
 * a document.
 */
const selectLine = async (page: Page): Promise<string> => {
  const [frame] = await visibleBoxes(page, '.sl-text-frame');
  await page.mouse.dblclick(frame.x, frame.y);

  await expect
    .poll(() => page.evaluate(() => (window as any).editor?.selection?.type ?? null))
    .toBe('range');

  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');

  // The extended selection, not merely a selection: it reaches the model through
  // `selectionchange`, which is asynchronous, so reading straight after the key
  // gives the caret as it was before it.
  await expect
    .poll(() => page.evaluate(() => (window as any).editor?.selection?.collapsed !== false))
    .toBe(false);

  return frame.sid;
};

/** How many runs inside a box the browser paints in a given colour. */
const colouredRuns = (page: Page, sid: string, rgb: string) =>
  page.evaluate(
    ([id, want]) =>
      [
        ...(document.querySelectorAll(`.sl-stage [data-bc-sid="${id}"] span`) ?? [])
      ].filter((el) => getComputedStyle(el).color === want).length,
    [sid, rgb] as const
  );

/** The same, for what is painted *behind* the text. */
const highlightedRuns = (page: Page, sid: string, rgb: string) =>
  page.evaluate(
    ([id, want]) =>
      [
        ...(document.querySelectorAll(`.sl-stage [data-bc-sid="${id}"] span`) ?? [])
      ].filter((el) => getComputedStyle(el).backgroundColor === want).length,
    [sid, rgb] as const
  );

test.describe('the colour of the text on a slide', () => {
  test('is set from the palette, which the deck never had', async ({ page }) => {
    await openDeck(page);
    const sid = await selectLine(page);

    await openPalette(page, 'font-color');
    await page.locator('[data-palette="font-color"] [data-swatch="C00000"]').click();

    await expect.poll(() => colouredRuns(page, sid, 'rgb(192, 0, 0)')).toBeGreaterThan(0);
    // And the button shows what it would apply, which is how a reader knows the
    // press landed on the selection rather than on nothing.
    await expect(page.locator('[data-control="font-color"] [data-current]')).toHaveAttribute(
      'data-current',
      'C00000'
    );
  });

  test('does not lose the selection when the panel opens', async ({ page }) => {
    await openDeck(page);
    await selectLine(page);

    const before = await page.evaluate(() =>
      JSON.stringify((window as any).editor.selection?.toJSON?.() ?? (window as any).editor.selection)
    );
    await openPalette(page, 'font-color');
    const after = await page.evaluate(() =>
      JSON.stringify((window as any).editor.selection?.toJSON?.() ?? (window as any).editor.selection)
    );

    expect(after, '팔레트를 여는 동안 선택이 사라졌습니다').toBe(before);
  });

  /**
   * The defect this palette found, which is older and wider than the palette.
   *
   * Applying a mark *appended* it, so red text made green carried both
   * `fontColor` marks over the same characters and the reader kept the red:
   * **coloured text could not be recoloured**, in any product, by any route —
   * Word's palette shipped the day before with this behind it. Applying now
   * makes room first; the arithmetic is in `datastore/test/mark-range.test.ts`
   * and this is the chain, from a press to a pixel.
   */
  test('replaces the colour that was already there', async ({ page }) => {
    await openDeck(page);
    const sid = await selectLine(page);

    await openPalette(page, 'font-color');
    await page.locator('[data-palette="font-color"] [data-swatch="FF0000"]').click();
    await expect.poll(() => colouredRuns(page, sid, 'rgb(255, 0, 0)')).toBeGreaterThan(0);

    await openPalette(page, 'font-color');
    await page.locator('[data-palette="font-color"] [data-swatch="4472C4"]').click();

    await expect.poll(() => colouredRuns(page, sid, 'rgb(68, 114, 196)')).toBeGreaterThan(0);
    expect(await colouredRuns(page, sid, 'rgb(255, 0, 0)')).toBe(0);
  });

  test('comes off again, back to what the layout says', async ({ page }) => {
    await openDeck(page);
    const sid = await selectLine(page);

    await openPalette(page, 'font-color');
    await page.locator('[data-palette="font-color"] [data-swatch="70AD47"]').click();
    await expect.poll(() => colouredRuns(page, sid, 'rgb(112, 173, 71)')).toBeGreaterThan(0);

    await openPalette(page, 'font-color');
    await page.locator('[data-palette="font-color"] [data-swatch="none"]').click();

    await expect.poll(() => colouredRuns(page, sid, 'rgb(112, 173, 71)')).toBe(0);
    await expect(page.locator('[data-control="font-color"] [data-current]')).toHaveAttribute(
      'data-current',
      'none'
    );
  });
});

/**
 * The highlighter's colour.
 *
 * The toggle in the character group was the whole of it: one press, Word's
 * yellow, and no way to ask for another colour — while `toggleHighlight` has
 * taken one since it was written. It cannot be the palette's command, though,
 * because it *toggles*: pressing turquoise on text that is already yellow would
 * take the highlight off rather than turn it turquoise. So `setHighlight`
 * applies and `removeHighlight` clears, the same pair `setFontColor` has always
 * had.
 *
 * Not `setBgColor`, which is the schema's other mark for the same idea: it
 * writes its colour into an attribute called `color` while the schema declares
 * `bgColor` and the only reader looks for `bgColor`, so it reports success and
 * paints nothing. Measured, and written down in the backlog rather than given a
 * control.
 */
test.describe('the highlighter', () => {
  test('takes a colour from the palette, not just its yellow', async ({ page }) => {
    await openDeck(page);
    const sid = await selectLine(page);

    await openPalette(page, 'highlight-color');
    await page.locator('[data-palette="highlight-color"] [data-swatch="7FDBFF"]').click();

    await expect.poll(() => highlightedRuns(page, sid, 'rgb(127, 219, 255)')).toBeGreaterThan(0);
  });

  /**
   * Pressing a second colour changes it. This is the whole reason the palette
   * runs `setHighlight` rather than the toggle the toolbar button uses.
   */
  test('changes colour rather than switching itself off', async ({ page }) => {
    await openDeck(page);
    const sid = await selectLine(page);

    await openPalette(page, 'highlight-color');
    await page.locator('[data-palette="highlight-color"] [data-swatch="FFFF00"]').click();
    await expect.poll(() => highlightedRuns(page, sid, 'rgb(255, 255, 0)')).toBeGreaterThan(0);

    await openPalette(page, 'highlight-color');
    await page.locator('[data-palette="highlight-color"] [data-swatch="FF9AD5"]').click();

    await expect.poll(() => highlightedRuns(page, sid, 'rgb(255, 154, 213)')).toBeGreaterThan(0);
    expect(await highlightedRuns(page, sid, 'rgb(255, 255, 0)')).toBe(0);
  });

  test('comes off again', async ({ page }) => {
    await openDeck(page);
    const sid = await selectLine(page);

    await openPalette(page, 'highlight-color');
    await page.locator('[data-palette="highlight-color"] [data-swatch="FFFF00"]').click();
    await expect.poll(() => highlightedRuns(page, sid, 'rgb(255, 255, 0)')).toBeGreaterThan(0);

    await openPalette(page, 'highlight-color');
    await page.locator('[data-palette="highlight-color"] [data-swatch="none"]').click();

    await expect.poll(() => highlightedRuns(page, sid, 'rgb(255, 255, 0)')).toBe(0);
  });
});
