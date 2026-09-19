import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Capture the same workspace, viewport and open panels for visual review.
// Run with OFFICE_UI_CAPTURE=before|after; images are review artifacts, not pixel assertions.
test('shared chrome works across the four editors', async ({ page }) => {
  test.setTimeout(120_000);
  const output = `${process.cwd()}/../../.dev/artifacts/office-ui/${process.env.OFFICE_UI_CAPTURE || 'after'}`;
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  const frames: unknown[] = [];
  await page.goto('/');
  for (const product of ['Note', 'Word', 'Slides', 'Site']) {
    await page.getByRole('button', { name: `${product[0]} ${product} 새 자료 만들기`, exact: true }).click();
    await page.getByRole('textbox', { name: '새 자료 이름' }).fill('분기 계획');
    await page.getByRole('button', { name: '만들기', exact: true }).click();
    const nav = page.getByRole('navigation', { name: 'Wonffice 작업 공간' });
    await expect(nav.getByRole('menuitem', { name: product, exact: true })).toBeVisible();
    await expect(page.locator('.ow-host-nav-root')).toHaveCount(0);
    await expect(page.locator('.office-editor-product')).toHaveCount(0);
    await expect.poll(() => page.locator('[data-document-identity]').evaluate(el => el.querySelector('input')?.value || el.textContent?.trim())).toBe('분기 계획');
    if (product === 'Site') await page.getByRole('button', { name: '편집', exact: true }).click();
    if (product === 'Word') {
      await page.locator('.w-paragraph').last().click();
      await page.keyboard.type('Wonffice team workspace');
    }
    await expect(page.locator('.office-editor-header')).toBeVisible();
    if (product === 'Slides') {
      const frame = await page.locator('.sl-stage .sl-text-frame:visible').first().boundingBox();
      await page.mouse.click(frame!.x + frame!.width / 2, frame!.y + frame!.height / 2);
      const checkbox = page.locator('.office-properties').getByRole('checkbox', { name: '잠금', exact: true });
      const mark = checkbox.locator('+ .office-checkbox-mark');
      await expect(mark).toHaveCSS('width', '16px');
      await expect(mark).toHaveCSS('height', '16px');
      await checkbox.press('Space');
      await expect(checkbox).toBeChecked();
      await expect(mark.locator('svg')).toHaveCSS('visibility', 'visible');
      await checkbox.press('Space');
      await expect(checkbox).not.toBeChecked();
      await page.locator('.office-properties').screenshot({ path: `${output}/slides-inspector.png` });
      // Restore the unselected state used by the four-product comparison.
      const stage = await page.locator('.sl-overlay').boundingBox();
      await page.mouse.click(stage!.x + 8, stage!.y + 8);
      const tops = await page.locator('.sl-toolbar [data-ribbon-group]').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
      expect(new Set(tops).size, 'Ribbon categories fit in one band at desktop width').toBe(1);
    }
    if (product === 'Note') {
      await expect(page.getByLabel('내보내기 형식')).toHaveCount(0);
      await expect(page.locator('.nw-document').getByRole('button', { name: '휴지통으로 이동' })).toHaveCount(0);
      await page.getByRole('button', { name: '페이지 설정', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '페이지 설정', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    if (product === 'Site') {
      const tabs = page.getByRole('tablist', { name: '탐색 방식' });
      for (const tab of await tabs.getByRole('tab').all()) {
        await expect(tab).toBeInViewport();
        expect(await tab.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        await expect(tab).toHaveCSS('white-space', 'nowrap');
      }
      await tabs.getByRole('tab', { name: '추가', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(tabs.getByRole('tab', { name: '구성', exact: true })).toBeFocused();
      await expect(page.getByRole('tabpanel', { name: '구성', exact: true })).toBeVisible();
      await page.keyboard.press('End');
      await expect(tabs.getByRole('tab', { name: '데이터', exact: true })).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Home');
      await expect(tabs.getByRole('tab', { name: '추가', exact: true })).toHaveAttribute('aria-selected', 'true');
      await tabs.getByRole('tab', { name: '추가', exact: true }).blur();
    }
    if (product !== 'Note') {
      const ribbon = page.locator('.office-ribbon-toolbar');
      await expect(ribbon).toBeVisible();
      await expect(ribbon).toHaveClass(/office-compact-toolbar/);
      expect((await ribbon.boundingBox())!.height).toBe(44);
      await expect(ribbon.locator('.office-ribbon-group-footer:visible')).toHaveCount(0);
    }
    frames.push(await page.locator('.office-editor-header').evaluate(header => {
      const box = (selector: string) => { const r = header.querySelector(selector)!.getBoundingClientRect(); return { y: r.y, height: r.height }; };
      return { identity: box('[data-document-identity]'), menus: box('.office-editor-menus'), row: box('.office-document-bar') };
    }));
    await page.evaluate(() => document.fonts.ready);
    if (product === 'Word') await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
    await page.screenshot({ animations: 'disabled', path: `${output}/${product.toLowerCase()}.png` });
    const menu = page.locator('.office-editor-menus').getByRole('menuitem', { name: '파일', exact: true });
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(nav.getByRole('menuitem', { name: product, exact: true })).toBeInViewport();
    const actions = page.locator('.office-editor-actions');
    await expect(actions).toBeInViewport();
    const bounds = await actions.boundingBox(); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1024);
    await page.screenshot({ animations: 'disabled', path: `${output}/${product.toLowerCase()}-compact.png` });
    await page.setViewportSize({ width: 820, height: 768 });
    const clipped = await page.locator('.office-editor-header').evaluate(header => [...header.parentElement!.querySelectorAll('.office-editor-header button, .office-editor-header input, .office-editor-header select, .office-ribbon-toolbar button, .office-ribbon-toolbar input, .office-ribbon-toolbar select')].filter(el => {
      const r = el.getBoundingClientRect(); return r.width && (r.left < 0 || r.right > window.innerWidth);
    }).map(el => el.getAttribute('aria-label') || el.textContent));
    expect(clipped, `${product} header and ribbon commands stay within the viewport`).toEqual([]);
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ animations: 'disabled', path: `${output}/${product.toLowerCase()}-dark.png` });
    await page.emulateMedia({ colorScheme: 'light' });
    await nav.getByRole('menuitem', { name: product, exact: true }).press('Enter');
    await page.getByRole('menuitem', { name: '자료함', exact: true }).click();
    await expect(page.getByRole('heading', { name: '전체 자료', exact: true })).toBeVisible();
  }
  for (const frame of frames.slice(1)) expect(frame).toEqual(frames[0]);
});
