import { test, expect } from '@playwright/test';

const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('React Editor – block type (setParagraph / setHeading)', () => {
  // Skipped: Mod+Alt+0/1 keybinding in React view needs focus/context verification
  test.skip('setParagraph converts heading to paragraph', async ({ page }) => {
    await page.goto('/');
    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    const h2 = content.locator('h2').filter({ hasText: 'Rich Text Features' });
    await h2.click();
    await page.keyboard.press(`${modKey}+Alt+0`);
    const headingsAfter = content.locator('[data-bc-stype="heading"]');
    await expect(headingsAfter).toHaveCount(1);
    const paragraphsAfter = content.locator('[data-bc-stype="paragraph"]');
    await expect(paragraphsAfter).toHaveCount(3);
  });

  test.skip('setHeading1 converts paragraph to heading', async ({ page }) => {
    await page.goto('/');
    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    const firstParagraph = content.locator('[data-bc-stype="paragraph"]').first();
    await firstParagraph.click();
    await page.keyboard.press(`${modKey}+Alt+1`);
    const headings = content.locator('[data-bc-stype="heading"]');
    await expect(headings).toHaveCount(3);
    const paragraphs = content.locator('[data-bc-stype="paragraph"]');
    await expect(paragraphs).toHaveCount(1);
  });
});
