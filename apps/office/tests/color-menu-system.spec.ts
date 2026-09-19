import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const output = '../../.dev/artifacts/design-system';
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/design-system/index.html#colors');
});

test('colour swatches, HEX and opacity stay synchronized without rewriting partial input', async ({ page }) => {
  const picker = page.locator('#colors [data-color-picker]');
  const hex = picker.getByRole('textbox', { name: '색상 코드' });
  await expect(picker.locator('.react-colorful__saturation')).toHaveCSS('background-color', 'rgb(0, 81, 255)');
  await picker.getByRole('button', { name: '초록', exact: true }).click();
  await expect(hex).toHaveValue('15803D');
  await expect(page.locator('[data-color-result]')).toHaveText('theme:accent2');
  await expect(picker.getByRole('button', { name: '초록', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await picker.getByRole('button', { name: '#e11d48', exact: true }).click();
  await expect(hex).toHaveValue('E11D48');
  await hex.fill('12');
  await expect(page.locator('[data-color-result]')).toHaveText('#e11d48');
  await hex.press('Tab'); await expect(hex).toHaveValue('E11D48');
  await hex.fill('abcdef'); await hex.press('Enter');
  await expect(page.locator('[data-color-result]')).toHaveText('#abcdef');
  const opacity = picker.getByRole('spinbutton', { name: '불투명도' });
  await opacity.fill('50'); await opacity.press('Enter');
  await expect(page.locator('[data-color-result]')).toHaveText('rgba(171, 205, 239, 0.5)');
  await expect(hex).toHaveValue('ABCDEF');
  await opacity.fill(''); await opacity.press('Enter');
  await expect(opacity).toHaveValue('50');
});

test('colour popover fits a short viewport and closes back to its trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 460 });
  const trigger = page.getByRole('button', { name: '예시 채우기', exact: true });
  await trigger.click();
  const popup = page.locator('[data-color-panel="예시 채우기"]');
  await expect(popup).toBeVisible();
  const box = await popup.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(7);
  expect(box!.y + box!.height).toBeLessThanOrEqual(453);
  expect(box!.x + box!.width).toBeLessThanOrEqual(383);
  await expect(popup.getByRole('textbox', { name: '색상 코드' })).toHaveValue('2563EB');
  await popup.getByRole('button', { name: '초록', exact: true }).click();
  await expect(trigger).toHaveAttribute('data-value', 'theme:accent2');
  await popup.getByRole('textbox', { name: '색상 코드' }).focus();
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0); await expect(trigger).toBeFocused();
});

test('menu moves real focus, skips disabled items, scrolls and runs once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 460 });
  const trigger = page.getByRole('button', { name: '객체 메뉴 열기', exact: true });
  await trigger.click();
  const menu = page.getByRole('menu', { name: '객체 예시 메뉴' });
  await expect(menu.getByRole('menuitem', { name: /^복사/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitemcheckbox')).toBeFocused();
  await page.keyboard.press('End');
  const last = menu.getByRole('menuitem', { name: '저장된 스타일 16', exact: true });
  await expect(last).toBeFocused(); await expect(last).toBeInViewport();
  const box = await menu.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(383);
  expect(box!.y + box!.height).toBeLessThanOrEqual(453);
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(page.locator('#colors')).toContainText('선택한 명령: version-16');
  await expect(trigger).toBeFocused();
  await trigger.click(); await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0); await expect(trigger).toBeFocused();
});

test('colour surfaces share the light and dark theme', async ({ page }) => {
  await mkdir(output, { recursive: true });
  for (const theme of ['밝은 테마', '어두운 테마']) {
    await page.getByRole('combobox', { name: '시스템 테마' }).click();
    await page.getByRole('option', { name: theme, exact: true }).click();
    await page.locator('#colors').screenshot({ path: `${output}/colors-${theme === '밝은 테마' ? 'light' : 'dark'}.png` });
  }
});


test('Slides applies a picker colour to an actual shape', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'S Slides 새 자료 만들기', exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름' }).fill('색상 도구 검증');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await page.getByRole('button', { name: '사각형', exact: true }).click();
  const trigger = page.locator('.sl-properties').getByRole('button', { name: '선 색', exact: true });
  await trigger.click();
  const popup = page.locator('[data-color-panel]');
  await popup.getByRole('textbox', { name: '색상 코드' }).fill('e11d48');
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('data-value', '#e11d48');
  await expect.poll(() => page.locator('.sl-stage .sl-rectangle').evaluateAll(nodes => nodes.some(node => getComputedStyle(node).borderTopColor === 'rgb(225, 29, 72)'))).toBe(true);
  await popup.getByRole('button', { name: /닫기$/ }).click();
  await expect(popup).toHaveCount(0);
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  await page.screenshot({ path: `${output}/colors-slides.png` });
});
