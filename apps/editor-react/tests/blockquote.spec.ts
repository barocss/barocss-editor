import { test, expect } from '@playwright/test';

const blockquoteShortcut = process.platform === 'darwin' ? 'Meta+Shift+b' : 'Control+Shift+b';

test.describe('React Editor – blockquote (wrapInBlockquote)', () => {
  test.skip('toggleBlockquote wraps paragraph in blockquote', async ({ page }) => {
    // Skip: keybinding/selection sync in CI (same as list E2E)
    await page.goto('/');
    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    await expect(content).toBeVisible();
    const firstParagraph = content.locator('[data-bc-stype="paragraph"]').first();
    await firstParagraph.click();
    await page.keyboard.press(blockquoteShortcut);
    await expect(content.locator('blockquote, [data-bc-stype="blockQuote"]')).toHaveCount(1, { timeout: 5000 });
  });
});
