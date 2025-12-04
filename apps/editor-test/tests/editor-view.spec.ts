import { test, expect } from '@playwright/test';

test.describe('EditorViewDOM rendering', () => {
  test('renders paragraphs directly under contenteditable', async ({ page }) => {
    await page.goto('/');
    const content = page.locator('[data-bc-layer="content"]');
    await expect(content).toBeVisible();

    // document 래퍼는 없어야 함
    await expect(content.locator('[data-bc-stype="document"]')).toHaveCount(0);

    // 문단 2개, 텍스트 2개 확인
    await expect(content.locator('[data-bc-stype="paragraph"]')).toHaveCount(2);
    await expect(content.locator('[data-bc-stype="text"]')).toHaveCount(2);

    // 텍스트 내용 검증
    await expect(content).toContainText('Hello, EditorViewDOM!');
    await expect(content).toContainText('Type here to test.');
  });
});

