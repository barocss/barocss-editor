import { expect, test } from '@playwright/test';
import { openDeck } from './helpers';

test('blend belongs to each inspector fill and leaves colour and opacity unchanged', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: '사각형', exact: true }).click();
  const id = await page.evaluate(async () => {
    const editor = (window as any).editor, id = editor.selection.nodeIds[0];
    await editor.executeCommand('setBoxStyle', { nodeIds: [id], fills: [
      { kind: 'solid', color: '#ff0000', opacity: .6 },
      { kind: 'solid', color: '#0000ff', opacity: .8 }
    ] });
    return id;
  });
  const fills = () => page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes.fills.map(({ kind, color, opacity, blend }: any) => ({ kind, color, opacity, blend: blend ?? 'normal' })), id);
  const before = await fills();
  const first = page.locator('[data-paint="0"] .office-stack-details').getByLabel('1번 혼합 모드');
  const second = page.locator('[data-paint="1"] .office-stack-details').getByLabel('2번 혼합 모드');
  await expect(first).toHaveValue('normal');
  await second.selectOption('multiply');
  await expect.poll(fills).toEqual([before[0], { ...before[1], blend: 'multiply' }]);
  await expect(first).toHaveValue('normal');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect.poll(fills).toEqual(before);
  await expect(second).toHaveValue('normal');

  await first.selectOption('screen');
  await page.getByRole('button', { name: '1번 채우기', exact: true }).press('Enter');
  const popup = page.locator('[data-paint="0"] [data-stack-editor]');
  await expect(popup.getByRole('textbox', { name: '색상 코드' })).toBeVisible();
  await expect(popup.getByRole('combobox', { name: /혼합 모드/ })).toHaveCount(0);
  const code = popup.getByRole('textbox', { name: '색상 코드' });
  await code.fill('00ff00'); await code.press('Enter');
  await expect.poll(async () => (await fills())[0]).toEqual({ ...before[0], color: '#00ff00', blend: 'screen' });
  await popup.getByRole('button', { name: '1번 채우기 편집 닫기' }).click();
  await expect(first).toHaveValue('screen');

  await page.getByLabel('1번 채우기 종류').selectOption('linear');
  await expect(first).toHaveValue('screen');
  await page.getByRole('button', { name: '1번 채우기', exact: true }).click();
  await expect(popup.getByRole('combobox', { name: /혼합 모드/ })).toHaveCount(0);
  await expect(popup.getByRole('spinbutton', { name: '1번 각도' })).toBeVisible();
});
