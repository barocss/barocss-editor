import { expect, test } from '@playwright/test';
import { openDeck } from './helpers';

test('inspector colour tools float beside the panel, drag, clamp and keep their edit state', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: '사각형', exact: true }).click();
  const inspector = page.locator('.sl-properties');
  const trigger = page.getByRole('button', { name: '1번 채우기', exact: true });
  await trigger.press('Enter');
  const popup = page.locator('[data-stack-editor="0"]');
  await expect(popup).toBeVisible();
  expect(await popup.evaluate(el => el.matches(':popover-open'))).toBe(true);
  const initial = (await popup.boundingBox())!;
  const picker = (await popup.locator('.office-color-picker').boundingBox())!;
  await expect(popup.getByLabel('1번 혼합 모드')).toHaveCount(0);
  expect(picker.x - initial.x).toBeCloseTo(initial.x + initial.width - picker.x - picker.width, 0);
  const values = (await popup.locator('.office-color-values').first().boundingBox())!;
  expect(picker.x + picker.width).toBeCloseTo(values.x + values.width, 0);
  const bodyBounds = (await popup.locator('.office-movable-panel-body').boundingBox())!;
  const alphaThumb = (await popup.locator('.react-colorful__alpha-pointer').boundingBox())!;
  expect(alphaThumb.x + alphaThumb.width).toBeLessThanOrEqual(bodyBounds.x + bodyBounds.width);
  const edge = (await inspector.boundingBox())!;
  expect(initial.x + initial.width).toBeLessThanOrEqual(edge.x - 7);
  const viewport = page.viewportSize()!;
  expect(initial.y + initial.height).toBeLessThanOrEqual(viewport.height - 8);
  const handle = popup.locator('.office-panel-drag-handle');
  let grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + 40, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x - 100, grip.y - 60, { steps: 6 });
  await page.mouse.up();
  const moved = (await popup.boundingBox())!;
  expect(moved.x).toBeLessThan(initial.x - 100);
  await inspector.evaluate(el => { el.scrollTop = 0; });
  await expect.poll(async () => (await popup.boundingBox())!.x).toBe(moved.x);

  grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + 40, grip.y + 12);
  await page.mouse.down(); await page.mouse.move(-200, -200, { steps: 6 });
  await expect.poll(async () => (await popup.boundingBox())!.x).toBe(8);
  await expect.poll(async () => (await popup.boundingBox())!.y).toBe(8);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(popup).toBeVisible();
  expect((await popup.boundingBox())!.x).toBeCloseTo(moved.x, 0);
  const code = popup.getByRole('textbox', { name: '색상 코드' });
  await code.fill('e11d48'); await code.press('Enter');
  await expect(code).toHaveValue('E11D48');
  expect((await popup.boundingBox())!.x).toBeCloseTo(moved.x, 0);
  await popup.getByRole('button', { name: '1번 채우기 편집 닫기' }).click();
  await expect(popup).toHaveCount(0);
  await expect(trigger).toBeFocused();

  const line = page.getByRole('button', { name: '선 색', exact: true });
  await line.press('Enter');
  const colour = page.locator('[data-color-panel="선 색"]');
  await expect(colour).toBeVisible();
  expect(await colour.evaluate(el => el.matches(':popover-open'))).toBe(true);
  const colourBox = (await colour.boundingBox())!;
  expect(colourBox.x + colourBox.width).toBeLessThanOrEqual(edge.x - 7);
  const title = (await colour.locator('.office-panel-drag-handle').boundingBox())!;
  await page.mouse.move(title.x + 40, title.y + 12); await page.mouse.down();
  await page.mouse.move(title.x - 40, title.y + 42, { steps: 5 }); await page.mouse.up();
  expect((await colour.boundingBox())!.x).toBeLessThan(colourBox.x - 50);
  await colour.getByRole('textbox', { name: '색상 코드' }).press('Escape');
  await expect(colour).toHaveCount(0);
  await expect(line).toBeFocused();
});

test.describe('a short desktop window', () => {
  test.use({ viewport: { width: 1440, height: 600 } });
  test('the gradient body scrolls while its drag handle and close button stay visible', async ({ page }) => {
    await openDeck(page);
    await page.evaluate(async () => {
      for (let i = 0; i < 32; i++) await (window as any).editor.executeCommand('setDocumentVar', {
        name: `brand-${i}`, label: `브랜드 색 ${i + 1}`, kind: 'color', value: '#2563eb'
      });
    });
    await page.getByRole('button', { name: '사각형', exact: true }).click();
    await page.getByLabel('1번 채우기 종류').selectOption('linear');
    await page.getByRole('button', { name: '1번 채우기', exact: true }).click();
    const popup = page.locator('[data-stack-editor="0"]');
    await expect(popup).toBeVisible();
    const box = (await popup.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(8);
    expect(box.y + box.height).toBeLessThanOrEqual(592);
    const body = popup.locator('.office-movable-panel-body');
    expect(await body.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    const header = popup.locator('.office-panel-drag-handle');
    const headerTop = (await header.boundingBox())!.y;
    await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(popup.getByLabel('1번 혼합 모드')).toHaveCount(0);
    await expect(body.locator('button').last()).toBeInViewport();
    expect((await header.boundingBox())!.y).toBe(headerTop);
    await expect(popup.getByRole('button', { name: '1번 채우기 편집 닫기' })).toBeInViewport();
    await page.screenshot({ path: '../../.dev/artifacts/design-system/movable-gradient-panel.png' });
  });
});
