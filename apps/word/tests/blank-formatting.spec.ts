import { test, expect, type Page } from '@playwright/test';
import { placeCaret } from './helpers';

async function chooseStyle(page: Page, label: string) {
  await page.locator('.w-toolbar-style').click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

test('blank headings change visible text, persist and return to body style', async ({ page }) => {
  await page.goto('/');
  await placeCaret(page, '.w-paragraph');
  await page.keyboard.type('A real heading');
  const textSize = (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el.querySelector('[data-bc-sid]') ?? el).fontSize);
  const bodySize = await textSize('.w-paragraph');
  await chooseStyle(page, 'Heading 1');
  await expect(page.locator('h1.w-heading')).toContainText('A real heading');
  expect(parseFloat(await textSize('.w-heading'))).toBeGreaterThan(parseFloat(bodySize));
  await expect(page.locator('.w-heading')).toHaveAttribute('data-style', 'Heading1');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('h1.w-heading')).toContainText('A real heading');
  expect(parseFloat(await textSize('.w-heading'))).toBeGreaterThan(parseFloat(bodySize));
  await placeCaret(page, '.w-heading');
  await chooseStyle(page, 'Heading 2');
  await expect(page.locator('h2.w-heading')).toContainText('A real heading');
  for (const level of [3, 4, 5, 6]) {
    await chooseStyle(page, `Heading ${level}`);
    await expect(page.locator(`h${level}.w-heading`)).toContainText('A real heading');
    await expect(page.locator('.w-toolbar-style')).toContainText(`Heading ${level}`);
  }
  await chooseStyle(page, 'Body text');
  await expect(page.locator('.w-paragraph')).toContainText('A real heading');
  expect(await textSize('.w-paragraph')).toBe(bodySize);
});

test('blank document alignment, lists and bold work through the toolbar', async ({ page }) => {
  await page.goto('/');
  await placeCaret(page, '.w-paragraph');
  await page.keyboard.type('Formatting check');
  await page.locator('[data-control="align-center"]').click();
  await expect(page.locator('.w-paragraph')).toHaveCSS('text-align', 'center');
  await expect(page.getByRole('toolbar', { name: '기본 문서 도구' })).toBeVisible();
  await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await page.locator('[data-control="bullet-list"]').click();
  await expect(page.locator('[data-control="bullet-list"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.w-paragraph')).toHaveAttribute('data-marker', /\S/);
  await expect(page.locator('.w-paragraph')).toHaveText('Formatting check');
  await page.locator('[data-control="bullet-list"]').click();
  await expect(page.locator('[data-control="bullet-list"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.w-paragraph')).toHaveAttribute('data-marker', '');
  await placeCaret(page, '.w-paragraph');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await expect.poll(() => page.evaluate(() => (window as any).editor.selection?.collapsed)).toBe(false);
  await page.locator('[data-control="bold"]').click();
  await expect(page.locator('.mark-bold')).toContainText('Formatting check');
});

test('Enter after a heading starts body text and undo restores the heading', async ({ page }) => {
  await page.goto('/');
  await placeCaret(page, '.w-paragraph');
  await page.keyboard.type('Title');
  await chooseStyle(page, 'Heading 1');
  await placeCaret(page, '.w-heading');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Body');
  await expect(page.locator('.w-paragraph')).toContainText('Body');
  await expect(page.locator('.w-paragraph')).toHaveAttribute('data-style', 'Body');
  await expect(page.locator('.w-toolbar-style')).toContainText('Body text');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.w-paragraph')).toHaveText('');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.w-paragraph')).toHaveCount(0);
  await expect(page.locator('.w-heading')).toHaveText('Title');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('.w-paragraph')).toHaveAttribute('data-style', 'Body');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('.w-paragraph')).toHaveText('Body');
});
