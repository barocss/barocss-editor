import { test, expect } from '@playwright/test';
import { placeCaret } from './helpers';

/**
 * Typing, and the block boundaries typing runs into.
 *
 * Part of the browser suite for apps/word; the shared helpers are in helpers.ts.
 */

test.describe('Word editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.w-surface').first()).toBeVisible();
  });

  test('types into a paragraph and undoes the whole burst at once', async ({ page }) => {
    const paragraph = page.locator('.w-paragraph').first();
    const before = await paragraph.textContent();

    await placeCaret(page, '.w-paragraph');
    await page.keyboard.type('XYZ', { delay: 80 });
    await expect(paragraph).not.toHaveText(before!);

    // One undo, not three
    await page.keyboard.press('Control+z');
    await expect(paragraph).toHaveText(before!);
  });

  test('Enter adds a block', async ({ page }) => {
    const paragraphs = page.locator('.w-paragraph');
    const before = await paragraphs.count();

    await placeCaret(page, '.w-paragraph');
    await page.keyboard.press('Enter');

    await expect(paragraphs).toHaveCount(before + 1);
  });

  test('Tab moves between cells, and only inside a table', async ({ page }) => {
    await placeCaret(page, '.w-cell', 2);
    await expect
      .poll(() => page.evaluate(() => (window as any).editor.getContext('inTable')))
      .toBe(true);

    await page.keyboard.press('Tab');
    const cell = await page.evaluate(() => {
      const s = window.getSelection();
      const el = s?.anchorNode?.nodeType === 3 ? s.anchorNode.parentElement : (s?.anchorNode as Element | null);
      return el?.closest('.w-cell')?.textContent;
    });
    expect(cell).toBe('B1');

    await placeCaret(page, '.w-paragraph');
    await expect
      .poll(() => page.evaluate(() => (window as any).editor.getContext('inTable')))
      .toBe(false);
  });

  test('inserts a table row with a full set of cells', async ({ page }) => {
    await placeCaret(page, '.w-cell', 2);
    await page.evaluate(() => (window as any).editor.executeCommand('insertRowBelow', {}));

    // three more cells, matching the grid width rather than the row's child count
    await expect(page.locator('.w-cell')).toHaveCount(11);
  });
});

/**
 * Pagination is measured, not asserted from the model, so these checks read the
 * browser back: where a sheet is, and where the first block of a page actually
 * landed. A unit test cannot answer either question.
 */
/**
 * Tab stops.
 *
 * A tab is an instruction to reach the next stop, not a character of a fixed
 * width, so how far it stretches depends on where the line put it. Nothing but
 * a browser can answer that, which is why these are here rather than beside the
 * arithmetic they exercise.
 */
/**
 * Pictures, and what the text does about them.
 *
 * An inline picture is a very large character and moves with the words either
 * side of it; a floating one does not, and the lines beside it are shorter.
 * Which it is decides what every line near it does, so this is measured on the
 * page rather than argued about in a stylesheet.
 */

test.describe('Backspace at a block boundary', () => {
  test('merges a block into the one before it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const paragraphs = () => page.locator('.w-paragraph').count();
    const before = await paragraphs();

    // Split a paragraph, then undo the split with Backspace
    await placeCaret(page, '.w-paragraph', 1);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect.poll(paragraphs).toBe(before + 1);

    await page.keyboard.press('Backspace');
    await expect.poll(paragraphs).toBe(before);
  });

  test('shrinks the document, so the pages come back', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const sheets = () => page.locator('.w-sheet').count();
    const before = await sheets();

    // Enough presses to need another page, rather than a number that happened
    // to be enough once. How much room the last page has left is a property of
    // the fixture, and every edit to it changes the answer.
    await placeCaret(page, '.w-paragraph', 1);
    let pressed = 0;
    while (pressed < 80 && (await sheets()) === before) {
      await page.keyboard.press('Enter');
      pressed += 1;
    }
    await expect.poll(sheets, { timeout: 15000 }).toBeGreaterThan(before);

    for (let i = 0; i < pressed; i++) await page.keyboard.press('Backspace');
    await expect.poll(sheets, { timeout: 15000 }).toBe(before);
  });

  test('keeps the engine keys a product map does not restate', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    // Bindings are gated on editorFocus, so the caret has to be in the document
    // before asking what a key resolves to.
    await placeCaret(page, '.w-paragraph', 1);

    // Word's map says nothing about Backspace or the arrow keys; they are engine
    // defaults, and a product replacing the map must not lose them.
    const resolved = await page.evaluate(() => {
      const editor = (window as any).editor;
      return ['Backspace', 'Enter', 'Delete', 'ArrowLeft', 'ArrowRight'].map(
        (key) => editor.keybindings.resolve(key).length
      );
    });
    expect(resolved.every((count) => count > 0)).toBe(true);
  });
});
