import { test, expect } from '@playwright/test';

test('standalone Note exposes its product actions through the shared menu', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('menubar', { name: 'Note 제품 메뉴', exact: true }).getByRole('menuitem', { name: 'Note', exact: true });
  await trigger.click();
  await expect(page.getByRole('menu', { name: 'Note', exact: true }).getByRole('menuitem', { name: '새 페이지', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.focus(); await trigger.press('Enter');
  await expect(page.getByRole('menu', { name: 'Note', exact: true })).toBeVisible();
});
