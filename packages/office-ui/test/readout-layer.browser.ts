import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = `/@fs/${fileURLToPath(new URL('./readout-layer-fixture.tsx', import.meta.url))}`;

for (const colorScheme of ['light', 'dark'] as const) test(`passive selection readout stays below the opaque menu in ${colorScheme}`, async ({ page }, info) => {
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(async url => {
    const module = await import(/* @vite-ignore */ url);
    module.mountReadoutLayerFixture();
  }, fixture);
  const input = page.getByLabel('Native input', { exact: true });
  await input.click();
  const originalText = await input.textContent();
  await page.getByRole('button', { name: 'Open selection menu', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Selection commands', exact: true });
  const readout = page.getByLabel('Selection size', { exact: true });
  await expect(menu).toBeVisible();
  await expect(readout).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Align left', exact: true })).toBeFocused();
  const menuBox = (await menu.boundingBox())!;
  const badgeBox = (await readout.boundingBox())!;
  const clip = {
    x: Math.max(menuBox.x, badgeBox.x), y: Math.max(menuBox.y, badgeBox.y),
    width: Math.min(menuBox.x + menuBox.width, badgeBox.x + badgeBox.width) - Math.max(menuBox.x, badgeBox.x),
    height: Math.min(menuBox.y + menuBox.height, badgeBox.y + badgeBox.height) - Math.max(menuBox.y, badgeBox.y)
  };
  expect(clip.width).toBeGreaterThan(40);
  expect(clip.height).toBeGreaterThan(8);
  expect(await readout.evaluate(node => getComputedStyle(node).pointerEvents)).toBe('none');
  const visibleBadge = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
  await info.attach('menu-intersection-with-passive-badge', { body: visibleBadge, contentType: 'image/png' });
  let hiddenBadge: Buffer;
  await readout.evaluate(node => { node.style.visibility = 'hidden'; });
  try {
    hiddenBadge = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
    await info.attach('same-menu-intersection-with-badge-hidden', { body: hiddenBadge, contentType: 'image/png' });
  } finally {
    await readout.evaluate(node => { node.style.removeProperty('visibility'); });
  }
  await expect(readout).toBeVisible();
  // An opaque menu must completely hide passive feedback; no golden or pixel tolerance.
  expect(visibleBadge.equals(hiddenBadge), 'Passive badge must not paint over the menu intersection').toBe(true);
  await menu.getByRole('menuitem', { name: 'Align center', exact: true }).click();
  await expect(page.getByLabel('Picked command', { exact: true })).toHaveText('center');
  await expect(menu).toHaveCount(0);
  await expect(readout).toBeVisible();
  await expect(input).toHaveText(originalText!);
  await input.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('!');
  await expect(input).toContainText('!');
});
