import { test, expect } from '@playwright/test';
import { settled } from './helpers';

test('multi-row merged headers repeat inside each page and leave every body row visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor')).toBeVisible();
  await page.evaluate(() => {
    const paragraph = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });
    const cell = (text: string, attributes = {}) => ({ stype: 'bTableCell', attributes, content: [paragraph(text)] });
    (window as any).editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: {
      kind: 'flow', pageWidth: 12240, pageHeight: 9000, marginTop: 720, marginBottom: 720, marginLeft: 1440, marginRight: 1440,
    }, content: [{ stype: 'bTable', attributes: { grid: '2400,2400,2400', width: 7200, widthType: 'dxa', layout: 'fixed' }, content: [{ stype: 'bTableBody', content: [
      { stype: 'bTableRow', attributes: { isHeader: true }, content: [cell('Category', { rowspan: 2, shadingFill: 'DCE6F1' }), cell('Quarterly totals', { colspan: 2 })] },
      { stype: 'bTableRow', attributes: { isHeader: true }, content: [cell('Plan'), cell('Actual')] },
      ...Array.from({ length: 40 }, (_, i) => ({ stype: 'bTableRow', content: [cell(`ITEM-${String(i + 1).padStart(2, '0')}`), cell('120'), cell('130')] })),
    ] }] }, paragraph('End of table')] }] });
  });
  await settled(page);
  const gaps = page.locator('#editor .w-table-break'), repeats = page.locator('#editor .w-table-header-repeat');
  await expect(gaps).not.toHaveCount(0);
  expect(await repeats.count()).toBe((await gaps.count()) * 2);
  await expect(repeats.nth(0).locator('th').nth(0)).toHaveAttribute('rowspan', '2');
  await expect(repeats.nth(0).locator('th').nth(1)).toHaveAttribute('colspan', '2');
  await expect(repeats.nth(1)).toHaveText('PlanActual');
  await expect(repeats.nth(0).locator('th').nth(0)).toHaveCSS('background-color', 'rgb(220, 230, 241)');
  const geometry = await page.evaluate(() => {
    const sheets = [...document.querySelectorAll('.w-sheet')].map(el => el.getBoundingClientRect());
    const fits = (element: Element) => { const rect = element.getBoundingClientRect(); return sheets.some(sheet => rect.top >= sheet.top + 48 - 2 && rect.bottom <= sheet.bottom - 48 + 2); };
    return { repeats: [...document.querySelectorAll('.w-table-header-repeat')].every(fits), rows: [...document.querySelectorAll('.w-table .w-tr')].every(fits) };
  });
  expect(geometry).toEqual({ repeats: true, rows: true });
  const before = await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
  const count = await repeats.count();
  await page.evaluate(() => (window as any).editorView.render()); await settled(page);
  await expect(repeats).toHaveCount(count);
  expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(before);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const printed = await page.evaluate(() => [...document.querySelectorAll('.w-print-page')].flatMap(paper => {
    const bounds = paper.getBoundingClientRect();
    return [...paper.querySelectorAll('.w-text')].flatMap(element => {
      const rect = element.getBoundingClientRect(), value = element.textContent ?? '';
      return /^ITEM-\d+$/.test(value) && rect.top >= bounds.top && rect.bottom <= bounds.bottom ? [value] : [];
    });
  }));
  expect(printed).toEqual(Array.from({ length: 40 }, (_, i) => `ITEM-${String(i + 1).padStart(2, '0')}`));
  await page.screenshot({ path: '/tmp/word-repeated-headers-print.png' });
  await page.emulateMedia({ media: 'screen' }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  // Reloading without repeating headers must remove every old decorator row.
  await page.evaluate(() => {
    const editor = (window as any).editor;
    const doc = editor.exportDocument();
    const visit = (node: any) => {
      if (node.attributes?.isHeader) node.attributes.isHeader = false;
      for (const child of node.content ?? []) if (typeof child === 'object') visit(child);
    };
    visit(doc);
    editor.loadDocument(doc);
  });
  await settled(page);
  await expect(repeats).toHaveCount(0);
  await expect(page.locator('#editor .w-tr')).toHaveCount(42);
});
