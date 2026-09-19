import { expect, test } from '@playwright/test';
import { openDeck } from './helpers';

test('gradient stop drag previews locally, commits once, keeps the moved colour selected and cancels cleanly', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: '사각형', exact: true }).click();
  const id = await page.evaluate(async () => {
    const editor = (window as any).editor, id = editor.selection.nodeIds[0];
    await editor.executeCommand('setBoxStyle', { nodeIds: [id], fills: [{ kind: 'linear', stops: [
      { offset: 0, color: '#ff0000' }, { offset: .5, color: '#00ff00' }, { offset: 1, color: '#0000ff' }
    ] }] });
    return id;
  });
  const fills = () => page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes.fills, id);
  const before = await fills();
  await page.getByRole('button', { name: '1번 채우기', exact: true }).click();
  const bar = page.locator('[data-gradient-bar="0"]');
  const bounds = (await bar.boundingBox())!;
  const first = (await bar.locator('[data-stop="0"]').boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .75, bounds.y + bounds.height / 2, { steps: 10 });
  expect(await fills()).toEqual(before);
  await expect(page.getByRole('spinbutton', { name: '1번 지점 위치' })).toHaveValue('75');
  await page.mouse.up();
  await expect.poll(async () => (await fills())[0].stops[1].offset).toBeCloseTo(.75, 1);
  await expect(bar.locator('[data-stop="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-gradient="0"]').getByRole('textbox', { name: '색상 코드' })).toHaveValue('FF0000');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect.poll(fills).toEqual(before);

  await page.getByRole('button', { name: '1번 채우기', exact: true }).click();
  const start = (await bar.locator('[data-stop="0"]').boundingBox())!;
  const track = (await bar.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * .25, track.y + track.height / 2, { steps: 6 });
  await page.keyboard.press('Escape'); await page.mouse.up();
  expect(await fills()).toEqual(before);
  await expect(bar.locator('[data-stop="0"]')).toHaveCSS('left', '0px');
});

test('fill and effect editors have close actions and keyboard stop selection keeps the same colour after sorting', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: '사각형', exact: true }).click();
  await page.getByLabel('1번 채우기 종류').selectOption('linear');
  const trigger = page.getByRole('button', { name: '1번 채우기', exact: true });
  await trigger.press('Enter');
  await expect(page.getByRole('spinbutton', { name: '1번 각도' })).toBeFocused();
  const last = page.getByRole('button', { name: '1번 색 지점 2', exact: true });
  await last.press('Space');
  await expect(last).toHaveAttribute('aria-pressed', 'true');
  const position = page.getByRole('spinbutton', { name: '1번 지점 위치' });
  await expect(position).toHaveValue('100');
  await position.fill('40'); await position.press('Enter');
  await expect(position).toHaveValue('40');
  await page.getByRole('button', { name: '1번 채우기 편집 닫기', exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: '효과 추가', exact: true }).click();
  const effect = page.getByRole('button', { name: '1번 효과 색', exact: true });
  await effect.press('Enter');
  const code = page.locator('[data-effect="0"]').getByRole('textbox', { name: '색상 코드' });
  await expect(code).toBeFocused();
  await code.press('Escape');
  await expect(effect).toBeFocused();
  await expect(effect).toHaveAttribute('aria-expanded', 'false');
});
