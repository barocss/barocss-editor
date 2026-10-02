import { test, expect } from '@playwright/test';
import { settled } from './helpers';

for (const width of [1440, 1280]) for (const theme of ['light', 'dark']) {
  test(`default Word header retains reachable long-title menus/actions/view (${width}-${theme})`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
    await page.goto('/?sample');
    await settled(page);
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const header = page.locator('.w-document-header');
    await expect(header).not.toHaveAttribute('data-compact');
    const title = header.locator('.doc-title-docTitle');
    const value = 'Long document title — 메뉴와 보기 도구 검증 '.repeat(8);
    await title.fill(value);
    await title.press('Tab');
    await expect(title).toHaveValue(value);
    await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
    const before = await page.evaluate(() => JSON.stringify(window.editor.exportDocument()));
    const geometry = await header.evaluate(element => ({
      box: element.getBoundingClientRect().toJSON(),
      scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      controls: [...element.querySelectorAll<HTMLElement>('button,input,[role="menuitem"]')]
        .filter(control => !!control.getClientRects().length).map(control => {
          const box = control.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return { name: control.getAttribute('aria-label') ?? control.textContent, box: box.toJSON(), hit: !!hit && control.contains(hit) };
        })
    }));
    expect(geometry.box.height).toBe(52);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    for (const control of geometry.controls) {
      expect(control.box.width, control.name ?? '').toBeGreaterThan(0);
      expect(control.box.left, control.name ?? '').toBeGreaterThanOrEqual(geometry.box.left);
      expect(control.box.right, control.name ?? '').toBeLessThanOrEqual(geometry.box.right);
      expect(control.box.top, control.name ?? '').toBeGreaterThanOrEqual(geometry.box.top);
      expect(control.box.bottom, control.name ?? '').toBeLessThanOrEqual(geometry.box.bottom);
      expect(control.hit, control.name ?? '').toBe(true);
    }
    await header.getByRole('menuitem', { name: '파일', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: '열기…', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await header.getByRole('menuitem', { name: '보기', exact: true }).press('Enter');
    await expect(page.getByRole('menu', { name: '보기', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await header.getByRole('button', { name: '명령 검색', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '명령 검색어', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    const zoom = header.getByRole('textbox', { name: '확대/축소', exact: true });
    const initialZoom = await zoom.inputValue();
    await header.getByRole('button', { name: '확대', exact: true }).click();
    await expect(zoom).not.toHaveValue(initialZoom);
    await header.getByRole('button', { name: '축소', exact: true }).click();
    await expect(zoom).toHaveValue(initialZoom);
    expect(await page.evaluate(() => JSON.stringify(window.editor.exportDocument()))).toBe(before);
    await info.attach('header-geometry.json', { body: JSON.stringify(geometry), contentType: 'application/json' });
    await header.screenshot({ path: info.outputPath('header.png') });
  });
}
