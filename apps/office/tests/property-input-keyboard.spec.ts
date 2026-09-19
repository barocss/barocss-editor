import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

test('keyboard opens the colour code; Escape restores focus and Tab can leave the picker', async ({ page }) => {
  await page.goto('/design-system/index.html#colors');
  const trigger = page.getByRole('button', { name: '예시 채우기', exact: true });
  const popup = page.locator('[data-color-panel="예시 채우기"]');
  await trigger.press('Enter');
  const code = popup.getByRole('textbox', { name: '색상 코드' });
  await expect(code).toBeFocused();
  await expect(code).toHaveValue('2563EB');
  await code.press('Escape');
  await expect(popup).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.press('Space');
  await expect(code).toBeFocused();
  await popup.getByRole('button', { name: '예시 채우기 없음', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(popup).toHaveCount(0);
  await expect(page.getByRole('button', { name: '객체 메뉴 열기', exact: true })).toBeFocused();
});

test('long colour names fit the property row and the popup stays inside the desktop viewport', async ({ page }) => {
  await page.goto('/design-system/index.html#colors');
  const trigger = page.getByRole('button', { name: '예시 채우기', exact: true });
  await trigger.click();
  const popup = page.locator('[data-color-panel="예시 채우기"]');
  const name = '제품 출시 캠페인과 팀 문서에서 함께 사용하는 강조색';
  await popup.getByRole('button', { name, exact: true }).click();
  await expect(trigger).toHaveAttribute('data-value', 'var:campaign');
  const label = page.locator(`span[title="${name}"]`);
  await expect(label).toBeVisible();
  expect(await label.evaluate(el => el.parentElement!.scrollWidth <= el.parentElement!.clientWidth)).toBe(true);
  const bounds = await popup.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(8);
  expect(bounds!.y).toBeGreaterThanOrEqual(8);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1432);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(992);
});

test('number arrow modifiers edit a draft, commit once, clamp and cancel', async ({ page }) => {
  await page.goto('/design-system/index.html#fields');
  const field = page.getByRole('spinbutton', { name: '정밀한 길이' });
  const result = page.locator('[data-field-result]');
  await field.press('ArrowUp');
  await expect(field).toHaveValue('12.45');
  await field.press('Shift+ArrowUp');
  await expect(field).toHaveValue('13.45');
  await field.press('Alt+ArrowDown');
  await expect(field).toHaveValue('13.44');
  await expect(result).toContainText('적용 횟수: 0');
  await field.press('Enter');
  await expect(result).toContainText('적용 횟수: 1');
  await expect(result).toContainText('저장 값: 13.44');
  await field.fill('99.9'); await field.press('Shift+ArrowUp');
  await expect(field).toHaveValue('100');
  await field.press('Escape');
  await expect(field).toHaveValue('13.44');
  await expect(result).toContainText('적용 횟수: 1');
  await field.fill('0'); await field.press('Alt+ArrowDown');
  await expect(field).toHaveValue('0');
  await field.press('Tab');
  await expect(result).toContainText('적용 횟수: 2');
  const mixed = page.getByRole('spinbutton', { name: '혼합 길이' });
  await mixed.press('Shift+ArrowUp'); await mixed.press('Enter');
  await expect(mixed).toHaveValue('10');
});
