import { test, expect, type Page } from '@playwright/test';
import { settled } from './helpers';
import { createMergedCellSample } from '../src/merged-cell-sample';

const source = (page: Page) => page.evaluate(() => JSON.stringify((window as any).editor.exportDocument(),
  (key, value) => key === 'loadedAt' || (key === 'marks' && Array.isArray(value) && value.length === 0) ? undefined : value));
const fits = (page: Page) => page.evaluate(() => {
  const zoom = Number(document.querySelector('.w-zoom-frame')?.getAttribute('data-zoom') ?? 1);
  const sheets = [...document.querySelectorAll('.w-sheet')].map(el => el.getBoundingClientRect());
  return [...document.querySelectorAll('#editor td[rowspan="3"] .w-paragraph')].every(el => {
    const r = el.getBoundingClientRect();
    return sheets.some(s => r.top >= s.top + 47 * zoom && r.bottom <= s.bottom - 47 * zoom);
  });
});

test('a finished first column leaves the full-width header aligned with active columns', async ({ page }) => {
  await page.goto('/');
  const document = createMergedCellSample(false, true);
  const surface = document.content[0];
  const table = surface.content[1] as any;
  table.attributes.grid = '2400,2400,2400';
  const rows = table.content[0].content;
  rows[0].content.push(structuredClone(rows[0].content[0]));
  rows[1].content = [5, 54, 34].map((count, column) => ({
    stype: 'bTableCell', attributes: { rowspan: 3, verticalAlign: 'top' },
    content: Array.from({ length: count }, (_, i) => ({ stype: 'paragraph',
      content: [{ stype: 'inline-text', text: `열 ${column + 1} · 항목 ${i + 1}` }] })),
  }));
  rows[4].content.push(structuredClone(rows[4].content[0]));
  await page.evaluate(data => (window as any).editor.loadDocument(data), document);
  await settled(page);
  await expect.poll(() => fits(page)).toBe(true);
  await expect(page.locator('#editor td[rowspan="3"]')).toHaveCount(3);
  await expect(page.locator('#editor td[rowspan="3"]').first().locator('.w-table-cell-break')).toHaveCount(0);
  const masks = await page.locator('.w-table-cell-gap-mask:visible').evaluateAll(els => els.map(el => {
    const rect = el.getBoundingClientRect();
    const table = el.closest('td[rowspan="3"]')!.closest('table')!.getBoundingClientRect();
    return Math.abs(rect.left - table.left) < 2 && Math.abs(rect.right - table.right) < 2;
  }));
  expect(masks.length).toBeGreaterThan(1);
  expect(masks.every(Boolean)).toBe(true);
});

test('wrapping text in one column preserves useful page breaks in both columns', async ({ page }) => {
  await page.goto('/?sample=merged-cell-columns'); await settled(page);
  const before = await page.locator('.w-sheet').count();
  const paragraph = page.locator('#editor .w-paragraph').filter({ hasText: '검토 05.' });
  await paragraph.click(); await page.keyboard.press('End');
  await page.keyboard.type(' An additional wrapped line.'); await settled(page);
  await expect.poll(() => fits(page)).toBe(true);
  expect(await page.locator('.w-sheet').count()).toBeLessThanOrEqual(before + 1);
});

test('parallel merged columns continue, edit, save and print without duplicating content', async ({ page }) => {
  await page.goto('/?sample=merged-cell-columns');
  await expect(page.locator('#editor td[rowspan="3"]')).toHaveCount(2);
  await settled(page);
  await expect(page.locator('.w-table-cell-break').first()).toBeAttached();
  await expect.poll(() => fits(page)).toBe(true);
  const before = await source(page);
  const count = await page.locator('.w-sheet').count();
  expect(count).toBeGreaterThan(2);
  // Each page has one mask and one full-width header, despite multiple spacers.
  const masks = await page.locator('.w-table-cell-gap-mask:visible').evaluateAll(els => els.map(el => {
    const rect = el.getBoundingClientRect();
    const table = el.closest('td[rowspan="3"]')!.closest('table')!.getBoundingClientRect();
    return Math.abs(rect.left - table.left) < 2 && Math.abs(rect.right - table.right) < 2;
  }));
  expect(masks.length).toBeGreaterThan(1);
  expect(masks.every(Boolean)).toBe(true);
  const paragraph = page.locator('#editor .w-paragraph').filter({ hasText: '검토 25.' });
  await paragraph.scrollIntoViewIfNeeded(); await paragraph.click();
  await page.keyboard.press('End'); await page.keyboard.type(' EDIT');
  await expect(paragraph).toContainText('EDIT');
  await settled(page); await expect.poll(() => fits(page)).toBe(true);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await settled(page); expect(await source(page)).toBe(before);
  await page.getByRole('tab', { name: '보기', exact: true }).click();
  await page.locator('[data-zoom-out]').click(); await settled(page);
  await expect.poll(() => fits(page)).toBe(true);
  expect(await page.locator('.w-sheet').count()).toBe(count);
  expect(await source(page)).toBe(before);
  await page.locator('[data-zoom-in]').click(); await settled(page);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload(); await settled(page);
  await expect.poll(() => fits(page)).toBe(true);
  expect(await source(page)).toBe(before);
  await page.locator('.w-table-cell-break').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/word-parallel-merged-cells.png' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const printed = await page.evaluate(() => [...document.querySelectorAll('.w-print-page')].flatMap(paper => {
    const bounds = paper.getBoundingClientRect();
    return [...paper.querySelectorAll('td[rowspan="3"] .w-paragraph')].flatMap(el => {
      const rect = el.getBoundingClientRect();
      return rect.top >= bounds.top && rect.bottom <= bounds.bottom ? [el.textContent] : [];
    });
  }));
  expect(printed).toHaveLength(88);
  expect(new Set(printed).size).toBe(88);
  expect(printed.filter(text => text?.startsWith('항목'))).toEqual(Array.from({ length: 54 }, (_, i) => `항목 ${String(i + 1).padStart(2, '0')}. 다음 페이지로 이어집니다.`));
  expect(printed.filter(text => text?.startsWith('검토'))).toEqual(Array.from({ length: 34 }, (_, i) => `검토 ${String(i + 1).padStart(2, '0')}. 다음 페이지로 이어집니다.`));
});
