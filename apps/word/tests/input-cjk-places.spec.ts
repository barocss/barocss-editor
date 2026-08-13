import { test, expect } from '@playwright/test';
import { settled, clickText } from './helpers';

/**
 * The rest of what an IME does, in the places a document has.
 *
 * What had been measured until now was one shape of composition: two jamo
 * assembling into a Hangul syllable, in the middle of an ordinary paragraph,
 * committed normally. That is the easy case, and calling it "IME support" would
 * be claiming the other cases work because they were never run.
 *
 * These are the other cases, each of which reaches a different part of the
 * input path:
 *
 *   - a key the IME swallows without ever starting a composition, which sets
 *     the inferred flag by the keyCode 229 route and leaves nothing to clear it
 *   - a composition abandoned rather than committed
 *   - a composition into an empty paragraph, which is not empty in the DOM: it
 *     holds a zero-width filler that all offset arithmetic excludes
 *   - a composition that replaces a selection instead of extending text
 *   - a composing string many characters long, replaced wholesale when a
 *     candidate is chosen — how Japanese and Chinese are typed, and nothing like
 *     the one-syllable Hangul case
 *   - a composition inside an equation, where input was reported broken by hand
 *     before any of this was measured
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

const composing = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).editorView._isComposing === true);

const compose = async (cdp: any, steps: string[], commit: string | null, settle = 40) => {
  for (const step of steps) {
    await cdp.send('Input.imeSetComposition', {
      text: step,
      selectionStart: step.length,
      selectionEnd: step.length
    });
    await new Promise((r) => setTimeout(r, settle));
  }
  if (commit !== null) await cdp.send('Input.insertText', { text: commit });
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

test.describe('an IME that never composes', () => {
  test('does not leave the view believing it is composing', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);

    // The key an IME has taken for itself. Chrome reports keyCode 229 and the
    // view takes that as a composition starting — but an IME may swallow the key
    // and produce nothing at all, and then there is no compositionend to undo it.
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      windowsVirtualKeyCode: 229,
      nativeVirtualKeyCode: 229,
      key: 'Process'
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      windowsVirtualKeyCode: 229,
      nativeVirtualKeyCode: 229,
      key: 'Process'
    });
    await page.waitForTimeout(600);

    expect(await composing(page), 'flag set by keyCode 229 with no composition to clear it').toBe(false);
  });
});

test.describe('a composition that is abandoned', () => {
  test('leaves nothing of itself behind', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);

    const before = (await caret(page)).model;

    // Build a syllable, then take it back — an empty composing string is how
    // Chrome is told the composition was cancelled.
    await compose(cdp, ['ㅎ', '하', '한'], null);
    await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
    await page.waitForTimeout(500);

    const after = await caret(page);
    expect(after.model, 'an abandoned composition was written to the document').toBe(before);
    expect(after.dom).toBe(after.model);
    expect(await composing(page), 'still composing after the composition was abandoned').toBe(false);
  });
});

test.describe('a composition in an empty paragraph', () => {
  test('replaces the filler rather than joining it', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);

    // Make an empty paragraph and stay in it. Its DOM is not empty — it carries
    // a zero-width filler so the caret has somewhere to sit. The caret is put at
    // the end of the text by clicking there: `End` moves by visual line, which
    // in a wrapped paragraph is not the end of the paragraph.
    await clickText(page, '.w-paragraph', { nth: 1, at: 'end' });
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await caret(page)).model, { timeout: 8000 }).toBe('');

    await compose(cdp, ['ㅎ', '한'], '한');

    const after = await caret(page);
    expect(after.model, 'the syllable did not reach the empty paragraph').toBe('한');
    // The filler is stripped from `dom` above, so this also says no second
    // filler survived beside the text.
    expect(after.dom).toBe('한');
  });
});

test.describe('a composition over a selection', () => {
  test('replaces the selected text', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);

    const before = await caret(page);
    // Three characters selected, which the composition must consume.
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
    const selected = before.model.slice(before.offset, before.offset + 3);
    expect(selected.length, 'nothing was selected to replace').toBe(3);

    await compose(cdp, ['ㅎ', '한'], '한');

    const after = await caret(page);
    expect(after.model, 'the composition did not replace the selection').toBe(
      before.model.slice(0, before.offset) + '한' + before.model.slice(before.offset + 3)
    );
    expect(after.dom).toBe(after.model);
  });
});

test.describe('a long composing string with candidates', () => {
  test('keeps only the chosen candidate', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);

    const at = (await caret(page)).offset;

    // How Japanese is typed: romaji becomes kana as a run, the whole run is
    // replaced when a candidate is picked, and only then committed.
    await compose(cdp, ['に', 'にほ', 'にほん', 'にほんご', '日本語'], '日本語', 60);

    await expect
      .poll(async () => (await caret(page)).model.slice(at, at + 3), { timeout: 8000 })
      .toBe('日本語');
    const after = await caret(page);
    expect(after.dom, 'the page and the document disagree after a candidate').toBe(after.model);
    // The kana the candidate replaced must not have survived alongside it.
    expect(after.model.slice(at, at + 8)).not.toContain('にほん');
  });
});

test.describe('a composition in an equation', () => {
  test('lands in the run the caret is in', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await page.locator('.w-math .w-text').first().scrollIntoViewIfNeeded();
    await clickText(page, '.w-math .w-text', { nth: 0, at: 'middle' });
    const cdp = await page.context().newCDPSession(page);

    const before = await caret(page);
    const at = before.offset;

    await compose(cdp, ['ㅎ', '한'], '한');

    await expect
      .poll(async () => (await caret(page)).model.slice(at, at + 1), { timeout: 8000 })
      .toBe('한');
    const after = await caret(page);
    expect(after.sid, 'the syllable went into a different node').toBe(before.sid);
    expect(after.dom).toBe(after.model);
  });
});
