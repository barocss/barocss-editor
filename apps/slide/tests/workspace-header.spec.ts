import { expect, test } from '@playwright/test';
import { openDeck } from './helpers';

for (const theme of ['light', 'dark']) {
  test(`floating tools share the canvas background at the reported desktop size (${theme})`, async ({ page }, info) => {
    await page.setViewportSize({ width: 979, height: 1119 });
    await openDeck(page);
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    // Theme paint has a color transition. Verify its finished state, not one
    // animation frame between the old ink and the new studio background.
    await page.locator('.sl-shell').evaluate(async node => {
      await Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished));
    });
    const paint = await page.evaluate(() => {
      const background = (selector: string) => {
        let element = document.querySelector(selector);
        while (element) {
          const color = getComputedStyle(element).backgroundColor;
          if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color;
          element = element.parentElement;
        }
        throw new Error(`No painted background for ${selector}`);
      };
      return { row: background('.sl-utilities'), canvas: background('.sl-stage'),
        insertion: background('.sl-insertion-chrome > [role="toolbar"]') };
    });
    await info.attach('backgrounds.json', { body: JSON.stringify(paint), contentType: 'application/json' });
    expect(paint.row).toBe(paint.canvas);
    expect(paint.insertion).not.toBe(paint.canvas);
    const controls = await page.locator('.sl-topbar button:enabled, .sl-utilities button:enabled').evaluateAll(nodes => {
      const luminance = (color: string) => {
        const channels = color.match(/[\d.]+/g)!.map(Number);
        if (!/^(rgba?\(|color\(srgb )/.test(color) || channels.length > 3 && channels[3] !== 1) {
          throw new Error(`Expected an opaque sRGB surface, received ${color}`);
        }
        const rgb = channels.slice(0, 3).map(channel => {
          const value = color.startsWith('color(srgb ') ? channel : channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      return nodes.filter(node => node.getBoundingClientRect().width >= 32).map(node => {
        let painted: Element | null = node;
        while (painted && getComputedStyle(painted).backgroundColor === 'rgba(0, 0, 0, 0)') painted = painted.parentElement;
        const ink = getComputedStyle(node).color, background = getComputedStyle(painted!).backgroundColor;
        const foregroundLuma = luminance(ink), backgroundLuma = luminance(background);
        return { name: node.getAttribute('aria-label') ?? node.textContent, ink, background,
          contrast: (Math.max(foregroundLuma, backgroundLuma) + 0.05) / (Math.min(foregroundLuma, backgroundLuma) + 0.05) };
      });
    });
    await info.attach('enabled-control-contrast.json', { body: JSON.stringify(controls), contentType: 'application/json' });
    expect(controls.length).toBeGreaterThan(10);
    for (const control of controls) expect(control.contrast, control.name ?? 'enabled control').toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: info.outputPath(`${theme}-workspace.png`), animations: 'disabled' });
  });
}

test('header icons explain and toggle their panels without editing the deck', async ({ page }, info) => {
  await page.setViewportSize({ width: 979, height: 1119 });
  await openDeck(page);
  const native = () => page.evaluate(() => {
    const editor = (window as any).editor;
    return { document: editor.exportDocument(), history: editor.getHistoryStats() };
  });
  const before = await native();
  const header = page.locator('.sl-topbar');
  const actions = [
    { label: '편집 도구', tip: '편집 도구 · 글꼴, 문단, 삽입', panel: '[data-slides-detail]' },
    { label: '레이어', tip: '레이어 · 개체 순서와 컴포넌트', panel: '#slides-objects' },
    { label: '속성', tip: '속성 · 크기, 위치, 모양', panel: '#slides-details' }
  ];
  for (const action of actions) {
    const button = header.getByRole('button', { name: action.label, exact: true });
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button.locator('svg')).toBeVisible();
    await expect(button).toHaveText('');
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(32);
    expect(box.height).toBeGreaterThanOrEqual(32);
    expect(box.x + box.width).toBeLessThanOrEqual(979);
    await button.focus();
    await expect(page.getByRole('tooltip')).toHaveText(action.tip);
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
    await button.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(action.panel)).toBeVisible();
    if (action.label === '레이어') {
      await page.getByRole('tab', { name: '컴포넌트', exact: true }).click();
      await expect(page.getByRole('tab', { name: '컴포넌트', exact: true })).toHaveAttribute('aria-selected', 'true');
    }
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(action.panel)).toBeHidden();
    expect(await native()).toEqual(before);
  }
  await expect(header.locator('[data-icon-missing]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('header-icons.png') });
});
