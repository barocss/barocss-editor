import { expect, test } from '@playwright/test';
import { openDeck } from './helpers';

test('colour notation switches without editing, channels preserve alpha and undo, including neutral hue', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: '사각형', exact: true }).click();
  const id = await page.evaluate(async () => {
    const editor = (window as any).editor, id = editor.selection.nodeIds[0];
    await editor.executeCommand('setBoxStyle', { nodeIds: [id], fills: [{ kind: 'solid', color: 'rgba(255, 0, 0, 0.4)' }] });
    return id;
  });
  const colour = () => page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes.fills[0].color, id);
  const open = async () => page.getByRole('button', { name: '1번 채우기', exact: true }).press('Enter');
  await open();
  const popup = page.locator('[data-paint="0"] [data-stack-editor]');
  const format = popup.getByRole('combobox', { name: '색상 형식' });
  for (const mode of ['rgb', 'hsl', 'hsb', 'okhsl', 'hex']) {
    await format.selectOption(mode);
    expect(await colour()).toBe('rgba(255, 0, 0, 0.4)');
    await expect(popup.getByRole('spinbutton', { name: '불투명도', exact: true })).toHaveValue('40');
  }
  await format.selectOption('hsl');
  const hue = popup.getByRole('spinbutton', { name: 'HSL H', exact: true });
  await hue.fill('120'); await hue.press('Enter');
  await expect.poll(colour).toBe('rgba(0, 255, 0, 0.4)');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect.poll(colour).toBe('rgba(255, 0, 0, 0.4)');
  await open();
  await format.selectOption('rgb');
  const green = popup.getByRole('spinbutton', { name: 'RGB G', exact: true });
  await green.fill('255'); await green.press('Enter');
  await expect.poll(colour).toBe('rgba(255, 255, 0, 0.4)');
  await format.selectOption('okhsl');
  const light = popup.getByRole('spinbutton', { name: 'OKHSL L', exact: true });
  await light.fill('0'); await light.press('Enter');
  await expect.poll(colour).toBe('rgba(0, 0, 0, 0.4)');
  await format.selectOption('hsb');
  const input = (name: string) => popup.getByRole('spinbutton', { name, exact: true });
  await input('HSB H').fill('240'); await input('HSB H').press('Enter');
  await input('불투명도').fill('25'); await input('불투명도').press('Enter');
  await input('HSB S').fill('100'); await input('HSB S').press('Enter');
  await input('HSB B').fill('100'); await input('HSB B').press('Enter');
  await expect.poll(colour).toBe('rgba(0, 0, 255, 0.25)');
  await format.selectOption('okhsl');
  await expect(popup.locator('.office-color-channels')).toBeVisible();
  const boxes = await popup.locator('.office-color-channels input').evaluateAll(inputs => inputs.map(el => el.getBoundingClientRect().toJSON()));
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].x - boxes[i - 1].right).toBeGreaterThanOrEqual(5);
  await page.screenshot({ path: '../../.dev/artifacts/design-system/color-formats.png' });
});
