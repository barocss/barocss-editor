import { test, expect } from '@playwright/test';

test('four product menus use the same trigger and keyboard interaction', async ({ page }) => {
  await page.goto('/design-system/index.html#workspace');
  const sample = page.getByLabel('제품 메뉴 비교');
  const sizes = [];
  for (const name of ['Note', 'Word', 'Slides', 'Site']) {
    const trigger = sample.getByRole('menuitem', { name, exact: true });
    sizes.push(await trigger.evaluate(el => ({ height: el.getBoundingClientRect().height, size: getComputedStyle(el).fontSize, weight: getComputedStyle(el).fontWeight })));
    await trigger.focus(); await trigger.press('Enter');
    const menu = page.getByRole('menu', { name, exact: true });
    await expect(menu).toBeVisible();
    await page.keyboard.press('End'); await page.keyboard.press('Enter');
    await expect(page.locator('[data-product-menu-result]')).toHaveText(`${name} · 연결한 자료 선택`);
    await expect(menu).toBeHidden();
  }
  expect(sizes.every(size => JSON.stringify(size) === JSON.stringify(sizes[0]))).toBe(true);
});

test('Site view controls stay in the header in editing and disappear in management', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'S Site 새 자료 만들기', exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름' }).fill('보기 도구 검증');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await page.getByRole('button', { name: '편집', exact: true }).click();
  const view = page.locator('.office-editor-view');
  await expect(view.getByRole('button', { name: '미리보기', exact: true })).toBeVisible();
  await expect(page.locator('.st-ribbon [data-zoom-value]')).toHaveCount(0);
  for (const width of [1440, 560, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(view.getByRole('textbox', { name: '확대/축소' })).toHaveCount(1);
    expect(await page.locator('.office-editor-header').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    const tops = await view.locator(':scope > *').evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().top));
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(8);
    const zoom = view.getByRole('textbox', { name: '확대/축소' });
    await zoom.fill('75%'); await zoom.press('Enter'); await expect(zoom).toHaveValue('75%');
  }
  await view.getByRole('button', { name: '미리보기', exact: true }).click();
  await expect(view.locator('.st-preview-toggle')).toHaveAttribute('aria-pressed', 'true');
  await view.getByRole('button', { name: '편집', exact: true }).click();
  await expect(view.locator('.st-preview-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('[data-to-admin]').click();
  await expect(view).toHaveCount(0);
  await expect(page.locator('.st-ribbon')).toHaveCount(0);
});
