import { expect, test } from '@playwright/test';

test('existing resources keep their datasets while new names stay distinct', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-site-save-status]')).toHaveText('저장됨');
  await page.locator('[data-admin-tab="data"]').click();
  const originalNames = await page.locator('[data-admin-data]').evaluateAll(rows =>
    rows.map(row => row.getAttribute('data-admin-data'))
  );
  expect(originalNames.length).toBeGreaterThan(0);

  const add = page.locator('[data-admin-add="data"]');
  await add.click();
  await expect(page.locator('[data-admin-data]')).toHaveCount(originalNames.length + 1);
  await add.click();
  await expect(page.locator('[data-admin-data]')).toHaveCount(originalNames.length + 2);
  const names = await page.locator('[data-admin-data]').evaluateAll(rows =>
    rows.map(row => row.getAttribute('data-admin-data'))
  );
  expect(new Set(names).size).toBe(names.length);
  for (const name of originalNames) expect(names).toContain(name);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
