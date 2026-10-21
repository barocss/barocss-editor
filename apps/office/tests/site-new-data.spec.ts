import { expect, test } from '@playwright/test';
import { openLocalLibrary } from './helpers/local-library';
import { nativeEditor, nativeFrame } from './helpers/native-editor';
import { readFile } from 'node:fs/promises';

type Node = { stype?: string; attributes?: Record<string, any>; text?: string; content?: Node[] };
const nodes = (root: Node, kind: string): Node[] => [
  ...(root.stype === kind ? [root] : []),
  ...(root.content ?? []).flatMap(child => nodes(child, kind)),
];
const stable = (node: Node): Node => ({
  stype: node.stype,
  attributes: node.attributes ?? {},
  ...(typeof node.text === 'string' ? { text: node.text } : {}),
  content: (node.content ?? []).map(stable),
});
const documentTree = (page: import('@playwright/test').Page): Promise<Node> =>
  nativeFrame(page).then(frame => frame.evaluate(() => (window as any).editor.exportDocument()));

async function freshSite(page: import('@playwright/test').Page) {
  await page.goto('/');
  await openLocalLibrary(page);
  await page.getByRole('button', { name: 'Site 새 자료 만들기', exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름' }).fill('새 데이터 검증 Site');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(nativeEditor(page).locator('[data-site-save-status]')).toHaveText('저장됨');
  await enterDataAdmin(page);
}

async function enterDataAdmin(page: import('@playwright/test').Page) {
  const native = nativeEditor(page);
  if (!await native.locator('[data-admin-tab="data"]').isVisible()) {
    await native.getByRole('menuitem', { name: '패널', exact: true }).click();
    const tools = native.getByRole('menuitemcheckbox', { name: '전체 도구', exact: true });
    if (await tools.getAttribute('aria-checked') !== 'true') await tools.click();
    else await tools.press('Escape');
    await native.locator('[data-to-admin]').click();
  }
  await native.locator('[data-admin-tab="data"]').click();
}

test('Office new Site creates, edits, reopens and exports unique datasets without changing home', async ({ page }, testInfo) => {
  await freshSite(page);
  const originalUrl = page.url();
  const originalHome = nodes(await documentTree(page), 'surface').find(node => node.attributes?.id === 'home');
  expect(originalHome).toBeDefined();
  await expect(nativeEditor(page).locator('[data-admin-data]')).toHaveCount(0);

  const add = nativeEditor(page).locator('[data-admin-add="data"]');
  await add.click();
  await expect(nativeEditor(page).locator('[data-admin-data="새 데이터"]')).toContainText('1');
  await add.click();
  await expect(nativeEditor(page).locator('[data-admin-data="새 데이터 2"]')).toBeVisible();
  await expect(nativeEditor(page).locator('[data-admin-data]')).toHaveCount(2);

  await nativeEditor(page).locator('[data-admin-data="새 데이터"] [data-admin-open]').click();
  const cell = nativeEditor(page).getByRole('textbox', { name: '1행 이름', exact: true });
  await cell.fill('첫 행 보존');
  await cell.press('Tab');
  await expect(nativeEditor(page).locator('[data-site-save-status]')).toHaveText('저장됨');
  await expect(cell).toHaveValue('첫 행 보존');

  await nativeEditor(page).locator('.office-product-menu [data-menu]').click();
  await nativeEditor(page).getByRole('menuitem', { name: '자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: '전체 자료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Site 새 데이터 검증 Site', exact: true }).click();
  await expect(page).toHaveURL(originalUrl);
  await page.reload();
  await expect(nativeEditor(page).locator('[data-site-save-status]')).toHaveText('저장됨');
  await enterDataAdmin(page);
  await expect(nativeEditor(page).locator('[data-admin-data]')).toHaveCount(2);
  await nativeEditor(page).locator('[data-admin-data="새 데이터"] [data-admin-open]').click();
  await expect(nativeEditor(page).getByRole('textbox', { name: '1행 이름', exact: true })).toHaveValue('첫 행 보존');

  await nativeEditor(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  const pending = page.waitForEvent('download');
  await nativeEditor(page).getByRole('menuitem', { name: /^저장(?: |$)/ }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.site\.json$/);
  const file = testInfo.outputPath('new-site.site.json');
  await download.saveAs(file);
  const exported = JSON.parse(await readFile(file, 'utf8'));
  expect(exported.format).toBe('barocss-site');
  const datasets = nodes(exported.document, 'dataset');
  expect(datasets.map(node => node.attributes?.name)).toEqual(['새 데이터', '새 데이터 2']);
  expect(datasets[0].attributes?.records).toEqual([{ 이름: '첫 행 보존' }]);
  expect(stable(nodes(exported.document, 'surface').find(node => node.attributes?.id === 'home')!)).toEqual(stable(originalHome!));
});

test('failed dataset command explains failure and permits a clean retry', async ({ page }) => {
  await freshSite(page);
  await (await nativeFrame(page)).evaluate(() => {
    const editor = (window as any).editor;
    const original = editor.executeCommand.bind(editor);
    editor.executeCommand = (name: string, payload?: unknown) => {
      if (name === 'insertDataset') {
        editor.executeCommand = original;
        return Promise.resolve(false);
      }
      return original(name, payload);
    };
  });
  const add = nativeEditor(page).locator('[data-admin-add="data"]');
  await add.click();
  await expect(nativeEditor(page).getByRole('alert')).toContainText('새 데이터는 저장되지 않았습니다');
  await expect(nativeEditor(page).locator('[data-admin-data]')).toHaveCount(0);
  expect(nodes(await documentTree(page), 'dataset')).toHaveLength(0);
  await expect(add).toBeEnabled();
  await add.click();
  await expect(nativeEditor(page).getByRole('alert')).toHaveCount(0);
  await expect(nativeEditor(page).locator('[data-admin-data="새 데이터"]')).toBeVisible();
  await expect(nativeEditor(page).locator('[data-site-save-status]')).toHaveText('저장됨');
});
