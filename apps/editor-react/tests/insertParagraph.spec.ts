import { test, expect } from '@playwright/test';

test.describe('React Editor – insertParagraph (Enter)', () => {
  test('Enter in content layer triggers insertParagraph and adds new block', async ({ page }) => {
    await page.goto('/');

    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    await expect(content).toBeVisible();

    const paragraphsBefore = content.locator('[data-bc-stype="paragraph"]');
    await expect(paragraphsBefore).toHaveCount(2, { timeout: 10000 });

    const firstParagraph = content.locator('[data-bc-stype="paragraph"]').first();
    await firstParagraph.click();

    await page.keyboard.press('Enter');

    const paragraphsAfter = content.locator('[data-bc-stype="paragraph"]');
    await expect(paragraphsAfter).toHaveCount(3, { timeout: 10000 });
  });

  test('Enter at end of heading inserts new block below', async ({ page }) => {
    await page.goto('/');
    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    await expect(content).toBeVisible();

    const h2 = content.locator('h2').filter({ hasText: 'Rich Text Features' });
    await expect(h2).toBeVisible({ timeout: 5000 });
    await h2.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    // After pressing Enter at end of a heading, a new block is created
    // The document now has: h-1, h-2, new-block, p-1, p-2
    // The new block type depends on insertParagraph blockType config ('same' default means heading)
    const headings = content.locator('[data-bc-stype="heading"]');
    await expect(headings).toHaveCount(3, { timeout: 5000 });
    const paragraphs = content.locator('[data-bc-stype="paragraph"]');
    await expect(paragraphs).toHaveCount(2, { timeout: 5000 });
  });
});
