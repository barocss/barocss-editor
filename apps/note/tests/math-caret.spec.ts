import { test, expect } from '@playwright/test';
test('typing and importing math leave editable positions before and after the atom', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByRole('button', { name: '새 노트', exact: true }).click();
  const p = page.locator('.on-doc > p').first(); await p.click(); await page.keyboard.type('$x^2$');
  await expect(p.locator('[data-latex-node]')).toHaveCount(1);
  await page.keyboard.press('ArrowLeft'); await page.keyboard.type('before');
  await expect(p).toContainText('before');
  expect(await p.evaluate(el => el.textContent?.indexOf('before'))).toBe(0);
  await page.keyboard.press('End'); await page.keyboard.type('after');
  await expect(p).toContainText('after');
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'math-only.md', mimeType: 'text/plain', buffer: Buffer.from('$y^2$') });
  await expect(page.getByLabel('노트 제목')).toHaveValue('math-only');
  await p.click(); await page.keyboard.press('ArrowLeft'); await page.keyboard.type('front');
  await expect(p).toContainText('front');
  expect(await p.evaluate(el => el.textContent?.indexOf('front'))).toBe(0);
});

test('a dragged text range highlights the whole formula once', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByRole('button', { name: '새 노트', exact: true }).click();
  const p = page.locator('.on-doc > p').first();
  await p.click(); await page.keyboard.type('Before $\\frac{a}{b}+x^2$ after');
  const atom = p.locator('[data-latex-node]'); await expect(atom).toHaveCount(1);
  const box = (await p.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 20 }); await page.mouse.up();
  await expect(atom).toHaveClass(/oe-latex-range-selected/);
  const backgrounds = await atom.locator('.katex-html span').evaluateAll(nodes => nodes.map(node => getComputedStyle(node, '::selection').backgroundColor));
  expect(backgrounds.length).toBeGreaterThan(0);
  expect(backgrounds.every(color => color === 'rgba(0, 0, 0, 0)')).toBe(true);
  await page.screenshot({ path: '/tmp/math-range-selection.png' });
  await page.keyboard.press('ArrowRight');
  await expect(atom).not.toHaveClass(/oe-latex-range-selected/);
});
