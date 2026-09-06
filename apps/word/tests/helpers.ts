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
  const target = page.locator(selector).nth(index);
  await target.click();

  /**
   * Wait for the caret to be *here*, not merely for there to be a caret.
   *
   * This used to poll for `selection.type === 'range'`, which is already true
   * whenever anything has been clicked or typed before — so it returned on the
   * previous caret's position and the test typed against a selection still
   * pointing at the last paragraph. Silent, because the first character goes in
   * at the DOM caret and looks right; the render that follows restores the
   * model's caret, and every character after it lands where the *old* selection
   * was. Measured in a frame's two halves: "오" in the right one and "른쪽" in
   * the left.
   *
   * So the wait asks the question the caller is actually asking — is the model's
   * selection inside the thing I clicked — by matching the model's node against
   * the sids this element covers.
   *
   * Which is not simply its subtree. Plenty of what a test clicks is *part of a
   * text node's rendering rather than a node*: `.w-insertion` is a revision
   * mark, a span with no sid inside the inline-text it marks, so a caret in it
   * belongs to the sid *above*. So an element that names no node of its own
   * takes its nearest ancestor's — which still fails for a caret left in a
   * different paragraph, because that one is neither above nor below.
   */
  await expect
    .poll(async () =>
      target.evaluate((el) => {
        const sel = (window as any).editor?.selection;
        if (sel?.type !== 'range' || !sel.startNodeId) return false;

        const sids = new Set<string>();
        const own = el.getAttribute('data-bc-sid');
        if (own) sids.add(own);
        for (const node of el.querySelectorAll('[data-bc-sid]')) {
          sids.add(node.getAttribute('data-bc-sid')!);
        }
        // A span that is decoration rather than a node: the caret lands in
        // whatever node draws it.
        if (sids.size === 0) {
          const above = el.parentElement?.closest('[data-bc-sid]');
          if (above) sids.add(above.getAttribute('data-bc-sid')!);
        }
        return sids.has(sel.startNodeId);
      })
    )
    .toBe(true);
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

/**
 * **바꾸기 전과 후가 다른지 세운다.**
 *
 * 브라우저 검사가 헛도는 방법은 결함마다 다르지만 결과는 하나다 — *바꾸려는 값이 이미 그 값이라
 * 아무것도 안 해도 초록이 나온다.* 대화상자 둘을 만드는 동안 다섯 번 겪었다:
 *
 * | 헛돈 것 | 왜 |
 * |---|---|
 * | 샘플의 첫 문단에 테두리를 그렸다 | 이미 입고 있었다 |
 * | `border-top-style` 이 `solid` 인지 물었다 | preflight 가 `*{ border: 0 solid }` 를 깐다 |
 * | 옆면을 두께 없이 물었다 | 같은 이유, `word-rendering.spec.ts` 에 있던 것 |
 * | 첫 문단의 `margin-top` 을 물었다 | 페이지네이션이 96px 로 덮는다 |
 * | 1.5줄을 골랐다 | 줄 높이가 이미 글꼴의 1.5배였다 |
 *
 * 다섯 중 넷은 **초록으로 지나갔다.** 그래서 이것을 손으로 쓰는 대신 도구로 만든다.
 *
 * ```ts
 * await changes(page, () => marginOf(paragraph), async () => {
 *   await dialog.apply();
 * });
 * ```
 *
 * 값이 안 변하면 *무엇에서 무엇으로 안 변했는지* 를 말하며 실패한다. 검사가 무엇을 물었는지
 * 자기 입으로 말하게 하는 것이 요점이다.
 */
export async function changes<T>(
  read: () => Promise<T>,
  act: () => Promise<void>,
  what = '이 값'
): Promise<{ before: T; after: T }> {
  const before = await read();
  await act();
  const after = await read();

  expect(
    after,
    `${what} 이 바뀌지 않았습니다 — ${JSON.stringify(before)} 그대로입니다.\n` +
      `바꾸려는 값이 이미 그 값이면 이 검사는 아무것도 묻지 않습니다. 다른 값으로 물으세요.`
  ).not.toEqual(before);

  return { before, after };
}
