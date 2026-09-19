import { test, expect } from '@playwright/test';

test('picture property keeps failed input, retries and searches document assets', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-admin-open]').first().click();
  const picture = page.locator('[data-frame="desktop"] img.st-picture[alt="문서와 덱과 페이지가 한 화면에 놓인 그림"]');
  await picture.click({ force: true, modifiers: ['Meta'], position: { x: 8, y: 8 } });
  const panel = page.locator('.office-properties');
  await panel.getByRole('tab', { name: '모양', exact: true }).click();
  const field = panel.locator('.st-picture-property');
  const originalSrc = await picture.getAttribute('src');
  await page.evaluate(() => {
    const editor = (window as any).editor;
    const run = editor.executeCommand.bind(editor);
    (window as any).allowPicture = false;
    editor.executeCommand = async (name: string, payload: unknown) => {
      if (name === 'insertAsset' && !(window as any).allowPicture) {
        await new Promise(resolve => setTimeout(resolve, 600));
        return false;
      }
      return run(name, payload);
    };
  });
  await field.getByLabel('그림 파일 넣기', { exact: true }).setInputFiles({
    name: '공통 그림.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="blue"/></svg>'),
  });
  await expect(field.getByRole('button', { name: '파일 넣기', exact: true })).toBeDisabled();
  await expect(field.getByRole('button', { name: '그림 파일', exact: true })).toBeDisabled();
  await expect(field.getByRole('alert')).toContainText('그림 파일을 추가하지 못했습니다');
  await expect(picture).toHaveAttribute('src', originalSrc!);
  await expect(field.getByText('공통 그림.svg', { exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).allowPicture = true; });
  await field.getByRole('button', { name: '다시 시도' }).click();
  await expect(picture).toHaveAttribute('src', /^data:image\/svg\+xml;base64,/);
  await expect(field.getByRole('alert')).toHaveCount(0);
  await expect(field.getByRole('button', { name: '그림 파일', exact: true })).toBeVisible();
  const replacedSrc = await picture.getAttribute('src');
  await page.evaluate(async () => { await (window as any).editor.executeCommand('undo'); });
  await expect(picture).toHaveAttribute('src', originalSrc!);
  await expect(field.getByRole('button', { name: '그림 파일', exact: true })).toBeVisible();
  await page.evaluate(async () => { await (window as any).editor.executeCommand('redo'); });
  await expect(picture).toHaveAttribute('src', replacedSrc!);
  await field.getByRole('button', { name: '그림 파일', exact: true }).click();
  const search = page.getByRole('combobox', { name: '그림 파일 검색', exact: true });
  await search.fill('없는 그림');
  await expect(page.getByText('일치하는 항목이 없습니다.', { exact: true })).toBeVisible();
  await search.fill('공통 그림');
  await expect(page.getByRole('listbox', { name: '그림 파일', exact: true }).getByRole('option')).toHaveCount(1);
  await search.press('Enter');
  await expect(field.getByRole('button', { name: '그림 파일', exact: true })).toContainText('공통 그림');
  await page.screenshot({ path: '../../.dev/artifacts/design-system/site-picture-property.png', animations: 'disabled' });
});
