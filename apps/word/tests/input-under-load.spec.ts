import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * Typing on a machine that is busy.
 *
 * The suite's typing tests fail two or three at a time under a full parallel
 * run and pass alone, which is the shape of a race rather than of a bug in any
 * one of them. This reproduces it deliberately instead of waiting for it:
 * Chrome's CPU throttling slows the page down by a fixed factor, and the same
 * ten characters are typed with no delay between them.
 *
 * What was measured while writing this, at the throttling rates below:
 *
 *   ×1   abcdefghij   — as typed
 *   ×4   acdbefghij   — one character carried past the ones that overtook it
 *   ×8   acdbegf ce   — order lost and characters lost with it
 *   ×12  acdefghijb
 *
 * And the cause, as far as it has been followed: typing is applied model-first
 * — the browser's own edit is prevented, a transaction is committed, the render
 * rewrites the text node and the caret is restored two frames later. The
 * position each keystroke uses comes from `getTargetRanges`, which describes
 * the DOM *now*; under load the DOM is still carrying the previous character,
 * so the offsets reported for ten keystrokes went 23, 24, 24, 25, 27 while the
 * text grew by one each time. Every keystroke was landing in a document that
 * had already moved on.
 *
 * Two attempts are recorded in the history and neither fixed it: serialising
 * the inserts behind one another, and overriding the DOM's offset with a caret
 * advanced as each keystroke was accepted. Both are the right shape and neither
 * was enough, which says another writer is involved — the MutationObserver path
 * that owns composition also imports changes, and the caret restore after each
 * render moves the DOM selection under the next keystroke.
 *
 * Marked `fixme` rather than deleted: it states the contract a word processor
 * cannot do without, and it is the thing to run when the input path is next
 * taken apart.
 */
test.describe('typing on a busy machine', () => {
  for (const rate of [4, 8]) {
    test.fixme(`writes what was typed with the CPU at a ${rate}th of its speed`, async ({
      page
    }) => {
      await page.goto('/');
      await settled(page);

      const client = await page.context().newCDPSession(page);
      await client.send('Emulation.setCPUThrottlingRate', { rate });

      // A point over the text, which is where a reader clicks
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

      const before = await page.evaluate(() => {
        const selection = (window as any).editor.selection;
        return { sid: selection.startNodeId as string, offset: selection.startOffset as number };
      });

      const typed = 'abcdefghij';
      await page.keyboard.type(typed, { delay: 0 });

      await expect
        .poll(
          () =>
            page.evaluate(
              ([sid, offset, length]) => {
                const node = (window as any).editor.dataStore.getNode(sid as string);
                return (node?.text ?? '').slice(offset as number, (offset as number) + (length as number));
              },
              [before.sid, before.offset, typed.length] as const
            ),
          { timeout: 15000 }
        )
        .toBe(typed);
    });
  }
});
