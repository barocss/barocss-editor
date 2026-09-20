import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' });

test('standalone Note retains pointer insertion and Escape with a scoped slash surface', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByRole('button', { name: '새 노트', exact: true }).click();
  const body = page.locator('.on-doc').first();
  await body.locator('p').first().click();
  await page.keyboard.type('/');
  await expect(page.locator('[data-slash-item]').first()).toBeVisible();
  await page.keyboard.insertText('표');
  const item = page.locator('[data-slash-item="insertTableBlock"]');
  await expect(item).toBeVisible();
  expect(await item.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(true);
  await item.click();
  await expect(body.locator('table')).toHaveCount(1);
  await expect(page.locator('[data-slash-item]')).toHaveCount(0);
  await page.keyboard.insertText('STANDALONE');
  await expect(body.locator('table')).toContainText('STANDALONE');

  await body.locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' /');
  await expect(page.locator('[data-slash-item]').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-slash-item]')).toHaveCount(0);
  await page.keyboard.type('continue');
  await expect(body).toContainText('/continue');
});
