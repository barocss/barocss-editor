import { test } from '@playwright/test';
test('does it load', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('C:' + m.text().slice(0, 200)); });
  await page.goto('/');
  await page.waitForTimeout(3000);
  console.log('SHEETS', await page.locator('.w-sheet').count());
  console.log('ERRORS', JSON.stringify(errs.slice(0, 3)));
});
