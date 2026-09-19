import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const output = '../../.dev/artifacts/design-system';
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/design-system/index.html#modals');
});

test('dialog scrolls only its body and restores focus after applying', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 460 });
  const trigger = page.getByRole('button', { name: '설정 창 열기', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '문서 설정', exact: true });
  await dialog.getByRole('button', { name: '긴 내용 확인', exact: true }).click();
  const header = dialog.locator('.office-modal-header');
  const footer = dialog.locator('.office-modal-footer');
  const y = (await header.boundingBox())!.y;
  await dialog.getByRole('textbox', { name: '검토 항목 16', exact: true }).scrollIntoViewIfNeeded();
  expect((await header.boundingBox())!.y).toBeCloseTo(y, 1);
  await expect(footer).toBeInViewport();
  const box = await dialog.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(15);
  expect(box!.y + box!.height).toBeLessThanOrEqual(445);
  await dialog.getByRole('textbox', { name: '창 문서 이름' }).fill('새 문서 설정');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  await expect(page.locator('#modals')).toContainText('적용된 이름: 새 문서 설정');
});

test('Escape closes a colour or choice popup before its modal', async ({ page }) => {
  for (const label of ['설정 창 열기', '상세 패널 열기']) {
    const trigger = page.getByRole('button', { name: label, exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    const color = dialog.getByRole('button', { name: '창 표시 색상', exact: true });
    await color.click();
    const panel = page.locator('[data-color-panel="창 표시 색상"]');
    await panel.getByRole('textbox', { name: '색상 코드' }).focus();
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(7);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1273);
    expect(box!.y + box!.height).toBeLessThanOrEqual(893);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0); await expect(dialog).toBeVisible(); await expect(color).toBeFocused();
    const choice = dialog.getByRole('combobox', { name: '창 공유 범위' });
    await choice.click(); await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0); await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  }
});

test('Drawer fits mobile width, wraps its heading and keeps it above scrolling content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 460 });
  const trigger = page.getByRole('button', { name: '상세 패널 열기', exact: true });
  await trigger.click();
  const drawer = page.getByRole('dialog');
  const box = await drawer.boundingBox(); expect(box!.width).toBeCloseTo(390, 2); expect(box!.height).toBeCloseTo(460, 2);
  await drawer.getByRole('button', { name: '긴 내용 확인', exact: true }).click();
  await drawer.getByRole('textbox', { name: '검토 항목 16', exact: true }).scrollIntoViewIfNeeded();
  await expect(drawer.getByRole('button', { name: '닫기', exact: true })).toBeInViewport();
  const heading = drawer.getByRole('heading', { name: '팀에서 함께 검토하는 문서의 상세 속성' });
  expect(await heading.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await drawer.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(drawer).toHaveCount(0); await expect(trigger).toBeFocused();
});

test('modal chrome shares both themes and ignores composition Escape', async ({ page }) => {
  await mkdir(output, { recursive: true });
  for (const theme of ['밝은 테마', '어두운 테마']) {
    await page.getByRole('combobox', { name: '시스템 테마' }).click();
    await page.getByRole('option', { name: theme, exact: true }).click();
    await page.getByRole('button', { name: '설정 창 열기', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const input = dialog.getByRole('textbox', { name: '창 문서 이름' });
    await input.focus(); await input.dispatchEvent('keydown', { key: 'Escape', code: 'Escape', isComposing: true });
    await expect(dialog).toBeVisible();
    await dialog.screenshot({ animations: 'disabled', path: `${output}/modal-${theme === '밝은 테마' ? 'light' : 'dark'}.png` });
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
  }
});

test('Slides theme editing closes its colour picker before cancelling the dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'S Slides 새 자료 만들기', exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름' }).fill('테마 창 검증');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await page.locator('.sl-properties [data-theme-edit]').click();
  const dialog = page.getByRole('dialog', { name: '테마 색', exact: true });
  const color = dialog.locator('[data-color-field="강조 1"]');
  await color.click();
  const picker = dialog.locator('[data-color-panel]');
  await picker.getByRole('textbox', { name: '색상 코드' }).fill('c0392b');
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0); await expect(dialog).toBeVisible();
  await expect(color).toHaveAttribute('data-value', '#c0392b');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.locator('.sl-properties [data-theme-edit]').click();
  await expect(dialog.locator('[data-color-field="강조 1"]')).not.toHaveAttribute('data-value', '#c0392b');
  await dialog.screenshot({ animations: 'disabled', path: `${output}/modal-slides-theme.png` });
});
