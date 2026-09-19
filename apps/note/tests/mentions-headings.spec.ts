import { test, expect, type Page } from '@playwright/test';
const p = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });
async function load(page: Page, id: string, title: string, content: unknown[]) {
  await page.getByLabel('노트 파일').setInputFiles({ name: 'mention.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { pageId: id, title }, content } })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue(title);
}
test('@ mentions respect Escape and composition, insert a page reference and navigate', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await load(page, 'mention-target', 'Mention Target', [p('Destination')]);
  await load(page, 'mention-source', 'Mention Source', [p('Before ')]);
  const body = page.locator('.on-doc > p').first();
  await body.click(); await page.keyboard.press('End'); await page.keyboard.insertText('@Mention Target');
  const picker = page.getByRole('listbox', { name: '페이지 연결', exact: true });
  await expect(picker.getByRole('option')).toHaveCount(1);
  await body.dispatchEvent('compositionstart'); await expect(picker).toBeHidden();
  await expect(page.locator('[data-note-page-reference]')).toHaveCount(0);
  await body.dispatchEvent('compositionend'); await expect(picker).toBeVisible();
  await page.keyboard.press('Escape'); await expect(picker).toBeHidden();
  await expect(body).toContainText('@Mention Target');
  await page.keyboard.press('Backspace'); await page.keyboard.insertText('t');
  await expect(picker).toBeVisible(); await page.keyboard.press('Enter');
  const reference = page.locator('[data-note-page-reference]');
  await expect(reference).toHaveAttribute('data-page-id', 'mention-target');
  await page.keyboard.press('Control+z'); await expect(reference).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z'); await expect(reference).toHaveCount(1);
  await reference.click(); await expect(page.getByLabel('노트 제목')).toHaveValue('Mention Target');
});
test('text selection can convert heading levels and return to paragraph with undo', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await load(page, 'heading-level', 'Heading levels', [p('Selected heading')]);
  const body = page.locator('.on-doc');
  await body.locator('p').click(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await page.getByRole('button', { name: '문단 및 제목 수준', exact: true }).click();
  await page.getByRole('group', { name: '문단 유형', exact: true }).getByRole('button', { name: '제목 6', exact: true }).click();
  await expect(body.locator('h6')).toHaveText('Selected heading');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('Selected heading');
  await page.getByRole('button', { name: '문단 및 제목 수준', exact: true }).click();
  await page.getByRole('group', { name: '문단 유형', exact: true }).getByRole('button', { name: '문단', exact: true }).click();
  await expect(body.locator('p')).toHaveText('Selected heading');
  await page.keyboard.press('Control+z'); await expect(body.locator('h6')).toHaveText('Selected heading');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload(); await expect(body.locator('h6')).toHaveText('Selected heading');
});
