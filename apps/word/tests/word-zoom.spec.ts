import { test, expect, type Page } from '@playwright/test';
import { settled } from './helpers';

/**
 * Zoom, which a page has to survive without moving a single break.
 *
 * A reader who zooms out to see the shape of a document and finds the pages
 * break somewhere else has been shown a different document. So zoom is a
 * `transform: scale` — a visual change that leaves the layout alone — and not
 * the `zoom` property, which affects layout and drifts: measured, a paragraph
 * keeps all eight of its lines under a transform and every length comes back
 * multiplied by exactly the factor, where `zoom` gave 77.88px for 78.
 *
 * The measurement pass divides the factor back out, reading it from the element
 * rather than being told — a measurement that has to be told the zoom is a
 * measurement that is wrong whenever somebody forgets.
 */

/** Every page break in the document, as one comparable string. */
const breaksOf = (page: Page) =>
  page.evaluate(() => {
    const layout = (window as any).wordLayout?.values().next().value;
    return (layout?.pages ?? [])
      .map((slice: any) =>
        slice.fragments.map((f: any) => `${f.sid}:${f.fromLine}-${f.toLine}`).join(',')
      )
      .join('|');
  });

const frameOf = (page: Page) =>
  page.evaluate(() => {
    const frame = document.querySelector('.w-zoom-frame')!.getBoundingClientRect();
    const surface = document.querySelector('.w-surface')!.getBoundingClientRect();
    return {
      frameWidth: Math.round(frame.width),
      frameHeight: Math.round(frame.height),
      surfaceWidth: Math.round(surface.width)
    };
  });

test('a page breaks in the same place at every size', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(700);

  const whole = await breaksOf(page);
  expect(whole.length, 'no layout to compare').toBeGreaterThan(50);

  for (const step of [2, 3]) {
    for (let click = 0; click < step; click += 1) {
      await page.locator('[data-zoom-out]').click();
    }
    await page.waitForTimeout(900);
    expect(await breaksOf(page), 'a page broke somewhere else once zoomed').toBe(whole);
    for (let click = 0; click < step; click += 1) {
      await page.locator('[data-zoom-in]').click();
    }
    await page.waitForTimeout(900);
  }
});

test('the page is drawn smaller, and takes up the room it is drawn in', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(700);

  const whole = await frameOf(page);
  await page.locator('[data-zoom-out]').click();
  await page.waitForTimeout(700);
  const smaller = await frameOf(page);

  // Drawn at four fifths
  expect(smaller.surfaceWidth / whole.surfaceWidth).toBeCloseTo(0.8, 1);
  // And the frame with it: a scaled element still occupies its unscaled room,
  // so without this half the pane is blank below the page — and at double size
  // the bottom of the document cannot be scrolled to at all.
  expect(smaller.frameHeight / whole.frameHeight).toBeCloseTo(0.8, 1);
});

test('the ruler stays against the page it measures', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(700);

  const aligned = () =>
    page.evaluate(() => {
      const surface = document.querySelector('.w-surface')!.getBoundingClientRect();
      const style = getComputedStyle(document.querySelector('.w-surface')!);
      const text = document.querySelector('.w-ruler-text')!.getBoundingClientRect();
      // The page's padding is scaled with everything else
      const scale = surface.width / (document.querySelector('.w-surface') as HTMLElement).offsetWidth;
      return {
        rulerLeft: Math.round(text.left),
        wantLeft: Math.round(surface.left + parseFloat(style.paddingLeft) * scale),
        rulerWidth: Math.round(text.width),
        wantWidth: Math.round(
          surface.width -
            (parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)) * scale
        )
      };
    });

  // It needs no change of its own: the ruler works in fractions of the page
  // rather than in pixels, so a scaled page and a scaled ruler agree by
  // arithmetic.
  await page.locator('[data-zoom-out]').click();
  await page.waitForTimeout(800);
  const at = await aligned();
  expect(Math.abs(at.rulerLeft - at.wantLeft)).toBeLessThanOrEqual(2);
  expect(Math.abs(at.rulerWidth - at.wantWidth)).toBeLessThanOrEqual(2);
});

test('takes a number typed into it, and a fit to the pane', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(700);

  const value = page.locator('[data-zoom-value]');
  await value.fill('150%');
  await value.press('Enter');
  await page.waitForTimeout(700);
  await expect(page.locator('.w-zoom-frame')).toHaveAttribute('data-zoom', '1.50');

  await page.locator('[data-zoom-fit]').click();
  await page.waitForTimeout(700);

  // Fitted, the page is as wide as the room the pane has for it
  const fitted = await page.evaluate(() => {
    const pane = document.querySelector('.w-shell-document') as HTMLElement;
    const style = getComputedStyle(pane);
    const room =
      pane.clientWidth -
      (parseFloat(style.paddingLeft) || 0) -
      (parseFloat(style.paddingRight) || 0);
    return {
      room: Math.round(room),
      page: Math.round(document.querySelector('.w-surface')!.getBoundingClientRect().width)
    };
  });
  expect(Math.abs(fitted.page - fitted.room)).toBeLessThanOrEqual(3);
});
