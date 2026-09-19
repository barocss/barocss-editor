import { test, expect } from '@playwright/test';
test('paragraph alignment settings render and persist with undo', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByRole('button', { name: '새 노트', exact: true }).click();
  const p = page.locator('.on-doc > p').first(); await p.click(); await page.keyboard.type('Aligned paragraph');
  await p.hover(); await page.locator('[data-note-grip]').click();
  for (const [value, label] of [['center', '가운데'], ['right', '오른쪽'], ['justify', '양쪽']]) { await page.getByRole('button', { name: label + ' 정렬', exact: true }).click(); await expect(p).toHaveCSS('text-align', value); }
  const selected = page.getByRole('button', { name: '양쪽 정렬', exact: true });
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(0, 0);
  const background = () => selected.evaluate(el => getComputedStyle(el).backgroundColor);
  await expect.poll(background).toBe('rgb(37, 99, 235)');
  await selected.hover();
  await expect.poll(background).toBe('color(srgb 0.123333 0.33 0.783333)');
  await expect(selected).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.screenshot({ path: '/tmp/note-selected-hover.png' });
  await page.keyboard.press('Escape'); await p.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await expect(p).toHaveCSS('text-align', 'right');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨'); await page.reload(); await expect(p).toHaveCSS('text-align', 'right');
});
