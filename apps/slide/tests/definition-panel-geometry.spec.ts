import { expect, test } from '@playwright/test';
import { openDeck, setPanel } from './helpers';

for (const width of [1170, 1440]) test(`definition controls remain reachable without resizing the stage at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await openDeck(page);
  // A complete sample native file with a long user-authored component name.
  await page.evaluate(() => {
    const editor = (window as any).editor;
    const document = editor.exportDocument();
    const visit = (node: any): any => node.stype === 'component' ? node : (node.content ?? []).map(visit).find(Boolean);
    const component = visit(document);
    if (!component) throw new Error('sample_component_required');
    component.attributes.name = 'Quarterly product launch and customer onboarding presentation component with a detailed author supplied title';
    editor.loadDocument(document, 'definition-panel-geometry');
  });
  await setPanel(page, 'layers', true);
  await page.getByRole('tab', { name: '컴포넌트', exact: true }).click();
  await page.locator('.sl-components [data-component-open]').first().click();
  await expect(page.locator('[data-editing-close]')).toBeVisible();
  const stage = page.locator('.sl-stage-viewport');
  const before = await stage.boundingBox();
  const native = await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
  await setPanel(page, 'properties', true);
  await expect.poll(async () => (await stage.boundingBox())?.height).toBe(before!.height);
  expect(await stage.boundingBox()).toEqual(before);
  const back = page.locator('[data-editing-close]');
  await expect(back).toBeInViewport();
  expect(await back.evaluate(element => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
  expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(native);
  await back.click();
  await expect(page.locator('[data-editing-close]')).toHaveCount(0);
});
