import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * Composing CJK on a busy machine, and next to a burst of Latin.
 *
 * The eight faults found in typing were all found with Latin characters, which
 * take a route composition does not: the browser's edit is prevented and a
 * transaction is committed, whereas an IME writes to the DOM itself and nothing
 * can stop it. Two of the fixes help composition anyway — a render that is
 * skipped mid-flight is now asked for again, and an older render can no longer
 * paint over a newer one, and neither of those cares who wrote the text.
 *
 * Four of them, though, are guarded by "characters are being typed one after
 * another", and that guard has a two-second life. It is meant to exclude
 * composition, and the exclusion is `_isComposing`. Which raises exactly the
 * questions below, and none of them can be answered by reading:
 *
 *   - does a composition that starts *inside* that window still land?
 *   - does typing right after a commit go where the reader is looking?
 *   - does any of it hold when the machine is a fraction of its speed?
 *
 * Composition is driven through CDP rather than by pressing keys, because that
 * is the only way to make a real IME sequence happen on demand: `imeSetComposition`
 * for each intermediate state, then `insertText` for the commit — which is what
 * a Korean IME does as the jamo assemble into a syllable.
 */

/** Put the caret in a known paragraph and report what it holds. */
const caretText = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const editor = (window as any).editor;
    const sid = editor.selection?.startNodeId;
    const el = document.querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`);
    return {
      sid,
      model: (editor.dataStore.getNode(sid)?.text ?? '') as string,
      dom: (el?.textContent ?? '').replace(/﻿/g, '')
    };
  });

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

/** One syllable, the way a Korean IME assembles it. */
const composeSyllable = async (
  cdp: any,
  steps: string[],
  commit: string,
  settle: number
) => {
  for (const step of steps) {
    await cdp.send('Input.imeSetComposition', { text: step, selectionStart: step.length, selectionEnd: step.length });
    await new Promise((resolve) => setTimeout(resolve, settle));
  }
  await cdp.send('Input.insertText', { text: commit });
  await new Promise((resolve) => setTimeout(resolve, settle * 3));
};

test.describe('composing CJK', () => {
  for (const rate of [1, 4, 8]) {
    test(`assembles a syllable with the CPU at a ${rate}th of its speed`, async ({ page }) => {
      await page.goto('/');
      await settled(page);
      await clickIntoParagraph(page);

      const cdp = await page.context().newCDPSession(page);
      const before = await caretText(page);
      const at = await page.evaluate(() => (window as any).editor.selection.startOffset as number);

      if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      await composeSyllable(cdp, ['ㅎ', '하', '한'], '한', 220);

      // The syllable is in the document where the caret was...
      await expect.poll(async () => (await caretText(page)).model.slice(at, at + 1)).toBe('한');
      // ...and on the page, which is the fault that outlived the others.
      await expect.poll(async () => (await caretText(page)).dom.slice(at, at + 1)).toBe('한');

      const after = await caretText(page);
      expect(after.model).toBe(
        before.model.slice(0, at) + '한' + before.model.slice(at)
      );
    });
  }

  test('assembles several syllables in a row', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);

    const cdp = await page.context().newCDPSession(page);
    const at = await page.evaluate(() => (window as any).editor.selection.startOffset as number);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await composeSyllable(cdp, ['ㅎ', '하', '한'], '한', 200);
    await composeSyllable(cdp, ['ㄱ', '그', '글'], '글', 200);

    // Two syllables, in the order they were composed, and no intermediate jamo
    // left behind — a stray 'ㅎ' or '하' is the classic composition fault.
    await expect.poll(async () => (await caretText(page)).model.slice(at, at + 2)).toBe('한글');
    await expect.poll(async () => (await caretText(page)).dom.slice(at, at + 2)).toBe('한글');
  });
});

/**
 * The two edges where a burst of Latin meets a composition.
 *
 * A burst keeps a position of its own for two seconds so that a keystroke whose
 * DOM offset is behind can be put right. Composition writes to the DOM itself
 * and must never be corrected that way, so the burst has to get out of the way
 * on both sides of it: a composition starting inside the window, and typing
 * resuming after a commit.
 */
test.describe('a burst of Latin next to a composition', () => {
  test('lets a composition that starts moments later through', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);

    const cdp = await page.context().newCDPSession(page);
    const at = await page.evaluate(() => (window as any).editor.selection.startOffset as number);

    await page.keyboard.type('ab', { delay: 30 });
    await expect.poll(async () => (await caretText(page)).model.slice(at, at + 2)).toBe('ab');

    // Well inside the two seconds the burst stays alive for
    await composeSyllable(cdp, ['ㅎ', '한'], '한', 200);

    await expect.poll(async () => (await caretText(page)).model.slice(at, at + 3)).toBe('ab한');
    await expect.poll(async () => (await caretText(page)).dom.slice(at, at + 3)).toBe('ab한');
  });

  test('types after a commit where the reader is looking', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);

    const cdp = await page.context().newCDPSession(page);
    const at = await page.evaluate(() => (window as any).editor.selection.startOffset as number);

    await composeSyllable(cdp, ['ㅎ', '한'], '한', 200);
    await expect.poll(async () => (await caretText(page)).model.slice(at, at + 1)).toBe('한');

    await page.keyboard.type('xy', { delay: 30 });

    // After the syllable, not before it and not somewhere the burst remembered
    await expect.poll(async () => (await caretText(page)).model.slice(at, at + 3)).toBe('한xy');
    await expect.poll(async () => (await caretText(page)).dom.slice(at, at + 3)).toBe('한xy');
  });
});
