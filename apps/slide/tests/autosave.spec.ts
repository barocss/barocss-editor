import { test, expect, type Page } from '@playwright/test';
import { openDeck, pickMenu, visibleBoxes } from './helpers';

const saved = (page: Page) => expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
const id = (page: Page) => new URL(page.url()).hash;
const tree = (page: Page) => page.evaluate(() => JSON.stringify((window as any).editor.exportDocument(), (key, value) => key === 'sid' || key === 'metadata' ? undefined : value));
const add = async (page: Page) => {
  await page.getByRole('toolbar', { name: '슬라이드 서식' }).getByRole('menuitem', { name: '슬라이드', exact: true }).click();
  await page.getByRole('menu', { name: '슬라이드', exact: true }).getByRole('menuitem', { name: '새 슬라이드', exact: true }).click();
};

test('autosaves text and preserves the previous deck when starting a template', async ({ page }) => {
  await openDeck(page); await saved(page);
  const originalId = id(page);
  const [box] = await visibleBoxes(page, '.sl-text-frame');
  await page.mouse.dblclick(box.x, box.y);
  await page.keyboard.type('SAVED', { delay: 20 });
  await page.keyboard.press('Escape');
  await saved(page);
  const original = await tree(page);
  expect(original).toContain('SAVED');
  await page.reload(); await saved(page);
  expect(await tree(page)).toBe(original);
  expect(id(page)).toBe(originalId);
  await pickMenu(page, 'file.library.1');
  await page.locator('[data-template="report"]').click();
  await page.locator('[data-template-start]').click();
  await saved(page);
  expect(id(page)).not.toBe(originalId);
  await expect(page.locator('.sl-filmstrip button[data-slide]')).toHaveCount(5);
  await page.getByRole('button', { name: '최근 자료', exact: true }).click();
  await page.locator(`[data-slide-document="${originalId.slice(8)}"]`).getByRole('button').click();
  await saved(page);
  expect(await tree(page)).toBe(original);
});

test('keeps a conflicting tab in a draft and recovers it into a new document', async ({ page, context }) => {
  await openDeck(page); await saved(page);
  const originalUrl = page.url();
  const other = await context.newPage();
  await other.goto(originalUrl); await saved(other);
  await add(page); await saved(page);
  const newer = await tree(page);
  await add(other); await add(other);
  await expect(other.locator('[data-slide-save-status]')).toHaveText('충돌한 초안 보관됨');
  await other.getByRole('button', { name: '최근 자료', exact: true }).click();
  await expect(other.locator('[data-slide-draft]')).toHaveCount(1);
  await other.getByRole('button', { name: '새 자료로 복구' }).click();
  await saved(other);
  expect(other.url()).not.toBe(originalUrl);
  await expect(other.locator('.sl-filmstrip button[data-slide]')).toHaveCount(8);
  await page.reload(); await saved(page);
  expect(await tree(page)).toBe(newer);
});

test('blocks template replacement on write failure and retries the latest edits', async ({ page }) => {
  await openDeck(page); await saved(page);
  const originalId = id(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    (window as any).restoreSlidePut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'documents') throw new DOMException('Test full storage', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await add(page);
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장 실패');
  const pending = await tree(page);
  await pickMenu(page, 'file.library.1');
  await page.locator('[data-template-start]').click();
  await expect(page.getByRole('alert')).toHaveText('새 자료를 열지 못했습니다. 현재 자료의 저장 상태를 확인한 뒤 다시 시도하세요.');
  expect(await tree(page)).toBe(pending);
  expect(id(page)).toBe(originalId);
  await expect(page.locator('.sl-filmstrip button[data-slide]')).toHaveCount(7);
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await page.evaluate(() => (window as any).restoreSlidePut());
  await page.getByRole('button', { name: '저장 다시 시도' }).click();
  await saved(page);
  await page.reload(); await saved(page);
  expect(await tree(page)).toBe(pending);
  await expect(page.locator('.sl-filmstrip button[data-slide]')).toHaveCount(7);
});

test('keeps a missing document URL intact and does not overwrite it with a sample', async ({ page }) => {
  await page.goto('/#slides=missing-deck');
  await expect(page.locator('[data-slide-save-status]')).toHaveText('복원 실패');
  expect(id(page)).toBe('#slides=missing-deck');
  await page.getByRole('button', { name: '최근 자료', exact: true }).click();
  await expect(page.locator('[data-slide-document]')).toHaveCount(0);
});
