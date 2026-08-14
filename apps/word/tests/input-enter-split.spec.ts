import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * Which half of a split paragraph goes on top.
 *
 * Reported by hand, after typing a line of Korean quickly and pressing Enter:
 * a paragraph appeared *above* and the caret went into it. The recording has
 * the keystroke and what it did —
 *
 *   17701ms selection      word:16 offset 78
 *   18796ms keydown Enter  burst=true
 *   18797ms transaction    insertParagraph
 *   18855ms selection      0:248 offset 0
 *
 * — and says nothing about where the new paragraph landed, because nothing here
 * has ever asked. The suite's two Enter tests count paragraphs: one before, two
 * after, both pass whichever order they end up in. A split that put the tail on
 * top would satisfy every assertion in this project while making the document
 * unreadable.
 *
 * So: the text before the caret stays where it was, the text after it starts a
 * new paragraph *below*, and the caret goes with the tail. Nothing else is a
 * split.
 */

const paragraphs = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.w-paragraph')].map((el) => ({
      sid: el.getAttribute('data-bc-sid'),
      text: (el.textContent ?? '').replace(/﻿/g, ''),
      top: el.getBoundingClientRect().top
    }))
  );

const caret = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const selection = (window as any).editor.selection;
    return { sid: selection?.startNodeId as string, offset: selection?.startOffset as number };
  });

const clickIntoParagraph = async (page: import('@playwright/test').Page, at = 0.35) => {
  const point = await page.evaluate((fraction) => {
    const el = [...document.querySelectorAll('.w-paragraph')][1];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode()!;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = [...range.getClientRects()][0];
    return { x: rect.left + rect.width * fraction, y: rect.top + rect.height / 2 };
  }, at);
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(() => page.evaluate(() => (window as any).editor?.selection?.startNodeId ?? null))
    .not.toBeNull();
};

/**
 * The paragraph the caret is in, and the one drawn directly above it.
 *
 * The caret's own sid names an inline-text run, not the paragraph holding it,
 * so the paragraph has to be found by containment rather than by matching sids.
 */
const around = async (page: import('@playwright/test').Page) => {
  const list = await paragraphs(page);
  const sid = await page.evaluate(() => {
    const runSid = (window as any).editor.selection?.startNodeId;
    if (!runSid) return null;
    const run = document.querySelector(`[data-bc-sid="${CSS.escape(runSid)}"]`);
    return run?.closest('.w-paragraph')?.getAttribute('data-bc-sid') ?? null;
  });
  const index = list.findIndex((paragraph) => paragraph.sid === sid);
  return { list, index, mine: list[index], above: index > 0 ? list[index - 1] : null };
};

test.describe('Enter in the middle of a paragraph', () => {
  test('puts the tail below, with the caret in it', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);

    const before = await caret(page);
    const whole = (await around(page)).mine.text;
    const head = whole.slice(0, before.offset);
    const tail = whole.slice(before.offset);
    expect(head.length, 'the caret was at the very start — nothing to split').toBeGreaterThan(0);
    expect(tail.length, 'the caret was at the very end — nothing to split').toBeGreaterThan(0);

    const count = (await paragraphs(page)).length;
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await paragraphs(page)).length, { timeout: 8000 }).toBe(count + 1);

    const after = await around(page);
    expect(after.index, 'the caret is in no paragraph at all').toBeGreaterThanOrEqual(0);

    // The caret follows the tail...
    expect(after.mine.text, '커서가 뒷조각에 있지 않습니다').toBe(tail);
    // ...and the head is the paragraph immediately above it, not below.
    expect(after.above, '쪼갠 앞조각이 위에 없습니다 — 문단이 위쪽에 끼어들었습니다').not.toBeNull();
    expect(after.above!.text, '앞조각과 뒷조각의 위아래가 바뀌었습니다').toBe(head);
    expect(after.above!.top, '앞조각이 뒷조각보다 아래에 그려졌습니다').toBeLessThan(after.mine.top);
    expect((await caret(page)).offset, '커서가 뒷조각 맨 앞에 있지 않습니다').toBe(0);
  });

  test('does the same immediately after a burst of typing', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);

    // The reported case: Enter arrives while a burst is still live, which is
    // what the recording shows — burst=true on the Enter keydown.
    await page.keyboard.type('abcdef', { delay: 0 });
    await page.waitForTimeout(150);

    const before = await caret(page);
    const whole = (await around(page)).mine.text;
    const head = whole.slice(0, before.offset);
    const tail = whole.slice(before.offset);

    const count = (await paragraphs(page)).length;
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await paragraphs(page)).length, { timeout: 8000 }).toBe(count + 1);

    const after = await around(page);
    expect(after.mine.text, '커서가 뒷조각에 있지 않습니다').toBe(tail);
    expect(after.above, '쪼갠 앞조각이 위에 없습니다').not.toBeNull();
    expect(after.above!.text, '앞조각과 뒷조각의 위아래가 바뀌었습니다').toBe(head);
  });

  test('does the same immediately after a composition', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);

    await cdp.send('Input.imeSetComposition', { text: 'ㅎ', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, 50));
    await cdp.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, 50));
    await cdp.send('Input.insertText', { text: '한' });
    await page.waitForTimeout(300);

    const before = await caret(page);
    const whole = (await around(page)).mine.text;
    const head = whole.slice(0, before.offset);
    const tail = whole.slice(before.offset);

    const count = (await paragraphs(page)).length;
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await paragraphs(page)).length, { timeout: 8000 }).toBe(count + 1);

    const after = await around(page);
    expect(after.mine.text, '커서가 뒷조각에 있지 않습니다').toBe(tail);
    expect(after.above, '쪼갠 앞조각이 위에 없습니다').not.toBeNull();
    expect(after.above!.text, '앞조각과 뒷조각의 위아래가 바뀌었습니다').toBe(head);
  });
});

/**
 * The same split, once the paragraph is long enough to change the layout.
 *
 * The report came after typing a line — forty-five characters into a paragraph
 * of thirty-five — which is enough to wrap it onto another line and, near the
 * bottom of a page, enough to move a page break. The split itself is the same
 * operation either way; where its two halves are *drawn* is not, because that is
 * decided by a layout pass that runs afterwards and can put a paragraph on a
 * different page from the one it was typed on.
 */
test.describe('Enter after the paragraph has grown', () => {
  test('splits in order when the paragraph now wraps', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page, 0.9);

    // Forty-five characters, as the recording has it.
    await page.keyboard.type('0123456789012345678901234567890123456789ABCDE', { delay: 0 });
    await page.waitForTimeout(600);

    const before = await caret(page);
    const whole = (await around(page)).mine.text;
    const head = whole.slice(0, before.offset);
    const tail = whole.slice(before.offset);

    const count = (await paragraphs(page)).length;
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await paragraphs(page)).length, { timeout: 8000 }).toBe(count + 1);

    const after = await around(page);
    expect(after.index, '커서가 어느 문단에도 없습니다').toBeGreaterThanOrEqual(0);
    expect(after.mine.text, '커서가 뒷조각에 있지 않습니다').toBe(tail);
    expect(after.above, '쪼갠 앞조각이 위에 없습니다 — 문단이 위쪽에 끼어들었습니다').not.toBeNull();
    expect(after.above!.text, '앞조각과 뒷조각의 위아래가 바뀌었습니다').toBe(head);
    expect(after.above!.top, '앞조각이 뒷조각보다 아래에 그려졌습니다').toBeLessThan(after.mine.top);
  });

  test('splits in order near the end of a grown paragraph', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page, 0.95);
    // `End` moves by visual line, and a paragraph this long has more than one,
    // so where it lands is read rather than assumed.
    await page.keyboard.press('End');
    await page.waitForTimeout(200);

    await page.keyboard.type('0123456789012345678901234567890123456789ABCDE', { delay: 0 });
    await page.waitForTimeout(600);

    const before = await caret(page);
    const whole = (await around(page)).mine.text;
    const head = whole.slice(0, before.offset);
    const tail = whole.slice(before.offset);

    const count = (await paragraphs(page)).length;
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await paragraphs(page)).length, { timeout: 8000 }).toBe(count + 1);

    const after = await around(page);
    expect(after.mine.text, '커서가 뒷조각에 있지 않습니다').toBe(tail);
    expect(after.above, '쪼갠 앞조각이 위에 없습니다 — 문단이 위쪽에 끼어들었습니다').not.toBeNull();
    expect(after.above!.text, '앞조각과 뒷조각의 위아래가 바뀌었습니다').toBe(head);
    expect(after.above!.top, '앞조각이 뒷조각보다 아래에 그려졌습니다').toBeLessThan(after.mine.top);
  });
});
