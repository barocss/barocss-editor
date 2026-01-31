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

  test.skip('backspace removes typed text', async ({ page }) => {
    await page.goto('/');
    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    const firstParagraph = content.locator('[data-bc-stype="paragraph"]').first();
    await firstParagraph.click();
    const unique = 'tt';
    await page.keyboard.type(unique, { delay: 50 });
    await expect(content).toContainText(unique);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(content).not.toContainText(unique);
  });

  test.skip('typing at end of heading appends text', async ({ page }) => {
    await page.goto('/');
    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    const h1 = content.locator('h1').filter({ hasText: 'BaroCSS Editor Demo' });
    await h1.click();
    await page.keyboard.press('End');
    await page.keyboard.type('!', { delay: 50 });
    await expect(content).toContainText('!');
  });
});
