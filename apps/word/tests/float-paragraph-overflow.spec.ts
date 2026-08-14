import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * A paragraph the text wraps around a picture in, grown until it cannot fit.
 *
 * Known and unfixed, and here so that it is a running test rather than a note.
 *
 * A paragraph holding a floated picture is marked `keepLines` on purpose: lines
 * beside the picture are short and the ones past it are full width, so a break
 * drawn inside it moves the tail clear of the picture and the paragraph comes
 * out with a different number of lines than the one that was measured. Keeping
 * it whole avoids that.
 *
 * It cannot be kept whole once it is taller than a page. The paginator then
 * draws it anyway — "a block taller than a page overflows rather than
 * vanishing" — and the last lines land past the bottom margin, outside what a
 * reader would print. Measured below: eight text rectangles outside the
 * printable area, the furthest ~140px past it.
 *
 * Making it splittable was tried and is worse: the layout then disagrees with
 * the measurement in the way `keepLines` exists to prevent, and the overflow
 * grows. Fixing it properly means deciding what a float does when its paragraph
 * breaks — whether the picture stays with the anchor's page and the tail flows
 * full width, which is Word's answer — and that is a layout decision, not a
 * missing guard.
 */
test.fixme('every line of a wrapped paragraph stays inside the page', async ({ page }) => {
  await page.goto('/');
  await settled(page);

  // The block holding a wrapped picture, whichever it is.
  const blockSid = await page.evaluate(() => {
    const store = (window as any).editor.dataStore;
    for (const el of [...document.querySelectorAll('[data-bc-sid]')]) {
      const sid = el.getAttribute('data-bc-sid')!;
      const wraps = ((store.getNode(sid)?.content ?? []) as string[]).some((child) => {
        const wrap = store.getNode(child)?.attributes?.wrap;
        return wrap === 'square' || wrap === 'tight';
      });
      if (wraps) return sid;
    }
    return null;
  });
  expect(blockSid, 'the sample has no paragraph wrapping a picture').not.toBeNull();

  // Grow it until it spans a page break.
  await page.evaluate(async (sid: string) => {
    const store = (window as any).editor.dataStore;
    const editor = (window as any).editor;
    const firstRun = (id: string): string | null => {
      const node = store.getNode(id);
      if (!node) return null;
      if (typeof node.text === 'string') return id;
      for (const child of ((node.content ?? []) as string[])) {
        const found = firstRun(child);
        if (found) return found;
      }
      return null;
    };
    const run = firstRun(sid);
    if (!run) return;

    const spansABreak = () => {
      const el = document.querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return [...document.querySelectorAll('.w-sheet')].some((sheet) => {
        const bottom = sheet.getBoundingClientRect().bottom - 96;
        return rect.top < bottom && rect.bottom > bottom;
      });
    };

    for (let round = 0; round < 30 && !spansABreak(); round += 1) {
      store.updateNode(run, { text: `${store.getNode(run).text ?? ''} ${'padding '.repeat(40)}` });
      editor.emit('editor:content.change', { from: 'test' });
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }, blockSid!);
  await page.waitForTimeout(600);

  const strays = await page.evaluate(() => {
    const areas = [...document.querySelectorAll('.w-sheet')].map((sheet) => {
      const rect = sheet.getBoundingClientRect();
      return { top: rect.top + 96, bottom: rect.bottom - 96 };
    });
    const surface = document.querySelector('.w-surface')!;
    const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
    const outside: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest('.w-sheets')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of [...range.getClientRects()]) {
        if (rect.height <= 0) continue;
        const inside = areas.some((area) => rect.top >= area.top - 2 && rect.bottom <= area.bottom + 2);
        if (!inside) {
          outside.push(`${JSON.stringify((node.textContent ?? '').slice(0, 24))} at ${Math.round(rect.top)}..${Math.round(rect.bottom)}`);
        }
      }
    }
    return outside;
  });

  expect(strays, `인쇄 영역 밖으로 나간 줄:\n  ${strays.join('\n  ')}`).toEqual([]);
});
