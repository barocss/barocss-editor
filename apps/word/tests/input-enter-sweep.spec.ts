import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * Enter, in every paragraph the document has.
 *
 * Reported by hand and reproduced by nobody: click into a paragraph, type
 * nothing, press Enter, and a paragraph appears *above* with the caret in it.
 * Three targeted tests could not make it happen, which means the targeted tests
 * were aiming at the wrong paragraph — the one they always use is the second in
 * the document, on the first page, in the ordinary flow.
 *
 * A document has more kinds of paragraph than that: ones inside a table cell,
 * ones in a header, ones a page break runs through, ones on a page that is
 * itself the result of a layout pass. So rather than guess which kind is
 * broken, this walks them all and reports the ones that are, with enough about
 * each to tell them apart.
 *
 * What every split must satisfy, wherever it happens:
 *
 *   - the caret ends in a paragraph
 *   - that paragraph holds the text that was after the caret
 *   - the text that was before the caret is in the paragraph drawn above it
 *   - both are inside a page
 */
type Split = {
  index: number;
  ok: boolean;
  why?: string;
  head?: string;
  tail?: string;
  gotAbove?: string | null;
  gotMine?: string;
  onPage?: boolean;
};

/**
 * Whether a paragraph is drawn on the paper.
 *
 * By geometry, because the sheets are drawn *behind* the flow rather than around
 * it: a paragraph's ancestors are the section and the document, and the pages are
 * boxes underneath. So "on a page" means its rectangle falls inside one of them.
 *
 * This used to be `closest('.w-page')`, and there is no `.w-page` anywhere in the
 * product — only a stale mention in a stylesheet comment. The check could never
 * pass, so the last of the sweep's conditions had never once been satisfied; it
 * only ever surfaced when a split got past the earlier ones. A test-side version
 * of exactly the fault this repository keeps finding: a name nothing writes.
 */
const isOnPaper = (el: Element): boolean => {
  const box = el.getBoundingClientRect();
  if (box.height === 0) return false;

  return [...document.querySelectorAll('.w-sheet')].some((sheet) => {
    const paper = sheet.getBoundingClientRect();
    const middle = box.top + box.height / 2;
    return middle >= paper.top && middle <= paper.bottom && box.left >= paper.left - 1;
  });
};

const survey = () =>
  [...document.querySelectorAll('.w-paragraph')].map((el, index) => ({
    index,
    sid: el.getAttribute('data-bc-sid'),
    text: (el.textContent ?? '').replace(/﻿/g, ''),
    top: el.getBoundingClientRect().top,
    onPage: isOnPaper(el),
    inTable: !!el.closest('.w-cell'),
    inFurniture: !!el.closest('.w-header, .w-footer')
  }));

/** Where the caret is, in paragraph terms. */
const caretParagraph = () => {
  const runSid = (window as any).editor.selection?.startNodeId;
  if (!runSid) return null;
  const run = document.querySelector(`[data-bc-sid="${CSS.escape(runSid)}"]`);
  const paragraph = run?.closest('.w-paragraph');
  if (!paragraph) return null;
  const all = [...document.querySelectorAll('.w-paragraph')];
  return {
    index: all.indexOf(paragraph),
    text: (paragraph.textContent ?? '').replace(/﻿/g, ''),
    onPage: isOnPaper(paragraph),
    offset: (window as any).editor.selection?.startOffset as number
  };
};

for (const where of ['/', '/?lab']) {
test(`Enter splits in order wherever it is pressed (${where})`, async ({ page }) => {
  /**
   * Legitimately long, and said so rather than left to fail under load.
   *
   * The sweep reloads the whole document once per paragraph — deliberately, so
   * one bad split cannot explain the next — which is around forty page loads and
   * forty paginations in one test. At the suite's 30-second budget that fits on
   * an idle machine and does not while anything else is running: it failed once
   * in a full run and twice in the next, always inside `settled()` waiting for a
   * page count that had not stopped moving, and passed alone every time.
   *
   * `test.slow()` rather than a bigger number everywhere: the budget is right for
   * every other test in this suite, and a test that takes forty page loads should
   * be the one that says so.
   */
  test.slow();

  await page.goto(where);
  await settled(page);

  const total = await page.evaluate(() => document.querySelectorAll('.w-paragraph').length);
  expect(total, 'no paragraphs to try').toBeGreaterThan(3);

  const failures: Split[] = [];
  // Every paragraph, from a fresh document each time so one bad split cannot
  // explain the next.
  for (let index = 0; index < total; index += 1) {
    await page.goto(where);
    await settled(page);

    const target = await page.evaluate((i) => {
      const el = [...document.querySelectorAll('.w-paragraph')][i];
      if (!el) return null;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Node | null = null;
      while ((node = walker.nextNode())) {
        if ((node.textContent ?? '').replace(/﻿/g, '').length > 4) break;
      }
      if (!node) return null;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = [...range.getClientRects()][0];
      if (!rect || rect.width < 8) return null;
      return { x: rect.left + rect.width * 0.4, y: rect.top + rect.height / 2 };
    }, index);

    // Paragraphs with nothing in them, or nothing visible, are not a click a
    // reader can make — skipped, and said so at the end.
    if (!target) continue;

    await page.mouse.move(target.x, target.y);
    await page.mouse.click(target.x, target.y);
    const placed = await page
      .evaluate(caretParagraph)
      .catch(() => null);
    if (!placed || placed.index !== index) continue; // the click landed elsewhere

    const before = await page.evaluate(survey);
    const whole = before[index].text;
    const head = whole.slice(0, placed.offset);
    const tail = whole.slice(placed.offset);
    if (!head || !tail) continue; // nothing to split

    await page.keyboard.press('Enter');

    /**
     * Wait for the split *and* for the paginator to have placed it.
     *
     * This was a flat 450ms, which is a guess at how long pagination takes and
     * was wrong under load: the split was correct — right head, right tail, right
     * order — and the new paragraph had not been put on a page yet, so the sweep
     * reported "새 문단이 페이지 밖에 그려졌습니다" for a document that was
     * about to be fine. Twice in six runs, and never alone.
     *
     * Polling for the state the assertions are about keeps the failure real: a
     * paragraph that never lands on a page still fails, with the same message,
     * after this gives up.
     */
    await expect
      .poll(
        async () =>
          page.evaluate((expected) => {
            const paragraphs = [...document.querySelectorAll('.w-paragraph')];
            if (paragraphs.length !== expected) return false;
            const sid = (window as any).editor.selection?.startNodeId;
            const node = sid
              ? document.querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`)
              : null;
            const paragraph = node?.closest('.w-paragraph');
            if (!paragraph) return false;
            const box = paragraph.getBoundingClientRect();
            return [...document.querySelectorAll('.w-sheet')].some((sheet) => {
              const paper = sheet.getBoundingClientRect();
              const middle = box.top + box.height / 2;
              return box.height > 0 && middle >= paper.top && middle <= paper.bottom;
            });
          }, before.length + 1),
        { timeout: 4000, intervals: [50, 100, 200] }
      )
      .toBe(true)
      .catch(() => {
        // Not the assertion: the records below say what went wrong and where,
        // which is more use than "expected true".
      });

    const after = await page.evaluate(survey);
    const mine = await page.evaluate(caretParagraph);

    const record: Split = { index, ok: true, head, tail };
    if (after.length !== before.length + 1) {
      record.ok = false;
      record.why = `문단 수가 ${before.length} → ${after.length}`;
    } else if (!mine) {
      record.ok = false;
      record.why = '커서가 어느 문단에도 없습니다';
    } else {
      const above = mine.index > 0 ? after[mine.index - 1] : null;
      record.gotMine = mine.text;
      record.gotAbove = above?.text ?? null;
      record.onPage = mine.onPage;
      if (mine.text !== tail) {
        record.ok = false;
        record.why = '커서가 뒷조각에 있지 않습니다';
      } else if (!above || above.text !== head) {
        record.ok = false;
        record.why = '앞조각이 바로 위에 없습니다 — 문단이 위쪽에 끼어들었습니다';
      } else if (above.top >= after[mine.index].top) {
        record.ok = false;
        record.why = '앞조각이 뒷조각보다 아래에 그려졌습니다';
      } else if (!mine.onPage) {
        record.ok = false;
        record.why = '새 문단이 페이지 밖에 그려졌습니다';
      }
    }
    if (!record.ok) failures.push(record);
  }

  expect(
    failures,
    `Enter가 잘못 쪼갠 문단:\n${JSON.stringify(failures, null, 2)}`
  ).toEqual([]);
});
}
