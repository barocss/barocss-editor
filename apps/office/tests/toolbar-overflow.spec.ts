import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const output = `${process.cwd()}/../../.dev/artifacts/design-system`;

test('compact toolbar locates existing controls, keeps values and fits the viewport', async ({ page }) => {
  await page.goto('/design-system/index.html#overflow');
  const example = page.locator('#overflow');
  const more = example.getByRole('button', { name: '예시 편집 도구 도구 찾기' });
  await expect(more).toBeVisible();
  const input = example.getByRole('textbox', { name: '도구 예시 문서 이름' });
  await input.fill('내 분기 계획'); await input.press('Enter');
  await more.click();
  const menu = page.getByRole('menu', { name: '예시 편집 도구 도구 위치' });
  await expect(menu).toBeVisible();
  await mkdir(output, { recursive: true });
  await page.screenshot({ animations: 'disabled', path: `${output}/toolbar-overflow-light.png` });
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: '상세 설정', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  const action = example.getByRole('button', { name: '설정 적용', exact: true });
  await expect(action).toBeFocused(); await expect(action).toBeInViewport();
  const inside = await action.evaluate(el => {
    const bar = el.closest('[role="toolbar"]')!.getBoundingClientRect(), r = el.getBoundingClientRect();
    return r.left >= bar.left && r.right <= bar.right;
  });
  expect(inside).toBe(true);
  await action.press('Enter'); await expect(example.getByRole('status')).toContainText('실행: 1회');
  await expect(input).toHaveValue('내 분기 계획');
  await more.click(); await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0); await expect(more).toBeFocused();
  await page.getByRole('combobox', { name: '시스템 테마' }).click();
  await page.getByRole('option', { name: '어두운 테마', exact: true }).click();
  await more.click();
  await page.screenshot({ animations: 'disabled', path: `${output}/toolbar-overflow-dark.png` });
  await page.keyboard.press('Escape');
  await example.getByRole('combobox', { name: '예시 도구 모음 너비' }).click();
  await page.getByRole('option', { name: '960px', exact: true }).click();
  await expect(more).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(more).toBeVisible(); await more.scrollIntoViewIfNeeded(); await expect(more).toBeInViewport();
  await more.click();
  expect(await menu.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 8 && r.right <= innerWidth - 8; })).toBe(true);
});

test('Word, Slides and Site expose overflow navigation at narrow desktop width', async ({ page }) => {
  test.setTimeout(90000);
  for (const product of ['Word', 'Slides', 'Site']) {
    await page.goto('/');
    await page.getByRole('button', { name: `${product[0]} ${product} 새 자료 만들기`, exact: true }).click();
    await page.getByRole('textbox', { name: '새 자료 이름' }).fill('좁은 도구 검증');
    await page.getByRole('button', { name: '만들기', exact: true }).click();
    if (product === 'Site') {
      await expect(page.locator('[data-admin-open]')).toHaveCount(1);
      await page.locator('[data-admin-open=home]').click();
      await expect(page.locator('.st-ribbon')).toBeVisible();
    }
    if (product === 'Word') {
      await page.locator('.w-paragraph').last().click();
      await page.keyboard.type('Toolbar selection check');
      await page.keyboard.press('Shift+Home');
    }
    if (product === 'Slides') {
      const frame = await page.locator('.sl-stage .sl-text-frame:visible').first().boundingBox();
      await page.mouse.click(frame!.x + frame!.width / 2, frame!.y + frame!.height / 2);
    }
    await page.setViewportSize({ width: product === 'Site' ? 560 : 740, height: 800 });
    const more = page.locator('.office-toolbar-overflow');
    await expect(more).toBeVisible(); await more.scrollIntoViewIfNeeded(); await expect(more).toBeInViewport();
    await more.click();
    const menu = page.locator('.office-toolbar-jump-menu');
    await expect(menu).toBeVisible();
    await mkdir(output, { recursive: true });
    await page.screenshot({ animations: 'disabled', path: `${output}/toolbar-overflow-${product.toLowerCase()}.png` });
    const last = menu.getByRole('menuitem').last();
    await last.click();
    await expect(menu).toHaveCount(0);
    expect(await page.locator('.office-compact-toolbar').evaluate(el => el.contains(document.activeElement))).toBe(true);
    expect(await page.locator('.office-compact-toolbar').evaluate(el => {
      const r = document.activeElement!.getBoundingClientRect(), b = el.getBoundingClientRect();
      return r.left >= b.left - 1 && r.right <= b.right + 1;
    })).toBe(true);
    if (product === 'Word') {
      await more.click(); await menu.getByRole('menuitem', { name: '글자', exact: true }).click();
      await page.keyboard.press('Space');
      await expect.poll(() => page.locator('.w-paragraph').last().evaluate(el => {
        const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
        return node ? Number(getComputedStyle(node.parentElement!).fontWeight) : 0;
      })).toBeGreaterThanOrEqual(600);
    }
    await page.setViewportSize({ width: 1440, height: 960 });
  }
});
