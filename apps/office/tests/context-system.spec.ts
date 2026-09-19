import { test, expect, type Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const output = `${process.cwd()}/../../.dev/artifacts/design-system`;
async function insideViewport(locator: Locator) {
  await expect.poll(() => locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.left >= 7 && r.top >= 7 && r.right <= innerWidth - 7 && r.bottom <= innerHeight - 7;
  })).toBe(true);
}

test('long tooltips wrap outside clipped panels and fit narrow viewport edges', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/design-system/index.html#context');
  const trigger = page.getByRole('button', { name: '긴 설명 확인', exact: true });
  // Let the scroll event finish before opening the keyboard tooltip.
  await trigger.evaluate(async el => {
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await trigger.focus();
  const tip = page.locator('[data-office-tooltip]');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('다른 객체의 선택은 유지합니다');
  await expect(tip.locator('[data-shortcut]')).toHaveText('⇧⌘H');
  await insideViewport(tip);
  expect(await tip.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(page.locator('.ds-context-clip [data-office-tooltip]')).toHaveCount(0);
  await mkdir(output, { recursive: true });
  await tip.evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))); });
  await page.screenshot({ path: `${output}/tooltip-light.png` });
  await page.keyboard.press('Escape'); await expect(tip).toHaveCount(0);
  await page.getByRole('combobox', { name: '시스템 테마' }).click();
  await page.getByRole('option', { name: '어두운 테마', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '시스템 테마' })).toBeFocused();
  // Let the scroll event finish before opening the keyboard tooltip.
  await trigger.evaluate(async el => {
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await trigger.focus(); await expect(tip).toBeVisible();
  await insideViewport(tip);
  await tip.evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))); });
  await page.screenshot({ path: `${output}/tooltip-dark.png` });
});

test('Escape closes a tooltip before its contextual toolbar and tools keep working', async ({ page }) => {
  await page.goto('/design-system/index.html#context');
  await page.locator('[data-context-anchor]').click();
  const toolbar = page.getByRole('toolbar', { name: '문맥 도구 예시' });
  await expect(toolbar).toBeVisible();
  const bold = toolbar.getByRole('button', { name: '예시 굵게', exact: true });
  await bold.focus();
  await expect(page.locator('[data-office-tooltip]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-office-tooltip]')).toHaveCount(0);
  await expect(toolbar).toBeVisible();
  await bold.press('Space');
  await expect(page.locator('#context [role="status"]')).toHaveText('굵게: 켜짐');
  await page.keyboard.press('Escape'); await expect(toolbar).toHaveCount(0);
});

test('Note waits for a completed drag, preserves dismissed selection through resize, and applies formatting', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'N Note 새 자료 만들기', exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름' }).fill('문맥 도구 검증');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  const paragraph = page.locator('.on-doc > p').first();
  await paragraph.click(); await page.keyboard.type('Shared context toolbar check');
  const box = await paragraph.boundingBox();
  await page.mouse.move(box!.x + 2, box!.y + box!.height / 2); await page.mouse.down();
  await page.mouse.move(box!.x + 195, box!.y + box!.height / 2, { steps: 10 });
  const toolbar = page.locator('[data-note-formatting]');
  await expect(toolbar).toHaveCount(0);
  await page.mouse.up(); await expect(toolbar).toBeVisible();
  await page.keyboard.press('Escape'); await expect(toolbar).toHaveCount(0);
  await page.setViewportSize({ width: 1100, height: 740 });
  await page.mouse.wheel(0, 120);
  await expect(toolbar).toHaveCount(0);
  await paragraph.click(); await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await expect(toolbar).toBeVisible();
  await insideViewport(toolbar);
  await toolbar.locator('[data-note-control="toggleBold"]').click();
  await expect.poll(() => paragraph.evaluate(el => {
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    return node ? Number(getComputedStyle(node.parentElement!).fontWeight) : 0;
  })).toBeGreaterThanOrEqual(600);
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}/context-note.png` });
});
