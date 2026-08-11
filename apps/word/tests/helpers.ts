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
