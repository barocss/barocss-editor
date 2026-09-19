import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const output = '../../.dev/artifacts/design-system';
test.beforeEach(async ({ page }) => {
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/design-system/index.html');
  await page.getByRole('link', { name: '입력·선택 상세', exact: true }).click();
});

test('rounded display and Escape preserve precision; edits commit once within bounds', async ({ page }) => {
  const field = page.getByRole('spinbutton', { name: '정밀한 길이' });
  const status = page.locator('[data-field-result]');
  await expect(field).toHaveValue('12.35');
  await field.focus(); await field.press('Tab');
  await expect(status).toContainText('적용 횟수: 0');
  await expect(status).toContainText('저장 값: 12.34567');
  await field.fill('55'); await field.press('Escape');
  await expect(field).toHaveValue('12.35');
  await expect(status).toContainText('적용 횟수: 0');
  await field.fill(''); await field.press('Enter');
  await expect(field).toHaveValue('12.35');
  await expect(status).toContainText('적용 횟수: 0');
  await field.fill('120'); await field.press('Enter');
  await expect(field).toHaveValue('100');
  await expect(status).toContainText('적용 횟수: 1');
  await field.focus(); await field.press('Tab');
  await expect(status).toContainText('적용 횟수: 1');
  await field.fill('-5'); await field.press('Enter');
  await expect(field).toHaveValue('0');
  const mixed = page.getByRole('spinbutton', { name: '혼합 길이', exact: true });
  await mixed.fill('15'); await mixed.press('Enter');
  await expect(mixed).toHaveValue('15');
  await mixed.fill(''); await mixed.press('Enter');
  await expect(mixed).toHaveValue('');
});

test('composition Enter does not commit; text cancel and live search keep separate behavior', async ({ page }) => {
  const field = page.getByRole('textbox', { name: '확정형 문서 이름' });
  const status = page.locator('[data-field-result]');
  await field.fill('변경 전'); await field.press('Escape');
  await expect(field).toHaveValue('분기 계획');
  await field.focus();
  // Exercise the composition event boundary; this does not automate a native IME candidate window.
  await field.dispatchEvent('compositionstart');
  await field.fill('한글 문서');
  await field.press('Enter');
  await expect(field).toBeFocused();
  await expect(status).toContainText('적용 횟수: 0');
  await field.dispatchEvent('compositionend', { data: '한글 문서' });
  await field.press('Enter');
  await expect(status).toContainText('적용 횟수: 1');
  await expect(status).toContainText('이름: 한글 문서');
  await field.fill('한글 문서   '); await field.press('Tab');
  await expect(field).toHaveValue('한글 문서');
  await expect(status).toContainText('적용 횟수: 1');
  await page.getByRole('textbox', { name: '실시간 문서 검색' }).fill('분기');
  await expect(page.locator('[data-field-search]')).toContainText('분기');
  await expect(page.getByRole('textbox', { name: '읽기 전용 예시' })).toHaveAttribute('readonly', '');
  await expect(page.getByRole('textbox', { name: '비활성 입력 예시' })).toBeDisabled();
});

test('long choices wrap in the popup and its last option remains keyboard reachable', async ({ page }) => {
  const field = page.getByRole('combobox', { name: '긴 문서 형식' });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await field.click();
    const popup = page.getByRole('listbox');
    await expect(popup).toBeVisible();
    const box = await popup.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(width - 16);
    const label = popup.locator('.office-choice-label').filter({ hasText: '이번 분기 제품' });
    await expect(label).toHaveCSS('white-space', 'normal');
    expect(await label.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.getByRole('option', { name: /이번 분기 제품/ })).toBeFocused();
    await page.keyboard.press('End');
    const last = page.getByRole('option', { name: '문서 템플릿 18', exact: true });
    await expect(last).toBeFocused(); await expect(last).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(field).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('validation and read-only paint remain clear in both themes', async ({ page }) => {
  for (const theme of ['밝은 테마', '어두운 테마']) {
    await page.getByRole('combobox', { name: '시스템 테마' }).click();
    await page.getByRole('option', { name: theme, exact: true }).click();
    const error = page.getByRole('combobox', { name: '오류 선택 예시' });
    await expect(error).toHaveAttribute('aria-invalid', 'true');
    await expect(error).toHaveAttribute('aria-describedby', 'field-choice-error');
    await error.focus();
    const danger = await error.evaluate(el => {
      const probe = document.createElement('span'); probe.style.color = 'var(--ou-danger)'; el.append(probe);
      const value = getComputedStyle(probe).color; probe.remove(); return value;
    });
    await expect(error).toHaveCSS('border-top-color', danger);
    await page.locator('#fields').screenshot({ path: `${output}/fields-${theme === '밝은 테마' ? 'light' : 'dark'}.png` });
  }
  await page.getByRole('textbox', { name: '오류 입력 예시' }).fill('보고서');
  await expect(page.locator('#field-example-error')).toHaveCount(0);
  await page.getByRole('combobox', { name: '오류 선택 예시' }).click();
  await page.getByRole('option', { name: '간단한 요약', exact: true }).click();
  await expect(page.locator('#field-choice-error')).toHaveCount(0);
});
