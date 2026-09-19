import { expect, test } from '@playwright/test';

test('HTML and ZIP export status handles failure, retry and concurrent file notices', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-admin-open]').first().click();
  await expect(page.locator('[data-frame="desktop"] .st-page')).toBeVisible();
  const before = await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
  const choose = async (name: string | RegExp) => {
    await page.getByRole('menuitem', { name: '파일', exact: true }).click();
    await page.getByRole('menuitem', { name, exact: typeof name === 'string' }).click();
  };
  const json = page.waitForEvent('download'); await choose(/^저장(?: |$)/); await json;
  const files = page.getByRole('complementary', { name: '파일 작업 상태' });
  await expect(files).toContainText('다운로드 요청됨');
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = blob => {
      if (blob instanceof Blob && blob.type.startsWith('text/html')) { URL.createObjectURL = original; throw new Error('HTML 파일 생성 실패'); }
      return original(blob);
    };
  });
  await choose('이 페이지 내보내기');
  const status = page.getByRole('complementary', { name: '사이트 출력 상태' });
  await expect(status.getByRole('alert')).toContainText('사이트 출력 실패');
  const html = page.waitForEvent('download');
  await status.getByRole('button', { name: '다시 시도', exact: true }).click();
  expect((await html).suggestedFilename()).toBe('index.html');
  await expect(status).toContainText('사이트 다운로드 요청됨');
  const zip = page.waitForEvent('download'); await choose('사이트 전체 내보내기');
  expect((await zip).suggestedFilename()).toMatch(/\.zip$/);
  await expect(status).toContainText('.zip');
  expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(before);
  await page.setViewportSize({ width: 390, height: 840 });
  const first = (await files.boundingBox())!, second = (await status.boundingBox())!;
  expect(first.y + first.height).toBeLessThanOrEqual(second.y);
  await expect(status).toBeInViewport();
  await page.screenshot({ path: '../../.dev/artifacts/design-system/html-output-status.png' });
  await status.getByRole('button', { name: /알림 닫기/ }).click();
  await expect(status).toHaveCount(0); await expect(files).toBeVisible();
  await files.getByRole('button', { name: /알림 닫기/ }).click();
  await expect(page.locator('.office-task-region')).toHaveCount(0);
});

test('a pending export rejects duplicate requests and does not export a replacement document', async ({ page }) => {
  await page.goto('/'); await page.locator('[data-admin-open]').first().click();
  await expect(page.locator('[data-frame="desktop"] .st-page')).toBeVisible();
  await page.evaluate(() => {
    const ed = (window as any).editor, original = ed.executeCommand.bind(ed);
    (window as any).exportCalls = 0;
    ed.executeCommand = async (name: string, payload: unknown) => {
      if (name === 'exportSite') {
        (window as any).exportCalls++;
        await new Promise<void>(resolve => { (window as any).releaseExport = resolve; });
      }
      return original(name, payload);
    };
  });
  const start = async () => {
    await page.getByRole('menuitem', { name: '파일', exact: true }).click();
    await page.getByRole('menuitem', { name: '사이트 전체 내보내기', exact: true }).click();
  };
  await start();
  const status = page.getByRole('complementary', { name: '사이트 출력 상태' });
  await expect(status).toContainText('사이트 출력 준비 중');
  await expect(status.getByRole('progressbar')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).exportCalls)).toBe(1);
  await start();
  expect(await page.evaluate(() => (window as any).exportCalls)).toBe(1);
  const downloads: string[] = []; page.on('download', file => downloads.push(file.suggestedFilename()));
  await page.evaluate(() => {
    const ed = (window as any).editor;
    const replacement = ed.exportDocument();
    delete replacement.sid;
    ed.loadDocument(replacement, 'site');
    (window as any).releaseExport();
  });
  await expect(status.getByRole('alert')).toContainText('사이트 출력 실패');
  await expect(status.getByRole('button', { name: '다시 시도' })).toHaveCount(0);
  expect(downloads).toEqual([]);
});
