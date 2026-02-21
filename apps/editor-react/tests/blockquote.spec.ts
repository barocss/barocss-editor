import { test, expect } from '@playwright/test';

const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('React Editor – blockquote (wrapInBlockquote)', () => {
  test('toggleBlockquote wraps paragraph in blockquote', async ({ page }) => {
    await page.goto('/');
    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    await expect(content).toBeVisible();
    const firstParagraph = content.locator('[data-bc-stype="paragraph"]').first();
    await firstParagraph.click();
    await page.keyboard.press(`${modKey}+Shift+b`);
    await expect(content.locator('blockquote, [data-bc-stype="blockQuote"]')).toHaveCount(1, { timeout: 5000 });
  });
});
