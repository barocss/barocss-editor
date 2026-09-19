import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const fixture = `/@fs/${fileURLToPath(new URL('./motion-fixture.tsx', import.meta.url))}`;
for (const reducedMotion of ['no-preference', 'reduce'] as const) test(`shared surfaces respect ${reducedMotion} without changing focus or placement`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion }); await page.goto('/');
  await page.evaluate(() => { (window as any).__officeMotion = []; document.addEventListener('animationstart', event => { if (event.animationName.startsWith('ou-')) (window as any).__officeMotion.push(event.animationName); }); });
  await page.evaluate(async url => { const fixture = await import(/* @vite-ignore */ url); fixture.mountMotionFixture(); }, fixture);
  const animation = (selector: string) => page.locator(selector).evaluate(element => getComputedStyle(element).animationName);
  await page.getByRole('button', { name: 'Motion menu', exact: true }).click();
  const menu = page.getByRole('menu'); await expect(menu).toBeVisible();
  expect(await animation('[data-floating-surface]')).toBe(reducedMotion === 'reduce' ? 'none' : 'ou-surface-enter');
  await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0);
  await page.getByRole('button', { name: 'Motion dialog', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Motion dialog title' });
  await expect(dialog).toBeVisible();
  expect(await animation('[data-office-dialog]')).toBe(reducedMotion === 'reduce' ? 'none' : 'ou-fade-enter');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  const box = await dialog.boundingBox(); expect(Math.abs(box!.x + box!.width / 2 - 640)).toBeLessThan(2);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Motion peek', exact: true }).click();
  const peek = page.getByRole('dialog', { name: 'Motion peek title' }); await expect(peek).toBeVisible();
  expect(await animation('.ou-side-peek')).toBe(reducedMotion === 'reduce' ? 'none' : 'ou-surface-enter');
  await page.keyboard.press('Escape'); await expect(peek).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Motion peek', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Motion hint', exact: true }).hover();
  await expect(page.locator('[data-office-tooltip]')).toBeVisible();
  expect(await animation('[data-office-tooltip]')).toBe(reducedMotion === 'reduce' ? 'none' : 'ou-surface-enter');
  const events = await page.evaluate(() => (window as any).__officeMotion as string[]);
  if (reducedMotion === 'reduce') {
    expect(events).toEqual([]);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ou-quick').trim())).toBe('0ms');
  } else expect(events).toContain('ou-fade-exit');
});

test('Drawer scrim keeps its authored half opacity at both animation boundaries', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async url => {
    const fixture = await import(/* @vite-ignore */ url); fixture.mountMotionFixture();
    // Keep animations inspectable, then finish them explicitly; no timer-based assertion.
    document.documentElement.style.setProperty('--ou-motion-enter', '2s');
    document.documentElement.style.setProperty('--ou-motion-exit', '2s');
  }, fixture);
  await page.getByRole('button', { name: 'Motion drawer', exact: true }).click();
  const overlay = page.locator('[data-office-dialog-overlay="drawer"]');
  const opacity = await overlay.evaluate(element => {
    const animation = element.getAnimations()[0];
    const frames = (animation.effect as KeyframeEffect).getKeyframes();
    animation.finish();
    return { end: frames.at(-1)?.opacity, settled: getComputedStyle(element).opacity };
  });
  expect(Number(opacity.end)).toBe(0.5); expect(Number(opacity.settled)).toBe(0.5);
  const drawer = page.getByRole('dialog', { name: 'Motion drawer title' });
  await drawer.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(overlay).toHaveAttribute('data-state', 'closed');
  const exitOpacity = await overlay.evaluate(element => {
    const animation = element.getAnimations()[0];
    const first = (animation.effect as KeyframeEffect).getKeyframes()[0].opacity;
    for (const node of document.querySelectorAll('[data-office-dialog], [data-office-dialog-overlay]')) node.getAnimations().forEach(animation => animation.finish());
    return first;
  });
  expect(Number(exitOpacity)).toBe(0.5);
  await expect(drawer).toHaveCount(0);
});
