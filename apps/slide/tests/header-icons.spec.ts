import { expect, test } from '@playwright/test';
import { openDeck } from './helpers';

for (const theme of ['light', 'dark']) test(`compact header icons preserve document actions in ${theme}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 979, height: 1119 });
  await openDeck(page);
  await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
  const snapshot = () => page.evaluate(() => ({
    document: (window as any).editor.exportDocument(),
    history: (window as any).editor.getHistoryStats(),
    selection: (window as any).editor.selection
  }));
  const before = await snapshot();
  const header = page.locator('.sl-topbar');
  const documentMenu = header.getByRole('menuitem', { name: '문서 메뉴', exact: true });
  const search = header.getByRole('button', { name: '명령 검색', exact: true });
  const recent = header.getByRole('button', { name: '최근 자료', exact: true });
  const saved = header.locator('[data-slide-save-status]');
  await expect(saved).toContainText('저장됨');
  await expect(saved).toHaveAttribute('role', 'status');
  await expect(saved).toHaveAttribute('aria-live', 'polite');
  expect((await header.boundingBox())!.height).toBeLessThanOrEqual(56);
  for (const control of [documentMenu, search, recent, saved]) {
    const bounds = (await control.boundingBox())!;
    expect(bounds.width).toBe(32); expect(bounds.height).toBe(32);
    await expect(control.locator('svg')).toHaveCount(1);
  }
  for (const control of [documentMenu, search, recent]) expect(await control.textContent()).toBe('');
  expect(await saved.locator('span').last().evaluate(node => node.getBoundingClientRect().width)).toBe(1);
  await page.screenshot({ path: info.outputPath(`header-${theme}.png`), animations: 'disabled' });

  await documentMenu.focus(); await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: '문서 메뉴', exact: true });
  await expect(menu).toBeVisible();
  // The icon retains all original grouped document commands and shortcuts.
  await expect(menu.locator('[data-menu-item="file.document.0"]')).toBeVisible();
  await expect(menu.locator('[data-menu-item="file.document.2"]')).toBeVisible();
  await expect(menu.locator('[data-menu-item="view.panes.1"]')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0);

  await search.focus(); await page.keyboard.press('Enter');
  const query = page.getByRole('combobox', { name: '명령 검색어', exact: true });
  await expect(query).toBeFocused();
  await query.fill('슬라이드');
  await expect(page.getByRole('listbox', { name: '명령 검색 결과' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(query).toHaveCount(0);
  await expect(search).toBeFocused();

  await recent.focus(); await page.keyboard.press('Enter');
  const library = page.getByRole('dialog', { name: '최근 발표 자료', exact: true });
  await expect(library).toBeVisible();
  await page.keyboard.press('Escape'); await expect(library).toHaveCount(0);
  await expect(recent).toBeFocused();
  expect(await snapshot()).toEqual(before);
});
