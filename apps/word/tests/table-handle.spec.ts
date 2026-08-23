import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settled } from './helpers';

/**
 * The handle at a table's corner, and the last selection type to get a producer.
 *
 * `SelectionType` has been `'range' | 'node' | 'cell' | 'table'` since selections
 * were written. `cell` got its producer when dragging across cells was built;
 * `table` is this. A block of cells and a whole table are not the same selection
 * however many cells the block contains, and the difference is what Delete
 * means: clearing what is in a set of cells, or taking the table away.
 *
 * All of it is pointer work, so all of it is here. Two things failed on the way
 * and both are the sort only a browser shows:
 *
 * - The handle sits *outside* the table's corner, so moving towards it takes the
 *   pointer off the table — and the first version hid the handle on the way to
 *   it. It appeared on hover and clicking it landed on nothing.
 * - Every key binding is guarded by `editorFocus`, and taking the gesture without
 *   letting the browser move focus to the button left focus nowhere: Delete did
 *   nothing at all, which looks exactly like a broken command.
 */
const hoverTable = async (page: Page) => {
  const table = page.locator('.w-table').first();
  await table.scrollIntoViewIfNeeded();

  // Let the table stop moving before aiming at it; `settled()` waits for the
  // page count, and placement carries on after that.
  let previous = '';
  let box = await table.boundingBox();
  for (let attempt = 0; attempt < 20; attempt++) {
    const key = box ? `${Math.round(box.x)},${Math.round(box.y)}` : '';
    if (box && key === previous) break;
    previous = key;
    await page.waitForTimeout(100);
    box = await table.boundingBox();
  }
  if (!box) throw new Error('no table on screen');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  return box;
};

const selectTable = async (page: Page) => {
  await hoverTable(page);
  const handle = page.locator('.w-table-handle');
  await expect(handle).toBeVisible();

  const at = await handle.boundingBox();
  if (!at) throw new Error('the handle is not on screen');
  await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
};

const selectionType = (page: Page) =>
  page.evaluate(() => (window as any).editor?.selection?.type ?? null);

test.describe('the handle at a table’s corner', () => {
  test('appears over a table and not otherwise', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await expect(page.locator('.w-table-handle')).toBeHidden();
    await hoverTable(page);
    await expect(page.locator('.w-table-handle')).toBeVisible();
  });

  test('sits outside the corner, where it covers no text', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const table = await hoverTable(page);
    const handle = await page.locator('.w-table-handle').boundingBox();
    if (!handle) throw new Error('the handle is not on screen');

    expect(handle.x + handle.width, '손잡이가 표를 덮습니다').toBeLessThanOrEqual(table.x + 1);
    expect(handle.y + handle.height).toBeLessThanOrEqual(table.y + 1);
  });

  test('selects the whole table, as one thing', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await selectTable(page);

    expect(await selectionType(page)).toBe('table');
    expect(
      await page.evaluate(() => (window as any).editor.selection?.nodeIds?.length)
    ).toBe(1);
    await expect(page.locator('.w-table[data-table-selected]')).toHaveCount(1);
  });

  test('is given up when the reader clicks into the text', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await selectTable(page);
    expect(await selectionType(page)).toBe('table');

    await page.locator('.barocss-editor-content p:not(.w-cell p)').first().click();
    await expect.poll(() => selectionType(page)).not.toBe('table');
    await expect(page.locator('[data-table-selected]')).toHaveCount(0);
  });
});

test.describe('deleting a table', () => {
  test('takes it away when the table itself is selected', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const before = await page.locator('.w-table').count();
    await selectTable(page);
    await page.keyboard.press('Delete');

    await expect(page.locator('.w-table')).toHaveCount(before - 1);
    // The selection goes with it: one naming a node the document no longer has
    // is a guard every reader of it would otherwise need.
    await expect.poll(() => selectionType(page)).not.toBe('table');
  });

  /**
   * The dangerous case, and the reason the binding is guarded by
   * `tableSelected` rather than by `inTable`: with a caret in a cell, Delete is
   * a character.
   */
  test('leaves the table alone when the caret is merely inside it', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const cell = page.locator('.w-cell').filter({ hasText: /^A1$/ });
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await expect.poll(() => selectionType(page)).toBe('range');

    const before = await page.locator('.w-table').count();
    await page.keyboard.press('Delete');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(400);

    expect(await page.locator('.w-table').count(), '셀 안에서 지웠는데 표가 사라졌습니다').toBe(before);
  });
});
