import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, attr } from './helpers';

/**
 * Cropping a picture.
 *
 * The deck could put a photograph on a slide whole or not at all: `picture`
 * declared `fit`, which nothing could set, and there was no crop at all — the
 * most-missed thing in every tool this product is measured against, where
 * cropping is not an effect somebody goes looking for but what putting a
 * photograph on a slide *is*.
 *
 * The arithmetic is in `office-slides/test/crop.test.ts` — the fractions, the
 * scale, the offset, the clamps. What only a browser shows is the gesture: a
 * double-click enters the mode, a handle takes source away instead of resizing,
 * and the rest of the picture does not move while it happens.
 */
const PICTURE =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#0ea5e9"/></svg>'
  ).toString('base64');

/** A picture on the first slide, selected, with a box we know the size of. */
const placePicture = async (page: Page): Promise<string> => {
  const sid = await page.evaluate(async (src) => {
    const editor = (window as any).editor;
    await editor.executeCommand('insertPicture', { src, alt: 'test', width: 6000, height: 3000 });
    return editor.selection?.nodeIds?.[0] as string;
  }, PICTURE);

  await page.waitForTimeout(300);
  // Where the model says it is, so the test does not depend on the layout.
  await page.evaluate(
    (id) => (window as any).editor.executeCommand('setBoxGeometry', { nodeId: id, x: 1200, y: 1200 }),
    sid
  );
  await page.waitForTimeout(300);
  return sid;
};

/** The picture's element on the stage, and the image inside it. */
const drawn = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const box = document.querySelector<HTMLElement>(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!;
    const image = box.querySelector<HTMLElement>('img')!;
    const outer = box.getBoundingClientRect();
    const inner = image.getBoundingClientRect();
    return {
      overflow: getComputedStyle(box).overflow,
      left: Math.round(outer.left),
      width: Math.round(outer.width),
      // Where the picture itself is, which is the thing that must not move.
      imageLeft: Math.round(inner.left),
      imageWidth: Math.round(inner.width)
    };
  }, sid);

/** The middle of the picture, on screen. */
const centreOf = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const r = document
      .querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!
      .getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), left: r.x, right: r.right, top: r.y };
  }, sid);

test.describe('cropping a picture', () => {
  test('is entered by a double-click, and left by Escape', async ({ page }) => {
    await openDeck(page);
    const sid = await placePicture(page);

    const at = await centreOf(page, sid);
    await page.mouse.dblclick(at.x, at.y);
    await expect(page.locator('.sl-overlay')).toHaveAttribute('data-cropping', sid);

    await page.keyboard.press('Escape');
    await expect(page.locator('.sl-overlay')).not.toHaveAttribute('data-cropping', sid);
  });

  /**
   * The behaviour the whole feature is: dragging the left handle in cuts the
   * left of the picture away and **the rest of it does not move**. Holding the
   * box still and rescaling what is left — the other reading of the same
   * gesture — would make the whole picture jump and zoom while one edge is
   * dragged, and no tool does that.
   */
  test('takes source off the side that was dragged, leaving the rest where it was', async ({
    page
  }) => {
    await openDeck(page);
    const sid = await placePicture(page);

    const at = await centreOf(page, sid);
    await page.mouse.dblclick(at.x, at.y);
    await expect(page.locator('.sl-overlay')).toHaveAttribute('data-cropping', sid);

    const before = await drawn(page, sid);

    // The west handle, dragged a quarter of the way across the picture.
    const quarter = Math.round(before.width / 4);
    await page.mouse.move(at.left, at.y);
    await page.mouse.down();
    await page.mouse.move(at.left + quarter, at.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // A quarter of the source is gone, and the box lost exactly that much.
    expect(Number(await attr(page, sid, 'cropLeft'))).toBeGreaterThan(0.2);
    expect(Number(await attr(page, sid, 'cropLeft'))).toBeLessThan(0.3);
    expect(Number(await attr(page, sid, 'cropRight'))).toBe(0);
    expect(Number(await attr(page, sid, 'width'))).toBeLessThan(6000);

    const after = await drawn(page, sid);
    expect(after.overflow).toBe('hidden');
    // The picture inside is drawn wider than its box now, and its own left edge
    // is within a pixel of where it was: the part still showing has not moved.
    expect(after.imageWidth).toBeGreaterThan(after.width);
    expect(Math.abs(after.imageLeft - before.imageLeft)).toBeLessThanOrEqual(2);
  });

  test('is one undo, box and crop together', async ({ page }) => {
    await openDeck(page);
    const sid = await placePicture(page);

    const at = await centreOf(page, sid);
    await page.mouse.dblclick(at.x, at.y);
    await page.mouse.move(at.left, at.y);
    await page.mouse.down();
    await page.mouse.move(at.left + 60, at.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    expect(Number(await attr(page, sid, 'cropLeft'))).toBeGreaterThan(0);

    await page.evaluate(() => (window as any).editor.executeCommand('historyUndo'));
    await page.waitForTimeout(400);

    // Both halves come back, which is the reason they are one command: a box
    // that shrank without its crop is a squashed picture.
    expect(Number(await attr(page, sid, 'cropLeft') ?? 0)).toBe(0);
    expect(Number(await attr(page, sid, 'width'))).toBe(6000);
  });

  test('has a way back in the panel, which gives the whole picture again', async ({ page }) => {
    await openDeck(page);
    const sid = await placePicture(page);

    const at = await centreOf(page, sid);
    await page.mouse.dblclick(at.x, at.y);
    await page.mouse.move(at.left, at.y);
    await page.mouse.down();
    await page.mouse.move(at.left + 80, at.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    expect(Number(await attr(page, sid, 'cropLeft'))).toBeGreaterThan(0);

    await page.evaluate((id) => (window as any).editor.executeCommand('setNode', { nodeIds: [id] }), sid);
    await page.locator('.sl-properties').getByLabel('자르기 원래대로').click();
    await page.waitForTimeout(400);

    expect(Number(await attr(page, sid, 'cropLeft') ?? 0)).toBe(0);
    // And the box grew back by what was cut, so the picture is not squeezed
    // into the rectangle the crop had left.
    expect(Number(await attr(page, sid, 'width'))).toBe(6000);
  });

  /** A shape has no source to show part of; the mode is a picture's alone. */
  test('is not entered by double-clicking a shape', async ({ page }) => {
    await openDeck(page);
    await page.getByRole('button', { name: '사각형' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).editor?.selection?.startNodeId ?? null))
      .not.toBeNull();

    const sid = await page.evaluate(() => (window as any).editor.selection.nodeIds[0] as string);
    const at = await centreOf(page, sid);
    await page.mouse.dblclick(at.x, at.y);

    await expect(page.locator('.sl-overlay')).not.toHaveAttribute('data-cropping', sid);
  });
});
