import { expect, test } from '@playwright/test';

test('task states provide only available actions and do not invent progress', async ({ page }) => {
  await page.goto('/design-system/index.html#tasks');
  const demo = page.locator('#tasks');
  await expect(demo.locator('.office-task-status')).toHaveAttribute('data-phase', 'running');
  await expect(demo.getByRole('progressbar')).toHaveCount(0);
  await expect(demo.getByRole('button', { name: /알림 닫기/ })).toHaveCount(0);
  await demo.getByRole('checkbox', { name: '진행률 제공 예시' }).check();
  await expect(demo.getByRole('progressbar')).toHaveAttribute('value', '45');
  await demo.getByRole('button', { name: '실패 상태 보기' }).click();
  await expect(demo.getByRole('alert')).toContainText('파일을 처리하지 못했습니다');
  await expect(demo.getByRole('progressbar')).toHaveCount(0);
  await demo.getByRole('button', { name: '예시 작업 다시 시도' }).click();
  await expect(demo.locator('.office-task-status')).toHaveAttribute('data-phase', 'running');
  await demo.getByRole('button', { name: '예시 작업 취소' }).click();
  await expect(demo.locator('.office-task-status')).toHaveAttribute('data-phase', 'cancelled');
  await demo.getByRole('button', { name: /알림 닫기/ }).click();
  await expect(demo.locator('.office-task-status')).toHaveCount(0);
  await demo.getByRole('button', { name: '예시 작업 시작' }).click();
  await demo.getByRole('button', { name: '완료 상태 보기' }).click();
  await expect(demo.locator('.office-task-status')).toHaveAttribute('data-phase', 'success');
  await page.setViewportSize({ width: 390, height: 840 });
  await demo.locator('.office-task-status').scrollIntoViewIfNeeded();
  expect(await demo.locator('.office-task-status').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: '../../.dev/artifacts/design-system/task-status-mobile.png' });
});
