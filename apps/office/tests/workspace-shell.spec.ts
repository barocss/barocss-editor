import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { openLocalLibrary } from './helpers/local-library';

const workspaceModule = `/@fs${fileURLToPath(new URL('../../../packages/office-workspace/src/index.ts', import.meta.url))}`;
const kinds = ['note', 'word', 'slides', 'site'] as const;
type Product = typeof kinds[number];
const title = (product: Product) => `Shell ${product}`;
const tree = (page: Page) => page.locator('.ow-file-navigation');
const file = (page: Page, product: Product) => tree(page).getByRole('button', { name: `${title(product)} 열기`, exact: true });

async function seed(page: Page) {
  await page.goto('/');
  const ids = await page.evaluate(async module => {
    const { OfficeWorkspace, workspaceIdentity } = await import(module) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    const ids = {} as Record<Product, string>;
    for (const product of ['note', 'word', 'slides', 'site'] as const) ids[product] = await workspace.create(product, `Shell ${product}`);
    await workspace.update(`site:${ids.site}`, { folder: 'Web work' });
    return { ids, projectCount: (await workspace.projects()).length };
  }, workspaceModule);
  expect(ids.projectCount).toBe(0);
  await page.reload();
  await expect(tree(page).locator('[data-original]')).toHaveCount(4);
  return ids.ids;
}
async function open(page: Page, product: Product, id: string) {
  await file(page, product).click();
  await expect(tree(page)).toBeVisible();
  await expect(tree(page).locator(`[data-original="${product}:${id}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.ow-native-slot > #root')).toBeVisible();
}
const wordNative = (page: Page) => page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));

// This is local-device discovery. It does not establish authenticated ownership.
test('zero projects retain all four native hosts and a usable tree in light and dark desktop layouts', async ({ page }) => {
  const ids = await seed(page);
  for (const product of kinds) {
    await open(page, product, ids[product]);
    await expect(tree(page).locator('[data-original]')).toHaveCount(4);
    const colors: string[] = [];
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const width of [1170, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const geometry = await page.evaluate(() => {
          const navigation = document.querySelector('.ow-file-navigation')!, native = document.querySelector('.ow-native-slot')!;
          return { tree: navigation.getBoundingClientRect().width, native: native.getBoundingClientRect().width,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            targets: [...navigation.querySelectorAll('button,input,select')].filter(el => el.getBoundingClientRect().height > 0).map(el => el.getBoundingClientRect().height) };
        });
        expect(geometry.tree).toBe(224);
        expect(geometry.native).toBeGreaterThanOrEqual(width - 225);
        expect(geometry.overflow).toBeLessThanOrEqual(1);
        expect(geometry.targets.length).toBeGreaterThan(4);
        expect(Math.min(...geometry.targets)).toBeGreaterThanOrEqual(32);
        if (width === 1440) colors.push(await tree(page).evaluate(el => getComputedStyle(el).backgroundColor));
        await page.screenshot({ path: test.info().outputPath(`${product}-${theme}-${width}.png`), animations: 'disabled' });
      }
    }
    expect(colors[0]).not.toBe(colors[1]);
  }
  await open(page, 'word', ids.word);
  const paragraph = page.locator('.w-paragraph').last();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' Unfinished native input');
  await expect(paragraph).toContainText('Unfinished native input');
  const nativeNode = await paragraph.elementHandle(), before = await wordNative(page), url = page.url();
  await tree(page).getByRole('button', { name: '내 파일', exact: true }).click();
  await expect(tree(page).locator('[data-original]')).toHaveCount(4);
  await tree(page).getByRole('button', { name: '프로젝트', exact: true }).click();
  expect(page.url()).toBe(url); expect(await wordNative(page)).toBe(before);
  expect(await nativeNode!.evaluate(el => el.isConnected)).toBe(true);
  await tree(page).getByRole('button', { name: '편집 집중 보기', exact: true }).focus();
  await page.keyboard.press('Enter'); await expect(tree(page)).toBeHidden();
  const restore = page.getByRole('button', { name: '작업 공간 파일 펼치기', exact: true });
  await restore.focus(); await page.keyboard.press('Enter'); await expect(tree(page)).toBeVisible();
  expect(await wordNative(page)).toBe(before); expect(await nativeNode!.evaluate(el => el.isConnected)).toBe(true);
});

test('closing a Site original restores the library product, query and opaque folder', async ({ page }) => {
  const ids = await seed(page);
  await openLocalLibrary(page);
  const library = page.locator('.ow-library-embedded');
  await library.locator('.ow-filters').getByRole('button', { name: 'Site', exact: true }).click();
  await library.getByRole('textbox', { name: '자료 검색', exact: true }).fill('Shell site');
  await library.getByRole('navigation', { name: '폴더', exact: true }).getByRole('button', { name: 'Web work', exact: true }).click();
  const row = library.locator(`[data-document="site:${ids.site}"]`);
  await expect(library.locator('[data-document]')).toHaveCount(1);
  await row.getByRole('button', { name: 'S Shell site', exact: true }).click();
  await expect(tree(page).locator(`[data-original="site:${ids.site}"]`)).toHaveAttribute('aria-pressed', 'true');
  await tree(page).getByRole('button', { name: '자료함', exact: true }).click();
  await expect(library.getByRole('textbox', { name: '자료 검색', exact: true })).toHaveValue('Shell site');
  await expect(library.locator('.ow-filters').getByRole('button', { name: 'Site', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(library.getByRole('heading', { name: 'Web work', exact: true })).toBeVisible();
  await expect(library.locator('[data-document]')).toHaveCount(1);
  await expect(row).toBeVisible();
});

test('tree navigation saves the last Word input and refuses a failed save without losing the draft', async ({ page }) => {
  const ids = await seed(page);
  await open(page, 'word', ids.word);
  const paragraph = page.locator('.w-paragraph').last();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' FINAL TREE INPUT');
  await open(page, 'slides', ids.slides);
  await open(page, 'word', ids.word);
  await expect(paragraph).toContainText('FINAL TREE INPUT');
  const originalURL = page.url();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    (window as any).__restoreWorkspacePut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction.db.name === 'barocss-word') throw new DOMException('Test storage full', 'QuotaExceededError');
      return put.apply(this, args as any);
    };
  });
  try {
    await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' RETAINED FAILURE INPUT');
    const before = await wordNative(page);
    await file(page, 'slides').click();
    await expect(tree(page).getByRole('alert')).toContainText('마지막 입력을 저장하지 못했습니다');
    expect(page.url()).toBe(originalURL); expect(await wordNative(page)).toBe(before);
    await expect(paragraph).toContainText('RETAINED FAILURE INPUT');
    await expect(page.locator('.ow-native-slot > #root')).not.toHaveAttribute('inert');
  } finally { await page.evaluate(() => (window as any).__restoreWorkspacePut()); }
  await open(page, 'slides', ids.slides); await open(page, 'word', ids.word);
  await expect(paragraph).toContainText('RETAINED FAILURE INPUT');
});
