import { expect, test, type Page } from '@playwright/test';
import { openDeck, currentSlide, pickMenu } from './helpers';

const mode = (page: Page, multi: boolean) => page.getByRole('button', { name: multi ? '멀티 슬라이드 보기' : '슬라이드 보기', exact: true });
const nativeState = (page: Page) => page.evaluate(() => ({ document: (window as any).editor.exportDocument(), history: (window as any).editor.getHistoryStats() }));

async function openCanvas(page: Page) {
  await openDeck(page);
  await mode(page, true).click();
  await expect(page.locator('.sl-stage')).toHaveAttribute('data-freeboard', 'true');
  await expect(page.locator('.sl-map')).toHaveCount(0);
  await expect(page.locator('[data-board-label]')).toHaveCount(6);
}

test('bottom multi-slide control opens the live editable canvas instead of the deck map', async ({ page }) => {
  await openDeck(page);
  const before = await nativeState(page);
  await mode(page, true).click();
  await expect(page.locator('.sl-stage')).toHaveAttribute('data-freeboard', 'true');
  await expect(page.locator('.sl-stage')).toBeVisible();
  await expect(page.locator('.sl-map')).toHaveCount(0);
  await expect(page.locator('.sl-stage-owner')).not.toHaveAttribute('inert', '');
  await expect(page.getByRole('toolbar', { name: 'Slides 삽입 도구', exact: true })).toBeVisible();
  await expect(page.locator('.sl-overlay')).toBeVisible();
  await expect(page.locator('[data-filmstrip-panel]')).toBeHidden();
  await expect(page.locator('[data-notes-panel]')).toBeHidden();
  await expect(mode(page, true)).toHaveAttribute('aria-pressed', 'true');
  expect(await nativeState(page)).toEqual(before);
});

async function stageSlide(page: Page, index: number) {
  const sid = (await page.locator('[data-board-label]').nth(index).getAttribute('data-board-label'))!;
  return { sid, node: page.locator(`.sl-stage .sl-slide[data-bc-sid="${sid}"]`) };
}

async function exportedNative(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), pickMenu(page, 'file.document.2')]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const file = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(file.format).toBe('barocss-slides'); expect(file.version).toBe(2);
  return file.document;
}

async function assertSavedNativeReopens(page: Page) {
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  const saved = await exportedNative(page);
  const url = page.url();
  await page.reload();
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  expect(page.url()).toBe(url);
  expect(await exportedNative(page)).toEqual(saved);
}

async function canvasUndo(page: Page, redo = false) {
  await page.locator('.sl-stage-viewport').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(redo ? 'Meta+Shift+z' : 'Meta+z');
}

test('direct double-click edits two native slides without a prior selection click', async ({ page }) => {
  await openCanvas(page);
  const first = await stageSlide(page, 0), second = await stageSlide(page, 1);
  const before = (await nativeState(page)).document;
  for (const [slide, marker] of [[second, ' canvas second'], [first, ' canvas first']] as const) {
    const title = slide.node.locator('.sl-text-frame').first();
    const bounds = (await title.boundingBox())!;
    // The first gesture on the inactive slide must both activate it and enter its native text.
    await page.mouse.dblclick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.keyboard.press('End');
    await page.keyboard.insertText(marker);
    await expect(title).toContainText(marker);
    await expect.poll(() => currentSlide(page)).toBe(slide.sid);
    await page.keyboard.press('Escape');
  }
  const edited = (await nativeState(page)).document;
  expect(edited).not.toEqual(before);
  await canvasUndo(page);
  await expect(first.node.locator('.sl-text-frame').first()).not.toContainText('canvas first');
  await expect(second.node.locator('.sl-text-frame').first()).toContainText('canvas second');
  await canvasUndo(page);
  await expect.poll(async () => (await nativeState(page)).document).toEqual(before);
  await canvasUndo(page, true); await canvasUndo(page, true);
  await expect.poll(async () => (await nativeState(page)).document).toEqual(edited);
  await mode(page, false).click();
  await expect(page.locator('.sl-stage')).toHaveAttribute('data-focus', first.sid);
  await expect(first.node.locator('.sl-text-frame').first()).toContainText('canvas first');
  expect((await nativeState(page)).document).toEqual(edited);
  await assertSavedNativeReopens(page);
  await mode(page, true).click();
  await expect((await stageSlide(page, 0)).node.locator('.sl-text-frame').first()).toContainText('canvas first');
  await expect((await stageSlide(page, 1)).node.locator('.sl-text-frame').first()).toContainText('canvas second');
});

test('first drag on an inactive canvas slide moves the native frame and undoes exactly once', async ({ page }) => {
  await openCanvas(page);
  const target = await stageSlide(page, 2);
  expect(await currentSlide(page)).not.toBe(target.sid);
  const frame = target.node.locator('.sl-frame').first();
  const shape = frame.locator('.sl-rectangle').first();
  const sid = (await frame.getAttribute('data-bc-sid'))!;
  const model = () => page.evaluate(id => {
    const node = (window as any).editor.dataStore.getNode(id);
    return { parentId: node.parentId, attributes: node.attributes, children: node.content.map((childId: string) => {
      const child = (window as any).editor.dataStore.getNode(childId);
      return { sid: child.sid, parentId: child.parentId, attributes: child.attributes };
    }) };
  }, sid);
  const before = (await nativeState(page)).document, start = await model(), bounds = (await shape.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 24, bounds.y + bounds.height / 2 + 18, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => currentSlide(page)).toBe(target.sid);
  await expect.poll(async () => (await model()).attributes.x).not.toBe(start.attributes.x);
  await expect.poll(async () => (await model()).attributes.y).not.toBe(start.attributes.y);
  expect((await model()).parentId).toBe(start.parentId);
  expect((await model()).children).toEqual(start.children);
  const moved = (await nativeState(page)).document;
  await canvasUndo(page);
  await expect.poll(async () => (await nativeState(page)).document).toEqual(before);
  await canvasUndo(page, true);
  await expect.poll(async () => (await nativeState(page)).document).toEqual(moved);
  const movedAttributes = (await model()).attributes;
  await assertSavedNativeReopens(page);
  await mode(page, true).click();
  const restoredFrame = (await stageSlide(page, 2)).node.locator('.sl-frame').first();
  const restoredId = await restoredFrame.getAttribute('data-bc-sid');
  expect(await page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes, restoredId)).toEqual(movedAttributes);
});

test('canvas panning, zoom and return to a single slide do not change the native deck', async ({ page }) => {
  await openCanvas(page);
  const first = await stageSlide(page, 0), before = await nativeState(page);
  const bounds = (await first.node.boundingBox())!, stage = (await page.locator('.sl-stage').boundingBox())!;
  await page.mouse.move(stage.x + stage.width - 20, stage.y + 50);
  await page.mouse.wheel(65, 40);
  await expect.poll(async () => (await first.node.boundingBox())!.x).toBeCloseTo(bounds.x - 65, 0);
  await expect.poll(async () => (await first.node.boundingBox())!.y).toBeCloseTo(bounds.y - 40, 0);
  const panned = (await first.node.boundingBox())!;
  await page.mouse.move(panned.x + panned.width / 2, panned.y + panned.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(panned.x + panned.width / 2 + 70, panned.y + panned.height / 2 + 30, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  await expect.poll(async () => (await first.node.boundingBox())!.x).toBeCloseTo(panned.x + 70, 0);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -100); await page.keyboard.up('Control');
  await expect.poll(async () => (await first.node.boundingBox())!.width).toBeGreaterThan(bounds.width);
  const slideBounds = (await first.node.boundingBox())!, overlay = (await page.locator('.sl-overlay').boundingBox())!;
  expect(overlay.x).toBeCloseTo(slideBounds.x, 0); expect(overlay.y).toBeCloseTo(slideBounds.y, 0);
  expect(await nativeState(page)).toEqual(before);
  await mode(page, false).click();
  await expect(page.locator('.sl-stage')).toHaveAttribute('data-focus', first.sid);
  await expect(page.locator('.sl-stage')).not.toHaveAttribute('data-freeboard', 'true');
  expect(await nativeState(page)).toEqual(before);
  // The graph remains a separate, explicit navigation tool.
  await pickMenu(page, 'view.panes.1');
  await expect(page.getByRole('region', { name: '덱 지도', exact: true })).toBeVisible();
  await expect(page.locator('.sl-stage-owner')).toHaveAttribute('inert', '');
  await expect(mode(page, false)).toHaveAttribute('aria-pressed', 'false');
  await expect(mode(page, true)).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-map-close]').click();
  await expect(mode(page, false)).toHaveAttribute('aria-pressed', 'true');
  expect(await nativeState(page)).toEqual(before);
});

test('floating panels own their wheel and middle-drag input above Canvas', async ({ page }) => {
  await openCanvas(page);
  const first = await stageSlide(page, 0), before = await first.node.boundingBox(), native = await nativeState(page);
  await page.getByRole('button', { name: '속성', exact: true }).click();
  const panel = page.locator('[data-floating-panel][data-workspace-panel="inspector"]');
  await expect(panel).toBeVisible();
  const bounds = (await panel.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100);
  await page.mouse.wheel(20, 60);
  expect(await first.node.boundingBox()).toEqual(before);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(bounds.x + bounds.width / 2 + 30, bounds.y + 125, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  expect(await first.node.boundingBox()).toEqual(before);
  expect(await nativeState(page)).toEqual(native);
});
