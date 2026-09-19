import { expect, test } from '@playwright/test';
import { openDeck } from './helpers';

test('property arrow keys leave the shape unchanged until commit and undo restores it once', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: '사각형', exact: true }).click();
  const id = await page.evaluate(() => (window as any).editor.selection.nodeIds[0]);
  const attrs = () => page.evaluate(id => ({ ...(window as any).editor.dataStore.getNode(id).attributes }), id);
  const before = await attrs();
  const width = page.locator('.sl-properties').getByRole('spinbutton', { name: '너비', exact: true });
  await width.press('Shift+ArrowUp');
  await width.press('Shift+ArrowUp');
  await width.press('Alt+ArrowDown');
  expect(await attrs()).toEqual(before);
  await width.press('Enter');
  await expect.poll(async () => (await attrs()).width).not.toBe(before.width);
  const after = await attrs();
  expect(after.x).toBe(before.x); expect(after.y).toBe(before.y);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect.poll(attrs).toEqual(before);

  const trigger = page.getByRole('button', { name: '선 색', exact: true });
  await trigger.press('Enter');
  const popup = page.locator('[data-color-panel="선 색"]');
  await expect(popup.getByRole('textbox', { name: '색상 코드' })).toBeFocused();
  const viewport = page.viewportSize()!;
  const bounds = await popup.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(8);
  expect(bounds!.y).toBeGreaterThanOrEqual(8);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width - 8);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height - 8);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(popup).toHaveCount(0);
});
