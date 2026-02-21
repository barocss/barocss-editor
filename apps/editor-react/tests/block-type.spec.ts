import { test, expect } from '@playwright/test';

const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('React Editor – block type (setParagraph / setHeading)', () => {
  test('setParagraph converts heading to paragraph', async ({ page }) => {
    await page.goto('/');
    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    await expect(content).toBeVisible();

    const h2 = content.locator('h2').filter({ hasText: 'Rich Text Features' });
    await expect(h2).toBeVisible({ timeout: 5000 });
    await h2.click();
    await page.keyboard.press(`${modKey}+Alt+0`);
    const headingsAfter = content.locator('[data-bc-stype="heading"]');
    await expect(headingsAfter).toHaveCount(1, { timeout: 5000 });
    const paragraphsAfter = content.locator('[data-bc-stype="paragraph"]');
    await expect(paragraphsAfter).toHaveCount(3, { timeout: 5000 });
  });

  test('setHeading1 converts paragraph to heading', async ({ page }) => {
    await page.goto('/');
    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    await expect(content).toBeVisible();

    const firstParagraph = content.locator('[data-bc-stype="paragraph"]').first();
    await expect(firstParagraph).toBeVisible({ timeout: 5000 });
    await firstParagraph.click();
    await page.keyboard.press(`${modKey}+Alt+1`);
    const headings = content.locator('[data-bc-stype="heading"]');
    await expect(headings).toHaveCount(3, { timeout: 5000 });
    const paragraphs = content.locator('[data-bc-stype="paragraph"]');
    await expect(paragraphs).toHaveCount(1, { timeout: 5000 });
  });
});
