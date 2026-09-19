import { expect, test } from '@playwright/test';

test('site file feedback reports download and invalid input, then opens the saved site', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('[data-admin-page]').first()).toBeVisible();
  const pageCount = await page.locator('[data-admin-page]').count();
  await page.getByRole('menuitem', { name: '파일', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /^저장(?: |$)/ }).click();
  const download = await pending;
  const file = testInfo.outputPath('task-site.json'); await download.saveAs(file);
  const feedback = page.getByRole('complementary', { name: '파일 작업 상태' });
  await expect(feedback).toContainText('다운로드 요청됨');
  const input = page.getByLabel('사이트 파일', { exact: true });
  await input.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('broken') });
  await expect(feedback.getByRole('alert')).toContainText('파일 작업 실패');
  await expect(page.locator('[data-admin-page]')).toHaveCount(pageCount);
  await input.setInputFiles(file);
  await expect(feedback).toContainText('파일 열기 완료');
  await expect(page.locator('[data-admin-page]')).toHaveCount(pageCount);
  await page.screenshot({ path: '../../.dev/artifacts/design-system/task-status-site.png' });
});
