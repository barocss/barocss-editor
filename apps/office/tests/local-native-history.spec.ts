import { expect, test, type Frame, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const workspaceModule = `/@fs${fileURLToPath(new URL('../../../packages/office-workspace/src/index.ts', import.meta.url))}`;
const sharedModule = `/@fs${fileURLToPath(new URL('../../../packages/shared/src/index.ts', import.meta.url))}`;
type Product = 'note' | 'word' | 'slides';
const tree = (page: Page) => page.locator('.ow-file-navigation');
async function seed(page: Page) {
  await page.goto('/');
  return page.evaluate(async module => {
    const { OfficeWorkspace, workspaceIdentity } = await import(module) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    const ids = {} as Record<Product, string>;
    for (const product of ['note', 'word', 'slides'] as const) ids[product] = await workspace.create(product, `History ${product}`);
    for (const title of ['History project', 'Collapsed project']) {
      const project = await workspace.createProject(title, 'Retain original history');
      for (const product of ['note', 'word', 'slides'] as const) project.record.results.push({ id: crypto.randomUUID(), name: title,
        document: { product, id: ids[product] }, inputs: [] });
      if (title === 'History project') for (let index = 0; index < 18; index++) {
        const id = await workspace.create('note', `History extra ${index}`);
        project.record.results.push({ id: crypto.randomUUID(), name: title, document: { product: 'note', id }, inputs: [] });
      }
      await workspace.saveProject(project.record, project.revision);
    }
    return { workspace: workspace.id, ids };
  }, workspaceModule);
}
async function active(page: Page, product: Product, id: string): Promise<Frame> {
  await expect(page).toHaveURL(new RegExp(`/${id}(?:\\?|$)`));
  await expect(tree(page).locator(`[data-original="${product}:${id}"]`).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('iframe[data-local-native-frame="active"]')).toHaveCount(1);
  await expect(page.locator('iframe[data-local-native-frame="staged"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async module => {
    const { captureProductNavigation } = await import(module) as typeof import('@barocss/shared');
    const guard = captureProductNavigation(); return guard?.isCurrent() ? [guard.product, guard.id] : null;
  }, sharedModule)).toEqual([product, id]);
  const frame = await (await page.locator('iframe[data-local-native-frame="active"]').elementHandle())!.contentFrame();
  if (!frame) throw new Error('Missing active native frame');
  expect(new URL(page.url()).searchParams.has('__native_frame')).toBe(false);
  return frame;
}
async function open(page: Page, product: Product, id: string) {
  await tree(page).locator(`[data-original="${product}:${id}"]`).first().click();
  return active(page, product, id);
}
async function snapshots(page: Page, fixture: Awaited<ReturnType<typeof seed>>) {
  return page.evaluate(async ({ module, fixture }) => {
    const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(fixture.workspace);
    return Promise.all((['note', 'word', 'slides'] as const).map(product => workspace.require(product, fixture.ids[product])));
  }, { module: workspaceModule, fixture });
}
async function wordState(frame: Frame) {
  return frame.evaluate(() => {
    const editor = (window as unknown as { editor: { exportDocument(): unknown; getHistoryStats(): unknown; selection: unknown } }).editor;
    return { native: editor.exportDocument(), history: editor.getHistoryStats(), selection: editor.selection };
  });
}
async function treeState(page: Page) {
  return tree(page).evaluate(element => ({
    perspective: element.querySelector('.ow-tree-perspectives [aria-pressed="true"]')?.textContent,
    query: element.querySelector<HTMLInputElement>('input')?.value,
    product: element.querySelector<HTMLSelectElement>('select')?.value,
    collapsed: Array.from(element.querySelectorAll('.ow-tree-group[aria-expanded="false"]')).map(node => node.textContent),
    scroll: element.querySelector('.ow-file-tree')?.scrollTop,
  }));
}

test('native Back and Forward retain exact originals and Project/My tree state without duplicate alias writes', async ({ page }) => {
  const fixture = await seed(page);
  await page.goto(`/${fixture.workspace}/${fixture.ids.note}`);
  let frame = await active(page, 'note', fixture.ids.note);
  const nativeTree = await tree(page).elementHandle();
  const note = frame.locator('.on-doc .w-paragraph').last();
  await note.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' HISTORY NOTE LAST INPUT');
  frame = await open(page, 'word', fixture.ids.word);
  const paragraph = frame.locator('.w-paragraph').last();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' HISTORY WORD LAST INPUT');
  await open(page, 'slides', fixture.ids.slides);
  const saved = await snapshots(page, fixture);
  expect(saved[0].text).toContain('HISTORY NOTE LAST INPUT'); expect(saved[1].text).toContain('HISTORY WORD LAST INPUT');
  await tree(page).getByRole('button', { name: 'Collapsed project', exact: true }).click();
  await tree(page).getByRole('textbox', { name: '파일 검색', exact: true }).fill('History');
  await tree(page).locator('.ow-file-tree').evaluate(element => { element.scrollTop = 120; });
  await expect.poll(async () => (await treeState(page)).scroll).toBe(120);
  const projectState = await treeState(page);
  await tree(page).getByRole('button', { name: '내 파일', exact: true }).click();
  await tree(page).getByRole('textbox', { name: '파일 검색', exact: true }).fill('History ');
  await tree(page).locator('.ow-file-tree').evaluate(element => { element.scrollTop = 80; });
  await expect.poll(async () => (await treeState(page)).scroll).toBe(80);
  const myState = await treeState(page);
  await tree(page).getByRole('button', { name: '프로젝트', exact: true }).click();
  expect(await treeState(page)).toEqual(projectState);
  for (const [direction, product] of [['back', 'word'], ['back', 'note'], ['forward', 'word'], ['forward', 'slides']] as const) {
    if (direction === 'back') await page.goBack(); else await page.goForward();
    await active(page, product, fixture.ids[product]);
    expect(await treeState(page)).toEqual(projectState);
    expect(await snapshots(page, fixture)).toEqual(saved);
    expect(await nativeTree!.evaluate(element => element.isConnected)).toBe(true);
  }
  await tree(page).getByRole('button', { name: '내 파일', exact: true }).click();
  expect(await treeState(page)).toEqual(myState);
  frame = await open(page, 'word', fixture.ids.word);
  await frame.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    const state = window as typeof window & { __historyNativeWrites?: number };
    state.__historyNativeWrites = 0;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction.db.name === 'barocss-word' && this.name === 'documents') state.__historyNativeWrites!++;
      return put.apply(this, args as Parameters<typeof put>);
    };
  });
  const before = await wordState(frame), url = page.url(), iframe = await page.locator('iframe[data-local-native-frame="active"]').elementHandle();
  await tree(page).locator(`[data-original="word:${fixture.ids.word}"]`).click();
  expect(page.url()).toBe(url); expect(await wordState(frame)).toEqual(before);
  expect(await iframe!.evaluate(element => element.isConnected)).toBe(true);
  expect(await frame.evaluate(() => (window as typeof window & { __historyNativeWrites?: number }).__historyNativeWrites)).toBe(0);
  expect(await snapshots(page, fixture)).toEqual(saved);
});

test('refused Back restores the source history entry and preserves unsaved native input until explicit retry', async ({ page }) => {
  const fixture = await seed(page);
  await page.goto(`/${fixture.workspace}/${fixture.ids.slides}`);
  await active(page, 'slides', fixture.ids.slides);
  const frame = await open(page, 'word', fixture.ids.word), original = await snapshots(page, fixture);
  await frame.evaluate(() => {
    const timeout = window.setTimeout;
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
      timeout(handler, delay === 300 ? 3_600_000 : delay, ...args)) as typeof window.setTimeout;
    const put = IDBObjectStore.prototype.put;
    const state = window as typeof window & { __historyFailedWrites?: number; __historyRestoreWrites?: () => void };
    state.__historyFailedWrites = 0;
    state.__historyRestoreWrites = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction.db.name === 'barocss-word' && this.name === 'documents') {
        state.__historyFailedWrites!++; throw new DOMException('Controlled history save failure', 'QuotaExceededError');
      }
      return put.apply(this, args as Parameters<typeof put>);
    };
  });
  const paragraph = frame.locator('.w-paragraph').last();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' REFUSED HISTORY INPUT');
  await expect(paragraph).toContainText('REFUSED HISTORY INPUT');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async () => (await wordState(frame)).selection).toMatchObject({ collapsed: false });
  const before = await wordState(frame), url = page.url(), node = await paragraph.elementHandle();
  await page.goBack();
  await expect(page.getByRole('alert').filter({ hasText: /저장|입력/ }).first()).toBeVisible();
  await expect(page).toHaveURL(url); await active(page, 'word', fixture.ids.word);
  expect(await wordState(frame)).toEqual(before); expect(await snapshots(page, fixture)).toEqual(original);
  expect(await node!.evaluate(element => element.isConnected)).toBe(true);
  expect(await frame.evaluate(() => (window as typeof window & { __historyFailedWrites?: number }).__historyFailedWrites)).toBe(1);
  await frame.evaluate(() => (window as typeof window & { __historyRestoreWrites?: () => void }).__historyRestoreWrites!());
  await page.goBack(); await active(page, 'slides', fixture.ids.slides);
  const saved = await snapshots(page, fixture); expect(saved[1].text).toContain('REFUSED HISTORY INPUT');
  await page.goForward(); const reopened = await active(page, 'word', fixture.ids.word);
  await expect(reopened.locator('.w-paragraph').last()).toContainText('REFUSED HISTORY INPUT');
  expect(await snapshots(page, fixture)).toEqual(saved);
});

test('Forward retires a held Back target without replacing the current source or committing stale code', async ({ page }) => {
  const fixture = await seed(page);
  await page.goto(`/${fixture.workspace}/${fixture.ids.note}`); await active(page, 'note', fixture.ids.note);
  await open(page, 'word', fixture.ids.word);
  const frame = await open(page, 'slides', fixture.ids.slides), before = await wordState(frame), saved = await snapshots(page, fixture);
  const source = await page.locator('iframe[data-local-native-frame="active"]').elementHandle();
  let held = false, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/apps/word/src/main.tsx*', async route => { held = true; await gate; await route.continue().catch(() => {}); });
  try {
    await page.goBack();
    await expect.poll(() => held).toBe(true);
    await expect(page.locator('iframe[data-local-native-frame="staged"]')).toHaveCount(1);
    await page.goForward(); await active(page, 'slides', fixture.ids.slides);
    expect(await source!.evaluate(element => element.isConnected)).toBe(true);
    expect(await wordState(frame)).toEqual(before); expect(await snapshots(page, fixture)).toEqual(saved);
  } finally { release(); await page.unroute('**/apps/word/src/main.tsx*'); }
  await open(page, 'note', fixture.ids.note);
  await active(page, 'note', fixture.ids.note);
  expect(await snapshots(page, fixture)).toEqual(saved);
});

test('a direct reload retains the managed Back and Forward destinations', async ({ page }) => {
  const fixture = await seed(page);
  await page.goto(`/${fixture.workspace}/${fixture.ids.note}`); await active(page, 'note', fixture.ids.note);
  await open(page, 'word', fixture.ids.word); await open(page, 'slides', fixture.ids.slides);
  const saved = await snapshots(page, fixture);
  await page.reload(); await active(page, 'slides', fixture.ids.slides);
  await page.goBack(); await active(page, 'word', fixture.ids.word);
  await page.goBack(); await active(page, 'note', fixture.ids.note);
  await page.goForward(); await active(page, 'word', fixture.ids.word);
  await page.goForward(); await active(page, 'slides', fixture.ids.slides);
  expect(await snapshots(page, fixture)).toEqual(saved);
});

test('a legitimate native identity change during held Back preserves its newest input and the original destination entry', async ({ page }) => {
  const fixture = await seed(page);
  const replacement = await page.evaluate(async ({ module, workspace }) => {
    const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
    return new OfficeWorkspace(workspace).create('word', 'History replacement');
  }, { module: workspaceModule, workspace: fixture.workspace });
  await page.goto(`/${fixture.workspace}/${fixture.ids.slides}`); await active(page, 'slides', fixture.ids.slides);
  const frame = await open(page, 'word', fixture.ids.word), source = await page.locator('iframe[data-local-native-frame="active"]').elementHandle();
  await page.evaluate(async ({ module, replacement }) => {
    const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
    const require = OfficeWorkspace.prototype.require;
    let targetReads = 0;
    const state = window as typeof window & { __releaseHistoryRead?: () => void; __releaseIdentityRead?: () => void };
    OfficeWorkspace.prototype.require = async function (...args) {
      const value = await require.apply(this, args);
      if (args[0] === 'slides' && document.querySelector('iframe[data-local-native-frame="staged"]') && ++targetReads === 2)
        await new Promise<void>(resolve => { state.__releaseHistoryRead = resolve; });
      if (args[0] === 'word' && args[1] === replacement) {
        OfficeWorkspace.prototype.require = require;
        await new Promise<void>(resolve => { state.__releaseIdentityRead = resolve; });
      }
      return value;
    };
  }, { module: workspaceModule, replacement });
  await page.goBack();
  await expect.poll(() => page.evaluate(() => typeof (window as typeof window & { __releaseHistoryRead?: () => void }).__releaseHistoryRead)).toBe('function');
  await frame.getByRole('menubar', { name: '문서 메뉴', exact: true }).getByRole('menuitem').click();
  await frame.getByRole('menuitem', { name: '문서 보관함', exact: true }).click();
  await frame.getByRole('dialog', { name: '문서 보관함', exact: true }).getByRole('button', { name: 'History replacement 열기', exact: true }).click();
  await expect(frame.getByRole('textbox', { name: '문서 제목', exact: true })).toHaveValue('History replacement');
  // The source's first preparation has completed. Hold its genuine fresh original
  // read so the final boundary must deliver input typed during this await.
  await expect.poll(() => page.evaluate(() => typeof (window as typeof window & { __releaseIdentityRead?: () => void }).__releaseIdentityRead)).toBe('function');
  const paragraph = frame.locator('.w-paragraph').last();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' NEWEST NATIVE HISTORY INPUT');
  await expect(paragraph).toContainText('NEWEST NATIVE HISTORY INPUT');
  await page.evaluate(() => (window as typeof window & { __releaseIdentityRead?: () => void }).__releaseIdentityRead!());
  await active(page, 'word', replacement);
  expect(await source!.evaluate(element => element.isConnected)).toBe(true);
  await page.evaluate(() => (window as typeof window & { __releaseHistoryRead?: () => void }).__releaseHistoryRead!());
  await page.goBack(); await active(page, 'slides', fixture.ids.slides);
  const saved = await page.evaluate(async ({ module, workspace, replacement }) => {
    const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
    return new OfficeWorkspace(workspace).require('word', replacement);
  }, { module: workspaceModule, workspace: fixture.workspace, replacement });
  expect(saved.text).toContain('NEWEST NATIVE HISTORY INPUT');
  await page.goForward(); const newest = await active(page, 'word', replacement);
  await expect(newest.locator('.w-paragraph').last()).toContainText('NEWEST NATIVE HISTORY INPUT');
  await open(page, 'note', fixture.ids.note);
  expect(await page.evaluate(async ({ module, workspace, replacement }) => {
    const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
    return new OfficeWorkspace(workspace).require('word', replacement);
  }, { module: workspaceModule, workspace: fixture.workspace, replacement })).toEqual(saved);
});
