import { expect, test, type Frame, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import type { INode } from '../../../packages/datastore/src/types';
import { createSampleDocument } from '../../../packages/office-word/src/sample-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';
import { getWordSchemaDefinition } from '../../../packages/office-word/src/word-schema';
import { createSchema, validateTree } from '../../../packages/schema/src/index';
import { nativeEditor, nativeFrame } from './helpers/native-editor';
import { openLocalLibrary } from './helpers/local-library';

const workspaceModule = `/@fs${fileURLToPath(new URL('../../../packages/office-workspace/src/index.ts', import.meta.url))}`;
const tree = (page: Page) => page.locator('.ow-file-navigation');
const files = (page: Page) => tree(page).getByRole('navigation', { name: '파일', exact: true });
const targetTitle = 'Tree shared original';
const targetParagraph = 'Tree shared native body';
const paragraph = (page: Page) => nativeEditor(page).locator('.w-paragraph').filter({ hasText: targetParagraph }).first();
function nativeFixture() {
  const document = createSampleDocument();
  const child = (node: INode, stype: string) => node.content!.find((value): value is INode => typeof value !== 'string' && value.stype === stype)!;
  child(child(document, 'docMeta'), 'docTitle').content = [{ stype: 'inline-text', text: targetTitle }];
  child(document, 'surface').content!.unshift({ stype: 'paragraph', attributes: { styleId: 'Body' }, content: [{ stype: 'inline-text', text: targetParagraph, marks: [{ stype: 'bold', range: [0, 4] }] }] });
  document.metadata = { originalOwner: 'synthetic-tree-state', retained: { purpose: 'full rich original with native references and resources' } };
  expect(validateTree(createSchema('tree-state-fixture', getWordSchemaDefinition()), document)).toEqual([]);
  return wordFileText(document, '');
}
const alias = (page: Page) => tree(page).getByRole('button', { name: `${targetTitle} 열기`, exact: true });

async function seed(page: Page) {
  await page.goto('/'); await openLocalLibrary(page);
  const fixture = await page.evaluate(async ({ module, text }) => {
    const { OfficeWorkspace, workspaceIdentity, productStore } = await import(module) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    const id = await workspace.create('word', 'Tree shared original');
    const previous = await workspace.require('word', id);
    await productStore('word').keep({ ...previous.row, title: 'Tree shared original' }, text, { expectedRevision: previous.row.revision ?? 0 });
    await workspace.update(`word:${id}`, { folder: 'Original folder' });
    for (let i = 0; i < 24; i++) {
      const number = String(i).padStart(2, '0');
      const otherWord = await workspace.create('word', `Tree shared Word ${number}`);
      const otherNote = await workspace.create('note', `Tree shared Note ${number}`);
      for (const [product, original] of [['word', otherWord], ['note', otherNote]] as const) {
        await workspace.update(`${product}:${original}`, { folder: `Folder ${number}` });
      }
      const project = await workspace.createProject(`Tree project ${number}`, 'Synthetic local tree state');
      project.record.results.push({ id: crypto.randomUUID(), name: 'Word result', document: { product: 'word', id: otherWord }, inputs: [] });
      if (i < 2) project.record.results.push({ id: crypto.randomUUID(), name: 'Shared original result', document: { product: 'word', id }, inputs: [] });
      await workspace.saveProject(project.record, project.revision);
    }
    return { id, workspace: workspace.id };
  }, { module: workspaceModule, text: nativeFixture() });
  await page.reload();
  await expect(tree(page).getByRole('button', { name: 'Tree project 00', exact: true })).toBeVisible();
  await expect(alias(page)).toHaveCount(2);
  await alias(page).first().click();
  await expect(paragraph(page)).toBeVisible();
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  return fixture;
}

async function snapshot(page: Page, id: string) {
  return page.evaluate(async ({ module, id }) => {
    const { productStore } = await import(module) as typeof import('@barocss/office-workspace');
    return productStore('word').read(id);
  }, { module: workspaceModule, id });
}
async function allOriginals(page: Page) {
  return page.evaluate(async module => {
    const { productStore } = await import(module) as typeof import('@barocss/office-workspace');
    return { word: await productStore('word').snapshots(), note: await productStore('note').snapshots() };
  }, workspaceModule);
}
interface NativeWord { exportDocument(): INode; getHistoryStats(): unknown; }
async function nativeState(frame: Frame) {
  return frame.evaluate(() => {
    const editor = (window as typeof window & { editor: NativeWord }).editor;
    return { document: editor.exportDocument(), history: editor.getHistoryStats() };
  });
}
// Word's loader refreshes metadata.loadedAt in the raw debug tree. The stored
// canonical file is compared byte for byte; every other rendered field stays exact.
function renderedContent(node: INode, original?: INode): INode {
  const metadata = node.metadata && { ...node.metadata };
  if (metadata && !Object.hasOwn(original?.metadata ?? {}, 'loadedAt')) delete metadata.loadedAt;
  return {
    ...node,
    ...(metadata ? { metadata } : {}),
    ...(node.content ? { content: node.content.map((child, index) => { const old = original?.content?.[index]; return typeof child === 'string' ? child : renderedContent(child, typeof old === 'string' ? undefined : old); }) } : {}),
  };
}
async function scrollTree(page: Page, delta: number) {
  const nav = files(page);
  await nav.hover(); await page.mouse.wheel(0, delta);
  await expect.poll(() => nav.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  return nav.evaluate(element => element.scrollTop);
}
async function expectView(page: Page, query: string, product: string, group: string, scroll: number) {
  await expect(tree(page).getByRole('textbox', { name: '파일 검색', exact: true })).toHaveValue(query);
  await expect(tree(page).getByRole('combobox', { name: '파일 제품 필터', exact: true })).toHaveValue(product);
  await expect(tree(page).getByRole('button', { name: group, exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => files(page).evaluate(element => element.scrollTop)).toBe(scroll);
}

// Project/My are local catalog projections. They do not establish account ownership or ACL.
test('local Project and My independently restore query, product, collapsed groups and actual scroll after roundtrip and reopen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await seed(page);
  const frame = await nativeFrame(page), nativeNode = await paragraph(page).elementHandle();
  const source = await nativeState(frame), original = await snapshot(page, fixture.id), url = page.url();
  const query = tree(page).getByRole('textbox', { name: '파일 검색', exact: true });
  const product = tree(page).getByRole('combobox', { name: '파일 제품 필터', exact: true });
  await query.fill('shared'); await product.selectOption('word');
  await tree(page).getByRole('button', { name: 'Tree project 01', exact: true }).click();
  const projectScroll = await scrollTree(page, 420);
  await tree(page).getByRole('button', { name: '내 파일', exact: true }).click();
  await query.fill('Tree'); await product.selectOption('all');
  await tree(page).getByRole('button', { name: 'Folder 00', exact: true }).click();
  const myScroll = await scrollTree(page, 260);
  expect(myScroll).not.toBe(projectScroll);
  for (let i = 0; i < 2; i++) {
    await tree(page).getByRole('button', { name: '프로젝트', exact: true }).click();
    await expectView(page, 'shared', 'word', 'Tree project 01', projectScroll);
    await tree(page).getByRole('button', { name: '내 파일', exact: true }).click();
    await expectView(page, 'Tree', 'all', 'Folder 00', myScroll);
  }
  expect(page.url()).toBe(url); expect(await nativeFrame(page)).toBe(frame);
  expect(await nativeNode!.evaluate(element => element.isConnected)).toBe(true);
  expect(await nativeState(frame)).toStrictEqual(source);
  expect(await snapshot(page, fixture.id)).toStrictEqual(original);
  await page.reload();
  await expect(paragraph(page)).toBeVisible();
  await expect(tree(page).getByRole('button', { name: '내 파일', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expectView(page, 'Tree', 'all', 'Folder 00', myScroll);
  await tree(page).getByRole('button', { name: '프로젝트', exact: true }).click();
  await expectView(page, 'shared', 'word', 'Tree project 01', projectScroll);
  expect(page.url()).toBe(url);
  const canonicalOriginal = JSON.parse(original!.text).document as INode;
  expect(renderedContent((await nativeState(await nativeFrame(page))).document, canonicalOriginal)).toStrictEqual(renderedContent(source.document, canonicalOriginal));
  expect((await snapshot(page, fixture.id))!.text).toBe(original!.text);
});

function installWriteCounter() {
  const state = window as typeof window & { __treeWrites?: { counts: Record<string, number>; restore(): void } };
  const counts: Record<string, number> = { put: 0, add: 0, delete: 0, clear: 0 };
  const methods = ['put', 'add', 'delete', 'clear'] as const;
  const descriptors = methods.map(name => [name, Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, name)!] as const);
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(IDBObjectStore.prototype, name, { ...descriptor, value: function (this: IDBObjectStore, ...args: unknown[]) {
      if (this.transaction.db.name.startsWith('barocss-word') || this.transaction.db.name.startsWith('barocss-note')) counts[name]++;
      return Reflect.apply(descriptor.value, this, args);
    } });
  }
  state.__treeWrites = { counts, restore() {
    for (const [name, descriptor] of descriptors) Object.defineProperty(IDBObjectStore.prototype, name, descriptor);
    delete state.__treeWrites;
  } };
}
const readWrites = () => (window as typeof window & { __treeWrites: { counts: Record<string, number> } }).__treeWrites.counts;
const restoreWrites = () => (window as typeof window & { __treeWrites: { restore(): void } }).__treeWrites.restore();

test('actual local Project and My aliases retain the same native original and UndoRedo without native stored writes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await seed(page);
  const editor = nativeEditor(page), input = paragraph(page);
  const frame = await nativeFrame(page), node = await input.elementHandle();
  const beforeInput = await nativeState(frame);
  await input.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' Local alias history proof');
  await expect(input).toContainText('Local alias history proof');
  await expect.poll(async () => (await snapshot(page, fixture.id))!.text).toContain('Local alias history proof');
  await expect(editor.locator('[data-word-save-status]')).toHaveText('저장됨');
  const current = await nativeState(frame), originals = await allOriginals(page), stored = await snapshot(page, fixture.id), url = page.url();
  expect(current.document).not.toStrictEqual(beforeInput.document);
  await page.evaluate(installWriteCounter); await frame.evaluate(installWriteCounter);
  try {
    await alias(page).last().click();
    await tree(page).getByRole('button', { name: '내 파일', exact: true }).click();
    await expect(alias(page)).toHaveCount(1); await alias(page).click();
    await tree(page).getByRole('button', { name: '프로젝트', exact: true }).click();
    await expect(alias(page)).toHaveCount(2); await alias(page).first().click();
    expect(page.url()).toBe(url); expect(await nativeFrame(page)).toBe(frame);
    expect(await node!.evaluate(element => element.isConnected)).toBe(true);
    expect(await nativeState(frame)).toStrictEqual(current);
    expect(await snapshot(page, fixture.id)).toStrictEqual(stored);
    expect(await allOriginals(page)).toStrictEqual(originals);
    expect(await page.evaluate(readWrites)).toEqual({ put: 0, add: 0, delete: 0, clear: 0 });
    expect(await frame.evaluate(readWrites)).toEqual({ put: 0, add: 0, delete: 0, clear: 0 });
    // A real persisted Undo is the positive control for the same Window's write spy.
    await input.click(); await page.keyboard.press('Meta+z');
    await expect(input).not.toContainText('Local alias history proof');
    expect((await nativeState(frame)).document).toStrictEqual(beforeInput.document);
    await expect.poll(async () => (await snapshot(page, fixture.id))!.text).not.toContain('Local alias history proof');
    expect((await frame.evaluate(readWrites)).put).toBeGreaterThan(0);
    await page.keyboard.press('Meta+Shift+z');
    await expect(input).toContainText('Local alias history proof');
    expect((await nativeState(frame)).document).toStrictEqual(current.document);
    await expect.poll(async () => (await snapshot(page, fixture.id))!.text).toBe(stored!.text);
  } finally { await frame.evaluate(restoreWrites); await page.evaluate(restoreWrites); }
});
