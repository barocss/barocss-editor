import { test, expect } from '@playwright/test';

test('standalone Word document menu opens local document actions and library', async ({ page }) => {
  await page.goto('/');
  const menu = page.getByRole('menubar', { name: '문서 메뉴' });
  const trigger = menu.getByRole('menuitem', { name: '문서 메뉴', exact: true });
  await expect(page.getByRole('menubar', { name: 'Word 제품 메뉴' })).toHaveCount(0);
  await trigger.click();
  await page.getByRole('menuitem', { name: '문서 작업', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '문서 작업', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '문서 작업', exact: true })).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.focus(); await trigger.press('Enter');
  await page.getByRole('menuitem', { name: '문서 보관함', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '문서 보관함', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '문서 보관함', exact: true }).getByRole('button', { name: '보관함 전체 백업', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '문서 보관함', exact: true })).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click(); await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
