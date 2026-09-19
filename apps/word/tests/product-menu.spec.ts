import { test, expect } from '@playwright/test';

test('standalone Word product menu opens local document actions and library', async ({ page }) => {
  await page.goto('/');
  const menu = page.getByRole('menubar', { name: 'Word 제품 메뉴' });
  const trigger = menu.getByRole('menuitem', { name: 'Word', exact: true });
  await trigger.click();
  await page.getByRole('menuitem', { name: '문서 작업', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '문서 작업', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await trigger.focus(); await trigger.press('Enter');
  await page.getByRole('menuitem', { name: '문서 보관함', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '문서 보관함', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await trigger.click(); await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
