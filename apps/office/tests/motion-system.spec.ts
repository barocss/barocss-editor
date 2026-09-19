import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/design-system/index.html#motion');
});

test('choice and menu accept keyboard input during entry', async ({ page }) => {
  await page.addStyleTag({ content: ':root { --ou-motion-popup: 2s; }' });
  const choice = page.getByRole('combobox', { name: '모션 선택 목록' });
  await choice.click();
  await expect(page.getByRole('option', { name: '팀 문서', exact: true })).toBeFocused();
  expect(await page.getByRole('listbox').evaluate(el => getComputedStyle(el).animationName)).toBe('ou-surface-enter');
  await page.keyboard.press('End');
  await expect(page.getByRole('option', { name: '개인 문서', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(choice).toContainText('개인 문서');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.getByRole('button', { name: '모션 메뉴 열기', exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect(page.locator('#motion')).toContainText('선택: 복제');
  await expect(page.getByRole('menu', { name: '모션 예시 메뉴' })).toHaveCount(0);
});

test('popover reposition does not restart entry and Escape dismisses immediately', async ({ page }) => {
  await page.addStyleTag({ content: ':root { --ou-motion-popup: 2s; }' });
  await page.getByRole('button', { name: '모션 팝오버 열기', exact: true }).click();
  const panel = page.getByRole('group', { name: '모션 팝오버', exact: true });
  await expect(panel).toBeVisible();
  await expect.poll(() => panel.evaluate(el => el.getAnimations()[0]?.startTime ?? null)).not.toBeNull();
  const start = await panel.evaluate(el => el.getAnimations()[0].startTime);
  await page.setViewportSize({ width: 1100, height: 850 });
  expect(await panel.evaluate(el => el.getAnimations()[0]?.startTime)).toBe(start);
  await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0);
});

test('dialog and drawer preserve input and return focus after dismissal', async ({ page }) => {
  for (const kind of ['Dialog', 'Drawer']) {
    const trigger = page.getByRole('button', { name: `모션 ${kind} 열기`, exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    expect(await dialog.evaluate(el => getComputedStyle(el).animationName)).toBe(kind === 'Dialog' ? 'ou-fade-enter' : 'ou-drawer-enter');
    const field = dialog.getByRole('textbox', { name: '모션 문서 이름' });
    await field.focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('Motion input');
    await expect(field).toHaveValue('Motion input');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  }
});

test('reduced motion removes animation from every specimen surface', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const name of ['모션 선택 목록', '모션 메뉴 열기', '모션 팝오버 열기', '모션 Dialog 열기', '모션 Drawer 열기', '모션 색상']) {
    const trigger = page.getByRole(name === '모션 선택 목록' ? 'combobox' : 'button', { name, exact: true });
    await trigger.click();
    const surface = page.locator('body > [data-context-menu], [data-floating-surface], .office-choice-popup, [data-office-dialog], .office-color-panel');
    await expect(surface).toBeVisible();
    expect(await surface.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await page.keyboard.press('Escape'); await expect(surface).toHaveCount(0);
  }
  await page.getByRole('button', { name: '모션 툴팁 확인', exact: true }).hover();
  const tooltip = page.locator('[data-office-tooltip]');
  await expect(tooltip).toBeVisible();
  expect(await tooltip.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.screenshot({ path: '../../.dev/artifacts/design-system/motion.png' });
});
