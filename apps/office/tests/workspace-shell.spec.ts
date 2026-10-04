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
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  await expect(page.locator('.ow-native-slot > #root')).not.toHaveAttribute('inert', '');
}
const wordNative = (page: Page) => page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));

// This is local-device discovery. It does not establish authenticated ownership.
test('zero projects retain all four native hosts and a usable tree in light and dark desktop layouts', async ({ page }) => {
  const ids = await seed(page);
  for (const product of kinds) {
    await open(page, product, ids[product]);
    const directURL = page.url();
    await page.goto(directURL);
    await expect(tree(page)).toBeVisible();
    await expect(tree(page).locator(`[data-original="${product}:${ids[product]}"]`)).toHaveAttribute('aria-pressed', 'true');
    if (product === 'site') await expect(page.locator('[data-frame="desktop"]')).toBeVisible();
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
        expect(geometry.native).toBeGreaterThanOrEqual(width - 277);
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
  await library.getByRole('combobox', { name: '폴더', exact: true }).selectOption('Web work');
  const row = library.locator(`[data-document="site:${ids.site}"]`);
  await expect(library.locator('[data-document]')).toHaveCount(1);
  await row.getByRole('button', { name: 'Site Shell site', exact: true }).click();
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

test('two projects and My retain the same original and native history when its alias is clicked', async ({ page }) => {
  const ids = await seed(page);
  await page.evaluate(async ({ module, id }) => {
    const { OfficeWorkspace, workspaceIdentity } = await import(module) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    for (const title of ['Launch project', 'Customer project']) {
      const project = await workspace.createProject(title, 'Reuse one original');
      project.record.results.push({ id: crypto.randomUUID(), name: title, document: { product: 'word', id }, inputs: [] });
      await workspace.saveProject(project.record, project.revision);
    }
  }, { module: workspaceModule, id: ids.word });
  await expect(tree(page).getByRole('button', { name: 'Launch project', exact: true })).toBeVisible();
  await expect(tree(page).getByRole('button', { name: 'Customer project', exact: true })).toBeVisible();
  await expect(file(page, 'word')).toHaveCount(2);
  const customer = tree(page).getByRole('button', { name: 'Customer project', exact: true });
  const customerGroup = tree(page).locator('section').filter({ has: page.getByRole('button', { name: 'Customer project', exact: true }) });
  await expect(customerGroup.getByRole('listitem')).toHaveCount(1);
  const headingBox = await customer.boundingBox(), childBox = await customerGroup.getByRole('list').boundingBox();
  expect(headingBox).not.toBeNull(); expect(childBox).not.toBeNull();
  expect(childBox!.x).toBeGreaterThan(headingBox!.x);
  await customer.focus(); await page.keyboard.press('Enter');
  await expect(customer).toHaveAttribute('aria-expanded', 'false');
  await expect(customerGroup.getByRole('listitem')).toHaveCount(0);
  await expect(file(page, 'word')).toHaveCount(1);
  await expect(customer).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(customer).toHaveAttribute('aria-expanded', 'true');
  await expect(file(page, 'word')).toHaveCount(2);
  await file(page, 'word').first().click();
  await expect(page.locator('.w-paragraph').last()).toBeVisible();
  const paragraph = page.locator('.w-paragraph').last();
  await paragraph.click(); await page.keyboard.insertText(' Shared original draft');
  const before = await wordNative(page), native = await paragraph.elementHandle(), url = page.url();
  await tree(page).getByRole('textbox', { name: '파일 검색', exact: true }).fill('does not match');
  await expect(file(page, 'word')).toHaveCount(0);
  await tree(page).getByRole('button', { name: '현재 파일 찾기', exact: true }).click();
  await expect(file(page, 'word')).toHaveCount(2);

  await file(page, 'word').last().click();
  await tree(page).getByRole('button', { name: '내 파일', exact: true }).click();
  await expect(file(page, 'word')).toHaveCount(1);
  await file(page, 'word').click();
  expect(page.url()).toBe(url); expect(await wordNative(page)).toBe(before);
  expect(await native!.evaluate(element => element.isConnected)).toBe(true);
  await paragraph.click(); await page.keyboard.press('Meta+z');
  await expect(paragraph).not.toContainText('Shared original draft');
  await page.keyboard.press('Meta+Shift+z');
  await expect(paragraph).toContainText('Shared original draft');
});

test('Site remembers the durable page across reorder and a fresh renderer without rewriting native content', async ({ page }) => {
  const ids = await seed(page);
  await open(page, 'site', ids.site);
  await expect(page.locator('[data-frame="desktop"]')).toBeVisible();
  if (!await page.locator('[data-to-admin]').isVisible()) await page.getByRole('button', { name: '모든 도구', exact: true }).click();
  await page.locator('[data-to-admin]').click();
  await page.locator('[data-admin-add="page"]').click();
  await page.locator('[data-admin-from="blank"]').click();
  const pages = page.locator('[data-admin-open]');
  await expect(pages).toHaveCount(2);
  await page.locator('[data-admin-add="page"]').click();
  await page.locator('[data-admin-from="blank"]').click();
  await expect(pages).toHaveCount(3);
  const lastPage = await pages.nth(1).getAttribute('data-admin-open');
  expect(lastPage).toBeTruthy();
  await pages.nth(1).click();
  await expect(page.locator('[data-frame="desktop"]')).toBeVisible();
  await open(page, 'word', ids.word);
  const expected = await page.evaluate(async ({ module, id }) => {
    const { OfficeWorkspace, workspaceIdentity, productStore, readProductDocument } = await import(module) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    const source = await workspace.require('site', id);
    const file = JSON.parse(source.text);
    const content = file.document.content;
    const indices = content.map((node: { stype: string }, index: number) => node.stype === 'surface' ? index : -1).filter((index: number) => index >= 0);
    if (indices.length !== 3) throw new Error('Expected exactly three native page surfaces');
    [content[indices[0]], content[indices[2]]] = [content[indices[2]], content[indices[0]]];
    const text = JSON.stringify(file);
    await readProductDocument('site', text);
    await productStore('site').keep(source.row, text, { expectedRevision: source.row.revision ?? 0 });
    return text;
  }, { module: workspaceModule, id: ids.site });
  await open(page, 'site', ids.site);
  await expect(page.locator('[data-frame="desktop"]')).toBeVisible();
  // Resolve the actual drawn DOM back to its native page, not a saved UI hint or list order.
  await expect.poll(() => page.evaluate(() => {
    const editor = (window as any).editor;
    const ids = new Set<string>();
    for (const element of document.querySelectorAll('[data-frame-host="desktop"] [data-bc-sid]')) {
      let node = editor.dataStore.getNode(element.getAttribute('data-bc-sid'));
      const seen = new Set<string>();
      while (node && !seen.has(node.sid)) {
        seen.add(node.sid);
        if (node.stype === 'surface') { ids.add(node.attributes.id); break; }
        node = node.parentId ? editor.dataStore.getNode(node.parentId) : undefined;
      }
    }
    return [...ids];
  })).toEqual([lastPage]);
  const remembered = await page.evaluate(() => Object.entries(sessionStorage).find(([key]) => key.startsWith('wonffice.site-page:'))?.[1]);
  expect(remembered).toBe(lastPage);
  if (!await page.locator('[data-to-admin]').isVisible()) await page.getByRole('button', { name: '모든 도구', exact: true }).click();
  await page.locator('[data-to-admin]').click();
  await expect(pages.nth(1)).toHaveAttribute('data-admin-open', lastPage!);
  await expect(pages.first()).not.toHaveAttribute('data-admin-open', lastPage!);
  const actual = await page.evaluate(async ({ module, id }) => {
    const { OfficeWorkspace, workspaceIdentity } = await import(module) as typeof import('@barocss/office-workspace');
    return (await new OfficeWorkspace(workspaceIdentity()).require('site', id)).text;
  }, { module: workspaceModule, id: ids.site });
  expect(JSON.parse(actual).document).toEqual(JSON.parse(expected).document);
});

test('direct Slides entry blocks temporary native controls until the requested original is restored', async ({ page }) => {
  const ids = await seed(page);
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.get;
    const success = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete')!;
    IDBObjectStore.prototype.get = function (...args) {
      const request = original.apply(this, args);
      if (this.transaction.db.name === 'barocss-slides-workspace' && document.querySelector('#ow-shell-root') && !(window as any).__heldRestore) {
        (window as any).__heldRestore = true;
        const transaction = this.transaction;
        Object.defineProperty(transaction, 'oncomplete', {
          configurable: true,
          get() { return success.get!.call(transaction); },
          set(callback) {
            success.set!.call(transaction, (event: Event) => {
              (window as any).__releaseRestore = () => callback?.call(transaction, event);
            });
          }
        });
      }
      return request;
    };
  });
  await file(page, 'slides').click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__releaseRestore)).toBe('function');
  await expect(page.locator('.ow-native-slot > #root')).toHaveAttribute('inert', '');
  await expect(page.locator('.ow-entry-status')).toBeVisible();
  const disclosure = page.getByRole('button', { name: '슬라이드 탐색 펼치기', exact: true });
  await disclosure.evaluate(element => (element as HTMLElement).focus());
  expect(await disclosure.evaluate(element => document.activeElement === element)).toBe(false);
  await page.keyboard.type('MUST NOT REACH THE TEMPORARY DOCUMENT');
  await page.evaluate(() => (window as any).__releaseRestore());
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  await expect(tree(page).locator(`[data-original="slides:${ids.slides}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.ow-native-slot > #root')).not.toHaveAttribute('inert', '');
  await disclosure.click();
  await expect(page.locator('[data-filmstrip-panel]')).toBeVisible();
  await expect(page.locator('.sl-stage')).not.toContainText('MUST NOT REACH THE TEMPORARY DOCUMENT');
});


test('empty projects open from the tree and incomplete discovery does not claim files are unlinked', async ({ page }) => {
  await seed(page);
  await page.evaluate(async module => {
    const { OfficeWorkspace, workspaceIdentity } = await import(module) as typeof import('@barocss/office-workspace');
    await new OfficeWorkspace(workspaceIdentity()).createProject('Empty launch', 'Plan the first release');
  }, workspaceModule);
  await tree(page).getByRole('button', { name: 'Empty launch 프로젝트 열기', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Empty launch', exact: true })).toBeVisible();
  await expect(page.locator('.ow-project-goal')).toHaveText('Plan the first release');
  await expect(tree(page).getByRole('button', { name: 'Empty launch 프로젝트 열기', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.evaluate(async module => {
    const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
    const projects = OfficeWorkspace.prototype.projects;
    (window as any).__restoreProjects = () => { OfficeWorkspace.prototype.projects = projects; window.dispatchEvent(new Event('wonffice:catalog-refresh')); };
    OfficeWorkspace.prototype.projects = async () => { throw new Error('Project discovery unavailable'); };
    window.dispatchEvent(new Event('wonffice:catalog-refresh'));
  }, workspaceModule);
  await expect(tree(page).getByRole('alert')).toBeVisible();
  await expect(tree(page).getByRole('button', { name: '연결하지 않은 파일', exact: true })).toHaveCount(0);
  await expect(tree(page).locator('[data-original]')).toHaveCount(4);
  await page.evaluate(() => (window as any).__restoreProjects());
  await expect(tree(page).getByRole('alert')).toHaveCount(0);
  await expect(tree(page).getByRole('button', { name: 'Empty launch 프로젝트 열기', exact: true })).toBeVisible();
});


test('a failed native startup replaces the loading cover with an accessible error and library escape', async ({ page }) => {
  await seed(page);
  await page.route('**/apps/slide/src/main.tsx*', route => route.abort('failed'));
  await file(page, 'slides').click();
  await expect(page.getByRole('heading', { name: '자료를 열지 못했습니다.', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  const escape = page.getByRole('button', { name: '자료함으로 돌아가기', exact: true });
  await escape.focus();
  await expect(escape).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '전체 자료', exact: true })).toBeVisible();
  await expect(tree(page).locator('[data-original]')).toHaveCount(4);
});

test('populated project trees keep long names discoverable and embedded library actions keyboard reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1170, height: 900 });
  const ids = await seed(page);
  const projectTitle = 'Quarterly launch — research, product delivery and customer adoption';
  const fileTitle = 'Customer adoption review — detailed findings and next-quarter recommendations';
  await page.evaluate(async ({ module, projectTitle, fileTitle, id }) => {
    const { OfficeWorkspace, workspaceIdentity } = await import(module) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    const project = await workspace.createProject(projectTitle, 'Prepare the customer adoption review');
    project.record.results.push({ id: crypto.randomUUID(), name: 'Original report', document: { product: 'word', id }, inputs: [] });
    for (let index = 0; index < 22; index++) {
      const document = await workspace.create('word', `${fileTitle} ${index + 1}`);
      project.record.results.push({ id: crypto.randomUUID(), name: `Report ${index + 1}`, document: { product: 'word', id: document }, inputs: [] });
    }
    await workspace.saveProject(project.record, project.revision);
  }, { module: workspaceModule, projectTitle, fileTitle, id: ids.word });
  const group = tree(page).getByRole('button', { name: projectTitle, exact: true });
  await expect(group).toHaveAttribute('title', projectTitle);
  await expect(tree(page).locator('[data-original]')).toHaveCount(26);
  await open(page, 'word', ids.word);
  const native = await wordNative(page);
  for (const width of [1170, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      const geometry = await tree(page).locator('.ow-file-tree').evaluate(el => ({ scroll: el.scrollHeight > el.clientHeight, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
      expect(geometry.scroll).toBe(true); expect(geometry.overflow).toBeLessThanOrEqual(1);
      const longRow = tree(page).getByRole('button', { name: `${fileTitle} 22 열기`, exact: true });
      await longRow.scrollIntoViewIfNeeded();
      await expect(longRow).toHaveAttribute('title', `${fileTitle} 22`);
      await page.screenshot({ path: test.info().outputPath(`populated-${theme}-${width}.png`), animations: 'disabled' });
    }
  }
  expect(await wordNative(page)).toBe(native);
  await tree(page).getByRole('button', { name: '자료함', exact: true }).click();
  const library = page.locator('.ow-library-embedded');
  await expect(library.locator('.ow-workspace-heading')).toBeVisible();
  const backup = library.getByRole('button', { name: '백업 및 가져오기', exact: true });
  await backup.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '백업 및 가져오기', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '전체 자료 백업', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(backup).toBeFocused();
  await expect(library.getByRole('combobox', { name: '자료 보기', exact: true })).toBeVisible();
});
