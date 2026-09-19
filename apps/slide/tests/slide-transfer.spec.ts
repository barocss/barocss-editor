import { test, expect } from '@playwright/test';
import { openDeck } from './helpers';

async function fixture(page: import('@playwright/test').Page) {
  await openDeck(page);
  await page.locator('[data-focus-toggle]').click();
  await expect(page.locator('[data-board-label]')).toHaveCount(6);
  const first = await page.locator('[data-board-label]').nth(0).getAttribute('data-board-label');
  const second = await page.locator('[data-board-label]').nth(1).getAttribute('data-board-label');
  const box = page.locator(`.sl-stage .sl-slide[data-bc-sid="${first}"] .sl-text-frame`).first();
  const sid = await box.getAttribute('data-bc-sid');
  const a = await box.boundingBox();
  const target = await page.locator(`.sl-stage .sl-slide[data-bc-sid="${second}"]`).boundingBox();
  const from = { x: a!.x + a!.width / 2, y: a!.y + a!.height / 2 };
  const to = { x: target!.x + target!.width / 2, y: target!.y + target!.height / 2 };
  await page.mouse.click(from.x, from.y);
  return { first, second, box, sid, from, to };
}

test('drags a text object into another slide, then undoes and restores its saved position', async ({ page }) => {
  const f = await fixture(page);
  const text = await f.box.innerText();
  await page.mouse.move(f.from.x, f.from.y); await page.mouse.down();
  await page.mouse.move(f.to.x, f.to.y, { steps: 12 });
  await expect(page.locator('[data-slide-transfer]')).toHaveAttribute('data-slide-transfer', f.second!);
  await page.mouse.up();
  await expect(page.locator('.sl-count')).toHaveText('2 / 6');
  const targetBox = page.locator(`.sl-stage .sl-slide[data-bc-sid="${f.second}"] [data-bc-sid="${f.sid}"]`);
  await expect(targetBox).toContainText(text);
  const landed = await targetBox.boundingBox();
  expect(landed!.x + landed!.width / 2).toBeCloseTo(f.to.x, 0);
  expect(landed!.y + landed!.height / 2).toBeCloseTo(f.to.y, 0);
  await page.evaluate(() => (window as any).editor.undo());
  await expect(f.box).toBeAttached();
  await expect(page.locator('.sl-count')).toHaveText('1 / 6');
  await page.evaluate(() => (window as any).editor.redo());
  await expect(targetBox).toBeAttached();
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  await page.locator('[data-focus-toggle]').click();
  const second = await page.locator('[data-board-label]').nth(1).getAttribute('data-board-label');
  await expect(page.locator(`.sl-stage .sl-slide[data-bc-sid="${second}"]`)).toContainText(text);
});

test('Escape cancels a transfer preview without moving the object', async ({ page }) => {
  const f = await fixture(page);
  await page.mouse.move(f.from.x, f.from.y); await page.mouse.down();
  await page.mouse.move(f.to.x, f.to.y, { steps: 12 });
  await expect(page.locator('[data-slide-transfer]')).toBeVisible();
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(page.locator('[data-slide-transfer]')).toHaveCount(0);
  await expect(f.box).toBeAttached();
  const bounds = await f.box.boundingBox();
  expect(bounds!.x + bounds!.width / 2).toBeCloseTo(f.from.x, 0);
});

test('Alt-drag copies to another slide and preserves the source through undo and reload', async ({ page }) => {
  const f = await fixture(page);
  const text = await f.box.innerText();
  const destination = page.locator(`.sl-stage .sl-slide[data-bc-sid="${f.second}"] .sl-text-frame`);
  const before = await destination.count();
  await page.keyboard.down('Alt');
  await page.mouse.move(f.from.x, f.from.y); await page.mouse.down();
  await page.mouse.move(f.to.x, f.to.y, { steps: 12 });
  await expect(page.locator('.sl-transfer-label')).toHaveText('이 슬라이드에 복사');
  const held = await f.box.boundingBox();
  expect(held!.x + held!.width / 2).toBeCloseTo(f.from.x, 0);
  await page.mouse.up(); await page.keyboard.up('Alt');
  await expect(destination).toHaveCount(before + 1);
  await expect(f.box).toContainText(text);
  await expect(destination.last()).toContainText(text);
  expect(await destination.last().getAttribute('data-bc-sid')).not.toBe(f.sid);
  await page.evaluate(() => (window as any).editor.undo());
  await expect(destination).toHaveCount(before);
  await expect(f.box).toContainText(text);
  await page.evaluate(() => (window as any).editor.redo());
  await expect(destination).toHaveCount(before + 1);
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  await page.locator('[data-focus-toggle]').click();
  for (const index of [0, 1]) {
    const slide = await page.locator('[data-board-label]').nth(index).getAttribute('data-board-label');
    await expect(page.locator(`.sl-stage .sl-slide[data-bc-sid="${slide}"]`)).toContainText(text);
  }
});

async function selectAcrossSlides(page: import('@playwright/test').Page) {
  const f = await fixture(page);
  const second = page.locator(`.sl-stage .sl-slide[data-bc-sid="${f.second}"] .sl-text-frame`).first();
  const other = await second.getAttribute('data-bc-sid');
  const bounds = await second.boundingBox();
  await page.keyboard.down('Shift');
  await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.keyboard.up('Shift');
  await expect.poll(() => page.evaluate(() => (window as any).editor.selection?.nodeIds)).toEqual([f.sid, other]);
  return { ...f, secondBox: second, other };
}

test('selects objects across slides and edits a shared property through the inspector', async ({ page }) => {
  const f = await selectAcrossSlides(page);
  await expect(page.locator('.sl-count')).toHaveText('2 / 6');
  await expect(page.locator('.sl-properties')).toContainText('2개 선택');
  await expect(page.locator('[data-cross-slide-selected]')).toHaveAttribute('data-cross-slide-selected', f.sid!);
  const opacity = page.getByRole('spinbutton', { name: '불투명도', exact: true });
  await opacity.fill('60'); await opacity.press('Enter');
  const values = () => page.evaluate(ids => ids.map(sid => (window as any).editor.dataStore.getNode(sid).attributes.opacity ?? 1), [f.sid, f.other]);
  await expect.poll(values).toEqual([0.6, 0.6]);
  await page.evaluate(() => (window as any).editor.undo());
  await expect.poll(values).toEqual([1, 1]);
  await page.evaluate(() => (window as any).editor.redo());
  await expect.poll(values).toEqual([0.6, 0.6]);
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  await page.locator('[data-focus-toggle]').click();
  for (const index of [0, 1]) {
    const slide = await page.locator('[data-board-label]').nth(index).getAttribute('data-board-label');
    const sid = await page.locator(`.sl-stage .sl-slide[data-bc-sid="${slide}"] .sl-text-frame`).first().getAttribute('data-bc-sid');
    expect(await page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes.opacity, sid)).toBe(0.6);
  }
});

test('nudges and deletes across slides, restores both, and allows Shift-click removal', async ({ page }) => {
  const f = await selectAcrossSlides(page);
  const positions = () => page.evaluate(ids => ids.map(sid => (window as any).editor.dataStore.getNode(sid).attributes.x), [f.sid, f.other]);
  const before = await positions();
  await page.keyboard.press('ArrowRight');
  await expect.poll(positions).toEqual(before.map(x => x + 15));
  await page.keyboard.press('Control+z');
  await expect.poll(positions).toEqual(before);
  await page.keyboard.press('Delete');
  await expect(page.locator(`.sl-stage [data-bc-sid="${f.sid}"]`)).toHaveCount(0);
  await expect(f.secondBox).not.toHaveAttribute('data-bc-sid', f.other!);
  await page.keyboard.press('Control+z');
  await expect(f.box).toBeAttached();
  await expect(page.locator(`.sl-stage [data-bc-sid="${f.other}"]`)).toBeAttached();
  await page.keyboard.down('Shift'); await page.mouse.click(f.from.x, f.from.y); await page.keyboard.up('Shift');
  await expect.poll(() => page.evaluate(() => (window as any).editor.selection?.nodeIds)).toEqual([f.other]);
});
