import { test, expect } from '@playwright/test';

test.use({ screenshot: 'only-on-failure', trace: 'retain-on-failure' });
test.describe.configure({ retries: 0 });

for (const closing of ['Escape', 'button'] as const) {
  test(`document library restores its trigger after ${closing}`, async ({ page }) => {
    await page.goto('/?sample');
    await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
    const trigger = page.getByRole('button', { name: '문서 보관함', exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '문서 보관함', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('searchbox', { name: '보관함에서 찾기' })).toBeEnabled();
    if (closing === 'button') {
      await dialog.getByRole('button', { name: '닫기', exact: true }).focus();
      await page.keyboard.press('Enter');
    } else await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
