import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('selection paint stays constant across zoom, state and theme', async ({ page }) => {
  await page.goto('/design-system/index.html#selection-tools');
  for (const theme of ['밝은 테마', '어두운 테마']) {
    await page.getByRole('combobox', { name: '시스템 테마' }).click();
    await page.getByRole('option', { name: theme, exact: true }).click();
    for (const zoom of [50, 100, 200]) {
      await page.getByRole('combobox', { name: '선택 도구 예시 배율' }).click();
      await page.getByRole('option', { name: `${zoom}%`, exact: true }).click();
      const handle = page.locator('#selection-tools [data-handle="se"]');
      const box = (await handle.boundingBox())!;
      expect(box.width).toBeCloseTo(8, 1); expect(box.height).toBeCloseTo(8, 1);
      expect(await handle.evaluate(el => parseFloat(getComputedStyle(el, '::before').width))).toBeCloseTo(16 / (zoom / 100), 1);
      const paint = await page.locator('.ds-selection-outline').evaluate(el => {
        const style = getComputedStyle(el, '::after');
        return { line: parseFloat(style.outlineWidth), scale: new DOMMatrix(style.transform).a };
      });
      expect(paint.line * paint.scale * zoom / 100).toBeCloseTo(1, 2);
    }
  }
  await page.getByRole('combobox', { name: '선택 도구 상태' }).click();
  await page.getByRole('option', { name: '잠금', exact: true }).click();
  await expect(page.locator('#selection-tools .office-selection-handle')).toHaveCount(0);
  await page.getByRole('combobox', { name: '선택 도구 상태' }).click();
  await page.getByRole('option', { name: '단일 선택', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 840 });
  const stage = page.locator('.ds-selection-stage');
  const at = (await stage.boundingBox())!;
  const handle = (await page.locator('#selection-tools [data-handle="se"]').boundingBox())!;
  expect(handle.x + handle.width).toBeLessThan(at.x + at.width);
  await mkdir('../../.dev/artifacts/design-system', { recursive: true });
  await page.locator('#selection-tools').screenshot({ path: '../../.dev/artifacts/design-system/selection-tools.png' });
});

test('passive size readout stays inside viewport and leaves focus and Escape with the host', async ({ page }) => {
  await page.goto('/design-system/index.html#selection-tools');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const trigger = page.getByRole('button', { name: '경계에서 크기 표시' });
    await trigger.click(); await expect(trigger).toBeFocused();
    const label = page.locator('[data-selection-example-readout]');
    await expect(label).toBeVisible();
    const box = (await label.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(8); expect(box.y).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 8);
    expect(box.y + box.height).toBeLessThanOrEqual(792);
    expect(await label.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
    await page.evaluate(() => { (window as any).readoutEscape = false; document.addEventListener('keydown', e => { if (e.key === 'Escape') (window as any).readoutEscape = true; }, { once: true }); });
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => (window as any).readoutEscape)).toBe(true);
    await expect(trigger).toBeFocused();
    await page.getByRole('button', { name: '크기 표시 숨기기' }).click(); await expect(label).toHaveCount(0);
  }
});

test('small-object specimen changes target density without enlarging the object', async ({ page }) => {
  await page.goto('/design-system/index.html#selection-tools');
  await page.getByRole('combobox',{name:'선택 객체 크기'}).click();
  await page.getByRole('option',{name:'작은 객체 · 12px',exact:true}).click();
  const handles = page.locator('#selection-tools [data-handle]:not([data-handle="rotate"])');
  await expect(handles).toHaveCount(1);
  expect((await page.locator('.ds-selection-object').boundingBox())!.width).toBeCloseTo(12,1);
  await page.getByRole('combobox',{name:'선택 도구 예시 배율'}).click();
  await page.getByRole('option',{name:'200%',exact:true}).click();
  await expect(handles).toHaveCount(4);
  expect((await page.locator('.ds-selection-object').boundingBox())!.width).toBeCloseTo(24,1);
});
