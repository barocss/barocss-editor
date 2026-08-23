import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, visibleBoxes, boxCounts, attr } from './helpers';

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

/**
 * What a drag says while it is happening.
 *
 * It said nothing: a reader resizing a box to a size had to let go and read the
 * panel, then try again — twice per attempt. Every drawing tool draws this, and
 * which number it draws is the question the gesture is asking: a move is about
 * *where*, a resize about *how big*, a turn about *how far round*.
 *
 * In the reader's own unit, which is the app's now rather than the panel's — a
 * badge saying millimetres beside a panel saying centimetres would be two answers
 * to one question.
 */
test.describe('the readout a drag draws', () => {
  const says = (page: Page) =>
    page.evaluate(() => document.querySelector('[data-drag-readout]')?.textContent ?? null);

  test('says where while moving, how big while resizing, and nothing at rest', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page);
    await page.mouse.click(box.x, box.y);
    await expect
      .poll(() => page.evaluate(() => (window as any).editor.selection?.nodeIds?.[0] ?? null))
      .toBe(box.sid);

    // Nothing is being dragged, so there is nothing to say.
    expect(await says(page)).toBeNull();

    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 30, { steps: 6 });
    // A position: two numbers in the panel's unit.
    await expect.poll(() => says(page)).toMatch(/^[\d.]+cm, [\d.]+cm$/);
    await page.mouse.up();

    // And it goes when the gesture does.
    await expect.poll(() => says(page)).toBeNull();

    /**
     * A handle that is **on the stage**, which is not every handle.
     *
     * The overlay may not draw outside the stage, so a handle belonging to a shape that
     * now hangs over the slide's edge is clipped: it is in the DOM with a rectangle, and
     * `elementFromPoint` there answers `.sl-stage`. Measured — this test asked for the
     * east handle of a box that is nearly as wide as the slide, right after dragging it
     * 60px to the right, and pressed on nothing at all.
     */
    const handle = await page.evaluate(() => {
      const stage = document.querySelector('.sl-stage')!.getBoundingClientRect();
      for (const which of ['se', 'e', 's', 'sw', 'w']) {
        const found = document.querySelector(`[data-handle="${which}"]`);
        if (!found) continue;
        const rect = found.getBoundingClientRect();
        const at = { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
        const inside =
          at.x > stage.left + 2 &&
          at.x < stage.right - 2 &&
          at.y > stage.top + 2 &&
          at.y < stage.bottom - 2;
        if (inside && document.elementFromPoint(at.x, at.y) === found) return at;
      }
      throw new Error('크기 조절 손잡이가 스테이지 안에 하나도 없습니다');
    });
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    // Inwards, so the drag stays on the stage whichever handle was reachable.
    await page.mouse.move(handle.x - 60, handle.y - 30, { steps: 6 });
    // A size: `W × H`, which is what Figma draws and what a reader is asking.
    await expect.poll(() => says(page)).toMatch(/^[\d.]+cm × [\d.]+cm$/);
    await page.mouse.up();
  });

  test('says the angle while turning', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page);
    await page.mouse.click(box.x, box.y);
    const knob = await page.evaluate(() => {
      const found = document.querySelector('[data-handle="rotate"]');
      if (!found) return null;
      const rect = found.getBoundingClientRect();
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    });
    expect(knob).not.toBeNull();

    await page.mouse.move(knob!.x, knob!.y);
    await page.mouse.down();
    await page.mouse.move(knob!.x + 70, knob!.y + 40, { steps: 8 });
    await expect.poll(() => says(page)).toMatch(/^-?\d+°$/);
    await page.mouse.up();
  });
});
