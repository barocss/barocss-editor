import { test, expect, type Page } from '@playwright/test';
import { settled, placeCaret } from './helpers';

async function snapshot(page: Page) {
  return page.evaluate(() => {
    // Reopening mints session-local node IDs. Compare document content/format.
    const clean = (node: any): any => ({ stype: node.stype, text: node.text ?? '', attributes: node.attributes ?? {}, marks: node.marks ?? [], content: (node.content ?? []).map(clean) });
    return clean((window as any).editor.exportDocument());
  });
}

test('reviewed report with a long table survives reopen and prints each row once', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.goto('/');
  await expect(page.locator('#editor .w-paragraph').first()).toBeVisible();
  await page.evaluate(() => {
    const text = (value: string) => ({ stype: 'inline-text', text: value });
    const paragraph = (value: string) => ({ stype: 'paragraph', content: [text(value)] });
    (window as any).editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: {
      kind: 'flow', pageWidth: 12240, pageHeight: 15840, marginTop: 1440, marginBottom: 1440, marginLeft: 1440, marginRight: 1440
    }, content: [
      { stype: 'heading', attributes: { level: 1 }, content: [text('Quarterly review')] },
      paragraph('Status: draft'),
      { stype: 'bTable', attributes: { grid: '1700,5000,2000', width: 8700, widthType: 'dxa', layout: 'fixed' }, content: [
        { stype: 'bTableHeader', content: ['Item', 'Description', 'Owner'].map(value => ({ stype: 'bTableHeaderCell', content: [paragraph(value)] })) },
        { stype: 'bTableBody', content: Array.from({ length: 48 }, (_, index) => ({ stype: 'bTableRow', content: [
          `ROW-${String(index + 1).padStart(3, '0')}`, 'Check document editing, persistence and page layout.', 'Product team'
        ].map(value => ({ stype: 'bTableCell', content: [paragraph(value)] })) })) }
      ] }, paragraph('End of report')
    ] }] });
  });
  await settled(page);
  await expect(page.getByRole('toolbar', { name: '기본 문서 도구' })).toBeVisible();
  await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await page.getByRole('tab', { name: '검토', exact: true }).click();
  await page.getByRole('button', { name: '변경 내용 추적', exact: true }).click();
  const statusText = page.locator('#editor .w-paragraph').filter({ hasText: /^Status: draft/ });
  await statusText.click(); await page.keyboard.press('End'); await page.keyboard.type(' Reviewed.');
  await expect(statusText).toContainText('Reviewed.');
  await expect(page.locator('#editor .w-insertion')).not.toHaveCount(0);
  await page.getByRole('tab', { name: '검토', exact: true }).click();
  await page.getByRole('button', { name: '모두 적용', exact: true }).click();
  await expect(page.locator('#editor .w-insertion')).toHaveCount(0);
  await page.getByRole('button', { name: '변경 내용 추적', exact: true }).click();
  await placeCaret(page, '#editor .w-cell', 3);
  await page.getByRole('button', { name: '셀 안쪽 여백', exact: true }).click();
  await page.getByRole('combobox', { name: '여백 적용 대상' }).click();
  await page.getByRole('option', { name: '표의 모든 셀' }).click();
  const top = page.getByRole('spinbutton', { name: '위쪽 셀 여백' });
  await top.fill('0.15'); await top.press('Enter');
  await page.getByRole('dialog').getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  // Screen pages repeat the header; count the 147 source cells, not the copies.
  await expect.poll(() => page.evaluate(() => {
    const margins: unknown[] = [];
    const visit = (node: any) => {
      if (node.stype === 'bTableCell' || node.stype === 'bTableHeaderCell') margins.push(node.attributes?.marginTop);
      for (const child of node.content ?? []) visit(child);
    };
    visit((window as any).editor.exportDocument());
    return margins;
  })).toEqual(Array(147).fill(85));
  await expect.poll(() => page.locator('#editor .w-cell').evaluateAll(cells =>
    cells.length > 0 && cells.every(cell => Math.abs(parseFloat(getComputedStyle(cell).paddingTop) - 85 / 15) < 0.01)
  )).toBe(true);
  const before = await snapshot(page);
  await page.reload(); await settled(page);
  expect(await snapshot(page)).toEqual(before);
  await expect(page.locator('#editor')).toContainText('Status: draft Reviewed.');
  const sheets = await page.locator('.w-sheet').count();
  expect(sheets).toBeGreaterThan(2);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.w-print-page')).flatMap(sheet => {
    const paper = sheet.getBoundingClientRect();
    return Array.from(sheet.querySelectorAll('.w-text')).flatMap(element => {
      const value = element.textContent?.trim() ?? '';
      if (!/^ROW-\d{3}$/.test(value)) return [];
      const rect = element.getBoundingClientRect();
      return rect.height > 0 && rect.top >= paper.top - 1 && rect.bottom <= paper.bottom + 1 ? [value] : [];
    });
  }));
  expect(rows).toEqual(Array.from({ length: 48 }, (_, index) => `ROW-${String(index + 1).padStart(3, '0')}`));
  await page.screenshot({ path: testInfo.outputPath('word-integrated-print.png'), animations: 'disabled' });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('.w-print-page')).toHaveCount(0);
  // Release the explicit screen override so PDF uses the browser's print media.
  await page.emulateMedia({ media: null });
  const pdf = await page.pdf({ path: testInfo.outputPath('word-integrated-report.pdf'), printBackground: true, preferCSSPageSize: true });
  expect([...pdf.toString('latin1').matchAll(/\/Count\s+(\d+)/g)].map(match => Number(match[1]))).toContain(sheets);
  expect(await snapshot(page)).toEqual(before);
});
