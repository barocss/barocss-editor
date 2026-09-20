import { expect, test, type Page } from '@playwright/test';

async function openBody(page: Page) {
  await page.goto('/');
  await page.locator('[data-admin-tab="data"]').click();
  await page.locator('[data-admin-open]').last().click();
  await page.locator('[data-row-open]').first().click();
  const body = page.locator('[data-row-form] [data-field="본문"] [data-note-body]');
  await body.locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  return body;
}

test.use({ viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' });

test('row slash table receives the actual pointer and keeps editing inside the drawer', async ({ page }, info) => {
  const body = await openBody(page);
  const summary = page.locator('[data-row-form] [data-field="요약"] [data-note-body]');
  const originalSummary = await summary.innerText();
  const originalBody = await body.innerText();
  await page.keyboard.type('/');
  await expect(page.locator('[data-slash-item]').first()).toBeVisible();
  await page.keyboard.insertText('표');
  const row = page.locator('[data-slash-item="insertTableBlock"]');
  await expect(page.locator('[data-slash-item]')).toHaveCount(2);
  await expect(row).toBeVisible();
  const hit = await row.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const target = element.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { receivesPointer: element.contains(target), pointerEvents: getComputedStyle(element).pointerEvents };
  });
  await info.attach('menu-hit-test', { body: JSON.stringify(hit), contentType: 'application/json' });
  expect(hit.receivesPointer).toBe(true);
  const box = await row.boundingBox();
  if (!box) throw new Error('The visible table command must have bounds');
  await page.screenshot({ path: info.outputPath('row-slash-menu.png') });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(body.locator('table')).toHaveCount(1);
  await expect(page.locator('[data-slash-item]')).toHaveCount(0);
  await expect(page.locator('[data-row-form]')).toBeVisible();
  await expect(summary).toHaveText(originalSummary);
  expect(await body.innerText()).toContain(originalBody.trim());
  await page.keyboard.insertText('TABLEINPUT');
  await expect(body.locator('table')).toContainText('TABLEINPUT');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-row-form] [data-field="본문"] [contenteditable="true"]'))).toBe(true);
  await page.screenshot({ path: info.outputPath('row-slash-table.png') });
});

test('row slash filter and Escape keep the modal open and its background blocked', async ({ page }) => {
  await openBody(page);
  await page.keyboard.type('/');
  await expect(page.locator('[data-slash-item]').first()).toBeVisible();
  await page.keyboard.insertText('구분');
  await expect(page.locator('[data-slash-item]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-slash-item]')).toHaveCount(0);
  await expect(page.locator('[data-row-form]')).toBeVisible();
  const background = page.locator('[data-row-open]').first();
  expect(await background.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(false);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-office-dialog]'))).toBe(true);
});

test('row slash keyboard selection inserts the filtered block', async ({ page }) => {
  const body = await openBody(page);
  const count = await body.locator('hr').count();
  await page.keyboard.type('/');
  await expect(page.locator('[data-slash-item]').first()).toBeVisible();
  await page.keyboard.insertText('구분');
  await expect(page.locator('[data-slash-item]')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(body.locator('hr')).toHaveCount(count + 1);
  await expect(page.locator('[data-slash-item]')).toHaveCount(0);
  await expect(page.locator('[data-row-form]')).toBeVisible();
});
