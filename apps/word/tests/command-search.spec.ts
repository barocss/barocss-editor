import { expect, test } from '@playwright/test';
import { placeCaret } from './helpers';

test('command search restores the selected text, formats it and opens authoring at the saved range', async ({ page }) => {
  await page.goto('/'); await placeCaret(page, '.w-paragraph');
  await page.keyboard.type('Command target'); await page.keyboard.press('Shift+Home');
  await page.getByRole('button', { name: '명령 검색', exact: true }).click();
  const query = page.getByRole('combobox', { name: '명령 검색어' });
  await query.fill('굵게'); await query.press('Enter');
  await expect(page.locator('[data-control="bold"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.w-document')).not.toContainText('굵게');
  await page.getByRole('button', { name: '명령 검색', exact: true }).click();
  await query.fill('실행 취소'); await query.press('Enter');
  await expect(page.locator('[data-control="bold"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.w-document')).toContainText('Command target');
  await page.getByRole('button', { name: '명령 검색', exact: true }).click();
  await query.fill('링크 편집'); await query.press('Enter');
  const link = page.getByRole('dialog', { name: '링크 편집', exact: true });
  await expect(link).toBeVisible();
  await link.getByLabel('링크 주소').fill('https://example.com/command');
  await link.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.locator('.w-document a[href="https://example.com/command"]')).toContainText('Command target');
  await page.getByRole('button', { name: '명령 검색', exact: true }).click();
  await query.fill('다시 실행');
  await expect(page.getByRole('option')).toHaveAttribute('aria-disabled', 'true');
  await query.press('Enter'); await expect(query).toBeVisible();
  await page.screenshot({ path: '../../.dev/artifacts/design-system/command-search-word.png', animations: 'disabled' });
});
