import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import type { INode } from '../../../packages/datastore/src/types';
import { noteTreeOf, openNoteTree } from '../../../packages/office-note/src/session';
import { serializeNoteFile, type NoteDocument } from '../../../packages/office-note/src/note-file-codec';
import { createSampleDocument } from '../../../packages/office-word/src/sample-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';
import { createSampleDeck } from '../../../packages/office-slides/src/sample-deck';
import { deckFileText } from '../../../packages/office-slides/src/deck-file';
import { formatWorkspaceRoute, parseWorkspaceRoute } from '../../../packages/office-workspace/src/routes';
import { privateControl, launchPrivateProfile, stopPrivateProfile, type Inspection, type RealStatus } from './helpers/real-recovery-control';

const origin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';
type Product = 'note' | 'word' | 'slides';
type Alias = 'alpha-editor' | 'beta-viewer';
type Original = { product: Product; id: string; title: string; tenant: 'alpha' | 'beta'; canonical: unknown; canonicalText: string; initial: NonNullable<Inspection<Product>['document']> };
const initialPrefix = ' initial-input ', stagedPrefix = ' last-staged-input ';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const host = (page: Page, product: Product) => page.locator(`[data-native-entry="active"] [data-server-${product}-workspace]`);
const tree = (page: Page) => page.locator('.ow-file-navigation');
const gate = () => {
  let complete!: () => void, released = false;
  const waiting = new Promise<void>(resolve => { complete = resolve; });
  return { waiting, release: () => { released = true; complete(); }, get released() { return released; } };
};
const reached = (signal: ReturnType<typeof gate>) => expect.poll(() => signal.released, { timeout: 15_000 }).toBe(true);

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000, trace: 'off', video: 'off' });

function accounts() {
  const path = process.env.OFFICE_AUTH_REAL_FILE;
  if (!path || !process.env.OFFICE_AUTH_CONTROL_FILE) throw new Error('Protected real OIDC and PostgreSQL control fixtures are required');
  expect(statSync(path).mode & 0o077).toBe(0);
  return JSON.parse(readFileSync(path, 'utf8')) as { users: Record<Alias, { username?: string; password: string }> };
}
function track(page: Page) {
  const state = { bearer: '', writes: [] as Array<{ id: string; body: { expectedRevision: number; idempotencyKey: string; snapshotText: string } }>,
    reads: [] as Array<{ id: string; body: { snapshotText: string; document: { revision: number; snapshotHash: string } } }> };
  page.on('request', request => {
    if (request.headers().authorization) state.bearer = request.headers().authorization;
    const path = new URL(request.url()).pathname, match = path.match(/\/documents\/([^/]+)\/snapshot$/);
    if (match && request.method() === 'PUT') state.writes.push({ id: match[1], body: request.postDataJSON() });
  });
  page.on('response', async response => {
    const match = new URL(response.url()).pathname.match(/\/documents\/([^/]+)$/);
    if (match && response.request().method() === 'GET' && response.ok()) state.reads.push({ id: match[1], body: await response.json() });
  });
  return state;
}
async function login(page: Page, alias: Alias, url = origin) {
  await page.goto(url);
  const entry = page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true });
  await expect.poll(async () => await entry.isVisible() || await page.locator('#username').isVisible() ||
    await page.getByRole('heading', { name: '회사를 선택하세요', exact: true }).isVisible() ||
    await page.locator('[data-native-entry="active"]').isVisible() ||
    await page.getByRole('heading', { name: '접근 권한이 없습니다', exact: true }).isVisible()).toBe(true);
  if (await entry.isVisible()) await entry.click({ noWaitAfter: true });
  const username = page.locator('#username');
  // The same protected profile can resume its existing local Keycloak login.
  if (await username.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)) {
    const account = accounts().users[alias];
    await username.fill(account.username ?? alias); await page.locator('#password').fill(account.password); await page.locator('#kc-login').click();
  }
  await expect.poll(async () => await page.getByRole('heading', { name: '회사를 선택하세요', exact: true }).isVisible() ||
    await page.locator('[data-native-entry="active"] [data-server-note-workspace]').isVisible() ||
    await page.getByRole('heading', { name: '접근 권한이 없습니다', exact: true }).isVisible()).toBe(true);
}
async function enterAlpha(page: Page) {
  await page.getByRole('button', { name: /Synthetic Alpha/ }).click();
  await page.getByRole('button', { name: 'Alpha workspace', exact: true }).click();
}
function producer(product: Product, title: string): string {
  if (product === 'note') {
    const pageId = randomUUID();
    const document = { stype: 'note', attributes: { title, pageId }, content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Matrix structured body', marks: [{ stype: 'bold', range: [0, 6] }] },
        { stype: 'pageReference', attributes: { pageId, title: 'Self' } }] },
      { stype: 'codeBlock', attributes: { language: 'javascript' }, content: [{ stype: 'inline-text', text: 'const matrix = true;' }] },
      { stype: 'bTable', content: [{ stype: 'bTableBody', content: [{ stype: 'bTableRow', content: [
        { stype: 'bTableCell', content: [{ stype: 'inline-text', text: 'Matrix cell' }] }
      ] }] }] }
    ] };
    const session = openNoteTree(document);
    const body = noteTreeOf({ getNode: sid => session.editor.dataStore.getNode(sid) as never }, session.rootId)!;
    session.close();
    const canonical = { ...document, stype: 'note' as const, content: body.content as unknown[] };
    expect(canonical).toMatchObject(document);
    return serializeNoteFile(canonical, { savedAt: '2026-10-01T00:00:00Z' });
  }
  if (product === 'word') {
    const document = createSampleDocument();
    document.metadata = { originalOwner: 'synthetic-A', loadedAt: 'original-native-loadedAt' };
    return wordFileText(document, '2026-10-01T00:00:00.000Z');
  }
  const document = createSampleDeck();
  const surfaces = document.content!.filter((node): node is INode => typeof node !== 'string' && node.stype === 'surface');
  const resources = document.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'resources')!;
  surfaces[0].attributes = { ...surfaces[0].attributes, trackId: 'server-native-track' };
  surfaces[1].attributes = { ...surfaces[1].attributes, id: 'server-native-target' };
  surfaces[0].content!.push({ stype: 'rectangle', attributes: { name: 'server-native-jump', x: 0, y: 0, width: 100, height: 100, goTo: 'server-native-target' } });
  resources.content!.push({ stype: 'motionTrack', attributes: { id: 'server-native-track' }, content: [
    { stype: 'motionStep', attributes: { kind: 'build', effect: 'appear', target: 'server-native-jump' } }
  ] });
  const rectangle = randomUUID(), ellipse = randomUUID(), line = randomUUID();
  surfaces[0].content!.push(
    { stype: 'rectangle', attributes: { objectId: rectangle, name: 'attached-target', x: 1500, y: 8500, width: 3000, height: 1500 } },
    { stype: 'ellipse', attributes: { objectId: ellipse, name: 'attached-target', x: 9000, y: 9300, width: 3000, height: 1500 } },
    { stype: 'connector', attributes: { objectId: line, name: 'attached-line', startObjectId: rectangle, endObjectId: ellipse, startSide: 'e', endSide: 'w', kind: 'elbow', startX: 4500, startY: 9250, endX: 9000, endY: 10050 } },
    { stype: 'connector', attributes: { objectId: randomUUID(), name: 'attached-branch', startObjectId: rectangle, endObjectId: line, endT: 0.4, startSide: 's', kind: 'straight', startX: 3000, startY: 10000, endX: 7500, endY: 9500 } }
  );
  document.metadata = { originalOwner: 'synthetic-A', loadedAt: 'original-native-loadedAt' };
  return deckFileText(document, '2026-10-01T00:00:00.000Z');
}
function inspect(original: Pick<Original, 'product' | 'id' | 'tenant'>, key?: string, operation: 'create' | 'update' = 'update') {
  return privateControl<Inspection<Product>>({ action: 'inspect', product: original.product, documentId: original.id, tenant: original.tenant,
    ...(key ? { idempotencyKey: key, operation, actor: original.tenant === 'beta' ? 'beta-viewer' : 'alpha-editor' } : {}) });
}
async function seed(page: Page, bearer: string, status: RealStatus, product: Product, tenant: 'alpha' | 'beta' = 'alpha'): Promise<Original> {
  const title = `Mixed ${product} ${randomUUID().slice(0, 8)}`, snapshotText = producer(product, title), file = JSON.parse(snapshotText);
  const tenantId = tenant === 'alpha' ? status.tenantId : status.betaTenantId;
  const workspaceId = tenant === 'alpha' ? status.workspaceId : status.betaWorkspaceId;
  const key = randomUUID();
  // Faithful authorized API preparation, not a native UI import or collaboration proof.
  const response = await page.request.post(`${origin}/api/v1/tenants/${tenantId}/documents`, { headers: { Authorization: bearer },
    data: { workspaceId, product, title, fileFormat: file.format, fileVersion: file.version, snapshotText, idempotencyKey: key,
      ...(product === 'note' ? { importMode: 'new-page-copy' } : {}) } });
  expect(response.status()).toBe(201);
  const result = await response.json() as { document: { documentId: string; pageId: string | null }; snapshotText: string };
  const address = { product, id: result.document.documentId, tenant }, state = await inspect(address, key, 'create');
  expect(state.document).not.toBeNull(); expect(state.receipt?.snapshotText).toBe(result.snapshotText);
  expect(state.document!.snapshotText).toBe(result.snapshotText); expect(state.document!.snapshotHash).toBe(hash(result.snapshotText));
  expect(state.receipt?.document.revision).toBe(state.document!.revision);
  expect(state.document!.canonicalTree).toEqual(JSON.parse(result.snapshotText).document);
  const expected = structuredClone(file.document);
  if (product === 'note') {
    const sourcePage = expected.attributes.pageId, copiedPage = result.document.pageId;
    expect(copiedPage).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(state.document!.pageId).toBe(copiedPage);
    expect(expected.content[0].content[1]).toMatchObject({ stype: 'pageReference', attributes: { pageId: sourcePage } });
    expect(copiedPage).not.toBe(sourcePage);
    expected.attributes.pageId = copiedPage;
    expected.content[0].content[1].attributes.pageId = copiedPage;
  }
  expect(state.document!.canonicalTree).toEqual(expected);
  const canonicalText = product === 'note' ? serializeNoteFile(expected, { savedAt: '2026-10-01T00:00:00Z' }) : snapshotText;
  expect(result.snapshotText).toBe(canonicalText);
  return { ...address, title, canonical: expected, canonicalText, initial: state.document! };
}
function prefixedNote(original: Original, ...prefixes: string[]): NoteDocument {
  const expected = structuredClone(original.canonical) as NoteDocument;
  const paragraph = expected.content[0] as { stype: string; content: Array<{ stype: string; text: string; marks: Array<{ stype: string; range: number[] }> }> };
  const run = paragraph.content[0], prefix = [...prefixes].reverse().join('');
  expect(paragraph.stype).toBe('paragraph'); expect(run.stype).toBe('inline-text');
  expect(run.text).toBe('Matrix structured body'); expect(run.marks[0]).toMatchObject({ stype: 'bold', range: [0, 6] });
  // The declared prefix stays outside the original six bold characters.
  run.text = prefix + 'Matrix structured body'; run.marks[0].range = [prefix.length, prefix.length + 6];
  return expected;
}
async function prefixNoteInput(page: Page, paragraph: Locator, prefix: string) {
  const glyph = await paragraph.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let first: Text | undefined;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent?.trim() && !node.parentElement?.closest('[contenteditable="false"]')) { first = node as Text; break; }
    }
    if (!first) throw new Error('Expected an editable first Note glyph');
    const range = document.createRange(); range.setStart(first, 0); range.setEnd(first, 1);
    const bounds = range.getBoundingClientRect();
    if (!bounds.width || !bounds.height) throw new Error('Expected a visible first Note glyph');
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, leaf: first.data };
  });
  await page.mouse.click(glyph.x, glyph.y);
  const before = await paragraph.evaluate((element, leaf) => {
    const selection = getSelection(), node = selection?.anchorNode;
    if (!selection?.isCollapsed || node?.nodeType !== Node.TEXT_NODE || !element.contains(node) ||
      node.parentElement?.closest('[contenteditable="false"]') || node.textContent !== leaf) throw new Error('Glyph hit did not place the editable Note caret');
    return selection.anchorOffset;
  }, glyph.leaf);
  expect(before).toBeGreaterThanOrEqual(0); expect(before).toBeLessThanOrEqual(1);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home');
  await expect.poll(() => paragraph.evaluate(element => {
    const selection = getSelection(), node = selection?.anchorNode;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let first: Node | undefined;
    for (let one = walker.nextNode(); one; one = walker.nextNode()) {
      if (one.textContent?.trim() && !one.parentElement?.closest('[contenteditable="false"]')) { first = one; break; }
    }
    return Boolean(selection?.isCollapsed && node === first && selection.anchorOffset === 0 && selection.focusOffset === 0);
  })).toBe(true);
  await page.keyboard.insertText(prefix); await expect(paragraph).toContainText(prefix.trim());
}
async function protectedNote(page: Page, original: Original, status: 'draft' | 'pending' | 'confirmed', expectedText: string) {
  await expect.poll(() => page.evaluate(({ original, status, expectedText }) => Object.keys(localStorage)
    .filter(key => key.startsWith('wonffice.note.pending.v1:')).some(key => {
      const record = JSON.parse(localStorage.getItem(key)!);
      return record.status === status && record.base.operation === 'update' && record.base.documentId === original.id &&
        record.scope.tenantId === original.initial.tenantId && record.scope.workspaceId === original.initial.workspaceId && record.snapshotText === expectedText;
    }), { original, status, expectedText })).toBe(true);
}
function originalURL(status: RealStatus, original: Original) {
  return `${origin}${formatWorkspaceRoute({ kind: 'item', workspaceId: original.tenant === 'alpha' ? status.workspaceId : status.betaWorkspaceId,
    tenantId: original.tenant === 'alpha' ? status.tenantId : status.betaTenantId, itemId: original.id })}`;
}
async function assertOpened(page: Page, original: Original, viewer = false) {
  await expect(host(page, original.product)).toBeVisible();
  await expect(page.locator('[data-native-entry="preparing"]')).toHaveCount(0);
  await expect(tree(page)).toBeVisible(); await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  const route = parseWorkspaceRoute(page.url());
  expect('error' in route).toBe(false);
  if ('error' in route || route.route?.kind !== 'item') throw new Error('Expected exact native original route');
  expect(route.route.itemId).toBe(original.id);
  const header = host(page, original.product).locator('.office-editor-header');
  await expect(header).toHaveCount(1); expect(Math.round((await header.boundingBox())!.height)).toBe(48);
  if (original.product === 'note') {
    await expect(host(page, 'note').locator('[data-note-editor]').first()).toHaveAttribute('data-note-editable', viewer ? 'false' : 'true');
    await expect(host(page, 'note').locator('.on-doc')).toContainText('Matrix structured body');
    await expect(host(page, 'note').locator('.on-doc')).toContainText('const matrix = true;');
    await expect(host(page, 'note').locator('.on-doc')).toContainText('Self');
    await expect(host(page, 'note').locator('table').first()).toBeVisible();
    await expect(host(page, 'note').locator('table').first()).toContainText('Matrix cell');
  } else if (original.product === 'word') {
    await expect(host(page, 'word').locator('table').first()).toBeVisible();
    await expect(host(page, 'word')).toContainText('this was added');
    const editable = host(page, 'word').locator('[contenteditable="true"]');
    if (viewer) await expect(editable).toHaveCount(0); else await expect(editable.first()).toBeVisible();
  } else {
    await expect(host(page, 'slides').locator('.sl-stage .w-paragraph').filter({ hasText: 'One engine' }).first()).toBeVisible();
    if (viewer) await expect(host(page, 'slides').locator('[contenteditable="true"]')).toHaveCount(0);
  }
  if (viewer) await expect(host(page, original.product).getByRole('button', { name: /^(저장|저장 확인·재시도)$/ })).toHaveCount(0);
}
async function openTree(page: Page, original: Original) {
  await tree(page).getByRole('button', { name: `${original.title} 열기`, exact: true }).click();
}
async function unchanged(page: Page, bearer: string, originals: Original[]) {
  for (const original of originals) {
    const state = await inspect(original);
    expect(state.document).toEqual(original.initial);
    expect(state.document!.canonicalTree).toEqual(original.canonical); expect(state.document!.snapshotText).toBe(original.canonicalText);
    const reply = await page.request.get(`${origin}/api/v1/tenants/${original.initial.tenantId}/documents/${original.id}`, { headers: { Authorization: bearer } });
    expect(reply.status()).toBe(200);
    const api = await reply.json();
    expect(api.snapshotText).toBe(original.canonicalText);
    expect(api.document.revision).toBe(original.initial.revision);
    expect(hash(api.snapshotText)).toBe(original.initial.snapshotHash);
    expect(JSON.parse(api.snapshotText).document).toEqual(original.canonical);
  }
}
async function exported(page: Page, original: Original, info: TestInfo) {
  if (original.product === 'note') return; // Note's actual snapshot is checked by departure preparation and its exact PG/API bytes.
  const scope = host(page, original.product);
  await scope.getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  let download;
  if (original.product === 'word') {
    [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Word 파일 내보내기', exact: true }).click()]);
  } else {
    [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Slides 파일 내보내기', exact: true }).click()]);
  }
  const path = info.outputPath(`mixed-${original.product}-${original.id}.json`); await download.saveAs(path);
    expect(JSON.parse(readFileSync(path, 'utf8')).document).toEqual(original.canonical);
  if (original.product === 'slides') await page.keyboard.press('Escape');
}

// One serial schedule owns its independent browser processes and disposable private controls.
test('real mixed native originals preserve source input, exact trees, viewer authority and tenant isolation', async ({ browser: _browser }, info) => {
  test.setTimeout(360_000); accounts();
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const profileA = mkdtempSync(join(directory, 'mixed-native-a-')), profileB = mkdtempSync(join(directory, 'mixed-native-b-'));
  let a: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined, b: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  const firstSave = gate(), finalSave = gate(), targetLoad = gate(), revokedLoad = gate();
  try {
    await privateControl<RealStatus>({ action: 'beta-role', role: 'viewer' });
    await privateControl<RealStatus>({ action: 'beta-active', active: true });
    const status = await privateControl<RealStatus>({ action: 'status' });
    a = await launchPrivateProfile(profileA); b = await launchPrivateProfile(profileB);
    expect(a.pid).not.toBe(b.pid);
    const writer = await a.context.newPage(), viewer = await b.context.newPage(), writerRequests = track(writer), viewerRequests = track(viewer);
    await login(writer, 'alpha-editor'); await enterAlpha(writer);
    expect(Boolean(writerRequests.bearer)).toBe(true);
    const note = await seed(writer, writerRequests.bearer, status, 'note');
    const word = await seed(writer, writerRequests.bearer, status, 'word');
    const slides = await seed(writer, writerRequests.bearer, status, 'slides');
    const originals = [note, word, slides];
    const firstExpected = prefixedNote(note, initialPrefix), finalExpected = prefixedNote(note, initialPrefix, stagedPrefix);
    const firstText = serializeNoteFile(firstExpected), finalText = serializeNoteFile(finalExpected);
    const originalRevision = note.initial.revision;
    await login(writer, 'alpha-editor', originalURL(status, note)); await assertOpened(writer, note);
    const paragraph = host(writer, 'note').locator('[data-note-editor] .on-doc p').first();
    await prefixNoteInput(writer, paragraph, initialPrefix); await protectedNote(writer, note, 'draft', firstText);
    let saves = 0, reads = 0;
    const saving = gate(), staged = gate(), finishing = gate();
    await writer.route(`${origin}/api/v1/tenants/${status.tenantId}/documents/${note.id}/snapshot`, async route => {
      if (++saves === 1) { saving.release(); await firstSave.waiting; }
      else if (saves === 2) { finishing.release(); await finalSave.waiting; }
      await route.continue();
    });
    await writer.route(`${origin}/api/v1/tenants/${status.tenantId}/documents/${word.id}`, async route => {
      if (++reads === 2) { staged.release(); await targetLoad.waiting; }
      await route.continue();
    });
    const sourceURL = writer.url(), sourceDOM = await host(writer, 'note').elementHandle();
    await openTree(writer, word); await reached(saving);
    expect(writer.url()).toBe(sourceURL); await expect(host(writer, 'note')).toBeVisible();
    expect(await sourceDOM!.evaluate(node => node.isConnected)).toBe(true);
    const firstWrite = writerRequests.writes.find(write => write.id === note.id)!;
    expect(firstWrite.body.expectedRevision).toBe(originalRevision); expect(firstWrite.body.snapshotText).toBe(firstText);
    expect(JSON.parse(firstWrite.body.snapshotText).document).toEqual(firstExpected);
    await protectedNote(writer, note, 'pending', firstText);
    firstSave.release(); await reached(staged);
    await expect(writer.locator('[data-native-entry="preparing"] [data-server-word-workspace]')).toBeAttached();
    expect(writer.url()).toBe(sourceURL); expect(await sourceDOM!.evaluate(node => node.isConnected)).toBe(true);
    const firstConfirmed = await inspect(note, firstWrite.body.idempotencyKey);
    expect(firstConfirmed.receipt?.snapshotText).toBe(firstText); expect(firstConfirmed.receipt?.document.revision).toBe(originalRevision + 1);
    expect(firstConfirmed.receipt?.document.snapshotHash).toBe(hash(firstText));
    expect(firstConfirmed.document!.snapshotText).toBe(firstText); expect(firstConfirmed.document!.snapshotHash).toBe(hash(firstText));
    expect(firstConfirmed.document!.canonicalTree).toEqual(firstExpected);
    const firstRead = await writer.request.get(`${origin}/api/v1/tenants/${status.tenantId}/documents/${note.id}`, { headers: { Authorization: writerRequests.bearer } });
    expect(firstRead.status()).toBe(200);
    const firstAPI = await firstRead.json(); expect(firstAPI.snapshotText).toBe(firstText);
    expect(firstAPI.document.revision).toBe(originalRevision + 1); expect(firstAPI.document.snapshotHash).toBe(hash(firstText));
    expect(JSON.parse(firstAPI.snapshotText).document).toEqual(firstExpected);
    await protectedNote(writer, note, 'confirmed', firstText);
    await prefixNoteInput(writer, paragraph, stagedPrefix); await protectedNote(writer, note, 'draft', finalText);
    targetLoad.release(); await reached(finishing);
    expect(writer.url()).toBe(sourceURL); expect(await sourceDOM!.evaluate(node => node.isConnected)).toBe(true);
    const secondWrite = writerRequests.writes.filter(write => write.id === note.id)[1];
    expect(secondWrite.body.expectedRevision).toBe(originalRevision + 1); expect(secondWrite.body.snapshotText).toBe(finalText);
    expect(JSON.parse(secondWrite.body.snapshotText).document).toEqual(finalExpected);
    await protectedNote(writer, note, 'pending', finalText);
    finalSave.release(); await assertOpened(writer, word);
    const noteWrites = writerRequests.writes.filter(write => write.id === note.id);
    expect(noteWrites).toHaveLength(2);
    const confirmed = await inspect(note, noteWrites[1].body.idempotencyKey);
    expect(confirmed.receipt?.snapshotText).toBe(finalText); expect(confirmed.receipt?.document.revision).toBe(originalRevision + 2);
    expect(confirmed.receipt?.document.snapshotHash).toBe(hash(finalText));
    expect(confirmed.document!.revision).toBe(originalRevision + 2); expect(confirmed.document!.snapshotText).toBe(finalText);
    expect(confirmed.document!.snapshotHash).toBe(hash(finalText)); expect(confirmed.document!.canonicalTree).toEqual(finalExpected);
    await protectedNote(writer, note, 'confirmed', finalText);
    note.initial = confirmed.document!; note.canonical = finalExpected; note.canonicalText = finalText;
    await exported(writer, word, info); await unchanged(writer, writerRequests.bearer, originals);
    await openTree(writer, slides); await assertOpened(writer, slides); await exported(writer, slides, info);
    await openTree(writer, note); await assertOpened(writer, note);
    await expect(paragraph).toContainText(stagedPrefix + initialPrefix + 'Matrix structured body');
    await expect.poll(() => writerRequests.reads.filter(read => read.id === note.id).at(-1)?.body.snapshotText).toBe(finalText);
    const reopened = writerRequests.reads.filter(read => read.id === note.id).at(-1)!.body;
    expect(reopened.document.revision).toBe(originalRevision + 2); expect(reopened.document.snapshotHash).toBe(hash(finalText));
    expect(JSON.parse(reopened.snapshotText).document).toEqual(finalExpected);
    await unchanged(writer, writerRequests.bearer, originals);
    // A failed real target load preserves the source; retry uses current API authority.
    await writer.route(`${origin}/api/v1/tenants/${status.tenantId}/documents/${word.id}`, route => route.abort('failed'), { times: 1 });
    await openTree(writer, word); await expect(tree(writer).getByRole('alert')).toBeVisible();
    await assertOpened(writer, note); await unchanged(writer, writerRequests.bearer, originals);
    await openTree(writer, word); await assertOpened(writer, word);
    await openTree(writer, slides); await assertOpened(writer, slides);
    await openTree(writer, note); await assertOpened(writer, note);
    expect(writerRequests.writes).toHaveLength(2);

    await login(viewer, 'beta-viewer', originalURL(status, note)); await assertOpened(viewer, note, true);
    for (const original of [word, slides, note]) {
      await openTree(viewer, original); await assertOpened(viewer, original, true);
      const key = randomUUID();
      const deniedWrite = await viewer.request.put(`${origin}/api/v1/tenants/${status.tenantId}/documents/${original.id}/snapshot`,
        { headers: { Authorization: viewerRequests.bearer }, data: { expectedRevision: original.initial.revision, snapshotText: original.initial.snapshotText, idempotencyKey: key } });
      expect(deniedWrite.status()).toBe(403);
      const receipt = await privateControl<Inspection<Product>>({ action: 'inspect', product: original.product, documentId: original.id,
        operation: 'update', idempotencyKey: key, actor: 'beta-viewer' });
      expect(receipt.receipt).toBeNull(); expect(receipt.document).toEqual(original.initial);
    }
    expect(viewerRequests.writes).toHaveLength(0); await unchanged(viewer, viewerRequests.bearer, originals);
    let viewerReads = 0; const revoking = gate();
    await viewer.route(`${origin}/api/v1/tenants/${status.tenantId}/documents/${word.id}`, async route => {
      if (++viewerReads === 2) { revoking.release(); await revokedLoad.waiting; }
      await route.continue();
    });
    const viewerURL = viewer.url(); await openTree(viewer, word); await reached(revoking);
    await privateControl<RealStatus>({ action: 'beta-active', active: false });
    await viewer.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(viewer.getByRole('heading', { name: '접근 권한이 없습니다', exact: true })).toBeVisible();
    revokedLoad.release(); await expect(viewer.locator('[data-native-entry="preparing"]')).toHaveCount(0);
    expect(viewer.url()).toBe(viewerURL); await expect(viewer.locator('[data-native-entry="active"]')).toBeHidden();
    expect(viewerRequests.writes).toHaveLength(0); await unchanged(writer, writerRequests.bearer, originals);
    await privateControl<RealStatus>({ action: 'beta-active', active: true });
    const beta = await seed(viewer, viewerRequests.bearer, status, 'note', 'beta');
    const denied = await writer.request.get(`${origin}/api/v1/tenants/${status.betaTenantId}/documents/${beta.id}`, { headers: { Authorization: writerRequests.bearer } });
    expect(denied.status()).toBe(403);
    await login(writer, 'alpha-editor', originalURL(status, beta));
    await expect(writer.getByRole('heading', { name: '접근 권한이 없습니다', exact: true })).toBeVisible();
    await expect(writer.locator('[data-server-note-workspace]')).toHaveCount(0);
    expect((await inspect(beta)).document).toEqual(beta.initial);
    await info.attach('mixed-native-proof.json', { body: JSON.stringify({ status: 'verified-real-navigation-proof', fixturePreparation: 'authorized real API full native snapshots',
      independentBrowserProcesses: a.pid !== b.pid, products: originals.map(original => ({ product: original.product, documentId: original.id, revision: original.initial.revision, snapshotHash: original.initial.snapshotHash, canonicalTreeHash: original.initial.canonicalTreeHash })),
      sourceUpdates: writerRequests.writes.length, viewerUpdates: viewerRequests.writes.length, collaborationVerified: false }), contentType: 'application/json' });
  } finally {
    firstSave.release(); finalSave.release(); targetLoad.release(); revokedLoad.release();
    if (a) await stopPrivateProfile(a.context, a.pid); if (b) await stopPrivateProfile(b.context, b.pid);
    await privateControl<RealStatus>({ action: 'beta-active', active: true });
    await privateControl<RealStatus>({ action: 'beta-role', role: 'viewer' });
    rmSync(profileA, { recursive: true, force: true }); rmSync(profileB, { recursive: true, force: true });
  }
});
