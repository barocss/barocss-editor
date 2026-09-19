import { expect, test, type Page } from '@playwright/test';
import { openDeck, currentSlide } from './helpers';

const query = (page: Page) => page.getByRole('combobox', { name: '명령 검색어' });
const openSearch = (page: Page) => page.getByRole('button', { name: '명령 검색', exact: true }).click();
async function run(page: Page, text: string) {
  await openSearch(page); await query(page).fill(text); await query(page).press('Enter');
  await expect(query(page)).toHaveCount(0);
}
const children = (page: Page, sid: string) => page.evaluate(id => (window as any).editor.dataStore.getNode(id).content.length, sid);

test('search inserts on the current slide and preserves object selection for duplicate and undo', async ({ page }) => {
  await openDeck(page);
  const first = await currentSlide(page);
  const firstCount = await children(page, first);
  await page.locator('.sl-filmstrip button[data-slide]').nth(1).click();
  const second = await currentSlide(page), before = await children(page, second);
  expect(second).not.toBe(first);
  await openSearch(page); await query(page).fill('셀 병합');
  await expect(page.getByRole('option')).toHaveAttribute('aria-disabled', 'true');
  await query(page).press('Enter'); await expect(query(page)).toBeVisible();
  await query(page).fill('사각형');
  await query(page).dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(query(page)).toBeVisible();
  await query(page).press('Enter');
  await expect.poll(() => children(page, second)).toBe(before + 1);
  expect(await children(page, first)).toBe(firstCount);
  await run(page, 'duplicateBoxes');
  await expect.poll(() => children(page, second)).toBe(before + 2);
  await run(page, '실행 취소');
  await expect.poll(() => children(page, second)).toBe(before + 1);
  expect(await currentSlide(page)).toBe(second);
  const selection = await page.evaluate(() => { (window as any).searchReturnFocus = document.activeElement; return (window as any).editor.selection; });
  await openSearch(page);
  await expect(page.getByRole('option').first()).toContainText('최근 사용');
  await expect(page.getByRole('dialog', { name: '명령 검색', exact: true })).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '../../.dev/artifacts/design-system/command-search-slides.png' });
  await query(page).press('Escape');
  await expect(query(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement === (window as any).searchReturnFocus)).toBe(true);
  expect(await page.evaluate(() => (window as any).editor.selection)).toEqual(selection);
});

test('search opens slide settings after restoring focus and fits a narrow viewport', async ({ page }) => {
  await openDeck(page);
  await run(page, '슬라이드 크기');
  const dialog = page.getByRole('dialog', { name: '슬라이드 크기', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '닫기', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 840 });
  await expect(page.getByRole('button', { name: '명령 검색', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: '발표', exact: true })).toBeInViewport();
  await openSearch(page); await query(page).fill('정렬');
  const search = page.getByRole('dialog', { name: '명령 검색', exact: true });
  await expect(search).toBeInViewport();
  expect(await search.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(search).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '../../.dev/artifacts/design-system/command-search-slides-mobile.png' });
});
