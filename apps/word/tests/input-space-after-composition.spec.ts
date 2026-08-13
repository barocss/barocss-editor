import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * A space pressed after Korean, and the door it was refused at.
 *
 * From a recording of somebody typing by hand. Six spaces in a row, each one a
 * keydown and then nothing at all — no `beforeinput`, no transaction, no
 * mutation:
 *
 *   4290ms compositionend  요.
 *   4426ms keydown ' '  keyCode 32
 *   4921ms keydown ' '
 *   5315ms keydown ' '
 *   ...
 *
 * Nothing downstream can put that right, because `beforeinput` is where every
 * character enters. A key that never fires one is gone. So it was refused at
 * the keydown gate, which turns a character away when the DOM selection is not
 * inside an inline-text run — a test that has an escape hatch for a burst of
 * Latin typing, and none for Korean, because a composed keystroke arrives as
 * keyCode 229 and never counts towards a burst.
 *
 * What this measures is the gate's own answer at the moment a space arrives
 * after a composition. If it says no while the reader is plainly sitting in a
 * paragraph they have just typed into, the gate is wrong, not the reader.
 */

const caret = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const editor = (window as any).editor;
    const sid = editor.selection?.startNodeId;
    const el = document.querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`);
    return {
      sid,
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

/** What the gate would answer, and what the DOM selection actually looks like. */
const gate = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const view = (window as any).editorView;
    const selection = window.getSelection();
    const anchor = selection?.anchorNode ?? null;
    const host =
      anchor?.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as Element | null);
    const found = host?.closest?.('[data-bc-sid]') ?? null;
    const sid = found?.getAttribute('data-bc-sid') ?? null;
    const node = sid ? (window as any).editor.dataStore.getNode(sid) : null;
    return {
      says: view.isSelectionInsideEditableText() === true,
      burst: view.inputHandler?.isTypingBurst === true,
      anchorIsText: anchor?.nodeType === Node.TEXT_NODE,
      anchorName: anchor?.nodeName ?? null,
      nearestSid: sid,
      nearestStype: node?.stype ?? node?.type ?? null,
      modelSid: (window as any).editor.selection?.startNodeId ?? null
    };
  });

test.describe('a space after a composition', () => {
  test('is not refused at the door', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);
    const at = (await caret(page)).offset;

    // A syllable, ended the way the recording ends one: the IME commits, and
    // nothing of ours follows it.
    await cdp.send('Input.imeSetComposition', { text: 'ㅇ', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, 50));
    await cdp.send('Input.imeSetComposition', { text: '요', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, 50));
    await cdp.send('Input.insertText', { text: '요' });
    await page.waitForTimeout(300);

    const answer = await gate(page);

    // Three spaces, as they were typed.
    await page.keyboard.type('   ', { delay: 120 });
    await page.waitForTimeout(500);

    const after = await caret(page);
    expect(
      after.model.slice(at, at + 4),
      `공백이 문서에 들어가지 않았습니다. 게이트의 답: ${JSON.stringify(answer)}`
    ).toBe('요   ');
    expect(after.dom).toBe(after.model);
  });

  test('the gate can see where the reader is', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);

    await cdp.send('Input.imeSetComposition', { text: 'ㅇ', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, 50));
    await cdp.send('Input.imeSetComposition', { text: '요', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, 50));
    await cdp.send('Input.insertText', { text: '요' });
    await page.waitForTimeout(300);

    // The reader is in a paragraph they have just typed into. Whatever the DOM
    // selection happens to be resting on, the answer must be yes — a no here is
    // a character refused for good.
    const answer = await gate(page);
    expect(answer.says, `게이트가 거절합니다: ${JSON.stringify(answer)}`).toBe(true);
  });
});
