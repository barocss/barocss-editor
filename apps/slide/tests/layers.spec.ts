import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, attr, visibleBoxes } from './helpers';

/**
 * The list of what is on the slide.
 *
 * Two things the canvas cannot answer, and every design tool answers both with
 * this one control: **picking what is underneath** something (on the canvas it is
 * reached by luck — click through it, or move the thing on top away and put it
 * back), and **where in the stack** a thing goes (the deck's four order buttons are
 * four answers to a question whose answer is a position).
 *
 * The rows are a model, tested in milliseconds (`office-slides/test/layers.test.ts`)
 * and checked against the schema — `every-drawing-can-be-named` exists because the
 * naming table it asks is the kind that falls behind a schema quietly. What only a
 * browser shows is the three gestures: pick a row, toggle a row, drag a row.
 */
const rows = (page: Page) => page.locator('.sl-layers-list li');

const openPanel = async (page: Page) => {
  await page.locator('.sl-layers-closed').click();
  await expect(page.locator('.sl-layers')).toHaveCount(1);
};

const order = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.sl-layers-list li')].map((li) => li.getAttribute('data-layer'))
  );

test.describe('the layer list', () => {
  test('shows what is on the slide, front first', async ({ page }) => {
    await openDeck(page);
    await openPanel(page);

    await expect(rows(page)).not.toHaveCount(0);

    /**
     * Front at the top.
     *
     * Document order is paint order — the last child is drawn over the others — so
     * the list is the children reversed. Checked against the document rather than
     * against a fixture, so the claim is about the rule and not about this deck.
     */
    const listed = await order(page);
    const children = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const slide = document
        .querySelector('.sl-filmstrip button[data-current="true"]')
        ?.getAttribute('data-slide');
      return (store.getNode(slide)?.content ?? []) as string[];
    });
    expect(listed).toEqual([...children].reverse());
  });

  test('picks the row a reader points at, including one under another shape', async ({ page }) => {
    await openDeck(page);
    await openPanel(page);

    // The *last* row is the shape at the back — the one the canvas makes hard to
    // reach, which is half the reason the list exists.
    const back = await rows(page).last().getAttribute('data-layer');
    await rows(page).last().locator('.sl-layer-pick').click();

    await expect
      .poll(() => page.evaluate(() => (window as any).editor.selection?.nodeIds?.[0]))
      .toBe(back);
    await expect(rows(page).last()).toHaveAttribute('data-layer-selected', 'true');
  });

  test('is the same selection the canvas has', async ({ page }) => {
    await openDeck(page);
    await openPanel(page);

    // Selected on the canvas, marked in the list: one selection, two views of it.
    const boxes = await visibleBoxes(page);
    await page.mouse.click(boxes[0].x, boxes[0].y);
    await expect(page.locator(`[data-layer="${boxes[0].sid}"]`)).toHaveAttribute(
      'data-layer-selected',
      'true'
    );
  });

  /**
   * Hiding, which was an attribute nothing could set.
   *
   * `visible` is declared in the *shared* schema and read by the renderers of both
   * products — `isVisible` becomes `display: none`. It had no command and no
   * control, so it worked and no reader could reach it: the same state `locked` was
   * in before the properties panel grew a lock.
   */
  test('hides a shape and brings it back', async ({ page }) => {
    await openDeck(page);
    await openPanel(page);

    const sid = (await rows(page).first().getAttribute('data-layer'))!;
    const shown = () =>
      page.evaluate((s) => {
        const el = document.querySelector(`.sl-stage [data-bc-sid="${s}"]`);
        return el ? getComputedStyle(el).display : 'gone';
      }, sid);

    expect(await shown()).not.toBe('none');

    await rows(page).first().hover();
    await page.locator(`[data-layer-visible="${sid}"]`).click();

    await expect.poll(shown).toBe('none');
    await expect.poll(() => attr(page, sid, 'visible')).toBe(false);
    await expect(rows(page).first()).toHaveAttribute('data-layer-hidden', 'true');

    // And back, from the toggle that is now always drawn — a hidden row has to say
    // so without the pointer being on it.
    await page.locator(`[data-layer-visible="${sid}"]`).click();
    await expect.poll(shown).not.toBe('none');
  });

  test('locks a shape, and the lock stops a drag', async ({ page }) => {
    await openDeck(page);
    await openPanel(page);
    const boxes = await visibleBoxes(page);
    const box = boxes[0];

    await page.locator(`[data-layer="${box.sid}"]`).hover();
    await page.locator(`[data-layer-locked="${box.sid}"]`).click();
    await expect.poll(() => attr(page, box.sid, 'locked')).toBe(true);

    const was = await attr(page, box.sid, 'x');
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 20, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // The lock was readable and unsettable before the panel; now it is both, and
    // this is the half that proves the attribute means something.
    expect(await attr(page, box.sid, 'x')).toBe(was);
  });

  /**
   * Dragging a row to a place in the stack.
   *
   * The question the four order buttons answer badly: moving the fourth of six
   * shapes to second is two presses and some counting. The inversion — the list is
   * upside down, so dragging *up* moves a shape *later* among its parent's children
   * — is `positionFromRow`, in the model with its own tests.
   */
  test('moves a shape through the stack by dragging its row', async ({ page }) => {
    await openDeck(page);
    await openPanel(page);

    const before = await order(page);
    test.skip(before.length < 2, '이 슬라이드에 도형이 둘 미만입니다');

    const bottom = (await rows(page).last().boundingBox())!;
    const top = (await rows(page).first().boundingBox())!;

    // The back shape, dragged to the front of the list.
    await page.mouse.move(bottom.x + bottom.width / 2, bottom.y + bottom.height / 2);
    await page.mouse.down();
    await page.mouse.move(top.x + top.width / 2, top.y + 2, { steps: 8 });
    // Where it would land is drawn while it is held, so a reader is not guessing.
    await expect(page.locator('[data-layer-over="true"]')).toHaveCount(1);
    await page.mouse.up();

    await expect.poll(() => order(page)).toEqual([before[before.length - 1], ...before.slice(0, -1)]);
  });

  test('is not drawn while presenting', async ({ page }) => {
    await openDeck(page);
    await openPanel(page);
    await expect(page.locator('.sl-layers')).toHaveCount(1);

    // An audience is looking — the same rule the rulers and the guides follow.
    await page.locator('[data-present]').click();
    await expect(page.locator('.sl-layers')).toBeHidden();
  });
});
