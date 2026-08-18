import { test, expect } from '@playwright/test';
import { openDeck, visibleBoxes, boxCounts, attr, currentSlide } from './helpers';

/**
 * Editing what is on a slide.
 *
 * These were run by hand a dozen times while the features were written, in
 * probes that were deleted afterwards — which is why a bug in the zoom control
 * survived a week of looking at the app. They are written down now.
 */
test.describe('a box on a slide', () => {
  test('is selected by a click, and shows its properties', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page);

    await page.mouse.click(box.x, box.y);
    await expect(page.locator('.sl-properties')).toContainText('위치');
    expect(await page.evaluate(() => (window as any).editor.selection?.nodeIds)).toEqual([box.sid]);
  });

  /**
   * A drag moves the *shape*, not an outline of it. The document is still
   * written once, at the end.
   */
  test('follows the pointer while it is dragged, and settles where it is dropped', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page);
    await page.mouse.click(box.x, box.y);

    const at = async () =>
      await page.evaluate(
        (sid) => Math.round(document.querySelector(`.sl-stage [data-bc-sid="${sid}"]`)!.getBoundingClientRect().x),
        box.sid
      );

    const before = await at();
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y, { steps: 10 });

    // Mid-drag: the shape itself has moved with the pointer.
    expect(Math.abs((await at()) - before - 120)).toBeLessThanOrEqual(2);

    await page.mouse.up();
    await page.waitForTimeout(400);

    // And it does not jump when the document takes over.
    expect(Math.abs((await at()) - before - 120)).toBeLessThanOrEqual(2);
    // The overlay's transient offset is gone; the position is the model's.
    expect(
      await page.evaluate(
        (sid) => document.querySelector<HTMLElement>(`.sl-stage [data-bc-sid="${sid}"]`)!.style.translate,
        box.sid
      )
    ).toBe('');
  });

  test('is nudged by an arrow key, and further with Shift', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page);
    await page.mouse.click(box.x, box.y);

    const x = async () => Number(await attr(page, box.sid, 'x'));
    const start = await x();

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    expect(await x()).toBe(start + 15);

    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(250);
    expect(await x()).toBe(start + 15 + 144);
  });

  test('is copied, pasted and cut with the keys every tool binds', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page);
    await page.mouse.click(box.x, box.y);

    const on = async (index: number) => (await boxCounts(page))[index];
    const before = await on(0);

    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(500);
    expect(await on(0)).toBe(before + 1);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    expect(await on(0)).toBe(before);
  });

  test('is thrown away by Delete, and comes back with undo', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page);
    await page.mouse.click(box.x, box.y);

    const before = (await boxCounts(page))[0];
    await page.keyboard.press('Delete');
    await page.waitForTimeout(400);
    expect((await boxCounts(page))[0]).toBe(before - 1);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    expect((await boxCounts(page))[0]).toBe(before);
  });
});

test.describe('typing in a box', () => {
  /**
   * Entering the text has to tell the *model*, not only the DOM. It did not,
   * and every command that reads the selection was answering about the box
   * while the reader typed into a paragraph — the table button looked perfectly
   * enabled and did nothing.
   */
  test('gives the model a caret, so the toolbar means something', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page, '.sl-text-frame');

    await page.mouse.dblclick(box.x, box.y);
    await page.waitForTimeout(400);

    const selection = await page.evaluate(() => {
      const s = (window as any).editor.selection;
      return { type: s?.type, inText: typeof s?.startOffset === 'number' };
    });
    expect(selection.type).toBe('range');
    expect(selection.inText).toBe(true);

    // The formatting half of the toolbar is alive, which it was not before.
    await expect(page.getByLabel('굵게')).toBeEnabled();
    await expect(page.getByLabel('가운데 맞춤')).toBeEnabled();
  });

  test('writes what is typed, and undoes it', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page, '.sl-text-frame');
    await page.mouse.dblclick(box.x, box.y);
    await page.waitForTimeout(400);

    const text = async () =>
      await page.evaluate(
        (sid) => document.querySelector(`.sl-stage [data-bc-sid="${sid}"]`)?.textContent ?? '',
        box.sid
      );
    const before = await text();

    await page.keyboard.type('XY', { delay: 60 });
    await page.waitForTimeout(500);
    expect((await text()).length).toBe(before.length + 2);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    expect(await text()).toBe(before);
  });
});

test.describe('the presenter’s note', () => {
  test('is editable, and shares the deck’s history', async ({ page }) => {
    await openDeck(page);
    // The second slide is the one the sample deck gives a note.
    await page.locator('.sl-filmstrip button').nth(1).click();
    await page.waitForTimeout(600);

    const note = page.locator('.sl-notes-host .sl-note');
    await expect(note).toBeVisible();
    const before = (await note.textContent()) ?? '';

    await page.locator('.sl-notes-host p').first().click();
    await page.keyboard.type('!!', { delay: 60 });
    await page.waitForTimeout(500);
    expect(((await note.textContent()) ?? '').length).toBe(before.length + 2);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    expect(await note.textContent()).toBe(before);
  });

  /** A note belongs to one slide, and the stage never draws it. */
  test('is not drawn on the slide', async ({ page }) => {
    await openDeck(page);
    const onStage = await page.evaluate(
      () =>
        [...document.querySelectorAll('.sl-host .sl-note')].filter(
          (n) => getComputedStyle(n).display !== 'none'
        ).length
    );
    expect(onStage).toBe(0);
  });
});
