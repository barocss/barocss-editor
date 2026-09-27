import { test, expect } from '@playwright/test';
test('autosave restores identity, protects newer writes and recovers a conflicting draft', async ({ page }) => {
 await page.goto('/?sample'); const status = page.locator('[data-word-save-status]');
 await expect(status).toHaveText('저장됨');
 const title = page.getByLabel('문서 제목', { exact: true }); await title.fill('자동 저장 A'); await title.blur();
 await expect(status).toHaveText('저장됨'); const url = page.url(); await page.reload();
 await expect(title).toHaveValue('자동 저장 A'); await expect(status).toHaveText('저장됨');
 const other = await page.context().newPage(); await other.goto(url); await expect(other.getByLabel('문서 제목', { exact: true })).toHaveValue('자동 저장 A');
 await title.fill('최신 원본'); await title.blur(); await expect(status).toHaveText('저장됨');
 await other.getByLabel('문서 제목', { exact: true }).fill('충돌한 작업'); await other.getByLabel('문서 제목', { exact: true }).blur();
 await expect(other.locator('[data-word-save-status]')).toHaveText('충돌한 초안 보관됨');
 await other.reload(); await expect(other.getByLabel('문서 제목', { exact: true })).toHaveValue('최신 원본');
 await other.getByRole('button', { name: '문서 보관함', exact: true }).click();
 await other.getByRole('button', { name: '충돌한 작업 초안 복구', exact: true }).click();
 await expect(other.getByLabel('문서 제목', { exact: true })).toHaveValue('충돌한 작업'); expect(other.url()).not.toBe(url);
 await page.reload(); await expect(title).toHaveValue('최신 원본'); await other.close();
});
test('failed automatic saves stay pending and retry without losing text', async ({ page }) => {
 await page.goto('/?sample'); const status = page.locator('[data-word-save-status]'); await expect(status).toHaveText('저장됨');
 await page.evaluate(() => {
  const original = IDBObjectStore.prototype.put;
  (window as any).restore = () => { IDBObjectStore.prototype.put = original; };
  IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) { if (this.transaction.db.name === 'barocss-word') throw new DOMException('Full', 'QuotaExceededError'); return original.apply(this, args); };
 });
 await page.getByLabel('문서 제목', { exact: true }).fill('실패 후 복원'); await page.getByLabel('문서 제목', { exact: true }).blur();
 await expect(status).toHaveText('저장 실패'); await expect(page.getByLabel('문서 제목', { exact: true })).toHaveValue('실패 후 복원');
 await page.evaluate(() => (window as any).restore()); await page.getByRole('button', { name: '저장 다시 시도' }).click();
 await expect(status).toHaveText('저장됨'); await page.reload(); await expect(page.getByLabel('문서 제목', { exact: true })).toHaveValue('실패 후 복원');
});

test('stops saving after a partial document load and reopens the current saved Word document', async ({ page }) => {
 await page.goto('/?sample');
 const status = page.locator('[data-word-save-status]');
 await expect(status).toHaveText('저장됨');
 const title = page.getByLabel('문서 제목', { exact: true });
 await title.fill('Word 열 대상 A'); await title.blur(); await expect(status).toHaveText('저장됨');
 await page.getByRole('button', { name: '문서 작업', exact: true }).click();
 await page.getByRole('button', { name: '보관함에 사본 저장' }).click();
 await expect(page.getByRole('status').filter({ hasText: '보관함에 저장됨' })).toBeVisible();
 await page.keyboard.press('Escape');
 await title.fill('Word 보존할 B'); await title.blur(); await expect(status).toHaveText('저장됨');
 const currentUrl = page.url();

 await page.evaluate(() => {
  const store = (window as any).editor.dataStore;
  const setNode = store.setNode.bind(store);
  let calls = 0;
  store.setNode = (...args: unknown[]) => {
   setNode(...args);
   if (++calls === 2) throw new Error('Injected partial load failure');
  };
  (window as any).restoreSetNode = () => { store.setNode = setNode; };
 });
 await page.getByRole('button', { name: '문서 보관함', exact: true }).click();
 const dialog = page.getByRole('dialog', { name: '문서 보관함', exact: true });
 await dialog.getByRole('button', { name: 'Word 열 대상 A 열기', exact: true }).first().click();
 await expect(status).toHaveText('복구 필요');
 expect(page.url()).toBe(currentUrl);
 await page.evaluate(() => (window as any).restoreSetNode());
 await expect(dialog.getByRole('button', { name: '보관함 전체 백업' })).toBeDisabled();
 await expect(dialog.getByRole('button', { name: 'Word 열 대상 A 열기', exact: true }).first()).toBeDisabled();
 const reopen = dialog.getByRole('button', { name: '저장본 다시 열기' });
 await expect(reopen).toBeFocused();
 await reopen.click();
 await expect(dialog.getByText('현재 화면의 저장되지 않은 내용이 사라집니다')).toBeVisible();
 await dialog.getByRole('button', { name: '화면 버리고 저장본 열기' }).click();
 await expect(status).toHaveText('저장됨');
 await expect(title).toHaveValue('Word 보존할 B');
 await page.reload(); await expect(status).toHaveText('저장됨');
 await expect(title).toHaveValue('Word 보존할 B');
});
