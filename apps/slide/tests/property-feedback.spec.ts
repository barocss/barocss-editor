import { test, expect } from '@playwright/test';
import { openDeck } from './helpers';

test('multi-selection size retries the original converted value and preserves lock rules', async ({ page }) => {
  await openDeck(page);
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '사각형', exact: true }).click();
    ids.push(await page.evaluate(() => (window as any).editor.selection.nodeIds[0]));
  }
  await page.evaluate(async ids => { await (window as any).editor.executeCommand('setNode', { nodeIds: ids }); }, ids);
  const panel = page.locator('.sl-properties');
  await panel.getByLabel('단위', { exact: true }).selectOption('cm');
  const width = panel.getByRole('spinbutton', { name: '너비', exact: true });
  const sizes = () => page.evaluate(ids => ids.map(id => (window as any).editor.dataStore.getNode(id).attributes.width), ids);
  const before = await sizes();
  await page.evaluate(() => {
    const editor = (window as any).editor, original = editor.executeCommand.bind(editor);
    (window as any).allowProperties = false;
    (window as any).propertyRequests = [];
    editor.executeCommand = async (name: string, payload: any) => {
      if (name === 'setBoxGeometry' && 'width' in payload) {
        (window as any).propertyRequests.push(payload);
        if (!(window as any).allowProperties) {
          await new Promise(resolve => setTimeout(resolve, 500));
          return false;
        }
      }
      return original(name, payload);
    };
  });
  await width.fill('10'); await width.press('Enter');
  await expect(width).toBeDisabled();
  await expect(panel.getByLabel('단위', { exact: true })).toBeDisabled();
  await expect(panel.getByRole('alert')).toContainText('속성을 적용하지 못했습니다');
  expect(await sizes()).toEqual(before);
  await page.screenshot({ path: '../../.dev/artifacts/design-system/slides-property-failure.png', animations: 'disabled' });
  await page.evaluate(() => { (window as any).allowProperties = true; });
  await panel.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect.poll(sizes).toEqual([5669, 5669]);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  const requests = await page.evaluate(() => (window as any).propertyRequests);
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  await panel.getByRole('checkbox', { name: '잠금', exact: true }).click();
  await expect(width).toBeDisabled();
  await expect(panel.getByRole('checkbox', { name: '잠금', exact: true })).toBeEnabled();
  await panel.getByRole('checkbox', { name: '잠금', exact: true }).click();
  await expect(width).toBeEnabled();
  await page.evaluate(() => { (window as any).allowProperties = false; });
  await width.fill('11'); await width.press('Enter');
  await expect(panel.getByRole('alert')).toBeVisible();
  await page.evaluate(async id => { await (window as any).editor.executeCommand('setNode', { nodeIds: [id] }); }, ids[0]);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '다시 시도', exact: true })).toHaveCount(0);
});

test('changing selection during a pending property edit isolates feedback and the next write', async ({ page }) => {
  await openDeck(page);
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '사각형', exact: true }).click();
    ids.push(await page.evaluate(() => (window as any).editor.selection.nodeIds[0]));
  }
  await page.evaluate(async id => (window as any).editor.executeCommand('setNode', { nodeIds: [id] }), ids[0]);
  const panel = page.locator('.sl-properties'), width = panel.getByRole('spinbutton', { name: '너비', exact: true });
  const sizes = () => page.evaluate(ids => ids.map(id => (window as any).editor.dataStore.getNode(id).attributes.width), ids);
  const before = await sizes();
  await page.evaluate(() => {
    const editor = (window as any).editor, original = editor.executeCommand.bind(editor);
    let first = true;
    editor.executeCommand = async (name: string, payload: any) => {
      if (name === 'setBoxGeometry' && first) {
        first = false;
        await new Promise(resolve => { (window as any).releaseProperty = resolve; });
        throw new Error('Old target failed');
      }
      return original(name, payload);
    };
  });
  await width.fill('10'); await width.press('Enter');
  await expect(width).toBeDisabled();
  await page.evaluate(async id => (window as any).editor.executeCommand('setNode', { nodeIds: [id] }), ids[1]);
  await expect(width).toBeEnabled();
  await width.fill('12'); await width.press('Enter');
  await expect(width).toBeDisabled();
  await page.evaluate(() => (window as any).releaseProperty());
  await expect(width).toBeEnabled();
  await expect(width).toHaveValue('12');
  expect((await sizes())[0]).toBe(before[0]);
  expect((await sizes())[1]).not.toBe(before[1]);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect.poll(sizes).toEqual(before);
});
