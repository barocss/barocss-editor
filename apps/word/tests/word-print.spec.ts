import { test, expect, type Page } from '@playwright/test';
import { settled } from './helpers';

/**
 * Printing: not a second pagination, but the one on screen honoured.
 *
 * Part of the browser suite for apps/word; the shared helpers are in helpers.ts.
 */

test.describe('print', () => {
  const fontFailures = new WeakMap<Page, string[]>();
  test.beforeEach(async ({ page }) => {
    const failures: string[] = []; fontFailures.set(page, failures);
    page.on('response', response => {
      if (/katex.*\/fonts\//i.test(response.url()) && !response.ok()) failures.push(`${response.status()} ${response.url()}`);
    });
    page.on('requestfailed', request => {
      if (/katex.*\/fonts\//i.test(request.url())) failures.push(`${request.failure()?.errorText} ${request.url()}`);
    });
  });
  test.afterEach(async ({ page }, testInfo) => {
    const faces = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter(face => face.family.includes('KaTeX')).map(face => ({ family: face.family, status: face.status }));
    });
    const failures = fontFailures.get(page) ?? [];
    await testInfo.attach('actual-katex-font-status', { body: JSON.stringify({ failures, faces }), contentType: 'application/json' });
    expect(failures, 'KaTeX font requests must succeed').toEqual([]);
    expect(faces.some(face => face.status === 'loaded'), 'The actual sample must load its KaTeX fonts').toBe(true);
    expect(faces.filter(face => face.status === 'error')).toEqual([]);
  });

  test('puts the same number of pages on paper as on screen', async ({ page }, testInfo) => {
    await page.goto('/?sample');
    await settled(page);
    const sheets = await page.locator('.w-sheet').count();

    const path = testInfo.outputPath('word-print.pdf');
    const pdf = await page.pdf({ path, printBackground: true, preferCSSPageSize: true });
    await testInfo.attach('actual-word-print', { path, contentType: 'application/pdf' });

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

    const readSourceHeaders = () => page.evaluate(() => {
      const headers = [...document.querySelectorAll<HTMLElement>('#editor .w-header')];
      return [...document.querySelectorAll<HTMLElement>('#editor .w-sheet')].map(sheet => {
        const paper = sheet.getBoundingClientRect();
        return headers.flatMap(header => {
          const r = header.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top < paper.bottom && r.bottom > paper.top && r.left < paper.right && r.right > paper.left
            ? [{ text: header.textContent?.trim(), top: r.top - paper.top, left: r.left - paper.left, width: r.width, height: r.height }] : [];
        });
      });
    });
    const sourceHeaders = await readSourceHeaders();
    const headersPerPage = async () => {
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await page.emulateMedia({ media: 'print' });
      const headers = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.w-print-page')].map(paper => {
        const p = paper.getBoundingClientRect();
        return [...paper.querySelectorAll<HTMLElement>('.w-header')].flatMap(header => {
          const r = header.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top < p.bottom && r.bottom > p.top && r.left < p.right && r.right > p.left
            ? [{ text: header.textContent?.trim(), top: r.top - p.top, left: r.left - p.left, width: r.width, height: r.height }] : [];
        });
      }));
      await page.emulateMedia({ media: 'screen' });
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      return headers;
    };

    const normal = await headersPerPage();
    expect(normal.length).toBeGreaterThan(1);
    expect(new Set(sourceHeaders.flat().map(header => header.text)).size).toBeGreaterThan(1);
    expect(sourceHeaders.some(headers => headers.length === 0)).toBe(true); // Section 2 has no header binding.
    const compareHeaders = (actualPages: typeof sourceHeaders, expectedPages: typeof sourceHeaders) => {
      expect(actualPages.map(headers => headers.map(header => header.text))).toEqual(expectedPages.map(headers => headers.map(header => header.text)));
      for (const [index, headers] of actualPages.entries()) for (const [at, actual] of headers.entries()) {
        const expected = expectedPages[index][at];
        expect(actual.top).toBeCloseTo(expected.top, 0);
        expect(actual.left).toBeCloseTo(expected.left, 0);
        expect(actual.width).toBeCloseTo(expected.width, 0);
        expect(actual.height).toBeCloseTo(expected.height, 0);
      }
    };
    compareHeaders(normal, sourceHeaders);

    // Editing a header shows the real node in place of the copy on the first
    // page and suppresses the copies on all the others — right for editing,
    // since several copies of one node are the wrong thing to type into. It is
    // not what should reach paper: measured before this was handled, printing
    // mid-edit put a header on one page and none on the rest.
    await page.evaluate(() => (window as any).setEditingFurniture('hdr-main'));
    await expect(page.locator('.w-header-source.is-editing')).toBeVisible();

    const editingHeaders = await headersPerPage();
    expect(editingHeaders).toEqual(normal);

    // And the reader is still in the header when the printing is over.
    await expect(page.locator('.w-header-source.is-editing')).toBeVisible();

    // The native sample above exercises unitless inheritance. A fixed inherited
    // length must retain its different semantics when furniture has smaller type.
    await page.evaluate(() => window.setEditingFurniture?.(undefined));
    await settled(page);
    await page.locator('#editor .w-document').evaluate(el => { (el as HTMLElement).style.lineHeight = '24px'; });
    const fixedSource = await readSourceHeaders();
    expect(fixedSource.flat()[0].height).toBeGreaterThan(sourceHeaders.flat()[0].height);
    compareHeaders(await headersPerPage(), fixedSource);
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
    const expectedFurniture = await page.evaluate(() => {
      const notes = [...document.querySelectorAll<HTMLElement>('#editor .w-header, #editor .w-footer, #editor .w-footnotes')];
      return [...document.querySelectorAll<HTMLElement>('#editor .w-sheet')].map(sheet => {
        const paper = sheet.getBoundingClientRect();
        return notes.flatMap(note => {
          const r = note.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top < paper.bottom && r.bottom > paper.top
            ? [{ kind: note.className, text: note.textContent?.trim(), top: r.top - paper.top, left: r.left - paper.left, width: r.width, height: r.height }] : [];
        });
      });
    });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });

    // Headers, footers, page numbers and footnotes are drawn per page on the
    // sheet layer. Clipping is what gives each printed page the ones that belong
    // to it — the earlier stylesheet had to drop them, and dropped the footnote
    // text off the printout with them.
    const first = await page.evaluate(() => {
      const page = document.querySelectorAll('.w-print-page')[0];
      const text = (selector: string) => page.querySelector(selector)?.textContent?.trim() ?? null;
      return { header: text('.w-header'), footer: text('.w-footer') };
    });

    const actualFurniture = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.w-print-page')].map(paper => {
      const p = paper.getBoundingClientRect();
      return [...paper.querySelectorAll<HTMLElement>('.w-header, .w-footer, .w-footnotes')].map(note => {
        const r = note.getBoundingClientRect();
        return { kind: note.className, text: note.textContent?.trim(), top: r.top - p.top, left: r.left - p.left, width: r.width, height: r.height };
      });
    }));

    expect(first.header).toContain('Draft');
    expect(first.footer).toContain('1 / ');
    expect(expectedFurniture.flat().map(note => note.text).join(' ')).toContain('A footnote body');
    expect(actualFurniture.map(notes => notes.map(note => [note.kind, note.text]))).toEqual(expectedFurniture.map(notes => notes.map(note => [note.kind, note.text])));
    for (const [index, notes] of actualFurniture.entries()) for (const [at, note] of notes.entries()) {
      const expected = expectedFurniture[index][at];
      expect(note.top).toBeCloseTo(expected.top, 0);
      expect(note.left).toBeCloseTo(expected.left, 0);
      expect(note.width).toBeCloseTo(expected.width, 0);
      expect(note.height).toBeCloseTo(expected.height, 0);
    }
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
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

/** Read actual character paint, not the text of a complete off-page clone. */
async function tablePrintSnapshot(page: Page, printed: boolean) {
  return page.evaluate(printed => {
    const papers = [...document.querySelectorAll<HTMLElement>(printed ? '.w-print-page' : '#editor .w-sheet')];
    const source = document.querySelector<HTMLElement>('#editor .w-document')!;
    const authored = (node: Node) => !node.parentElement?.closest('[data-bc-chrome], [data-bc-filler], .w-sheets');
    const rect = (r: DOMRect, paper: DOMRect, scale: number) => ({
      top: (r.top - paper.top) / scale, left: (r.left - paper.left) / scale,
      width: r.width / scale, height: r.height / scale,
    });
    const unassigned: string[] = [];
    const sourceCharacters = new Set<string>();
    const pages = papers.map((paper, pageIndex) => {
      const bounds = paper.getBoundingClientRect();
      const scale = bounds.width / parseFloat(getComputedStyle(paper).width);
      const root = printed ? paper : source;
      const chars: { key: string; text: string; top: number; left: number; width: number; height: number }[] = [];
      const chrome: { text: string; top: number; left: number; width: number; height: number }[] = [];
      const ordinals = new Map<string, number>();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const belongs = (r: DOMRect) => r.height > 0 && r.top >= bounds.top - 0.5 * scale
        && r.bottom <= bounds.bottom + 0.5 * scale && r.left >= bounds.left - 0.5 * scale && r.right <= bounds.right + 0.5 * scale;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest('[data-bc-filler], .w-sheets')) continue;
        const isAuthored = authored(node);
        const isHeader = !!node.parentElement?.closest('.w-table-header-repeat, .w-cell-header-copy');
        if (!isAuthored && !isHeader) continue;
        const sid = node.parentElement?.closest('[data-bc-sid]')?.getAttribute('data-bc-sid') ?? '';
        const ordinal = ordinals.get(sid) ?? 0; ordinals.set(sid, ordinal + 1);
        for (let offset = 0; offset < (node.textContent?.length ?? 0); offset++) {
          const key = `${sid}:${ordinal}:${offset}`;
          if (!printed && isAuthored) sourceCharacters.add(key);
          const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, offset + 1);
          const r = range.getBoundingClientRect();
          if (!belongs(r)) continue;
          const glyph = { text: node.textContent![offset], ...rect(r, bounds, scale) };
          if (isAuthored) chars.push({ key, ...glyph }); else chrome.push(glyph);
        }
      }
      const blocks = [...root.querySelectorAll<HTMLElement>('.w-table[data-bc-sid], .w-paragraph[data-bc-sid]')]
        .filter(el => !el.closest('[data-bc-chrome], .w-sheets')).flatMap(el => {
          const r = el.getBoundingClientRect();
          return r.height > 0 && r.top < bounds.bottom && r.bottom > bounds.top && r.left < bounds.right && r.right > bounds.left
            ? [{ sid: el.getAttribute('data-bc-sid')!, ...rect(r, bounds, scale) }] : [];
        });
      // Inline cell breaks deliberately have no text nodes. Their native
      // header uses CSS generated content; a DOM Range cannot measure it.
      const generatedHeaders = [...root.querySelectorAll<HTMLElement>('.w-cell-header-copy [data-word-header-text]')].flatMap(el => {
        const r = el.getBoundingClientRect();
        if (!belongs(r)) return [];
        const pseudo = getComputedStyle(el, '::before');
        const cell = getComputedStyle(el);
        return [{ text: el.getAttribute('data-word-header-text')!, content: pseudo.content,
          font: pseudo.font, color: pseudo.color, whiteSpace: pseudo.whiteSpace,
          visibility: pseudo.visibility, display: pseudo.display, opacity: pseudo.opacity,
          background: cell.backgroundColor, border: cell.border, ...rect(r, bounds, scale) }];
      });
      return { pageIndex, chars, chrome, generatedHeaders, blocks };
    });
    if (!printed) {
      const assigned = new Set(pages.flatMap(paper => paper.chars.map(char => char.key)));
      for (const key of sourceCharacters) if (!assigned.has(key)) unassigned.push(key);
    }
    return { pages, unassigned };
  }, printed);
}

test.describe('native table print projection', () => {
  const fixtures = [
    { sample: 'merged-cell-lines', marker: '문장 80.', merged: 1 },
    { sample: 'merged-cell', marker: '병합 문단 54.', merged: 1 },
    { sample: 'merged-cell-columns', marker: '검토 34.', merged: 2 },
    { sample: 'merged-cell-rows', marker: '설명 48.', merged: 1 },
  ];
  const cases = [...fixtures.map(fixture => ({ ...fixture, reduced: false })),
    ...[fixtures[0], fixtures[2]].map(fixture => ({ ...fixture, reduced: true }))];

  for (const fixture of cases) test(`${fixture.sample} preserves visible print characters${fixture.reduced ? ' at reduced zoom' : ''}`, async ({ page }, testInfo) => {
    const fontFailures: string[] = [];
    page.on('response', response => { if (/\.(woff2?|ttf)(\?|$)/i.test(response.url()) && !response.ok()) fontFailures.push(`${response.status()} ${response.url()}`); });
    page.on('requestfailed', request => { if (/\.(woff2?|ttf)(\?|$)/i.test(request.url())) fontFailures.push(`${request.failure()?.errorText} ${request.url()}`); });
    await page.goto(`/?sample=${fixture.sample}`);
    await settled(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('#editor td[rowspan]')).toHaveCount(fixture.merged);
    await expect(page.locator('#editor')).toContainText(fixture.marker);
    await expect(page.locator('#editor')).toContainText('표 다음의 본문입니다.');
    expect(await page.locator('#editor .w-sheet').count()).toBeGreaterThan(1);
    const before = await page.evaluate(() => JSON.stringify(window.editor.exportDocument()));
    if (fixture.reduced) {
      const zoom = page.locator('.w-zoom-frame');
      const initial = Number(await zoom.getAttribute('data-zoom'));
      const reduce = page.getByRole('button', { name: '축소', exact: true });
      await expect(reduce).toBeVisible();
      await reduce.click();
      await expect.poll(async () => Number(await zoom.getAttribute('data-zoom'))).toBeLessThan(initial);
      await settled(page);
      expect(await page.evaluate(() => JSON.stringify(window.editor.exportDocument()))).toBe(before);
    }
    const selection = await page.evaluateHandle(() => {
      const paragraph = [...document.querySelectorAll('#editor .w-paragraph')].find(el => !el.closest('[data-bc-chrome]'))!;
      const text = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT).nextNode()!;
      const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 2);
      const selected = getSelection()!; selected.removeAllRanges(); selected.addRange(range);
      return { text: selected.toString(), anchor: selected.anchorNode, focus: selected.focusNode,
        anchorOffset: selected.anchorOffset, focusOffset: selected.focusOffset };
    });
    const source = await tablePrintSnapshot(page, false);
    await testInfo.attach('native-source-character-geometry', { body: JSON.stringify(source), contentType: 'application/json' });
    expect(source.unassigned, 'Every source authored character must occupy a source sheet').toEqual([]);
    expect(source.pages.flatMap(paper => paper.chars).length).toBeGreaterThan(100);
    expect(source.pages.flatMap(paper => paper.chrome).length + source.pages.flatMap(paper => paper.generatedHeaders).length,
      'Native repeated headers must exist on continuation sheets').toBeGreaterThan(0);
    for (const header of source.pages.flatMap(paper => paper.generatedHeaders)) {
      expect(header.text.length).toBeGreaterThan(0);
      expect(['none', 'normal']).not.toContain(header.content);
      expect(header.visibility).toBe('visible');
      expect(header.display).not.toBe('none');
      expect(Number(header.opacity)).toBeGreaterThan(0);
    }
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    const printed = await tablePrintSnapshot(page, true);
    await testInfo.attach('source-and-printed-character-geometry', { body: JSON.stringify({ source, printed }), contentType: 'application/json' });
    expect(printed.pages).toHaveLength(source.pages.length);
    for (const [index, actual] of printed.pages.entries()) {
      const expected = source.pages[index];
      expect(actual.chars.map(char => [char.key, char.text]), `Authored characters on page ${index + 1}`).toEqual(expected.chars.map(char => [char.key, char.text]));
      expect(actual.chrome.map(char => char.text), `Repeated header characters on page ${index + 1}`).toEqual(expected.chrome.map(char => char.text));
      const paint = (headers: typeof actual.generatedHeaders) => headers.map(({ top: _top, left: _left, width: _width, height: _height, ...style }) => style);
      expect(paint(actual.generatedHeaders), `Generated header content/style on page ${index + 1}`).toEqual(paint(expected.generatedHeaders));
      expect(actual.blocks.map(block => block.sid)).toEqual(expected.blocks.map(block => block.sid));
      for (const kind of ['chars', 'chrome', 'generatedHeaders', 'blocks'] as const) for (const [at, item] of actual[kind].entries()) {
        const original = expected[kind][at];
        for (const axis of ['top', 'left', 'width', 'height'] as const) expect(item[axis], `${kind}[${at}].${axis} on page ${index + 1}`).toBeCloseTo(original[axis], 0);
      }
    }
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    expect(await page.locator('.w-print-pages').count()).toBe(0);
    // Let page.pdf fire the real print lifecycle from the visible source. A
    // manually retained print media override would hide the source beforehand.
    await page.emulateMedia({ media: null });
    await expect(page.locator('#editor .w-document')).toBeVisible();
    const path = testInfo.outputPath(`${fixture.sample}${fixture.reduced ? '-reduced' : ''}.pdf`);
    const pdf = await page.pdf({ path, printBackground: true, preferCSSPageSize: true });
    await testInfo.attach('actual-native-table-pdf', { path, contentType: 'application/pdf' });
    expect([...pdf.toString('latin1').matchAll(/\/Count\s+(\d+)/g)].map(match => Number(match[1]))).toContain(source.pages.length);
    expect(await page.locator('.w-print-pages').count()).toBe(0);
    expect(await page.evaluate(() => JSON.stringify(window.editor.exportDocument()))).toBe(before);
    expect(await page.evaluate(original => {
      const selected = getSelection()!;
      return selected.toString() === original.text && selected.anchorNode === original.anchor && selected.focusNode === original.focus
        && selected.anchorOffset === original.anchorOffset && selected.focusOffset === original.focusOffset;
    }, selection)).toBe(true);
    await selection.dispose();
    const fonts = await page.evaluate(() => [...document.fonts].map(face => ({ family: face.family, status: face.status })));
    await testInfo.attach('actual-native-table-font-status', { body: JSON.stringify({ failures: fontFailures, fonts }), contentType: 'application/json' });
    expect(fontFailures).toEqual([]);
    expect(fonts.filter(face => face.status === 'error')).toEqual([]);
  });
});
