import { test, expect, type Page } from '@playwright/test';
import { settled } from './helpers';
import { createStaggeredCellSample } from '../src/merged-cell-sample';

const source = (page: Page) => page.evaluate(() => JSON.stringify((window as any).editor.exportDocument(),
  (key, value) => key === 'loadedAt' || (key === 'marks' && Array.isArray(value) && value.length === 0) ? undefined : value));
const fits = (page: Page) => page.evaluate(() => {
  const zoom = Number(document.querySelector('.w-zoom-frame')?.getAttribute('data-zoom') ?? 1);
  const sheets = [...document.querySelectorAll('.w-sheet')].map(el => el.getBoundingClientRect());
  return [...document.querySelectorAll('#editor .w-paragraph')].every(el => {
    const r = el.getBoundingClientRect();
    return sheets.some(s => r.top >= s.top + 47 * zoom && r.bottom <= s.bottom - 47 * zoom);
  });
});

test('a right-side merge stays aligned when ordinary rows wrap and grow', async ({ page }) => {
  await page.goto('/');
  const doc = createStaggeredCellSample();
  const table = doc.content[0].content[1] as any;
  table.content[0].content[1].content.reverse();
  await page.evaluate(data => (window as any).editor.loadDocument(data), doc); await settled(page);
  await expect.poll(() => fits(page)).toBe(true);
  const before = await source(page);
  const paragraph = page.locator('#editor .w-paragraph').filter({ hasText: '검토 05.' });
  await paragraph.click(); await page.keyboard.press('End');
  await page.keyboard.type(' This text wraps onto an additional line.'); await settled(page);
  await expect.poll(() => fits(page)).toBe(true);
  const masks = await page.locator('.w-table-cell-gap-mask:visible').evaluateAll(els => els.map(el => {
    const rect = el.getBoundingClientRect(), table = el.closest('td')!.closest('table')!.getBoundingClientRect();
    return Math.abs(rect.left - table.left) < 2 && Math.abs(rect.right - table.right) < 2;
  }));
  expect(masks.length).toBeGreaterThan(1); expect(masks.every(Boolean)).toBe(true);
  await page.evaluate(() => (window as any).editor.run('undo')); await settled(page);
  expect(await source(page)).toBe(before);
  await expect.poll(() => fits(page)).toBe(true);
});

test('a vertical merge continues beside ordinary editable rows', async ({ page }) => {
  await page.goto('/?sample=merged-cell-rows'); await settled(page);
  await expect(page.locator('#editor td[rowspan="24"]')).toHaveCount(1);
  await expect(page.locator('.w-table-cell-break').first()).toBeAttached();
  await expect.poll(() => fits(page)).toBe(true);
  const before = await source(page);
  const pages = await page.locator('.w-sheet').count();
  expect(pages).toBeGreaterThan(2);
  const paragraph = page.locator('#editor .w-paragraph').filter({ hasText: '검토 16.' });
  await paragraph.scrollIntoViewIfNeeded(); await paragraph.click();
  await page.keyboard.press('End'); await page.keyboard.type(' EDIT');
  await expect(paragraph).toContainText('EDIT'); await settled(page);
  await expect.poll(() => fits(page)).toBe(true);
  await page.evaluate(() => (window as any).editor.run('undo')); await settled(page);
  expect(await source(page)).toBe(before);
  await page.getByRole('tab', { name: '보기', exact: true }).click();
  await page.locator('[data-zoom-out]').click(); await settled(page);
  await expect.poll(() => fits(page)).toBe(true);
  expect(await page.locator('.w-sheet').count()).toBe(pages);
  await page.locator('[data-zoom-in]').click(); await settled(page);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload(); await settled(page);
  expect(await source(page)).toBe(before);
  await expect.poll(() => fits(page)).toBe(true);
  await page.locator('.w-table-cell-break').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/word-staggered-merged-cells.png' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const printed = await page.evaluate(() => [...document.querySelectorAll('.w-print-page')].flatMap(paper => {
    const bounds = paper.getBoundingClientRect();
    return [...paper.querySelectorAll('.w-paragraph')].flatMap(el => {
      const rect = el.getBoundingClientRect();
      return rect.top >= bounds.top && rect.bottom <= bounds.bottom ? [el.textContent] : [];
    });
  }));
  expect(printed.filter(text => /^설명 \d/.test(text ?? ''))).toEqual(Array.from({ length: 48 }, (_, i) => `설명 ${String(i + 1).padStart(2, '0')}. 병합 셀의 본문입니다.`));
  expect(printed.filter(text => /^검토 \d/.test(text ?? ''))).toEqual(Array.from({ length: 24 }, (_, i) => `검토 ${String(i + 1).padStart(2, '0')}. 개별 행입니다.`));
  expect(printed.filter(text => text === '이 행에서 내용을 편집할 수 있습니다.')).toHaveLength(24);
});

test('resizing a continuation row excludes the page gap and preserves pagination', async ({ page }) => {
  await page.goto('/?sample=merged-cell-rows'); await settled(page);
  await expect.poll(() => fits(page)).toBe(true);
  const cell = page.locator('#editor td[data-bc-sid]:not([rowspan="24"])').filter({ has: page.locator('.w-table-cell-break') }).first();
  const before = await source(page);
  const rowId = await cell.locator('..').getAttribute('data-bc-sid');
  await cell.scrollIntoViewIfNeeded();
  const rect = (await cell.boundingBox())!;
  const baseline = await cell.evaluate(el => {
    const gap = el.querySelector<HTMLElement>('.w-table-cell-break')!;
    return (el as HTMLElement).offsetHeight - gap.offsetHeight;
  });
  await page.mouse.move(rect.x + 40, rect.y + rect.height - 1);
  await expect(page.locator('.ot-table-resize-guide')).toHaveAttribute('data-axis', 'row');
  await page.mouse.down(); await page.mouse.move(rect.x + 40, rect.y + rect.height + 19, { steps: 8 }); await page.mouse.up();
  await settled(page);
  const height = await page.evaluate(sid => (window as any).editor.dataStore.getNode(sid).attributes.height, rowId);
  expect(height / 15).toBeGreaterThan(baseline + 17);
  expect(height / 15).toBeLessThan(baseline + 23);
  await expect.poll(() => fits(page)).toBe(true);
  await page.evaluate(() => (window as any).editor.run('undo')); await settled(page);
  expect(await source(page)).toBe(before);
  await expect.poll(() => fits(page)).toBe(true);
});
