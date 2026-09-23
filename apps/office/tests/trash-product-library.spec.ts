import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function createSlides(page: Page, title: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'S Slides 새 자료 만들기', exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름' }).fill(title);
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  return page.url();
}

async function createProduct(page: Page, product: 'Word' | 'Site', title: string) {
  await page.goto('/');
  await page.getByRole('button', { name: `${product[0]} ${product} 새 자료 만들기`, exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름' }).fill(title);
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page.locator(`[data-${product.toLowerCase()}-save-status]`)).toHaveText('저장됨');
  return page.url();
}

test('a stale Slides library rejects a trashed target without changing the open deck', async ({ page, context }) => {
  const aUrl = await createSlides(page, '휴지통 대상 A');
  const aId = new URL(aUrl).hash.slice('#slides='.length);
  const bUrl = await createSlides(page, '현재 자료 B');
  const bTitle = await page.title();
  const bDocument = await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));

  await page.getByRole('button', { name: '최근 자료', exact: true }).click();
  const stale = page.locator(`[data-slide-document="${aId}"]`);
  await expect(stale.getByRole('button', { name: '휴지통 대상 A 열기' })).toBeVisible();

  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: '휴지통 대상 A 관리' }).click();
  await other.getByRole('button', { name: '휴지통으로 이동' }).click();
  await expect(other.getByRole('button', { name: '휴지통 대상 A 관리' })).toHaveCount(0);

  await stale.getByRole('button', { name: '휴지통 대상 A 열기' }).click();
  await expect(page.getByRole('dialog', { name: '최근 발표 자료' })).toContainText('“휴지통 대상 A”는 휴지통에 있습니다. 자료함에서 복원한 뒤 다시 여세요.');
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  expect(page.url()).toBe(bUrl);
  expect(await page.title()).toBe(bTitle);
  expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(bDocument);
  await expect(stale).toHaveCount(0);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '보관함 전체 백업' }).click();
  const backup = JSON.parse((await readFile((await (await download).path())!)).toString());
  expect(backup.documents.some((entry: { row: { name: string } }) => entry.row.name === aId)).toBe(true);

  await other.getByRole('button', { name: '휴지통', exact: true }).click();
  await other.getByRole('button', { name: '휴지통 대상 A 관리' }).click();
  await other.getByRole('button', { name: '복원', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '최근 자료', exact: true }).click();
  await page.locator(`[data-slide-document="${aId}"]`).getByRole('button', { name: '휴지통 대상 A 열기' }).click();
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  expect(page.url()).toBe(aUrl);
});

test('a temporary read failure keeps the target in the Slides library for a retry', async ({ page }) => {
  const aUrl = await createSlides(page, '다시 열 대상 A');
  const aId = new URL(aUrl).hash.slice('#slides='.length);
  const bUrl = await createSlides(page, '계속 편집할 B');
  const bDocument = await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
  await page.getByRole('button', { name: '최근 자료', exact: true }).click();
  const target = page.locator(`[data-slide-document="${aId}"]`).getByRole('button', { name: '다시 열 대상 A 열기' });
  await page.evaluate(id => {
    const original = IDBObjectStore.prototype.get;
    (window as any).restoreRead = () => { IDBObjectStore.prototype.get = original; };
    IDBObjectStore.prototype.get = function (key) {
      if (this.name === 'documents' && key === id) throw new DOMException('Temporary read failure', 'UnknownError');
      return original.call(this, key);
    };
  }, aId);
  await target.click();
  await expect(page.getByRole('dialog', { name: '최근 발표 자료' })).toContainText('“다시 열 대상 A”를 열지 못했습니다. 현재 자료는 유지됩니다.');
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  expect(page.url()).toBe(bUrl);
  expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(bDocument);
  await expect(target).toBeVisible();
  await page.evaluate(() => (window as any).restoreRead());
  await target.click();
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  expect(page.url()).toBe(aUrl);
});

test('keyboard focus stays in the dialog after a trashed row is removed', async ({ page, context }) => {
  const aUrl = await createSlides(page, '키보드 대상 A');
  const aId = new URL(aUrl).hash.slice('#slides='.length);
  await createSlides(page, '키보드 현재 B');
  await page.getByRole('button', { name: '최근 자료', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '최근 발표 자료' });
  const target = page.locator(`[data-slide-document="${aId}"]`).getByRole('button', { name: '키보드 대상 A 열기' });
  await target.focus();
  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: '키보드 대상 A 관리' }).click();
  await other.getByRole('button', { name: '휴지통으로 이동' }).click();
  await page.keyboard.press('Enter');
  await expect(dialog).toContainText('“키보드 대상 A”는 휴지통에 있습니다.');
  await expect(target).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.matches('[role="dialog"] button:not(:disabled)'))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement?.matches('[role="dialog"] button:not(:disabled)'))).toBe(true);
});

for (const product of ['Word', 'Site'] as const) {
  test(`${product} rejects a stale trashed row and refreshes its product library`, async ({ page, context }) => {
    const aUrl = await createProduct(page, product, `${product} 휴지통 대상`);
    const bUrl = await createProduct(page, product, `${product} 현재 자료`);
    await page.getByRole('button', { name: product === 'Word' ? '문서 보관함' : '최근 자료', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: product === 'Word' ? '문서 보관함' : '최근 사이트' });
    await expect(dialog.getByRole('button', { name: `${product} 휴지통 대상 열기` })).toBeVisible();
    const other = await context.newPage();
    await other.goto('/');
    await other.getByRole('button', { name: `${product} 휴지통 대상 관리` }).click();
    await other.getByRole('button', { name: '휴지통으로 이동' }).click();

    await dialog.getByRole('button', { name: `${product} 휴지통 대상 열기` }).click();
    await expect(dialog).toContainText(`“${product} 휴지통 대상”는 휴지통에 있습니다. 자료함에서 복원한 뒤 다시 여세요.`);
    await expect(dialog.getByRole('button', { name: `${product} 휴지통 대상 열기` })).toHaveCount(0);
    await expect(dialog).toContainText(`${product} 현재 자료`);
    await expect(page.locator(`[data-${product.toLowerCase()}-save-status]`)).toHaveText('저장됨');
    expect(page.url()).toBe(bUrl);

    await other.getByRole('button', { name: '휴지통', exact: true }).click();
    await other.getByRole('button', { name: `${product} 휴지통 대상 관리` }).click();
    await other.getByRole('button', { name: '복원', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: product === 'Word' ? '문서 보관함' : '최근 자료', exact: true }).click();
    await expect(page.getByRole('dialog', { name: product === 'Word' ? '문서 보관함' : '최근 사이트' })).toContainText(`${product} 휴지통 대상`);
    expect(aUrl).not.toBe(bUrl);
  });
}
