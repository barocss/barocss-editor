import { test, expect } from '@playwright/test';

test('panel actions keep draft values on failure and fit a narrow viewport', async ({ page }) => {
  await page.goto('/design-system/index.html#panel-actions');
  const panel = page.locator('#panel-actions');
  const input = panel.getByRole('textbox', { name: '예시 보기 이름' });
  await input.fill('검토 중인 작업');
  await panel.getByRole('checkbox', { name: '적용 실패 예시' }).check();
  await panel.getByRole('button', { name: '적용', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('보기를 저장하지 못했습니다.');
  await expect(input).toHaveValue('검토 중인 작업');
  await panel.getByRole('checkbox', { name: '적용 실패 예시' }).uncheck();
  await panel.getByRole('button', { name: '적용', exact: true }).click();
  await expect(panel).toContainText('적용된 이름: 검토 중인 작업');
  await panel.getByRole('button', { name: '초기화', exact: true }).click();
  await expect(panel.getByRole('button', { name: '적용', exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: '취소', exact: true }).click();
  await expect(input).toHaveValue('검토 중인 작업');
  await page.setViewportSize({ width: 390, height: 844 });
  const footer = panel.locator('.office-floating-footer');
  await footer.scrollIntoViewIfNeeded();
  expect(await footer.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: '../../.dev/artifacts/design-system/panel-actions-mobile.png' });
});
