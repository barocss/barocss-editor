import { test, expect } from '@playwright/test';
import { settled } from './helpers';

test('merged body rows stay on one page and their lower boundary resizes the last row', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor')).toBeVisible();
  await page.evaluate(() => {
    const p = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });
    const cell = (text: string, attributes = {}) => ({ stype: 'bTableCell', attributes, content: [p(text)] });
    const row = (text: string) => ({ stype: 'bTableRow', attributes: { height: 900, heightRule: 'atLeast' }, content: [cell(text), cell('Value')] });
    (window as any).editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: {
      kind: 'flow', pageWidth: 12240, pageHeight: 9000, marginTop: 720, marginBottom: 720, marginLeft: 1440, marginRight: 1440,
    }, content: [{ stype: 'bTable', attributes: { grid: '3600,3600', width: 7200, widthType: 'dxa', layout: 'fixed' }, content: [{ stype: 'bTableBody', content: [
      { stype: 'bTableRow', attributes: { isHeader: true }, content: [cell('Group'), cell('Value')] },
      ...Array.from({ length: 6 }, (_, i) => row(`BEFORE-${i}`)),
      { ...row('Merged group'), content: [cell('Merged group', { rowspan: 3, shadingFill: 'DCE6F1' }), cell('MERGE-1')] },
      { ...row(''), content: [cell('MERGE-2')] },
      { ...row(''), content: [cell('MERGE-3')] },
      ...Array.from({ length: 10 }, (_, i) => row(`AFTER-${i}`)),
    ] }] }, p('End')] }] });
  });
  await settled(page);
  const merged = page.locator('#editor td[rowspan="3"]');
  const rows = page.locator('#editor .w-tr');
  const assertFits = async () => {
    await expect.poll(() => page.evaluate(() => {
      const sheets = [...document.querySelectorAll('.w-sheet')].map(el => el.getBoundingClientRect());
      return [...document.querySelectorAll('#editor td[data-bc-sid], #editor .w-table-header-repeat')].every(el => {
        const r = el.getBoundingClientRect();
        return sheets.some(s => r.top >= s.top + 46 && r.bottom <= s.bottom - 46);
      });
    })).toBe(true);
  };
  await assertFits();
  await expect(merged.locator('xpath=..').locator('xpath=preceding-sibling::*[1]')).toHaveClass('w-table-header-repeat');
  const rowId = await rows.nth(9).getAttribute('data-bc-sid');
  const originId = await rows.nth(7).getAttribute('data-bc-sid');
  const heightOf = (id: string) => page.evaluate(sid => (window as any).editor.dataStore.getNode(sid).attributes.height, id);
  await merged.scrollIntoViewIfNeeded();
  const bounds = (await merged.boundingBox())!;
  await page.mouse.move(bounds.x + 30, bounds.y + bounds.height - 1);
  await expect(page.locator('.ot-table-resize-guide')).toHaveAttribute('data-axis', 'row');
  await page.mouse.down();
  await page.mouse.move(bounds.x + 30, bounds.y + bounds.height + 39, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => heightOf(rowId!)).toBeGreaterThan(1400);
  expect(await heightOf(originId!)).toBe(900);
  await settled(page); await assertFits();
  await page.screenshot({ path: '/tmp/word-merged-row-resize.png' });
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect.poll(() => heightOf(rowId!)).toBe(900);
  await settled(page); await assertFits();
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload(); await settled(page); await assertFits();
  await expect(merged).toContainText('Merged group');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const printed = await page.evaluate(() => [...document.querySelectorAll('.w-print-page')].flatMap(paper => {
    const bounds = paper.getBoundingClientRect();
    return [...paper.querySelectorAll('.w-text')].flatMap(element => {
      const rect = element.getBoundingClientRect(), text = element.textContent ?? '';
      return /^(BEFORE-|AFTER-|MERGE-|Merged group)/.test(text) && rect.top >= bounds.top && rect.bottom <= bounds.bottom ? [text] : [];
    });
  }));
  expect(printed).toEqual([
    ...Array.from({ length: 6 }, (_, i) => `BEFORE-${i}`), 'Merged group', 'MERGE-1', 'MERGE-2', 'MERGE-3',
    ...Array.from({ length: 10 }, (_, i) => `AFTER-${i}`),
  ]);
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
});

test('the lower boundary of a fully merged cell can resize an empty covered row', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor')).toBeVisible();
  await page.evaluate(() => {
    const p = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });
    (window as any).editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow' }, content: [
      { stype: 'bTable', content: [{ stype: 'bTableBody', content: [
        { stype: 'bTableRow', attributes: { height: 900, heightRule: 'atLeast' }, content: [{ stype: 'bTableCell', attributes: { rowspan: 2, colspan: 2 }, content: [p('Full merge')] }] },
        { stype: 'bTableRow', attributes: { height: 900, heightRule: 'atLeast' }, content: [] },
      ] }] }, p('After'),
    ] }] });
  });
  await settled(page);
  const merged = page.locator('#editor td[rowspan="2"]');
  await merged.scrollIntoViewIfNeeded();
  const rowId = await page.locator('#editor .w-tr').nth(1).getAttribute('data-bc-sid');
  const before = (await merged.boundingBox())!;
  await page.mouse.move(before.x + 30, before.y + before.height - 1);
  await page.mouse.down();
  await page.mouse.move(before.x + 30, before.y + before.height + 39, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(sid => (window as any).editor.dataStore.getNode(sid).attributes.height, rowId)).toBeGreaterThan(1400);
  await expect.poll(async () => (await merged.boundingBox())!.height).toBeGreaterThan(before.height + 35);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect.poll(async () => (await merged.boundingBox())!.height).toBeCloseTo(before.height, 0);
});
