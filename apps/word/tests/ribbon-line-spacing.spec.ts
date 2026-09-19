import { test, expect } from '@playwright/test';
import { placeCaret } from './helpers';

test('line spacing presets change layout, retain paragraph spacing, undo and persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: '줄 간격', exact: true })).toBeDisabled();
  await placeCaret(page, '.w-paragraph');
  await page.keyboard.type('First paragraph');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second paragraph');
  const paragraph = page.locator('.w-paragraph').nth(1);
  await page.getByRole('button', { name: '문단 상세 설정', exact: true }).click();
  await page.getByLabel('문단 앞 간격', { exact: true }).fill('12');
  await page.getByLabel('문단 앞 간격', { exact: true }).press('Enter');
  await page.locator('[data-spacing-apply]').click();
  await expect(paragraph).toHaveCSS('margin-top', '16px');
  const originalHeight = await paragraph.evaluate(el => getComputedStyle(el).lineHeight);
  const select = page.getByRole('combobox', { name: '줄 간격', exact: true });
  await select.click();
  await page.getByRole('option', { name: '2줄', exact: true }).click();
  await expect(select).toHaveText('2줄');
  await expect.poll(() => paragraph.evaluate(el => {
    const css = getComputedStyle(el);
    return parseFloat(css.lineHeight) / parseFloat(css.fontSize);
  })).toBeCloseTo(2, 3);
  await expect(paragraph).toHaveCSS('margin-top', '16px');
  await page.locator('[data-control=undo]').click();
  await expect(paragraph).toHaveCSS('line-height', originalHeight);
  await page.locator('[data-control=redo]').click();
  await expect(select).toHaveText('2줄');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await placeCaret(page, '.w-paragraph', 1);
  await expect(select).toHaveText('2줄');
  await expect(paragraph).toHaveCSS('margin-top', '16px');
});
