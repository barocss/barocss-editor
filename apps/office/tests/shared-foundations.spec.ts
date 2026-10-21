import { expect, test, type Locator } from '@playwright/test';

/** Resolve actual browser paint, including CSS color-mix and alpha surfaces. */
async function contrast(locator: Locator, property = 'color', outside = false) {
  return locator.evaluate((element, options) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const blend = (front: number[], back: number[]) => {
      const alpha = front[3] / 255;
      return [0, 1, 2].map(index => front[index] * alpha + back[index] * (1 - alpha)).concat(255);
    };
    const ancestors: Element[] = [];
    for (let node: Element | null = options.outside ? element.parentElement : element; node; node = node.parentElement) ancestors.unshift(node);
    const background = ancestors.reduce((paint, node) => blend(rgba(getComputedStyle(node).backgroundColor), paint), [255, 255, 255, 255]);
    const declared = getComputedStyle(element).getPropertyValue(options.property);
    const foreground = blend(rgba(declared), background);
    const luminance = (paint: number[]) => {
      const linear = paint.slice(0, 3).map(channel => {
        const value = channel / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      });
      return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
    };
    const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
    return { ratio: (values[1] + .05) / (values[0] + .05), declared, background: background.slice(0, 3) };
  }, { property, outside });
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 1000 }, { width: 1024, height: 800 }]) {
  test(`sample navigation stays reachable without covering its helper at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/design-system/index.html');
    const navigation = page.getByRole('navigation', { name: '디자인 기준' });
    const links = navigation.getByRole('link');
    await expect(links).toHaveCount(24);
    const helper = page.locator('.ds-navigation-note');
    const geometry = async () => {
      const nav = await navigation.boundingBox();
      const note = await helper.boundingBox();
      expect(nav).not.toBeNull(); expect(note).not.toBeNull();
      expect(nav!.y + nav!.height).toBeLessThanOrEqual(note!.y);
      expect(note!.y + note!.height).toBeLessThanOrEqual(viewport.height);
      expect(note!.y).toBeGreaterThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    };
    await geometry();
    await links.first().focus();
    for (let index = 0; index < 24; index++) {
      const link = links.nth(index);
      await expect(link).toBeFocused();
      const nav = (await navigation.boundingBox())!;
      const box = (await link.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(nav.y);
      expect(box.y + box.height).toBeLessThanOrEqual(nav.y + nav.height);
      const href = await link.getAttribute('href');
      await expect(page.locator(href!)).toHaveCount(1);
      if (index < 23) await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Shift+Tab');
    await expect(links.nth(22)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(links.last()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#rules$/);
    await expect(links.last()).toHaveAttribute('aria-current', 'location');
    await expect(page.locator('#rules')).toBeInViewport();
    await geometry();
    await page.getByRole('link', { name: '전체 컴포넌트', exact: true }).click();
    await expect(page).toHaveURL(/\?catalogue/);
    await expect(page.getByRole('heading', { name: 'Barocss UI', exact: true })).toBeVisible();
  });
}

for (const theme of ['light', 'dark']) {
  test(`${theme} shared surfaces retain readable text, field boundaries and keyboard focus`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/design-system/index.html');
    await page.getByRole('combobox', { name: '시스템 테마' }).click();
    await page.getByRole('option', { name: theme === 'light' ? '밝은 테마' : '어두운 테마', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const readings: Record<string, Awaited<ReturnType<typeof contrast>>> = {};
    for (const [name, locator] of [
      ['heading', page.getByRole('heading', { name: '인터페이스 기준', exact: true })],
      ['helper', page.locator('.ds-navigation-note')],
      ['selected navigation', page.getByRole('navigation', { name: '디자인 기준' }).locator('[aria-current="location"]')],
      ['primary field', page.getByRole('textbox', { name: '기본 문서명', exact: true })],
      ['accent button', page.locator('#states').getByRole('button', { name: '적용', exact: true })],
      ['invalid explanation', page.locator('#ds-name-error')],
    ] as const) {
      // Theme changes retain the existing colour transition; measure settled paint.
      await expect.poll(async () => (await contrast(locator)).ratio, name).toBeGreaterThanOrEqual(4.5);
      readings[name] = await contrast(locator);
      expect(readings[name].ratio, `${name}: ${JSON.stringify(readings[name])}`).toBeGreaterThanOrEqual(4.5);
    }
    const field = page.getByRole('textbox', { name: '기본 문서명', exact: true });
    readings['field boundary'] = await contrast(field, 'border-top-color');
    expect(readings['field boundary'].ratio).toBeGreaterThanOrEqual(3);
    const invalid = page.getByRole('textbox', { name: '필수 문서명', exact: true });
    await expect(invalid).toHaveAttribute('aria-invalid', 'true');
    await expect(invalid).toHaveAttribute('aria-describedby', 'ds-name-error');
    readings['invalid boundary'] = await contrast(invalid, 'border-top-color');
    expect(readings['invalid boundary'].ratio).toBeGreaterThanOrEqual(3);
    const button = page.getByRole('button', { name: '이름 변경', exact: true });
    await button.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(button).toBeFocused();
    await expect(button).toHaveCSS('outline-style', 'solid');
    expect(parseFloat(await button.evaluate(node => getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(2);
    readings['keyboard focus'] = await contrast(button, 'outline-color', true);
    expect(readings['keyboard focus'].ratio).toBeGreaterThanOrEqual(3);
    await info.attach(`contrast-${theme}`, { body: JSON.stringify(readings, null, 2), contentType: 'application/json' });
  });
}

test('reduced motion removes button transitions and popup entry while preserving dismissal', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/design-system/index.html#motion');
  const button = page.getByRole('button', { name: '모션 메뉴 열기', exact: true });
  expect(await button.evaluate(node => getComputedStyle(node).transitionDuration.split(',').every(value => parseFloat(value) === 0))).toBe(true);
  await button.press('Enter');
  const popup = page.getByRole('menu', { name: '모션 예시 메뉴', exact: true });
  await expect(popup).toBeVisible();
  await expect(popup).toHaveCSS('animation-name', 'none');
  expect(await popup.evaluate(node => getComputedStyle(node).transitionDuration.split(',').every(value => parseFloat(value) === 0))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
});

test('catalogue density keeps the same readable button family in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/design-system/index.html?catalogue');
  const button = page.getByRole('button', { name: '기본', exact: true });
  for (const theme of ['밝게', '어둡게']) {
    await page.getByRole('combobox', { name: '테마', exact: true }).click();
    await page.getByRole('option', { name: theme, exact: true }).click();
    const measures: number[] = [];
    for (const density of ['보통', '좁게']) {
      await page.getByRole('combobox', { name: '밀도', exact: true }).click();
      await page.getByRole('option', { name: density, exact: true }).click();
      await expect(button).toBeVisible();
      measures.push((await button.boundingBox())!.height);
      await expect.poll(async () => (await contrast(button)).ratio).toBeGreaterThanOrEqual(4.5);
      await button.press('Space');
      await expect(button).toBeFocused();
      expect(await button.evaluate(node => getComputedStyle(node).outlineWidth)).not.toBe('0px');
    }
    expect(measures[1]).toBeLessThan(measures[0]);
  }
});
