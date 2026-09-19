import { test, expect, type Page } from '@playwright/test';
import { placeCaret, settled } from './helpers';

for (const axis of ['column', 'row'] as const) {
  test(`${axis} resize preserves the text selection before, during and after dragging`, async ({ page }) => {
    await placeCaret(page, '#editor .w-paragraph');
    await settled(page);
    const selection = () => page.evaluate(() => JSON.stringify((window as any).editor.selection));
    const beforeSelection = await selection();
    const cell = page.locator('#editor table td').first();
    const before = (await cell.boundingBox())!;
    const point = axis === 'column'
      ? { x: before.x + before.width - 1, y: before.y + 12 }
      : { x: before.x + 35, y: before.y + before.height - 1 };
    const moveTo = { x: point.x + (axis === 'column' ? 50 : 0), y: point.y + (axis === 'row' ? 50 : 0) };
    const unchanged = async () => {
      expect(await selection()).toBe(beforeSelection);
      await expect(page.locator('#editor [data-cell-selected]')).toHaveCount(0);
      await expect(page.getByRole('tab', { name: '표 레이아웃' })).toHaveCount(0);
    };
    await page.mouse.move(point.x, point.y);
    await expect(page.locator('.ot-table-resize-guide')).toHaveAttribute('data-axis', axis);
    // A boundary click without a drag must not select a cell either.
    await page.mouse.down(); await unchanged(); await page.mouse.up(); await unchanged();
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await page.mouse.move(moveTo.x, moveTo.y, { steps: 6 });
    await unchanged();
    await page.keyboard.press('Escape'); await page.mouse.up();
    await unchanged();
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await page.mouse.move(moveTo.x, moveTo.y, { steps: 6 });
    await unchanged();
    await page.mouse.up(); await settled(page); await unchanged();
    await expect.poll(async () => {
      const box = (await cell.boundingBox())!;
      return axis === 'column' ? box.width - before.width : box.height - before.height;
    }).toBeGreaterThan(45);
    await page.evaluate(() => (window as any).editor.run('undo'));
    await settled(page); await unchanged();
    await expect.poll(async () => {
      const box = (await cell.boundingBox())!;
      return Math.abs(axis === 'column' ? box.width - before.width : box.height - before.height);
    }).toBeLessThan(2);
  });
}

test('cell margin dialog stages changes, applies scope, resets and persists', async ({ page }) => {
  const cells = page.locator('#editor table td');
  await cells.first().click();
  await page.getByRole('button', { name: '셀 안쪽 여백', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '셀 안쪽 여백' });
  await number(page, '왼쪽 셀 여백', '0.5');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  const initial = await cells.first().evaluate(el => getComputedStyle(el).paddingLeft);
  await page.getByRole('button', { name: '셀 안쪽 여백', exact: true }).click();
  await number(page, '왼쪽 셀 여백', '0.5');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect.poll(() => cells.first().evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThan(18);
  await expect(cells.nth(1)).toHaveCSS('padding-left', initial);
  await page.getByRole('button', { name: '셀 안쪽 여백', exact: true }).click();
  await choice(page, '여백 적용 대상', '표의 모든 셀');
  await number(page, '위쪽 셀 여백', '0.4');
  await page.screenshot({ path: '/tmp/word-cell-margins.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect.poll(() => cells.nth(1).evaluate(el => parseFloat(getComputedStyle(el).paddingTop))).toBeGreaterThan(14);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await cells.first().click();
  await page.getByRole('button', { name: '셀 안쪽 여백', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: '왼쪽 셀 여백' })).toHaveValue('0.5');
  await dialog.getByRole('button', { name: '기본 여백으로 복원' }).click();
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(cells.first()).toHaveCSS('padding-left', initial);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect.poll(() => cells.first().evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThan(18);
});

test('picture description reaches the image alt, survives reopen and can be decorative', async ({ page }) => {
  const image = page.locator('#editor img.w-image');
  await image.click();
  await page.getByRole('button', { name: '대체 텍스트', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '그림 대체 텍스트' });
  await page.getByRole('textbox', { name: '그림 설명' }).fill('분기별 매출 증가 그래프');
  await page.screenshot({ path: '/tmp/word-image-alt.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(image).toHaveAttribute('alt', '분기별 매출 증가 그래프');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(image).toHaveAttribute('alt', '분기별 매출 증가 그래프');
  await image.click();
  await page.getByRole('button', { name: '대체 텍스트', exact: true }).click();
  await choice(page, '그림 용도', '장식용 그림');
  await expect(page.getByRole('textbox', { name: '그림 설명' })).toBeDisabled();
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(image).toHaveAttribute('alt', '');
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect(image).toHaveAttribute('alt', '분기별 매출 증가 그래프');
});

test('table boundaries drag dimensions with one undo and Escape cancellation', async ({ page }) => {
  const table = page.locator('#editor table').first();
  const cell = table.locator('td').first();
  await cell.click();
  if (!await page.getByRole('tab', { name: '표 레이아웃' }).count()) await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await expect(page.getByRole('tab', { name: '표 레이아웃' })).toHaveAttribute('aria-selected', 'true');
  const original = (await cell.boundingBox())!;
  await page.mouse.move(original.x + original.width + 2, original.y + 12);
  await expect(page.locator('.ot-table-resize-guide')).toBeVisible();
  await page.mouse.down();
  await page.mouse.move(original.x + original.width + 59, original.y + 12, { steps: 8 });
  await expect(page.locator('.ot-table-resize-guide output')).toContainText('cm');
  await page.screenshot({ path: '/tmp/word-table-boundary-drag.png', animations: 'disabled' });
  await page.mouse.up();
  await expect.poll(async () => (await cell.boundingBox())!.width).toBeGreaterThan(original.width + 55);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect.poll(async () => Math.abs((await cell.boundingBox())!.width - original.width)).toBeLessThan(2);
  await cell.click();
  if (!await page.getByRole('tab', { name: '표 레이아웃' }).count()) await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await expect(page.getByRole('tab', { name: '표 레이아웃' })).toHaveAttribute('aria-selected', 'true');
  const beforeRow = (await cell.boundingBox())!;
  await page.mouse.move(beforeRow.x + 40, beforeRow.y + beforeRow.height - 1);
  await expect(page.locator('.ot-table-resize-guide')).toHaveAttribute('data-axis', 'row');
  await page.mouse.down();
  await page.mouse.move(beforeRow.x + 40, beforeRow.y + beforeRow.height + 49, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await cell.boundingBox())!.height).toBeGreaterThan(beforeRow.height + 45);
  const tall = (await cell.boundingBox())!;
  await page.mouse.move(tall.x + tall.width - 1, tall.y + 12);
  await page.mouse.down();
  await page.mouse.move(tall.x + tall.width + 69, tall.y + 12, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await cell.boundingBox())!.width - tall.width)).toBeLessThan(2);
  await expect(page.locator('.ot-table-resize-guide')).toBeHidden();
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect.poll(async () => (await cell.boundingBox())!.height).toBeGreaterThan(beforeRow.height + 45);
});

const pixel = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#2563eb"/></svg>');

test('boundary drag scales with document zoom and read-only tables do not resize', async ({ page }) => {
  const zoom = page.locator('[data-zoom-value]');
  await zoom.fill('75%'); await zoom.press('Enter');
  await expect(page.locator('.w-zoom-frame')).toHaveAttribute('data-zoom', '0.75');
  const cell = page.locator('#editor table td').first();
  await cell.click();
  if (!await page.getByRole('tab', { name: '표 레이아웃' }).count()) await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await expect(page.getByRole('tab', { name: '표 레이아웃' })).toHaveAttribute('aria-selected', 'true');
  const before = (await cell.boundingBox())!;
  await page.mouse.move(before.x + before.width - 1, before.y + 10);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width + 44, before.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await cell.boundingBox())!.width).toBeGreaterThan(before.width + 42);
  await expect.poll(() => cell.evaluate(el => (el as HTMLElement).offsetWidth)).toBeGreaterThan(178);
  await page.evaluate(() => (window as any).editor.setEditable(false));
  const readonly = (await cell.boundingBox())!;
  await page.mouse.move(readonly.x + readonly.width - 1, readonly.y + 10);
  await expect(page.locator('.ot-table-resize-guide')).toBeHidden();
  await page.mouse.down();
  await page.mouse.move(readonly.x + readonly.width + 40, readonly.y + 10, { steps: 5 });
  await page.mouse.up();
  expect((await cell.boundingBox())!.width).toBeCloseTo(readonly.width, 0);
});
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor .w-paragraph').first()).toBeVisible();
  await page.evaluate(src => {
    (window as any).editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow', pageWidth: 12240, pageHeight: 15840, marginTop: 1440, marginBottom: 1440, marginLeft: 1440, marginRight: 1440 }, content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Table and picture layout' }] },
      { stype: 'bTable', attributes: { grid: '1800,1800', width: 3600, widthType: 'dxa', layout: 'fixed' }, content: [{ stype: 'bTableBody', content: [
        { stype: 'bTableRow', content: ['First', 'Second'].map(text => ({ stype: 'bTableCell', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text }] }] })) }
      ] }] },
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Before ' }, { stype: 'inline-image', attributes: { src, width: 3000, height: 1500 } }, { stype: 'inline-text', text: ' After' }] }
    ] }] });
  }, pixel);
});
async function number(page: Page, label: string, value: string) {
  const field = page.getByRole('spinbutton', { name: label, exact: true });
  await field.fill(value); await field.press('Enter');
}
async function choice(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
test('table width, alignment, fit, undo and saved layout', async ({ page }) => {
  const table = page.locator('#editor table').first();
  await table.locator('td, th').first().click();
  await expect(page.getByRole('spinbutton', { name: '표 너비', exact: true })).toBeVisible();
  await number(page, '표 너비', '10');
  await expect.poll(() => table.evaluate(el => parseFloat(getComputedStyle(el).width))).toBeGreaterThan(370);
  await choice(page, '표 정렬', '가운데 정렬');
  await expect.poll(() => table.evaluate(el => Math.abs(el.getBoundingClientRect().left - (el.parentElement!.getBoundingClientRect().left + (el.parentElement!.clientWidth - el.getBoundingClientRect().width) / 2)))).toBeLessThan(2);
  await page.screenshot({ path: '/tmp/word-table-layout.png', animations: 'disabled' });
  await choice(page, '표 자동 맞춤', '본문 너비에 맞춤');
  await expect.poll(() => table.evaluate(el => parseFloat(getComputedStyle(el).width))).toBeGreaterThan(620);
  await expect.poll(() => table.evaluate(el => {
    const parent = el.parentElement!; const css = getComputedStyle(parent);
    const bodyWidth = parent.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    return Math.abs(parseFloat(getComputedStyle(el).width) - bodyWidth);
  })).toBeLessThan(1);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect(page.getByRole('spinbutton', { name: '표 너비', exact: true })).toHaveValue('10');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect.poll(() => table.evaluate(el => parseFloat(getComputedStyle(el).width))).toBeGreaterThan(370);
});
test('picture dimensions preserve ratio, placement, undo and persistence', async ({ page }) => {
  const image = page.locator('#editor img.w-image');
  await image.click();
  await expect(page.getByRole('spinbutton', { name: '그림 너비', exact: true })).toBeVisible();
  await number(page, '그림 너비', '10');
  await expect(page.getByRole('spinbutton', { name: '그림 높이', exact: true })).toHaveValue('5');
  await page.screenshot({ path: '/tmp/word-picture-layout.png', animations: 'disabled' });
  await choice(page, '그림 본문 배치', '왼쪽에 배치');
  await expect(image).toHaveCSS('float', 'left');
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect(image).toHaveCSS('float', 'none');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect.poll(() => image.evaluate(el => Math.round(parseFloat(getComputedStyle(el).width)))).toBe(378);
});

test('unlocked picture sizing and object deletion preserve surrounding text', async ({ page }) => {
  const image = page.locator('#editor img.w-image');
  await image.click();
  const height = await page.getByRole('spinbutton', { name: '그림 높이', exact: true }).inputValue();
  await page.getByRole('button', { name: '그림 비율 유지', exact: true }).click();
  await number(page, '그림 너비', '8');
  await expect(page.getByRole('spinbutton', { name: '그림 높이', exact: true })).toHaveValue(height);
  await image.click();
  await page.keyboard.press('Backspace');
  await expect(image).toHaveCount(0);
  await expect(page.locator('#editor')).toContainText('Before');
  await expect(page.locator('#editor')).toContainText('After');
  await page.keyboard.type('New');
  await expect(page.locator('#editor')).toContainText('Before New');
  await page.evaluate(() => (window as any).editor.run('undo'));
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect(image).toHaveCount(1);
});

test('row height, column width and equal distribution update the live table', async ({ page }) => {
  const table = page.locator('#editor table').first();
  await table.locator('td').first().click();
  await number(page, '행 높이', '2');
  await expect.poll(() => table.locator('tr').first().evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(74);
  await choice(page, '크기를 바꿀 열', '2열');
  await number(page, '열 너비', '6');
  await expect.poll(() => table.locator('td').nth(1).evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(225);
  const width = await table.evaluate(el => el.getBoundingClientRect().width);
  await page.getByRole('button', { name: '열 너비 균등 분배', exact: true }).click();
  await expect.poll(() => table.evaluate(el => { const cells = el.querySelectorAll('td'); return Math.abs(cells[0].getBoundingClientRect().width - cells[1].getBoundingClientRect().width); })).toBeLessThan(1);
  expect(await table.evaluate(el => el.getBoundingClientRect().width)).toBeCloseTo(width, 0);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect(page.getByRole('spinbutton', { name: '열 너비', exact: true })).toHaveValue('6');
  await choice(page, '행 높이 방식', '자동 높이');
  await expect.poll(() => table.locator('tr').first().evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(60);
  await page.screenshot({ path: '/tmp/word-table-dimensions.png', animations: 'disabled' });
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect.poll(() => table.locator('td').nth(1).evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(225);
});

test('crop presets, focal position, undo and reset keep the source image', async ({ page }) => {
  const image = page.locator('#editor img.w-image');
  await image.click();
  await choice(page, '그림 자르기 비율', '정사각형 1:1');
  await expect(image).toHaveCSS('object-fit', 'cover');
  await expect.poll(() => image.evaluate(el => Math.abs(el.getBoundingClientRect().width - el.getBoundingClientRect().height))).toBeLessThan(1);
  await number(page, '자르기 가로 위치', '100');
  await expect(image).toHaveCSS('object-position', '100% 50%');
  await expect(image).toHaveAttribute('src', pixel);
  await page.screenshot({ path: '/tmp/word-image-crop.png', animations: 'disabled' });
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload(); await image.click();
  await expect(image).toHaveCSS('object-position', '100% 50%');
  await choice(page, '그림 자르기 비율', '자르기 해제 · 원래 크기');
  await expect(image).toHaveCSS('object-fit', 'fill');
  await expect.poll(() => image.evaluate(el => el.getBoundingClientRect().width)).toBe(200);
  await expect.poll(() => image.evaluate(el => el.getBoundingClientRect().height)).toBe(100);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect(image).toHaveCSS('object-fit', 'cover');
  await expect(image).toHaveAttribute('src', pixel);
});

test('table dimension label clears the viewport edge and Escape keeps the table unchanged', async ({ page }) => {
  const cell = page.locator('#editor table td').first();
  await cell.scrollIntoViewIfNeeded();
  const box = (await cell.boundingBox())!;
  const table = page.locator('#editor table').first();
  const before = await table.evaluate(el => (window as any).editor.dataStore.getNode(el.getAttribute('data-bc-sid')).attributes);
  await page.mouse.move(box.x + box.width - 1, box.y + 10); await page.mouse.down();
  await page.mouse.move(page.viewportSize()!.width - 2, box.y + 10, { steps: 8 });
  const label = page.locator('.ot-table-resize-guide output');
  await expect(label).toBeVisible();
  const at = (await label.boundingBox())!;
  expect(at.x + at.width).toBeLessThanOrEqual(page.viewportSize()!.width - 8);
  expect(at.y + at.height).toBeLessThanOrEqual(page.viewportSize()!.height - 8);
  await page.screenshot({ path: '../../.dev/artifacts/design-system/table-readout-edge.png' });
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(page.locator('.ot-table-resize-guide')).toBeHidden();
  expect(await table.evaluate(el => (window as any).editor.dataStore.getNode(el.getAttribute('data-bc-sid')).attributes)).toEqual(before);
});
