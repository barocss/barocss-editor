import { expect, test } from '@playwright/test';
import { nativeEditor, nativeFrame } from './helpers/native-editor';
import { openLocalLibrary } from './helpers/local-library';
import { mkdir } from 'node:fs/promises';

// Capture the same workspace, viewport and open panels for visual review.
// Run with OFFICE_UI_CAPTURE=before|after; images are review artifacts, not pixel assertions.
for (const width of [1440, 1024, 820]) test(`shared chrome works across the four editors at ${width}px`, async ({ page }, info) => {
  test.setTimeout(120_000);
  const output = info.outputPath(`office-ui-${process.env.OFFICE_UI_CAPTURE || 'after'}`);
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width, height: width === 1440 ? 960 : 768 });
  const frames: unknown[] = [];
  await page.goto('/'); await openLocalLibrary(page);
  for (const product of ['Note', 'Word', 'Slides', 'Site']) {
    await page.getByRole('button', { name: `${product} 새 자료 만들기`, exact: true }).click();
    await page.getByRole('textbox', { name: '새 자료 이름' }).fill('분기 계획');
    await page.getByRole('button', { name: '만들기', exact: true }).click();
    const native = nativeEditor(page);
    await expect(native.locator('#root')).toBeVisible();
    const frameWindow = await nativeFrame(page);
    const nav = native.getByRole('navigation', { name: 'Wonffice 작업 공간' });
    await expect(nav.getByRole('menuitem', { name: product, exact: true })).toBeVisible();
    await expect(page.locator('.ow-host-nav-root')).toHaveCount(0);
    await expect(native.locator('.office-editor-product')).toHaveCount(0);
    await expect.poll(() => native.locator('[data-document-identity]').evaluate(el => el.querySelector('input')?.value || el.textContent?.trim())).toBe('분기 계획');
    if (product === 'Word') {
      await native.locator('.w-paragraph').last().click();
      await page.keyboard.type('Wonffice team workspace');
    }
    await expect(native.locator('.office-editor-header')).toBeVisible();
    if (product === 'Slides') {
      await native.getByRole('menuitem', { name: '패널', exact: true }).click();
      await native.getByRole('menuitemcheckbox', { name: '속성 · 크기, 위치, 모양', exact: true }).click();
      const frame = await native.locator('.sl-stage .sl-text-frame:visible').first().boundingBox();
      await page.mouse.click(frame!.x + frame!.width / 2, frame!.y + frame!.height / 2);
      const checkbox = native.locator('.office-properties').getByRole('checkbox', { name: '잠금', exact: true });
      const mark = checkbox.locator('+ .office-checkbox-mark');
      await expect(mark).toHaveCSS('width', '16px');
      await expect(mark).toHaveCSS('height', '16px');
      await checkbox.press('Space');
      await expect(checkbox).toBeChecked();
      await expect(mark.locator('svg')).toHaveCSS('visibility', 'visible');
      await checkbox.press('Space');
      await expect(checkbox).not.toBeChecked();
      await native.locator('.office-properties').screenshot({ path: `${output}/slides-inspector.png` });
      // Restore the unselected state used by the four-product comparison.
      const stage = await native.locator('.sl-overlay').boundingBox();
      await page.mouse.click(stage!.x + 8, stage!.y + 8);
      const tops = await native.locator('.office-editor-header [data-ribbon-group]').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
      expect(new Set(tops).size, 'Ribbon categories fit in one band at desktop width').toBe(1);
    }
    if (product === 'Note') {
      await expect(native.getByLabel('내보내기 형식')).toHaveCount(0);
      await expect(native.locator('.nw-document').getByRole('button', { name: '휴지통으로 이동' })).toHaveCount(0);
      await native.getByRole('menuitem', { name: '노트 메뉴', exact: true }).click();
      await native.getByRole('menuitem', { name: '페이지 설정', exact: true }).click();
      await expect(native.getByRole('dialog', { name: '페이지 설정', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(native.getByRole('dialog')).toHaveCount(0);
    }
    if (product === 'Site') {
      await native.getByRole('menuitem', { name: '패널', exact: true }).click();
      await native.getByRole('menuitemcheckbox', { name: '페이지 및 구조', exact: true }).click();
      const tabs = native.getByRole('tablist', { name: '탐색 방식' });
      for (const tab of await tabs.getByRole('tab').all()) {
        await expect(tab).toBeInViewport();
        expect(await tab.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        await expect(tab).toHaveCSS('white-space', 'nowrap');
      }
      await tabs.getByRole('tab', { name: '추가', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(tabs.getByRole('tab', { name: '구성', exact: true })).toBeFocused();
      await expect(native.getByRole('tabpanel', { name: '구성', exact: true })).toBeVisible();
      await page.keyboard.press('End');
      await expect(tabs.getByRole('tab', { name: '데이터', exact: true })).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Home');
      await expect(tabs.getByRole('tab', { name: '추가', exact: true })).toHaveAttribute('aria-selected', 'true');
      await tabs.getByRole('tab', { name: '추가', exact: true }).blur();
    }
    if (product !== 'Note') {
      // Common editing controls now occupy the single document header.
      await expect(native.locator('.office-editor-header')).toHaveCount(1);
      expect((await native.locator('.office-document-bar').boundingBox())!.height).toBe(48);
      const tools = native.locator('.office-editor-tools');
      await expect(tools).toBeVisible();
      expect((await tools.boundingBox())!.height).toBe(36);
      await expect(native.locator('.office-ribbon-group-footer:visible')).toHaveCount(0);
      const hits = await tools.locator('button').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { width: r.width, height: r.height }; }).filter(r => r.width && r.height));
      expect(hits.length).toBeGreaterThan(0);
      for (const hit of hits) { expect(hit.width).toBeGreaterThanOrEqual(32); expect(hit.height).toBeGreaterThanOrEqual(32); }
    }
    frames.push(await native.locator('.office-editor-header').evaluate(header => {
      const box = (selector: string) => { const r = header.querySelector(selector)!.getBoundingClientRect(); return { y: r.y, height: r.height }; };
      return { identity: box('[data-document-identity]'), menus: box('.office-editor-menus'), row: box('.office-document-bar') };
    }));
    await frameWindow.evaluate(() => document.fonts.ready);
    if (product === 'Word') await expect(native.locator('[data-word-save-status]')).toHaveText('저장됨');
    await page.screenshot({ animations: 'disabled', path: `${output}/${product.toLowerCase()}.png` });
    const menu = native.locator('.office-editor-menus').getByRole('menuitem', { name: product === 'Note' ? '노트 메뉴' : '문서 메뉴', exact: true });
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    // Each width is a separate scenario. The retained 820px case is not run in this assignment.
    await expect(nav.getByRole('menuitem', { name: product, exact: true })).toBeInViewport();
    const actions = native.locator('.office-editor-actions');
    await expect(actions).toBeInViewport();
    const right = await actions.evaluate(el => el.getBoundingClientRect().right); expect(right).toBeLessThanOrEqual(await frameWindow.evaluate(() => innerWidth));
    await page.screenshot({ animations: 'disabled', path: `${output}/${product.toLowerCase()}-compact.png` });
    // Check every currently shown native command at this scenario width.
    const clipped = await native.locator('.office-editor-header').evaluate(header => [...header.parentElement!.querySelectorAll('.office-editor-header button, .office-editor-header input, .office-editor-header select, .office-ribbon-toolbar button, .office-ribbon-toolbar input, .office-ribbon-toolbar select')].filter(el => {
      const r = el.getBoundingClientRect(); return r.width && (r.left < 0 || r.right > window.innerWidth);
    }).map(el => el.getAttribute('aria-label') || el.textContent));
    expect(clipped, `${product} header and ribbon commands stay within the viewport`).toEqual([]);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ animations: 'disabled', path: `${output}/${product.toLowerCase()}-dark.png` });
    await page.emulateMedia({ colorScheme: 'light' });
    await nav.getByRole('menuitem', { name: product, exact: true }).press('Enter');
    await native.getByRole('menuitem', { name: '자료함', exact: true }).click();
    await expect(page.getByRole('heading', { name: '전체 자료', exact: true })).toBeVisible();
  }
  for (const frame of frames.slice(1)) expect(frame).toEqual(frames[0]);
});
