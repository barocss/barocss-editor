import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const products = ['Slides', 'Word', 'Site'] as const;
type Product = typeof products[number];
const key = (product: Product) => product.toLowerCase();
const status = (page: Page, product: Product) => page.locator(`[data-${product === 'Slides' ? 'slide' : key(product)}-save-status]`);
const dialog = (page: Page, product: Product) => page.getByRole('dialog', { name: product === 'Slides' ? '최근 발표 자료' : product === 'Word' ? '문서 보관함' : '최근 사이트' });
const library = (page: Page, product: Product) => page.getByRole('button', { name: product === 'Word' ? '문서 보관함' : '최근 자료', exact: true });
async function create(page: Page, product: Product, title: string) {
  await page.goto('/');
  await page.getByRole('button', { name: `${product[0]} ${product} 새 자료 만들기`, exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름' }).fill(title);
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(status(page, product)).toHaveText('저장됨');
  return page.url();
}
async function moveToTrash(page: Page, title: string) {
  await page.goto('/');
  await page.getByRole('button', { name: `${title} 관리`, exact: true }).click();
  await page.getByRole('button', { name: '휴지통으로 이동', exact: true }).click();
  await expect(page.getByRole('button', { name: `${title} 관리`, exact: true })).toHaveCount(0);
}
async function current(page: Page) {
  return { url: page.url(), title: await page.title(), content: await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument())) };
}
async function preserved(page: Page, product: Product, before: Awaited<ReturnType<typeof current>>) {
  expect(await current(page)).toEqual(before);
  await expect(status(page, product)).toHaveText('저장됨');
  await expect(page.getByRole('button', { name: '복원 다시 시도', exact: true })).toHaveCount(0);
}
async function backup(page: Page, id: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '보관함 전체 백업', exact: true }).click();
  const value = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(value.documents.some((entry: { row: { name: string } }) => entry.row.name === id)).toBe(true);
  expect(value.drafts.some((entry: { row: { name: string } }) => entry.row.name === id)).toBe(false);
}
for (const product of products) {
  test(`${product} excludes already trashed documents from the ordinary library`, async ({ page, context }) => {
    const title = `${product} 숨길 A`;
    await create(page, product, title);
    await create(page, product, `${product} 현재 B`);
    const before = await current(page);
    const other = await context.newPage();
    await moveToTrash(other, title);
    await library(page, product).click();
    await expect(dialog(page, product)).toBeVisible();
    await expect(dialog(page, product).getByRole('button', { name: `${title} 열기`, exact: true })).toHaveCount(0);
    await preserved(page, product, before);
  });
  test(`${product} rejects a stale cross-tab trash target, preserves B, backs up A, and opens restored A's same ID`, async ({ page, context }) => {
    const title = `${product} 휴지통 A`;
    const aUrl = await create(page, product, title);
    const aId = new URL(aUrl).hash.slice(`#${key(product)}=`.length);
    await create(page, product, `${product} 보존 B`);
    const before = await current(page);
    await library(page, product).click();
    const target = dialog(page, product).getByRole('button', { name: `${title} 열기`, exact: true });
    await expect(target).toBeVisible();
    const other = await context.newPage();
    await moveToTrash(other, title);
    await target.click();
    await expect(dialog(page, product)).toContainText(`“${title}”는 휴지통에 있습니다. 자료함에서 복원한 뒤 다시 여세요.`);
    await expect(target).toHaveCount(0);
    await preserved(page, product, before);
    await backup(page, aId);
    await other.getByRole('button', { name: '휴지통', exact: true }).click();
    await other.getByRole('button', { name: `${title} 관리`, exact: true }).click();
    await other.getByRole('button', { name: '복원', exact: true }).click();
    await page.keyboard.press('Escape');
    await library(page, product).click();
    await dialog(page, product).getByRole('button', { name: `${title} 열기`, exact: true }).click();
    await expect(status(page, product)).toHaveText('저장됨');
    expect(page.url()).toBe(aUrl);
    expect(new URL(page.url()).hash).toBe(`#${key(product)}=${aId}`);
    expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toContain(title);
  });
  test(`${product} retries a temporary read failure against the same A and preserves B`, async ({ page }) => {
    const title = `${product} 재시도 A`;
    const aUrl = await create(page, product, title);
    const aId = new URL(aUrl).hash.slice(`#${key(product)}=`.length);
    await create(page, product, `${product} 계속 편집 B`);
    const before = await current(page);
    await library(page, product).click();
    const target = dialog(page, product).getByRole('button', { name: `${title} 열기`, exact: true });
    await page.evaluate(id => {
      const original = IDBObjectStore.prototype.get;
      (window as any).restoreRead = () => { IDBObjectStore.prototype.get = original; };
      IDBObjectStore.prototype.get = function (idToRead) {
        if (this.name === 'documents' && idToRead === id) throw new DOMException('Temporary read failure', 'UnknownError');
        return original.call(this, idToRead);
      };
    }, aId);
    await target.click();
    await expect(dialog(page, product)).toContainText(`“${title}”를 열지 못했습니다.`);
    await preserved(page, product, before);
    await expect(target).toBeVisible();
    await page.evaluate(() => (window as any).restoreRead());
    await target.click();
    await expect(status(page, product)).toHaveText('저장됨');
    expect(page.url()).toBe(aUrl);
    expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toContain(title);
  });
}
test('Slides keyboard focus stays inside the dialog after rejecting and removing a trash row', async ({ page, context }) => {
  const title = 'Slides 키보드 A';
  await create(page, 'Slides', title);
  await create(page, 'Slides', 'Slides 키보드 B');
  await library(page, 'Slides').click();
  const target = dialog(page, 'Slides').getByRole('button', { name: `${title} 열기`, exact: true });
  await target.focus();
  const other = await context.newPage();
  await moveToTrash(other, title);
  await page.keyboard.press('Enter');
  await expect(dialog(page, 'Slides')).toContainText(`“${title}”는 휴지통에 있습니다.`);
  await expect(target).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.matches('[role="dialog"] button:not(:disabled)'))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement?.matches('[role="dialog"] button:not(:disabled)'))).toBe(true);
});
