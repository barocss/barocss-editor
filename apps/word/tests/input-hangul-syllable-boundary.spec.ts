import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * The syllable boundary, taken from a recording of somebody typing 안녕하세요.
 *
 * Composition had been driven here one syllable at a time, each one assembled
 * and committed before the next began. A Korean keyboard does not work like
 * that. The consonant that finishes 안 is the same keystroke that begins 녕, so
 * the browser ends one composition and starts the next *in the same
 * millisecond*, inside one keydown:
 *
 *   3119ms compositionend   안
 *   3119ms compositionstart
 *   3119ms compositionupdate ㄴ
 *
 * Nothing in the suite produced that, and a fix that treated an ending as
 * "composing is over" therefore passed everything while breaking every real
 * word. The flag it cleared belonged to the composition that had already
 * started; two renders then ran underneath it, which is what the view forbids
 * for exactly this reason — a render under an open composition makes the IME
 * commit the syllable it is still holding and strands the jamo. 안녕하세요 came
 * back as 안ㄴ녕ㅎ하세세요.
 *
 * What this file can and cannot do. Composition is driven here over CDP, one
 * message per event, and a task always runs between two messages — so an end
 * and a start never land in the same one, which is precisely the gap a real
 * keystroke does not leave. The ordering itself is therefore pinned in
 * `packages/editor-view-dom/test/core/composition-boundary.test.ts`, where it
 * can be stated exactly. What is left here is still worth running: the whole
 * word, through the real input path, ending as the word and not as its pieces.
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

/** Count renders that ran while a composition was open, from inside the page. */
const WATCH_RENDERS = () => {
  const view = (window as any).editorView;
  const state = { duringComposition: 0, boundaries: 0 };
  (window as any).__watch = state;
  const el: HTMLElement =
    view.contentEditableElement ?? document.querySelector('.barocss-editor-content')!;
  let open = 0;
  // A boundary is an end and a start in the same task — one keystroke finishing
  // a syllable and opening the next. They do not overlap, so counting depth
  // would never see one.
  let justEnded = false;
  el.addEventListener('compositionstart', () => {
    open += 1;
    if (justEnded) state.boundaries += 1;
  });
  el.addEventListener('compositionend', () => {
    open -= 1;
    justEnded = true;
    Promise.resolve().then(() => {
      justEnded = false;
    });
  });
  const render = view.render.bind(view);
  view.render = (...args: unknown[]) => {
    if (open > 0) state.duringComposition += 1;
    return render(...args);
  };
};

/**
 * A syllable that ends and hands its last consonant to the next one, which is
 * what one keystroke does in the middle of a Korean word.
 */
const boundary = async (cdp: any, commit: string, next: string, settle: number) => {
  await cdp.send('Input.insertText', { text: commit });
  await cdp.send('Input.imeSetComposition', {
    text: next,
    selectionStart: next.length,
    selectionEnd: next.length
  });
  await new Promise((resolve) => setTimeout(resolve, settle));
};

test.describe('typing across a syllable boundary', () => {
  test('writes 안녕하세요 with no jamo left at any boundary', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    await page.evaluate(WATCH_RENDERS);

    const cdp = await page.context().newCDPSession(page);
    const at = (await caret(page)).offset;
    const settle = 50;

    // 안녕하세요, as the recording has it: assemble, then hand the finishing
    // consonant straight to the next syllable without a pause.
    await cdp.send('Input.imeSetComposition', { text: 'ㅇ', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, settle));
    await cdp.send('Input.imeSetComposition', { text: '아', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, settle));
    await cdp.send('Input.imeSetComposition', { text: '안', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, settle));

    await boundary(cdp, '안', 'ㄴ', settle);
    await cdp.send('Input.imeSetComposition', { text: '녀', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, settle));
    await cdp.send('Input.imeSetComposition', { text: '녕', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, settle));

    await boundary(cdp, '녕', 'ㅎ', settle);
    await cdp.send('Input.imeSetComposition', { text: '하', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, settle));

    await boundary(cdp, '하', 'ㅅ', settle);
    await cdp.send('Input.imeSetComposition', { text: '세', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, settle));

    await boundary(cdp, '세', 'ㅇ', settle);
    await cdp.send('Input.imeSetComposition', { text: '요', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, settle));
    await cdp.send('Input.insertText', { text: '요' });
    await new Promise((r) => setTimeout(r, 500));

    const after = await caret(page);
    const written = after.model.slice(at, at + 5);
    expect(written, `조각난 자모가 남았습니다: ${JSON.stringify(after.model.slice(at, at + 12))}`).toBe('안녕하세요');
    expect(after.dom, '화면과 문서가 다릅니다').toBe(after.model);

    // The cause, asserted directly: a render under an open composition is what
    // strands a jamo, so there must not be one.
    const watch = await page.evaluate(() => (window as any).__watch);
    expect(watch.duringComposition, '조합이 열려 있는 동안 렌더가 일어났습니다').toBe(0);
  });

  test('keeps the composition flag set across a boundary', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);

    const cdp = await page.context().newCDPSession(page);

    await page.evaluate(() => {
      const view = (window as any).editorView;
      const seen: boolean[] = [];
      (window as any).__flagAtUpdate = seen;
      const el: HTMLElement =
        view.contentEditableElement ?? document.querySelector('.barocss-editor-content')!;
      // Read the flag a task later, which is when the ending composition's own
      // deferred clear would have run.
      el.addEventListener('compositionupdate', () => {
        setTimeout(() => seen.push(view._isComposing === true), 0);
      });
    });

    await cdp.send('Input.imeSetComposition', { text: 'ㅇ', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, 60));
    await cdp.send('Input.imeSetComposition', { text: '안', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, 60));
    await boundary(cdp, '안', 'ㄴ', 60);
    await cdp.send('Input.imeSetComposition', { text: '녕', selectionStart: 1, selectionEnd: 1 });
    await new Promise((r) => setTimeout(r, 200));

    const flags = await page.evaluate(() => (window as any).__flagAtUpdate as boolean[]);
    expect(flags.length, 'no composition updates were seen').toBeGreaterThan(2);
    expect(
      flags.every(Boolean),
      `조합이 열려 있는데 조합 상태가 꺼졌습니다: ${JSON.stringify(flags)}`
    ).toBe(true);

    // And once it really is over, it clears.
    await cdp.send('Input.insertText', { text: '녕' });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as any).editorView._isComposing === true)).toBe(false);
  });
});
