import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * What a stuck composition flag costs, once a reader has typed one syllable.
 *
 * The flag is set by an IME and cleared only by the next event that carries
 * `isComposing: false`, so between a composition and whatever comes next the
 * view believes an IME is still writing. Measured: still true a third of a
 * second after the composition ended, with nothing pending.
 *
 * Two things are switched off in that window, and both were built to fix faults
 * that had been measured:
 *
 *   - the MutationObserver's mid-burst guard, which is what stopped a render's
 *     own stale records being read back over newer text ("abcd" returning as "a")
 *   - re-asking for a render that was declined mid-flight, which is what stopped
 *     the page trailing the document
 *
 * Both are guarded by "not composing". So a reader who types Korean once has,
 * for as long as the flag stays stuck, the input path as it was before those
 * fixes. This measures whether that is theory or a bug: the same ten characters
 * as the Latin burst tests, on a throttled CPU, with one syllable typed first.
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
  await new Promise((r) => setTimeout(r, 250));
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

const caret = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const editor = (window as any).editor;
    const sid = editor.selection?.startNodeId;
    const el = document.querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`);
    return {
      model: (editor.dataStore.getNode(sid)?.text ?? '') as string,
      dom: (el?.textContent ?? '').replace(/﻿/g, '')
    };
  });

test.describe('typing Latin after a syllable', () => {
  for (const rate of [4, 8]) {
    test(`survives a burst with the CPU at a ${rate}th of its speed`, async ({ page }) => {
      await page.goto('/');
      await settled(page);
      await clickIntoParagraph(page);

      const cdp = await page.context().newCDPSession(page);
      const at = await page.evaluate(() => (window as any).editor.selection.startOffset as number);

      // One syllable, which is all it takes to set the flag.
      await compose(cdp, ['ㅎ', '한'], '한');
      await expect.poll(async () => (await caret(page)).model.slice(at, at + 1)).toBe('한');

      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      await page.keyboard.type('abcdefghij', { delay: 0 });

      // The same contract as the Latin-only burst tests: what was typed, in
      // order, in the document.
      await expect
        .poll(async () => (await caret(page)).model.slice(at, at + 11), { timeout: 15000 })
        .toBe('한abcdefghij');
    });
  }
});
