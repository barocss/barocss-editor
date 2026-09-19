import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/design-system/index.html#search-select'); });

test('single search supports composition, empty results and keyboard selection', async ({ page }) => {
  await page.getByRole('button', { name: '예시 원본 자료', exact: true }).click();
  const query = page.getByRole('combobox', { name: '예시 원본 자료 검색' });
  await query.fill('사용자');
  await query.dispatchEvent('compositionstart');
  await query.press('Enter');
  await expect(query).toBeVisible();
  await query.dispatchEvent('compositionend');
  await query.fill('없음');
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '일치하는 항목' })).toBeVisible();
  await query.fill('조사'); await query.press('Enter');
  await expect(page.getByRole('button', { name: '예시 원본 자료', exact: true })).toHaveText('사용자 조사');
  await expect(query).toHaveCount(0);
});

test('multi selection stays open, skips disabled options, removes tags and respects rejected values', async ({ page }) => {
  const trigger = page.getByRole('button', { name: '예시 프로젝트', exact: true });
  await trigger.click();
  const query = page.getByRole('combobox', { name: '예시 프로젝트 검색' });
  await query.press('ArrowDown'); await query.press('Enter');
  await expect(trigger).toContainText('2개 선택'); await expect(query).toBeVisible();
  await query.press('ArrowDown'); await query.press('Enter');
  await expect(trigger).toContainText('3개 선택');
  await query.press('Escape'); await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: '사용자 조사 제거', exact: true }).click();
  await expect(trigger).toContainText('2개 선택');
  await page.getByRole('checkbox', { name: '선택 저장 실패 예시' }).check();
  await trigger.click(); await page.getByRole('button', { name: '전체 해제', exact: true }).click();
  await expect(trigger).toContainText('2개 선택');
  await expect(page.locator('#search-select').getByRole('alert')).toContainText('기존 선택');
  await page.keyboard.press('Escape');
  await page.getByRole('checkbox', { name: '선택 읽기 전용' }).check();
  await expect(trigger).toBeDisabled();
  await expect(page.getByRole('button', { name: '제품 출시 제거', exact: true })).toHaveCount(0);
});

test('nested search closes before its dialog and fits narrow and dark surfaces', async ({ page }) => {
  for (const width of [390, 560, 1440]) {
    await page.setViewportSize({ width, height: 840 });
    await page.getByRole('button', { name: '자료 선택 창 열기', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '자료 선택', exact: true });
    await dialog.getByRole('button', { name: '창 원본 자료', exact: true }).click();
    const query = page.getByRole('combobox', { name: '창 원본 자료 검색' });
    await expect(query).toBeFocused();
    await query.fill('통합');
    const popup = page.getByRole('dialog', { name: '창 원본 자료 선택', exact: true });
    await expect.poll(async () => { const box = (await popup.boundingBox())!; return box.x + box.width; }).toBeLessThanOrEqual(width - 7);
    await query.press('Escape'); await expect(popup).toHaveCount(0); await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  }
  await page.getByRole('combobox', { name: '시스템 테마' }).click();
  await page.getByRole('option', { name: '어두운 테마', exact: true }).click();
  await page.getByRole('button', { name: '예시 프로젝트', exact: true }).click();
  await expect(page.locator('.office-search-popup')).toHaveCSS('opacity', '1');
  await expect(page.locator('.office-search-popup')).toHaveCSS('background-color', 'rgb(23, 23, 23)');
  await expect(page.locator('.office-search-content')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '../../.dev/artifacts/design-system/search-select-dark.png', animations: 'disabled' });
});
