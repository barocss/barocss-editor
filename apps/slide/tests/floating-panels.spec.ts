import { expect, test } from '@playwright/test';
import { openDeck, visibleBoxes } from './helpers';

for (const width of [920, 979, 1440]) for (const theme of ['light', 'dark']) {
  test(`floating panels preserve the full editing area ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await openDeck(page);
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const geometry = () => page.evaluate(() => Object.fromEntries(['.sl-main', '.sl-stage', '.sl-overlay'].map(selector => {
      const node = document.querySelector(selector)!;
      return [selector, { rect: node.getBoundingClientRect().toJSON(), transform: getComputedStyle(node).transform }];
    })));
    const native = () => page.evaluate(() => { const e = (window as any).editor; return { document: e.exportDocument(), history: e.getHistoryStats(), selection: e.selection }; });
    const before = await geometry(), original = await native();
    const header = page.locator('.sl-topbar');
    await header.getByRole('button', { name: '레이어', exact: true }).click();
    await expect(page.locator('#slides-objects')).toBeVisible();
    await expect.poll(geometry).toEqual(before);
    await header.getByRole('button', { name: '속성', exact: true }).click();
    await expect(page.locator('#slides-details')).toBeVisible();
    await expect.poll(geometry).toEqual(before);
    await expect(page.locator('.office-workspace-panel-controls')).toHaveCount(0);
    expect(await native()).toEqual(original);
    await info.attach('full-editing-area.json', { body: JSON.stringify({ before, open: await geometry() }), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath(`${width}-${theme}-floating-panels.png`), animations: 'disabled' });
    await header.getByRole('button', { name: '레이어', exact: true }).click();
    await header.getByRole('button', { name: '속성', exact: true }).click();
    await expect.poll(geometry).toEqual(before);
    expect(await native()).toEqual(original);
    const zoom = page.getByRole('textbox', { name: '확대/축소', exact: true });
    await zoom.fill('125%'); await zoom.press('Enter');
    const zoomed = await geometry();
    await header.getByRole('button', { name: '레이어', exact: true }).click();
    await header.getByRole('button', { name: '속성', exact: true }).click();
    await expect.poll(geometry).toEqual(zoomed); await expect(zoom).toHaveValue('125%');
    expect(await native()).toEqual(original);
  });
}


test('inspector folding retains a numeric draft and Escape does not commit it', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await openDeck(page);
  const [title] = await visibleBoxes(page, '.sl-text-frame'); await page.mouse.click(title.x, title.y);
  const native = () => page.evaluate(() => { const e = (window as any).editor; return { document: e.exportDocument(), history: e.getHistoryStats(), selection: e.selection }; });
  const before = await native();
  await page.getByRole('button', { name: '선택 속성 열기', exact: true }).click();
  const panel = page.locator('#slides-details'), width = panel.getByRole('spinbutton', { name: '너비', exact: true });
  const original = await width.inputValue();
  await width.fill('99');
  const toggle = page.locator('.sl-topbar').getByRole('button', { name: '속성', exact: true });
  await toggle.click(); await expect(panel).toBeHidden(); expect(await native()).toEqual(before);
  await toggle.click(); await expect(width).toHaveValue('99');
  await width.press('Escape'); await expect(width).toHaveValue(original); await expect(panel).toBeVisible();
  expect(await native()).toEqual(before);
  const tab = panel.getByRole('tab', { name: '속성', exact: true });
  await tab.focus();
  const tooltip = page.getByRole('tooltip'), tooltipOwned = await tooltip.isVisible();
  await info.attach('panel-escape-owner.json', { body: JSON.stringify({ tooltipOwned, tooltip: tooltipOwned ? await tooltip.innerText() : null }), contentType: 'application/json' });
  await tab.press('Escape');
  if (tooltipOwned) { await expect(tooltip).toHaveCount(0); await expect(panel).toBeVisible(); await tab.press('Escape'); }
  await expect(panel).toBeHidden(); await expect(toggle).toBeFocused();
  await toggle.press('Enter'); await expect(panel).toBeVisible();
  await page.locator('.sl-topbar').getByRole('button', { name: '레이어', exact: true }).press('Enter');
  await expect(page.locator('#slides-objects')).toBeVisible();
  expect(await native()).toEqual(before);
});

test('insertion More is compact and keeps every secondary insertion discoverable', async ({ page }, info) => {
  await openDeck(page);
  await page.locator('.sl-topbar').getByRole('button', { name: '레이어', exact: true }).click();
  await page.getByRole('toolbar', { name: 'Slides 삽입 도구', exact: true }).getByRole('button', { name: '추가 Slides 도구', exact: true }).click();
  const more = page.getByRole('menu', { name: 'Slides 삽입 및 슬라이드 메뉴', exact: true }); await expect(more).toBeVisible();
  const bounds = (await more.boundingBox())!; expect(bounds.width).toBeLessThanOrEqual(320);
  expect(await more.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  for (const label of ['텍스트 상자', '사각형', '타원', '선', '그림 삽입']) await expect(more.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
  expect(await more.getByRole('menuitem', { name: '타원', exact: true }).evaluate(node => { const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  await page.screenshot({ path: info.outputPath('compact-insertion-more.png'), animations: 'disabled' });
  const tooltip = page.getByRole('tooltip');
  const tooltipOwned = await tooltip.isVisible();
  await info.attach('escape-owner.json', { body: JSON.stringify({ tooltipOwned, tooltip: tooltipOwned ? await tooltip.innerText() : null, focus: await page.evaluate(() => document.activeElement?.outerHTML) }), contentType: 'application/json' });
  await page.keyboard.press('Escape');
  if (tooltipOwned) { await expect(tooltip).toHaveCount(0); await expect(more).toBeVisible(); await page.keyboard.press('Escape'); }
  await expect(more).toBeHidden();
});

test('both floating sidebars and the thumbnail tray keep their controls reachable', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 800 }); await openDeck(page);
  const header = page.locator('.sl-topbar');
  await header.getByRole('button', { name: '레이어', exact: true }).click();
  await header.getByRole('button', { name: '속성', exact: true }).click();
  const before = await page.locator('.sl-stage').boundingBox();
  await page.getByRole('button', { name: '슬라이드 탐색 펼치기', exact: true }).click();
  const tray = page.locator('[data-filmstrip-panel]');
  const panels = page.locator('[data-floating-panel]');
  await expect.poll(async () => {
    const top = (await tray.boundingBox())!.y;
    return panels.evaluateAll((nodes, trayTop) => nodes.every(node => node.getBoundingClientRect().bottom <= trayTop - 8), top);
  }).toBe(true);
  expect(await page.locator('.sl-stage').boundingBox()).toEqual(before);
  await page.getByRole('button', { name: '슬라이드 탐색 접기', exact: true }).click();
  await expect(tray).toBeHidden();
  expect(await page.locator('.sl-stage').boundingBox()).toEqual(before);
  await page.getByRole('button', { name: '슬라이드 탐색 펼치기', exact: true }).click();
  await page.screenshot({ path: info.outputPath('combined-floating-ui.png'), animations: 'disabled' });
});
