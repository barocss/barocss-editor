import { expect, test } from '@playwright/test';
import { openDeck, pickMenu } from './helpers';

const mode = (page: import('@playwright/test').Page, multi: boolean) => page.getByRole('button', { name: multi ? '멀티 슬라이드 보기' : '슬라이드 보기', exact: true });
const width = (page: import('@playwright/test').Page) => page.locator('.sl-stage .sl-slide').first().evaluate(element => element.getBoundingClientRect().width);

test('Canvas wheel zoom responds faster without rebuilding native slide DOM', async ({ page }, info) => {
  await openDeck(page); await mode(page, true).click();
  const before = await width(page), bounds = (await page.locator('.sl-stage').boundingBox())!;
  const titleStyle = await page.locator('[data-board-label]').first().evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderWidth, shadow: style.boxShadow };
  });
  expect(titleStyle).toEqual({ background: 'rgba(0, 0, 0, 0)', border: '0px', shadow: 'none' });
  await page.evaluate(() => {
    const host = document.querySelector('.sl-host')!;
    const probe = { nodes: [...host.querySelectorAll('*')], mutations: 0, native: (window as any).editor.exportDocument(), history: (window as any).editor.getHistoryStats(), observer: null as MutationObserver | null };
    probe.observer = new MutationObserver(records => { probe.mutations += records.length; });
    probe.observer.observe(host, { childList: true, subtree: true, characterData: true });
    (window as any).__zoomProbe = probe;
  });
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -100); await page.keyboard.up('Control');
  await expect.poll(() => width(page)).toBeGreaterThan(before * 1.45);
  expect(await width(page)).toBeLessThan(before * 1.55);
  const proof = await page.evaluate(() => {
    const probe = (window as any).__zoomProbe, nodes = [...document.querySelector('.sl-host')!.querySelectorAll('*')];
    probe.observer.disconnect();
    return { mutations: probe.mutations, sameNodes: nodes.length === probe.nodes.length && nodes.every((node, index) => node === probe.nodes[index]), unchanged: JSON.stringify((window as any).editor.exportDocument()) === JSON.stringify(probe.native), history: (window as any).editor.getHistoryStats(), originalHistory: probe.history };
  });
  expect(proof.mutations).toBe(0); expect(proof.sameNodes).toBe(true); expect(proof.unchanged).toBe(true); expect(proof.history).toEqual(proof.originalHistory);
  await page.screenshot({ path: info.outputPath('canvas-text-titles.png') });
});

test('returning from Canvas fits the active slide, while reselecting single view preserves its zoom', async ({ page }) => {
  await openDeck(page);
  const fitted = await width(page);
  await mode(page, true).click();
  const canvasFitted = await width(page);
  const zoom = page.getByRole('textbox', { name: '확대/축소', exact: true });
  await zoom.fill('80%'); await zoom.press('Enter');
  await expect.poll(() => width(page)).toBeGreaterThan(fitted);
  await mode(page, false).click();
  await expect.poll(() => width(page)).toBeCloseTo(fitted, 0);
  await zoom.fill('90%'); await zoom.press('Enter');
  const explicit = await width(page);
  await mode(page, false).click();
  expect(await width(page)).toBeCloseTo(explicit, 0);
  await mode(page, true).click();
  await expect.poll(() => width(page)).toBeCloseTo(canvasFitted, 0);
  await mode(page, false).click();
  await pickMenu(page, 'view.panes.2');
  await expect(page.locator('.sl-stage')).toHaveAttribute('data-freeboard', 'true');
  await zoom.fill('80%'); await zoom.press('Enter');
  await pickMenu(page, 'view.panes.2');
  await expect.poll(() => width(page)).toBeCloseTo(fitted, 0);
});
