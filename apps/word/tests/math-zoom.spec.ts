import { test, expect } from '@playwright/test';
import { placeCaret } from './helpers';

async function open(page: import('@playwright/test').Page) {
  await page.goto('/');
  await placeCaret(page, '.w-paragraph');
  await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await page.getByRole('tab', { name: '삽입', exact: true }).click();
  await page.getByRole('button', { name: '본문 수식', exact: true }).click();
  await page.locator('.w-math-draft .me-input').fill('abc');
}
const source = (page: import('@playwright/test').Page) => page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));

test('zoom controls and viewport resize preserve an active draft and its logical font size', async ({ page }) => {
  await page.setViewportSize({ width: 1127, height: 1132 });
  await open(page);
  const before = await source(page);
  const draft = page.locator('.w-math-draft');
  const input = draft.locator('.me-input').first();
  const size = await input.evaluate(el => getComputedStyle(el).fontSize);
  await expect(draft).toBeVisible();
  for (const [control, zoom] of [['[data-zoom-out]', '0.75'], ['[data-zoom-in]', '1.00'], ['[data-zoom-in]', '1.25']]) {
    await page.locator(control).click();
    await expect(page.locator('.w-zoom-frame')).toHaveAttribute('data-zoom', zoom);
    await expect(draft).toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toBeInViewport();
    await expect(input).toHaveValue('abc');
    await expect(input).toHaveCSS('font-size', size);
    expect(await source(page)).toBe(before);
  }
  await page.setViewportSize({ width: 920, height: 740 });
  await expect(draft).toBeVisible();
  await expect(input).toHaveValue('abc');
  expect(await source(page)).toBe(before);
  await expect(input).toBeFocused();
  await input.press('Backspace');
  await expect(input).toHaveValue('ab');
  await draft.getByRole('button', { name: '취소', exact: true }).click();
  await expect(draft).toHaveCount(0);
  expect(await source(page)).toBe(before);
});

test('open suggestions follow a document transform and visual viewport changes without typing', async ({ page }) => {
  await open(page);
  const before = await source(page);
  const input = page.locator('.w-math-draft .me-input').first();
  await input.fill('x/');
  const menu = page.locator('.me-suggestion-panel');
  await expect(menu).toBeVisible();
  const initial = await menu.boundingBox();
  // A transform does not emit a window resize. This is the document zoom path.
  await page.locator('.w-zoom-page').evaluate(el => { (el as HTMLElement).style.transform = 'scale(.75)'; (el as HTMLElement).style.transformOrigin = 'top center'; });
  await expect.poll(async () => (await menu.boundingBox())!.y).not.toBe(initial!.y);
  const assertNear = async () => {
    const box = (await menu.boundingBox())!, anchor = (await input.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(anchor.y + anchor.height - 1);
    expect(box.y - anchor.y - anchor.height).toBeLessThan(12);
  };
  await assertNear();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.25 });
  await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBeCloseTo(1.25);
  await expect(menu).toBeVisible();
  const bounds = await page.evaluate(() => ({ right: visualViewport!.offsetLeft + visualViewport!.width, bottom: visualViewport!.offsetTop + visualViewport!.height }));
  await expect.poll(async () => { const box = (await menu.boundingBox())!; return box.x + box.width; }).toBeLessThanOrEqual(bounds.right);
  await expect.poll(async () => { const box = (await menu.boundingBox())!; return box.y + box.height; }).toBeLessThanOrEqual(bounds.bottom);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page.locator('.w-math-draft .me-fraction')).toBeVisible();
  expect(await source(page)).toBe(before);
  await page.locator('.w-math-draft').getByRole('button', { name: '취소', exact: true }).click();
  expect(await source(page)).toBe(before);
});


test('zoom percentage, menu and wheel do not commit an active draft', async ({ page }) => {
  await open(page);
  const before = await source(page);
  const draft = page.locator('.w-math-draft');
  const value = page.locator('[data-zoom-value]');
  await value.fill('150%');
  await value.press('Enter');
  await expect(page.locator('.w-zoom-frame')).toHaveAttribute('data-zoom', '1.50');
  await expect(draft).toBeVisible();
  expect(await source(page)).toBe(before);
  await page.locator('[data-menu="view"]').click();
  await page.getByRole('menuitem', { name: '실제 크기', exact: true }).click();
  await expect(page.locator('.w-zoom-frame')).toHaveAttribute('data-zoom', '1.00');
  await expect(draft).toBeVisible();
  expect(await source(page)).toBe(before);
  await draft.locator('.me-run').first().click();
  const input = draft.locator('.me-input').first();
  await expect(input).toHaveValue('abc');
  await input.hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect(page.locator('.w-zoom-frame')).not.toHaveAttribute('data-zoom', '1.00');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('abc');
  expect(await source(page)).toBe(before);
  await draft.getByRole('button', { name: '취소', exact: true }).click();
  expect(await source(page)).toBe(before);
});

test('equation editing never draws stale drawing handles after zoom', async ({ page }) => {
  await open(page);
  await page.locator('.w-math-draft .me-input').fill('12345');
  await page.locator('.w-math-draft .me-input').press('Enter');
  const math = page.locator('#editor .w-math');
  await math.click();
  await expect(math).toHaveClass(/w-math-selected/);
  await expect(page.locator('[data-drawing-frame]')).toHaveCount(0);
  await math.dblclick();
  await page.locator('[data-zoom-out]').click();
  await expect(page.locator('.w-math-draft .me-input')).toBeFocused();
  await expect(page.locator('[data-drawing-frame]')).toHaveCount(0);
  await page.locator('.w-math-draft').getByRole('button', { name: '취소', exact: true }).click();
});

test('drawing selection frame follows document zoom without changing its model', async ({ page }) => {
  await page.goto('/');
  await placeCaret(page, '.w-paragraph');
  await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await page.getByRole('tab', { name: '삽입', exact: true }).click();
  await page.locator('[data-control="insert-rectangle"]').click();
  const shape = page.locator('.w-canvas rect').first();
  await shape.click();
  const before = await source(page);
  const frame = page.locator('[data-drawing-frame]');
  await expect(frame).toBeVisible();
  for (const control of ['[data-zoom-out]', '[data-zoom-in]', '[data-zoom-in]']) {
    await page.locator(control).click();
    await expect.poll(async () => {
      const a = (await shape.boundingBox())!, b = (await frame.boundingBox())!;
      return Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y), Math.abs(a.width-b.width), Math.abs(a.height-b.height));
    }).toBeLessThan(3);
    expect(await source(page)).toBe(before);
  }
});
