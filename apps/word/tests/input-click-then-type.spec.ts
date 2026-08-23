import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * Typing in the same tick as the click that moved the caret.
 *
 * `selectionchange` is asynchronous, so for a moment after a click the DOM knows
 * where the caret is and the model does not. Everything about a keystroke that
 * comes from the DOM is right in that window — `getTargetRanges()` describes the
 * page as it stands — and everything that comes from `editor.selection` is one
 * position stale. The render after the edit restores the caret from the model,
 * which drags the reader back to where they were *before* they clicked, and
 * every character after the first goes there.
 *
 * Found in a frame, where the two halves sit side by side and the wrong one is
 * impossible to miss: "오" in the right half and "른쪽" in the left. It was never
 * about frames — the same window is open in any two paragraphs, and the reason
 * it survived this long is that a person cannot normally type inside it. A
 * paste, an IME commit, or one slow frame can.
 *
 * So these deliberately give the editor no time at all: click, then type, with
 * nothing between them. **No `placeCaret` here** — that helper waits for the
 * model to catch up, which is exactly the wait this is about.
 */
test.describe('a keystroke in the same tick as the click', () => {
  /**
   * ## What reproduces it, measured
   *
   * Two ordinary paragraphs do **not**, even with an edit immediately before the
   * click — tried, and green with the fix reverted. Two halves of a frame do,
   * every time. The difference is how much the render replaces: editing one
   * child of a frame redraws the frame's subtree, so the text node the click is
   * about to land in is a *new* node, and the selection the browser hands back
   * has to be re-derived. An edit inside a body paragraph patches that paragraph
   * and leaves its siblings' nodes alone.
   *
   * So the frame is the case here. Not because the bug is about frames — it is
   * about a model selection the click has not reached yet — but because a test
   * that cannot fail is not evidence, and this is the arrangement that fails.
   */
  test('stays in the half of a frame that was clicked', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await page.locator('.barocss-editor-content p').first().click();
    await page.getByRole('button', { name: 'Side by side' }).click();
    await expect(page.locator('.w-frame > p')).toHaveCount(2);

    const halves = page.locator('.w-frame > p');
    await halves.nth(0).click();
    await page.keyboard.type('왼쪽');
    await expect(halves.nth(0)).toContainText('왼쪽');

    await halves.nth(1).click();
    await page.keyboard.type('오른쪽');

    // Every character in the half it was typed in. The failure put the first
    // one here and the rest back in the other half.
    await expect(halves.nth(1)).toHaveText('오른쪽');
    await expect(halves.nth(0)).toHaveText('왼쪽');
  });

  /**
   * And the model agrees afterwards, not just the page.
   *
   * The two can disagree in exactly this window — the character is drawn where
   * it was typed while the document records it somewhere else — and a divergence
   * that only shows up on the next save is the worst kind.
   */
  test('leaves the model saying what the page shows', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await page.locator('.barocss-editor-content p').first().click();
    await page.getByRole('button', { name: 'Side by side' }).click();
    await expect(page.locator('.w-frame > p')).toHaveCount(2);

    const halves = page.locator('.w-frame > p');
    await halves.nth(0).click();
    await page.keyboard.type('AA');
    await expect(halves.nth(0)).toContainText('AA');

    const target = halves.nth(1);
    await target.click();
    await page.keyboard.type('MNO');
    await expect(target).toContainText('MNO');

    const agree = await target.evaluate((el) => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const textOf = (sid: string): string => {
        const node = store.getNode(sid);
        if (typeof node?.text === 'string') return node.text;
        return (node?.content ?? []).map(textOf).join('');
      };
      const sid = el.getAttribute('data-bc-sid');
      return sid ? textOf(sid) === el.textContent?.replace(/﻿/g, '') : false;
    });
    expect(agree, '모델과 화면이 다릅니다').toBe(true);
  });
});
