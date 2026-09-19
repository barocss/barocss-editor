import { test, expect } from '@playwright/test';

test('initial read failure offers retry instead of endless loading or an empty library', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function(...args: Parameters<typeof original>) {
      IDBObjectStore.prototype.getAll = original;
      throw new Error('Test: storage unavailable');
    };
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('자료를 불러오는 중입니다.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('여기에서 일을 시작하세요.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('여기에서 일을 시작하세요.', { exact: true })).toBeVisible();
});

test('empty search and filtered views provide a way back to all materials', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('여기에서 일을 시작하세요.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '자료 검색' }).fill('찾을 수 없는 자료');
  await expect(page.getByText('검색 결과가 없습니다.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '전체 자료 보기', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '자료 검색' })).toHaveValue('');
  await page.getByRole('button', { name: '즐겨찾기', exact: true }).click();
  await expect(page.getByText('즐겨찾는 자료가 없습니다.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '전체 자료 보기', exact: true }).click();
  await page.getByRole('button', { name: '휴지통', exact: true }).click();
  await expect(page.getByText('휴지통이 비어 있습니다.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '자료 검색' }).fill('휴지통 검색');
  await page.getByRole('button', { name: '전체 자료 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '전체 자료', exact: true })).toBeVisible();
  await page.screenshot({ path: '../../.dev/artifacts/design-system/workspace-empty.png', animations: 'disabled' });
});
