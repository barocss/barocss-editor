import { test, expect } from '@playwright/test';

test.use({ screenshot: 'only-on-failure', trace: 'retain-on-failure' });
test.describe.configure({ retries: 0 });

for (const action of ['문서 보관함', '문서 작업'] as const) for (const closing of ['Escape', 'button'] as const) {
  test(`document menu ${action} restores its trigger after ${closing}`, async ({ page }) => {
    await page.goto('/?sample');
    await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
    const trigger = page.locator('.office-document-menu [data-menu]');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: action, exact: true }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: action, exact: true });
    await expect(dialog).toBeVisible();
    if (action === '문서 보관함') await expect(dialog.getByRole('searchbox', { name: '보관함에서 찾기' })).toBeEnabled();
    else await expect(dialog.getByRole('button', { name: '보관함에 사본 저장', exact: true })).toBeEnabled();
    if (closing === 'button') {
      await dialog.getByRole('button', { name: '닫기', exact: true }).focus();
      await page.keyboard.press('Enter');
    } else await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
