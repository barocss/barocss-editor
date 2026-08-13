import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Shared by the browser suite for apps/word.
 *
 * The schema, kit and resolvers are covered by unit tests; what those cannot
 * cover is whether they meet correctly in a real DOM with a real caret. Every
 * assertion in that suite failed at some point during development for a reason
 * no unit test saw.
 */

/**
 * Word in a browser.
 *
 * The schema, kit and resolvers are covered by unit tests; what those cannot
 * cover is whether they meet correctly in a real DOM with a real caret. Every
 * assertion here failed at some point during development for a reason no unit
 * test saw.
 */

/**
 * Click, then wait for the editor to actually have the caret there.
 *
 * Selection reaches the model through selectionchange, which is asynchronous —
 * acting on the next line would run against an editor that has no selection yet
 * and silently do nothing.
 */
export async function placeCaret(page: Page, selector: string, index = 0) {
  await page.locator(selector).nth(index).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const sel = (window as any).editor?.selection;
        return sel?.type === 'range' ? sel.startNodeId : null;
      })
    )
    .not.toBeNull();
}

/**
 * Printing.
 *
 * The document already has pages: the paginator measured the rendered text and
 * decided where each one ends. Printing is not a second pagination but that one
 * honoured, so what these check is agreement — the paper has the pages the
 * screen shows, and nothing that is only on screen goes to paper while nothing
 * that is the document stays off it.
 */
/**
 * Wait until pagination has stopped moving.
 *
 * The layout runs, measures its own output and runs again; asking during that
 * is asking about a page count on its way somewhere else. Two readings that
 * agree is the cheapest evidence it has arrived.
 */
export async function settled(page: Page) {
  // Attached rather than visible: in print media the sheets are hidden — the
  // page itself is the paper — and they are still what there is to count.
  await page.waitForSelector('.w-sheet', { state: 'attached' });
  let previous = -1;
  await expect
    .poll(
      async () => {
        const count = await page.locator('.w-sheet').count();
        const stable = count === previous && count > 0;
        previous = count;
        return stable;
      },
      { timeout: 15000, intervals: [250] }
    )
    .toBe(true);
}

/**
 * Clicking where a user clicks.
 *
 * `locator.click()` clicks the centre of an element's *box*, which is not where
 * a reader's pointer goes and not always over the text: an equation's run is
 * seven pixels wide inside boxes that are not, and clicking its centre through
 * Playwright landed the caret in the paragraph before it while a click at the
 * same coordinates by hand landed it in the run. Every input test in this suite
 * that used the first kind was testing something a user cannot do.
 *
 * So this takes the point from the *text*: a Range over the text node, its own
 * rectangle, and a point inside it — `start`, `middle` or `end` of the line the
 * text is on.
 */
export async function clickText(
  page: Page,
  selector: string,
  options: { nth?: number; at?: 'start' | 'middle' | 'end' } = {}
): Promise<{ x: number; y: number }> {
  const { nth = 0, at = 'middle' } = options;

  const point = await page.evaluate(
    ([sel, index, where]) => {
      const el = document.querySelectorAll(sel as string)[index as number];
      if (!el) return null;

      // The first text node with a rectangle: an element may open with an empty
      // run, or with the filler that holds a caret in an empty block.
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent || node.textContent.trim().length === 0) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = [...range.getClientRects()].find((r) => r.height > 0 && r.width > 0);
        if (!rect) continue;

        const y = rect.top + rect.height / 2;
        if (where === 'start') return { x: rect.left + 1, y };
        if (where === 'end') return { x: rect.right - 1, y };
        return { x: rect.left + rect.width / 2, y };
      }
      return null;
    },
    [selector, nth, at] as const
  );

  expect(point, `no text to click in ${selector} [${nth}]`).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);

  /**
   * Wait for the model to catch up with the click, not merely to have something.
   *
   * The selection reaches the model through selectionchange, one task later. A
   * test that only waited for "a selection exists" read the *previous* one
   * whenever there already was one — which made a second click look like it had
   * landed where the first did, and turned six real assertions into six that
   * could never fail.
   *
   * The browser's own selection is the thing that moved, so the question is
   * whether the model is describing that position yet — the node *and* the
   * offset. Waiting on the node alone is no wait at all when both clicks are in
   * the same paragraph, which is exactly when the reading is wrong.
   */
  await expect
    .poll(() =>
      page.evaluate(() => {
        const dom = window.getSelection();
        const model = (window as any).editor?.selection;
        if (!dom?.anchorNode || !model) return false;
        const node = dom.anchorNode;
        const el =
          node.nodeType === 1
            ? (node as Element).closest('[data-bc-sid]')
            : node.parentElement?.closest('[data-bc-sid]');
        return (
          el?.getAttribute('data-bc-sid') === model.startNodeId &&
          dom.anchorOffset === model.startOffset
        );
      })
    )
    .toBe(true);

  return point!;
}

/** Where the caret is, in the model, and what it is in. */
export async function caret(page: Page) {
  return page.evaluate(() => {
    const selection = (window as any).editor?.selection;
    if (!selection) return null;
    const node = (window as any).editor.dataStore.getNode(selection.startNodeId);
    return {
      sid: selection.startNodeId as string,
      stype: node?.stype as string | undefined,
      text: (node?.text ?? '') as string,
      offset: selection.startOffset as number
    };
  });
}

/** Whether the caret's node is the element clicked, or something inside it. */
export async function caretIsInside(page: Page, selector: string, nth = 0) {
  const sid = (await caret(page))?.sid;
  if (!sid) return false;
  return page.evaluate(
    ([sel, index, id]) => {
      const el = document.querySelectorAll(sel as string)[index as number];
      const target = document.querySelector(`[data-bc-sid="${CSS.escape(id as string)}"]`);
      return !!el && !!target && (el === target || el.contains(target));
    },
    [selector, nth, sid] as const
  );
}
