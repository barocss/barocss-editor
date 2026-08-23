import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, visibleBoxes, attr } from './helpers';

/**
 * Where the text sits inside its box.
 *
 * `verticalAlign` was declared on `textFrame` the day the node was written and
 * read by the renderer ever since — with nothing anywhere that could set it. A
 * title centred in its placeholder was a document you could write by hand and
 * not by editing, which is the shape of fault this repository keeps finding in
 * itself: declared, drawn, unreachable. The inset did not exist at all, so text
 * with a fill behind it touched its own border.
 *
 * The arithmetic is in `office-slides/test/text-box.test.ts`. What only a
 * browser shows is the chain — the panel writes an attribute, the schema keeps
 * it, the renderer reads it, the browser lays it out — and the one thing that
 * cannot be checked in jsdom: that a box given room inside it is still exactly
 * as wide as the document says.
 */
const panel = (page: Page) => page.locator('.sl-properties');

const selectFrame = async (page: Page) => {
  const [frame] = await visibleBoxes(page, '.sl-text-frame');
  await page.mouse.click(frame.x, frame.y);
  await expect
    .poll(() => page.evaluate(() => (window as any).editor.selection?.nodeIds?.[0] ?? null))
    .not.toBeNull();
  return frame;
};

const cssOf = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const el = document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!;
    const style = getComputedStyle(el);
    return {
      justifyContent: style.justifyContent,
      paddingLeft: style.paddingLeft,
      boxSizing: style.boxSizing,
      width: Math.round(el.getBoundingClientRect().width)
    };
  }, sid);

test.describe('the text inside a box', () => {
  test('is moved to the middle, and to the bottom, from the panel', async ({ page }) => {
    await openDeck(page);
    const frame = await selectFrame(page);

    await panel(page).getByLabel('세로 맞춤').selectOption('middle');
    await expect.poll(async () => (await cssOf(page, frame.sid)).justifyContent).toBe('center');
    expect(await attr(page, frame.sid, 'verticalAlign')).toBe('middle');

    await panel(page).getByLabel('세로 맞춤').selectOption('bottom');
    await expect.poll(async () => (await cssOf(page, frame.sid)).justifyContent).toBe('flex-end');
  });

  /**
   * The room goes *inside* the box the document placed.
   *
   * A padding outside the border box would add to the width the model gave it,
   * so two boxes placed edge to edge would overlap by their insets and the slide
   * would stop being what the document says. This is the check that cannot be
   * made without a browser: jsdom does no layout, so it would report whatever
   * the renderer wrote either way.
   */
  test('is given room without making its box any wider', async ({ page }) => {
    await openDeck(page);
    const frame = await selectFrame(page);

    const before = await cssOf(page, frame.sid);

    await panel(page).getByLabel('텍스트 안쪽 여백').fill('0.5');
    await panel(page).getByLabel('텍스트 안쪽 여백').press('Enter');

    // Half a centimetre is 283 twips, which is 18.87px.
    await expect.poll(async () => (await cssOf(page, frame.sid)).paddingLeft).toBe('18.87px');

    const after = await cssOf(page, frame.sid);
    expect(after.boxSizing).toBe('border-box');
    expect(after.width).toBe(before.width);
  });

  /**
   * The rows come from the schema, like every other row in this panel: a shape
   * that declares no `verticalAlign` is not asked where its text sits.
   */
  test('is not asked of a shape that holds no text', async ({ page }) => {
    await openDeck(page);
    await page.getByRole('button', { name: '사각형' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).editor?.selection?.startNodeId ?? null))
      .not.toBeNull();

    await expect(panel(page).getByLabel('세로 맞춤')).toHaveCount(0);
  });
});
