import { test, expect } from '@playwright/test';

test('standalone Site exposes its product actions through the shared menu', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('menubar', { name: 'Site 제품 메뉴', exact: true }).getByRole('menuitem', { name: 'Site', exact: true });
  await trigger.click();
  await expect(page.getByRole('menu', { name: 'Site', exact: true }).getByRole('menuitem', { name: '새 사이트', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.focus(); await trigger.press('Enter');
  await expect(page.getByRole('menu', { name: 'Site', exact: true })).toBeVisible();
});
