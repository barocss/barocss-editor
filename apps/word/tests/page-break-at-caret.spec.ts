import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settled } from './helpers';

/**
 * Ctrl/Cmd+Enter: a page break where the caret is, with the caret on the new page.
 *
 * The same thing Enter means plus a page — split here, and carry on at the top of
 * the next one. Two faults stood between the keystroke and that, and neither was
 * visible without measuring the page:
 *
 * - The shared kit's `insertPageBreak` put the break after the whole *block* and
 *   left the caret alone, which landed it on the break node itself: the paragraph
 *   stayed whole and the next keystroke had nowhere sensible to go. Word registers
 *   its own now, splitting at the caret.
 * - And `pageBreak` was drawn as a bare `<div>` that never asked the layout how
 *   far to be pushed. A break is *exactly* the block that must: the paginator ends
 *   the page before it and makes the break the first fragment of the next one, so
 *   the push that moves the flow onto that page is set on the break's own sid.
 *   Nothing applied it, so nothing moved — the document grew a page with no break
 *   anywhere on it.
 */
const sheetOf = (page: Page, what: 'caret' | 'break') =>
  page.evaluate((which) => {
    const editor = (window as any).editor;
    const document_ = document.querySelector('.w-document')!.getBoundingClientRect();
    const rel = (rect: DOMRect) => rect.top - document_.top;

    let element: Element | null = null;
    if (which === 'caret') {
      const sid = editor.selection?.startNodeId;
      element = sid ? document.querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`) : null;
      element = element?.closest('.w-paragraph') ?? element;
    } else {
      element = document.querySelector('.w-page-break');
    }
    if (!element) return null;

    const top = rel(element.getBoundingClientRect());
    const sheets = [...document.querySelectorAll('.w-sheet')].map((sheet) =>
      rel(sheet.getBoundingClientRect())
    );
    let index = -1;
    sheets.forEach((sheetTop, at) => {
      if (top >= sheetTop - 1) index = at;
    });
    return { top: Math.round(top), sheet: index };
  }, what);

/** Put the caret ten characters into a plain paragraph — not a list item. */
const caretInProse = async (page: Page) => {
  const paragraph = page
    .locator('.barocss-editor-content p')
    .filter({ hasText: 'takes its font from Normal' })
    .first();
  await paragraph.scrollIntoViewIfNeeded();
  await paragraph.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).editor?.selection?.type ?? null))
    .toBe('range');

  await page.keyboard.press('Home');
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
};

/** Pagination re-runs after the edit; wait for the sheet count to stop moving. */
const paginated = async (page: Page) => {
  let previous = -1;
  for (let attempt = 0; attempt < 25; attempt++) {
    const count = await page.locator('.w-sheet').count();
    if (count === previous) return;
    previous = count;
    await page.waitForTimeout(200);
  }
};

test.describe('a page break at the caret', () => {
  test('splits the paragraph and takes the caret to the new page', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await caretInProse(page);

    const before = await sheetOf(page, 'caret');
    expect(before?.sheet).toBe(0);

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await paginated(page);

    // The caret is in the text that moved, and that text is on the next sheet.
    const after = await sheetOf(page, 'caret');
    expect(after?.sheet, '캐럿이 새 페이지로 가지 않았습니다').toBe(1);

    // And the break is on that page too, above it — the paginator makes the
    // break the first thing on the new page.
    const broke = await sheetOf(page, 'break');
    expect(broke?.sheet).toBe(1);
    expect(broke!.top).toBeLessThanOrEqual(after!.top);
  });

  test('leaves the text either side of it whole', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await caretInProse(page);

    /**
     * The whole *paragraph*, not the caret's run.
     *
     * A paragraph here is several runs — this one carries marks — so reading
     * `selection.startNodeId`'s text gives whichever run the caret happens to be
     * in, which is not what the two halves add up to.
     */
    const whole = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const sid = (window as any).editor.selection.startNodeId;
      let node = store.getNode(sid);
      while (node && node.stype !== 'paragraph') node = store.getNode(node.parentId);
      const textOf = (n: any): string =>
        typeof n?.text === 'string'
          ? n.text
          : (n?.content ?? []).map((child: string) => textOf(store.getNode(child))).join('');
      return textOf(node);
    });

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await paginated(page);

    const halves = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const surface = (root.content ?? [])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'surface');
      const kids = (surface.content ?? []).map((sid: string) => store.getNode(sid));
      const at = kids.findIndex((node: any) => node?.stype === 'pageBreak');
      const textOf = (node: any): string =>
        typeof node?.text === 'string'
          ? node.text
          : (node?.content ?? []).map((sid: string) => textOf(store.getNode(sid))).join('');
      return { first: textOf(kids[at - 1]), second: textOf(kids[at + 1]) };
    });

    // Nothing lost and nothing doubled: the two halves are the paragraph.
    expect(halves.first + halves.second).toBe(whole);
    /**
     * Both halves have something in them, which is all this can say about where.
     * `Home` goes to the start of the *line* rather than of the paragraph, so ten
     * presses of ArrowRight from there is ten characters into whichever line the
     * click landed on — an offset the test cannot predict and does not need to.
     */
    expect(halves.first.length).toBeGreaterThan(0);
    expect(halves.second.length).toBeGreaterThan(0);
  });

  test('undoes in one press', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await caretInProse(page);

    const sheetsBefore = await page.locator('.w-sheet').count();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await paginated(page);
    expect(await page.locator('.w-page-break').count()).toBeGreaterThan(0);

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await paginated(page);

    await expect.poll(() => page.locator('.w-sheet').count()).toBe(sheetsBefore);
    const rejoined = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const surface = (root.content ?? [])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'surface');
      return (surface.content ?? []).some(
        (sid: string) => store.getNode(sid)?.stype === 'pageBreak'
      );
    });
    expect(rejoined, '되돌린 뒤에도 나누기가 남아 있습니다').toBe(false);
  });
});
