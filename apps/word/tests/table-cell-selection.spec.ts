import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settled } from './helpers';

/**
 * Selecting a block of cells, which the engine has had a type for all along.
 *
 * `SelectionType` has been `'range' | 'node' | 'cell' | 'table'` since selections
 * were written. The validator accepted a `cell` selection, `setNode` passed one
 * through, `mergeTableCells` was written to merge the rectangle between two cells
 * — and nothing in either product had ever produced one. So `mergeCells` was
 * called with the caret's single cell under the key `cellId`, which the operation
 * does not read, and it failed on every press for as long as it has existed.
 *
 * Nothing here can be checked without a pointer, which is why it is all in this
 * file: which cells a drag covers is arithmetic and tested in
 * `office-word/test/table-selection.test.ts` in milliseconds; whether a drag
 * *produces* that answer, and whether it survives the browser, is a question
 * only a browser can answer. Each of these failed on the way:
 *
 * - The block was computed correctly and the model was set correctly, and a
 *   `selectionchange` after the button came up replaced it with a caret.
 * - The two selected cells were marked and looked identical on screen, because a
 *   cell's shading is an inline `background-color` and inline beats a stylesheet.
 */
/**
 * Drag from the cell that says one thing to the cell that says another.
 *
 * By text and not by index, which is the second version of this helper. The
 * first took `nth(2)` to `nth(5)` and asserted "two cells" — and then adding four
 * buttons to the ribbon made it three, because a taller ribbon moves the table
 * down the page and the drag's straight line between two centres crossed a
 * different set of boxes. A test whose subject moves when a toolbar grows is a
 * test about the toolbar.
 *
 * `A1` and `A2` say what the drag means: down one column of the body.
 */
const cellReading = (page: Page, text: string) =>
  page.locator('.w-cell').filter({ hasText: new RegExp(`^${text}$`) });

/**
 * Where a cell is, once it has stopped moving.
 *
 * Two readings that agree. `settled()` waits for the page *count* to stop
 * changing, and the table is still being placed after that — measured: a drag
 * aimed at A1 and A2 pressed the mouse where A1 had been a moment earlier and
 * selected the header row instead, so the test failed reporting three cells when
 * the gesture it performed really had covered three.
 */
const stableBox = async (page: Page, text: string) => {
  const target = cellReading(page, text);
  await target.scrollIntoViewIfNeeded();

  let previous = '';
  for (let attempt = 0; attempt < 20; attempt++) {
    const box = await target.boundingBox();
    const key = box ? `${Math.round(box.x)},${Math.round(box.y)}` : '';
    if (box && key === previous) return box;
    previous = key;
    await page.waitForTimeout(100);
  }
  throw new Error(`the cell reading ${text} never stopped moving`);
};

const dragBetweenCells = async (page: Page, from: string, to: string) => {
  const a = await stableBox(page, from);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();

  // Read the far cell after the button is down: the press itself can move the
  // page, and aiming at where a cell used to be is how this went wrong before.
  const b = await stableBox(page, to);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
};

/** What the selected cells say, so a test can name them rather than count them. */
const selectedText = (page: Page) =>
  page.evaluate(() => {
    const store = (window as any).editor.dataStore;
    const textOf = (sid: string): string => {
      const node = store.getNode(sid);
      if (typeof node?.text === 'string') return node.text;
      return (node?.content ?? []).map(textOf).join('');
    };
    return ((window as any).editor.selection?.nodeIds ?? []).map(textOf);
  });

const selection = (page: Page) =>
  page.evaluate(() => {
    const sel = (window as any).editor?.selection;
    return { type: sel?.type ?? null, count: sel?.nodeIds?.length ?? 0 };
  });

test.describe('a block of table cells', () => {
  test('is selected by dragging across them', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await dragBetweenCells(page, 'A1', 'A2');

    // Down one column of the body, and the model says which kind of selection
    // this is rather than describing it as a run of text.
    expect(await selection(page)).toEqual({ type: 'cell', count: 2 });
    expect(await selectedText(page)).toEqual(['A1', 'A2']);
  });

  /**
   * The one that took the longest. `selectionchange` fires after the button
   * comes up, the browser has placed a caret in one of the cells, and the
   * handler used to convert that caret into a range over the top of the block.
   * The view now holds any selection of whole things against a stray caret —
   * the guard a node selection already had, asked as a question rather than
   * spelled `=== 'node'`.
   */
  test('survives the caret the browser places when the button comes up', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await dragBetweenCells(page, 'A1', 'A2');
    await page.waitForTimeout(400);

    expect((await selection(page)).type, '커서가 셀 선택을 덮었습니다').toBe('cell');
  });

  test('is visible, over whatever the cells are shaded with', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await dragBetweenCells(page, 'A1', 'A2');

    const marked = page.locator('.w-cell[data-cell-selected]');
    await expect(marked).toHaveCount(2);

    // Painted with a property no renderer writes inline, because the cell's own
    // shading is inline and would win.
    const shadow = await marked.first().evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow, '선택된 셀이 칠해지지 않았습니다').not.toBe('none');
  });

  test('is given up when the reader clicks somewhere else', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await dragBetweenCells(page, 'A1', 'A2');
    expect((await selection(page)).type).toBe('cell');

    await page.locator('.barocss-editor-content p:not(.w-cell p)').first().click();
    await page.waitForTimeout(300);

    expect((await selection(page)).type, '다른 곳을 눌렀는데 셀 선택이 남아 있습니다').not.toBe('cell');
    await expect(page.locator('[data-cell-selected]')).toHaveCount(0);
  });

  /**
   * The command that has never worked. It is the reason a cell selection had to
   * exist: merging is the one table operation that cannot be expressed by "the
   * cell the caret is in", because it needs two.
   */
  test('can be merged, which needed two cells and never had them', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const before = await page.locator('.w-cell').count();
    await dragBetweenCells(page, 'A1', 'B1');
    expect(await selectedText(page)).toEqual(['A1', 'B1']);

    const merge = page.getByRole('button', { name: 'Merge cells', exact: true });
    await expect(merge).toBeEnabled();
    await merge.click();

    // Two cells became one: the count drops, and the survivor covers two columns.
    await expect(page.locator('.w-cell')).toHaveCount(before - 1);
    const spans = await page
      .locator('.w-cell')
      .evaluateAll((els) => els.map((el) => el.getAttribute('colspan')));
    expect(spans, '병합된 셀이 두 열을 덮지 않습니다').toContain('2');
  });

  /**
   * A press on the toolbar used to turn every table button off as soon as a
   * block was selected, because "here" was defined as a caret and nothing else.
   */
  test('keeps the table toolbar available', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await dragBetweenCells(page, 'A1', 'A2');

    for (const label of ['Insert row above', 'Delete row', 'Merge cells']) {
      await expect(
        page.getByRole('button', { name: label, exact: true }),
        `${label}이 꺼져 있습니다`
      ).toBeEnabled();
    }
  });
});

/**
 * Shading moved to `color-palette.spec.ts`.
 *
 * It was two tests here, pressing three fixed buttons — `Shade light`, `Shade
 * grey`, `No shading` — which is how the control arrived. It is a palette now,
 * shared with text colour, and the tests went with the control rather than
 * staying with the selection that made it possible.
 *
 * The block-selection half is what this file is about, and it stays: what the
 * shading tests over there rely on is that dragging across cells selects them,
 * which is proved above.
 */
