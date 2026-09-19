import { test, expect, type Page } from '@playwright/test';

async function expandMath(page: Page) {
  await page.getByLabel('노트 제목').focus();
  await page.getByLabel('본문 수식 도구', { exact: true }).getByRole('button', { name: '크게 편집', exact: true }).click();
}

async function expectMenuAtInput(page: Page) {
  const menu = page.locator('.me-suggestion-panel').filter({ visible: true });
  await expect(menu).toBeVisible();
  const metrics = await menu.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const dialog = el.closest('[role="dialog"]')!.getBoundingClientRect();
    const input = document.querySelector('.me-input:focus')!.getBoundingClientRect();
    const first = el.querySelector('[role="option"]')!;
    const option = first.getBoundingClientRect();
    const hit = document.elementFromPoint(option.left + option.width / 2, option.top + Math.min(15, option.height / 2));
    return {
      inside: rect.left >= dialog.left && rect.right <= dialog.right && rect.top >= dialog.top && rect.bottom <= dialog.bottom,
      inViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      height: rect.height,
      gap: Math.min(Math.abs(rect.top - input.bottom), Math.abs(rect.bottom - input.top)),
      reachable: first.contains(hit),
    };
  });
  expect(metrics.inside).toBe(true);
  expect(metrics.inViewport).toBe(true);
  expect(metrics.height).toBeGreaterThan(36);
  expect(metrics.gap).toBeLessThanOrEqual(10);
  expect(metrics.reachable).toBe(true);
  return menu;
}

for (const width of [1280, 820]) test(`math suggestions and selection tools stay anchored inside the modal at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 820 ? 520 : 720 });
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({
    name: 'math-popup-layout.md', mimeType: 'text/plain', buffer: Buffer.from('$x$'),
  });
  await page.getByRole('button', { name: '인라인 수식 편집', exact: true }).click(); await expandMath(page);
  const dialog = page.getByRole('dialog', { name: '수학 수식' });
  await expect(dialog.getByRole('tab', { name: '시각 편집', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByLabel('수식 크기', { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('수식 미리보기')).toHaveCSS('font-size', '18px');
  await dialog.locator('.me-run[data-value="x"]').click();
  const input = dialog.locator('.me-input:focus');
  await input.fill('sqrt');
  const menu = await expectMenuAtInput(page);
  await page.screenshot({ path: `/tmp/note-math-suggestion-${width}.png`, animations: 'disabled' });
  await menu.getByRole('option').filter({ hasText: '루트' }).first().click();
  await expect(dialog.locator('.me-root')).toBeVisible();
  await input.fill('ab');
  await input.press('ControlOrMeta+a');
  await expectMenuAtInput(page);
  await page.screenshot({ path: `/tmp/note-math-selection-${width}.png`, animations: 'disabled' });
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
});

test('rich editor suggestions support keyboard selection without changing dropdown side', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({
    name: 'math-keyboard.md', mimeType: 'text/plain', buffer: Buffer.from('$x$'),
  });
  await page.getByRole('button', { name: '인라인 수식 편집', exact: true }).click(); await expandMath(page);
  const dialog = page.getByRole('dialog', { name: '수학 수식' });
  await dialog.locator('.me-run[data-value="x"]').click();
  const input = dialog.locator('.me-input:focus');
  let side: string | undefined;
  for (const query of ['s', 'sq', 'sqrt']) {
    await input.fill(query);
    const menu = await expectMenuAtInput(page);
    const next = await menu.evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.me-input:focus')!.getBoundingClientRect().top ? 'above' : 'below');
    if (side) expect(next).toBe(side);
    side = next;
  }
  await input.fill('x/');
  const menu = await expectMenuAtInput(page);
  await expect(menu.getByRole('option').first()).toContainText('÷');
  await input.press('ArrowDown');
  await expect(menu.locator('[aria-selected="true"]')).toContainText('분수');
  await expect(input).toBeFocused();
  await input.press('Enter');
  await expect(dialog.locator('.me-fraction')).toBeVisible();
  await input.fill('2');
  await input.press('ControlOrMeta+a');
  const selectionMenu = await expectMenuAtInput(page);
  const first = await selectionMenu.locator('[aria-selected="true"]').textContent();
  await input.press('ArrowDown');
  await expect(selectionMenu.locator('[aria-selected="true"]')).not.toHaveText(first!);
  for (let i = 0; i < 12; i++) await input.press('ArrowDown');
  await expect(selectionMenu.locator('[aria-selected="true"]')).toBeInViewport();
  await expect(input).toBeFocused();
  await input.press('Enter');
  await expect(dialog.locator('.me-structure')).toHaveCount(2);
  await dialog.locator('.me-run[data-value="2"]').click();
  await dialog.locator('.me-input:focus').press('ControlOrMeta+a');
  await expect(page.locator('.me-suggestion-panel')).toHaveCount(1);
  await dialog.getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
  await expect(page.locator('.me-suggestion-panel')).toHaveCount(0);
  await dialog.getByRole('tab', { name: '시각 편집', exact: true }).click();
  await expect(dialog.locator('.me-structure')).toHaveCount(2);
  await dialog.getByRole('button', { name: '수식 적용', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
