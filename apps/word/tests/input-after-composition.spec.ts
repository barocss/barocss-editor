import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * What still works after an IME has been used.
 *
 * The view has no composition listeners. Whether a composition is in progress is
 * inferred from `beforeinput.isComposing` and from keydown's keyCode 229, and
 * that inference decides five separate things: whether keydown is handled at all,
 * whether paste and drop are handled, whether a change asks for a render, and
 * whether the MutationObserver trusts its records mid-burst.
 *
 * Measured around one composition, the inference is wrong at both ends. It is
 * still false while the IME is writing its first jamo, and it is still true a
 * third of a second after the composition ended — nothing clears it, because
 * clearing waits for the next event that happens to carry `isComposing: false`.
 *
 * Typing survives that overhang, because a character arrives through
 * `beforeinput` and clears the flag on its way in. Keys that are handled at
 * keydown do not: they hit `if (this._isComposing) return`. Which of them a
 * reader notices is what these tests establish — Enter and Backspace after a
 * Korean syllable are not an edge case, they are how the language is typed.
 */

const compose = async (cdp: any, steps: string[], commit: string) => {
  for (const step of steps) {
    await cdp.send('Input.imeSetComposition', {
      text: step,
      selectionStart: step.length,
      selectionEnd: step.length
    });
    await new Promise((r) => setTimeout(r, 40));
  }
  await cdp.send('Input.insertText', { text: commit });
  await new Promise((r) => setTimeout(r, 200));
};

const clickIntoParagraph = async (page: import('@playwright/test').Page) => {
  const point = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.w-paragraph')][1];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode()!;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = [...range.getClientRects()][0];
    return { x: rect.left + rect.width * 0.35, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(() => page.evaluate(() => (window as any).editor?.selection?.startNodeId ?? null))
    .not.toBeNull();
};

const caretText = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const editor = (window as any).editor;
    const sid = editor.selection?.startNodeId;
    return (editor.dataStore.getNode(sid)?.text ?? '') as string;
  });

const paragraphCount = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.querySelectorAll('.w-paragraph').length);

test.describe('after a composition', () => {
  test('the flag it set is cleared', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);

    await compose(cdp, ['ㅎ', '한'], '한');
    await page.waitForTimeout(400);

    // Nothing is being composed any more, and the view must know it — five
    // behaviours are switched off while it thinks otherwise.
    const composing = await page.evaluate(() => (window as any).editorView._isComposing === true);
    expect(composing, 'the view still believes a composition is in progress').toBe(false);
  });

  test('Backspace deletes the syllable that was just committed', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);

    const at = await page.evaluate(() => (window as any).editor.selection.startOffset as number);
    const before = await caretText(page);

    await compose(cdp, ['ㅎ', '한'], '한');
    await expect.poll(async () => (await caretText(page)).slice(at, at + 1)).toBe('한');

    // The most ordinary thing a Korean typist does next.
    await page.keyboard.press('Backspace');

    await expect
      .poll(async () => await caretText(page), { timeout: 5000 })
      .toBe(before);
  });

  test('Enter splits the paragraph', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);

    await compose(cdp, ['ㅎ', '한'], '한');
    const paragraphs = await paragraphCount(page);

    await page.keyboard.press('Enter');

    await expect
      .poll(() => paragraphCount(page), { timeout: 5000 })
      .toBe(paragraphs + 1);
  });

  test('an arrow key moves the caret', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);

    await compose(cdp, ['ㅎ', '한'], '한');
    const offset = await page.evaluate(() => (window as any).editor.selection.startOffset as number);

    await page.keyboard.press('ArrowLeft');

    await expect
      .poll(() => page.evaluate(() => (window as any).editor.selection.startOffset as number), { timeout: 5000 })
      .toBe(offset - 1);
  });
});
