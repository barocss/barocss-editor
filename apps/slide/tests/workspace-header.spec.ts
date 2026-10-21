import { expect, test } from '@playwright/test';
import { openDeck, openInsertMenu, panelTrigger } from './helpers';

for (const theme of ['light', 'dark']) {
  test(`single header and owned Insert retain painted surfaces and control contrast at the reported desktop size (${theme})`, async ({ page }, info) => {
    await page.setViewportSize({ width: 979, height: 1119 });
    await openDeck(page);
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    // Theme paint has a color transition. Verify its finished state, not one
    // animation frame between the old ink and the new studio background.
    await page.locator('.sl-shell').evaluate(async node => {
      await Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished));
    });
    await expect(page.locator('.sl-utilities')).toHaveCount(0);
    await expect(page.locator('.sl-topbar .sl-insertion-chrome')).toHaveCount(1);
    await expect(page.locator('.sl-main .sl-insertion-chrome')).toHaveCount(0);
    expect((await page.locator('.sl-topbar').boundingBox())!.height).toBe(48);
    await openInsertMenu(page);
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
      return { row: background('.sl-header-edit-tools'), canvas: background('.sl-stage'),
        insertion: background('[aria-label="Slides 삽입 및 슬라이드 메뉴"]') };
    });
    await info.attach('backgrounds.json', { body: JSON.stringify(paint), contentType: 'application/json' });
    // The Insert owner moved from the floating utility row into the header.
    expect(paint.row).not.toBe(paint.canvas);
    expect(paint.insertion).not.toBe(paint.canvas);
    const controls = await page.locator('.sl-topbar button:enabled, [aria-label="Slides 삽입 및 슬라이드 메뉴"] button:enabled').evaluateAll(nodes => {
      // Composite actual CSS colors, including translucent color-mix/oklab
      // surfaces, in the browser's sRGB canvas before measuring contrast.
      const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
      const rgba = (color: string) => {
        context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      };
      const over = (foreground: number[], background: number[]) => {
        const alpha = foreground[3] / 255;
        return foreground.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
      };
      const luminance = (channels: number[]) => {
        const rgb = channels.map(channel => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      return nodes.filter(node => node.getBoundingClientRect().width >= 32).map(node => {
        const ancestors: Element[] = [];
        for (let painted: Element | null = node; painted; painted = painted.parentElement) ancestors.unshift(painted);
        const background = ancestors.reduce((paint, element) => over(rgba(getComputedStyle(element).backgroundColor), paint), [255, 255, 255]);
        const ink = getComputedStyle(node).color;
        const foregroundLuma = luminance(over(rgba(ink), background)), backgroundLuma = luminance(background);
        return { name: node.getAttribute('aria-label') ?? node.textContent, ink, background,
          contrast: (Math.max(foregroundLuma, backgroundLuma) + 0.05) / (Math.min(foregroundLuma, backgroundLuma) + 0.05) };
      });
    });
    await info.attach('enabled-control-contrast.json', { body: JSON.stringify(controls), contentType: 'application/json' });
    expect(controls.length).toBeGreaterThan(10);
    for (const control of controls) expect(control.contrast, control.name ?? 'enabled control').toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press('Escape');
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
  const button = panelTrigger(page);
  await expect(button).toHaveAccessibleName('패널');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(button.locator('svg')).toBeVisible();
  await expect(button).toHaveText('');
  const box = (await button.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(32);
  expect(box.height).toBeGreaterThanOrEqual(32);
  expect(box.x + box.width).toBeLessThanOrEqual(979);
  const actions = [
    { label: '레이어 · 개체 순서와 컴포넌트', panel: '#slides-objects', key: 'Home' },
    { label: '속성 · 크기, 위치, 모양', panel: '#slides-details', key: 'End' }
  ];
  for (const action of actions) {
    await button.focus(); await button.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const item = page.getByRole('menuitemcheckbox', { name: action.label, exact: true });
    await expect(item).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press(action.key); await expect(item).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
    await expect(page.locator(action.panel)).toBeVisible();
    if (action.key === 'Home') {
      await page.getByRole('tab', { name: '컴포넌트', exact: true }).click();
      await expect(page.getByRole('tab', { name: '컴포넌트', exact: true })).toHaveAttribute('aria-selected', 'true');
    }
    await button.click();
    await expect(item).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press(action.key); await expect(item).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
    await expect(page.locator(action.panel)).toBeHidden();
    expect(await native()).toEqual(before);
  }
  await expect(header.locator('[data-icon-missing]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('header-icons.png') });
});
