import { expect, test } from '@playwright/test';
import { openDeck } from './helpers';

test('fill order actions commit once and effects show names and point units', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: '사각형', exact: true }).click();
  const id = await page.evaluate(async () => {
    const editor = (window as any).editor, id = editor.selection.nodeIds[0];
    await editor.executeCommand('setBoxStyle', { nodeIds: [id], fills: [
      { kind: 'solid', color: '#ff0000' }, { kind: 'solid', color: '#0000ff' }
    ] });
    return id;
  });
  const colours = () => page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes.fills.map((f: any) => f.color), id);
  await page.getByRole('button', { name: '1번 채우기', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: '1번 채우기 위로', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '1번 채우기 아래로', exact: true }).click();
  await expect.poll(colours).toEqual(['#0000ff', '#ff0000']);
  await expect(page.locator('[data-stack-editor]')).toHaveCount(0);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect.poll(colours).toEqual(['#ff0000', '#0000ff']);
  await page.getByRole('button', { name: '2번 채우기', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: '2번 채우기 아래로', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '2번 채우기 편집 닫기' }).click();

  await page.getByRole('button', { name: '효과 추가', exact: true }).click();
  const effect = page.locator('[data-effect="0"]');
  for (const label of ['가로', '세로', '흐림', '확산']) {
    const field = effect.getByRole('spinbutton', { name: `1번 ${label}`, exact: true });
    const wrapper = field.locator('xpath=ancestor::label');
    await expect(wrapper.getByText(label, { exact: true })).toBeVisible();
    await expect(wrapper.getByText('pt', { exact: true })).toBeVisible();
  }
  const blur = effect.getByRole('spinbutton', { name: '1번 흐림', exact: true });
  await blur.fill('12'); await blur.press('Enter');
  await expect.poll(() => page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes.effects[0].blur, id)).toBe(240);
  await effect.getByLabel('1번 효과 종류').selectOption('blur');
  await expect(effect.getByRole('spinbutton')).toHaveCount(1);
  await expect(blur).toHaveValue('12');
});

test('effect drag follows actual row bounds when row heights differ and undo restores order', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: '사각형', exact: true }).click();
  const id = await page.evaluate(async () => {
    const editor = (window as any).editor, id = editor.selection.nodeIds[0];
    await editor.executeCommand('setBoxStyle', { nodeIds: [id], effects: [
      { kind: 'blur', blur: 20 },
      { kind: 'drop', blur: 40, x: 0, y: 60, color: '#000000' },
      { kind: 'inner', blur: 80, x: 0, y: 60, color: '#0000ff' }
    ] });
    return id;
  });
  const kinds = () => page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes.effects.map((e: any) => e.kind), id);
  const source = page.locator('[data-effect="2"] [data-stack-grip]');
  await source.scrollIntoViewIfNeeded();
  const start = (await source.boundingBox())!;
  const target = (await page.locator('[data-effect="1"]').boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, target.y + target.height / 2, { steps: 8 });
  expect(await kinds()).toEqual(['blur', 'drop', 'inner']);
  await page.mouse.up();
  await expect.poll(kinds).toEqual(['blur', 'inner', 'drop']);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect.poll(kinds).toEqual(['blur', 'drop', 'inner']);
});
