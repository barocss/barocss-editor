import { expect, test, type Page } from '@playwright/test';
const png = { name: 'diagram.png', mimeType: 'image/png', buffer: Buffer.from('image sample') };
async function drop(page: Page, files: { name: string; type: string; size: number }[]) {
  const transfer = await page.evaluateHandle(items => {
    const data = new DataTransfer(); for (const item of items) data.items.add(new File([new Uint8Array(item.size)], item.name, { type: item.type })); return data;
  }, files);
  await page.getByRole('group', { name: '예시 그림 파일 놓기 영역' }).dispatchEvent('drop', { dataTransfer: transfer });
  await transfer.dispose();
}
test.beforeEach(async ({ page }) => { await page.goto('/design-system/index.html#files'); });

test('picker and drop share validation and allow the same file again', async ({ page }) => {
  const input = page.getByLabel('예시 그림 파일', { exact: true });
  await input.setInputFiles(png); await input.setInputFiles(png);
  await expect(page.locator('#files')).toContainText('파일 처리 횟수: 2');
  await drop(page, [{ name: 'bad.txt', type: 'text/plain', size: 10 }]);
  await expect(page.locator('#files').getByRole('alert')).toContainText('파일 형식');
  await input.setInputFiles({ ...png, buffer: Buffer.alloc(1024 * 1024 + 1) });
  await expect(page.locator('#files').getByRole('alert')).toContainText('1.0 MB');
  await drop(page, [{ name: 'a.png', type: 'image/png', size: 10 }, { name: 'b.png', type: 'image/png', size: 10 }]);
  await expect(page.locator('#files').getByRole('alert')).toContainText('하나씩');
  await drop(page, [{ name: 'new.png', type: 'image/png', size: 10 }]);
  await expect(page.locator('#files')).toContainText('파일 처리 횟수: 3');
  await expect(page.locator('#files').getByRole('alert')).toHaveCount(0);
});

test('processing failure can be retried and disabled drop does not call the host', async ({ page }) => {
  await page.getByRole('checkbox', { name: '파일 처리 실패 예시' }).check();
  await page.getByLabel('예시 그림 파일', { exact: true }).setInputFiles(png);
  await expect(page.locator('#files').getByRole('alert')).toContainText('처리하지 못했습니다');
  await page.getByRole('checkbox', { name: '파일 처리 실패 예시' }).uncheck();
  await page.getByLabel('예시 그림 파일', { exact: true }).setInputFiles(png);
  await expect(page.locator('#files')).toContainText('파일 처리 횟수: 1');
  await page.getByRole('checkbox', { name: '파일 UI 비활성' }).check();
  await drop(page, [{ name: 'new.png', type: 'image/png', size: 10 }]);
  await expect(page.locator('#files')).toContainText('파일 처리 횟수: 1');
  await expect(page.getByRole('button', { name: 'diagram.png 제거' })).toBeDisabled();
});

test('media search shows previews, missing preview fallback and clear selection on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 840 });
  await page.getByRole('button', { name: '예시 문서 이미지', exact: true }).click();
  const search = page.getByRole('combobox', { name: '예시 문서 이미지 검색' });
  await search.fill('차트'); await search.press('Enter');
  await expect(page.getByLabel('팀 실적 차트 미리보기')).toBeVisible();
  await page.getByRole('button', { name: '예시 문서 이미지', exact: true }).click();
  await search.fill('읽을 수 없는'); await search.press('Enter');
  await expect(page.locator('#files .office-media-missing')).toHaveText('미리보기 없음');
  await page.locator('#files').screenshot({ path: '../../.dev/artifacts/design-system/files-mobile.png', animations: 'disabled' });
  await page.getByRole('button', { name: '예시 문서 이미지', exact: true }).click();
  await search.fill('없음'); await search.press('Enter');
  await expect(page.locator('#files .office-media-preview')).toHaveCount(0);
});
