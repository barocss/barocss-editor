import { test, expect } from '@playwright/test';

test.describe('React Editor – initial rendering', () => {
  test('renders content layer and initial document', async ({ page }) => {
    await page.goto('/');

    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    await expect(content).toBeVisible();

    // Document: h-1, h-2, p-1, p-2 (from document-data)
    const headings = content.locator('[data-bc-stype="heading"]');
    await expect(headings).toHaveCount(2);

    const paragraphs = content.locator('[data-bc-stype="paragraph"]');
    await expect(paragraphs).toHaveCount(2);

    await expect(content).toContainText('BaroCSS Editor Demo');
    await expect(content).toContainText('Rich Text Features');
    await expect(content).toContainText('This is a ');
    await expect(content).toContainText('bold text');
    await expect(content).toContainText('italic text');
    await expect(content).toContainText('Here is an inline image');
  });

  test('heading elements use correct levels', async ({ page }) => {
    await page.goto('/');

    const content = page.locator('[data-bc-layer="content"], [data-testid="editor-content"]').first();
    await expect(content.locator('h1')).toContainText('BaroCSS Editor Demo');
    await expect(content.locator('h2')).toContainText('Rich Text Features');
  });
});
