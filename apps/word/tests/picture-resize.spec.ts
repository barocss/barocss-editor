import { test, expect } from '@playwright/test';

for (const zoom of [75, 100, 150]) test(`body picture handles resize at ${zoom}% and undo once`, async ({ page }) => {
  await page.goto('/?sample=captions');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.locator('[data-zoom-value]').fill(String(zoom));
  await page.locator('[data-zoom-value]').press('Enter');
  const image = page.getByRole('img', { name: '첫 번째 그림', exact: true });
  await image.click();
  const before = (await image.boundingBox())!;
  if (zoom === 100) await page.screenshot({ path: '../../.dev/artifacts/design-system/selection-word.png' });
  const sid = await image.getAttribute('data-bc-sid');
  const attrs = () => page.evaluate(sid => (window as any).editor.dataStore.getNode(sid).attributes, sid);
  const original = await attrs();
  const selection = await page.evaluate(() => (window as any).editor.selection);
  const handle = page.locator('[data-drawing-handle="e"]');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2, { steps: 6 });
  expect(await attrs()).toEqual(original);
  await page.mouse.up();
  await expect.poll(async () => (await image.boundingBox())!.width - before.width).toBeCloseTo(45, 0);
  await expect.poll(async () => (await attrs()).width).toBeCloseTo(original.width + 45 / (zoom / 100) * 15, 0);
  expect((await attrs()).height).toBe(original.height);
  expect(await page.evaluate(() => (window as any).editor.selection)).toEqual(selection);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect.poll(attrs).toEqual(original);
  await page.evaluate(() => (window as any).editor.run('redo'));
  await expect.poll(async () => (await attrs()).width).toBeGreaterThan(original.width);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect.poll(async () => image.evaluate(el => (el as HTMLElement).offsetWidth)).toBeCloseTo((original.width + 45 / (zoom / 100) * 15) / 15, 0);
});

test('corner keeps aspect, Escape cancels, and read-only mode hides handles', async ({ page }) => {
  await page.goto('/?sample=captions');
  const image = page.getByRole('img', { name: '첫 번째 그림', exact: true });
  await image.click();
  const original = (await image.boundingBox())!;
  const corner = page.locator('[data-drawing-handle="se"]');
  let box = (await corner.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 4); await page.mouse.down();
  await page.mouse.move(box.x + 64, box.y + 4, { steps: 5 }); await page.keyboard.press('Escape'); await page.mouse.up();
  await expect.poll(async () => (await image.boundingBox())!.width).toBeCloseTo(original.width, 0);
  box = (await corner.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 4); await page.mouse.down();
  await page.mouse.move(box.x + 64, box.y + 4, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(original.width + 55);
  const changed = (await image.boundingBox())!;
  // Rendered image dimensions round to CSS pixels; the model retains twips.
  expect(Math.abs(changed.height - changed.width * original.height / original.width)).toBeLessThan(1);
  const ratio = await image.evaluate(el => {
    const attrs = (window as any).editor.dataStore.getNode(el.getAttribute('data-bc-sid')).attributes;
    return attrs.width / attrs.height;
  });
  expect(ratio).toBeCloseTo(original.width / original.height, 2);
  await expect.poll(async () => {
    const handle = (await corner.boundingBox())!;
    const picture = (await image.boundingBox())!;
    return Math.abs(handle.x + handle.width / 2 - picture.x - picture.width);
  }).toBeLessThan(2);
  box = (await corner.boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + 4, box.y + 4); await page.mouse.down();
  await page.mouse.move(box.x + 34, box.y + 4, { steps: 5 }); await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await image.boundingBox())!.width - changed.width).toBeCloseTo(30, 0);
  expect((await image.boundingBox())!.height).toBeCloseTo(changed.height, 0);
  await page.evaluate(() => (window as any).editor.setEditable(false));
  await expect(page.locator('[data-drawing-handle]')).toHaveCount(0);
  await page.evaluate(() => (window as any).editor.setEditable(true));
  await expect(page.locator('[data-drawing-handle]')).toHaveCount(8);
});

test('tiny inline picture keeps one operable corner', async ({ page }) => {
  await page.goto('/?sample=captions');
  const image = page.getByRole('img', { name: '첫 번째 그림', exact: true });
  await image.click();
  const sid = await image.getAttribute('data-bc-sid');
  await page.evaluate(async id => { const e = (window as any).editor; await e.transaction([{type:'setAttrs', payload:{nodeId:id,attrs:{width:150,height:150}}}]).commit(); }, sid);
  await expect(page.locator('[data-drawing-handle]')).toHaveCount(1);
  const handle = page.locator('[data-drawing-handle="se"]');
  const at = (await handle.boundingBox())!;
  await page.mouse.move(at.x+4, at.y+4); await page.mouse.down();
  await page.mouse.move(at.x+44, at.y+44,{steps:5}); await page.mouse.up();
  await expect.poll(() => image.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(30);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect.poll(() => image.evaluate(el => el.getBoundingClientRect().width)).toBeCloseTo(10,0);
});
