import { test, expect } from '@playwright/test';

test('standalone Slides exposes its product actions through the shared menu', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('menubar', { name: 'Slides 제품 메뉴', exact: true }).getByRole('menuitem', { name: 'Slides', exact: true });
  await trigger.click();
  await expect(page.getByRole('menu', { name: 'Slides', exact: true }).getByRole('menuitem', { name: '덱 라이브러리', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.focus(); await trigger.press('Enter');
  await expect(page.getByRole('menu', { name: 'Slides', exact: true })).toBeVisible();
});
