import { test, expect } from '@playwright/test';

const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('React Editor – list (wrapInList / splitListItem)', () => {
  test('toggleBulletList wraps paragraph in list; Enter in list item creates new list item', async ({ page }) => {
    await page.goto('/');

    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    await expect(content).toBeVisible();

    const firstParagraph = content.locator('[data-bc-stype="paragraph"]').first();
    await firstParagraph.click();

    await page.keyboard.press(`${modKey}+Shift+8`);
    const listOrUl = content.locator('ul, ol, [data-bc-stype="list"]');
    await expect(listOrUl).toHaveCount(1, { timeout: 5000 });
    const listItems = content.locator('li, [data-bc-stype="listItem"]');
    await expect(listItems).toHaveCount(1, { timeout: 5000 });

    await page.keyboard.press('Enter');
    await expect(listItems).toHaveCount(2, { timeout: 5000 });
  });

  test('Enter in paragraph (not list) still inserts new paragraph', async ({ page }) => {
    await page.goto('/');

    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    await expect(content).toBeVisible();

    const paragraphsBefore = content.locator('[data-bc-stype="paragraph"]');
    await expect(paragraphsBefore).toHaveCount(2, { timeout: 10000 });

    const secondParagraph = content.locator('[data-bc-stype="paragraph"]').nth(1);
    await secondParagraph.click();
    await page.keyboard.press('Enter');

    const paragraphsAfter = content.locator('[data-bc-stype="paragraph"]');
    await expect(paragraphsAfter).toHaveCount(3, { timeout: 10000 });
  });
});
