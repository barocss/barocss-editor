import { test, expect } from '@playwright/test';
import { settled } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/?sample');
  await settled(page);
  await page.keyboard.press('Control+f');
});

test('empty results disable actions; IME confirmation does not navigate or close', async ({ page }) => {
  const panel = page.getByRole('search', { name: '찾기 및 바꾸기' });
  const query = panel.getByLabel('찾을 내용');
  await expect(query).toBeFocused();
  await expect(panel).toContainText('검색어를 입력하세요');
  await expect(panel.getByLabel('다음 검색 결과')).toBeDisabled();
  await expect(panel.getByRole('button', { name: '모두 바꾸기' })).toBeDisabled();
  await query.fill('paragraph');
  await expect(panel.locator('.w-find-count')).toContainText('1 /');
  await query.dispatchEvent('compositionstart');
  await query.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await query.dispatchEvent('keydown', { key: 'Escape', isComposing: true });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.w-find-count')).toContainText('1 /');
  await query.dispatchEvent('compositionend');
  await query.press('Enter');
  await expect(panel.locator('.w-find-count')).toContainText('2 /');
  await query.press('Shift+Enter');
  await expect(panel.locator('.w-find-count')).toContainText('1 /');
  await query.fill('not-present-in-this-document');
  await expect(panel).toContainText('검색 결과 없음');
  await expect(panel.getByLabel('이전 검색 결과')).toBeDisabled();
  await query.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('a rejected replacement keeps inputs and can be retried with Enter', async ({ page }) => {
  const panel = page.getByRole('search');
  await panel.getByLabel('찾을 내용').fill('Pagination');
  await expect(panel.locator('.w-find-count')).toContainText('1 /');
  const before = await panel.locator('.w-find-count').innerText();
  await panel.getByLabel('바꿀 내용').fill('Layout');
  await page.evaluate(() => {
    const editor = (window as any).editor;
    const original = editor.getSortedExtensions.bind(editor);
    editor.getSortedExtensions = () => [{ name: 'reject-once', onBeforeTransaction: () => {
      editor.getSortedExtensions = original;
      return null;
    } }, ...original()];
  });
  await panel.getByRole('button', { name: '하나 바꾸기' }).click();
  await expect(panel.getByRole('alert')).toContainText('텍스트를 바꾸지 못했습니다.');
  await expect(panel.getByLabel('바꿀 내용')).toHaveValue('Layout');
  await expect(panel.locator('.w-find-count')).toHaveText(before);
  await panel.getByLabel('바꿀 내용').press('Enter');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel).toContainText('1개를 바꿨습니다.');
  await expect(page.locator('.w-surface').first()).toContainText('Layout is measured');
});

test('panel fits small screens and stays visible when navigating to the last result', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = page.getByRole('search');
  await panel.getByLabel('찾을 내용').fill('paragraph');
  await panel.getByLabel('이전 검색 결과').click();
  await expect(page.locator('.w-find-hit.is-current')).toBeInViewport();
  await expect(panel.getByLabel('찾을 내용')).toBeInViewport();
  await expect(panel.getByRole('button', { name: '모두 바꾸기' })).toBeInViewport();
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await expect.poll(async () => {
    const hit = await page.locator('.w-find-hit.is-current').boundingBox();
    const popup = await panel.boundingBox();
    return hit!.y >= popup!.y + popup!.height;
  }).toBe(true);
  await page.screenshot({ path: '../../.dev/artifacts/design-system/word-find-mobile.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await expect(panel).toHaveCSS('background-color', 'rgb(23, 23, 23)');
  await page.screenshot({ path: '../../.dev/artifacts/design-system/word-find-dark.png', animations: 'disabled' });
});
