import { expect, test } from '@playwright/test';
test('embedded Note supports Enter, Backspace and undo in the Site body',async({page})=>{
  await page.goto('/');
  await page.locator('[data-admin-tab="data"]').click();
  await page.locator('[data-admin-open]').last().click();
  await page.locator('[data-row-open]').first().click();
  const body=page.locator('[data-row-form] [data-field="본문"] [data-note-body]');
  const paragraphs=body.locator('p');await expect(paragraphs.first()).toBeVisible();const count=await paragraphs.count();
  await paragraphs.first().click();await page.keyboard.press('End');await page.keyboard.type(' SE04');await expect(body).toContainText('SE04');
  await page.keyboard.press('Enter');await expect(paragraphs).toHaveCount(count+1);
  await page.keyboard.press('Backspace');await expect(paragraphs).toHaveCount(count);await expect(body).toContainText('SE04');
  await page.keyboard.press('Control+z');await expect(paragraphs).toHaveCount(count+1);
});
