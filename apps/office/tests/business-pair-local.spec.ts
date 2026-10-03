import { expect, test, type Page } from '@playwright/test';
import type { INode } from '../../../packages/datastore/src/types';
import type { BusinessPairPayload } from '../../../packages/office-word/src/business-pair';
import { createSampleDocument } from '../../../packages/office-word/src/sample-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';
import { openLocalLibrary } from './helpers/local-library';

const sourceRoot = process.env.BUSINESS_PAIR_WORKSPACE_ROOT;
const requirementText = 'Fictional requirement: retain the complete rich native evidence.';
const decisionText = 'Fictional decision: retain an exact pinned original before making changes.';
const title = 'Fictional local business pair';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
interface Snapshot { row: { name: string; title?: string; revision?: number }; text: string }
test.beforeAll(() => { if (!sourceRoot) throw new Error('BUSINESS_PAIR_WORKSPACE_ROOT must identify the served candidate source.'); });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

function paragraph(document: INode, text: string): INode {
  const found: INode[] = [];
  const walk = (node: INode) => {
    if (node.stype === 'paragraph' && node.content?.some(child => typeof child !== 'string' && child.text === text)) found.push(node);
    node.content?.forEach(child => { if (typeof child !== 'string') walk(child); });
  };
  walk(document); expect(found).toHaveLength(1); return found[0];
}
function fixture(name: string): INode {
  const document = createSampleDocument();
  const surface = document.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'surface')!;
  const resources = document.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'resources')!;
  const docMeta = document.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'docMeta')!;
  const docTitle = docMeta.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'docTitle')!;
  docTitle.content = [{ stype: 'inline-text', text: name }];
  resources.content!.push({ stype: 'styleDef', attributes: { id: 'BusinessEvidence', name: 'Business evidence', type: 'paragraph', basedOn: 'Body', fontSize: 31 } });
  surface.content = [
    { stype: 'paragraph', attributes: { styleId: 'BusinessEvidence' }, content: [{ stype: 'inline-text', text: requirementText, marks: [{ stype: 'bold', range: [0, requirementText.length] }] }] },
    { stype: 'paragraph', attributes: { styleId: 'BusinessEvidence' }, content: [{ stype: 'inline-text', text: decisionText }] }
  ];
  document.content = [docMeta, resources, surface];
  document.metadata = { originalOwner: 'fictional-local-pair', loadedAt: 'declared-original-native-loadedAt', retained: { purpose: 'complete resource-backed evidence' } };
  return document;
}
async function snapshots(page: Page): Promise<Snapshot[]> {
  return page.evaluate(async root => {
    const { productStore } = await import(`/@fs${root}/packages/office-workspace/src/index.ts`);
    return productStore('word').snapshots();
  }, sourceRoot!) as Promise<Snapshot[]>;
}
async function read(page: Page, id: string) {
  const rows = await snapshots(page); const snapshot = rows.find(row => row.row.name === id);
  expect(snapshot).toBeDefined(); return snapshot!;
}
async function seed(page: Page, document: INode, name: string) {
  await page.goto('/'); await openLocalLibrary(page);
  const text = wordFileText(document, '');
  const id = await page.evaluate(async ({ root, text, name }) => {
    const { OfficeWorkspace, workspaceIdentity, productStore } = await import(`/@fs${root}/packages/office-workspace/src/index.ts`);
    const workspace = new OfficeWorkspace(workspaceIdentity()); const id = await workspace.create('word', name);
    const previous = await workspace.require('word', id);
    await productStore('word').keep({ ...previous.row, title: name }, text, { expectedRevision: previous.row.revision ?? 0 });
    return id;
  }, { root: sourceRoot!, text, name }) as string;
  await page.reload(); await openLocalLibrary(page);
  await expect(page.locator('[data-document]')).toHaveCount(1);
  return { id, text };
}
async function home(page: Page) {
  await page.locator('.office-product-menu [data-menu]').click();
  await page.getByRole('menuitem', { name: '자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: '전체 자료', exact: true })).toBeVisible();
}
async function open(page: Page, name: string) {
  await page.getByRole('button', { name: `W ${name}`, exact: true }).click();
  await expect(page.locator('.w-paragraph').filter({ hasText: requirementText })).toBeVisible({ timeout: 30_000 });
}
async function caret(page: Page, text: string) {
  const node = page.locator('.w-paragraph').filter({ hasText: text }).first();
  await node.scrollIntoViewIfNeeded();
  const bounds = await node.boundingBox(); expect(bounds).not.toBeNull();
  await node.click({ position: { x: 8, y: Math.min(10, bounds!.height / 2) } });
  await page.keyboard.press('Home');
}
async function backup(page: Page) {
  return page.evaluate(async root => {
    const { OfficeWorkspace, workspaceIdentity } = await import(`/@fs${root}/packages/office-workspace/src/index.ts`);
    return JSON.stringify(await new OfficeWorkspace(workspaceIdentity()).backup());
  }, sourceRoot!) as Promise<string>;
}
async function restore(page: Page, bytes: string) {
  await page.getByRole('button', { name: '백업 및 가져오기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '백업 및 가져오기', exact: true });
  await dialog.getByLabel('백업 또는 제품 JSON 파일', { exact: true }).setInputFiles({ name: 'fictional-pair-backup.json', mimeType: 'application/json', buffer: Buffer.from(bytes) });
  await dialog.getByRole('button', { name: '새 사본으로 복원', exact: true }).click();
  return dialog;
}
function renamed(document: INode, name: string): INode {
  const result = structuredClone(document);
  const walk = (node: INode) => {
    if (node.stype === 'docTitle') node.content = [{ stype: 'inline-text', text: name }];
    node.content?.forEach(child => { if (typeof child !== 'string') walk(child); });
  };
  walk(result); return result;
}
function assertDerived(original: INode, copied: INode, name: string): string[] {
  const source = original.metadata!.wonfficeBusinessPair as BusinessPairPayload;
  const pair = copied.metadata!.wonfficeBusinessPair as BusinessPairPayload;
  expect(pair.items).toHaveLength(2);
  const ids = pair.items.map(item => item.id);
  ids.forEach(id => expect(id).toMatch(uuid)); expect(ids[0]).not.toBe(ids[1]);
  const expectedPair = structuredClone(source);
  expectedPair.items.forEach((item, index) => {
    expect(ids[index]).not.toBe(item.id);
    item.derivedFrom = { itemId: item.id, version: item.currentVersion }; item.id = ids[index];
  });
  expectedPair.relations[0].source.itemId = ids[0]; expectedPair.relations[0].target.itemId = ids[1];
  const expected = renamed(original, name); expected.metadata!.wonfficeBusinessPair = expectedPair;
  expect(copied).toStrictEqual(expected);
  return ids;
}

test('actual local Word authors the rich pair then copy, restore, move and reopen preserve exact evidence', async ({ page }, info) => {
  test.setTimeout(150_000);
  const native = fixture(title); const seeded = await seed(page, native, title);
  await open(page, title); await page.getByRole('button', { name: '요구·결정', exact: true }).click();
  const panel = page.locator('.w-business-pair'); await expect(panel).toContainText('승인 여부는 미확인');
  await caret(page, requirementText); await panel.getByRole('button', { name: '요구사항 문단 지정', exact: true }).click();
  await expect(panel).toContainText('요구사항 지정됨');
  await caret(page, decisionText); await panel.getByRole('button', { name: '결정 문단 지정', exact: true }).click();
  await expect(panel).toContainText('결정 지정됨');
  await expect.poll(async () => {
    const stored = JSON.parse((await read(page, seeded.id)).text).document as INode;
    return [requirementText, decisionText].map(text => paragraph(stored, text).content!.filter(node => typeof node !== 'string' && node.stype === 'bookmarkAnchor').length);
  }).toEqual([1, 1]);
  const anchors = JSON.parse((await read(page, seeded.id)).text).document as INode;
  const expectedAnchors = structuredClone(native); const bookmarks: string[] = [];
  for (const text of [requirementText, decisionText]) {
    const anchor = paragraph(anchors, text).content![0] as INode;
    expect(anchor.stype).toBe('bookmarkAnchor'); expect(anchor.attributes?.id).toMatch(/^business_[0-9a-f-]{36}$/);
    bookmarks.push(anchor.attributes!.id as string);
    paragraph(expectedAnchors, text).content!.unshift({ stype: 'bookmarkAnchor', attributes: { id: anchor.attributes!.id } });
  }
  expect(bookmarks[0]).not.toBe(bookmarks[1]); expect(anchors).toStrictEqual(expectedAnchors);
  await panel.getByRole('button', { name: '항목과 관계 작성', exact: true }).click();
  await expect(panel).toContainText('supported_by');
  await expect.poll(async () => !!JSON.parse((await read(page, seeded.id)).text).document.metadata?.wonfficeBusinessPair).toBe(true);
  const original = await read(page, seeded.id); const authored = JSON.parse(original.text).document as INode;
  const pair = authored.metadata!.wonfficeBusinessPair as BusinessPairPayload;
  const pin = wordFileText(expectedAnchors, '');
  expect(pair.items).toHaveLength(2);
  pair.items.forEach(item => expect(item.id).toMatch(uuid)); expect(pair.items[0].id).not.toBe(pair.items[1].id);
  const expectedPair: BusinessPairPayload = { schemaVersion: 1,
    items: (['requirement', 'decision'] as const).map((kind, index) => ({ id: pair.items[index].id, kind, currentVersion: 1,
      locator: { kind: 'point-bookmark', bookmarkId: bookmarks[index] }, versions: [{ version: 1, snapshotText: pin }] })),
    relations: [{ kind: 'supported_by', source: { itemId: pair.items[0].id, version: 1 }, target: { itemId: pair.items[1].id, version: 1 } }] };
  const expected = structuredClone(expectedAnchors); expected.metadata!.wonfficeBusinessPair = expectedPair;
  expect(authored).toStrictEqual(expected); await page.screenshot({ path: info.outputPath('local-authored-pair.png'), animations: 'disabled' });
  await home(page); const archive = await backup(page);
  await page.getByRole('button', { name: `${title} 관리`, exact: true }).click();
  await page.getByRole('button', { name: '독립 사본 만들기', exact: true }).click();
  await expect(page.locator('[data-document]')).toHaveCount(2);
  const copied = (await snapshots(page)).find(row => row.row.name !== seeded.id)!;
  const copyIds = assertDerived(authored, JSON.parse(copied.text).document, `${title} 사본`);
  expect(await read(page, seeded.id)).toStrictEqual(original);
  await restore(page, archive); await expect(page.locator('[data-document]')).toHaveCount(3);
  const restored = (await snapshots(page)).find(row => ![seeded.id, copied.row.name].includes(row.row.name))!;
  const restoreIds = assertDerived(authored, JSON.parse(restored.text).document, `${title} (복원)`);
  restoreIds.forEach(id => expect(copyIds).not.toContain(id)); expect(await read(page, seeded.id)).toStrictEqual(original);
  await page.getByRole('button', { name: `${title} 관리`, exact: true }).click();
  await page.getByRole('textbox', { name: '자료 폴더', exact: true }).fill('Fictional evidence');
  await page.getByRole('button', { name: '변경 저장', exact: true }).click();
  expect(await read(page, seeded.id)).toStrictEqual(original);
  await open(page, title); await page.getByRole('button', { name: '요구·결정', exact: true }).click();
  await expect(page.locator('.w-business-pair')).toContainText(pair.items[0].id);
  await page.reload(); await expect(page.locator('.w-paragraph').filter({ hasText: requirementText })).toBeVisible({ timeout: 30_000 });
  await home(page); expect(await read(page, seeded.id)).toStrictEqual(original);
  await open(page, `${title} 사본`); await page.getByRole('button', { name: '요구·결정', exact: true }).click();
  await expect(page.locator('.w-business-pair')).toContainText(copyIds[0]); await home(page);
  expect(await read(page, seeded.id)).toStrictEqual(original);
  await info.attach('local-native-original-and-derived', { body: JSON.stringify({ original, copied, restored }), contentType: 'application/json' });
});

test('invalid authored metadata refuses actual local copy and restore without changing stored originals', async ({ page }) => {
  const name = 'Fictional invalid pair'; const native = fixture(name);
  native.metadata!.wonfficeBusinessPair = { schemaVersion: 1, items: [], relations: [], approved: true, actor: 'fictional-admin' };
  const seeded = await seed(page, native, name); const before = await snapshots(page);
  await open(page, name); await page.getByRole('button', { name: '요구·결정', exact: true }).click();
  await expect(page.locator('.w-business-pair')).toContainText('항목을 읽을 수 없습니다.'); await home(page);
  expect((await read(page, seeded.id)).text).toBe(seeded.text);
  const archive = await backup(page);
  await page.getByRole('button', { name: `${name} 관리`, exact: true }).click();
  await page.getByRole('button', { name: '독립 사본 만들기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '자료 관리', exact: true }).getByRole('alert')).toBeVisible();
  expect(await snapshots(page)).toStrictEqual(before); await page.keyboard.press('Escape');
  const dialog = await restore(page, archive); await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(page.locator('[data-document]')).toHaveCount(1); expect(await snapshots(page)).toStrictEqual(before);
  await expect(dialog.getByText('fictional-pair-backup.json', { exact: true })).toBeVisible();
});

test('legacy native Word without business metadata still copies and restores complete rich content', async ({ page }) => {
  const name = 'Fictional legacy Word'; const native = fixture(name); const seeded = await seed(page, native, name);
  const original = await read(page, seeded.id); const archive = await backup(page);
  await page.getByRole('button', { name: `${name} 관리`, exact: true }).click();
  await page.getByRole('button', { name: '독립 사본 만들기', exact: true }).click(); await expect(page.locator('[data-document]')).toHaveCount(2);
  const copy = (await snapshots(page)).find(row => row.row.name !== seeded.id)!;
  expect(JSON.parse(copy.text).document).toStrictEqual(renamed(native, `${name} 사본`));
  await restore(page, archive); await expect(page.locator('[data-document]')).toHaveCount(3);
  const restored = (await snapshots(page)).find(row => ![seeded.id, copy.row.name].includes(row.row.name))!;
  expect(JSON.parse(restored.text).document).toStrictEqual(renamed(native, `${name} (복원)`));
  expect(await read(page, seeded.id)).toStrictEqual(original);
});
