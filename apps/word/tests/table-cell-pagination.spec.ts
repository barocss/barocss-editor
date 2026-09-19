import { test, expect, type Page } from '@playwright/test';
import { settled } from './helpers';

async function seed(page: Page, longParagraph = false) {
  await page.goto('/');
  await expect(page.locator('#editor')).toBeVisible();
  await page.evaluate((longParagraph) => {
    const p = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });
    const cell = (text: string) => ({ stype: 'bTableCell', content: [p(text)] });
    (window as any).editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: {
      kind: 'flow', pageWidth: 12240, pageHeight: 9000, marginTop: 720, marginBottom: 720, marginLeft: 1440, marginRight: 1440,
    }, content: [{ stype: 'bTable', attributes: { grid: '3600,3600', width: 7200, widthType: 'dxa', layout: 'fixed' }, content: [{ stype: 'bTableBody', content: [
      { stype: 'bTableRow', attributes: { isHeader: true }, content: [cell('Section'), cell('Details')] },
      { stype: 'bTableRow', content: [{ stype: 'bTableCell', attributes: { rowspan: 3, colspan: 2, shadingFill: 'DCE6F1' },
        content: longParagraph
          ? [p(Array.from({ length: 100 }, (_, i) => `SENTENCE-${String(i + 1).padStart(3, '0')} A single paragraph continues across pages.`).join(' '))]
          : Array.from({ length: 72 }, (_, i) => p(`MERGED-${String(i + 1).padStart(2, '0')} Paragraph stays editable across pages.`)) }] },
      { stype: 'bTableRow', content: [] }, { stype: 'bTableRow', content: [] },
      { stype: 'bTableRow', content: [cell('After merge'), cell('End')] },
    ] }] }, p('After table')] }] });
  }, longParagraph);
  await settled(page);
}

const source = (page: Page) => page.evaluate(() => JSON.stringify((window as any).editor.exportDocument(),
  (key, value) => key === 'loadedAt' || (key === 'marks' && Array.isArray(value) && value.length === 0) ? undefined : value));
const fits = (page: Page) => page.evaluate(() => {
  const zoom = Number(document.querySelector('.w-zoom-frame')?.getAttribute('data-zoom') ?? 1);
  const sheets = [...document.querySelectorAll('.w-sheet')].map(el => el.getBoundingClientRect());
  return [...document.querySelectorAll('#editor .w-paragraph')].filter(el => /^MERGED-/.test(el.textContent ?? '')).every(el => {
    const r = el.getBoundingClientRect();
    return sheets.some(s => r.top >= s.top + 47 * zoom && r.bottom <= s.bottom - 47 * zoom);
  });
});

test('one long paragraph inside a merged cell splits by lines and keeps text positions editable', async ({ page }) => {
  await seed(page, true);
  const paragraph = page.locator('#editor td[rowspan="3"] .w-paragraph');
  await expect(paragraph).toHaveCount(1);
  await expect(paragraph.locator('.w-table-cell-break').first()).toBeAttached();
  const textFits = () => paragraph.evaluate(el => {
    const sheets = [...document.querySelectorAll('.w-sheet')].map(s => s.getBoundingClientRect());
    const zoom = Number(document.querySelector('.w-zoom-frame')?.getAttribute('data-zoom') ?? 1);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('[data-bc-chrome]')) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.height > 0 && !sheets.some(s => r.top >= s.top + 47 * zoom && r.bottom <= s.bottom - 47 * zoom)) return false;
      }
    }
    return true;
  });
  await expect.poll(textFits).toBe(true);
  const before = await source(page);
  const pages = await page.locator('.w-sheet').count();
  expect(pages).toBeGreaterThan(2);
  // Place the caret in the model text on a continuation page, beyond header copies.
  await paragraph.evaluate(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('[data-bc-chrome]')) continue;
      const at = node.textContent!.indexOf('SENTENCE-050');
      if (at < 0) continue;
      const range = document.createRange(); range.setStart(node, at); range.collapse(true);
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      (el.closest('[contenteditable="true"]') as HTMLElement).focus();
      return;
    }
    throw new Error('Continuation text missing');
  });
  await expect.poll(() => page.evaluate(() => (window as any).editor.selection?.startOffset)).toBeGreaterThan(0);
  await page.keyboard.type('EDIT');
  await settled(page);
  expect(await source(page)).toContain('EDITSENTENCE-050');
  await expect.poll(textFits).toBe(true);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await settled(page);
  expect(await source(page)).toBe(before);
  await page.getByRole('tab', { name: '보기', exact: true }).click();
  await page.locator('[data-zoom-out]').click(); await settled(page);
  await expect.poll(textFits).toBe(true);
  expect(await page.locator('.w-sheet').count()).toBe(pages);
  expect(await source(page)).toBe(before);
  await page.locator('[data-zoom-in]').click(); await settled(page);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload(); await settled(page);
  await expect.poll(textFits).toBe(true);
  expect(await source(page)).toBe(before);
  await paragraph.locator('.w-table-cell-break').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/word-merged-cell-long-paragraph.png' });
  const originalText = await paragraph.textContent();
  const copied = await paragraph.evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    let html = '';
    const listener = (event: ClipboardEvent) => { html = event.clipboardData?.getData('text/html') ?? ''; };
    document.addEventListener('copy', listener); document.execCommand('copy'); document.removeEventListener('copy', listener);
    return html;
  });
  expect(copied).toContain('SENTENCE-050');
  expect(copied).not.toContain('w-table-cell-break');
  expect(copied).not.toContain('Section');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const printed = await page.evaluate(() => [...document.querySelectorAll('.w-print-page')].map(paper => {
    const bounds = paper.getBoundingClientRect();
    const el = paper.querySelector('td[rowspan="3"] .w-paragraph');
    if (!el) return '';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null, text = '';
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('[data-bc-chrome]')) continue;
      for (let i = 0; i < node.textContent!.length; i++) {
        const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1);
        const rect = range.getBoundingClientRect();
        if (rect.height > 0 && rect.top >= bounds.top && rect.bottom <= bounds.bottom) text += node.textContent![i];
      }
    }
    return text;
  }).join(''));
  expect(printed).toBe(originalText);
});

test('a full-width vertical merge continues across pages without changing stored rows', async ({ page }) => {
  await seed(page);
  await expect(page.locator('.w-table-cell-break').first()).toBeAttached();
  await expect.poll(() => fits(page)).toBe(true);
  const before = await source(page);
  const pages = await page.locator('.w-sheet').count();
  expect(pages).toBeGreaterThanOrEqual(3);
  const breaks = await page.locator('.w-table-cell-break').count();
  expect(breaks).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#editor td[rowspan="3"][colspan="2"]')).toHaveCount(1);
  await expect(page.locator('.w-cell-header-copy')).toHaveCount(breaks);
  // Repeated layout passes and document zoom must not count page gaps as content.
  await page.getByRole('tab', { name: '보기', exact: true }).click();
  await page.locator('[data-zoom-out]').click();
  await settled(page);
  expect(await page.locator('.w-sheet').count()).toBe(pages);
  await expect.poll(() => fits(page)).toBe(true);
  expect(await source(page)).toBe(before);
  await page.locator('[data-zoom-in]').click();
  await settled(page);
  expect(await page.locator('.w-table-cell-break').count()).toBe(breaks);
  expect(await source(page)).toBe(before);
  await page.locator('.w-table-cell-break').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/word-tall-merged-cell.png' });
});

test('continuation text edits, undoes, saves and prints once per page', async ({ page }) => {
  await seed(page);
  await expect.poll(() => fits(page)).toBe(true);
  const paragraph = page.locator('#editor .w-paragraph').filter({ hasText: 'MERGED-40' });
  await paragraph.scrollIntoViewIfNeeded();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' EDIT');
  await expect(paragraph).toContainText('EDIT');
  await settled(page);
  await expect.poll(() => fits(page)).toBe(true);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect(paragraph).not.toContainText('EDIT');
  await settled(page);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload(); await settled(page);
  await expect.poll(() => fits(page)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const printed = await page.evaluate(() => [...document.querySelectorAll('.w-print-page')].flatMap(paper => {
    const bounds = paper.getBoundingClientRect();
    return [...paper.querySelectorAll('.w-text')].flatMap(el => {
      const r = el.getBoundingClientRect(), text = el.textContent ?? '';
      return /^MERGED-/.test(text) && r.top >= bounds.top && r.bottom <= bounds.bottom ? [text.match(/^MERGED-\d+/)![0]] : [];
    });
  }));
  expect(printed).toEqual(Array.from({ length: 72 }, (_, i) => `MERGED-${String(i + 1).padStart(2, '0')}`));
});
