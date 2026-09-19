import { test, expect } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  test(`suite command chrome shares geometry and palette in ${theme}`, async ({ page }, info) => {
    const samples: unknown[] = [];
    for (const [index, app] of ['word', 'slide', 'site', 'note'].entries()) {
      await page.goto(`http://localhost:${5180 + index}/`);
      await page.locator('.office-command-surface').first().waitFor();
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      if (app === 'site') await page.locator('[data-admin-open]').first().click();
      if (app === 'note') {
        const menu = page.getByRole('menubar', { name: '노트 메뉴' });
        await expect(menu.getByRole('menuitem').first()).toHaveCSS('height', '28px');
        await menu.getByRole('menuitem').first().click();
        await expect(page.getByRole('menuitem', { name: '파일 열기', exact: true })).toBeEnabled();
        await page.keyboard.press('Escape');
        await expect(page.getByLabel('노트 제목')).toBeVisible();
        await page.getByLabel('노트 파일').setInputFiles({ name: 'chrome.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: '공통 도구 디자인' }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '함께 만드는 문서' }] }] } })) });
        await page.locator('.on-doc > p').first().click();
        await page.keyboard.press('End');
        await page.keyboard.press('Shift+Home');
        await expect(page.locator('[data-editor-context-toolbar]')).toBeVisible();
      } else {
        await expect(page.locator('.office-toolbar')).toBeVisible();
        const menu = page.locator('.office-menubar > [role=menuitem]').first();
        await expect(menu).toHaveCSS('height', '28px');
        await menu.click();
        await expect(page.locator('[data-context-menu]')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('[data-context-menu]')).toHaveCount(0);
      }
      const surface = page.locator(app === 'note' ? '[data-floating-variant=toolbar]' : '.office-toolbar').first();
      samples.push(await surface.evaluate(el => {
        const s = getComputedStyle(el);
        return Object.fromEntries(['--ou-panel', '--ou-line', '--ou-ink', '--ou-accent', '--ou-control-h', '--ou-text', '--ou-radius'].map(key => [key, s.getPropertyValue(key).trim()]));
      }));
      await expect(surface.locator('button:not([role=radio])').first()).toHaveCSS('height', '30px');
      if (app === 'note') {
        const bold = surface.locator('button[aria-pressed]').first();
        await bold.click();
        await expect(bold).toHaveAttribute('aria-pressed', 'true');
        await bold.hover();
        const state = await bold.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, panel: getComputedStyle(el).getPropertyValue('--ou-panel').trim(), color: getComputedStyle(el).color }));
        expect(state.background).not.toBe(theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(23, 23, 23)');
        expect(state.color).not.toBe(state.background);
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      await page.screenshot({ path: info.outputPath(`${app}-${theme}.png`) });
      await page.setViewportSize({ width: 820, height: 800 });
      const outside = await surface.locator('button').evaluateAll(buttons => buttons.filter(button => {
        const r = button.getBoundingClientRect(); return r.width > 0 && (r.left < 0 || r.right > innerWidth + 1);
      }).map(button => button.getAttribute('aria-label') ?? button.textContent));
      expect(outside, `${app} controls should remain reachable`).toEqual([]);
      await page.setViewportSize({ width: 1280, height: 800 });
    }
    for (const sample of samples.slice(1)) expect(sample).toEqual(samples[0]);
  });
}
