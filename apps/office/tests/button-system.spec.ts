import { expect, test, type Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const output = '../../.dev/artifacts/design-system';
async function tokenColor(button: Locator, token: string) {
  return button.evaluate((element, name) => {
    const sample = document.createElement('span'); sample.style.color = `var(${name})`;
    element.append(sample); const value = getComputedStyle(sample).color; sample.remove(); return value;
  }, token);
}

test.beforeEach(async ({ page }) => {
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/design-system/index.html#buttons');
});

test('button tones keep their colors across surfaces, hover, press and both themes', async ({ page }) => {
  for (const theme of ['밝은 테마', '어두운 테마']) {
    await page.getByRole('combobox', { name: '시스템 테마' }).click();
    await page.getByRole('option', { name: theme, exact: true }).click();
    const accent = page.getByRole('button', { name: '강조 버튼 확인', exact: true });
    const panelAccent = page.getByRole('button', { name: '속성 패널 강조 버튼', exact: true });
    const ink = await tokenColor(accent, '--ou-accent-ink');
    const fill = await tokenColor(accent, '--ou-accent');
    for (const button of [accent, panelAccent]) {
      await page.mouse.move(0, 0);
      await expect(button).toHaveCSS('color', ink);
      await expect(button).toHaveCSS('background-color', fill);
      await button.hover();
      await expect(button).toHaveCSS('color', ink);
      await expect.poll(() => button.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(fill);
      const hover = await button.evaluate(el => getComputedStyle(el).backgroundColor);
      await page.mouse.down();
      await expect.poll(() => button.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(hover);
      await expect(button).toHaveCSS('color', ink);
      await page.mouse.up();
    }
    const selected = page.getByRole('button', { name: '아이콘 선택 버튼', exact: true });
    const selectedInk = await tokenColor(selected, '--ou-accent');
    await selected.hover();
    await expect(selected).toHaveCSS('color', selectedInk);
    await page.mouse.down();
    await expect(selected).toHaveCSS('color', selectedInk);
    await page.mouse.up();
    await selected.click(); // Restore selection before the next theme.
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.office-button.office-field')).toHaveCount(0);
    await page.locator('#buttons').screenshot({ path: `${output}/buttons-${theme === '밝은 테마' ? 'light' : 'dark'}.png` });
  }
});

test('buttons align icons and run once by pointer or keyboard; disabled buttons stay inert', async ({ page }) => {
  const button = page.getByRole('button', { name: '기본 버튼 확인', exact: true });
  const feedback = page.locator('[data-button-feedback]');
  await button.click();
  await expect(feedback).toContainText('실행 횟수: 1');
  await button.press('Enter');
  await expect(feedback).toContainText('실행 횟수: 2');
  await button.press('Space');
  await expect(feedback).toContainText('실행 횟수: 3');
  await expect(button).toHaveCSS('outline-style', 'solid');
  const small = page.getByRole('button', { name: '작은 아이콘 버튼', exact: true });
  await expect(small).toHaveCSS('width', '24px');
  for (const control of [button, small]) {
    const geometry = await control.evaluate(el => {
      const b = el.getBoundingClientRect(), i = el.querySelector('svg')!.getBoundingClientRect();
      return { offset: Math.abs((b.top + b.height / 2) - (i.top + i.height / 2)), size: i.width };
    });
    expect(geometry.offset).toBeLessThanOrEqual(.5);
    expect(geometry.size).toBe(control === small ? 14 : 16);
  }
  const disabled = page.getByRole('button', { name: '비활성 강조 버튼', exact: true });
  const box = await disabled.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(feedback).toContainText('실행 횟수: 3');
  const mixed = page.getByRole('button', { name: '버튼 혼합 굵게', exact: true });
  await expect(mixed).toHaveAttribute('aria-pressed', 'mixed');
  await expect(mixed).not.toHaveCSS('background-image', 'none');
  await mixed.press('Enter');
  await expect(mixed).toHaveAttribute('aria-pressed', 'true');
  await mixed.press('Space');
  await expect(mixed).toHaveAttribute('aria-pressed', 'false');
});

test('dialog buttons preserve native form attributes and use the same accent paint', async ({ page }) => {
  await page.getByRole('button', { name: '다이얼로그 버튼 확인', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '버튼 동작 확인' });
  const apply = dialog.getByRole('button', { name: '적용', exact: true });
  await expect(apply).toHaveAttribute('type', 'submit');
  await expect(apply).toHaveAttribute('form', 'button-audit-form');
  await expect(apply).toHaveAttribute('name', 'action');
  await expect(apply).toHaveCSS('height', '32px');
  await expect(apply).toHaveCSS('color', await tokenColor(apply, '--ou-accent-ink'));
  await apply.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-button-feedback]')).toContainText('적용 완료');
});
