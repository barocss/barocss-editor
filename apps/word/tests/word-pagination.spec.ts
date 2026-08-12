import { test, expect } from '@playwright/test';
import { placeCaret, settled } from './helpers';

/**
 * Where the pages fall.
 *
 * The paginator measures what was rendered and decides where each page ends,
 * which is why these cannot be written against the model alone.
 *
 * Part of the browser suite for apps/word; the shared helpers are in helpers.ts.
 */

test.describe('tabs', () => {
  /** Where each run of a paragraph begins and ends, relative to the paragraph. */
  async function runsOf(page: import('@playwright/test').Page, startsWith: string) {
    return page.evaluate((startsWith) => {
      const paragraph = [...document.querySelectorAll('.w-paragraph')].find((p) =>
        p.textContent?.startsWith(startsWith)
      )!;
      const origin = paragraph.getBoundingClientRect().left;
      return [...paragraph.querySelectorAll('.w-text')].map((run) => {
        const box = run.getBoundingClientRect();
        return { text: run.textContent ?? '', left: box.left - origin, right: box.right - origin };
      });
    }, startsWith);
  }

  test('reaches the stops the paragraph names', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    // One inch, two and a half, four and a half — in pixels at 96dpi, which is
    // what the twips in the document come to.
    await expect
      .poll(async () => Math.round((await runsOf(page, 'Left'))[1]?.left ?? -1))
      .toBe(96);

    const runs = await runsOf(page, 'Left');
    // A centre stop centres the text on it; a right stop ends the text at it.
    // Both are promises about text the tab has not reached yet, which is why
    // they cannot be kept without measuring what follows.
    const centred = runs[2];
    expect(Math.round((centred.left + centred.right) / 2)).toBeCloseTo(240, -1);
    expect(Math.round(runs[3].right)).toBeCloseTo(432, -1);
  });

  test('falls back to half-inch stops when the paragraph names none', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    await expect
      .poll(async () => (await runsOf(page, 'a')).slice(0, 3).map((r) => Math.round(r.left)))
      .toEqual([0, 48, 96]);
  });

  test('draws a leader only where the stop asks for one', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const paragraph = [...document.querySelectorAll('.w-paragraph')].find((p) =>
            p.textContent?.startsWith('Left')
          )!;
          return [...paragraph.querySelectorAll('.w-tab')].map((tab) => {
            const style = getComputedStyle(tab as HTMLElement);
            // The width, not the style: a global reset gives everything a
            // border style of solid at zero width, so the style alone says
            // nothing about whether a border is drawn.
            return style.borderBottomWidth === '0px' ? 'none' : style.borderBottomStyle;
          });
        })
      )
      .toEqual(['none', 'none', 'dotted']);
  });
});

test.describe('pages', () => {
  test('draws a sheet per computed page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    // The sample document is deliberately longer than a page, so that the
    // interesting case — a break — is the one being measured.
    const sheets = page.locator('.w-sheet');
    expect(await sheets.count()).toBeGreaterThan(1);

    const first = await sheets.first().boundingBox();
    // US Letter at 96dpi: 8.5in x 11in
    expect(Math.round(first!.width)).toBe(816);
    expect(Math.round(first!.height)).toBe(1056);
  });

  test('stacks sheets without overlapping', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const boxes = await page.locator('.w-sheet').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().top)
    );
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]).toBeGreaterThan(boxes[i - 1] + 1000);
    }
  });

  test('keeps the sheets out of the way of the text', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    // A page sheet must not be selectable, focusable, or editable. Every
    // section draws its own, so this checks all of them rather than the first.
    const attributes = await page.locator('.w-sheets').evaluateAll((els) =>
      els.map((el) => [el.getAttribute('contenteditable'), el.getAttribute('aria-hidden')])
    );
    expect(attributes.length).toBeGreaterThan(0);
    for (const [editable, hidden] of attributes) {
      expect(editable).toBe('false');
      expect(hidden).toBe('true');
    }
  });

  test('draws the sheets behind the text rather than over it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    // The sheets are the paper, so nothing of the document may be painted under
    // them. This went wrong for real and nothing caught it: the sheets are
    // positioned and the text is not, and CSS paints positioned boxes after
    // in-flow ones regardless of document order, so an opaque white rectangle
    // covered every word. The page looked blank while the DOM, the geometry and
    // the text content were all exactly right — which is why the checks above
    // passed throughout.
    //
    // Hit testing follows paint order, so asking what is on top answers the
    // question. The sheets set `pointer-events: none` to let clicks through, and
    // that also hides them from `elementsFromPoint` — so it is lifted for the
    // duration of the question, and put back.
    const covered = await page.evaluate(() => {
      const sheets = [...document.querySelectorAll('.w-sheets')] as HTMLElement[];
      sheets.forEach((el) => (el.style.pointerEvents = 'auto'));
      try {
        const blocks = [...document.querySelectorAll('.w-heading, .w-paragraph')].slice(0, 30);
        return blocks
          .filter((block) => {
            const box = block.getBoundingClientRect();
            if (box.height === 0 || box.bottom < 0 || box.top > window.innerHeight) return false;
            const above = document.elementsFromPoint(box.left + 4, box.top + box.height / 2);
            // Anything from the chrome layer sitting above this block in the
            // stack is painted over it.
            return above.slice(0, above.indexOf(block)).some((el) => el.closest('.w-sheets'));
          })
          .map((block) => block.textContent?.trim().slice(0, 30));
      } finally {
        sheets.forEach((el) => (el.style.pointerEvents = 'none'));
      }
    });

    expect(covered).toEqual([]);
  });

  test('starts each page at the top of its own sheet', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    // The first thing on a page, measured as text rather than as a block.
    //
    // An earlier version of this looked for the first block-level child
    // beginning inside the sheet and called it the page's opener, which was
    // wrong: a page whose text continues a paragraph from overleaf has no block
    // beginning at its top, and the first block that does begin there is
    // rightly further down. It read that gap as a 61px misalignment and this was
    // recorded as a defect for some time. The layout was correct throughout.
    const gaps = await page.evaluate(() => {
      const surface = document.querySelector('.w-surface')!;
      const sheets = [...surface.querySelectorAll('.w-sheet')];

      const firstLineOn = (top: number, bottom: number): number | null => {
        const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
        let earliest: number | null = null;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.parentElement?.closest('.w-sheets')) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of [...range.getClientRects()]) {
            if (rect.height <= 0 || rect.top < top - 2 || rect.top >= bottom) continue;
            if (earliest === null || rect.top < earliest) earliest = rect.top;
          }
        }
        return earliest;
      };

      const out: number[] = [];
      for (let i = 1; i < sheets.length; i++) {
        const rect = sheets[i].getBoundingClientRect();
        const contentTop = rect.top + 96;
        const first = firstLineOn(contentTop, rect.bottom - 96);
        if (first !== null) out.push(first - contentTop);
      }
      return out;
    });

    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      // A line box sits a little below the top of the area it is in — that is
      // leading, not misplacement. Less than a line means the page starts where
      // it should; a page actually misaligned would be out by tens of pixels.
      expect(gap).toBeGreaterThanOrEqual(-2);
      expect(gap).toBeLessThan(24);
    }
  });

  // This failed for a long time and the paginator was never at fault. It decided
  // to break the long paragraph after its thirty-second line and said so; the
  // widget that draws the break was rendered at the head of the paragraph
  // instead, and everything after it sat a page too high. The cause was in the
  // renderer — a position widget inserted before one already drawn landed on the
  // wrong side of the text it was cut from — and is pinned there, in
  // position-widget-placement.test.ts.
  test('keeps every line inside a page, however the block was split', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const outside = await page.evaluate(() => {
      const areas = Array.from(document.querySelectorAll('.w-sheet')).map((sheet) => {
        const rect = sheet.getBoundingClientRect();
        return { top: rect.top + 96, bottom: rect.bottom - 96 };
      });

      const surface = document.querySelector('.w-surface')!;
      const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
      let strays = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest('.w-sheets')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.height <= 0) continue;
          const inside = areas.some((a) => rect.top >= a.top - 2 && rect.bottom <= a.bottom + 2);
          if (!inside) strays++;
        }
      }
      return strays;
    });

    expect(outside).toBe(0);
  });
});

test.describe('pages follow the text', () => {
  test('repaginates as content grows past the last page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const before = await page.locator('.w-sheet').count();

    // Add enough blocks to need another sheet. Nothing in the app asks for a
    // relayout: the view runs the pass after each render, which is the wiring
    // this checks.
    // Until a page is added, rather than a number of presses that was enough
    // once: how much room the last page has left changes with the fixture, and
    // a fixed count either stops short or spends the whole test budget typing.
    await placeCaret(page, '.w-paragraph', 1);
    for (let i = 0; i < 80 && (await page.locator('.w-sheet').count()) === before; i++) {
      await page.keyboard.press('Enter');
    }

    await expect
      .poll(async () => page.locator('.w-sheet').count(), { timeout: 15000 })
      .toBeGreaterThan(before);
  });

  test('gives back the pages when the content shrinks again', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const before = await page.locator('.w-sheet').count();

    // Enough presses to need another page, rather than a number that happened
    // to be enough once: how much room the last page has left is a property of
    // the fixture, and every edit to it changes the answer.
    await placeCaret(page, '.w-paragraph', 1);
    for (let i = 0; i < 80 && (await page.locator('.w-sheet').count()) === before; i++) {
      await page.keyboard.press('Enter');
    }
    await expect
      .poll(async () => page.locator('.w-sheet').count(), { timeout: 15000 })
      .toBeGreaterThan(before);

    // Undone until the pages come back, rather than a fixed number of times.
    // Edits coalesce, so the number of history entries is not the number of
    // keystrokes, and undoing a fixed count either stops short or walks back
    // past loading the document — which empties it, a different thing entirely.
    for (let i = 0; i < 30; i++) {
      if ((await page.locator('.w-sheet').count()) === before) break;
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(60);
    }

    await expect
      .poll(async () => page.locator('.w-sheet').count(), { timeout: 15000 })
      .toBe(before);
  });
});

test.describe('columns', () => {
  const secondSurface = (page: import('@playwright/test').Page) =>
    page.locator('.w-surface').nth(1);

  test('runs the text in two columns', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const lefts = await secondSurface(page).evaluate((surface) => {
      const blocks = Array.from(surface.children).filter(
        (el) => el.hasAttribute('data-bc-sid') && !el.classList.contains('w-sheets')
      );
      return [...new Set(blocks.map((el) => Math.round(el.getBoundingClientRect().left)))];
    });

    expect(lefts).toHaveLength(2);
  });

  test('breaks lines at the column width, not the page width', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const [width, textWidth] = await secondSurface(page).evaluate((surface) => {
      const block = Array.from(surface.children).find(
        (el) => el.hasAttribute('data-bc-sid') && !el.classList.contains('w-sheets')
      )!;
      const sheet = surface.querySelector('.w-sheet')!;
      return [
        block.getBoundingClientRect().width,
        sheet.getBoundingClientRect().width - 192 // one inch of margin either side
      ];
    });

    // (text width - gap) / 2, which is what makes the lines shorter
    expect(width).toBeLessThan(textWidth / 2 + 1);
  });

  test('fills the first column before starting the second', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const blocks = await secondSurface(page).evaluate((surface) =>
      Array.from(surface.children)
        .filter((el) => el.hasAttribute('data-bc-sid') && !el.classList.contains('w-sheets'))
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { left: Math.round(rect.left), top: Math.round(rect.top) };
        })
    );

    const left = Math.min(...blocks.map((b) => b.left));
    const firstColumn = blocks.filter((b) => b.left === left);
    const secondColumn = blocks.filter((b) => b.left !== left);

    // The second column starts above where the first one ended: that is the
    // move a top margin cannot express, and the reason these are positioned.
    expect(secondColumn.length).toBeGreaterThan(0);
    const lastOfFirst = Math.max(...firstColumn.map((b) => b.top));
    expect(Math.min(...secondColumn.map((b) => b.top))).toBeLessThan(lastOfFirst);
  });

  test('leaves the single-column section stacking in normal flow', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    // Only sections that need it pay for absolute positioning
    const positioned = await page.locator('.w-surface').first().evaluate((surface) =>
      Array.from(surface.children)
        .filter((el) => el.hasAttribute('data-bc-sid') && !el.classList.contains('w-sheets'))
        .filter((el) => getComputedStyle(el as HTMLElement).position === 'absolute').length
    );

    expect(positioned).toBe(0);
  });
})

test.describe('a paragraph longer than a page', () => {
  const longParagraph = '.w-paragraph:has-text("A page break inside a paragraph cannot be a margin")';

  test('breaks inside itself', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-page-break');

    // Everything else the layout does moves whole blocks. This one puts space
    // between two lines of one block, which no margin can express: the thing
    // before the break and the thing after it are the same element.
    expect(await page.locator('.w-page-break').count()).toBeGreaterThan(0);
  });

  test('settles rather than growing on every pass', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-page-break');

    // The spacer is part of how tall the paragraph currently is and no part of
    // how tall its text is. Measuring it as a line made the block grow each time
    // it broke, and the breaks drifted further down on every pass.
    const first = await page.locator('.w-page-break').count();
    await page.waitForTimeout(600);
    expect(await page.locator('.w-page-break').count()).toBe(first);
  });

  test('leaves the text the model holds untouched', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-page-break');

    // The spacer is an empty element: it contributes no text node, so nothing
    // that reads text should be able to tell it is there.
    const [dom, model] = await page.evaluate(() => {
      // Located by its text: `:has-text` is Playwright's, not the DOM's.
      const el = Array.from(document.querySelectorAll('.w-paragraph')).find((p) =>
        (p.textContent ?? '').includes('A page break inside a paragraph cannot be a margin')
      )!;
      const sid = el.querySelector('[data-bc-sid]')!.getAttribute('data-bc-sid')!;
      return [el.textContent ?? '', (window as any).editor.dataStore.getNode(sid)?.text ?? ''];
    });

    expect(dom).toBe(model);
    expect(dom).not.toContain('﻿');
  });

  test('types in order across the break', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-page-break');

    await placeCaret(page, longParagraph);
    const before = await page.evaluate(() => (window as any).editor.selection.startOffset);
    await page.keyboard.type('XYZ', { delay: 120 });

    // The caret has to advance with each character, or the next one lands in
    // front of the last and the word arrives backwards.
    await expect
      .poll(async () => page.evaluate(() => (window as any).editor.selection.startOffset))
      .toBe(before + 3);
    await expect(page.locator(longParagraph)).toContainText('XYZ');
  });

  test('types in order when typed quickly', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-page-break');

    // Fast enough that a render is still settling when the next key arrives,
    // which is where a forced caret restore used to overwrite the user's own.
    await placeCaret(page, longParagraph);
    await page.keyboard.type('ABCDEFGH', { delay: 15 });

    await expect(page.locator(longParagraph)).toContainText('ABCDEFGH');
  });

  test('is not copied with the text', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-page-break');

    const copied = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.w-paragraph')).find((p) =>
        (p.textContent ?? '').includes('A page break inside a paragraph cannot be a margin')
      )!;
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);

      let html = '';
      const onCopy = (event: ClipboardEvent) => {
        html = event.clipboardData?.getData('text/html') ?? '';
      };
      document.addEventListener('copy', onCopy);
      document.execCommand('copy');
      document.removeEventListener('copy', onCopy);
      return html;
    });

    expect(copied).not.toContain('w-page-break');
  });
})

test.describe('sheets under columns', () => {
  test('draws one sheet per page, not one per column', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const perSurface = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.w-surface')).map((surface) => {
        const layout = (window as any).wordLayout?.get(surface.getAttribute('data-bc-sid'));
        return {
          sheets: surface.querySelectorAll('.w-sheet').length,
          boxes: layout?.pages?.length ?? 0,
          columns: layout?.metrics?.columnCount ?? 1
        };
      })
    );

    const columned = perSurface.find((s) => s.columns > 1)!;
    expect(columned).toBeDefined();
    // A page holds one box per column; a sheet per box would stack two or three
    // sheets of paper down the document for one.
    expect(columned.sheets).toBe(Math.ceil(columned.boxes / columned.columns));
    expect(columned.sheets).toBeLessThan(columned.boxes);
  });
})

/**
 * A table longer than a page.
 *
 * It used to be unsplittable, and the result was not a table moved to the next
 * page — it was a table drawn straight across the gap between two sheets, its
 * rows crossing the bottom margin and the edge of the paper. A table breaks
 * between rows, which is the only place a page can end inside one: a break
 * inside a cell would leave its borders on one page and its words on another.
 */
test.describe('a table longer than a page', () => {
  /** Add rows to the sample table until it is taller than a page. */
  const growTable = async (page: import('@playwright/test').Page, rows: number) => {
    await page.evaluate((count) => {
      const ed = (window as any).editor;
      const find = (node: any, depth = 0): any => {
        if (!node || depth > 60) return null;
        if (node.stype === 'bTableBody') return node;
        for (const child of node.content ?? []) {
          const hit = find(typeof child === 'string' ? ed.dataStore.getNode(child) : child, depth + 1);
          if (hit) return hit;
        }
        return null;
      };
      const body = find(ed.dataStore.getNode(ed.getRootId()));
      const cell = (text: string) => ({
        stype: 'bTableCell',
        content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text }] }]
      });
      for (let index = 0; index < count; index++) {
        const row = ed.dataStore.createNodeWithChildren({
          stype: 'bTableRow',
          content: [cell(`row ${index} left`), cell(`row ${index} right`)]
        });
        ed.dataStore.addChild(body.sid, row);
      }
      (window as any).editorView.render();
    }, rows);
    await page.waitForTimeout(2500);
  };

  test('breaks between rows instead of running over the edge of the paper', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await growTable(page, 30);

    const measured = await page.evaluate(() => {
      const metrics = [...(window as any).wordLayout.values()][0].metrics;
      const sheets = [...document.querySelectorAll('.w-sheet')].map((s) => s.getBoundingClientRect());
      const table = document.querySelector('.w-table')!.getBoundingClientRect();

      // Against the content area, not the sheet: a row in the bottom margin is
      // drawn over the footer and off the printable page.
      const straddling = [...document.querySelectorAll('.w-table .w-tr')].filter((row) => {
        const box = row.getBoundingClientRect();
        if (box.height === 0) return false;
        return !sheets.some(
          (sheet) =>
            box.top >= sheet.top + metrics.marginTop - 1 &&
            box.bottom <= sheet.bottom - metrics.marginBottom + 1
        );
      });

      const allRows = [...document.querySelectorAll('.w-table tr')];
      const at = allRows.findIndex((row) => row.classList.contains('w-table-break'));

      return {
        rows: document.querySelectorAll('.w-table .w-tr').length,
        gaps: document.querySelectorAll('.w-table-break').length,
        spansSheets: sheets.filter((s) => table.top < s.bottom && table.bottom > s.top).length,
        straddling: straddling.length,
        around: allRows.slice(at, at + 2).map((row) => row.className.split(' ')[0]),
        repeats: document.querySelectorAll('.w-table-header-repeat').length,
        headerText: document.querySelector('.w-table-header-repeat')?.textContent ?? ''
      };
    });

    expect(measured.rows).toBeGreaterThan(30);
    // Taller than one page, so it has to break at least once.
    expect(measured.spansSheets).toBeGreaterThan(1);
    expect(measured.gaps).toBeGreaterThan(0);
    expect(measured.straddling).toBe(0);

    // And the columns are named again on every page it reaches. The order
    // matters and is the point: the gap carries the table to the next page, and
    // the header has to land under it rather than at the foot of the page the
    // reader is leaving.
    expect(measured.around).toEqual(['w-table-break', 'w-table-header-repeat']);
    expect(measured.repeats).toBe(measured.gaps);
    expect(measured.headerText).toContain('Merged header');

    // And it settles: a second round measures a table that now contains its own
    // gap rows, and counting them would make it taller, break it again, and
    // never stop.
    await page.evaluate(() => (window as any).editorView.render());
    await page.waitForTimeout(1200);
    const settledGaps = await page.evaluate(() => document.querySelectorAll('.w-table-break').length);
    expect(settledGaps).toBe(measured.gaps);
  });

});
