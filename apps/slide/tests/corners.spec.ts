import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, visibleBoxes, attr } from './helpers';

/**
 * How round each corner is.
 *
 * One radius for all four is a diagram's vocabulary; a card with two rounded
 * corners at the top and square ones at the bottom is what a designer asks for,
 * and Canva, Figma and Keynote all give four numbers. It is the fourth of the
 * design vocabulary, after the gradient, the shadow and the dash.
 *
 * The arithmetic is in `office-slides/test/corners.test.ts`. What only a browser
 * shows is the chain — the panel writes an attribute, the schema keeps it, the
 * renderer reads it, the browser draws the corner — and the thing that made this
 * worth doing at all: **every box a reader rounds can be rounded**, where before
 * only the rectangle could.
 */
const panel = (page: Page) => page.locator('.sl-properties');

const radiusOf = (page: Page, sid: string) =>
  page.evaluate(
    (id) =>
      getComputedStyle(
        document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!
      ).borderRadius,
    sid
  );

const newRectangle = async (page: Page) => {
  await page.getByRole('button', { name: '사각형' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).editor?.selection?.startNodeId ?? null))
    .not.toBeNull();
  return page.evaluate(() => (window as any).editor.selection.nodeIds[0] as string);
};

test.describe('the corners of a box', () => {
  test('are rounded together by the one field, as they always were', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);

    await panel(page).getByLabel('모서리 둥글기').fill('0.5');
    await panel(page).getByLabel('모서리 둥글기').press('Enter');

    // Half a centimetre is 283 twips, which is 18.87px.
    await expect.poll(() => radiusOf(page, sid)).toBe('18.87px');
  });

  test('are each set on their own, clockwise from the top left', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);

    await panel(page).getByLabel('왼쪽 위 모서리').fill('1');
    await panel(page).getByLabel('왼쪽 위 모서리').press('Enter');
    await page.waitForTimeout(300);
    await panel(page).getByLabel('오른쪽 위 모서리').fill('0.5');
    await panel(page).getByLabel('오른쪽 위 모서리').press('Enter');

    // One centimetre is 567 twips (37.8px); half of it is 283 (18.87px); the two
    // corners nobody touched are square.
    await expect.poll(() => radiusOf(page, sid)).toBe('37.8px 18.87px 0px 0px');
    expect(await attr(page, sid, 'cornerTopLeft')).toBe(567);
  });

  /**
   * The fallback is the whole reason the four corners are declared without a
   * default: an unset corner follows the radius the box carries, so the single
   * field still rounds everything and the four are an override.
   */
  test('follow the box’s own radius until one is set', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);

    await panel(page).getByLabel('모서리 둥글기').fill('0.5');
    await panel(page).getByLabel('모서리 둥글기').press('Enter');
    await expect.poll(() => radiusOf(page, sid)).toBe('18.87px');

    await panel(page).getByLabel('왼쪽 아래 모서리').fill('0');
    await panel(page).getByLabel('왼쪽 아래 모서리').press('Enter');

    await expect.poll(() => radiusOf(page, sid)).toBe('18.87px 18.87px 18.87px 0px');
  });

  /**
   * The reason this was worth doing beyond the fourth number: `cornerRadius` was
   * read by the rectangle and by nothing else, so a text box could not be
   * rounded at all — and a rounded text box is what half the cards in every
   * template are.
   */
  test('are offered on a text box too, which could not be rounded at all', async ({ page }) => {
    await openDeck(page);
    const [frame] = await visibleBoxes(page, '.sl-text-frame');
    await page.mouse.click(frame.x, frame.y);
    await expect
      .poll(() => page.evaluate(() => (window as any).editor.selection?.nodeIds?.[0] ?? null))
      .toBe(frame.sid);

    await panel(page).getByLabel('모서리 둥글기').fill('0.5');
    await panel(page).getByLabel('모서리 둥글기').press('Enter');

    await expect.poll(() => radiusOf(page, frame.sid)).toBe('18.87px');
  });

  /**
   * And **back**, which is the half that did not exist.
   *
   * A corner set to 0 and a corner not set draw differently — 0 is square, unset follows the radius
   * — and the panel could reach the first and never the second again. Three separate layers dropped
   * it: the field read an emptied box as *leave it alone*, the panel's unit conversion turned it
   * into `NaN`, and the command's own filter required a number. Each on its own was enough.
   *
   * `office-ui/test/number-field.test.ts` states the rule and
   * `office-slides/test/clearing-a-value.test.ts` states what the commands do with it. This is the
   * chain: a reader deletes what is in a field, and the box goes back to being round there.
   */
  test('are given back by emptying the field, which is not the same as typing 0', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);

    await panel(page).getByLabel('모서리 둥글기').fill('0.5');
    await panel(page).getByLabel('모서리 둥글기').press('Enter');
    await panel(page).getByLabel('왼쪽 아래 모서리').fill('0');
    await panel(page).getByLabel('왼쪽 아래 모서리').press('Enter');
    await expect.poll(() => radiusOf(page, sid)).toBe('18.87px 18.87px 18.87px 0px');
    expect(await attr(page, sid, 'cornerBottomLeft')).toBe(0);

    await panel(page).getByLabel('왼쪽 아래 모서리').fill('');
    await panel(page).getByLabel('왼쪽 아래 모서리').press('Enter');

    await expect.poll(() => radiusOf(page, sid)).toBe('18.87px');
    expect(await attr(page, sid, 'cornerBottomLeft')).toBeUndefined();
  });

  /**
   * And a field a reader merely passes through says nothing at all.
   *
   * The four corner fields show the radius they follow rather than a zero, which is what makes the
   * panel honest about what the box is drawing — and it means every one of them is sitting there
   * holding a number that is **not theirs**. A commit on blur that wrote what it was showing would
   * freeze all four the first time a reader tabbed past them, and the follow would be gone with no
   * gesture having been made.
   */
  test('are not stated by tabbing past a field that only shows what it follows', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);

    await panel(page).getByLabel('모서리 둥글기').fill('0.5');
    await panel(page).getByLabel('모서리 둥글기').press('Enter');
    await expect.poll(() => radiusOf(page, sid)).toBe('18.87px');

    await panel(page).getByLabel('왼쪽 위 모서리').click();
    await panel(page).getByLabel('오른쪽 위 모서리').click();
    await panel(page).getByLabel('모서리 둥글기').click();
    await page.waitForTimeout(300);

    expect(await attr(page, sid, 'cornerTopLeft')).toBeUndefined();
    expect(await attr(page, sid, 'cornerTopRight')).toBeUndefined();

    // Still following: change the radius and all four move with it.
    await panel(page).getByLabel('모서리 둥글기').fill('1');
    await panel(page).getByLabel('모서리 둥글기').press('Enter');
    await expect.poll(() => radiusOf(page, sid)).toBe('37.8px');
  });

  /** An ellipse is round by construction; four fields there would change nothing. */
  test('are not offered on an ellipse', async ({ page }) => {
    await openDeck(page);
    await page.getByRole('button', { name: '타원' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).editor?.selection?.startNodeId ?? null))
      .not.toBeNull();

    await expect(panel(page).getByLabel('왼쪽 위 모서리')).toHaveCount(0);
  });
});
