import { expect, test, type Page } from '@playwright/test';
import { openDeck } from './helpers';

async function openSize(page: Page) {
  await page.getByRole('button', { name: '명령 검색', exact: true }).click();
  const search = page.getByRole('combobox', { name: '명령 검색어' });
  await search.fill('슬라이드 크기'); await search.press('Enter');
  await expect(page.getByRole('dialog', { name: '슬라이드 크기', exact: true })).toBeVisible();
}
const dialog = (page: Page) => page.getByRole('dialog', { name: '슬라이드 크기', exact: true });
const dimensions = (page: Page) => page.evaluate(() => {
  const editor = (window as any).editor;
  return editor.dataStore.getNode(editor.getRootId()).content.map((id: string) => editor.dataStore.getNode(id))
    .filter((node: any) => node.stype === 'surface').map((node: any) => ({ width: node.attributes.width, height: node.attributes.height }));
});

test('slide size retains failed draft, blocks dismissal and retries once with undo', async ({ page }) => {
  await openDeck(page); const before = await dimensions(page);
  expect(before.length).toBeGreaterThan(0);
  await openSize(page);
  const width = dialog(page).getByRole('spinbutton', { name: '너비', exact: true });
  await width.fill('800'); await width.press('Enter');
  await page.evaluate(() => {
    const editor = (window as any).editor, original = editor.executeCommand.bind(editor);
    (window as any).sizeCalls = 0;
    editor.executeCommand = async (name: string, payload: unknown) => {
      if (name === 'setDeckSize' && ++(window as any).sizeCalls === 1) {
        await new Promise(resolve => { (window as any).releaseSize = resolve; });
        return false;
      }
      return original(name, payload);
    };
  });
  await dialog(page).getByRole('button', { name: '적용', exact: true }).click();
  await expect(width).toBeDisabled();
  await expect(dialog(page).getByRole('button', { name: '취소', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('button', { name: '닫기', exact: true }).click(); await expect(dialog(page)).toBeVisible();
  await page.evaluate(() => (window as any).releaseSize());
  await expect(dialog(page).getByRole('alert')).toContainText('입력한 값은 유지');
  await expect(width).toHaveValue('800'); expect(await dimensions(page)).toEqual(before);
  await page.screenshot({ path: '../../.dev/artifacts/design-system/slides-settings-retry.png' });
  await dialog(page).getByRole('button', { name: '적용', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).sizeCalls)).toBe(2);
  await expect.poll(async () => (await dimensions(page)).every((size: any) => size.width === 12000)).toBe(true);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect.poll(() => dimensions(page)).toEqual(before);
});

test('slide size cancel resets the draft and unchanged apply runs no command', async ({ page }) => {
  await openDeck(page); await openSize(page);
  const width = dialog(page).getByRole('spinbutton', { name: '너비', exact: true });
  const initial = await width.inputValue();
  await width.fill('800'); await width.press('Enter');
  await dialog(page).getByRole('button', { name: '취소', exact: true }).click();
  await openSize(page); await expect(width).toHaveValue(initial);
  await page.evaluate(() => {
    const editor = (window as any).editor, original = editor.executeCommand.bind(editor);
    (window as any).sizeCalls = 0;
    editor.executeCommand = (name: string, payload: unknown) => {
      if (name === 'setDeckSize') (window as any).sizeCalls++;
      return original(name, payload);
    };
  });
  await dialog(page).getByRole('button', { name: '적용', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).sizeCalls)).toBe(0);
});
