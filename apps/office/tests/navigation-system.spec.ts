import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const output = `${process.cwd()}/../../.dev/artifacts/design-system`;
async function create(page: Page, product: string) {
  await page.goto('/');
  await page.getByRole('button', { name: `${product[0]} ${product} 새 자료 만들기`, exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름' }).fill('탐색 검증');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await expect.poll(() => page.locator('[data-document-identity]').evaluate(el => el.querySelector('input')?.value || el.textContent?.trim())).toBe('탐색 검증');
}
test('tabs skip disabled items, use one tab stop and reveal an overflowing selection', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/design-system/index.html#navigation');
  const sample = page.locator('#navigation');
  const tabs = sample.getByRole('tablist');
  await expect(tabs.locator('[tabindex="0"]')).toHaveCount(1);
  expect(await tabs.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await tabs.getByRole('tab', { name: '페이지', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: '즐겨찾기', exact: true })).toBeFocused();
  await expect(sample.getByRole('tabpanel', { name: '즐겨찾기', exact: true })).toBeVisible();
  await page.keyboard.press('End');
  const last = tabs.getByRole('tab', { name: '지난 분기 프로젝트 보관함', exact: true });
  await expect(last).toBeFocused();
  expect(await last.evaluate(el => {
    const item = el.getBoundingClientRect(), host = el.parentElement!.getBoundingClientRect();
    return item.left >= host.left - 1 && item.right <= host.right + 1;
  })).toBe(true);
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: '페이지', exact: true })).toBeFocused();
  await tabs.getByRole('tab', { name: '즐겨찾기', exact: true }).click();
  await expect(tabs.getByRole('tab', { name: '즐겨찾기', exact: true })).toBeFocused();
});

test('navigation retains selection while filtering and offers a working empty-state action', async ({ page }) => {
  await page.goto('/design-system/index.html#navigation');
  const sample = page.locator('#navigation');
  const selected = sample.getByRole('button', { name: '주간 회의록', exact: true });
  await selected.click(); await selected.hover();
  await expect(selected).toHaveAttribute('aria-current', 'page');
  await expect(selected).toHaveAttribute('data-selected', 'true');
  const search = sample.getByRole('textbox', { name: '목록 예시 검색' });
  await search.fill('찾을 수 없는 이름');
  await expect(sample.getByRole('status')).toContainText('검색 결과가 없습니다');
  await sample.getByRole('button', { name: '검색 지우기', exact: true }).press('Enter');
  await expect(search).toHaveValue(''); await expect(selected).toHaveAttribute('aria-current', 'page');
  await page.setViewportSize({ width: 390, height: 740 });
  await mkdir(output, { recursive: true });
  const panel = sample.locator('.ds-navigation-panel');
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await panel.screenshot({ path: `${output}/navigation-light.png` });
  await page.getByRole('combobox', { name: '시스템 테마' }).click();
  await page.getByRole('option', { name: '어두운 테마', exact: true }).click();
  await panel.screenshot({ path: `${output}/navigation-dark.png` });
});

test('Note search reset keeps the active page and uses the shared navigation item', async ({ page }) => {
  await create(page, 'Note');
  const current = page.locator('.nw-list [aria-current="page"]');
  await expect(current).toHaveClass(/office-navigation-item/);
  const url = page.url();
  await page.getByRole('searchbox', { name: '노트 검색' }).fill('없는 페이지 이름');
  await expect(page.locator('.nw-list')).toContainText('검색 결과가 없습니다');
  await page.getByRole('button', { name: '검색 지우기', exact: true }).click();
  await expect(current).toHaveText('탐색 검증');
  expect(page.url()).toBe(url);
});

test('Slides inspector tabs share keyboard navigation and Site search can recover from no results', async ({ page }) => {
  await create(page, 'Slides');
  const tabs = page.getByRole('tablist', { name: '속성 탭', exact: true });
  await tabs.getByRole('tab', { name: '속성', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: '모션', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: '모션', exact: true })).toBeVisible();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tabpanel', { name: '속성', exact: true })).toBeVisible();
  await create(page, 'Site');
  await page.locator('[data-admin-open]').first().click();
  await page.getByRole('tab', { name: '구성', exact: true }).click();
  const search = page.getByRole('textbox', { name: '블록 찾기', exact: true });
  await search.fill('없는 블록 이름');
  await expect(page.locator('.office-empty-state')).toContainText('검색 결과가 없습니다');
  await page.getByRole('button', { name: '검색 지우기', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('[data-layers]')).toBeVisible();
});
