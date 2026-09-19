import { expect, test, type Page } from '@playwright/test';

const query = (page: Page) => page.getByRole('combobox', { name: '명령 검색어' });
const open = (page: Page) => page.getByRole('button', { name: '명령 검색', exact: true }).click();
async function run(page: Page, name: string) {
  await open(page); await query(page).fill(name); await query(page).press('Enter');
  await expect(query(page)).toHaveCount(0);
}
const documentText = (page: Page) => page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));

test('search follows the current page and preserves selection for duplicate and undo', async ({ page }) => {
  await page.goto('/'); await page.locator('[data-admin-open]').nth(1).click();
  await expect(page.locator('[data-frame="desktop"] .st-page')).toBeVisible();
  await open(page); await query(page).fill('셀 합치기');
  await expect(page.getByRole('option')).toHaveAttribute('aria-disabled', 'true');
  await query(page).press('Enter'); await expect(query(page)).toBeVisible();
  await query(page).fill('insertHeading');
  const before = await documentText(page);
  await query(page).dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(query(page)).toBeVisible(); expect(await documentText(page)).toBe(before);
  await query(page).press('Enter');
  await expect.poll(() => documentText(page)).not.toBe(before);
  const inserted = await documentText(page);
  const selected = await page.evaluate(() => (window as any).editor.selection);
  expect(selected.nodeIds).toHaveLength(1);
  await expect(page.locator(`[data-frame="desktop"] [data-bc-sid="${selected.nodeIds[0]}"]`).first()).toBeAttached();
  await run(page, 'duplicateBlocks');
  await expect.poll(() => documentText(page)).not.toBe(inserted);
  await run(page, '실행 취소');
  await expect.poll(() => documentText(page)).toBe(inserted);
  const selection = await page.evaluate(() => { (window as any).searchReturnFocus = document.activeElement; return (window as any).editor.selection; });
  await open(page); await expect(page.getByRole('option').first()).toContainText('최근 사용');
  await query(page).fill('insertHeading');
  await query(page).press('ControlOrMeta+z');
  expect(await documentText(page)).toBe(inserted);
  await query(page).press('Escape'); await expect(query(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement === (window as any).searchReturnFocus)).toBe(true);
  expect(await page.evaluate(() => (window as any).editor.selection)).toEqual(selection);
});

test('management and writing mode expose the right commands; export uses existing output UI', async ({ page }) => {
  await page.goto('/'); await open(page); await query(page).fill('insertHeading');
  await expect(page.getByText('일치하는 명령이 없습니다.')).toBeVisible();
  await query(page).press('Escape');
  await page.locator('[data-admin-open]').first().click();
  await run(page, '글 고치기');
  await open(page); await query(page).fill('insertHeading');
  await expect(page.getByRole('option')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('option')).toContainText('글 고치기 모드');
  await query(page).press('Escape'); await run(page, '글 고치기');
  await open(page); await query(page).fill('insertHeading');
  await expect(page.getByRole('option')).not.toHaveAttribute('aria-disabled', 'true');
  await query(page).press('Escape');
  const download = page.waitForEvent('download'); await run(page, '이 페이지 내보내기');
  expect((await download).suggestedFilename()).toBe('index.html');
  await expect(page.getByRole('complementary', { name: '사이트 출력 상태' })).toContainText('사이트 다운로드 요청됨');
  await page.setViewportSize({ width: 390, height: 840 });
  await open(page); await query(page).fill('페이지');
  const dialog = page.getByRole('dialog', { name: '명령 검색', exact: true });
  await expect(dialog).toHaveCSS('opacity', '1');
  const box = (await dialog.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '../../.dev/artifacts/design-system/command-search-site-mobile.png' });
});

test('search refuses a command captured from a replaced document', async ({ page }) => {
  await page.goto('/'); await page.locator('[data-admin-open]').first().click();
  await open(page); await query(page).fill('insertHeading');
  await page.evaluate(() => {
    const ed = (window as any).editor, replacement = ed.exportDocument();
    delete replacement.sid; ed.loadDocument(replacement, 'site');
  });
  const before = await documentText(page);
  await query(page).press('Enter');
  await expect(page.getByRole('complementary', { name: '명령 실행 상태' })).toContainText('문서 또는 편집 화면이 변경되었습니다.');
  expect(await documentText(page)).toBe(before);
});
