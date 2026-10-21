import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * Printing: not a second pagination, but the one on screen honoured.
 *
 * Part of the browser suite for apps/word; the shared helpers are in helpers.ts.
 */

test.describe('print', () => {
  test('puts the same number of pages on paper as on screen', async ({ page }) => {
    await page.goto('/?sample');
    await settled(page);
    const sheets = await page.locator('.w-sheet').count();

    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });

    // Read out of the PDF itself rather than from anything the app says. A page
    // tree records how many pages it holds, and that is the only number a
    // printer acts on.
    const counts = [...pdf.toString('latin1').matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
    expect(counts).toContain(sheets);
  });

  test('builds a page for each sheet when the browser asks to print', async ({ page }) => {
    await page.goto('/?sample');
    await settled(page);
    const sheets = await page.locator('.w-sheet').count();

    // The browser's own event, which is what the print dialog fires. Nothing
    // exists before it: the copies are made for the print and taken away after.
    expect(await page.locator('.w-print-page').count()).toBe(0);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    expect(await page.locator('.w-print-page').count()).toBe(sheets);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    expect(await page.locator('.w-print-page').count()).toBe(0);
  });

  test('cuts a paragraph across two pages without cutting the text', async ({ page }) => {
    await page.goto('/?sample');
    await settled(page);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });

    const seam = await page.evaluate(() => {
      const pages = [...document.querySelectorAll('.w-print-page')];
      const visibleText = (page: Element): string => {
        const box = page.getBoundingClientRect();
        const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
        const lines: { top: number; text: string }[] = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of [...range.getClientRects()]) {
            if (rect.height <= 0) continue;
            if (rect.top < box.top - 1 || rect.bottom > box.bottom + 1) continue;
            lines.push({ top: rect.top, text: node.textContent ?? '' });
          }
        }
        return lines.sort((a, b) => a.top - b.top).map((l) => l.text).join(' ');
      };

      // The long paragraph numbers its sentences, so what is visible on a page
      // can be read back as a set of numbers. Found by content rather than by
      // page number: which pages it lands on depends on everything above it.
      const numbersOn = (text: string) =>
        [...text.matchAll(/\((\d+)\) A page break/g)].map((m) => Number(m[1]));
      const perPage = pages.map((p) => numbersOn(visibleText(p)));
      const first = perPage.findIndex((numbers) => numbers.includes(1));
      return { first: perPage[first] ?? [], next: perPage[first + 1] ?? [] };
    });
    await page.emulateMedia({ media: 'screen' });

    // The paragraph is on both pages, because a paragraph crossing a boundary
    // is on both pages. What matters is the seam: the numbering runs straight
    // across it. Nothing is repeated, which is what a copy on each page would
    // do if it were not clipped, and nothing is missing, which is what cutting
    // the text would risk.
    expect(seam.first.length).toBeGreaterThan(1);
    expect(seam.next.length).toBeGreaterThan(1);
    expect(Math.min(...seam.next)).toBe(Math.max(...seam.first) + 1);
  });

  test('prints the document, not the pane the reader has open', async ({ page }) => {
    await page.goto('/?sample');
    await settled(page);

    const headersPerPage = async () => {
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      const counts = await page.evaluate(() =>
        [...document.querySelectorAll('.w-print-page')].map((p) => p.querySelectorAll('.w-header').length)
      );
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      return counts;
    };

    const normal = await headersPerPage();
    expect(normal.length).toBeGreaterThan(1);
    expect(new Set(normal).size).toBe(1);

    // Editing a header shows the real node in place of the copy on the first
    // page and suppresses the copies on all the others — right for editing,
    // since several copies of one node are the wrong thing to type into. It is
    // not what should reach paper: measured before this was handled, printing
    // mid-edit put a header on one page and none on the rest.
    await page.evaluate(() => (window as any).setEditingFurniture('hdr-main'));
    await expect(page.locator('.w-header-source.is-editing')).toBeVisible();

    expect(await headersPerPage()).toEqual(normal);

    // And the reader is still in the header when the printing is over.
    await expect(page.locator('.w-header-source.is-editing')).toBeVisible();
  });

  test('prints the paper the section describes', async ({ page }) => {
    await page.goto('/?sample');
    await settled(page);

    const css = await page.evaluate(
      () => document.querySelector('style[data-word-print]')!.textContent!
    );
    // US Letter in points, the unit a printer works in. No margins on the page
    // box: each page holds a copy clipped to a whole sheet, margins included.
    expect(css).toContain('size: 612pt 792pt');
    expect(css).toMatch(/@page \{[\s\S]*?margin: 0;/);
  });

  test('carries the page furniture onto the paper', async ({ page }) => {
    await page.goto('/?sample');
    await settled(page);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));

    // Headers, footers, page numbers and footnotes are drawn per page on the
    // sheet layer. Clipping is what gives each printed page the ones that belong
    // to it — the earlier stylesheet had to drop them, and dropped the footnote
    // text off the printout with them.
    const first = await page.evaluate(() => {
      const page = document.querySelectorAll('.w-print-page')[0];
      const text = (selector: string) => page.querySelector(selector)?.textContent?.trim() ?? null;
      return { header: text('.w-header'), footer: text('.w-footer'), note: text('.w-footnotes') };
    });

    expect(first.header).toContain('Draft');
    expect(first.footer).toContain('1 / ');
    expect(first.note).toContain('A footnote body');
  });

  test('keeps page-local complete blocks at their original sheet coordinates', async ({ page }) => {
    await page.goto('/?sample');
    await settled(page);
    const source = await page.evaluate(() => {
      const sheets = [...document.querySelectorAll<HTMLElement>('#editor .w-sheet')].map(el => {
        const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
      });
      return [...document.querySelectorAll<HTMLElement>('#editor .w-surface > [data-bc-sid]:not(.w-sheets)')].map(el => {
        const r = el.getBoundingClientRect();
        return { sid: el.getAttribute('data-bc-sid')!, width: r.width, height: r.height,
          pages: sheets.flatMap((sheet, index) => r.top < sheet.bottom && r.bottom > sheet.top && r.left < sheet.right && r.right > sheet.left
            ? [{ index, top: r.top - sheet.top, left: r.left - sheet.left }] : []) };
      });
    });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    const projected = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.w-print-page')].flatMap((paper, index) => {
      const p = paper.getBoundingClientRect();
      return [...paper.querySelectorAll<HTMLElement>('.w-surface > [data-bc-sid]:not(.w-sheets)')].map(el => {
        const r = el.getBoundingClientRect();
        return { index, sid: el.getAttribute('data-bc-sid')!, top: r.top - p.top, left: r.left - p.left, width: r.width, height: r.height };
      });
    }));
    for (const block of source) for (const expected of block.pages) {
      const actual = projected.find(item => item.index === expected.index && item.sid === block.sid);
      expect(actual, `${block.sid} on page ${expected.index + 1}`).toBeDefined();
      expect(actual!.top).toBeCloseTo(expected.top, 0);
      expect(actual!.left).toBeCloseTo(expected.left, 0);
      expect(actual!.width).toBeCloseTo(block.width, 0);
      expect(actual!.height).toBeCloseTo(block.height, 0);
    }
    // The sample spans many pages. A page projection must not contain every
    // block in the document merely because the print page clips most of it.
    expect(projected.length).toBeLessThan(source.length * await page.locator('.w-print-page').count());
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  });

  test('preserves the native document and browser selection across repeated print builds', async ({ page }) => {
    await page.goto('/?sample');
    await settled(page);
    const result = await page.evaluate(() => {
      const editor = (window as Window & { editor: { exportDocument(): unknown } }).editor;
      const paragraph = document.querySelector('#editor .w-paragraph')!;
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode()!;
      const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, Math.min(2, text.textContent!.length));
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      const anchor = selection.anchorNode, focus = selection.focusNode, anchorOffset = selection.anchorOffset, focusOffset = selection.focusOffset;
      const native = JSON.stringify(editor.exportDocument());
      window.dispatchEvent(new Event('beforeprint')); window.dispatchEvent(new Event('beforeprint'));
      const containers = document.querySelectorAll('.w-print-pages').length;
      const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
      window.dispatchEvent(new Event('afterprint')); window.dispatchEvent(new Event('afterprint'));
      return { containers, uniqueIds: new Set(ids).size === ids.length, native: native === JSON.stringify(editor.exportDocument()),
        selection: selection.anchorNode === anchor && selection.focusNode === focus && selection.anchorOffset === anchorOffset && selection.focusOffset === focusOffset,
        cleared: document.querySelector('.w-print-pages') === null };
    });
    expect(result).toEqual({ containers: 1, uniqueIds: true, native: true, selection: true, cleared: true });
  });
});

/**
 * Find and replace.
 *
 * The searching is the product's and is tested there, without a browser. What
 * only a browser can answer is whether the matches are shown where the text is,
 * whether moving between them moves, and whether replacing changes the document
 * the reader is looking at.
 */
