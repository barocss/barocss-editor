import { expect, test } from '@playwright/test';

test('closing the row preserves a note edit before idle delivery', async ({ page }) => {
  // Hold only Note's idle delivery so this tests close, not a lucky 350ms pause.
  await page.addInitScript(() => {
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
      schedule(handler, delay === 350 ? 60_000 : delay, ...args)) as typeof window.setTimeout;
  });
  await page.goto('/');
  await page.locator('[data-admin-tab="data"]').click();
  await page.locator('[data-admin-open]').last().click();
  await page.locator('[data-row-open]').first().click();

  const field = page.locator('[data-row-form] [data-field="본문"] [data-note-body]');
  const unchanged = await page.locator('[data-row-form] [data-field="요약"] [data-note-body]').innerText();
  const marker = ' close preserves the final words';
  await field.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(marker);
  await expect(field).toContainText(marker);

  // The source document still has the old body: the idle callback has not run.
  const hostHasMarker = () => page.evaluate((text) =>
    JSON.stringify((window as unknown as { editor: { exportDocument(): unknown } }).editor.exportDocument())
      .includes(text), marker);
  expect(await hostHasMarker()).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-row-form]')).toHaveCount(0);
  await expect.poll(hostHasMarker).toBe(true);

  await page.locator('[data-row-open]').first().click();
  await expect(field).toContainText(marker);
  await expect(page.locator('[data-row-form] [data-field="요약"] [data-note-body]')).toHaveText(unchanged);
});
