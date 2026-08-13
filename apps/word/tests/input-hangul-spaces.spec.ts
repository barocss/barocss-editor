import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * Spaces around Korean, which is where they were last reported wrong.
 *
 * Spaces in a line of Latin are kept and shown — that was `white-space`, and the
 * paragraph-end case that outlived it is fixed too. What is left is the shape a
 * recording caught somebody typing by hand: spaces *between composed words*.
 * They wrote "여전히 스페이스가 이상한데" into the document, which is a bug report
 * delivered by the only route available at the time.
 *
 * A space next to a composition is not the same keystroke as a space between two
 * Latin words. It is the keystroke that ends a composition — the IME commits the
 * syllable it was holding, and the space itself arrives by the other route
 * entirely, as an ordinary `insertText` the command handles. So every one of
 * them is a handover between the two writers, and a run of three is three
 * handovers with a composition on one side and nothing on the other.
 */

const caret = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const editor = (window as any).editor;
    const sid = editor.selection?.startNodeId;
    const el = document.querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`);
    return {
      offset: editor.selection?.startOffset as number,
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

/** One syllable, committed — which is what a space after it really does. */
const syllable = async (cdp: any, steps: string[], commit: string) => {
  for (const step of steps) {
    await cdp.send('Input.imeSetComposition', {
      text: step,
      selectionStart: step.length,
      selectionEnd: step.length
    });
    await new Promise((resolve) => setTimeout(resolve, 45));
  }
  await cdp.send('Input.insertText', { text: commit });
  await new Promise((resolve) => setTimeout(resolve, 45));
};

test.describe('spaces around a composition', () => {
  test('one space between two composed words', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);
    const at = (await caret(page)).offset;

    await syllable(cdp, ['ㄱ', '가'], '가');
    await page.keyboard.press('Space');
    await syllable(cdp, ['ㄴ', '나'], '나');
    await page.waitForTimeout(400);

    await expect.poll(async () => (await caret(page)).model.slice(at, at + 3), { timeout: 8000 }).toBe('가 나');
    const after = await caret(page);
    expect(after.dom, '화면과 문서가 다릅니다').toBe(after.model);
  });

  test('three spaces between two composed words', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);
    const at = (await caret(page)).offset;

    await syllable(cdp, ['ㄱ', '가'], '가');
    await page.keyboard.type('   ', { delay: 60 });
    await syllable(cdp, ['ㄴ', '나'], '나');
    await page.waitForTimeout(400);

    await expect
      .poll(async () => (await caret(page)).model.slice(at, at + 5), { timeout: 8000 })
      .toBe('가   나');
    const after = await caret(page);
    expect(after.dom, '화면과 문서가 다릅니다').toBe(after.model);
  });

  test('a space typed while a syllable is still being composed', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);
    const at = (await caret(page)).offset;

    // No commit of our own: the space is the thing that ends the composition,
    // which is how a space is actually typed in Korean.
    await cdp.send('Input.imeSetComposition', { text: 'ㄱ', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, 45));
    await cdp.send('Input.imeSetComposition', { text: '가', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, 45));
    await cdp.send('Input.insertText', { text: '가' });
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);

    await expect.poll(async () => (await caret(page)).model.slice(at, at + 2), { timeout: 8000 }).toBe('가 ');
    const after = await caret(page);
    expect(after.dom).toBe(after.model);
  });

  test('a sentence of composed words keeps every space', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);
    const at = (await caret(page)).offset;

    // 조합 중에 — the words that were being typed when the spaces were reported
    // wrong, with the boundaries and the handovers they really have.
    await syllable(cdp, ['ㅈ', '조'], '조');
    await syllable(cdp, ['ㅎ', '하', '합'], '합');
    await page.keyboard.press('Space');
    await syllable(cdp, ['ㅈ', '주', '중'], '중');
    await syllable(cdp, ['ㅇ', '에'], '에');
    await page.waitForTimeout(400);

    await expect
      .poll(async () => (await caret(page)).model.slice(at, at + 5), { timeout: 8000 })
      .toBe('조합 중에');
    const after = await caret(page);
    expect(after.dom, '화면과 문서가 다릅니다').toBe(after.model);
  });

  test('the spaces a reader typed are the width the reader sees', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);
    const at = (await caret(page)).offset;

    await syllable(cdp, ['ㄱ', '가'], '가');
    await page.keyboard.type('   ', { delay: 60 });
    await syllable(cdp, ['ㄴ', '나'], '나');
    await expect
      .poll(async () => (await caret(page)).model.slice(at, at + 5), { timeout: 8000 })
      .toBe('가   나');

    // Read from the layout, not the markup: the DOM keeps the spaces either
    // way, and the question is whether they take up room on the page.
    const widths = await page.evaluate(
      ([sid, from]) => {
        const el = document.querySelector(`[data-bc-sid="${CSS.escape(sid as string)}"]`)!;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Node | null = null;
        let seen = 0;
        while ((node = walker.nextNode())) {
          const length = (node.textContent ?? '').length;
          if (seen + length > (from as number)) break;
          seen += length;
        }
        if (!node) return null;
        const start = (from as number) - seen;
        const measure = (a: number, b: number) => {
          const range = document.createRange();
          range.setStart(node!, start + a);
          range.setEnd(node!, start + b);
          return range.getBoundingClientRect().width;
        };
        // 가 _ _ _ 나 : the gap is characters 1..4
        return { three: measure(1, 4), one: measure(1, 2) };
      },
      [(await caret(page)).offset >= 0 ? await page.evaluate(() => (window as any).editor.selection.startNodeId) : '', at] as const
    );

    expect(widths, 'could not measure the text').not.toBeNull();
    expect(
      widths!.three,
      `세 칸이 한 칸보다 넓지 않습니다: ${JSON.stringify(widths)}`
    ).toBeGreaterThan(widths!.one * 2);
  });
});
