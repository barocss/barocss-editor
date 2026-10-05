import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { siteFileText } from '../../../packages/office-site/src/site-file';
import { siteNativeFixture as fixture, siteNativeNode as nativeNode, type SiteNativeNode as NativeNode } from './helpers/site-native-fixture';

const tenantId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const documentId = '00000000-0000-4000-8000-000000000003';
const copyId = '00000000-0000-4000-8000-000000000004';
const issuer = 'http://127.0.0.1:18180/realms/wonffice-local';
const origin = `http://127.0.0.1:${process.env.OFFICE_AUTH_TEST_PORT ?? '5191'}`;
const pendingPrefix = 'wonffice.site.pending.v1:';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const shell = (page: Page) => page.locator('[data-server-site-workspace]');
const status = (page: Page) => shell(page).locator('[data-save-status]');
const save = (page: Page) => shell(page).getByRole('button', { name: /^(저장|저장 확인·재시도)$/ });
const body = (page: Page) => page.locator('[data-row-form] [data-field="본문"] [data-note-body]');
type SaveRequest = { snapshotText: string; idempotencyKey: string; expectedRevision?: number; title?: string;
  workspaceId?: string; product?: string; fileFormat?: string; fileVersion?: number };


const json = (value: unknown) => ({ contentType: 'application/json', body: JSON.stringify(value) });
async function setup(page: Page, options: { viewer?: boolean; lostAck?: 'update' | 'create'; wrongProduct?: boolean;
  mode?: 'initializing' | 'collaborative'; deep?: boolean; holdDelivery?: boolean } = {}) {
  const source = fixture(options.deep);
  const documents = new Map([[documentId, { title: 'Server Site', snapshotText: siteFileText(source, ''), revision: 1 }]]);
  let role: 'editor' | 'viewer' = options.viewer ? 'viewer' : 'editor';
  let subject = 'site-synthetic';
  const writes: Array<{ operation: 'create' | 'update'; documentId: string; body: SaveRequest }> = [];
  const receipts = new Map<string, unknown>();
  let lose = options.lostAck;
  const head = (id = documentId) => {
    const document = documents.get(id)!;
    return { tenantId, workspaceId, documentId: id, product: options.wrongProduct ? 'note' : 'site', title: document.title,
      metadataRevision: 1, mode: options.mode ?? 'snapshot', revision: document.revision, pageId: null,
      documentKey: `wonffice-${tenantId}-${id}`, fileFormat: 'barocss-site', fileVersion: 1, snapshotHash: hash(document.snapshotText) };
  };
  if (options.holdDelivery) await page.addInitScript(() => {
    const schedule = window.setTimeout.bind(window);
    // Hold existing nested idle delivery. Explicit user Save must await the real flush barrier.
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
      schedule(handler, delay === 150 || delay === 350 ? 60_000 : delay, ...args)) as typeof window.setTimeout;
  });
  await page.route(`${issuer}/.well-known/openid-configuration`, route => route.fulfill({ ...json({ issuer,
    authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, end_session_endpoint: `${issuer}/logout` }), headers: { 'access-control-allow-origin': '*' } }));
  await page.route(`${issuer}/auth**`, route => route.fulfill({ contentType: 'text/html', body: `<script>location.replace('${origin}/auth/callback?code=synthetic&state=${new URL(route.request().url()).searchParams.get('state')}')</script>` }));
  await page.route(`${issuer}/token`, route => route.fulfill({ ...json({ access_token: 'synthetic-site-token', token_type: 'Bearer', expires_in: 300 }), headers: { 'access-control-allow-origin': '*' } }));
  await page.route('**/api/v1/me', route => route.fulfill(json({ issuer, subject,
    tenants: [{ tenantId, name: 'Site Company', role }], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/access`, route => route.fulfill(json({ tenantId, role })));
  await page.route(`**/api/v1/tenants/${tenantId}/workspaces**`, route => route.fulfill(json({
    workspaces: [{ id: workspaceId, name: 'Site workspace' }], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/projects?**`, route => route.fulfill(json({ projects: [], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/projects/*`, route => route.fulfill({ status: 404, ...json({ status: 'not_found' }) }));
  await page.route(`**/api/v1/tenants/${tenantId}/documents?**`, route => route.fulfill(json({
    documents: new URL(route.request().url()).searchParams.get('product') === 'site' ? [...documents.keys()].map(id => head(id)) : [], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/documents/*`, route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
    const document = documents.get(id);
    return route.fulfill(document ? json({ document: head(id), ...(options.mode ? {} : { snapshotText: document.snapshotText }) })
      : { status: 404, ...json({ status: 'not_found' }) });
  });
  await page.route(`**/api/v1/tenants/${tenantId}/receipts/**`, route => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);
    return route.fulfill(role === 'viewer' ? { status: 403, ...json({ status: 'forbidden' }) }
      : receipts.has(key) ? json(receipts.get(key)) : { status: 404, ...json({ status: 'not_found' }) });
  });
  await page.route(`**/api/v1/tenants/${tenantId}/documents/*/snapshot`, async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!;
    const request = route.request().postDataJSON() as SaveRequest;
    writes.push({ operation: 'update', documentId: id, body: request });
    if (role === 'viewer') return route.fulfill({ status: 403, ...json({ status: 'forbidden' }) });
    if (options.mode) return route.fulfill({ status: 409, ...json({ status: 'mode_conflict' }) });
    if (receipts.has(request.idempotencyKey)) return route.fulfill(json(receipts.get(request.idempotencyKey)));
    const document = documents.get(id)!;
    if (request.expectedRevision !== document.revision) return route.fulfill({ status: 409, ...json({ status: 'revision_conflict' }) });
    document.snapshotText = request.snapshotText; document.revision++;
    const receipt = { operation: 'update', idempotencyKey: request.idempotencyKey,
      requestHash: hash(JSON.stringify(['update', id, request.expectedRevision, request.snapshotText])),
      document: head(id), snapshotText: request.snapshotText };
    receipts.set(request.idempotencyKey, receipt);
    if (lose === 'update') { lose = undefined; return route.abort('failed'); }
    return route.fulfill(json(receipt));
  });
  await page.route(`**/api/v1/tenants/${tenantId}/documents`, async route => {
    const request = route.request().postDataJSON() as SaveRequest;
    writes.push({ operation: 'create', documentId: copyId, body: request });
    if (role === 'viewer') return route.fulfill({ status: 403, ...json({ status: 'forbidden' }) });
    if (receipts.has(request.idempotencyKey)) return route.fulfill(json(receipts.get(request.idempotencyKey)));
    documents.set(copyId, { title: request.title!, snapshotText: request.snapshotText, revision: 1 });
    const receipt = { operation: 'create', idempotencyKey: request.idempotencyKey,
      requestHash: hash(JSON.stringify(['create', workspaceId, 'site', request.title, 'barocss-site', 1, null, request.snapshotText])),
      document: head(copyId), snapshotText: request.snapshotText };
    receipts.set(request.idempotencyKey, receipt);
    if (lose === 'create') { lose = undefined; return route.abort('failed'); }
    return route.fulfill({ status: 201, ...json(receipt) });
  });
  await page.goto(options.wrongProduct ? `/?tenant=${tenantId}&workspace=${workspaceId}&document=${documentId}&product=site`
    : `/${workspaceId}/${documentId}?tenant=${tenantId}`);
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  return { source, writes, text: (id = documentId) => documents.get(id)!.snapshotText,
    revision: (id = documentId) => documents.get(id)!.revision,
    advance: (next: NativeNode) => { documents.set(documentId, { title: 'Server Site', snapshotText: siteFileText(next, ''), revision: documents.get(documentId)!.revision + 1 }); },
    role: (next: 'editor' | 'viewer') => { role = next; }, subject: (next: string) => { subject = next; } };
}

async function openBody(page: Page, deep = false) {
  // A legitimate drawer close retains the dataset screen. First entry instead
  // mounts Admin asynchronously, so wait for either actual connected surface.
  const row = shell(page).getByRole('button', { name: '1행 펼치기', exact: true });
  const dataTab = shell(page).locator('.st-admin [data-admin-tab="data"]');
  await expect.poll(async () => await row.isVisible() || await dataTab.isVisible()).toBe(true);
  if (!await row.isVisible()) {
    await dataTab.click();
    await shell(page).locator('[data-admin-open="글"]').click();
  }
  await expect(row).toBeVisible();
  await row.click();
  await expect(body(page)).toBeVisible();
  if (!deep) return body(page);
  await body(page).getByRole('button', { name: '행 1 열기', exact: true }).click();
  await page.locator('[data-db-item-body]').last().getByRole('button', { name: '행 1 열기', exact: true }).click();
  const nested = page.locator('[data-db-item-body]').last();
  await expect(nested.locator('.on-doc > p')).toBeVisible();
  return nested;
}
async function typeBody(page: Page, target: Locator, text: string) {
  const paragraph = target.locator('p').last();
  await paragraph.click();
  const apple = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform));
  await page.keyboard.press(apple ? 'Meta+ArrowDown' : 'Control+End');
  // End scrolls on macOS. Verify the genuine keyboard caret belongs to this
  // paragraph and leaves no remaining text before inserting the expected suffix.
  await expect.poll(() => paragraph.evaluate(element => {
    const selection = window.getSelection();
    if (!selection?.anchorNode || !element.contains(selection.anchorNode)) return { within: false, collapsed: false, atEnd: false };
    const remaining = document.createRange();
    remaining.setStart(selection.anchorNode, selection.anchorOffset);
    remaining.setEnd(element, element.childNodes.length);
    return { within: true, collapsed: selection.isCollapsed, atEnd: remaining.toString() === '' };
  })).toEqual({ within: true, collapsed: true, atEnd: true });
  await page.keyboard.insertText(text);
  await expect(target).toContainText(text);
}
async function saveFromBody(page: Page) { await page.keyboard.press('ControlOrMeta+s'); }
async function closeNativeDrawer(page: Page) {
  const peeks = page.getByRole('dialog', { name: '데이터베이스 항목', exact: true });
  // A later native portal covers earlier Close buttons. Close the owned stack
  // in visible order and verify each layer actually retired before continuing.
  while (await peeks.count()) {
    const count = await peeks.count();
    const topmost = peeks.last();
    await expect(topmost).toBeVisible();
    await topmost.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(peeks).toHaveCount(count - 1);
  }
  const drawer = page.getByRole('dialog', { name: '1행', exact: true });
  if (!await drawer.isVisible()) return;
  await drawer.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(drawer).toBeHidden();
}
async function exportNative(page: Page) {
  await closeNativeDrawer(page);
  const download = page.waitForEvent('download');
  await shell(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Site 파일 내보내기', exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8')) as { format: string; version: number; document: NativeNode };
}
async function openDocumentActions(page: Page) {
  await closeNativeDrawer(page);
  const panel = shell(page).getByRole('group', { name: '문서 작업', exact: true });
  if (!await panel.isVisible()) {
    await shell(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
    await page.getByRole('menuitem', { name: '열기…', exact: true }).click();
  }
  await expect(panel).toBeVisible();
}
async function recheck(page: Page) {
  const response = page.waitForResponse(reply => reply.url().endsWith('/api/v1/me'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await response;
  await expect(page.locator('#office-auth-curtain')).not.toBeVisible();
}
async function reopenAfterReload(page: Page) {
  await page.reload();
  await expect.poll(async () => await shell(page).isVisible() || await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible()).toBe(true);
  if (await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible()) await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await expect(shell(page).locator('.st-main')).toBeVisible();
}
async function pending(page: Page) {
  return page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).sort()
    .map(key => JSON.parse(localStorage.getItem(key)!)), pendingPrefix) as Promise<Array<{
      draftId: string; status: string; snapshotText: string; attempt?: SaveRequest;
      scope: { subject: string; documentRef: string }; base: { documentId?: string };
    }>>;
}

// These are mocked HTTP transport tests through the actual Site UI. Real OIDC/API/PG
// acceptance is separate; no editor globals or debug commands create user edits here.
test('Site full native save preserves pages, datasets, embedded assets and metadata without local bootstrap residue', async ({ page }) => {
  const state = await setup(page);
  await expect(shell(page).locator('[data-admin-page]').first()).toBeVisible();
  expect((await exportNative(page)).document).toEqual(state.source);
  const first = shell(page).locator('[data-admin-page]').first();
  const id = await first.getAttribute('data-admin-page');
  await first.getByRole('textbox').first().fill('Saved Site page');
  await first.getByRole('textbox').first().press('Enter');
  await expect(status(page)).toHaveText('저장되지 않음');
  await save(page).click(); await expect(status(page)).toHaveText('서버 저장 확인됨');
  const expected = structuredClone(state.source);
  nativeNode(expected, 'surface', id!).attributes!.name = 'Saved Site page';
  expect(JSON.parse(state.text()).document).toEqual(expected);
  expect(state.writes).toHaveLength(1); expect(state.revision()).toBe(2);
  expect((await exportNative(page)).document).toEqual(expected);
  expect(await page.evaluate(() => {
    const host = window as unknown as Record<string, unknown>;
    return ['editor', 'editorView', 'exportSite'].filter(key => host[key] !== undefined);
  })).toEqual([]);
  expect(await page.evaluate(async () => (await indexedDB.databases()).map(item => item.name).filter(name =>
    ['barocss-site', 'barocss-site-workspace', 'barocss-site-recovery'].includes(name ?? '')))).toEqual([]);
});

test('deepest open Note input is flushed by actual Save and survives exact native reopen', async ({ page }) => {
  const state = await setup(page, { deep: true, holdDelivery: true });
  const nested = await openBody(page, true);
  await typeBody(page, nested, ' DEEPEST-SITE-FINAL');
  expect(state.writes).toHaveLength(0);
  await expect(status(page)).toHaveText('본문 입력 반영 필요');
  await saveFromBody(page); await expect(status(page)).toHaveText('서버 저장 확인됨');
  const expected = structuredClone(state.source);
  nativeNode(expected, 'richText', 'inner-item').content![0].content![0].text += ' DEEPEST-SITE-FINAL';
  expect(JSON.parse(state.text()).document).toEqual(expected);
  await expect(nested).toContainText('DEEPEST-SITE-FINAL');
  await reopenAfterReload(page);
  expect((await exportNative(page)).document).toEqual(expected);
  await expect(await openBody(page, true)).toContainText('DEEPEST-SITE-FINAL');
});

test('synthetic deepest composition refuses Save and departure until the owned input ends', async ({ page }) => {
  const state = await setup(page, { deep: true, holdDelivery: true });
  const nested = await openBody(page, true), original = state.text();
  const paragraph = nested.locator('p').last();
  await paragraph.click();
  await paragraph.dispatchEvent('compositionstart', { data: '' });
  await page.keyboard.press('End'); await page.keyboard.insertText(' SYNTHETIC-COMPOSITION');
  await expect(paragraph).toContainText('SYNTHETIC-COMPOSITION');
  await saveFromBody(page);
  expect(state.writes).toHaveLength(0); expect(state.text()).toBe(original);
  await expect(status(page)).not.toHaveText('서버 저장 확인됨');
  const drawer = page.getByRole('dialog', { name: '1행', exact: true });
  const peeks = page.getByRole('dialog', { name: '데이터베이스 항목', exact: true });
  const peekCount = await peeks.count();
  expect(peekCount).toBe(2);
  await peeks.last().getByRole('button', { name: '닫기', exact: true }).click();
  await expect(peeks).toHaveCount(peekCount);
  await expect(drawer).toBeVisible();
  await expect(shell(page)).toBeVisible(); await expect(paragraph).toContainText('SYNTHETIC-COMPOSITION');
  expect(state.writes).toHaveLength(0); expect(state.text()).toBe(original);
  await paragraph.dispatchEvent('compositionend', { data: 'SYNTHETIC-COMPOSITION' });
  await paragraph.click(); await saveFromBody(page);
  await expect(status(page)).toHaveText('서버 저장 확인됨');
  const expected = structuredClone(state.source);
  nativeNode(expected, 'richText', 'inner-item').content![0].content![0].text += ' SYNTHETIC-COMPOSITION';
  expect(JSON.parse(state.text()).document).toEqual(expected);
  expect((await exportNative(page)).document).toEqual(expected);
  await expect(drawer).toBeHidden();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(shell(page)).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
});

test('lost acknowledgement keeps its immutable native attempt separate from later nested input', async ({ page }) => {
  const state = await setup(page, { lostAck: 'update', holdDelivery: true });
  const note = await openBody(page);
  await typeBody(page, note, ' FIXED-FIRST'); await saveFromBody(page);
  await expect(status(page)).toHaveText('저장 확인 필요');
  const fixed = structuredClone(state.writes[0].body);
  await typeBody(page, note, ' LATER-DRAFT');
  await saveFromBody(page);
  await expect(status(page)).toHaveText('저장되지 않음');
  expect(state.writes).toHaveLength(1);
  const records = await pending(page);
  expect(records.some(record => record.attempt?.idempotencyKey === fixed.idempotencyKey && record.attempt.snapshotText === fixed.snapshotText)).toBe(true);
  expect(records.some(record => record.status === 'draft' && record.snapshotText.includes('LATER-DRAFT'))).toBe(true);
  await saveFromBody(page); await expect(status(page)).toHaveText('서버 저장 확인됨');
  expect(state.writes).toHaveLength(2);
  expect(state.writes[0].body).toEqual(fixed);
  expect(state.writes[1].body.idempotencyKey).not.toBe(fixed.idempotencyKey);
  const expected = structuredClone(state.source);
  nativeNode(expected, 'richText', '본문-스택').content![0].content![0].text += ' FIXED-FIRST LATER-DRAFT';
  expect(JSON.parse(state.text()).document).toEqual(expected);
});

test('viewer can inspect deep row bodies but cannot type, delete, format or save', async ({ page }) => {
  const state = await setup(page, { viewer: true, deep: true });
  await expect(save(page)).toHaveCount(0);
  const initial = state.text(); const nested = await openBody(page, true);
  const before = await nested.innerText();
  await nested.locator('p').last().click();
  await page.keyboard.insertText('DENIED-SITE'); await page.keyboard.press('Backspace');
  await page.keyboard.press('ControlOrMeta+b'); await saveFromBody(page);
  await expect(nested).toHaveText(before);
  await expect(page.locator('[data-note-body] [contenteditable="true"], [data-db-item-body] [contenteditable="true"]')).toHaveCount(0);
  expect(state.writes).toHaveLength(0); expect(state.text()).toBe(initial);
  expect(await pending(page)).toEqual([]);
});

for (const mode of ['initializing', 'collaborative'] as const) test(`Site ${mode} refuses a snapshot editor`, async ({ page }) => {
  const state = await setup(page, { mode });
  await expect(page.getByRole('heading', { name: '공동 편집을 열 수 없습니다' })).toBeVisible();
  await expect(shell(page)).toHaveCount(0); expect(state.writes).toHaveLength(0);
});
test('wrong-product direct Site URL never mounts its native editor', async ({ page }) => {
  const state = await setup(page, { wrongProduct: true });
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
  await expect(shell(page)).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

test('quota failure blocks departure and keeps current nested input available for durable retry', async ({ page }) => {
  const state = await setup(page, { holdDelivery: true });
  const note = await openBody(page);
  await page.evaluate(prefix => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreSiteStorage(): void }).restoreSiteStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith(prefix)) throw new DOMException('Synthetic quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  }, pendingPrefix);
  await typeBody(page, note, ' UNPROTECTED-LATEST');
  await saveFromBody(page); await expect(status(page)).toHaveText('복구 저장 실패');
  await closeNativeDrawer(page);
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(shell(page)).toBeVisible();
  await expect(page.getByText('현재 입력을 복구 가능한 저장소에 보관하지 못했습니다.', { exact: false })).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await shell(page).getByRole('button', { name: '1행 펼치기', exact: true }).click();
  await expect(body(page)).toContainText('UNPROTECTED-LATEST');
  await page.evaluate(() => (window as unknown as { restoreSiteStorage(): void }).restoreSiteStorage());
  await saveFromBody(page); await expect(status(page)).toHaveText('서버 저장 확인됨');
  expect(state.text()).toContain('UNPROTECTED-LATEST');
});

test('deliberate departure protects deepest input and recovery reload does not replace the server head', async ({ page }) => {
  const state = await setup(page, { deep: true, holdDelivery: true });
  const nested = await openBody(page, true);
  await typeBody(page, nested, ' DEPARTURE-LAST');
  // Close the actual outer drawer. Its registered descendants still owe their flush.
  await closeNativeDrawer(page);
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(shell(page)).toHaveCount(0);
  expect(state.writes).toHaveLength(0); expect(state.text()).not.toContain('DEPARTURE-LAST');
  const records = await pending(page);
  expect(records.some(record => record.scope.subject === 'site-synthetic' && record.scope.documentRef === documentId &&
    record.status === 'draft' && record.snapshotText.includes('DEPARTURE-LAST'))).toBe(true);
  await page.goto(`/?tenant=${tenantId}&workspace=${workspaceId}&document=${documentId}&product=site`);
  if (await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible()) await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await expect(shell(page).locator('.st-main')).toBeVisible();
  expect((await exportNative(page)).document).toEqual(state.source);
  await openDocumentActions(page);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /저장된 Site 초안 복구/ }).click();
  await expect(await openBody(page, true)).toContainText('DEPARTURE-LAST');
  await saveFromBody(page); await expect(status(page)).toHaveText('서버 저장 확인됨');
  expect(state.text()).toContain('DEPARTURE-LAST');
});

test('explicit native file copy creates one server document and preserves the original source after lost acknowledgement', async ({ page }) => {
  const state = await setup(page, { lostAck: 'create' });
  await expect(shell(page).locator('.st-main')).toBeVisible();
  const local = fixture(true); local.metadata = { provenance: 'selected-native-source', linkedOriginal: 'local-site-original' };
  const source = siteFileText(local, 'source-time'); const sourceHash = hash(source);
  const oldServer = state.text();
  await openDocumentActions(page);
  await page.getByLabel('Site 원본 파일로 새 서버 사본 준비').setInputFiles({ name: 'selected.site.json', mimeType: 'application/json', buffer: Buffer.from(source) });
  await expect(status(page)).toHaveText('저장되지 않음');
  expect(state.writes).toHaveLength(0);
  await save(page).click(); await expect(status(page)).toHaveText('저장 확인 필요');
  await save(page).click(); await expect(status(page)).toHaveText('서버 저장 확인됨');
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({ operation: 'create', documentId: copyId,
    body: { product: 'site', fileFormat: 'barocss-site', fileVersion: 1, workspaceId } });
  expect(JSON.parse(state.text(copyId)).document).toEqual(local);
  expect(state.text()).toBe(oldServer); expect(hash(source)).toBe(sourceHash);
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${copyId}(?:\\?|$)`));
  expect((await exportNative(page)).document).toEqual(local);
});

test('current viewer demotion retires an open nested writer without replacing its visible draft', async ({ page }) => {
  const state = await setup(page, { holdDelivery: true });
  const note = await openBody(page); await typeBody(page, note, ' AUTHORIZED-DRAFT');
  const visible = await note.innerText();
  state.role('viewer'); await recheck(page);
  await expect(note).toHaveText(visible);
  await expect(page.locator('[data-note-body] [contenteditable="true"]')).toHaveCount(0);
  const before = await pending(page);
  await note.locator('p').last().click(); await page.keyboard.insertText('DENIED-AFTER-REVOKE');
  await page.keyboard.press('ControlOrMeta+z'); await saveFromBody(page);
  await expect(note).toHaveText(visible);
  expect(state.writes).toHaveLength(0); expect(await pending(page)).toEqual(before);
});

test('account replacement removes the old nested runtime and leaves its recovery scoped to the original account', async ({ page }) => {
  const state = await setup(page);
  const note = await openBody(page); await typeBody(page, note, ' ORIGINAL-ACCOUNT-DRAFT');
  await closeNativeDrawer(page);
  await expect.poll(async () => (await pending(page)).some(record => record.snapshotText.includes('ORIGINAL-ACCOUNT-DRAFT'))).toBe(true);
  const retained = await pending(page);
  state.subject('other-site-account'); await recheck(page);
  await expect(page.locator('[data-note-body], [data-db-item-body]')).toHaveCount(0);
  await expect(page.getByText('ORIGINAL-ACCOUNT-DRAFT', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /저장된 Site 초안 복구/ })).toHaveCount(0);
  expect(await pending(page)).toEqual(retained);
  expect(retained.every(record => record.scope.subject === 'site-synthetic')).toBe(true);
  expect(state.writes).toHaveLength(0);
});


test('held Site copy validation refuses replacement after new deepest source input', async ({ page }) => {
  const state = await setup(page, { deep: true, holdDelivery: true });
  await openDocumentActions(page);
  let entered!: () => void, release!: () => void;
  const held = new Promise<void>(resolve => { entered = resolve; });
  const resumed = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/v1/tenants/${tenantId}/documents?**`, async route => {
    entered(); await resumed; await route.fallback();
  }, { times: 1 });
  try {
    const candidate = fixture(true);
    candidate.metadata = { provenance: 'replacement-must-not-install' };
    await page.getByLabel('Site 원본 파일로 새 서버 사본 준비').setInputFiles({
      name: 'held.site.json', mimeType: 'application/json', buffer: Buffer.from(siteFileText(candidate, ''))
    });
    await held;
    await shell(page).locator('[data-document-identity]').click();
    const nested = await openBody(page, true);
    await typeBody(page, nested, ' HELD-COPY-LATEST');
    const completed = page.waitForResponse(response => response.request().method() === 'GET' &&
      new URL(response.url()).pathname.endsWith('/documents'));
    release(); await completed;
    const expected = structuredClone(state.source);
    nativeNode(expected, 'richText', 'inner-item').content![0].content![0].text += ' HELD-COPY-LATEST';
    expect((await exportNative(page)).document).toEqual(expected);
    expect(state.writes).toHaveLength(0);
    expect(JSON.parse(state.text()).document).toEqual(state.source);
    await saveFromBody(page); await expect(status(page)).toHaveText('서버 저장 확인됨');
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]!.operation).toBe('update');
    expect(JSON.parse(state.text()).document).toEqual(expected);
  } finally { release(); }
});

test('held Site recovery read refuses replacement after new deepest source input', async ({ page }) => {
  const state = await setup(page, { deep: true, holdDelivery: true });
  await typeBody(page, await openBody(page, true), ' OLDER-RECOVERY-DRAFT');
  await exportNative(page);
  await expect.poll(async () => (await pending(page)).some(record => record.snapshotText.includes('OLDER-RECOVERY-DRAFT'))).toBe(true);
  await reopenAfterReload(page);
  await openDocumentActions(page);
  let entered!: () => void, release!: () => void;
  const held = new Promise<void>(resolve => { entered = resolve; });
  const resumed = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/v1/tenants/${tenantId}/documents/${documentId}`, async route => {
    entered(); await resumed; await route.fallback();
  }, { times: 1 });
  try {
    await page.getByRole('button', { name: /저장된 Site 초안 복구/ }).click();
    await held;
    await shell(page).locator('[data-document-identity]').click();
    const nested = await openBody(page, true);
    await typeBody(page, nested, ' HELD-RECOVERY-LATEST');
    const completed = page.waitForResponse(response => response.request().method() === 'GET' &&
      new URL(response.url()).pathname.endsWith(`/documents/${documentId}`));
    release(); await completed;
    const expected = structuredClone(state.source);
    nativeNode(expected, 'richText', 'inner-item').content![0].content![0].text += ' HELD-RECOVERY-LATEST';
    expect((await exportNative(page)).document).toEqual(expected);
    expect(state.writes).toHaveLength(0);
    expect((await pending(page)).some(record => record.snapshotText.includes('OLDER-RECOVERY-DRAFT'))).toBe(true);
    await saveFromBody(page); await expect(status(page)).toHaveText('서버 저장 확인됨');
    expect(state.writes).toHaveLength(1);
    expect(JSON.parse(state.text()).document).toEqual(expected);
  } finally { release(); }
});

test('same-ID Site conflict latest genuinely reads and installs the complete newer server root', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const state = await setup(page, { deep: true, holdDelivery: true });
  await typeBody(page, await openBody(page, true), ' CONFLICT-PRIVATE');
  const newer = structuredClone(state.source);
  nativeNode(newer, 'richText', 'inner-item').content![0].content![0].text += ' OTHER-WRITER-CONFIRMED';
  state.advance(newer);
  await saveFromBody(page);
  // Observe the conflict output while its parent is aria-hidden by the real modal.
  // Genuine interaction follows only after closing the native owned stack below.
  await expect(shell(page).getByRole('button', { name: '충돌 초안 복사', exact: true, includeHidden: true })).toBeVisible();
  const fixed = structuredClone(state.writes[0]!.body);
  await closeNativeDrawer(page);
  await shell(page).getByRole('button', { name: '충돌 초안 복사', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(fixed.snapshotText);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const privateExpected = structuredClone(state.source);
  nativeNode(privateExpected, 'richText', 'inner-item').content![0].content![0].text += ' CONFLICT-PRIVATE';
  expect(JSON.parse(copied).document).toEqual(privateExpected);
  const latestRead = page.waitForResponse(response => response.request().method() === 'GET' &&
    new URL(response.url()).pathname.endsWith(`/documents/${documentId}`));
  await shell(page).getByRole('button', { name: '서버 최신본 열기', exact: true }).click();
  await latestRead;
  await expect(status(page)).toHaveText('서버 저장 확인됨');
  expect((await exportNative(page)).document).toEqual(newer);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]!.body).toEqual(fixed);
  expect((await pending(page)).filter(record => record.snapshotText === fixed.snapshotText).map(record => record.attempt))
    .toContainEqual({ ...fixed, operation: 'update', documentId });
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${documentId}(?:\\?|$)`));
});


test('Site file with a missing required referenced body preserves edited native, durable draft and editing continuity', async ({ page }) => {
  const state = await setup(page, { deep: true, holdDelivery: true });
  const nested = await openBody(page, true);
  await typeBody(page, nested, ' RETAINED-BEFORE-INVALID-FILE');
  const expected = structuredClone(state.source);
  nativeNode(expected, 'richText', 'inner-item').content![0].content![0].text += ' RETAINED-BEFORE-INVALID-FILE';
  expect((await exportNative(page)).document).toEqual(expected);
  await expect.poll(async () => (await pending(page)).filter(record => record.status === 'draft')
    .map(record => JSON.parse(record.snapshotText).document)).toContainEqual(expected);
  const durableBefore = await pending(page);
  const selectedBody = await openBody(page, true);
  const paragraph = selectedBody.locator('.on-doc > p').last();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.press('Shift+ArrowLeft');
  const selectionOf = () => selectedBody.evaluate(root => {
    const selection = window.getSelection();
    const path = (node: Node | null): number[] | null => {
      if (!node || !root.contains(node)) return null;
      const result: number[] = [];
      let cursor: Node = node;
      while (cursor !== root) {
        const parent: ParentNode | null = cursor.parentNode;
        if (!parent) return null;
        result.unshift(Array.from(parent.childNodes).indexOf(cursor as ChildNode)); cursor = parent;
      }
      return result;
    };
    return selection ? { anchor: path(selection.anchorNode), focus: path(selection.focusNode),
      anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset, collapsed: selection.isCollapsed } : null;
  });
  const selectionBefore = await selectionOf();
  expect(selectionBefore?.anchor).not.toBeNull();
  expect(selectionBefore?.collapsed).toBe(false);
  const nativeParagraph = await paragraph.elementHandle();
  expect(nativeParagraph).not.toBeNull();
  const malformed = fixture(true);
  // Row IDs alone permit lazy empty Note bodies. This is an explicit required
  // Site rich-text cell whose target is resolved in the root resources scope.
  const rootResources = malformed.content!.find(node => node.stype === 'resources')!;
  const referencedDataset = nativeNode(malformed, 'dataset', '글');
  expect(referencedDataset.attributes!.fields).toContainEqual({ name: '본문', kind: 'richText' });
  expect((referencedDataset.attributes!.records as Array<Record<string, unknown>>)[0]!.본문).toBe('text:본문-스택');
  expect(rootResources.content!.filter(node => node.stype === 'richText' && node.attributes?.id === '본문-스택')).toHaveLength(1);
  rootResources.content = rootResources.content!.filter(node => !(node.stype === 'richText' && node.attributes?.id === '본문-스택'));
  // Header file selection requires a legitimate modal close. The deepest DOM
  // selection owner is disposed here; native content and durable bytes must survive.
  await closeNativeDrawer(page);
  expect(await nativeParagraph!.evaluate(node => node.isConnected)).toBe(false);
  expect((await exportNative(page)).document).toEqual(expected);
  expect(await pending(page)).toEqual(durableBefore);
  await openDocumentActions(page);
  page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('Site 원본 파일로 새 서버 사본 준비').setInputFiles({ name: 'missing-referenced-body.site.json',
    mimeType: 'application/json', buffer: Buffer.from(siteFileText(malformed, '')) });
  await expect(shell(page).getByRole('alert').filter({ hasText: '지원하지 않는 Site 파일입니다.' })).toBeVisible();
  expect(state.writes).toHaveLength(0);
  expect(JSON.parse(state.text()).document).toEqual(state.source);
  expect(await pending(page)).toEqual(durableBefore);
  expect((await exportNative(page)).document).toEqual(expected);
  await shell(page).locator('[data-document-identity]').click();
  await typeBody(page, await openBody(page, true), ' CONTINUED-AFTER-REFUSAL');
  nativeNode(expected, 'richText', 'inner-item').content![0].content![0].text += ' CONTINUED-AFTER-REFUSAL';
  expect((await exportNative(page)).document).toEqual(expected);
  expect(state.writes).toHaveLength(0);
  await expect.poll(async () => (await pending(page)).filter(record => record.status === 'draft')
    .map(record => JSON.parse(record.snapshotText).document)).toContainEqual(expected);
});


for (const replacement of ['copy', 'recovery'] as const) test(`synthetic DOM-only beforeinput retires held Site ${replacement} replacement without losing the active source`, async ({ page }) => {
  const state = await setup(page, { deep: true, holdDelivery: true });
  if (replacement === 'recovery') {
    await typeBody(page, await openBody(page, true), ' OLDER-DOM-INTENT-DRAFT');
    await exportNative(page);
    await expect.poll(async () => (await pending(page)).some(record => record.snapshotText.includes('OLDER-DOM-INTENT-DRAFT'))).toBe(true);
    await reopenAfterReload(page);
  }
  // This complete public native observation precedes the held interval. Export
  // cannot be invoked inside it without closing the tested modal source owner.
  expect((await exportNative(page)).document).toEqual(state.source);
  await openDocumentActions(page);
  let entered!: () => void, release!: () => void;
  const held = new Promise<void>(resolve => { entered = resolve; });
  const resumed = new Promise<void>(resolve => { release = resolve; });
  const targetPath = replacement === 'copy' ? '/documents' : `/documents/${documentId}`;
  await page.route(`**/api/v1/tenants/${tenantId}${targetPath}${replacement === 'copy' ? '?**' : ''}`, async route => {
    entered(); await resumed; await route.fallback();
  }, { times: 1 });
  const trigger = replacement === 'copy' ? page.getByLabel('Site 원본 파일로 새 서버 사본 준비')
    : page.getByRole('button', { name: /저장된 Site 초안 복구/ });
  try {
    if (replacement === 'copy') {
      const candidate = fixture(true); candidate.metadata = { provenance: 'DOM-intent-target-must-not-install' };
      await trigger.setInputFiles({ name: 'held-dom-intent.site.json', mimeType: 'application/json', buffer: Buffer.from(siteFileText(candidate, '')) });
    } else await trigger.click();
    await held;
    await expect(trigger).toBeDisabled();
    await shell(page).locator('[data-document-identity]').click();
    const nested = await openBody(page, true), paragraph = nested.locator('.on-doc > p').last();
    await paragraph.click(); await page.keyboard.press('End');
    const originalText = await paragraph.textContent(), originalParagraph = await paragraph.elementHandle();
    expect(originalParagraph).not.toBeNull();
    await paragraph.evaluate(element => {
      element.addEventListener('beforeinput', event => {
        const input = event as InputEvent;
        element.setAttribute('data-controlled-beforeinput', JSON.stringify({ trusted: input.isTrusted,
          ranges: input.getTargetRanges().length, type: input.inputType }));
      }, { once: true });
    });
    // Controlled actual DOM ownership signal only: no input event, browser DOM
    // edit or model command follows before releasing the target read.
    // Playwright's generic dispatchEvent does not select InputEvent for beforeinput.
    // Use the browser constructor so actual native listeners receive its contract.
    await paragraph.evaluate(element => element.dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'insertText', data: 'UNAPPLIED-DOM-INTENT', bubbles: true, composed: true, cancelable: true
    })));
    expect(JSON.parse((await paragraph.getAttribute('data-controlled-beforeinput'))!)).toEqual({ trusted: false, ranges: 0, type: 'insertText' });
    expect(await originalParagraph!.evaluate(node => node.isConnected)).toBe(true);
    await expect(paragraph).toHaveText(originalText!);
    expect(JSON.parse(state.text()).document).toEqual(state.source);
    expect(state.writes).toHaveLength(0);
    const completed = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith(targetPath));
    release(); await completed;
    // The source identity gesture deliberately unmounted the file popup.
    // Export's button is disabled only for a missing current owner or busy work.
    // Observe it without clicking, reopening the popup or closing the tested owner.
    await expect(shell(page).getByRole('button', { name: 'Site 파일 내보내기', exact: true, includeHidden: true })).toBeEnabled();
    expect(await originalParagraph!.evaluate(node => node.isConnected)).toBe(true);
    await expect(paragraph).toHaveText(originalText!);
    await typeBody(page, nested, ` HEALTHY-AFTER-DOM-${replacement}`);
    await saveFromBody(page); await expect(status(page)).toHaveText('서버 저장 확인됨');
    const expected = structuredClone(state.source);
    nativeNode(expected, 'richText', 'inner-item').content![0].content![0].text += ` HEALTHY-AFTER-DOM-${replacement}`;
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]!.operation).toBe('update');
    expect(state.writes[0]!.documentId).toBe(documentId);
    expect(JSON.parse(state.text()).document).toEqual(expected);
    expect((await exportNative(page)).document).toEqual(expected);
    if (replacement === 'recovery') expect((await pending(page)).some(record => record.snapshotText.includes('OLDER-DOM-INTENT-DRAFT'))).toBe(true);
  } finally { release(); }
});
