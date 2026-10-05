import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createSampleDocument } from '../../../packages/office-word/src/sample-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';
import { createSampleDeck } from '../../../packages/office-slides/src/sample-deck';
import { deckFileText } from '../../../packages/office-slides/src/deck-file';
import { siteFileText } from '../../../packages/office-site/src/site-file';
import { serializeNoteFile, type NoteDocument } from '../../../packages/office-note/src/note-file-codec';
import { representativeDocument } from '../../note/tests/document-centered.helpers';
import { siteNativeFixture, type SiteNativeNode } from './helpers/site-native-fixture';
import { launchPrivateProfile, privateControl, stopPrivateProfile, type Inspection, type RealStatus } from './helpers/real-recovery-control';

const origin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';
const products = ['note', 'word', 'slides', 'site'] as const;
type Product = typeof products[number];
type Tree = SiteNativeNode;
type File = { format: string; version: number; document: Tree; [key: string]: unknown };
type Head = { documentId: string; creatorUserId: string; revision: number; product: Product; snapshotHash: string; [key: string]: unknown };
type Receipt = { document: Head; snapshotText: string; idempotencyKey: string };
type Draft = { draftId: string; status: string; savedAt: string; snapshotText: string;
  base: { operation: string; documentId?: string; expectedRevision?: number };
  scope: { issuer: string; subject: string; tenantId: string; workspaceId: string; documentRef: string };
  attempt?: { idempotencyKey: string; snapshotText: string } };
const seed: Record<Product, string> = { note: 'Nested fictional context remains editable.', word: 'Native return editable Word paragraph.', slides: 'One engine, two products', site: 'Nested seed' };
const savedInput = ' AUTH SAVED INPUT';
const laterInput = ' AUTH LATER DRAFT';
const tree = (page: Page) => page.locator('.ow-file-navigation');
const host = (page: Page, product: Product) => page.locator(`[data-native-entry="active"] [data-server-${product}-workspace]`);
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000, trace: 'off', video: 'off' });

async function login(page: Page, alias: 'alpha-editor' | 'beta-viewer', status: RealStatus) {
  const path = process.env.OFFICE_AUTH_REAL_FILE;
  if (!path || statSync(path).mode & 0o077) throw new Error('Protected real account fixture is required');
  const fixture = JSON.parse(readFileSync(path, 'utf8')), account = fixture.users[alias];
  await page.goto(origin);
  await page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true }).click();
  await page.locator('#username').fill(account.username ?? alias);
  await page.locator('#password').fill(account.password); await page.locator('#kc-login').click();
  await page.getByRole('button', { name: /Synthetic Alpha/ }).click();
  await page.getByRole('button', { name: 'Alpha workspace', exact: true }).click();
  await expect(tree(page)).toBeVisible();
  const identity = await page.evaluate(async source => {
    const client = await import(source) as typeof import('../src/auth-client'); return client.loadIdentity();
  }, '/src/auth-client.ts');
  expect(identity.issuer === fixture.issuer && identity.subject === account.id, 'Current signed identity must match the requested account').toBe(true);
  expect(identity.currentUserId).toMatch(/^[0-9a-f-]{36}$/);
  expect(identity.tenants.find(item => item.tenantId === status.tenantId)?.role).toBe(alias === 'alpha-editor' ? 'owner' : 'viewer');
  return { userId: identity.currentUserId!, issuer: identity.issuer, subject: identity.subject };
}
async function api(page: Page, path: string, method = 'GET', body?: unknown) {
  return page.evaluate(async ({ path, method, body, source }) => {
    const { captureAuthorizedFetch } = await import(source) as typeof import('../src/auth-client');
    const response = await captureAuthorizedFetch()(path, { method, ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    return { status: response.status, value: await response.json() };
  }, { path, method, body, source: '/src/auth-client.ts' });
}
function original(product: Product): string {
  let document: Tree;
  if (product === 'word') {
    document = createSampleDocument() as Tree;
    document.content!.find(node => node.stype === 'surface')!.content!.unshift({ stype: 'paragraph', attributes: { styleId: 'Body' },
      content: [{ stype: 'inline-text', text: seed.word }] });
  } else document = product === 'note' ? representativeDocument() as Tree : product === 'slides' ? createSampleDeck() as Tree : siteNativeFixture(true);
  if (product !== 'site') expect(target(document, seed[product]).marks).toBeUndefined();
  // Authored stamps are real fixture data. They remain in every comparison.
  document.metadata = { ...document.metadata, authoredBy: 'synthetic native return fixture', loadedAt: 'original-authored-stamp', explicitEmpty: {} };
  const time = '2026-10-05T00:00:00.000Z';
  return product === 'note' ? serializeNoteFile(document as NoteDocument, { savedAt: time }) :
    product === 'word' ? wordFileText(document, time) : product === 'slides' ? deckFileText(document, time) : siteFileText(document, time);
}
function target(document: Tree, text: string): Tree {
  const matches: Tree[] = [];
  const visit = (node: Tree) => { if (node.stype === 'inline-text' && node.text === text) matches.push(node); for (const child of node.content ?? []) visit(child); };
  visit(document); expect(matches).toHaveLength(1); return matches[0];
}
function edited(document: Tree, product: Product, suffix: string): Tree {
  const copy = structuredClone(document); target(copy, seed[product]).text += suffix; return copy;
}
async function drafts(page: Page, product: Product, id: string): Promise<Draft[]> {
  return page.evaluate(({ product, id }) => Object.keys(localStorage).filter(key => key.startsWith(`wonffice.${product}.pending.v1:`))
    .map(key => JSON.parse(localStorage.getItem(key)!)).filter(record => record.base?.documentId === id), { product, id });
}
async function publicNative(page: Page, product: Product, id: string, expected?: Tree, draftId?: string): Promise<Tree> {
  if (product === 'note') {
    // This host has no public native download or numeric debug getter. Observe
    // the actual complete durable snapshot produced by genuine native input.
    if (!draftId || !expected) throw new Error('Current Note input draft identity is required');
    await expect.poll(async () => (await drafts(page, product, id)).some(record => record.draftId === draftId && record.status === 'draft' &&
      isDeepStrictEqual(JSON.parse(record.snapshotText).document, expected))).toBe(true);
    const record = (await drafts(page, product, id)).find(one => one.draftId === draftId && one.status === 'draft');
    if (!record) throw new Error('Actual Note snapshot is unavailable');
    return JSON.parse(record.snapshotText).document as Tree;
  }
  await host(page, product).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  const download = page.waitForEvent('download');
  // Keep the original rejection handled if the actual menu click fails first.
  void download.catch(() => {});
  await page.getByRole('menuitem', { name: `${product === 'word' ? 'Word' : product === 'slides' ? 'Slides' : 'Site'} 파일 내보내기`, exact: true }).click();
  const path = await (await download).path(); if (!path) throw new Error('Actual native file download is unavailable');
  const file = JSON.parse(readFileSync(path, 'utf8')) as File;
  expect(file.format).toBe(`barocss-${product}`); expect(file.version).toBe(product === 'slides' ? 2 : 1); return file.document;
}
async function currentInputDraft(page: Page, product: Product, id: string, expected: Tree) {
  await expect.poll(async () => (await drafts(page, product, id)).some(record => record.status === 'draft' &&
    isDeepStrictEqual(JSON.parse(record.snapshotText).document, expected))).toBe(true);
  const record = (await drafts(page, product, id)).slice().reverse().find(one => one.status === 'draft' && isDeepStrictEqual(JSON.parse(one.snapshotText).document, expected));
  if (!record) throw new Error('The genuine current input has no durable draft'); return record;
}
async function closeSite(page: Page) {
  const peeks = page.getByRole('dialog', { name: '데이터베이스 항목', exact: true });
  while (await peeks.count()) {
    const count = await peeks.count(); await peeks.last().getByRole('button', { name: '닫기', exact: true }).click(); await expect(peeks).toHaveCount(count - 1);
  }
  const row = page.getByRole('dialog', { name: '1행', exact: true });
  if (await row.isVisible()) { await row.getByRole('button', { name: '닫기', exact: true }).click(); await expect(row).toBeHidden(); }
}
async function input(page: Page, product: Product): Promise<Locator> {
  if (product === 'note') return host(page, product).locator('.on-doc .w-callout').first().locator('p').first();
  if (product === 'word') return host(page, product).locator('.w-paragraph').filter({ hasText: seed.word }).first();
  if (product === 'slides') return host(page, product).locator('.sl-stage .w-paragraph').filter({ hasText: seed.slides }).first();
  const existing = page.locator('[data-db-item-body]').last().locator('.on-doc > p').last();
  const tab = host(page, product).locator('.st-admin [data-admin-tab="data"]');
  const row = host(page, product).getByRole('button', { name: '1행 펼치기', exact: true });
  await expect.poll(async () => await existing.isVisible() || await tab.isVisible() || await row.isVisible()).toBe(true);
  if (await existing.isVisible()) return existing;
  if (!await row.isVisible()) { await tab.click(); await page.locator('[data-admin-open="글"]').click(); }
  await expect(row).toHaveCount(1); await expect(row).toBeVisible(); await expect(row).toBeEnabled(); await row.click();
  await page.locator('[data-row-form] [data-field="본문"] [data-note-body]').getByRole('button', { name: '행 1 열기', exact: true }).click();
  await page.locator('[data-db-item-body]').last().getByRole('button', { name: '행 1 열기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '데이터베이스 항목', exact: true })).toHaveCount(2); return existing;
}
async function append(page: Page, paragraph: Locator, product: Product, text: string, recovered = false) {
  await expect(paragraph).toBeVisible();
  if (product === 'slides') {
    const point = await paragraph.evaluate((element, recovered) => {
      if (recovered) {
        const frame = element.closest('.sl-text-frame'); if (!frame) throw new Error('The recovered title has no current native text frame');
        const box = frame.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); let node: Node | null;
      while ((node = walker.nextNode())) if (node.textContent?.length) {
        const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 1); const box = range.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }
      throw new Error('The actual title has no glyph');
    }, recovered); await page.mouse.dblclick(point.x, point.y);
  } else await paragraph.click();
  await expect.poll(() => paragraph.evaluate(element => !!getSelection()?.anchorNode && element.contains(getSelection()!.anchorNode))).toBe(true);
  if (!await paragraph.evaluate(() => getSelection()!.isCollapsed)) await page.keyboard.press('ArrowRight');
  const remaining = await paragraph.evaluate(element => {
    const selection = getSelection()!, rest = document.createRange(); if (!selection.anchorNode || !element.contains(selection.anchorNode)) throw new Error('Caret left native input');
    rest.setStart(selection.anchorNode, selection.anchorOffset); rest.setEnd(element, element.childNodes.length); return rest.toString();
  });
  expect(remaining).toMatch(/^[\x20-\x7e]*$/); expect(remaining.length).toBeLessThan(200);
  for (let offset = 0; offset < remaining.length; offset++) await page.keyboard.press('ArrowRight');
  await expect.poll(() => paragraph.evaluate(element => {
    const selection = getSelection(); if (!selection?.anchorNode || !element.contains(selection.anchorNode)) return false;
    const remaining = document.createRange(); remaining.setStart(selection.anchorNode, selection.anchorOffset); remaining.setEnd(element, element.childNodes.length);
    return selection.isCollapsed && remaining.toString() === '';
  })).toBe(true);
  await page.keyboard.insertText(text); await expect(paragraph).toContainText(text);
}
async function view(page: Page) {
  return tree(page).evaluate(element => ({ query: element.querySelector('input')?.value, product: element.querySelector('select')?.value,
    perspective: [...element.querySelectorAll('.ow-tree-perspectives button')].find(button => button.getAttribute('aria-pressed') === 'true')?.textContent,
    groups: [...element.querySelectorAll('[data-tree-group]')].map(group => ({ id: group.getAttribute('data-tree-group'), expanded: group.querySelector('.ow-tree-group')?.getAttribute('aria-expanded') })),
    scroll: element.querySelector('.ow-file-tree')?.scrollTop }));
}
async function denied(page: Page, path: string, body: unknown) {
  let authorization = '';
  const capture = (request: import('@playwright/test').Request) => { if (request.url() === `${origin}${path}` && request.method() === 'PUT') authorization = request.headers().authorization ?? ''; };
  page.on('request', capture);
  const wire = page.waitForResponse(response => response.url() === `${origin}${path}` && response.request().method() === 'PUT');
  const kind = await page.evaluate(async ({ path, body, source }) => {
    const { captureAuthorizedFetch, AuthError } = await import(source) as typeof import('../src/auth-client');
    try { await captureAuthorizedFetch()(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return null; }
    catch (cause) { return cause instanceof AuthError ? cause.kind : 'unexpected'; }
  }, { path, body, source: '/src/auth-client.ts' });
  page.off('request', capture); expect(kind).toBe('forbidden'); expect((await wire).status()).toBe(403);
  expect(authorization.startsWith('Bearer ')).toBe(true);
  const response = await page.request.put(`${origin}${path}`, { headers: { authorization }, data: body }); expect(response.status()).toBe(403);
}

// Four independent real-auth cases. Preparation is explicit API fixture creation;
// input/history/save/return/reopen are genuine product UI, never forced publication.
for (const product of products) test(`real ${product} native input, explicit save and catalog return keep full original and deny current viewer and recover rightful unsaved draft`, async ({ browser: _browser }, info: TestInfo) => {
  test.setTimeout(180_000);
  const directory = mkdtempSync(join('/private/tmp/', `468-auth-${product}-profiles-`));
  const profiles: Awaited<ReturnType<typeof launchPrivateProfile>>[] = [];
  const evidence: Record<string, unknown> = { product, phase: 'preparation', numericHistory: 'unavailable; genuine Undo/Redo effects required', remountHistory: 'new runtime; preservation not claimed' };
  const writes: { expectedRevision: number; idempotencyKey: string; snapshotText: string }[] = [];
  let primaryFailure: unknown;
  try {
    const status = await privateControl<RealStatus>({ action: 'status' });
    await privateControl({ action: 'beta-active', active: true }); await privateControl({ action: 'beta-role', role: 'viewer' });
    const a = await launchPrivateProfile(join(directory, 'a')); profiles.push(a);
    const b = await launchPrivateProfile(join(directory, 'b')); profiles.push(b); expect(a.pid).not.toBe(b.pid);
    const page = a.context.pages()[0], viewer = b.context.pages()[0];
    const identity = await login(page, 'alpha-editor', status), viewerIdentity = await login(viewer, 'beta-viewer', status);
    expect(identity.userId).not.toBe(viewerIdentity.userId);
    const root = `/api/v1/tenants/${status.tenantId}`, submitted = original(product), key = `native-${product}-${randomUUID()}`;
    const name = `Auth native ${product} ${randomUUID()}`;
    const created = await api(page, `${root}/documents`, 'POST', { workspaceId: status.workspaceId, product, title: name,
      fileFormat: `barocss-${product}`, fileVersion: product === 'slides' ? 2 : 1, snapshotText: submitted, idempotencyKey: key,
      ...(product === 'note' ? { importMode: 'new-page-copy' } : {}) });
    expect(created.status).toBe(201); const receipt = created.value as Receipt, id = receipt.document.documentId;
    expect(receipt.document.creatorUserId).toBe(identity.userId); expect(receipt.document.revision).toBe(1);
    if (product !== 'note') expect(receipt.snapshotText).toBe(submitted);
    const baseline = (JSON.parse(receipt.snapshotText) as File).document;
    expect(target(baseline, seed[product]).marks).toEqual(product === 'site' ? [] : undefined);
    const inspect = (idempotencyKey?: string, actor: 'alpha-editor' | 'beta-viewer' = 'alpha-editor') => privateControl<Inspection<Product>>({ action: 'inspect', product, documentId: id,
      ...(idempotencyKey ? { idempotencyKey, operation: 'update', actor } : {}) });
    const before = await privateControl<Inspection<Product>>({ action: 'inspect', product, documentId: id, idempotencyKey: key, operation: 'create', actor: 'alpha-editor' });
    expect(before.document!.snapshotText).toBe(receipt.snapshotText); expect(before.document!.canonicalTree).toEqual(baseline);
    expect(before.receipt!.snapshotText).toBe(receipt.snapshotText); expect(before.document!.snapshotHash).toBe(hash(receipt.snapshotText));
    evidence.original = { submitted, signedCreate: receipt, privatePg: before.document, createReceipt: before.receipt };
    // Project aliases are authorized API preparation, including Site which the
    // existing UI link picker does not list. They do not claim picker coverage.
    const project = await api(page, `${root}/projects`, 'POST', { workspaceId: status.workspaceId, title: name, goal: 'Same original native return', idempotencyKey: randomUUID() });
    expect(project.status).toBe(201);
    const projectId = project.value.project.record.id;
    const linked = await api(page, `${root}/projects/${projectId}`, 'PATCH', { expectedRevision: project.value.project.revision,
      idempotencyKey: randomUUID(), action: { type: 'link-result', name, document: { product, id } } }); expect(linked.status).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event('wonffice:catalog-refresh')));
    await tree(page).locator('.ow-tree-perspectives').getByRole('button', { name: '내 파일', exact: true }).click();
    await tree(page).getByRole('textbox', { name: '파일 검색', exact: true }).fill(name);
    await tree(page).getByRole('combobox', { name: '파일 제품 필터', exact: true }).selectOption(product);
    const selector = `[data-original='${JSON.stringify([status.tenantId, status.workspaceId, product, id])}']`;
    await expect(tree(page).locator(selector)).toHaveCount(1); const myView = await view(page);
    page.on('request', request => { if (request.method() === 'PUT' && new URL(request.url()).pathname === `${root}/documents/${id}/snapshot`) writes.push(request.postDataJSON()); });
    evidence.phase = 'native-input'; await tree(page).locator(selector).click(); await expect(host(page, product)).toBeVisible();
    const paragraph = await input(page, product); await expect(paragraph).toHaveText(seed[product]);
    if (product !== 'note' && product !== 'site') expect(await publicNative(page, product, id)).toEqual(baseline);
    await append(page, paragraph, product, savedInput); const expected = edited(baseline, product, savedInput);
    const inputDraft = product === 'note' ? await currentInputDraft(page, product, id, expected) : undefined;
    await page.keyboard.press('ControlOrMeta+z'); await expect(paragraph).toHaveText(seed[product]);
    if (product === 'note') expect(await publicNative(page, product, id, baseline, inputDraft?.draftId)).toEqual(baseline);
    await page.keyboard.press('ControlOrMeta+Shift+z'); await expect(paragraph).toHaveText(seed[product] + savedInput);
    if (product === 'site') await page.keyboard.press('ControlOrMeta+s');
    else {
      expect(await publicNative(page, product, id, expected, inputDraft?.draftId)).toEqual(expected);
      await host(page, product).getByRole('button', { name: '저장', exact: true }).click();
    }
    evidence.phase = 'explicit-save'; await expect.poll(async () => (await inspect()).document!.revision).toBe(2);
    expect(writes).toHaveLength(1); const request = writes[0]; expect(request.expectedRevision).toBe(1);
    expect(JSON.parse(request.snapshotText).document).toEqual(expected);
    const ack = await api(page, `${root}/receipts/update/${request.idempotencyKey}`); expect(ack.status).toBe(200);
    expect(ack.value.snapshotText).toBe(request.snapshotText); expect(ack.value.document.creatorUserId).toBe(identity.userId);
    const pg = await inspect(request.idempotencyKey); expect(pg.document!.snapshotText).toBe(request.snapshotText); expect(pg.receipt!.snapshotText).toBe(request.snapshotText);
    expect(pg.document!.canonicalTree).toEqual(expected); expect(pg.document!.revision).toBe(2); expect(pg.document!.snapshotHash).toBe(hash(request.snapshotText));
    evidence.saved = { request, signedAck: ack.value, privatePg: pg.document, receipt: pg.receipt, expected };
    if (product === 'site') { await closeSite(page); expect(await publicNative(page, product, id)).toEqual(expected); }
    evidence.phase = 'catalog-return'; await tree(page).locator('.ow-tree-footer').getByRole('button', { name: '자료함', exact: true }).click();
    await expect(host(page, product)).toHaveCount(0); expect(await view(page)).toEqual(myView); expect(writes).toHaveLength(1);
    await tree(page).locator('.ow-tree-perspectives').getByRole('button', { name: '프로젝트', exact: true }).click();
    await tree(page).getByRole('textbox', { name: '파일 검색', exact: true }).fill(name);
    await tree(page).getByRole('combobox', { name: '파일 제품 필터', exact: true }).selectOption(product);
    const group = tree(page).locator(`[data-tree-group='${JSON.stringify([status.tenantId, status.workspaceId, 'project', projectId])}']`);
    await expect(group.locator(selector)).toHaveCount(1); const projectView = await view(page);
    await group.locator(selector).click(); await expect(host(page, product)).toBeVisible();
    evidence.phase = 'reopened-native'; const reopened = await input(page, product); await expect(reopened).toHaveText(seed[product] + savedInput);
    // A new runtime must edit the reopened full original. Its Undo is new live
    // history, not a claim that history persisted across unmount.
    await append(page, reopened, product, ' REOPEN PROBE');
    const probeDraft = product === 'note' ? await currentInputDraft(page, product, id, edited(baseline, product, savedInput + ' REOPEN PROBE')) : undefined;
    evidence.reopenedProbeDraftId = probeDraft?.draftId; await page.keyboard.press('ControlOrMeta+z');
    await expect(reopened).toHaveText(seed[product] + savedInput);
    if (product === 'site') await closeSite(page);
    const reopenedNative = await publicNative(page, product, id, expected, probeDraft?.draftId); expect(reopenedNative).toEqual(expected); evidence.reopenedNative = reopenedNative;
    const read = await api(page, `${root}/documents/${id}`); expect(read.status).toBe(200); expect(read.value.snapshotText).toBe(request.snapshotText);
    expect(read.value.document).toMatchObject({ documentId: id, creatorUserId: identity.userId, revision: 2 }); expect(writes).toHaveLength(1);
    await tree(page).locator('.ow-tree-footer').getByRole('button', { name: '자료함', exact: true }).click(); await expect(host(page, product)).toHaveCount(0);
    expect(await view(page)).toEqual(projectView); expect(writes).toHaveLength(1);
    evidence.phase = 'viewer-denial'; const deniedKey = `viewer-${randomUUID()}`, deniedBefore = await inspect(deniedKey, 'beta-viewer');
    await denied(viewer, `${root}/documents/${id}/snapshot`, { expectedRevision: 2, snapshotText: request.snapshotText, idempotencyKey: deniedKey });
    const deniedAfter = await inspect(deniedKey, 'beta-viewer'); expect(deniedAfter.document).toEqual(deniedBefore.document);
    expect(deniedAfter.receipt).toBeNull(); expect(deniedAfter.receiptCount).toBe(deniedBefore.receiptCount); expect(deniedAfter.documentCount).toBe(deniedBefore.documentCount);
    evidence.viewer = { actualCurrentRole: 'viewer', distinctIdentities: true, distinctBrowserProcesses: true, unchangedCanonicalAndReceipts: true };
    evidence.phase = 'unsaved-later-input'; await group.locator(selector).click(); await expect(host(page, product)).toBeVisible();
    const last = await input(page, product); await append(page, last, product, laterInput); const latest = edited(baseline, product, savedInput + laterInput);
    if (product === 'site') await closeSite(page);
    const durable = await currentInputDraft(page, product, id, latest);
    expect(await publicNative(page, product, id, latest, durable.draftId)).toEqual(latest); expect(durable!.status).toBe('draft'); expect(durable!.scope.subject === identity.subject).toBe(true);
    evidence.laterDraft = { draftId: durable!.draftId, status: durable!.status, snapshotText: durable!.snapshotText, base: durable!.base, attempt: durable!.attempt };
    await tree(page).locator('.ow-tree-footer').getByRole('button', { name: '자료함', exact: true }).click(); await expect(host(page, product)).toHaveCount(0);
    const afterDeparture = await inspect();
    const departureDrafts = await drafts(page, product, id);
    evidence.afterUnsavedDeparture = { privatePg: afterDeparture.document, receiptCount: afterDeparture.receiptCount, documentCount: afterDeparture.documentCount,
      drafts: departureDrafts.map(record => ({ draftId: record.draftId, status: record.status, snapshotText: record.snapshotText, base: record.base, attempt: record.attempt })), view: await view(page) };
    expect(writes).toHaveLength(1); expect(await view(page)).toEqual(projectView);
    expect(afterDeparture.document).toEqual(pg.document);
    expect(afterDeparture.receiptCount).toBe(pg.receiptCount); expect(afterDeparture.documentCount).toBe(pg.documentCount);
    expect((await drafts(page, product, id)).find(record => record.draftId === durable!.draftId)).toEqual(durable);
    evidence.phase = 'rightful-recovery-reopen';
    // Project openings intentionally read. Reopen this exact same original in
    // My files for editing; its mode switch must not publish the unsaved draft.
    await tree(page).locator('.ow-tree-perspectives').getByRole('button', { name: '내 파일', exact: true }).click();
    await expect(tree(page).locator(selector)).toHaveCount(1); await tree(page).locator(selector).click();
    await expect(host(page, product)).toBeVisible();
    const confirmedInput = await input(page, product); await expect(confirmedInput).toHaveText(seed[product] + savedInput);
    if (product === 'word') {
      await expect(host(page, product).locator('.w-shell')).toHaveAttribute('data-reading', 'false');
      await expect.poll(() => confirmedInput.evaluate(element => (element as HTMLElement).isContentEditable)).toBe(true);
    }
    if (product === 'site') await closeSite(page);
    const currentIdentity = await page.evaluate(async source => {
      const client = await import(source) as typeof import('../src/auth-client'); return client.loadIdentity();
    }, '/src/auth-client.ts');
    expect(currentIdentity.issuer === identity.issuer && currentIdentity.subject === identity.subject &&
      currentIdentity.currentUserId === identity.userId, 'Recovery must use the current rightful signed identity').toBe(true);
    expect(currentIdentity.tenants.find(item => item.tenantId === status.tenantId)?.role).toBe('owner');
    expect(durable.scope.issuer === currentIdentity.issuer && durable.scope.subject === currentIdentity.subject &&
      durable.scope.tenantId === status.tenantId && durable.scope.workspaceId === status.workspaceId,
    'The retained draft must belong to the current complete account/workspace scope').toBe(true);
    expect(durable.base).toEqual({ operation: 'update', documentId: id, expectedRevision: 2 });
    expect(durable.scope.documentRef).toBe(product === 'note' ? baseline.attributes!.pageId : id);
    expect(durable.attempt).toBeUndefined();
    expect((await drafts(page, product, id)).find(record => record.draftId === durable.draftId)).toEqual(durable);
    expect(writes).toHaveLength(1);
    await host(page, product).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
    const navigationAction = product === 'word' ? '열기…' : product === 'slides' ? '서버 Slides 목록' : '문서 작업';
    await page.getByRole(product === 'note' ? 'menuitemcheckbox' : 'menuitem', { name: navigationAction, exact: true }).click();
    const recoveryLabel = product === 'note' ? `초안 복구 ${baseline.attributes!.title} ${durable.draftId.slice(0, 8)}` :
      `저장된 ${product === 'word' ? 'Word' : product === 'slides' ? 'Slides' : 'Site'} 초안 복구 · ${durable.savedAt}`;
    const recovery = host(page, product).getByRole('button', { name: recoveryLabel, exact: true });
    // A time label is a user action, not draft identity. Bind the sole visible
    // choice to the exact scoped raw record before and after the real click.
    expect((await drafts(page, product, id)).filter(record => record.status !== 'confirmed' && record.savedAt === durable.savedAt)).toEqual([durable]);
    await expect(recovery).toHaveCount(1); await expect(recovery).toBeVisible(); await expect(recovery).toBeEnabled();
    evidence.phase = 'rightful-explicit-recovery'; await recovery.click();
    const recoveredInput = await input(page, product); await expect(recoveredInput).toHaveText(seed[product] + savedInput + laterInput);
    expect((await drafts(page, product, id)).find(record => record.draftId === durable.draftId)).toEqual(durable);
    if (product !== 'note') {
      if (product === 'site') await closeSite(page);
      expect(await publicNative(page, product, id)).toEqual(latest);
    }
    evidence.phase = 'recovered-native-input-probe';
    const recoveryProbe = ' RECOVERED NATIVE PROBE';
    const probeInput = await input(page, product);
    if (product === 'word') {
      await expect(host(page, product).locator('.w-shell')).toHaveAttribute('data-reading', 'false');
      await expect.poll(() => probeInput.evaluate(element => (element as HTMLElement).isContentEditable)).toBe(true);
    }
    await append(page, probeInput, product, recoveryProbe, true);
    const recoveredProbe = await currentInputDraft(page, product, id, edited(baseline, product, savedInput + laterInput + recoveryProbe));
    expect(recoveredProbe.draftId).not.toBe(durable.draftId);
    expect(recoveredProbe.base).toEqual(durable.base); expect(recoveredProbe.scope).toEqual(durable.scope);
    await page.keyboard.press('ControlOrMeta+z'); await expect(probeInput).toHaveText(seed[product] + savedInput + laterInput);
    if (product === 'site') await closeSite(page);
    const recoveredNative = await publicNative(page, product, id, latest, recoveredProbe.draftId);
    expect(recoveredNative).toEqual(latest);
    expect((await drafts(page, product, id)).find(record => record.draftId === durable.draftId)).toEqual(durable);
    expect(writes).toHaveLength(1);
    const afterRecovery = await inspect(request.idempotencyKey);
    expect(afterRecovery.document).toEqual(pg.document); expect(afterRecovery.receipt).toEqual(pg.receipt);
    expect(afterRecovery.receiptCount).toBe(pg.receiptCount); expect(afterRecovery.documentCount).toBe(pg.documentCount);
    const recoveredRead = await api(page, `${root}/documents/${id}`); expect(recoveredRead.status).toBe(200);
    expect(recoveredRead.value.snapshotText).toBe(request.snapshotText);
    expect(recoveredRead.value.document).toMatchObject({ documentId: id, creatorUserId: identity.userId, revision: 2 });
    const createUnchanged = await privateControl<Inspection<Product>>({ action: 'inspect', product, documentId: id,
      idempotencyKey: key, operation: 'create', actor: 'alpha-editor' });
    expect(createUnchanged.receipt).toEqual(before.receipt);
    evidence.rightfulRecovery = { navigationAction, recoveryDestination: 'My files writer', draftId: durable.draftId, status: durable.status,
      wordWritingState: product === 'word' ? 'data-reading=false; actual native contentEditable=true' : 'not applicable',
      exactRetainedRecordHash: hash(JSON.stringify(durable)), completeScopeMatchesCurrentIdentity: true, currentRole: 'owner',
      retainedRecordUnchanged: true, explicitAction: true, automaticRestore: false,
      mountedNative: recoveredNative, probeDraftId: recoveredProbe.draftId, probeNative: JSON.parse(recoveredProbe.snapshotText).document,
      originalCanonicalAndReceiptsUnchanged: true, privatePg: afterRecovery.document, receipt: afterRecovery.receipt,
      receiptCount: afterRecovery.receiptCount, documentCount: afterRecovery.documentCount,
      history: 'Recovery mounts independent history; genuine probe Undo checked. Prior history/caret/scroll continuity not claimed.' };
    evidence.phase = 'complete-bounded-success';
  } catch (cause) {
    primaryFailure = cause;
    evidence.primaryFailure = { name: cause instanceof Error ? cause.name : 'unknown',
      sourceLine: cause instanceof Error ? cause.stack?.match(/auth-real-workspace-native-return\.spec\.ts:(\d+):\d+/)?.[1] : undefined };
  }
  {
    // Only safe synthetic source/requests are retained; no bearer, password,
    // account fixture, browser profile or private control descriptor is copied.
    const closed = await Promise.allSettled(profiles.map(profile => stopPrivateProfile(profile.context, profile.pid)));
    const closeCodes = new Set(['private_browser_process_unconfirmed', 'private_browser_close_timeout', 'private_browser_process_still_running']);
    evidence.cleanup = closed.map(result => result.status === 'fulfilled' ? { status: 'fulfilled' } : {
      status: 'rejected', code: result.reason instanceof Error && closeCodes.has(result.reason.message) ? result.reason.message : 'private_browser_close_unclassified' });
    evidence.writes = writes;
    await info.attach(`${product}-source-bound-native-return`, { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
    rmSync(directory, { recursive: true, force: true });
    let cleanupFailure: unknown;
    try { expect(closed.every(result => result.status === 'fulfilled'), 'Private browser processes must close').toBe(true); }
    catch (cause) { cleanupFailure = cause; }
    if (primaryFailure && cleanupFailure) throw new AggregateError([primaryFailure, cleanupFailure], 'Native scenario and private browser cleanup both failed');
    if (primaryFailure) throw primaryFailure;
    if (cleanupFailure) throw cleanupFailure;
  }
});
