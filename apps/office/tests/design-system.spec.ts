import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const output = '../../.dev/artifacts/design-system';
test.beforeEach(async ({ page }) => {
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/design-system/index.html');
  await expect(page.getByRole('heading', { name: '인터페이스 기준', exact: true })).toBeVisible();
});

test('state examples preserve selected hover, mixed keyboard state and validation', async ({ page }) => {
  const selected = page.getByRole('button', { name: '선택 상태', exact: true });
  const before = await selected.evaluate(el => getComputedStyle(el).backgroundColor);
  await selected.hover();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => selected.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(before);
  const mixed = page.getByRole('button', { name: '혼합 굵게', exact: true });
  await expect(mixed).toHaveAttribute('aria-pressed', 'mixed');
  await mixed.press('Enter');
  await expect(mixed).toHaveAttribute('aria-pressed', 'true');
  const field = page.getByRole('textbox', { name: '필수 문서명' });
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAttribute('aria-describedby', 'ds-name-error');
  await field.fill('회의록');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#ds-name-error')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '비활성 삭제' })).toBeDisabled();
  await page.locator('#states').screenshot({ path: `${output}/states.png` });
});

test('document and inspector examples respond to the shared controls', async ({ page }) => {
  await page.getByRole('button', { name: '예시 굵게', exact: true }).click();
  await expect(page.locator('[data-sample-paragraph]')).toHaveCSS('font-weight', '650');
  await page.getByRole('button', { name: '예시 가운데 정렬', exact: true }).click();
  await expect(page.locator('[data-sample-paragraph]')).toHaveCSS('text-align', 'center');
  const width = page.getByRole('spinbutton', { name: '객체 너비', exact: true });
  await width.fill('280');
  await width.press('Enter');
  await expect(page.locator('[data-sample-object]')).toHaveCSS('width', '280px');
  await width.fill('300');
  await width.press('Escape');
  await expect(width).toHaveValue('280');
  await expect(page.locator('[data-sample-object]')).toHaveCSS('width', '280px');
  const menu = page.getByRole('menubar', { name: '예시 문서 메뉴' }).getByRole('menuitem', { name: '문서', exact: true });
  await menu.press('Enter');
  await page.getByRole('menuitem', { name: '작업 예시 초기화', exact: true }).click();
  await expect(page.locator('[data-sample-object]')).toHaveCSS('width', '240px');
  await expect(page.locator('[data-sample-paragraph]')).toHaveCSS('font-weight', '400');
  await page.locator('#patterns').screenshot({ path: `${output}/patterns.png` });
});

test('theme tokens apply to portals and the gallery fits laptop and mobile widths', async ({ page }) => {
  await page.locator('#foundations').screenshot({ path: `${output}/foundations.png` });
  await page.getByRole('combobox', { name: '시스템 테마' }).click();
  await page.getByRole('option', { name: '어두운 테마', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const surface = await page.locator('.ds-shell').evaluate(el => getComputedStyle(el).backgroundColor);
  expect(surface).not.toBe('rgb(255, 255, 255)');
  await page.getByRole('button', { name: '이름 변경', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '샘플 이름 변경' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => getComputedStyle(el).getPropertyValue('--ou-panel').trim())).not.toBe('#ffffff');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.locator('#states').screenshot({ path: `${output}/states-dark.png` });
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('link', { name: '전체 컴포넌트', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Barocss UI', exact: true })).toBeVisible();
});


test('checkbox paint survives inspector focus and hover in both themes', async ({ page }) => {
  const checkbox = page.getByRole('checkbox', { name: '객체 선택 표시', exact: true });
  const mark = checkbox.locator('+ .office-checkbox-mark');
  for (const theme of ['밝은 테마', '어두운 테마']) {
    await page.getByRole('combobox', { name: '시스템 테마' }).click();
    await page.getByRole('option', { name: theme, exact: true }).click();
    await checkbox.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await expect(checkbox).toBeChecked();
    const accent = await checkbox.evaluate(el => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--ou-accent)'; el.parentElement!.append(probe);
      const color = getComputedStyle(probe).color; probe.remove(); return color;
    });
    await expect(mark).toHaveCSS('background-color', accent);
    await expect(mark.locator('svg')).toHaveCSS('visibility', 'visible');
    await expect(mark).toHaveCSS('width', '16px');
    expect((await checkbox.boundingBox())!.width).toBe(24);
    await checkbox.hover();
    await expect.poll(() => mark.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(accent);
    await checkbox.press('Space');
    await expect(checkbox).not.toBeChecked();
    await expect(mark.locator('svg')).toHaveCSS('visibility', 'hidden');
    await checkbox.press('Space');
    await expect(checkbox).toBeChecked();
    await page.mouse.move(0, 0);
    await expect(mark).toHaveCSS('background-color', accent);
    await expect(mark).toHaveCSS('outline-style', 'solid');
    await expect(page.getByRole('checkbox', { name: '비활성 선택 체크박스', exact: true })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: '비활성 기본 체크박스', exact: true })).not.toBeChecked();
    await page.locator('.ds-object-example').screenshot({ path: `${output}/inspector-${theme === '밝은 테마' ? 'light' : 'dark'}.png` });
  }
});

test('choice labels keep their column and keyboard selection updates the sample', async ({ page }) => {
  const choice = page.getByRole('combobox', { name: '예시 글자 크기' });
  await choice.click();
  const options = page.getByRole('option');
  await expect(options).toHaveCount(3);
  const positions = await options.evaluateAll(nodes => nodes.map(node => node.lastElementChild!.getBoundingClientRect().left));
  expect(new Set(positions).size).toBe(1);
  await expect(page.getByRole('option', { name: '16', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: '20', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-sample-paragraph]')).toHaveCSS('font-size', '20px');
  await expect(choice).toBeFocused();
});
