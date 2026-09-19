import { test, expect, type Page } from '@playwright/test';
import { placeCaret } from './helpers';

const documentJSON = (page: Page) => page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await placeCaret(page, '.w-paragraph');
  await page.getByRole('tab', { name: '삽입', exact: true }).click();
  await page.getByRole('button', { name: '본문 수식', exact: true }).click();
  await expect(page.locator('.w-math-draft .me-input')).toBeFocused();
}

test('inline draft preserves the document, Escape cancels, Enter inserts with one undo', async ({ page }) => {
  await open(page);
  const before = await documentJSON(page);
  const input = page.locator('.w-math-draft .me-input');
  await input.fill('x+24');
  expect(await documentJSON(page)).toBe(before);
  await input.press('Backspace');
  await expect(input).toHaveValue('2');
  expect(await documentJSON(page)).toBe(before);
  await page.locator('.w-math-draft').getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.locator('.w-math-draft')).toHaveCount(0);
  expect(await documentJSON(page)).toBe(before);
  await page.getByRole('button', { name: '본문 수식', exact: true }).click();
  await input.fill('x+2'); await input.press('Enter');
  await expect(page.locator('.w-math-draft')).toHaveCount(0);
  await expect(page.locator('#editor .w-math')).toContainText('x+2');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => (window as any).editor.executeCommand('undo'));
  expect(await documentJSON(page)).toBe(before);
});

test('double click edits at the equation, preserves Word rendering and persists after reload', async ({ page }) => {
  await open(page);
  await page.locator('.w-math-draft .me-input').fill('x+2');
  await page.locator('.w-math-draft .me-input').press('Enter');
  const math = page.locator('#editor .w-math');
  await math.dblclick();
  const input = page.locator('.w-math-draft .me-input');
  await expect(input).toBeFocused(); await expect(input).toHaveValue('x');
  await input.fill('ζ'); await input.press('Enter');
  await expect(page.locator('.w-math-draft')).toHaveCount(0);
  await expect(math).toContainText('ζ+2');
  // Returning to the paragraph must not type into the first math slot.
  await page.keyboard.type(' AFTER');
  await expect(math.locator(':scope > .w-math-run')).toHaveText('ζ+2');
  await expect(page.locator('#editor')).toContainText(' AFTER');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload(); await expect(math.locator(':scope > .w-math-run')).toHaveText('ζ+2');
  await math.dblclick(); await input.fill('η');
  if (await page.locator('.me-suggestion-panel').isVisible()) await input.press('Escape');
  await input.press('Escape');
  await expect(math.locator(':scope > .w-math-run')).toHaveText('ζ+2');
});

test('suggestions own arrow keys and Enter before the inline commit', async ({ page }) => {
  await open(page); const before = await documentJSON(page);
  const input = page.locator('.w-math-draft .me-input:focus');
  await input.fill('x/');
  const menu = page.locator('.me-suggestion-panel');
  await expect(menu).toBeVisible(); await input.press('ArrowDown');
  await expect(menu.locator('[aria-selected="true"]')).toContainText('분수');
  await input.press('Enter');
  await expect(page.locator('.w-math-draft .me-fraction')).toHaveCount(1);
  expect(await documentJSON(page)).toBe(before);
  await page.locator('.w-math-draft').getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.locator('.w-math-draft')).toHaveCount(0);
  expect(await documentJSON(page)).toBe(before);
});

test('leaving the draft commits before paragraph input resumes', async ({ page }) => {
  await open(page);
  await page.locator('.w-math-draft .me-input').fill('ζ');
  await page.getByRole('tab', { name: '홈', exact: true }).click();
  await expect(page.locator('.w-math-draft')).toHaveCount(0);
  await expect(page.locator('#editor .w-math > .w-math-run')).toHaveText('ζ');
  await expect(page.locator('#editor [data-editor-input-owner="word-math"]')).toHaveCount(0);
  await page.keyboard.type(' 뒤');
  await expect(page.locator('#editor .w-math > .w-math-run')).toHaveText('ζ');
  await expect(page.locator('#editor')).toContainText(' 뒤');
});

test('Word fractions reopen in math-editor without changing the saved structure', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await placeCaret(page, '.w-paragraph');
  await page.getByRole('tab', { name: '삽입', exact: true }).click();
  await page.getByRole('button', { name: '수식 삽입', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'LaTeX 수식', exact: true }).fill(String.raw`\frac{x}{2}+\frac{y}{2}=30`);
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  const before = await documentJSON(page);
  await page.locator('#editor .w-math').dblclick();
  await expect(page.locator('.w-math-draft .me-fraction')).toHaveCount(2);
  await page.screenshot({ path: '/tmp/word-math-inline.png' });
  await page.locator('.w-math-draft').getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.locator('.w-math-draft')).toHaveCount(0);
  expect(await documentJSON(page)).toBe(before);
  await expect(page.locator('#editor .w-math-frac')).toHaveCount(2);
});
