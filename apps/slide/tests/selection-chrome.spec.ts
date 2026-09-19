import { test, expect } from '@playwright/test';
import { openDeck } from './helpers';

test('shared handles resize the slide shape and preserve undo', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: '사각형', exact: true }).click();
  const handle = page.locator('.sl-handles [data-handle="se"]');
  await expect(handle).toBeVisible();
  const sid = await page.evaluate(() => (window as any).editor.selection.nodeIds[0]);
  const attrs = () => page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes, sid);
  const before = await attrs();
  await page.screenshot({ path: '../../.dev/artifacts/design-system/selection-slides.png' });
  const box = (await handle.boundingBox())!;
  expect(box.width).toBe(8); expect(box.height).toBe(8);
  await page.mouse.move(box.x + 4, box.y + 4); await page.mouse.down();
  await page.mouse.move(box.x + 44, box.y + 34, { steps: 5 });
  await expect(page.locator('body > [data-drag-readout]')).toBeVisible();
  expect(await page.locator('[data-drag-readout]').evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
  await page.screenshot({ path: '../../.dev/artifacts/design-system/selection-readout-slides.png' });
  await page.mouse.up();
  await expect(page.locator('[data-drag-readout]')).toHaveCount(0);
  await expect.poll(async () => (await attrs()).width).toBeGreaterThan(before.width);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect.poll(attrs).toEqual(before);
  const rotate = page.locator('.sl-handles [data-handle="rotate"]');
  const turn = (await rotate.boundingBox())!;
  const magnets = await page.locator('.sl-magnet').evaluateAll(nodes => nodes.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  for (const m of magnets) expect(turn.y + turn.height + 4 <= m.y || turn.y - 4 >= m.y + m.h || turn.x + turn.width + 4 <= m.x || turn.x - 4 >= m.x + m.w).toBe(true);
  await page.mouse.move(turn.x + 4, turn.y + 4); await page.mouse.down();
  await page.mouse.move(turn.x + 64, turn.y + 44, { steps: 6 }); await page.mouse.up();
  await expect.poll(async () => (await attrs()).rotation).not.toBe(before.rotation);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect.poll(attrs).toEqual(before);
});

test('tiny shape exposes a distinct resize target and restores its dimensions with undo', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: '사각형', exact: true }).click();
  const sid = await page.evaluate(async () => {
    const editor = (window as any).editor, sid = editor.selection.nodeIds[0];
    await editor.transaction([{ type: 'setAttrs', payload: { nodeId: sid, attrs: { width: 150, height: 150 } } }]).commit(); return sid;
  });
  const handles = page.locator('.sl-handles [data-handle]:not([data-handle="rotate"])');
  await expect(handles).toHaveCount(1); await expect(handles).toHaveAttribute('data-handle','se');
  const original = await page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes, sid);
  const at = (await handles.boundingBox())!;
  await page.screenshot({ path: '../../.dev/artifacts/design-system/tiny-slide-selection.png' });
  await page.mouse.move(at.x+4, at.y+4); await page.mouse.down();
  await page.mouse.move(at.x+64, at.y+44,{ steps: 5 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes.width, sid)).toBeGreaterThan(150);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect.poll(() => page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes, sid)).toEqual(original);
});
