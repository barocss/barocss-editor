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

    // The paragraph command finishes a heading with prose. Only a split
    // inside the heading keeps the heading type (extensions/src/paragraph.ts).
    const headings = content.locator('[data-bc-stype="heading"]');
    await expect(headings).toHaveCount(2, { timeout: 5000 });
    const paragraphs = content.locator('[data-bc-stype="paragraph"]');
    await expect(paragraphs).toHaveCount(3, { timeout: 5000 });
    await expect(h2).toHaveText('Rich Text Features');
    const followingBlock = h2.locator('xpath=following-sibling::*[1]');
    await expect(followingBlock).toHaveAttribute('data-bc-stype', 'paragraph');
    const blockId = await followingBlock.getAttribute('data-bc-sid');
    await expect.poll(() => page.evaluate(() => {
      const anchor = window.getSelection()?.anchorNode;
      const element = anchor instanceof Element ? anchor : anchor?.parentElement;
      return element?.closest('[data-bc-stype="paragraph"]')?.getAttribute('data-bc-sid');
    })).toBe(blockId);
    await page.keyboard.type('After heading');
    await expect(followingBlock).toHaveText('After heading');
  });
});
