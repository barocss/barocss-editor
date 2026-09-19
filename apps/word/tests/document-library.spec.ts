import { test, expect } from '@playwright/test';
test('library saves copies, restores across reload and preserves the document being replaced', async ({ page }) => {
 await page.goto('/?sample');

 await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
 const title = page.getByLabel('문서 제목', { exact: true });
 await title.fill('Word library A'); await title.blur();
 await page.getByRole('button', { name: '문서 작업', exact: true }).click();
 await page.getByRole('button', { name: '보관함에 사본 저장' }).click();
 await expect(page.getByRole('status').filter({ hasText: '보관함에 저장됨' })).toBeVisible();
 await page.reload(); await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨'); await page.getByRole('button', { name: '문서 보관함', exact: true }).click();
 await page.getByRole('button', { name: 'Word library A 열기', exact: true }).first().click();
 await expect(page.getByRole('dialog', { name: '문서 보관함', exact: true })).toBeHidden();
 await expect(title).toHaveValue('Word library A');
 await title.fill('Word library B'); await title.blur();
 await page.getByRole('button', { name: '문서 보관함', exact: true }).click();

 await page.getByRole('button', { name: 'Word library A 열기', exact: true }).first().click();
 await expect(page.getByRole('dialog', { name: '문서 보관함', exact: true })).toBeHidden();
 await expect(title).toHaveValue('Word library A');
 await page.getByRole('button', { name: '문서 보관함', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Word library B 열기', exact: true }).first()).toBeVisible();
});
