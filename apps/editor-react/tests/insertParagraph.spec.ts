import { test, expect } from '@playwright/test';

test.describe('React Editor – insertParagraph (Enter)', () => {
  test('Enter in content layer triggers insertParagraph and adds new block', async ({ page }) => {
    await page.goto('/');

    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    await expect(content).toBeVisible();

    const paragraphsBefore = content.locator('[data-bc-stype="paragraph"]');
    await expect(paragraphsBefore).toHaveCount(2, { timeout: 10000 });

    // Focus editor and place cursor at end of first paragraph text ("BaroCSS Editor Demo" heading is h-1, then h-2 "Rich Text Features", then p-1)
    // Click in the first paragraph area so we have a caret there
    const firstParagraph = content.locator('[data-bc-stype="paragraph"]').first();
    await firstParagraph.click();

    // Press Enter to trigger insertParagraph
    await page.keyboard.press('Enter');

    // After Enter: should have 3 blocks (one new paragraph inserted); allow time for re-render
    const paragraphsAfter = content.locator('[data-bc-stype="paragraph"]');
    await expect(paragraphsAfter).toHaveCount(3, { timeout: 10000 });
  });

  test.skip('Enter at end of heading inserts new block below (same type)', async ({ page }) => {
    await page.goto('/');
    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    const h2 = content.locator('h2').filter({ hasText: 'Rich Text Features' });
    await h2.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    const headings = content.locator('[data-bc-stype="heading"]');
    await expect(headings).toHaveCount(3);
    const paragraphs = content.locator('[data-bc-stype="paragraph"]');
    await expect(paragraphs).toHaveCount(2);
  });
});
