import { test, expect } from '@playwright/test';

test('property command failure can retry its original value and clears when the target changes', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-admin-open]').first().click();
  const picture = page.locator('[data-frame="desktop"] img.st-picture[alt="문서와 덱과 페이지가 한 화면에 놓인 그림"]');
  await picture.click({ force: true, modifiers: ['Meta'], position: { x: 8, y: 8 } });
  const panel = page.locator('.office-properties');
  await panel.getByRole('tab', { name: '모양', exact: true }).click();
  const input = panel.getByRole('spinbutton', { name: '기울기', exact: true });
  const value = () => page.evaluate(() => {
    const editor = (window as any).editor;
    return editor.dataStore.getNode(editor.selection.nodeIds[0]).attributes.rotate;
  });
  const before = await value();
  await page.evaluate(() => {
    const editor = (window as any).editor, run = editor.executeCommand.bind(editor);
    (window as any).propertyAllowed = false;
    (window as any).propertyCalls = [];
    editor.executeCommand = async (name: string, payload: unknown) => {
      if (name === 'setBlockFormat') {
        (window as any).propertyCalls.push(payload);
        if (!(window as any).propertyAllowed) {
          await new Promise(resolve => setTimeout(resolve, 500));
          throw new Error('Test: apply failed');
        }
      }
      return run(name, payload);
    };
  });
  await input.fill('12'); await input.press('Enter');
  await expect(input).toBeDisabled();
  await expect(panel.getByRole('alert')).toContainText('속성을 적용하지 못했습니다');
  expect(await value()).toBe(before);
  await page.evaluate(() => { (window as any).propertyAllowed = true; });
  await panel.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(input).toHaveValue('12');
  expect(await value()).toBe(12);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  const calls = await page.evaluate(() => (window as any).propertyCalls);
  expect(calls).toHaveLength(2); expect(calls[1]).toEqual(calls[0]);
  await page.evaluate(() => { (window as any).propertyAllowed = false; });
  await input.fill('24'); await input.press('Enter');
  await expect(panel.getByRole('alert')).toBeVisible();
  await page.screenshot({ path: '../../.dev/artifacts/design-system/site-property-feedback.png', animations: 'disabled' });
  await page.evaluate(async () => { await (window as any).editor.executeCommand('setNode', { nodeIds: [] }); });
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '다시 시도', exact: true })).toHaveCount(0);
});

test('a late failure cannot disable or add retry to another selection', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-admin-open]').first().click();
  await page.locator('[data-frame="desktop"] img.st-picture[alt="문서와 덱과 페이지가 한 화면에 놓인 그림"]')
    .click({ force: true, modifiers: ['Meta'], position: { x: 8, y: 8 } });
  const panel = page.locator('.office-properties');
  await panel.getByRole('tab', { name: '모양', exact: true }).click();
  const input = panel.getByRole('spinbutton', { name: '기울기', exact: true });
  const parent = await page.evaluate(() => {
    const editor = (window as any).editor, original = editor.executeCommand.bind(editor);
    let first = true;
    editor.executeCommand = async (name: string, payload: any) => {
      if (name === 'setBlockFormat' && first) {
        first = false;
        await new Promise(resolve => { (window as any).releaseProperty = resolve; });
        return false;
      }
      return original(name, payload);
    };
    return editor.dataStore.getNode(editor.selection.nodeIds[0]).parentId;
  });
  await input.fill('12'); await input.press('Enter');
  await expect(input).toBeDisabled();
  await page.evaluate(async id => (window as any).editor.executeCommand('setNode', { nodeIds: [id] }), parent);
  await expect(input).toBeEnabled();
  await page.evaluate(() => (window as any).releaseProperty());
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await input.fill('24'); await input.press('Enter');
  await expect.poll(() => page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes.rotate, parent)).toBe(24);
  await expect(panel.getByRole('alert')).toHaveCount(0);
});
