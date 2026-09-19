import { test, expect } from '@playwright/test';
import { openDeck, currentSlide } from './helpers';

async function openCanvas(page: import('@playwright/test').Page) {
  await openDeck(page);
  await page.locator('[data-focus-toggle]').click();
  await expect(page.locator('.sl-stage')).toHaveAttribute('data-freeboard', 'true');
  await expect(page.locator('[data-board-label]')).toHaveCount(6);
}

test('places slides in two dimensions and activates the slide being edited', async ({ page }) => {
  await openCanvas(page);
  const labels = page.locator('[data-board-label]');
  const first = await labels.nth(0).boundingBox();
  const second = await labels.nth(1).boundingBox();
  expect(second!.x).toBeGreaterThan(first!.x + 100);
  expect(Math.abs(second!.y - first!.y)).toBeLessThan(2);
  const sid = await labels.nth(1).getAttribute('data-board-label');
  const text = page.locator(`.sl-stage .sl-slide[data-bc-sid="${sid}"] .sl-text-frame`).first();
  await text.click();
  await expect(page.locator('.sl-count')).toHaveText('2 / 6');
  expect(await currentSlide(page)).toBe(sid);
  await expect(page.locator('.sl-properties')).toContainText('위치');
  await text.dblclick({ force: true });
  await page.keyboard.press('End');
  await page.keyboard.type(' canvas');
  await expect(text).toContainText('canvas');
  await expect(page.locator('.sl-count')).toHaveText('2 / 6');
  const slide = page.locator(`.sl-stage .sl-slide[data-bc-sid="${sid}"]`);
  const before = await slide.locator('.sl-rectangle').count();
  await page.locator('[data-control="insert-rectangle"]').click();
  await expect(slide.locator('.sl-rectangle')).toHaveCount(before + 1);
});

test('moves a slide without changing slide order or local object coordinates and undoes once', async ({ page }) => {
  await openCanvas(page);
  const label = page.locator('[data-board-label]').first();
  const sid = await label.getAttribute('data-board-label');
  const before = await label.boundingBox();
  const objectAttrs = await page.evaluate(sid => {
    const ed = (window as any).editor;
    return JSON.stringify(ed.dataStore.getNode(ed.dataStore.getNode(sid).content[0]).attributes);
  }, sid);
  await page.mouse.move(before!.x + 12, before!.y + 12);
  await page.mouse.down();
  await page.mouse.move(before!.x + 105, before!.y + 45, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await label.boundingBox())!.x).toBeCloseTo(before!.x + 93, 0);
  const attrs = await page.evaluate(sid => (window as any).editor.dataStore.getNode(sid).attributes, sid);
  expect(attrs.canvasX).toBeGreaterThan(0);
  expect(attrs.canvasY).toBeGreaterThan(0);
  const result = await page.evaluate(sid => {
    const ed = (window as any).editor;
    return JSON.stringify(ed.dataStore.getNode(ed.dataStore.getNode(sid).content[0]).attributes);
  }, sid);
  expect(result).toBe(objectAttrs);
  expect(await currentSlide(page)).toBe(sid);
  await page.evaluate(() => (window as any).editor.undo());
  await expect.poll(async () => (await label.boundingBox())!.x).toBeCloseTo(before!.x, 0);
  await page.evaluate(() => (window as any).editor.redo());
  await expect.poll(async () => (await label.boundingBox())!.x).toBeCloseTo(before!.x + 93, 0);
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  await page.locator('[data-focus-toggle]').click();
  const restoredSid = await page.locator('[data-board-label]').first().getAttribute('data-board-label');
  expect(await page.evaluate(sid => (window as any).editor.dataStore.getNode(sid).attributes.canvasX, restoredSid)).toBe(attrs.canvasX);
  expect(await page.evaluate(sid => (window as any).editor.dataStore.getNode(sid).attributes.canvasY, restoredSid)).toBe(attrs.canvasY);
});

test('pans both axes, keeps selection geometry aligned, and zooms without changing content', async ({ page }) => {
  await openCanvas(page);
  const label = page.locator('[data-board-label]').first();
  const sid = await label.getAttribute('data-board-label');
  const slide = page.locator(`.sl-stage .sl-slide[data-bc-sid="${sid}"]`);
  const before = await slide.boundingBox();
  const stage = await page.locator('.sl-stage').boundingBox();
  await page.mouse.move(stage!.x + stage!.width - 30, stage!.y + 100);
  await page.mouse.wheel(65, 40);
  await expect.poll(async () => (await slide.boundingBox())!.x).toBeCloseTo(before!.x - 65, 0);
  const after = await slide.boundingBox();
  const overlay = await page.locator('.sl-overlay').boundingBox();
  expect(overlay!.x).toBeCloseTo(after!.x, 0);
  expect(overlay!.y).toBeCloseTo(after!.y, 0);
  await page.mouse.move(after!.x + after!.width / 2, after!.y + after!.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(after!.x + after!.width / 2 + 70, after!.y + after!.height / 2 + 30, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  await expect.poll(async () => (await slide.boundingBox())!.x).toBeCloseTo(after!.x + 70, 0);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await slide.boundingBox())!.width).toBeGreaterThan(before!.width);
  expect(await page.evaluate(sid => (window as any).editor.dataStore.getNode(sid).attributes.canvasX, sid)).toBeUndefined();
});
