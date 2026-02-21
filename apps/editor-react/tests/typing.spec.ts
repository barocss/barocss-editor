import { test, expect } from '@playwright/test';

test.describe('React Editor – typing (insertText)', () => {
  test('typing inserts text into focused paragraph', async ({ page }) => {
    await page.goto('/');

    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    await expect(content).toBeVisible();

    const firstParagraph = content.locator('[data-bc-stype="paragraph"]').first();
    await firstParagraph.click();

    await page.keyboard.type(' E2E', { delay: 50 });

    await expect(content).toContainText('E2E');
  });

  test('backspace removes typed text', async ({ page }) => {
    await page.goto('/');
    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    await expect(content).toBeVisible();

    const firstParagraph = content.locator('[data-bc-stype="paragraph"]').first();
    await firstParagraph.click();
    await page.keyboard.press('End');

    const unique = 'zz';
    await page.keyboard.type(unique, { delay: 50 });
    await expect(content).toContainText(unique, { timeout: 5000 });
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(content).not.toContainText(unique, { timeout: 5000 });
  });

  test('typing at end of heading appends text', async ({ page }) => {
    await page.goto('/');
    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    await expect(content).toBeVisible();

    const h1 = content.locator('h1').filter({ hasText: 'BaroCSS Editor Demo' });
    await expect(h1).toBeVisible({ timeout: 5000 });
    await h1.click();
    await page.keyboard.press('End');
    await page.keyboard.type('!', { delay: 50 });
    await expect(content).toContainText('BaroCSS Editor Demo!', { timeout: 5000 });
  });
});
