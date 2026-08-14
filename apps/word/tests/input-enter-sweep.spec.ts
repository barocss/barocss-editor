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

const survey = () =>
  [...document.querySelectorAll('.w-paragraph')].map((el, index) => ({
    index,
    sid: el.getAttribute('data-bc-sid'),
    text: (el.textContent ?? '').replace(/﻿/g, ''),
    top: el.getBoundingClientRect().top,
    onPage: !!el.closest('.w-page'),
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
    onPage: !!paragraph.closest('.w-page'),
    offset: (window as any).editor.selection?.startOffset as number
  };
};

for (const where of ['/', '/?lab']) {
test(`Enter splits in order wherever it is pressed (${where})`, async ({ page }) => {
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
    await page.waitForTimeout(450);

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
