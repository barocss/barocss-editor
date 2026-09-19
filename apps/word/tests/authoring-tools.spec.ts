import { test, expect, type Page } from '@playwright/test';
import { placeCaret } from './helpers';
async function textSelection(page: Page, text = 'Selected words') {
  await page.goto('/'); await placeCaret(page, '.w-paragraph');
  await page.keyboard.type(text); await page.keyboard.press('Shift+Home');
  await expect.poll(() => page.evaluate(() => { const s = (window as any).editor.selection; return s?.type === 'range' && (s.startNodeId !== s.endNodeId || s.startOffset !== s.endOffset); })).toBe(true);
}
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });

test('link dialog validates, edits, cancels and removes the saved text range', async ({ page }) => {
  await textSelection(page);
  await tab(page, '삽입').click();
  await page.getByRole('button', { name: '링크 편집', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: '링크 편집', exact: true });
  await dialog.getByLabel('링크 주소').fill('javascript:alert(1)');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('유효한');
  await dialog.getByLabel('링크 주소').fill('https://example.com/first');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.locator('.w-document a[href="https://example.com/first"]')).toContainText('Selected words');
  await page.getByRole('button', { name: '링크 편집', exact: true }).click();
  await expect(dialog.getByLabel('링크 주소')).toHaveValue('https://example.com/first');
  await dialog.getByLabel('링크 주소').fill('https://example.com/cancelled');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.locator('.w-document a[href="https://example.com/first"]')).toHaveCount(1);
  await page.getByRole('button', { name: '링크 편집', exact: true }).click();
  await dialog.getByRole('button', { name: '링크 해제', exact: true }).click();
  await expect(page.locator('.w-document a')).toHaveCount(0);
  await expect(page.locator('.w-paragraph')).toContainText('Selected words');
});

for (const kind of ['각주', '미주']) test(`${kind} inserts a body and reference and survives reload`, async ({ page }) => {
  await textSelection(page);
  await tab(page, '참조').click();
  await page.getByRole('button', { name: `${kind} 삽입`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `${kind} 삽입`, exact: true });
  await dialog.getByLabel('주석 내용').fill(`${kind} 설명`);
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.w-document')).toContainText(`${kind} 설명`);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('.w-document')).toContainText(`${kind} 설명`);
});

test('uploaded picture embeds with alt text and persists', async ({ page }) => {
  await page.goto('/'); await placeCaret(page, '.w-paragraph');
  if (!await tab(page, '삽입').count()) await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await tab(page, '삽입').click();
  await page.getByRole('button', { name: '그림 삽입', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '그림 삽입', exact: true });
  await dialog.getByLabel('그림 파일', { exact: true }).setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await expect(dialog.getByRole('alert')).toContainText('파일 형식');
  await dialog.getByLabel('그림 파일', { exact: true }).setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
  await expect(dialog.locator('.w-authoring-image')).toBeVisible();
  await dialog.getByRole('button', { name: 'pixel.png 제거', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '적용', exact: true })).toBeDisabled();
  await dialog.getByLabel('그림 파일', { exact: true }).setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
  await expect(dialog.locator('.w-authoring-image')).toBeVisible();
  await dialog.getByLabel('그림 대체 텍스트').fill('Uploaded diagram');
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), letter => letter.charCodeAt(0));
    data.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
    return data;
  });
  await dialog.getByRole('group', { name: '그림 파일 놓기 영역' }).dispatchEvent('drop', { dataTransfer: transfer });
  await transfer.dispose();
  await expect(dialog.getByRole('button', { name: 'dropped.png 제거', exact: true })).toBeVisible();
  await dialog.getByLabel('그림 대체 텍스트').fill('Uploaded diagram');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.locator('.w-document img[alt="Uploaded diagram"]')).toHaveCount(1);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨'); await page.reload();
  await expect(page.locator('.w-document img[alt="Uploaded diagram"]')).toHaveCount(1);
});

test('clear formatting, new comment and replace are usable from the ribbon', async ({ page }) => {
  await textSelection(page, 'Review these words');
  await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await page.locator('[data-control=bold]').click();
  await expect(page.locator('[data-control=bold]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-control=clear-formatting]').click();
  await expect(page.locator('[data-control=bold]')).toHaveAttribute('aria-pressed', 'false');
  await tab(page, '검토').click();
  await page.getByRole('button', { name: '새 댓글', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '새 댓글', exact: true });
  await dialog.getByLabel('댓글 내용').fill('Please review');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.locator('.w-comments-pane')).toContainText('Please review');
  await tab(page, '홈').click(); await page.getByRole('button', { name: '바꾸기', exact: true }).click();
  await expect(page.getByLabel('바꿀 내용', { exact: true })).toBeFocused();
  await page.getByLabel('찾을 내용', { exact: true }).fill('Review');
  await page.getByLabel('바꿀 내용', { exact: true }).fill('Check');
  await page.getByRole('button', { name: '모두 바꾸기', exact: true }).click();
  await expect(page.locator('.w-paragraph').first()).toContainText('Check these words');
});

test('annotation controls are disabled without selected text; keyboard opens the link form', async ({ page }) => {
  await page.goto('/'); await placeCaret(page, '.w-paragraph'); await tab(page, '삽입').click();
  await expect(page.getByRole('button', { name: '링크 편집', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '그림 삽입', exact: true })).toBeEnabled();
  await placeCaret(page, '.w-paragraph'); await page.keyboard.type('Link me');
  await expect(page.locator('.w-paragraph')).toContainText('Link me');
  await expect.poll(() => page.evaluate(() => (window as any).editor.selection?.endOffset)).toBe(7);
  await page.locator('.w-text').first().click({ clickCount: 3 });
  await expect(page.getByRole('button', { name: '링크 편집', exact: true })).toBeEnabled();
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog', { name: '링크 편집', exact: true })).toBeVisible();
});
