import { test, expect } from '@playwright/test';

test.describe('EditorViewDOM rendering', () => {
  test('renders content layer and initial document from editor-test app', async ({ page }) => {
    await page.goto('/');
    const content = page.locator('[data-bc-layer="content"]');
    await expect(content).toBeVisible();

    // Document wrapper must not appear as direct child of content layer (root is rendered without wrapper in content)
    await expect(content.locator('[data-bc-stype="document"]')).toHaveCount(0);

    // Current initial tree: 2 headings + 2 paragraphs
    const paragraphs = content.locator('[data-bc-stype="paragraph"]');
    await expect(paragraphs).toHaveCount(2);

    // Visible text from current initialTree in main.ts
    await expect(content).toContainText('BaroCSS Editor Demo');
    await expect(content).toContainText('Rich Text Features');
    await expect(content).toContainText('This is a ');
    await expect(content).toContainText('bold text');
    await expect(content).toContainText('italic text');
  });
});

