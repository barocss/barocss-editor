import { test, expect, type Page } from '@playwright/test';

const saved = (page: Page) => expect(page.locator('[data-site-save-status]')).toHaveText('저장됨');
const ready = async (page: Page) => { await page.goto('/'); await saved(page); };
const newSite = async (page: Page) => {
  await page.getByRole('menuitem', { name: '파일', exact: true }).click();
  await page.getByRole('menuitem', { name: '새 사이트', exact: true }).click();
};
const rename = async (page: Page, value: string) => {
  await page.getByRole('textbox', { name: '홈 이름', exact: true }).fill(value);
  await page.getByRole('heading', { name: /페이지/ }).click();
  await saved(page);
};

test('saves page edits, reopens the same ID, and preserves the previous site when creating another', async ({ page }) => {
  await ready(page);
  const url = page.url(), originalId = new URL(url).hash.slice(6);
  await rename(page, 'Wonffice 홈');
  await page.reload(); await saved(page);
  await expect(page.getByRole('textbox', { name: 'Wonffice 홈 이름', exact: true })).toHaveValue('Wonffice 홈');
  await newSite(page); await saved(page);
  expect(page.url()).not.toBe(url);
  await page.getByRole('button', { name: '최근 자료', exact: true }).click();
  await page.locator(`[data-site-document="${originalId}"]`).getByRole('button').click();
  await saved(page);
  expect(page.url()).toBe(url);
  await expect(page.getByRole('textbox', { name: 'Wonffice 홈 이름', exact: true })).toHaveValue('Wonffice 홈');
});

test('stores conflicts separately and recovers a copy without replacing the newer original', async ({ page, context }) => {
  await ready(page);
  const url = page.url();
  const other = await context.newPage(); await other.goto(url); await saved(other);
  await rename(page, '새 원본');
  await other.getByRole('textbox', { name: '홈 이름', exact: true }).fill('충돌한 작업');
  await other.getByRole('heading', { name: /페이지/ }).click();
  await expect(other.locator('[data-site-save-status]')).toHaveText('충돌한 초안 보관됨');
  await other.getByRole('button', { name: '최근 자료', exact: true }).click();
  await other.getByRole('button', { name: '새 자료로 복구' }).click(); await saved(other);
  expect(other.url()).not.toBe(url);
  await expect(other.getByRole('textbox', { name: '충돌한 작업 이름', exact: true })).toBeVisible();
  await page.reload(); await saved(page);
  await expect(page.getByRole('textbox', { name: '새 원본 이름', exact: true })).toBeVisible();
});

test('blocks replacement on storage failure and retries the retained snapshot', async ({ page }) => {
  await ready(page); const url = page.url();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    (window as any).restorePut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'documents') throw new DOMException('Test full storage', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.getByRole('textbox', { name: '홈 이름', exact: true }).fill('보존할 작업');
  await page.getByRole('heading', { name: /페이지/ }).click();
  await expect(page.locator('[data-site-save-status]')).toHaveText('저장 실패');
  await page.getByRole('button', { name: '최근 자료', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('현재 자료의 저장을 확인하지 못했습니다');
  await expect(page.locator('[data-site-save-status]')).toHaveText('저장 실패');
  await page.keyboard.press('Escape');
  await newSite(page);
  await expect(page.getByRole('alert')).toContainText('현재 자료를 저장하지 못했습니다');
  expect(page.url()).toBe(url);
  await page.evaluate(() => (window as any).restorePut());
  await page.getByRole('button', { name: '저장 다시 시도' }).click(); await saved(page);
  await page.reload(); await saved(page);
  await expect(page.getByRole('textbox', { name: '보존할 작업 이름', exact: true })).toBeVisible();
});

test('does not overwrite a missing site with the sample', async ({ page }) => {
  await page.goto('/#site=missing-site');
  await expect(page.locator('[data-site-save-status]')).toHaveText('복원 실패');
  await page.getByRole('button', { name: '최근 자료', exact: true }).click();
  await expect(page.locator('[data-site-document]')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('#site=missing-site');
});

test('keeps the saved site when opening another site fails during model replacement', async ({ page }) => {
  await ready(page);
  const currentUrl = page.url();
  const currentId = new URL(currentUrl).hash.slice(6);
  await rename(page, '보존할 사이트');
  await newSite(page); await saved(page);
  const targetId = new URL(page.url()).hash.slice(6);
  await rename(page, '열 대상 사이트');
  await page.getByRole('button', { name: '최근 자료', exact: true }).click();
  await page.locator(`[data-site-document="${currentId}"]`).getByRole('button').click();
  await saved(page);

  await page.evaluate(() => {
    const editor = (window as any).editor;
    const store = editor.dataStore;
    const setNode = store.setNode.bind(store);
    let calls = 0;
    store.setNode = (...args: unknown[]) => {
      setNode(...args);
      if (++calls === 2) throw new Error('Injected partial load failure');
    };
    (window as any).restoreSetNode = () => { store.setNode = setNode; };
  });
  await page.getByRole('button', { name: '최근 자료', exact: true }).click();
  await page.locator(`[data-site-document="${targetId}"]`).getByRole('button').click();
  await expect(page.locator('[data-site-save-status]')).toHaveText('복구 필요');
  expect(page.url()).toBe(currentUrl);
  await page.evaluate(() => (window as any).restoreSetNode());
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '보관함 전체 백업' })).toBeDisabled();
  await expect(dialog.locator(`[data-site-document="${targetId}"]`).getByRole('button')).toBeDisabled();
  const reopen = dialog.getByRole('button', { name: '저장본 다시 열기' });
  await expect(reopen).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(modal => modal.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(reopen).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog.getByText('현재 화면의 저장되지 않은 내용이 사라집니다')).toBeVisible();
  const confirm = dialog.getByRole('button', { name: '화면 버리고 저장본 열기' });
  await confirm.focus();
  await page.keyboard.press('Enter');
  await saved(page);
  await expect(page.getByRole('textbox', { name: '보존할 사이트 이름', exact: true })).toHaveValue('보존할 사이트');
  await page.reload(); await saved(page);
  await expect(page.getByRole('textbox', { name: '보존할 사이트 이름', exact: true })).toHaveValue('보존할 사이트');
});

test('autosaves the final input from an embedded Note before reload', async ({ page }) => {
  await ready(page);
  await page.locator('[data-admin-tab="data"]').click();
  await page.locator('[data-admin-open]').last().click();
  await page.locator('[data-row-open]').first().click();
  const body = page.locator('[data-field="본문"] [data-note-body]');
  await body.locator('p').first().click();
  await page.keyboard.press('End'); await page.keyboard.insertText(' SITE-AUTOSAVE-FINAL');
  await saved(page);
  await page.reload(); await saved(page);
  await page.locator('[data-admin-tab="data"]').click();
  await page.locator('[data-admin-open]').last().click();
  await page.locator('[data-row-open]').first().click();
  await expect(body).toContainText('SITE-AUTOSAVE-FINAL');
});
