import { expect, test, type Frame, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSampleDocument } from '../../../packages/office-word/src/sample-document';
import { createSampleDeck } from '../../../packages/office-slides/src/sample-deck';
import { NOTE_FILE_VERSION } from '../../../packages/office-note/src/note-file-codec';
import { WORD_FILE_VERSION } from '../../../packages/office-word/src/word-file';
import { DECK_FILE_VERSION } from '../../../packages/office-slides/src/deck-file';
import { SITE_FILE_VERSION } from '../../../packages/office-site/src/site-file';
import { representativeDocument } from '../../note/tests/document-centered.helpers';
import { siteNativeFixture, type SiteNativeNode } from './helpers/site-native-fixture';
import { nativeFrame } from './helpers/native-editor';
import { openLocalLibrary } from './helpers/local-library';

const products = ['note', 'word', 'slides', 'site'] as const;
type Product = typeof products[number];
type Tree = SiteNativeNode;
type NativeFile = { format: string; version: number; document: Tree };
const fileVersions: Record<Product, number> = { note: NOTE_FILE_VERSION, word: WORD_FILE_VERSION, slides: DECK_FILE_VERSION, site: SITE_FILE_VERSION };
const workspaceModule = `/@fs${fileURLToPath(new URL('../../../packages/office-workspace/src/index.ts', import.meta.url))}`;
const sharedModule = `/@fs${fileURLToPath(new URL('../../../packages/shared/src/index.ts', import.meta.url))}`;
const tree = (page: Page) => page.locator('.ow-file-navigation');
const library = (page: Page) => page.locator('.ow-library-embedded');
const title = (product: Product) => `Return proof ${product}`;
const folder = 'Populated native originals';
const seedText: Record<Product, string> = {
  note: 'Nested fictional context remains editable.', word: 'Native return editable Word paragraph.',
  slides: 'One engine, two products', site: 'Nested seed',
};
const firstInput = ' LOCAL ALIAS INPUT';
const lastInput = ' FINAL CATALOG INPUT';

function fixtures(): Record<Product, Tree> {
  const word = createSampleDocument() as Tree;
  const surface = word.content!.find(node => node.stype === 'surface')!;
  surface.content!.unshift({ stype: 'paragraph', attributes: { styleId: 'Body' }, content: [
    { stype: 'inline-text', text: seedText.word, marks: [] }
  ] });
  // Keep every sample resource, relationship, mark and attribute. The target
  // paragraph is additional fixture content, not a substitute for the sample.
  const originals = { note: representativeDocument() as Tree, word, slides: createSampleDeck() as Tree, site: siteNativeFixture(true) };
  for (const product of ['note', 'slides'] as const) {
    const matches: Tree[] = [];
    const visit = (node: Tree) => {
      if (node.stype === 'inline-text' && node.text === seedText[product]) matches.push(node);
      for (const child of node.content ?? []) visit(child);
    };
    visit(originals[product]); expect(matches).toHaveLength(1);
    expect(matches[0].marks).toBeUndefined();
    // The real insertion writer materializes empty marks. Seed that supported
    // author representation on this exact input run; leave all other runs intact.
    matches[0].marks = [];
  }
  return originals;
}

async function seed(page: Page) {
  await page.goto('/');
  await openLocalLibrary(page);
  return page.evaluate(async ({ module, originals, folder }) => {
    const { OfficeWorkspace, workspaceIdentity, productCodec, productStore, setDocumentTitle } =
      await import(module) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    const ids = {} as Record<Product, string>;
    const input = {} as Record<Product, string>;
    for (const product of ['note', 'word', 'slides', 'site'] as const) {
      ids[product] = product === 'note' ? String(originals.note.attributes!.pageId) : crypto.randomUUID();
      setDocumentTitle(product, originals[product], `Return proof ${product}`, ids[product]);
      const codec = await productCodec(product);
      input[product] = codec.text(originals[product] as never);
      await productStore(product).keep({ name: ids[product], title: `Return proof ${product}` }, input[product], { expectedRevision: null });
      await workspace.update(`${product}:${ids[product]}`, { folder });
    }
    for (const name of ['Delivery project', 'Review project']) {
      const project = await workspace.createProject(name, 'Reuse the same populated originals');
      for (const product of ['note', 'word', 'slides', 'site'] as const) project.record.results.push({
        id: crypto.randomUUID(), name: `Return proof ${product}`, document: { product, id: ids[product] }, inputs: []
      });
      await workspace.saveProject(project.record, project.revision);
    }
    return { workspace: workspace.id, ids, input };
  }, { module: workspaceModule, originals: fixtures(), folder });
}
type Fixture = Awaited<ReturnType<typeof seed>>;

async function originals(page: Page, fixture: Fixture) {
  return page.evaluate(async ({ module, ids }) => {
    const { productStore } = await import(module) as typeof import('@barocss/office-workspace');
    const result = {} as Record<Product, { text: string; name: string }>;
    for (const product of ['note', 'word', 'slides', 'site'] as const) {
      const saved = await productStore(product).read(ids[product]);
      if (!saved) throw new Error(`Missing ${product} original`);
      result[product] = { text: saved.text, name: saved.row.name };
      if ((await productStore(product).rows()).length !== 1) throw new Error(`Unexpected ${product} copy`);
    }
    return result;
  }, { module: workspaceModule, ids: fixture.ids });
}

async function active(page: Page, product: Product, id: string) {
  // Catalog opens perform a real parent navigation. Observe the installed
  // native frame in the new document before evaluating its parent owner.
  await expect(page.locator('iframe[data-local-native-frame="active"]')).toBeVisible();
  const frame = await nativeFrame(page);
  await expect(frame.locator('.office-editor-header')).toBeVisible();
  await expect.poll(() => page.evaluate(async ({ module, product, id }) => {
    const { captureProductNavigation } = await import(module) as typeof import('@barocss/shared');
    const owner = captureProductNavigation();
    return !!owner?.isCurrent() && owner.product === product && owner.id === id;
  }, { module: sharedModule, product, id })).toBe(true);
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  await expect(frame.locator('.office-editor-header')).toHaveCount(1);
  await expect(page.locator('iframe[data-local-native-frame="active"]')).not.toHaveAttribute('inert', '');
  return frame;
}
async function catalogOpen(page: Page, product: Product, id: string) {
  const row = library(page).locator(`[data-document="${product}:${id}"]`);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: `${product === 'note' ? 'Note' : product === 'word' ? 'Word' : product === 'slides' ? 'Slides' : 'Site'} ${title(product)}`, exact: true }).click();
  return active(page, product, id);
}
async function filterCatalog(page: Page, product: Product) {
  await library(page).locator('.ow-filters').getByRole('button', { name: product === 'note' ? 'Note' : product === 'word' ? 'Word' : product === 'slides' ? 'Slides' : 'Site', exact: true }).click();
  await library(page).getByRole('textbox', { name: '자료 검색', exact: true }).fill(title(product));
  await library(page).getByRole('combobox', { name: '폴더', exact: true }).selectOption(folder);
  await expect(library(page).locator('[data-document]')).toHaveCount(1);
}

async function nativeFile(page: Page, frame: Frame, product: Product): Promise<NativeFile> {
  // Use the actual public file producer. No runtime fields are omitted or
  // normalized. This complete mounted original is the UI lifetime baseline;
  // import-byte equivalence is a separate contract and is not claimed here.
  await frame.getByRole('menuitem', { name: product === 'note' ? '노트 메뉴' : '문서 메뉴', exact: true }).click();
  const download = page.waitForEvent('download');
  if (product === 'note') {
    await frame.getByRole('menuitem', { name: '내보내기', exact: true }).click();
    await frame.getByRole('combobox', { name: '내보내기 형식', exact: true }).selectOption('json');
    await frame.getByRole('button', { name: '파일 내려받기', exact: true }).click();
  } else await frame.getByRole('menuitem', { name: /^저장(?:\s|$)/ }).click();
  const path = await (await download).path();
  if (!path) throw new Error('Native download has no readable file');
  const file = JSON.parse(await readFile(path, 'utf8')) as NativeFile;
  expect(file.format).toBe(`barocss-${product}`); expect(file.version).toBe(fileVersions[product]);
  return file;
}

async function inputTarget(frame: Frame, product: Product): Promise<Locator> {
  if (product === 'note') return frame.locator('.on-doc .w-callout').first().locator('p').first();
  if (product === 'word') return frame.locator('.w-paragraph').filter({ hasText: seedText.word }).first();
  if (product === 'slides') return frame.locator('.sl-stage .w-paragraph').filter({ hasText: seedText.slides }).first();
  const admin = frame.locator('.st-admin');
  await expect.poll(async () => await admin.isVisible() || await frame.locator('[data-frame="desktop"]').isVisible()).toBe(true);
  const dataTab = admin.locator('[data-admin-tab="data"]');
  // Local Site can restore either the existing canvas or the Admin view.
  if (!await admin.isVisible()) {
    if (!await frame.locator('[data-to-admin]').isVisible()) {
      await frame.getByRole('menuitem', { name: '패널', exact: true }).click();
      await frame.getByRole('menuitemcheckbox', { name: '전체 도구', exact: true }).click();
    }
    await frame.locator('[data-to-admin]').click();
  }
  await expect(dataTab).toBeVisible(); await dataTab.click();
  await admin.locator('[data-admin-open="글"]').click();
  await frame.getByRole('button', { name: '1행 펼치기', exact: true }).click();
  const body = frame.locator('[data-row-form] [data-field="본문"] [data-note-body]');
  await expect(body).toBeVisible();
  await body.getByRole('button', { name: '행 1 열기', exact: true }).click();
  await frame.locator('[data-db-item-body]').last().getByRole('button', { name: '행 1 열기', exact: true }).click();
  await expect(frame.getByRole('dialog', { name: '데이터베이스 항목', exact: true })).toHaveCount(2);
  return frame.locator('[data-db-item-body]').last().locator('.on-doc > p');
}
async function append(page: Page, frame: Frame, paragraph: Locator, value: string, product: Product) {
  await expect(paragraph).toBeVisible();
  if (product === 'slides') {
    // The placement overlay selects the box. A real glyph double-click enters
    // its native text editor; the bounding box itself is not a caret witness.
    const point = await paragraph.evaluate(element => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) if (node.textContent?.length) {
        const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 1);
        const box = range.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }
      throw new Error('The title has no native glyph');
    });
    const origin = await (await frame.frameElement()).boundingBox();
    if (!origin) throw new Error('The active frame has no bounds');
    await page.mouse.dblclick(origin.x + point.x, origin.y + point.y);
  } else await paragraph.click();
  // Use real navigation keys over this short ASCII fixture. Home/End differ
  // by platform and a wrapped slide title can end before its last glyph.
  await expect.poll(() => paragraph.evaluate(element => !!getSelection()?.anchorNode && element.contains(getSelection()!.anchorNode))).toBe(true);
  if (!await paragraph.evaluate(() => getSelection()!.isCollapsed)) await page.keyboard.press('ArrowRight');
  const remaining = await paragraph.evaluate(element => {
    const selection = getSelection()!, rest = document.createRange();
    if (!selection.anchorNode || !element.contains(selection.anchorNode)) throw new Error('Caret left the native paragraph');
    rest.setStart(selection.anchorNode, selection.anchorOffset); rest.setEnd(element, element.childNodes.length);
    return rest.toString();
  });
  expect(remaining).toMatch(/^[\x20-\x7e]*$/); expect(remaining.length).toBeLessThan(150);
  for (let offset = 0; offset < remaining.length; offset++) await page.keyboard.press('ArrowRight');
  await expect.poll(() => paragraph.evaluate(element => {
    const selection = getSelection();
    if (!selection?.anchorNode || !element.contains(selection.anchorNode)) return false;
    const rest = document.createRange(); rest.setStart(selection.anchorNode, selection.anchorOffset);
    rest.setEnd(element, element.childNodes.length);
    return selection.isCollapsed && rest.toString() === '';
  })).toBe(true);
  await page.keyboard.insertText(value); await expect(paragraph).toContainText(value);
}
function edited(document: Tree, product: Product, suffix: string) {
  const expected = structuredClone(document), matches: Tree[] = [];
  const walk = (node: Tree) => {
    if (node.stype === 'inline-text' && node.text === seedText[product]) matches.push(node);
    for (const child of node.content ?? []) walk(child);
  };
  walk(expected); expect(matches).toHaveLength(1);
  matches[0].text += suffix;
  return expected;
}
async function liveState(frame: Frame, paragraph: Locator) {
  return { paragraph: await paragraph.evaluate(element => ({ text: element.textContent,
    ids: [element, ...element.querySelectorAll('[data-bc-sid]')].map(node => node.getAttribute('data-bc-sid')) })),
    native: await frame.evaluate(() => {
      const editor = (window as unknown as { editor?: { exportDocument(): unknown; getHistoryStats(): unknown } }).editor;
      return editor ? { document: editor.exportDocument(), history: editor.getHistoryStats() } : null;
    }) };
}

// Real local native inputs and IndexedDB persistence. No authenticated ownership,
// physical IME, mobile or whole-product alpha claim follows from these cases.
for (const product of products) test(`populated local ${product} Project/My aliases and catalog return preserve its complete edited original`, async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await seed(page);
  await page.reload(); await openLocalLibrary(page); await filterCatalog(page, product);
  const initialStored = await originals(page, fixture);
  let frame = await catalogOpen(page, product, fixture.ids[product]);
  const mounted = await nativeFile(page, frame, product);
  const paragraph = await inputTarget(frame, product);
  await append(page, frame, paragraph, firstInput, product);
  await expect.poll(async () => (await originals(page, fixture))[product].text).toContain(firstInput);
  const cleanOriginals = await originals(page, fixture);
  const node = await paragraph.elementHandle(), before = await liveState(frame, paragraph), url = page.url();
  const aliases = () => tree(page).locator(`[data-original="${product}:${fixture.ids[product]}"]`);
  await tree(page).getByRole('button', { name: '프로젝트', exact: true }).click();
  await expect(aliases()).toHaveCount(2); await aliases().last().click();
  await tree(page).getByRole('button', { name: '내 파일', exact: true }).click();
  await expect(aliases()).toHaveCount(1); await aliases().click();
  await tree(page).getByRole('button', { name: '프로젝트', exact: true }).click();
  await expect(aliases()).toHaveCount(2); await aliases().first().click();
  expect(page.url()).toBe(url); expect(await nativeFrame(page)).toBe(frame);
  expect(await node!.evaluate(element => element.isConnected)).toBe(true);
  expect(await liveState(frame, paragraph)).toEqual(before);
  expect(await originals(page, fixture)).toEqual(cleanOriginals);
  if (product === 'note') expect((await nativeFile(page, frame, product)).document).toEqual(edited(mounted.document, product, firstInput));
  if (product === 'note' || product === 'site') {
    // These child Note editors have no public debug history getter. Actual
    // Undo/Redo proves their pre-alias history survived, including Site's portal.
    await paragraph.click(); await page.keyboard.press('ControlOrMeta+z');
    await expect(paragraph).not.toContainText(firstInput);
    await expect.poll(async () => JSON.parse((await originals(page, fixture))[product].text).document).toEqual(mounted.document);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(paragraph).toContainText(firstInput);
    await expect.poll(async () => JSON.parse((await originals(page, fixture))[product].text).document).toEqual(JSON.parse(cleanOriginals[product].text).document);
  }
  // Add the final input after the clean alias control. No explicit Save,
  // navigation.prepare call or idle timeout can substitute for the return.
  await append(page, frame, paragraph, lastInput, product);
  await tree(page).getByRole('button', { name: '자료함', exact: true }).click();
  await expect(library(page)).toBeVisible();
  await expect(page.locator('iframe[data-local-native-frame]')).toHaveCount(0);
  await expect(library(page).getByRole('textbox', { name: '자료 검색', exact: true })).toHaveValue(title(product));
  await expect(library(page).getByRole('combobox', { name: '폴더', exact: true })).toHaveValue(folder);
  await expect(library(page).locator('[data-document]')).toHaveCount(1);
  // Word's native persistence reconciles to its imported author shape, while
  // its standalone download exposes the complete rendered tree. Keep both;
  // never remove generated/default fields to pretend those representations match.
  const persistenceOriginal = product === 'word' ? JSON.parse(initialStored.word.text).document as Tree : mounted.document;
  const expected = edited(persistenceOriginal, product, firstInput + lastInput);
  const saved = await originals(page, fixture);
  expect(JSON.parse(saved[product].text)).toMatchObject({ format: mounted.format, version: mounted.version });
  expect(JSON.parse(saved[product].text).document).toEqual(expected);
  expect(saved[product].name).toBe(fixture.ids[product]);
  for (const other of products.filter(value => value !== product)) expect(saved[other]).toEqual(initialStored[other]);
  frame = await catalogOpen(page, product, fixture.ids[product]);
  await expect(await inputTarget(frame, product)).toContainText(firstInput + lastInput);
  // Site export is behind its actual modal stack. Return to the catalog first
  // and reopen a clean host before exporting; no test closes dirty child input.
  await tree(page).getByRole('button', { name: '자료함', exact: true }).click();
  await expect(library(page)).toBeVisible(); frame = await catalogOpen(page, product, fixture.ids[product]);
  const reopenedDownload = await nativeFile(page, frame, product);
  if (product === 'note') expect(reopenedDownload.document).toEqual(expected);
  else {
    // The shared loader refreshes raw metadata.loadedAt on every node. The
    // full durable original above/below stays exact; retain this complete raw
    // download without filtering and prove the real reopened input separately.
    const matches: Tree[] = [];
    const visit = (node: Tree) => { if (node.stype === 'inline-text' && node.text === seedText[product] + firstInput + lastInput) matches.push(node); for (const child of node.content ?? []) visit(child); };
    visit(reopenedDownload.document); expect(matches).toHaveLength(1);
  }
  expect(await originals(page, fixture)).toEqual(saved);
  await info.attach('local-native-return-proof', { body: JSON.stringify({ product, localOnly: true,
    id: fixture.ids[product], inputFile: JSON.parse(fixture.input[product]), mountedOriginal: mounted,
    expectedDocument: expected, savedFile: JSON.parse(saved[product].text), reopenedDownload, aliases: ['Project 1', 'Project 2', 'My'] }), contentType: 'application/json' });
});


test('browser-generated deepest Site composition refuses catalog return and preserves the owned draft until compositionend', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await seed(page);
  await page.reload(); await openLocalLibrary(page); await filterCatalog(page, 'site');
  const frame = await catalogOpen(page, 'site', fixture.ids.site);
  const mounted = await nativeFile(page, frame, 'site');
  const paragraph = await inputTarget(frame, 'site');
  const originalNode = await paragraph.elementHandle(), sourceURL = page.url();
  const before = await originals(page, fixture);
  await paragraph.click();
  await paragraph.dispatchEvent('compositionstart', { data: '' });
  await append(page, frame, paragraph, ' SYNTHETIC RETURN COMPOSITION', 'site');
  await tree(page).getByRole('button', { name: '자료함', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '마지막 입력을 저장하지 못했습니다' }).first()).toBeVisible();
  expect(page.url()).toBe(sourceURL); expect(await nativeFrame(page)).toBe(frame);
  expect(await originalNode!.evaluate(element => element.isConnected)).toBe(true);
  await expect(paragraph).toContainText('SYNTHETIC RETURN COMPOSITION');
  await expect(frame.getByRole('dialog', { name: '데이터베이스 항목', exact: true })).toHaveCount(2);
  expect(await originals(page, fixture)).toEqual(before);
  await paragraph.dispatchEvent('compositionend', { data: 'SYNTHETIC RETURN COMPOSITION' });
  await tree(page).getByRole('button', { name: '자료함', exact: true }).click();
  await expect(library(page)).toBeVisible();
  const expected = edited(mounted.document, 'site', ' SYNTHETIC RETURN COMPOSITION');
  const saved = await originals(page, fixture);
  expect(JSON.parse(saved.site.text).document).toEqual(expected);
  for (const product of ['note', 'word', 'slides'] as const) expect(saved[product]).toEqual(before[product]);
  const reopened = await catalogOpen(page, 'site', fixture.ids.site);
  await expect(await inputTarget(reopened, 'site')).toContainText('SYNTHETIC RETURN COMPOSITION');
  expect(await originals(page, fixture)).toEqual(saved);
  await info.attach('synthetic-composition-return-proof', { body: JSON.stringify({ localOnly: true, physicalIME: false,
    mountedOriginal: mounted, expectedDocument: expected, savedFile: JSON.parse(saved.site.text) }), contentType: 'application/json' });
});
