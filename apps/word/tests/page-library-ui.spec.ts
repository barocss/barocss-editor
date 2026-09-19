import { test, expect } from '@playwright/test';
import { placeCaret, settled } from './helpers';

const pageDialog = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: '페이지 설정', exact: true });
async function openPageSetup(page: import('@playwright/test').Page) {
  await page.getByRole('menuitem', { name: '서식', exact: true }).click();
  await page.getByRole('menuitem', { name: '페이지 설정…' }).click();
  await expect(pageDialog(page)).toBeVisible();
}

test('page setup retains its draft on failure, prevents duplicate applies and edits the selected section', async ({ page }) => {
  await page.goto('/?sample'); await settled(page);
  await placeCaret(page, '.w-surface p', -1);
  const margins = () => page.evaluate(() => {
    const editor = (window as any).editor;
    return editor.dataStore.getNode(editor.getRootId()).content
      .map((id: string) => editor.dataStore.getNode(id)).filter((node: any) => node.stype === 'surface')
      .map((node: any) => node.attributes.marginTop);
  });
  const before = await margins();
  await openPageSetup(page);
  await page.getByLabel('위 여백', { exact: true }).fill('32');
  await page.getByLabel('위 여백', { exact: true }).press('Enter');
  await page.evaluate(() => {
    const editor = (window as any).editor, original = editor.executeCommand.bind(editor);
    (window as any).pageApplyCalls = 0;
    editor.executeCommand = (name: string, payload: unknown) => {
      if (name !== 'setPageSetup') return original(name, payload);
      (window as any).pageApplyCalls++;
      return new Promise(resolve => { (window as any).rejectPageApply = () => { editor.executeCommand = original; resolve(false); }; });
    };
  });
  await pageDialog(page).getByRole('button', { name: '확인', exact: true }).click();
  await expect(pageDialog(page).getByRole('button', { name: '적용 중…' })).toBeDisabled();
  await expect(page.getByLabel('위 여백', { exact: true })).toBeDisabled();
  await pageDialog(page).getByRole('button', { name: '닫기', exact: true }).click();
  await expect(pageDialog(page)).toBeVisible();
  expect(await page.evaluate(() => (window as any).pageApplyCalls)).toBe(1);
  await page.evaluate(() => (window as any).rejectPageApply());
  await expect(pageDialog(page).getByRole('alert')).toContainText('입력한 값은 유지됩니다');
  await expect(page.getByLabel('위 여백', { exact: true })).toHaveValue('32');
  expect(await margins()).toEqual(before);
  await pageDialog(page).getByRole('button', { name: '확인', exact: true }).click();
  await expect(pageDialog(page)).toBeHidden();
  const after = await margins();
  expect(after[0]).toBe(before[0]);
  expect(after.at(-1)).toBe(Math.round(32 / 25.4 * 1440));
});

test('page settings fit a narrow dialog, use shared toggles and explain invalid column spacing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await settled(page); await openPageSetup(page);
  const dialog = pageDialog(page);
  await dialog.getByRole('checkbox', { name: '제본용 여백을 위쪽에' }).check();
  await expect(dialog.getByRole('checkbox', { name: '제본용 여백을 위쪽에' })).toBeChecked();
  await dialog.getByLabel('단 수').fill('2'); await dialog.getByLabel('단 수').press('Enter');
  await dialog.getByRole('checkbox', { name: '단 사이에 구분선' }).check();
  await dialog.getByRole('spinbutton', { name: '단 간격', exact: true }).fill('400'); await dialog.getByRole('spinbutton', { name: '단 간격', exact: true }).press('Enter');
  await expect(dialog.getByRole('alert')).toContainText('단 간격');
  await expect(dialog.getByRole('button', { name: '확인', exact: true })).toBeDisabled();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: '../../.dev/artifacts/design-system/word-page-settings-mobile.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await openPageSetup(page);
  await expect(dialog.getByLabel('단 수')).toHaveValue('1');
  await expect(dialog.getByRole('checkbox', { name: '제본용 여백을 위쪽에' })).not.toBeChecked();
});

test('library recovers from a load failure and provides title search and an empty result action', async ({ page }) => {
  await page.goto('/?sample'); await settled(page);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  const title = page.getByLabel('문서 제목', { exact: true });
  await title.fill('공통 UI 보관함 확인'); await title.blur();
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function(...args: Parameters<typeof original>) {
      IDBObjectStore.prototype.getAll = original;
      throw new Error('Test: library read unavailable');
    };
  });
  await page.getByRole('button', { name: '문서 보관함', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '문서 보관함', exact: true });
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByText('보관한 문서가 없습니다', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(dialog.getByRole('button', { name: '공통 UI 보관함 확인 열기', exact: true })).toBeVisible();
  await dialog.getByRole('searchbox', { name: '보관함에서 찾기' }).fill('없는 제목');
  await expect(dialog.getByRole('status')).toHaveText('검색 결과가 없습니다다른 문서 제목으로 찾아보세요.');
  await dialog.getByRole('button', { name: '검색 지우기' }).click();
  await expect(dialog.getByRole('button', { name: '공통 UI 보관함 확인 열기', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: '../../.dev/artifacts/design-system/word-library-mobile.png', animations: 'disabled' });
  await expect(title).toHaveValue('공통 UI 보관함 확인');
});
