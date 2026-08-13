import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * Typing on a machine that is busy.
 *
 * The suite's typing tests used to fail two or three at a time under a full
 * parallel run and pass alone, which is the shape of a race rather than of a
 * bug in any one of them. This reproduces it deliberately instead of waiting
 * for it: Chrome's CPU throttling slows the page by a fixed factor, and ten
 * characters are typed with no delay between them.
 *
 * What that produced before any of it was fixed:
 *
 *   ×1   abcdefghij   — as typed
 *   ×4   acdbefghij   — one character carried past the ones that overtook it
 *   ×8   acdbegf ce   — order lost and characters lost with it
 *   ×12  acdefghijb
 *
 * Every stage of a keystroke is checked, because each of them broke
 * separately: what the document holds, and what the page shows. A model that
 * is right behind a page that is a keystroke behind is not a word processor
 * anyone can use, and it was the last of the eight faults to be found.
 */
test.describe('typing on a busy machine', () => {
  for (const rate of [4, 8, 12]) {
    /**
     * Eight ways a burst of typing came apart, and the last one is why the page
     * could still trail a document that was right: work yields and resumes from
     * an idle callback, so two renders overlap on a busy machine, and the one
     * that started first woke up and painted its older tree over the newer.
     *
     * The others: the observer importing a render's own records, a keystroke
     * taking its position from a DOM that was behind, a character dropped
     * because its range resolved to a node holding no text, a render skipped
     * and never asked for again, a caret restore replaying where the caret
     * *was*, a character refused at the keydown gate, and a burst whose life
     * was tied to a render's rather than to the typing.
     */
    test(`writes what was typed with the CPU at a ${rate}th of its speed`, async ({
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

      // What the document holds...
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

      // ...and what the reader can see. These were separate faults: the last
      // one left the page a keystroke behind a document that was already right.
      await expect
        .poll(
          () =>
            page.evaluate(
              ([sid, offset, length]) => {
                const el = document.querySelector(`[data-bc-sid="${CSS.escape(sid as string)}"]`);
                return (el?.textContent ?? '').slice(
                  offset as number,
                  (offset as number) + (length as number)
                );
              },
              [before.sid, before.offset, typed.length] as const
            ),
          { timeout: 15000 }
        )
        .toBe(typed);
    });
  }
});
