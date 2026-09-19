import { test, expect, type Page } from '@playwright/test';

async function open(page: Page, name: string) {
  await page.getByRole('tab', { name: '삽입', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('dialog').getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor .w-paragraph').first()).toBeVisible();
  await page.locator('#editor .w-paragraph').first().click();
});
test('create, type in header, return to body and reopen saved header', async ({ page }) => {
  await open(page, '머리글');
  await page.getByRole('textbox', { name: '머리글 내용' }).fill('Report');
  await page.getByRole('button', { name: '만들고 편집' }).click();
  await expect(page.locator('.w-header-source.is-editing')).toBeVisible();
  await expect(page.getByRole('button', { name: '본문으로 돌아가기' })).toBeVisible();
  await page.keyboard.type(' 2026');
  await expect(page.locator('.w-header-source.is-editing')).toContainText('Report 2026');
  await page.getByRole('button', { name: '본문으로 돌아가기' }).click();
  await expect(page.locator('.w-header-source.is-editing')).toHaveCount(0);
  await expect(page.locator('.w-header').first()).toContainText('Report 2026');
  await page.keyboard.type('Body after header');
  await expect(page.locator('.w-surface .w-paragraph').first()).toContainText('Body after header');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('.w-header').first()).toContainText('Report 2026');
  await open(page, '머리글');
  await page.getByRole('button', { name: '문서에서 편집' }).click();
  await expect(page.locator('.w-header-source.is-editing')).toContainText('Report 2026');
  await page.keyboard.press('Escape');
  await expect(page.locator('.w-header-source.is-editing')).toHaveCount(0);
});
test('page numbers use chosen format, persist, and do not duplicate', async ({ page }) => {
  await open(page, '페이지 번호');
  await choose(page, '번호 형식', 'I, II, III');
  await page.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.locator('.w-footer').first()).toContainText('I');
  await open(page, '페이지 번호');
  await choose(page, '번호 형식', 'a, b, c');
  await page.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.locator('.w-footer').first()).toHaveText('a');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('.w-footer').first()).toHaveText('a');
});
test('blank header accepts input and cancel creates nothing', async ({ page }) => {
  await open(page, '머리글');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.locator('.w-header')).toHaveCount(0);
  await open(page, '머리글');
  await page.getByRole('button', { name: '만들고 편집' }).click();
  await expect(page.locator('.w-header-source.is-editing')).toBeVisible();
  await page.keyboard.type('Blank header');
  await expect(page.locator('.w-header-source.is-editing')).toContainText('Blank header');
});

test('first-page header can be created and removed through the dialog', async ({ page }) => {
  await open(page, '머리글');
  await choose(page, '페이지 대상', '첫 페이지');
  await page.getByRole('textbox', { name: '머리글 내용' }).fill('First page');
  await page.getByRole('button', { name: '만들고 편집' }).click();
  await expect(page.locator('.w-header-source.is-editing')).toContainText('First page');
  await page.getByRole('button', { name: '본문으로 돌아가기' }).click();
  await expect(page.locator('.w-header').first()).toContainText('First page');
  await open(page, '머리글');
  await choose(page, '페이지 대상', '첫 페이지');
  await page.getByRole('button', { name: '이 구역에서 제거' }).click();
  await expect(page.locator('.w-header')).toHaveCount(0);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect(page.locator('.w-header').first()).toContainText('First page');
});

test('number dialog fits the viewport and Escape leaves the document unchanged', async ({ page }) => {
  await page.setViewportSize({ width: 1127, height: 850 });
  await open(page, '페이지 번호');
  const dialog = page.getByRole('dialog');
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1127);
  expect(box!.y + box!.height).toBeLessThanOrEqual(850);
  await page.waitForTimeout(250); // Let the shared dialog entrance motion finish.
  await page.screenshot({ path: '/tmp/word-furniture-dialog.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.w-footer')).toHaveCount(0);
});
