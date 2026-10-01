import { writeFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { openDeck, currentSlide } from './helpers';

const navigation = (page: Page) => page.getByRole('complementary', { name: '슬라이드 탐색', exact: true });
const inspector = (page: Page) => page.getByRole('complementary', { name: '속성', exact: true });
const snapshot = (page: Page) => page.evaluate(() => {
  const editor = (window as any).editor;
  return { document: JSON.stringify(editor.exportDocument()), selection: JSON.stringify(editor.selection), history: editor.getHistoryStats() };
});
async function selectShape(page: Page) {
  await page.locator('.sl-filmstrip button[data-slide]').nth(1).click();
  await page.getByRole('button', { name: '사각형', exact: true }).click();
  return page.evaluate(() => {
    const editor = (window as any).editor, sid = editor.selection.nodeIds[0];
    return { sid, width: editor.dataStore.getNode(sid).attributes.width };
  });
}
const shapeWidth = (page: Page, sid: string) => page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes.width, sid);

for (const width of [1440, 1280]) test(`desktop ${width}px starts with navigation and inspector controls without duplicate titles or clipping`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await openDeck(page);
  await page.getByRole('button', { name: '사각형', exact: true }).click();
  const left = navigation(page), right = inspector(page);
  await expect(left).toBeVisible(); await expect(right).toBeVisible();
  // Headings and tabs have different purposes; retain the tab named Properties.
  await expect(left.getByRole('heading', { name: '탐색', exact: true })).toHaveCount(0);
  await expect(right.getByRole('heading', { name: '속성', exact: true })).toHaveCount(0);
  const leftTabs = left.getByRole('tablist', { name: '탐색 방식' });
  const rightTabs = right.getByRole('tablist', { name: '속성 탭' });
  const unit = right.getByLabel('단위', { exact: true });
  await expect(leftTabs).toBeVisible(); await expect(rightTabs).toBeVisible(); await expect(unit).toBeVisible();
  const measure = await page.evaluate(() => {
    const rect = (selector: string) => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return { viewport: { width: innerWidth, height: innerHeight }, theme: document.documentElement.dataset.theme ?? null,
      navigation: rect('.sl-sidebar'), navigationTabs: rect('.sl-sidebar [role=tablist]'), navigationContent: rect('.sl-sidebar-content'),
      inspector: rect('.sl-properties'), inspectorHeader: rect('.sl-properties-header'), inspectorContent: rect('.sl-properties [role=tabpanel]'), inspectorTabs: rect('.sl-properties [role=tablist]'), units: rect('.sl-properties select[aria-label="단위"]'),
      overflow: [...document.querySelectorAll('.sl-sidebar [role=tablist], .sl-properties-header')]
        .map(node => ({ client: node.clientWidth, scroll: node.scrollWidth })) };
  });
  expect(measure.navigationTabs.y - measure.navigation.y).toBeLessThanOrEqual(1);
  const tabs = measure.inspectorTabs, units = measure.units, panel = measure.inspector;
  expect(Math.max(tabs.y, units.y)).toBeLessThan(Math.min(tabs.y + tabs.height, units.y + units.height));
  expect(tabs.x + tabs.width).toBeLessThanOrEqual(units.x + 1);
  expect(units.x + units.width).toBeLessThanOrEqual(panel.x + panel.width);
  expect(measure.overflow.every(row => row.scroll <= row.client + 1)).toBe(true);
  expect(units.height).toBeGreaterThanOrEqual(28);
  for (const button of [...await leftTabs.getByRole('tab').all(), ...await rightTabs.getByRole('tab').all()]) {
    const bounds = await button.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(28);
    const owningPanel = bounds!.x < measure.navigation.x + measure.navigation.width ? measure.navigation : panel;
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(owningPanel.x + owningPanel.width);
  }
  writeFileSync(testInfo.outputPath(`after-${width}-geometry.json`), JSON.stringify(measure, null, 2));
  await page.screenshot({ path: testInfo.outputPath(`after-${width}x900-light.png`), animations: 'disabled' });
});

test('sidebar keyboard navigation keeps active slide, selection and full native content; units edit and undo retain meaning', async ({ page }) => {
  await openDeck(page);
  const shape = await selectShape(page), active = await currentSlide(page), before = await snapshot(page);
  const leftTabs = navigation(page).getByRole('tablist', { name: '탐색 방식' });
  const slides = leftTabs.getByRole('tab', { name: '슬라이드', exact: true });
  const layers = leftTabs.getByRole('tab', { name: '레이어', exact: true });
  const components = leftTabs.getByRole('tab', { name: '컴포넌트', exact: true });
  await slides.focus(); await slides.press('ArrowRight');
  await expect(layers).toBeFocused(); await expect(layers).toHaveAttribute('aria-selected', 'true');
  await layers.press('ArrowRight');
  await expect(components).toBeFocused(); await expect(components).toHaveAttribute('aria-selected', 'true');
  await expect(navigation(page).locator('.sl-components')).toBeVisible();
  await components.press('Home');
  await expect(slides).toBeFocused(); await expect(slides).toHaveAttribute('aria-selected', 'true');
  const right = inspector(page), tabs = right.getByRole('tablist', { name: '속성 탭' });
  const style = tabs.getByRole('tab', { name: '속성', exact: true }), motion = tabs.getByRole('tab', { name: '모션', exact: true });
  await style.focus(); await style.press('ArrowRight');
  await expect(motion).toBeFocused(); await expect(motion).toHaveAttribute('aria-selected', 'true');
  await expect(right.getByLabel('모션 추가')).toBeVisible();
  await motion.press('ArrowLeft');
  await expect(style).toBeFocused(); await expect(style).toHaveAttribute('aria-selected', 'true');
  const unit = right.getByLabel('단위', { exact: true }), field = right.getByRole('spinbutton', { name: '너비', exact: true });
  await unit.selectOption('cm');
  expect(Number(await field.inputValue())).toBeCloseTo(shape.width / (1440 / 2.54), 1);
  await unit.selectOption('in');
  expect(Number(await field.inputValue())).toBeCloseTo(shape.width / 1440, 1);
  expect(await snapshot(page)).toEqual(before); expect(await currentSlide(page)).toBe(active);
  await field.fill('4'); await field.press('Enter');
  await expect.poll(() => shapeWidth(page, shape.sid)).toBe(5760);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect.poll(() => shapeWidth(page, shape.sid)).toBe(shape.width);
  await expect(unit).toHaveValue('in');
  expect(await currentSlide(page)).toBe(active);
});

test('read-only sidebar navigation and unit preference cannot mutate the native document', async ({ page }) => {
  await openDeck(page);
  const shape = await selectShape(page), active = await currentSlide(page);
  await page.evaluate(() => (window as any).editor.setEditable(false));
  const before = await snapshot(page), right = inspector(page);
  await navigation(page).getByRole('tab', { name: '컴포넌트', exact: true }).click();
  await expect(navigation(page).locator('.sl-components')).toBeVisible();
  await navigation(page).getByRole('tab', { name: '레이어', exact: true }).click();
  await right.getByRole('tab', { name: '모션', exact: true }).click();
  await right.getByRole('tab', { name: '속성', exact: true }).click();
  await right.getByLabel('단위', { exact: true }).selectOption('in');
  expect(await snapshot(page)).toEqual(before); expect(await currentSlide(page)).toBe(active);
  const field = right.getByRole('spinbutton', { name: '너비', exact: true });
  if (await field.isEnabled()) {
    await field.fill('7'); await field.press('Enter');
    await expect(right.getByRole('alert')).toContainText('속성을 적용하지 못했습니다');
  } else await expect(field).toBeDisabled();
  expect(await shapeWidth(page, shape.sid)).toBe(shape.width);
  expect(await snapshot(page)).toEqual(before);
});
