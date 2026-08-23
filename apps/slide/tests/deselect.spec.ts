import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, visibleBoxes } from './helpers';

/**
 * Letting a box go.
 *
 * Written down as a missing gesture — "neither Escape nor a click on empty slide
 * deselects" — found while writing the shape-style tests, which had to *reload
 * the page* to reach a deck with nothing selected.
 *
 * It was not a missing gesture. Both already cleared the model's selection, and the
 * measurement said so: `editor.selection` was `null` while the properties panel
 * went on offering the shape's position and the overlay went on drawing handles
 * around it. **Nobody heard the clear.** A selection that is something announces
 * itself on `editor:selection.model`; a selection *cleared* announces itself on
 * `editor:selection.change` and on nothing else, and this deck's chrome listened
 * to the first alone.
 *
 * A deleted box is here for a different reason. The editor drops a selection
 * that points at a node the document no longer has, and that path announces
 * nothing at all — this passes because the same delete emits
 * `editor:content.change`, which the chrome also listens to. Measured, by taking
 * the announcement out again: still green. So the silence is left alone and
 * written down in the backlog rather than changed on a hunch, and this test
 * holds the behaviour a reader sees whichever event carries it.
 */
const selection = (page: Page) =>
  page.evaluate(() => (window as any).editor.selection?.nodeIds ?? null);

const chrome = async (page: Page) => ({
  handles: await page.locator('.sl-handles').count(),
  outlines: await page.locator('.sl-selected').count(),
  panel: await page.locator('.sl-properties').innerText()
});

const selectFirstBox = async (page: Page) => {
  const [box] = await visibleBoxes(page);
  await page.mouse.click(box.x, box.y);
  await expect.poll(() => selection(page)).toEqual([box.sid]);
  return box;
};

/** A point on the slide with no box under it. */
const emptySpot = (page: Page) =>
  page.evaluate(() => {
    const overlay = document.querySelector('.sl-overlay')!.getBoundingClientRect();
    return { x: Math.round(overlay.right - 8), y: Math.round(overlay.bottom - 8) };
  });

test.describe('letting a box go', () => {
  test('a click on empty slide clears it, and the chrome follows', async ({ page }) => {
    await openDeck(page);
    await selectFirstBox(page);
    expect((await chrome(page)).handles).toBe(1);

    const empty = await emptySpot(page);
    await page.mouse.click(empty.x, empty.y);

    await expect.poll(() => selection(page)).toBeNull();
    await expect.poll(async () => (await chrome(page)).handles).toBe(0);

    const after = await chrome(page);
    expect(after.outlines).toBe(0);
    // The panel is back to the slide rather than to a box nobody has selected.
    // Asked by the hint it shows when nothing is selected, because its *empty*
    // text mentions 위치 too — "상자를 클릭하면 위치와 크기가 여기에 나옵니다".
    expect(after.panel).toContain('상자를 클릭하면');
  });

  test('Escape clears it too, when there is nothing to come out of', async ({ page }) => {
    await openDeck(page);
    await selectFirstBox(page);

    await page.keyboard.press('Escape');

    await expect.poll(() => selection(page)).toBeNull();
    await expect.poll(async () => (await chrome(page)).handles).toBe(0);
  });

  /**
   * Escape means "leave" three times over — leave the text, leave the container,
   * leave crop — and each is a step outward. One press must never do two of
   * them, so inside a container it comes out and leaves the container selected.
   */
  test('Escape comes out of a container before it clears anything', async ({ page }) => {
    await openDeck(page);
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(500);

    const [shape] = await visibleBoxes(page, '.sl-rectangle');
    await page.mouse.dblclick(shape.x, shape.y);
    await page.waitForTimeout(400);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // Out one level, with the container held — not an empty selection.
    const held = await selection(page);
    expect(held).not.toBeNull();
    expect(held).not.toEqual([shape.sid]);
  });

  /**
   * The engine half. A selection whose node has gone is dropped by the editor
   * itself, on a path that used to announce nothing — so the panel kept offering
   * the position of a deleted shape and the overlay kept drawing its handles.
   */
  test('a deleted box takes its handles and its panel with it', async ({ page }) => {
    await openDeck(page);
    await selectFirstBox(page);

    await page.evaluate(() => (window as any).editor.executeCommand('deleteBoxes'));

    await expect.poll(async () => (await chrome(page)).handles).toBe(0);
    expect((await chrome(page)).panel).toContain('상자를 클릭하면');
  });
});
