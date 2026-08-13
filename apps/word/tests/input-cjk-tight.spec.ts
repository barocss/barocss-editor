import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * The gap the burst guard leaves open, measured rather than argued.
 *
 * The MutationObserver is the only writer that can see what an IME wrote, and
 * it now declines records while characters are arriving one after another —
 * unless a composition is in progress. Those two conditions do not quite tile
 * the timeline. `compositionend` clears "in progress", but a commit's DOM edits
 * are not all delivered by then, and the burst window outlives the last Latin
 * keystroke by two seconds. Anything the IME finalises inside that overhang is
 * a record the observer is entitled to drop, and a dropped record is a syllable
 * that is on the page and not in the document — the divergence this whole
 * system exists to prevent.
 *
 * Everything here is deliberately tighter than a person can type: no delay
 * between the Latin characters, and jamo arriving faster than an IME sends
 * them. If the overhang is reachable, it is reachable here.
 */

const caretText = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const editor = (window as any).editor;
    const sid = editor.selection?.startNodeId;
    const el = document.querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`);
    return {
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

const compose = async (cdp: any, steps: string[], commit: string, settle: number) => {
  for (const step of steps) {
    await cdp.send('Input.imeSetComposition', {
      text: step,
      selectionStart: step.length,
      selectionEnd: step.length
    });
    if (settle) await new Promise((r) => setTimeout(r, settle));
  }
  await cdp.send('Input.insertText', { text: commit });
};

test.describe('a composition inside the burst overhang', () => {
  test('lands when it starts with no pause after the last Latin key', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);
    const at = await page.evaluate(() => (window as any).editor.selection.startOffset as number);

    // No delay: the burst is as hot as it gets, and the composition starts
    // inside the two seconds it stays alive for.
    await page.keyboard.type('abc', { delay: 0 });
    await compose(cdp, ['ㅎ', '한'], '한', 30);

    await expect
      .poll(async () => (await caretText(page)).model.slice(at, at + 4), { timeout: 8000 })
      .toBe('abc한');
    await expect
      .poll(async () => (await caretText(page)).dom.slice(at, at + 4), { timeout: 8000 })
      .toBe('abc한');
  });

  test('lands when Latin resumes with no pause after the commit', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);
    const at = await page.evaluate(() => (window as any).editor.selection.startOffset as number);

    // Commit, then type immediately — the observer's records for the commit and
    // the command's transaction for 'x' are now contending for the same moment.
    await compose(cdp, ['ㅎ', '한'], '한', 30);
    await page.keyboard.type('xy', { delay: 0 });

    await expect
      .poll(async () => (await caretText(page)).model.slice(at, at + 3), { timeout: 8000 })
      .toBe('한xy');
    await expect
      .poll(async () => (await caretText(page)).dom.slice(at, at + 3), { timeout: 8000 })
      .toBe('한xy');
  });

  test('alternates Latin and syllables without either losing a character', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);
    const at = await page.evaluate(() => (window as any).editor.selection.startOffset as number);

    // Every boundary in both directions, all inside one burst window.
    await page.keyboard.type('a', { delay: 0 });
    await compose(cdp, ['ㄱ', '가'], '가', 30);
    await page.keyboard.type('b', { delay: 0 });
    await compose(cdp, ['ㄴ', '나'], '나', 30);
    await page.keyboard.type('c', { delay: 0 });

    await expect
      .poll(async () => (await caretText(page)).model.slice(at, at + 5), { timeout: 8000 })
      .toBe('a가b나c');
    await expect
      .poll(async () => (await caretText(page)).dom.slice(at, at + 5), { timeout: 8000 })
      .toBe('a가b나c');
  });

  test('keeps a syllable whose jamo were taken back before the commit', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);
    const at = await page.evaluate(() => (window as any).editor.selection.startOffset as number);

    // A Korean IME un-assembles as readily as it assembles: typing 갑 then
    // deleting the final consonant leaves 가, and the composing text shrinks.
    // Only the last state may reach the document.
    await compose(cdp, ['ㄱ', '가', '갑', '가'], '가', 40);

    await expect
      .poll(async () => (await caretText(page)).model.slice(at, at + 1), { timeout: 8000 })
      .toBe('가');
    const after = await caretText(page);
    expect(after.model.slice(at, at + 2)).not.toContain('갑');
    expect(after.dom).toBe(after.model);
  });

  test('holds a whole word of syllables typed as fast as CDP will send them', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);
    const at = await page.evaluate(() => (window as any).editor.selection.startOffset as number);

    const word = [
      { steps: ['ㅇ', '아'], commit: '아' },
      { steps: ['ㄴ', '녀'], commit: '녕' },
      { steps: ['ㅎ', '하'], commit: '하' },
      { steps: ['ㅅ', '세'], commit: '세' },
      { steps: ['ㅇ', '요'], commit: '요' }
    ];
    for (const syllable of word) await compose(cdp, syllable.steps, syllable.commit, 20);

    await expect
      .poll(async () => (await caretText(page)).model.slice(at, at + 5), { timeout: 10000 })
      .toBe('아녕하세요');
    await expect
      .poll(async () => (await caretText(page)).dom.slice(at, at + 5), { timeout: 10000 })
      .toBe('아녕하세요');
  });
});
