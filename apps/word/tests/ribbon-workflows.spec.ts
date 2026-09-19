import { test, expect } from '@playwright/test';
import { placeCaret } from './helpers';

const tab = (page: import('@playwright/test').Page, name: string) => page.getByRole('tab', { name, exact: true });

test('ribbon style previews and keyboard commands change the document once', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await placeCaret(page, '.w-paragraph');
  await page.keyboard.type('A visible heading');
  await page.getByRole('button', { name: '제목 1 적용', exact: true }).click();
  await expect(page.locator('h1.w-heading')).toContainText('A visible heading');
  await expect(page.locator('[data-control=style-heading1]')).toHaveAttribute('aria-pressed', 'true');
  const undo = page.locator('[data-control=undo]');
  await undo.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('h1.w-heading')).toHaveCount(0);
  await expect(page.locator('.w-paragraph')).toContainText('A visible heading');
  await page.locator('[data-control=redo]').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('h1.w-heading')).toContainText('A visible heading');

  await tab(page, '홈').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, '삽입')).toBeFocused();
  await expect(tab(page, '삽입')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tab(page, '보기')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tab(page, '홈')).toBeFocused();
});

test('layout actions open real settings and table insertion accepts dimensions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await placeCaret(page, '.w-paragraph');
  await page.keyboard.type('Table follows');
  await tab(page, '레이아웃').click();
  await page.getByRole('button', { name: '용지·여백', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '페이지 설정', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await tab(page, '홈').click();
  await page.getByRole('button', { name: '문단 상세 설정', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '문단 간격', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await tab(page, '삽입').click();
  await page.getByRole('button', { name: '표 삽입', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '표 삽입', exact: true });
  await dialog.getByLabel('열 수', { exact: true }).fill('4');
  await dialog.getByLabel('행 수', { exact: true }).fill('2');
  await dialog.getByRole('button', { name: '삽입', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.w-document table')).toHaveCount(1);
  await expect(page.locator('.w-document table tr')).toHaveCount(2);
  await expect(page.locator('.w-document table td, .w-document table th')).toHaveCount(8);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('.w-document table td, .w-document table th')).toHaveCount(8);
});

test('review tracking reports its state and menu toggles show the open pane', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await placeCaret(page, '.w-paragraph');
  await tab(page, '검토').click();
  const tracking = page.locator('[data-control=track-changes]');
  await expect(tracking).toHaveAttribute('aria-pressed', 'false');
  await tracking.click();
  await expect(tracking).toHaveAttribute('aria-pressed', 'true');
  await tracking.click();
  await expect(tracking).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '댓글', exact: true }).click();
  await expect(page.locator('.w-comments-pane')).toBeVisible();
  await page.locator('.w-menubar [data-menu=view]').click();
  await expect(page.locator('[data-menu-item="view.panes.1"]')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
});


test('starts compact and preserves formatting when detailed tools open and close', async ({ page }) => {
  await page.goto('/');
  const compact = page.getByRole('toolbar', { name: '기본 문서 도구' });
  await expect(compact).toBeVisible();
  await expect(page.getByRole('tablist', { name: '도구 모음 선택' })).toHaveCount(0);
  await placeCaret(page, '.w-paragraph');
  await page.keyboard.type('Compact document');
  await page.locator('.w-toolbar-style').click();
  await page.getByRole('option', { name: 'Heading 1', exact: true }).click();
  await expect(page.locator('h1.w-heading')).toContainText('Compact document');
  await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await expect(page.locator('[data-control=style-heading1]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '간단히 보기', exact: true }).click();
  await expect(compact).toBeVisible();
  await compact.locator('[data-control=undo]').click();
  await expect(page.locator('h1.w-heading')).toHaveCount(0);
  await expect(page.locator('.w-paragraph')).toContainText('Compact document');
});
