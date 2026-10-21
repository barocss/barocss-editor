import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { siteNativeFixture, siteNativeNode } from './helpers/site-native-fixture';
import { siteFileText } from '../../../packages/office-site/src/site-file';
import { privateControl, launchPrivateProfile, stopPrivateProfile, type RealStatus, type Inspection } from './helpers/real-recovery-control';

const origin = 'http://127.0.0.1:5191';
const workspace = (page: Page) => page.locator('[data-server-site-workspace]');
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
async function showNavigation(page: Page) {
  await closeNativeDrawer(page);
  // Before the first native document opens, the owned server list is rendered
  // directly. Its visible import control has no EditorHeader menu owner yet.
  const initialList = workspace(page).getByRole('complementary', { name: '서버 Site 목록', exact: true });
  const initialImport = initialList.getByLabel('Site 원본 파일로 새 서버 사본 준비');
  if (await initialList.isVisible() && await initialImport.isVisible()) return;
  const panel = workspace(page).getByRole('group', { name: '문서 작업', exact: true });
  if (await panel.isVisible()) return;
  await workspace(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: '열기…', exact: true }).click();
  await expect(panel).toBeVisible();
}
async function closeNavigation(page: Page) {
  const panel = workspace(page).getByRole('group', { name: '문서 작업', exact: true });
  if (await panel.isVisible()) {
    await workspace(page).locator('[data-document-identity]').click();
    await expect(panel).toBeHidden();
  }
}
async function openBody(page: Page) {
  const existing = page.locator('[data-db-item-body]').last().locator('.on-doc > p').last();
  const dataTab = workspace(page).locator('.st-admin [data-admin-tab="data"]');
  // Wait for a connected native surface, not just the authenticated outer shell.
  await expect.poll(async () => await existing.isVisible() || await dataTab.isVisible()).toBe(true);
  if (await existing.isVisible()) return existing;
  await expect(dataTab).toBeVisible();
  if (!await page.locator('[data-row-open="0"]').isVisible()) {
    await dataTab.click();
    await page.locator('[data-admin-open="글"]').click();
  }
  await page.getByRole('button', { name: '1행 펼치기', exact: true }).click();
  const body = page.locator('[data-row-form] [data-field="본문"] [data-note-body]');
  await body.getByRole('button', { name: '행 1 열기', exact: true }).click();
  await page.locator('[data-db-item-body]').last().getByRole('button', { name: '행 1 열기', exact: true }).click();
  const paragraph = page.locator('[data-db-item-body]').last().locator('.on-doc > p').last();
  await expect(paragraph).toBeVisible(); return paragraph;
}
async function nativeExport(page: Page) {
  await closeNativeDrawer(page);
  await workspace(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Site 파일 내보내기', exact: true }).click();
}
async function recoverDraft(page: Page, savedAt: string) {
  await showNavigation(page);
  await workspace(page).getByRole('button', { name: `저장된 Site 초안 복구 · ${savedAt}`, exact: true }).click();
  await closeNavigation(page);
}
// Status observation may occur while the actual native modal hides its parent.
const save = (page: Page) => workspace(page).getByRole('button', { name: /^(저장|저장 확인·재시도)$/, includeHidden: true });
const saved = (page: Page) => workspace(page).locator('[data-save-status]');
async function saveDocument(page: Page) {
  if (await page.getByRole('dialog', { name: '1행', exact: true }).isVisible()) {
    // Keep the deepest input open. Its genuine Save shortcut owns delivery.
    await page.keyboard.press('ControlOrMeta+s');
  } else await workspace(page).getByRole('button', { name: /^(저장|저장 확인·재시도)$/ }).click();
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
type Alias = 'alpha-editor' | 'beta-viewer';
interface Pending {
  draftId: string; status: string; snapshotText: string; savedAt: string; scope: { subject: string };
  attempt?: { operation: 'create' | 'update'; idempotencyKey: string; snapshotText: string };
}
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.skip(!process.env.OFFICE_AUTH_REAL_FILE || !process.env.OFFICE_AUTH_CONTROL_FILE,
  'Site acceptance requires the protected synthetic OIDC fixture and disposable PostgreSQL supervisor.');

async function login(page: Page, alias: Alias, url = origin, tenant: 'Alpha' | 'Beta' = 'Alpha', controlledRole?: 'editor' | 'viewer') {
  const fixture = JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8')) as {
    issuer: string; users: Record<Alias, { id: string; username?: string; password: string }>;
  };
  const account = fixture.users[alias];
  expect(typeof fixture.issuer === 'string' && typeof account?.id === 'string',
    'Protected identity fixture must provide the requested account.').toBe(true);
  await page.goto(url);
  await expect.poll(async () => await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible() ||
    await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await workspace(page).isVisible()).toBe(true);
  const button = page.getByRole('button', { name: '일반 사용자로 들어가기' });
  if (await button.isVisible()) {
    await button.click();
    const username = page.locator('#username');
    // An existing host is only a navigation state. The fresh server identity
    // witness below must still prove that it belongs to the requested account.
    await expect.poll(async () => await username.isVisible() ||
      await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() ||
      await workspace(page).isVisible(), { timeout: 30_000 }).toBe(true);
    if (await username.isVisible()) {
      await username.fill(account.username ?? alias);
      await page.locator('#password').fill(account.password);
      await page.locator('#kc-login').click();
    }
  }
  await expect.poll(async () => await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() ||
    await workspace(page).isVisible()).toBe(true);
  const status = await privateControl<RealStatus>({ action: 'status' });
  const tenantId = tenant === 'Alpha' ? status.tenantId : status.betaTenantId;
  // Match the exact tenant memberships seeded by office-auth-ui.local.mjs.
  const expectedRole = controlledRole ?? {
    Alpha: { 'alpha-editor': 'owner', 'beta-viewer': 'viewer' },
    Beta: { 'alpha-editor': null, 'beta-viewer': 'owner' },
  }[tenant][alias];
  expect(expectedRole !== null, 'Requested fixture account must have seeded tenant access.').toBe(true);
  // Read through the application's actual session. These calls use fresh,
  // server-verified reads; no token decoding or visible-host shortcut is used.
  // Keep both expected and actual private identities out of assertion diffs.
  await expect.poll(async () => {
    try {
      const verified = await page.evaluate(async ({ source, tenantId }) => {
        const client = await import(source);
        const identity = await client.loadIdentity();
        const role = await client.confirmTenant(tenantId);
        return { issuer: identity.issuer, subject: identity.subject, role,
          listedRole: identity.tenants.find((item: { tenantId: string }) => item.tenantId === tenantId)?.role };
      }, { source: '/src/auth-client.ts', tenantId });
      return verified.issuer === fixture.issuer && verified.subject === account.id &&
        verified.role === expectedRole && verified.listedRole === expectedRole;
    } catch { return false; }
  }, { timeout: 30_000, message: 'Fresh server identity and role must match the requested fixture account.' }).toBe(true);
  if (!(await workspace(page).isVisible())) {
    await page.getByRole('button', { name: new RegExp(`Synthetic ${tenant}`) }).click();
    await page.getByRole('button', { name: `${tenant} workspace`, exact: true }).click();
    await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
    await page.getByRole('button', { name: 'Site 자료', exact: true }).click();
    await page.getByRole('button', { name: '새 Site 만들기', exact: true }).click();
  }
  await expect(workspace(page)).toBeVisible();
  await expect(page.locator('.ow-file-navigation')).toBeVisible();
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
}
async function logout(page: Page) {
  await closeNativeDrawer(page);
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wonffice에 들어가기' })).toBeVisible();
}
function track(page: Page) {
  const state = { bearer: '', writes: [] as Array<{ operation: 'create' | 'update'; body: Record<string, unknown> }> };
  page.on('request', request => {
    if (request.headers().authorization) state.bearer = request.headers().authorization;
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && /\/documents$/.test(path)) state.writes.push({ operation: 'create', body: request.postDataJSON() });
    if (request.method() === 'PUT' && /\/snapshot$/.test(path)) state.writes.push({ operation: 'update', body: request.postDataJSON() });
  });
  return state;
}
async function rows(page: Page) {
  return page.evaluate(() => new Promise<unknown[]>((resolve, reject) => {
    const request = indexedDB.open('barocss-site-workspace', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'name' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents'), result = tx.objectStore('documents').getAll();
      tx.oncomplete = () => { db.close(); resolve(result.result); };
      tx.onabort = () => reject(tx.error);
    };
  }));
}
async function seed(page: Page, title: string) {
  const name = randomUUID(), document = siteNativeFixture(true);
  document.metadata = { originalOwner: 'synthetic-A', loadedAt: 'original-native-loadedAt' };
  const text = siteFileText(document, '2026-10-01T00:00:00.000Z');
  await page.evaluate(({ name, title, text }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('barocss-site-workspace', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'name' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ name, title, text, count: 1, savedAt: 100,
        metadata: { favorite: true, purpose: 'Site source-retention' } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  }), { name, title, text });
  return { name, title, text, document };
}
async function records(page: Page): Promise<Pending[]> {
  return page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.site.pending.v1:'))
    .map(key => JSON.parse(localStorage.getItem(key)!)));
}
async function typeInput(page: Page, text: string) {
  await closeNavigation(page);
  const paragraph = await openBody(page);
  await expect(paragraph).toBeVisible();
  await paragraph.click();
  const apple = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform));
  await page.keyboard.press(apple ? 'Meta+ArrowDown' : 'Control+End');
  // Read only the owned DOM caret. macOS End scrolls and can retain an earlier
  // offset; the expected full native file requires the genuine input to append.
  await expect.poll(() => paragraph.evaluate(element => {
    const selection = window.getSelection();
    if (!selection?.anchorNode || !element.contains(selection.anchorNode)) return { within: false, collapsed: false, atEnd: false };
    const remaining = document.createRange();
    remaining.setStart(selection.anchorNode, selection.anchorOffset);
    remaining.setEnd(element, element.childNodes.length);
    return { within: true, collapsed: selection.isCollapsed, atEnd: remaining.toString() === '' };
  })).toEqual({ within: true, collapsed: true, atEnd: true });
  await page.keyboard.insertText(text);
  await expect(paragraph).toContainText(text);
  // Keep the deepest input open. The following Save owns its delivery.
  await expect(save(page)).toBeEnabled();
}
async function prepare(page: Page, title: string) {
  await showNavigation(page);
  await workspace(page).getByRole('button', { name: '이 기기의 로컬 문서 목록 확인' }).click();
  await workspace(page).getByRole('button', { name: `${title} · 새 서버 사본 준비`, exact: true }).click();
  await closeNavigation(page);
  await expect(save(page)).toBeEnabled();
  return (await records(page)).find(record => record.status === 'pending')!;
}
function inspect(documentId?: string, key?: string, operation: 'create' | 'update' = 'update', actor: Alias = 'alpha-editor') {
  return privateControl<Inspection<'site'>>({ action: 'inspect', product: 'site', ...(documentId ? { documentId } : {}),
    ...(key ? { idempotencyKey: key, operation, actor } : {}) });
}
async function canonical(page: Page, root: string, bearer: string, documentId: string, expected?: string) {
  const db = await inspect(documentId);
  expect(db.document).not.toBeNull();
  const response = await page.request.get(`${root}/documents/${documentId}`, { headers: { Authorization: bearer } });
  expect(response.status()).toBe(200);
  const api = await response.json();
  expect(api.snapshotText).toBe(db.document!.snapshotText);
  if (expected) expect(api.snapshotText).toBe(expected);
  expect(api.document.product).toBe('site');
  expect(api.document.pageId).toBeNull();
  expect(api.document.fileFormat).toBe('barocss-site');
  expect(api.document.fileVersion).toBe(1);
  expect(api.document.revision).toBe(db.document!.revision);
  expect(api.document.tenantId).toBe(db.document!.tenantId);
  expect(api.document.workspaceId).toBe(db.document!.workspaceId);
  expect(api.document.metadataRevision).toBe(db.document!.metadataRevision);
  expect(hash(api.snapshotText)).toBe(db.document!.snapshotHash);
  expect(JSON.parse(api.snapshotText).document).toEqual(db.document!.canonicalTree);
  await closeNavigation(page);
  const downloading = page.waitForEvent('download');
  await nativeExport(page);
  const file = await downloading;
  const native = JSON.parse(readFileSync((await file.path())!, 'utf8'));
  expect(native.document).toEqual(JSON.parse(api.snapshotText).document);
  return db;
}

// One serial schedule owns its profiles and all private service controls.
test('real Site native copy, fixed loss recovery, durable restart and sequential writers', async () => {
  test.setTimeout(360_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!), evidenceFile = join(directory, 'site-real-recovery.json');
  const profileA = mkdtempSync(join(directory, 'site-a-')), profileB = mkdtempSync(join(directory, 'site-b-'));
  let a: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let b: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let passed = false;
  const evidence: Array<Record<string, unknown>> = [];
  writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete' }), { mode: 0o600 });
  try {
    const status = await privateControl<RealStatus>({ action: 'status' });
    const root = `${origin}/api/v1/tenants/${status.tenantId}`;
    a = await launchPrivateProfile(profileA);
    let page = await a.context.newPage(), requests = track(page);
    await login(page, 'alpha-editor');
    const source = await seed(page, 'Real rich Site copy'), originalRows = await rows(page);
    // This expected tree comes from the original fixture, not a server receipt.
    const expectedNative = structuredClone(source.document);
    const expectedText = siteNativeNode(expectedNative, 'richText', 'inner-item').content![0].content![0];
    const pending = await prepare(page, source.title);
    expect(pending.snapshotText).toBe(source.text);
    const key = pending.attempt!.idempotencyKey, before = await inspect();
    await page.route(`${root}/documents`, async route => {
      expect((await route.fetch()).ok()).toBe(true);
      await route.abort('failed');
    }, { times: 1 });
    await saveDocument(page);
    await expect(save(page)).toBeEnabled();
    await expect(saved(page)).not.toHaveText('서버 저장 확인됨');
    const uncertain = await inspect(undefined, key, 'create');
    expect(uncertain.receipt).not.toBeNull();
    expect(uncertain.receipt!.operation).toBe('create');
    expect(uncertain.receipt!.idempotencyKey).toBe(key);
    expect(uncertain.receipt!.snapshotText).toBe(source.text);
    expect(uncertain.receipt!.document.pageId).toBeNull();
    expect(uncertain.receipt!.document.revision).toBe(1);
    expect(uncertain.receipt!.document.snapshotHash).toBe(hash(source.text));
    expect(uncertain.documentCount).toBe(before.documentCount + 1);
    expect(uncertain.receiptCount).toBe(before.receiptCount + 1);
    const documentId = uncertain.receipt!.documentId;
    expect(requests.writes[0]!.body).toMatchObject({ product: 'site', fileFormat: 'barocss-site', fileVersion: 1,
      snapshotText: source.text, idempotencyKey: key });
    expect(requests.writes[0]!.body).not.toHaveProperty('importMode');
    const fixed = requests.writes[0]!.body;
    expect(await rows(page)).toEqual(originalRows);
    await page.reload();
    // An unconfirmed create has no verified document URL. Re-enter the same
    // authenticated Site workspace before selecting its retained pending copy.
    await login(page, 'alpha-editor', page.url());
    page.once('dialog', dialog => dialog.accept());
    await recoverDraft(page, pending.savedAt);
    const createsBefore = requests.writes.length;
    await saveDocument(page);
    await expect(saved(page)).toHaveText('서버 저장 확인됨');
    expect(requests.writes).toHaveLength(createsBefore);
    const documentUrl = page.url();
    await canonical(page, root, requests.bearer, documentId, source.text);
    expect((await inspect(undefined, key, 'create')).receipt!.snapshotText).toBe(source.text);
    expect((await records(page)).find(record => record.attempt?.idempotencyKey === key)?.status).toBe('confirmed');
    const crossTenant = await page.request.get(`${origin}/api/v1/tenants/${status.betaTenantId}/documents/${documentId}`,
      { headers: { Authorization: requests.bearer } });
    expect(crossTenant.status()).toBe(403);
    expect((await inspect(documentId)).document!.snapshotText).toBe(source.text);
    expect(await rows(page)).toEqual(originalRows);
    for (const loss of ['before', 'after'] as const) {
      await typeInput(page, ` Site-${loss}-input`);
      expectedText.text += ` Site-${loss}-input`;
      const beforeUpdate = await inspect(documentId), index = requests.writes.length;
      await page.route(`${root}/documents/${documentId}/snapshot`, async route => {
        if (loss === 'after') expect((await route.fetch()).ok()).toBe(true);
        await route.abort('failed');
      }, { times: 1 });
      await saveDocument(page);
      await expect(save(page)).toBeEnabled();
      const update = requests.writes[index]!.body, updateKey = update.idempotencyKey as string;
      expect((await records(page)).some(record => record.attempt?.idempotencyKey === updateKey &&
        record.snapshotText === update.snapshotText && record.status === 'pending')).toBe(true);
      const unclear = await inspect(documentId, updateKey);
      expect(unclear.receipt === null).toBe(loss === 'before');
      expect(unclear.document!.revision).toBe(beforeUpdate.document!.revision + (loss === 'after' ? 1 : 0));
      const recovery = (await records(page)).find(record => record.attempt?.idempotencyKey === updateKey)!;
      await page.reload();
      page.once('dialog', dialog => dialog.accept());
      await recoverDraft(page, recovery.savedAt);
      const retryIndex = requests.writes.length;
      await saveDocument(page);
      await expect(saved(page)).toHaveText('서버 저장 확인됨');
      if (loss === 'before') expect(requests.writes[retryIndex]!.body).toEqual(update);
      else expect(requests.writes).toHaveLength(retryIndex);
      const result = await canonical(page, root, requests.bearer, documentId, update.snapshotText as string);
      expect(result.document!.revision).toBe(beforeUpdate.document!.revision + 1);
      expect(result.receiptCount).toBe(beforeUpdate.receiptCount + 1);
      evidence.push({ kind: `update-${loss}`, revision: result.document!.revision, hash: result.document!.snapshotHash });
    }
    await typeInput(page, ' latest-input-before-process-restart');
    expectedText.text += ' latest-input-before-process-restart';
    // Durable restart is distinct from immediate Save. The real drawer Close
    // must deliver the input before its private draft can survive process loss.
    await closeNativeDrawer(page);
    await expect.poll(async () => (await records(page)).some(record => record.status === 'draft' && record.snapshotText.includes('latest-input-before-process-restart'))).toBe(true);
    const latest = (await records(page)).find(record => record.status === 'draft' &&
      record.snapshotText.includes('latest-input-before-process-restart'))!;
    const oldPid = a.pid;
    await stopPrivateProfile(a.context, a.pid); a = undefined;
    const apiStopped = await privateControl<RealStatus>({ action: 'api-stop' });
    const apiStarted = await privateControl<RealStatus>({ action: 'api-start' });
    expect(apiStopped.apiRunning).toBe(false);
    expect(apiStarted.apiPid).not.toBe(status.apiPid);
    expect(apiStarted.databaseIdentity).toBe(status.databaseIdentity);
    expect(apiStarted.databaseGeneration).toBe(status.databaseGeneration);
    expect(apiStarted.postgresPid).toBe(status.postgresPid);
    a = await launchPrivateProfile(profileA); expect(a.pid).not.toBe(oldPid);
    page = await a.context.newPage(); requests = track(page);
    await login(page, 'alpha-editor', documentUrl);
    page.once('dialog', dialog => dialog.accept());
    await recoverDraft(page, latest.savedAt);
    expect((await records(page)).some(record => record.snapshotText.includes('latest-input-before-process-restart'))).toBe(true);
    expect((await records(page)).find(record => record.draftId === latest.draftId)?.snapshotText).toBe(latest.snapshotText);
    const dbBefore = await inspect(documentId);
    await page.route(`${root}/documents/${documentId}/snapshot`, async route => {
      await privateControl({ action: 'db-stop' });
      await route.continue();
    }, { times: 1 });
    const failed = page.waitForResponse(response => response.request().method() === 'PUT' && /\/snapshot$/.test(new URL(response.url()).pathname));
    await saveDocument(page); expect((await failed).status()).toBe(503);
    await expect(saved(page)).not.toHaveText('서버 저장 확인됨');
    const failedUpdate = requests.writes.at(-1)!.body;
    await privateControl({ action: 'db-start' });
    await saveDocument(page); await expect(saved(page)).toHaveText('서버 저장 확인됨');
    expect(requests.writes.at(-1)!.body).toEqual(failedUpdate);
    const restored = await canonical(page, root, requests.bearer, documentId, failedUpdate.snapshotText as string);
    const findNative = (value: unknown, stype: string): unknown[] => {
      if (!value || typeof value !== 'object') return [];
      const node = value as { stype?: string; content?: unknown[] };
      return [...(node.stype === stype ? [value] : []), ...(node.content ?? []).flatMap(child => findNative(child, stype))];
    };
    expect(restored.document!.canonicalTree).toEqual(expectedNative);
    for (const type of ['docMeta', 'asset', 'surface', 'resources', 'dataset', 'richText']) {
      const expectedNodes = findNative(expectedNative, type);
      expect(expectedNodes.length, `The original fixture must exercise ${type}.`).toBeGreaterThan(0);
      expect(findNative(restored.document!.canonicalTree, type)).toEqual(expectedNodes);
    }
    expect(restored.databaseIdentity).toBe(status.databaseIdentity);
    expect(restored.document!.revision).toBe(dbBefore.document!.revision + 1);
    expect(await rows(page)).toEqual(originalRows);
    b = await launchPrivateProfile(profileB);
    const other = await b.context.newPage(), otherRequests = track(other);
    await login(other, 'beta-viewer', documentUrl);
    await expect(save(other)).toHaveCount(0);
    const viewerParagraph = await openBody(other);
    const viewerText = await viewerParagraph.textContent();
    await viewerParagraph.click(); await other.keyboard.type('viewer-forbidden-input');
    await expect(viewerParagraph).toHaveText(viewerText!);
    await expect(other.locator('[data-row-form] [contenteditable=true], [data-db-item-body] [contenteditable=true]')).toHaveCount(0);
    await other.keyboard.press('Escape');
    const denied = await other.request.put(`${root}/documents/${documentId}/snapshot`, { headers: { Authorization: otherRequests.bearer },
      data: { expectedRevision: restored.document!.revision, snapshotText: restored.document!.snapshotText, idempotencyKey: 'site-viewer-denied' } });
    expect(denied.status()).toBe(403);
    expect((await inspect(documentId, 'site-viewer-denied', 'update', 'beta-viewer')).receipt).toBeNull();
    expect((await inspect(documentId)).document).toEqual(restored.document);
    await privateControl({ action: 'beta-role', role: 'editor' });
    await login(other, 'beta-viewer', documentUrl, 'Alpha', 'editor');
    // A reload ends navigation before the asynchronous server document opens.
    // Establish B's actual stale source before A advances the revision.
    await expect(workspace(other).locator('.st-main')).toBeVisible();
    await expect(saved(other)).toHaveText('서버 저장 확인됨');
    const beforeWriterA = await inspect(documentId);
    const exportedB = other.waitForEvent('download');
    await nativeExport(other);
    const bFile = await exportedB;
    const bNative = JSON.parse(readFileSync((await bFile.path())!, 'utf8'));
    expect(bNative.document).toEqual(JSON.parse(beforeWriterA.document!.snapshotText).document);
    await test.info().attach('stale-B-before-A.json', { body: JSON.stringify({ revision: beforeWriterA.document!.revision, document: bNative.document }), contentType: 'application/json' });
    await typeInput(page, ' writer-A-committed'); await saveDocument(page);
    expectedText.text += ' writer-A-committed';
    await expect(saved(page)).toHaveText('서버 저장 확인됨');
    const afterA = await inspect(documentId);
    expect(afterA.document!.canonicalTree).toEqual(expectedNative);
    await typeInput(other, ' stale-writer-B-retained'); await saveDocument(other);
    await closeNativeDrawer(other);
    await expect(workspace(other).getByRole('button', { name: '충돌 초안 복사', exact: true })).toBeVisible();
    expect((await records(other)).some(record => record.snapshotText.includes('stale-writer-B-retained'))).toBe(true);
    expect((await inspect(documentId)).document).toEqual(afterA.document);
    await workspace(other).getByRole('button', { name: '충돌 초안 복사', exact: true }).click();
    other.once('dialog', dialog => dialog.accept());
    await workspace(other).getByRole('button', { name: '서버 최신본 열기' }).click();
    await typeInput(other, ' writer-B-reconciled'); await saveDocument(other);
    await expect(saved(other)).toHaveText('서버 저장 확인됨');
    const afterB = await canonical(other, root, otherRequests.bearer, documentId);
    expectedText.text += ' writer-B-reconciled';
    expect(afterB.document!.canonicalTree).toEqual(expectedNative);
    expect(afterB.document!.revision).toBe(afterA.document!.revision + 1);
    expect(afterB.document!.snapshotText).toContain('writer-A-committed');
    expect(afterB.document!.snapshotText).toContain('writer-B-reconciled');
    expect(afterB.document!.snapshotText).not.toContain('stale-writer-B-retained');
    await page.reload(); await canonical(page, root, requests.bearer, documentId);
    await privateControl({ action: 'beta-active', active: false });
    const revoked = await other.request.get(`${root}/documents/${documentId}`, { headers: { Authorization: otherRequests.bearer } });
    expect(revoked.status()).toBe(403);
    await other.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(workspace(other)).not.toBeVisible();
    expect((await inspect(documentId)).document).toEqual(afterB.document);
    evidence.push({ kind: 'fixed-create', documentId, requestHash: hash(JSON.stringify(fixed)), sourceHash: hash(source.text) },
      { kind: 'process-restart', before: oldPid, after: a.pid, databaseIdentity: status.databaseIdentity },
      { kind: 'two-real-writers', writerARevision: afterA.document!.revision, writerBRevision: afterB.document!.revision });
    passed = true;
  } finally {
    const restored = await Promise.allSettled([privateControl({ action: 'db-start' }),
      privateControl({ action: 'beta-active', active: true }), privateControl({ action: 'beta-role', role: 'viewer' })]);
    const closed = await Promise.allSettled([a, b].flatMap((profile, index) => profile ? [stopPrivateProfile(profile.context, profile.pid)
      .then(() => rmSync(index ? profileB : profileA, { recursive: true, force: true }))] : []));
    const cleanup = restored.concat(closed).every(result => result.status === 'fulfilled');
    if (cleanup) for (const path of [profileA, profileB]) rmSync(path, { recursive: true, force: true });
    writeFileSync(evidenceFile, JSON.stringify({ status: passed && cleanup ? 'passed' : 'incomplete', evidence, cleanup }, null, 2), { mode: 0o600 });
    expect(cleanup).toBe(true);
  }
});

test('same physical profile preserves Site source and A recovery across actual B login', async () => {
  test.setTimeout(180_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!), evidenceFile = join(directory, 'site-real-account.json');
  const profile = mkdtempSync(join(directory, 'site-account-'));
  let browser: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let passed = false;
  const evidence: Array<Record<string, unknown>> = [];
  writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete' }), { mode: 0o600 });
  try {
    const status = await privateControl<RealStatus>({ action: 'status' });
    const root = `${origin}/api/v1/tenants/${status.tenantId}`;
    browser = await launchPrivateProfile(profile);
    const page = await browser.context.newPage(), requests = track(page);
    await login(page, 'alpha-editor');
    const source = await seed(page, 'Account retained rich Site'), originals = await rows(page);
    await prepare(page, source.title);
    await saveDocument(page); await expect(saved(page)).toHaveText('서버 저장 확인됨');
    const documentUrl = page.url(), sourcePending = (await records(page)).find(record => record.status === 'confirmed')!;
    const committed = await inspect(undefined, sourcePending.attempt!.idempotencyKey, 'create');
    const documentId = committed.receipt!.documentId;
    await showNavigation(page);
    await expect(workspace(page).locator('[data-confirmed-local-copy]')).toContainText('이 기기에 남아 있습니다');
    await closeNavigation(page);
    await typeInput(page, ' A-private-recovery-input');
    await page.route(`${root}/documents/${documentId}/snapshot`, route => route.abort('failed'), { times: 1 });
    await saveDocument(page); await expect(save(page)).toBeEnabled();
    const pendingA = (await records(page)).find(record => record.status === 'pending' &&
      record.snapshotText.includes('A-private-recovery-input'))!;
    expect(pendingA.attempt).toBeDefined();
    const retained = await records(page), before = await inspect(documentId), writesBeforeB = requests.writes.length;
    await logout(page);
    await login(page, 'beta-viewer', documentUrl);
    await expect(workspace(page)).not.toContainText('A-private-recovery-input');
    await expect(workspace(page).getByRole('button', { name: /^저장된 Site 초안 복구/ })).toHaveCount(0);
    await expect(workspace(page).locator('[data-confirmed-local-copy]')).toHaveCount(0);
    await expect(save(page)).toHaveCount(0);
    // Residue remains physically readable. Scope checks are not physical storage encryption.
    expect(await records(page)).toEqual(retained);
    expect(await rows(page)).toEqual(originals);
    expect(requests.writes).toHaveLength(writesBeforeB);
    expect((await inspect(documentId)).document).toEqual(before.document);
    await logout(page);
    await login(page, 'alpha-editor', documentUrl);
    page.once('dialog', dialog => dialog.accept());
    await recoverDraft(page, pendingA.savedAt);
    expect((await records(page)).some(record => record.snapshotText.includes('A-private-recovery-input'))).toBe(true);
    expect((await records(page)).find(record => record.draftId === pendingA.draftId)?.attempt).toEqual(pendingA.attempt);
    await saveDocument(page); await expect(saved(page)).toHaveText('서버 저장 확인됨');
    const result = await canonical(page, root, requests.bearer, documentId, pendingA.snapshotText);
    expect(result.document!.revision).toBe(before.document!.revision + 1);
    expect(requests.writes.at(-1)!.body.idempotencyKey).toBe(pendingA.attempt!.idempotencyKey);
    expect(await rows(page)).toEqual(originals);
    evidence.push({ kind: 'same-profile-A-B-A', sourceHash: hash(source.text), pendingHash: hash(pendingA.snapshotText),
      documentId, revision: result.document!.revision, physicallyReadableOriginalAndDraftUnderB: true,
      originalLocation: 'IndexedDB barocss-site-workspace/documents', recoveryLocation: 'localStorage wonffice.site.pending.v1' });
    passed = true;
  } finally {
    let cleanup = true;
    if (browser) {
      try { await stopPrivateProfile(browser.context, browser.pid); rmSync(profile, { recursive: true, force: true }); }
      catch { cleanup = false; }
    }
    writeFileSync(evidenceFile, JSON.stringify({ status: passed && cleanup ? 'passed' : 'incomplete', evidence, cleanup }, null, 2), { mode: 0o600 });
    expect(cleanup).toBe(true);
  }
});


test('real Site cross-tenant direct entry and writes preserve complete Beta native source', async () => {
  test.setTimeout(180_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const evidenceFile = join(directory, 'site-real-cross-tenant.json');
  const profile = mkdtempSync(join(directory, 'site-tenant-'));
  let browser: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let passed = false;
  const evidence: Array<Record<string, unknown>> = [];
  writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete' }), { mode: 0o600 });
  try {
    const status = await privateControl<RealStatus>({ action: 'status' });
    const betaRoot = `${origin}/api/v1/tenants/${status.betaTenantId}`;
    const betaInspect = (documentId?: string, key?: string, operation: 'create' | 'update' = 'update', actor: Alias = 'beta-viewer') =>
      privateControl<Inspection<'site'>>({ action: 'inspect', product: 'site', tenant: 'beta',
        ...(documentId ? { documentId } : {}), ...(key ? { idempotencyKey: key, operation, actor } : {}) });
    browser = await launchPrivateProfile(profile);
    const page = await browser.context.newPage(), requests = track(page);
    // The existing helper verifies fresh /me issuer, subject and the exact Beta
    // owner role. The alias name is not its seeded role in this tenant.
    await login(page, 'beta-viewer', origin, 'Beta');
    const source = await seed(page, 'Beta cross-tenant rich Site'), originals = await rows(page);
    const pending = await prepare(page, source.title);
    await saveDocument(page); await expect(saved(page)).toHaveText('서버 저장 확인됨');
    const created = await betaInspect(undefined, pending.attempt!.idempotencyKey, 'create');
    expect(created.receipt).not.toBeNull();
    expect(created.receipt!.snapshotText).toBe(source.text);
    expect(created.receipt!.document.revision).toBe(1);
    expect(created.receipt!.document.snapshotHash).toBe(hash(source.text));
    expect(created.receipt!.document.pageId).toBeNull();
    const documentId = created.receipt!.documentId, documentUrl = page.url();
    const createRequest = requests.writes.find(write => write.operation === 'create')!.body;
    expect(createRequest).toMatchObject({ workspaceId: status.betaWorkspaceId, product: 'site',
      fileFormat: 'barocss-site', fileVersion: 1, snapshotText: source.text });
    expect(createRequest).not.toHaveProperty('importMode');
    const marker = ' BETA-SITE-PRIVATE';
    await typeInput(page, marker);
    // Save delivers the actual deepest input without closing its modal first.
    await saveDocument(page); await expect(saved(page)).toHaveText('서버 저장 확인됨');
    const expected = structuredClone(source.document);
    siteNativeNode(expected, 'richText', 'inner-item')!.content![0].content![0].text += marker;
    const updateRequest = requests.writes.filter(write => write.operation === 'update').at(-1)!.body;
    const betaBefore = await betaInspect(documentId, updateRequest.idempotencyKey as string);
    expect(betaBefore.document!.canonicalTree).toEqual(expected);
    expect(betaBefore.receipt!.snapshotText).toBe(betaBefore.document!.snapshotText);
    expect(betaBefore.receipt!.document.revision).toBe(betaBefore.document!.revision);
    expect(betaBefore.document!.revision).toBe(2);
    const betaResponse = await page.request.get(`${betaRoot}/documents/${documentId}`, {
      headers: { Authorization: requests.bearer },
    });
    expect(betaResponse.status()).toBe(200);
    const betaApi = await betaResponse.json();
    expect(betaApi.snapshotText).toBe(betaBefore.document!.snapshotText);
    expect(JSON.parse(betaApi.snapshotText).document).toEqual(expected);
    expect(hash(betaApi.snapshotText)).toBe(betaBefore.document!.snapshotHash);
    expect(betaApi.document).toMatchObject({ tenantId: status.betaTenantId, workspaceId: status.betaWorkspaceId,
      product: 'site', pageId: null, fileFormat: 'barocss-site', fileVersion: 1,
      revision: betaBefore.document!.revision, metadataRevision: betaBefore.document!.metadataRevision });
    const downloading = page.waitForEvent('download');
    await nativeExport(page);
    const download = await downloading;
    expect(JSON.parse(readFileSync((await download.path())!, 'utf8')).document).toEqual(expected);
    expect(await rows(page)).toEqual(originals);
    await logout(page);
    await login(page, 'alpha-editor');
    await expect(workspace(page)).not.toContainText(marker);
    await expect(workspace(page).getByRole('button', { name: /^저장된 Site 초안 복구/ })).toHaveCount(0);
    const alphaBefore = await inspect();
    // Numeric lifetime observation only. These genuine JWT claims do not grant
    // authority and are not used to replace the server identity witness.
    try {
      const claims = JSON.parse(Buffer.from(requests.bearer.replace(/^Bearer /, '').split('.')[1], 'base64url').toString('utf8'));
      if (Number.isFinite(claims.exp) && Number.isFinite(claims.iat)) evidence.push({
        kind: 'actual-access-token-lifetime', lifetimeSeconds: claims.exp - claims.iat,
        remainingSeconds: Math.max(0, Math.floor(claims.exp - Date.now() / 1000)),
      });
    } catch { evidence.push({ kind: 'actual-access-token-lifetime', available: false }); }
    const headers = { Authorization: requests.bearer };
    const deniedRead = await page.request.get(`${betaRoot}/documents/${documentId}`, { headers });
    expect(deniedRead.status()).toBe(403);
    expect((await deniedRead.text()).includes(marker)).toBe(false);
    const updateKey = randomUUID(), createKey = randomUUID();
    const deniedUpdate = await page.request.put(`${betaRoot}/documents/${documentId}/snapshot`, { headers,
      data: { expectedRevision: betaBefore.document!.revision, snapshotText: betaBefore.document!.snapshotText,
        idempotencyKey: updateKey } });
    expect(deniedUpdate.status()).toBe(403);
    const deniedCreate = await page.request.post(`${betaRoot}/documents`, { headers,
      data: { ...createRequest, snapshotText: betaBefore.document!.snapshotText, idempotencyKey: createKey } });
    expect(deniedCreate.status()).toBe(403);
    const assertNoEffects = async () => {
      const after = await betaInspect(documentId, updateKey, 'update', 'alpha-editor');
      expect(after.receipt).toBeNull();
      expect((await betaInspect(undefined, createKey, 'create', 'alpha-editor')).receipt).toBeNull();
      expect(after.document).toEqual(betaBefore.document);
      expect(after.documentCount).toBe(betaBefore.documentCount);
      expect(after.receiptCount).toBe(betaBefore.receiptCount);
      const alphaAfter = await inspect();
      expect(alphaAfter.documentCount).toBe(alphaBefore.documentCount);
      expect(alphaAfter.receiptCount).toBe(alphaBefore.receiptCount);
      expect(await rows(page)).toEqual(originals);
    };
    await assertNoEffects();
    const writesBeforeEntry = requests.writes.length;
    await page.goto(documentUrl);
    // Re-establish the actual SSO session after full navigation if requested.
    // No account replacement, storage clearing or IdP control is used.
    await expect.poll(async () => await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible() ||
      await page.getByRole('heading', { name: '접근 권한이 없습니다', exact: true }).isVisible()).toBe(true);
    const enter = page.getByRole('button', { name: '일반 사용자로 들어가기' });
    if (await enter.isVisible()) await enter.click();
    await expect(page.getByRole('heading', { name: '접근 권한이 없습니다', exact: true })).toBeVisible();
    const fixture = JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8')) as {
      issuer: string; users: Record<Alias, { id: string }>;
    };
    await expect.poll(async () => {
      try {
        const actual = await page.evaluate(async ({ source, tenantId }) => {
          const client = await import(source), identity = await client.loadIdentity();
          return { issuer: identity.issuer, subject: identity.subject, role: await client.confirmTenant(tenantId),
            listedRole: identity.tenants.find((item: { tenantId: string }) => item.tenantId === tenantId)?.role };
        }, { source: '/src/auth-client.ts', tenantId: status.tenantId });
        return actual.issuer === fixture.issuer && actual.subject === fixture.users['alpha-editor'].id &&
          actual.role === 'owner' && actual.listedRole === 'owner';
      } catch { return false; }
    }, { message: 'Denied direct entry must retain the requested server-verified principal.' }).toBe(true);
    await expect(workspace(page)).toHaveCount(0);
    await expect(page.locator('[data-db-item-body]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^저장된 Site 초안 복구/ })).toHaveCount(0);
    expect((await page.locator('body').innerText()).includes(marker)).toBe(false);
    expect(requests.writes).toHaveLength(writesBeforeEntry);
    await assertNoEffects();
    evidence.push({ kind: 'cross-tenant-site', freshBetaOwner: true, freshAlphaOwner: true,
      directEntryDenied: true, readDenied: true, updateDenied: true, createDenied: true,
      completeNativeAndOriginalsRetained: true, canonicalAndReceiptsUnchanged: true });
    passed = true;
  } finally {
    let cleanup = true;
    if (browser) {
      try { await stopPrivateProfile(browser.context, browser.pid); rmSync(profile, { recursive: true, force: true }); }
      catch { cleanup = false; }
    } else rmSync(profile, { recursive: true, force: true });
    writeFileSync(evidenceFile, JSON.stringify({ status: passed && cleanup ? 'passed' : 'incomplete', evidence, cleanup }, null, 2), { mode: 0o600 });
    expect(cleanup).toBe(true);
  }
});

test('real Site access token expiry keeps the deepest native input and durable source', async () => {
  // The preceding actual run observed a 300-second lifetime. Allow that real
  // lifetime plus bounded native setup and server verification; never alter time.
  test.setTimeout(480_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const evidenceFile = join(directory, 'site-real-expiry.json');
  const profile = mkdtempSync(join(directory, 'site-expiry-'));
  let browser: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let passed = false;
  let releaseIdentity: (() => void) | undefined;
  let heldStartedAt = 0;
  const delivery = { fetched200: false, browser200: false, fulfilled: false, finished: false, failed: false };
  const evidence: Array<Record<string, unknown>> = [];
  let restoreFetch: (() => Promise<void>) | undefined;
  let debuggerSession: import('@playwright/test').CDPSession | undefined;
  let removeDebuggerListeners: (() => void) | undefined;
  const causalDiagnostic = process.env.OFFICE_AUTH_EXPIRY_CAUSAL_DIAGNOSTIC === '1';
  const causal = { cancelled: false, authFrame: false, staleRequest: false, beforeReadTimeout: false, resumed: false, observationFailed: false, milliseconds: 0 };
  const transport: { fetched?: ReturnType<typeof identityHeaderMetadata>; browser?: ReturnType<typeof identityHeaderMetadata>;
    decodedByteCount?: number; failureClass?: ReturnType<typeof identityFailureClass> } = {};
  const bounded = async <T,>(promise: Promise<T>, milliseconds: number): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('bounded_expiry_observation_timeout')), Math.max(1, milliseconds));
    })]); } finally { clearTimeout(timer); }
  };
  writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete' }), { mode: 0o600 });
  try {
    const status = await privateControl<RealStatus>({ action: 'status' });
    const root = `${origin}/api/v1/tenants/${status.tenantId}`;
    browser = await launchPrivateProfile(profile);
    const page = await browser.context.newPage(), requests = track(page);
    await login(page, 'alpha-editor');
    const source = await seed(page, 'Expiry retained rich Site'), originals = await rows(page);
    const pending = await prepare(page, source.title);
    await saveDocument(page); await expect(saved(page)).toHaveText('서버 저장 확인됨');
    const created = await inspect(undefined, pending.attempt!.idempotencyKey, 'create');
    const documentId = created.receipt!.documentId;
    // Establish the complete native export before opening the input that must
    // stay mounted throughout the genuine expiry interval.
    await canonical(page, root, requests.bearer, documentId, source.text);
    const marker = ' EXPIRY-DEEPEST-RETAINED';
    await typeInput(page, marker);
    await saveDocument(page); await expect(saved(page)).toHaveText('서버 저장 확인됨');
    const paragraph = page.locator('[data-db-item-body]').last().locator('.on-doc > p').last();
    await expect(paragraph).toBeVisible();
    const originalParagraph = await paragraph.elementHandle();
    expect(originalParagraph !== null, 'The actual deepest input must be mounted.').toBe(true);
    const originalParagraphText = await originalParagraph!.evaluate(element => element.textContent);
    const expected = structuredClone(source.document);
    siteNativeNode(expected, 'richText', 'inner-item')!.content![0].content![0].text += marker;
    const before = await inspect(documentId);
    expect(before.document!.canonicalTree).toEqual(expected);
    const retained = await records(page);
    expect(retained.some(record => record.status === 'confirmed' && record.snapshotText === before.document!.snapshotText)).toBe(true);
    expect(await rows(page)).toEqual(originals);
    const writesBeforeExpiry = requests.writes.length;
    const bearer = requests.bearer;
    const claims = JSON.parse(Buffer.from(bearer.replace(/^Bearer /, '').split('.')[1], 'base64url').toString('utf8')) as {
      exp?: number; iat?: number;
    };
    const validTimes = typeof claims.exp === 'number' && Number.isFinite(claims.exp) &&
      typeof claims.iat === 'number' && Number.isFinite(claims.iat);
    expect(validTimes, 'The genuine access token must expose a finite lifetime observation.').toBe(true);
    const lifetimeSeconds = claims.exp! - claims.iat!;
    const remainingSeconds = Math.max(0, Math.ceil(claims.exp! - Date.now() / 1000));
    evidence.push({ kind: 'genuine-expiry-window', lifetimeSeconds, remainingSeconds,
      boundedLifetimeSupported: lifetimeSeconds > 0 && lifetimeSeconds <= 300 });
    expect(lifetimeSeconds > 0 && lifetimeSeconds <= 300,
      'This bounded actual expiry schedule requires the observed lifetime to be at most 300 seconds.').toBe(true);
    // Ordinary authorized reads time out after ten seconds. Wait near genuine
    // expiry before holding an actual successful identity response; a long
    // intercepted request would only prove timeout, not stale completion.
    await expect.poll(async () => {
      expect(await paragraph.evaluate((element, original) => element === original, originalParagraph)).toBe(true);
      expect(await originalParagraph!.evaluate(element => element.isConnected)).toBe(true);
      await expect(paragraph).toContainText(marker);
      const seconds = claims.exp! - Date.now() / 1000;
      return seconds > 0 && seconds <= 4;
    }, { timeout: (remainingSeconds + 5) * 1000, intervals: [1000],
      message: 'The genuine token must reach the supported near-expiry identity window.' }).toBe(true);
    const fixture = JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8')) as {
      issuer: string; users: Record<Alias, { id: string }>;
    };
    // Test-only observer: forward the exact fetch arguments, signal and original
    // Response. It does not read/drain the body or alter any login authority.
    const fetchObserver = await bounded(page.evaluateHandle(async source => {
      const client = await import(source), session = client.captureAuthorizedSession();
      const original = window.fetch;
      const state = { initiallyCurrent: session.isCurrent(), started: false, headersResolved: false,
        response200: false, milliseconds: 0 };
      const wrapped: typeof fetch = async (input, init) => {
        const url = input instanceof Request ? input.url : new URL(input instanceof URL ? input.href : input, location.href).href;
        const owned = !state.started && url === location.origin + '/api/v1/me';
        const started = performance.now();
        if (owned) state.started = true;
        const response = await original.call(window, input, init);
        if (owned) { state.headersResolved = true; state.response200 = response.status === 200;
          state.milliseconds = performance.now() - started; }
        return response;
      };
      window.fetch = wrapped;
      return { read: () => ({ ...state, current: session.isCurrent() }), restore: () => {
        if (window.fetch === wrapped) window.fetch = original;
      } };
    }, '/src/auth-client.ts'), 15_000);
    restoreFetch = async () => { await bounded(fetchObserver.evaluate(observer => observer.restore()), 15_000); await fetchObserver.dispose(); };
    expect((await bounded(fetchObserver.evaluate(observer => observer.read()), 15_000)).initiallyCurrent).toBe(true);
    const identityRelease = new Promise<void>(resolve => { releaseIdentity = resolve; });
    let identityFetched = false, samePrincipal = false, identityFulfilled = false;
    let heldRequest: import('@playwright/test').Request | undefined;
    if (causalDiagnostic) {
      debuggerSession = await bounded(browser.context.newCDPSession(page), 15_000);
      const session = debuggerSession, authScripts = new Set<string>();
      const onScriptParsed = (script: { url: string; scriptId: string }) => {
        if (script.url.split('?')[0].endsWith('/src/auth-client.ts')) authScripts.add(script.scriptId);
      };
      session.on('Debugger.scriptParsed', onScriptParsed);
      const onPaused = async (paused: { data?: { objectId?: string }; callFrames: Array<{
        location: { scriptId: string }; callFrameId: string }> }) => {
        const observedMilliseconds = Date.now() - heldStartedAt;
        try {
          if (typeof paused.data?.objectId !== 'string') return;
          const kind = await bounded(session.send('Runtime.callFunctionOn', { objectId: paused.data.objectId,
            functionDeclaration: "function(){return this.kind === 'cancelled';}", returnByValue: true, silent: true }), 2000);
          if (kind.result.value !== true) return;
          for (const frame of paused.callFrames) {
            if (!authScripts.has(frame.location.scriptId)) continue;
            const scope = await bounded(session.send('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId,
              expression: "request.url === location.origin + '/api/v1/me' && (epoch !== sessionEpoch || activeSession !== token)",
              returnByValue: true, silent: true }), 2000);
            if (scope.result.value !== true) continue;
            causal.cancelled = true; causal.authFrame = true; causal.staleRequest = true;
            causal.milliseconds = observedMilliseconds; causal.beforeReadTimeout = causal.milliseconds < 10_000;
            break;
          }
        } catch { causal.observationFailed = true; }
        finally {
          try { await bounded(session.send('Debugger.setPauseOnExceptions', { state: 'none' }), 2000); }
          catch { causal.observationFailed = true; }
          finally {
            try { await bounded(session.send('Debugger.resume'), 2000); causal.resumed = true; }
            catch { causal.observationFailed = true; }
          }
        }
      };
      session.on('Debugger.paused', onPaused);
      removeDebuggerListeners = () => { session.removeListener('Debugger.paused', onPaused);
        session.removeListener('Debugger.scriptParsed', onScriptParsed); };
      await bounded(session.send('Debugger.enable'), 15_000);
    }
    let browserHeadersMilliseconds = 0, fulfilledMilliseconds = 0;
    page.on('response', response => {
      if (response.request() === heldRequest) { delivery.browser200 = response.status() === 200;
        transport.browser = identityHeaderMetadata(response.headers()); browserHeadersMilliseconds = Date.now() - heldStartedAt; }
    });
    page.on('requestfinished', request => { if (request === heldRequest) delivery.finished = true; });
    page.on('requestfailed', request => { if (request === heldRequest) { delivery.failed = true;
      transport.failureClass = identityFailureClass(request.failure()?.errorText); } });
    await page.route(`${origin}/api/v1/me`, async route => {
      heldStartedAt = Date.now();
      heldRequest = route.request();
      const response = await route.fetch({ timeout: Math.max(1, 10_000 - (Date.now() - heldStartedAt)) });
      expect(response.status()).toBe(200);
      delivery.fetched200 = true;
      transport.fetched = identityHeaderMetadata(response.headers());
      transport.decodedByteCount = (await bounded(response.body(), Math.max(1, 10_000 - (Date.now() - heldStartedAt)))).length;
      const actual = await response.json();
      samePrincipal = actual.issuer === fixture.issuer && actual.subject === fixture.users['alpha-editor'].id &&
        Array.isArray(actual.tenants) && actual.tenants.some((tenant: { tenantId: string; role: string }) =>
          tenant.tenantId === status.tenantId && tenant.role === 'owner');
      expect(samePrincipal, 'The held genuine identity must match the current server-verified account.').toBe(true);
      identityFetched = true;
      await bounded(identityRelease, Math.max(1, 10_000 - (Date.now() - heldStartedAt)));
      // Forward the exact genuine response; never fabricate or rewrite its body.
      await bounded(route.fulfill({ response }), Math.max(1, 10_000 - (Date.now() - heldStartedAt)));
      identityFulfilled = true; delivery.fulfilled = true; fulfilledMilliseconds = Date.now() - heldStartedAt;
    }, { times: 1 });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => identityFetched).toBe(true);
    const curtain = page.locator('#office-auth-curtain');
    await expect(curtain).toBeVisible();
    expect(await curtain.evaluate(element => {
      const style = getComputedStyle(element);
      return style.position === 'fixed' && style.opacity === '1' &&
        style.backgroundColor === 'rgb(248, 248, 245)';
    })).toBe(true);
    // Claims set only the observation window. The API independently rejects the
    // unchanged bearer while the actual earlier /me response remains held.
    await expect.poll(async () => {
      expect(await paragraph.evaluate((element, original) => element === original, originalParagraph)).toBe(true);
      expect(await originalParagraph!.evaluate(element => element.isConnected)).toBe(true);
      await expect(paragraph).toContainText(marker);
      const response = await page.request.get(`${root}/documents/${documentId}`, { headers: { Authorization: bearer } });
      const responseStatus = response.status();
      expect(responseStatus === 200 || responseStatus === 401,
        'The real expiry probe must return either the valid document or an authentication refusal.').toBe(true);
      if (responseStatus === 200) {
        const api = await response.json();
        expect(api.snapshotText).toBe(before.document!.snapshotText);
        expect(JSON.parse(api.snapshotText).document).toEqual(expected);
      }
      return responseStatus === 401;
    }, { timeout: (remainingSeconds + 45) * 1000, intervals: [250, 500],
      message: 'The real API must refuse the unchanged access token after its actual expiry.' }).toBe(true);
    const afterApiExpiry = await inspect(documentId);
    expect(afterApiExpiry.document).toEqual(before.document);
    expect(afterApiExpiry.documentCount).toBe(before.documentCount);
    expect(afterApiExpiry.receiptCount).toBe(before.receiptCount);
    expect(requests.writes).toHaveLength(writesBeforeExpiry);
    expect(await records(page)).toEqual(retained);
    // The app rechecks its actual session on focus. Its parent must conceal and
    // inert the retained runtime, rather than delete this native input owner.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('heading', { name: '로그인이 필요합니다', exact: true })).toBeVisible();
    await expect(workspace(page)).toBeHidden();
    expect(await originalParagraph!.evaluate(element => {
      const owner = element.closest<HTMLElement>('[hidden][inert]');
      return element.isConnected && owner !== null && owner.hidden && owner.inert;
    })).toBe(true);
    expect(await originalParagraph!.evaluate(element => element.textContent?.includes('EXPIRY-DEEPEST-RETAINED'))).toBe(true);
    await expect(page.getByRole('dialog', { name: '데이터베이스 항목', exact: true })).toHaveCount(0);
    const holdMilliseconds = Date.now() - heldStartedAt;
    evidence.push({ kind: 'held-genuine-identity', fetched200: identityFetched, samePrincipal,
      holdMilliseconds, withinActualReadTimeout: holdMilliseconds < 10_000 });
    expect(holdMilliseconds < 10_000,
      'The genuine identity completion must be released before the actual ten-second read timeout.').toBe(true);
    expect((await bounded(fetchObserver.evaluate(observer => observer.read()), 15_000)).current).toBe(false);
    if (debuggerSession) await bounded(debuggerSession.send('Debugger.setPauseOnExceptions', { state: 'all' }),
      Math.max(1, 10_000 - (Date.now() - heldStartedAt)));
    releaseIdentity!();
    await expect.poll(async () => {
      const state = await bounded(fetchObserver.evaluate(observer => observer.read()), 2000);
      return identityFulfilled && delivery.browser200 && state.headersResolved && state.response200;
    }, { timeout: Math.max(1, 10_000 - (Date.now() - heldStartedAt)), intervals: [50, 100],
      message: 'The exact original response headers must reach the actual browser fetch continuation before the read timeout.' }).toBe(true);
    const forwarded = await bounded(fetchObserver.evaluate(observer => observer.read()), 2000);
    expect(transport.decodedByteCount! > 0).toBe(true);
    if (transport.fetched!.contentLengthPresent && ['absent', 'identity'].includes(transport.fetched!.contentEncoding)) {
      expect(transport.fetched!.contentLengthValid).toBe(true);
      expect(transport.decodedByteCount).toBe(transport.fetched!.contentLength);
    }
    expect(forwarded.current).toBe(false);
    expect(forwarded.initiallyCurrent).toBe(true);
    expect(forwarded.milliseconds < 10_000 && browserHeadersMilliseconds < 10_000 && fulfilledMilliseconds < 10_000).toBe(true);
    evidence.push({ kind: 'genuine-forwarded-headers', ...forwarded, browserHeadersMilliseconds, fulfilledMilliseconds,
      ...delivery, transport: { ...transport } });
    writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete', evidence }, null, 2), { mode: 0o600 });
    if (causalDiagnostic) {
      await expect.poll(() => causal.cancelled && causal.authFrame && causal.staleRequest && causal.beforeReadTimeout && causal.resumed && !causal.observationFailed,
        { timeout: Math.max(1, 10_000 - (Date.now() - heldStartedAt)), intervals: [50, 100] }).toBe(true);
      evidence.push({ kind: 'diagnostic-actual-epoch-refusal', ...causal });
      writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete', evidence }, null, 2), { mode: 0o600 });
    }
    // Response.finished() has no timeout and does not settle on requestfailed in
    // Playwright 1.58. Observe the exact request's public terminal events instead.
    // Original headers must already be observed; the later classified abort is
    // cancellation, not successful networking. Unresolved/other failures refuse.
    // The rejected stale consumer intentionally does not drain its body. The
    // proven ordinary ten-second abort is cancellation, never network success.
    await expect.poll(() => delivery.finished || delivery.failed, {
      timeout: Math.max(1, 12_000 - (Date.now() - heldStartedAt)), intervals: [50, 100],
      message: 'The forwarded stale response must reach its unchanged read cancellation boundary.',
    }).toBe(true);
    expect(delivery.finished).toBe(false);
    expect(delivery.failed).toBe(true);
    expect(transport.failureClass).toBe('aborted');
    evidence.push({ kind: 'stale-response-cancellation', ...delivery, transport: { ...transport },
      elapsedMilliseconds: Date.now() - heldStartedAt, cancellationIsNotSuccess: true });
    writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete', evidence }, null, 2), { mode: 0o600 });
    // Check the retained current UI after classified cancellation. The test
    // never drains the refused body or retries authority; no hidden-page RAF wait.
    await expect(page.getByRole('heading', { name: '로그인이 필요합니다', exact: true })).toBeVisible();
    await expect(workspace(page)).toBeHidden();
    expect(await originalParagraph!.evaluate(element => {
      const owner = element.closest<HTMLElement>('[hidden][inert]');
      return element.isConnected && owner !== null && owner.hidden && owner.inert &&
        element.textContent?.includes('EXPIRY-DEEPEST-RETAINED');
    })).toBe(true);
    await expect(page.getByRole('dialog', { name: '데이터베이스 항목', exact: true })).toHaveCount(0);
    // Use the real current UI after expiry. The retained native paragraph is
    // hidden/inert: never force focus or dispatch input into that retired owner.
    await page.getByRole('heading', { name: '로그인이 필요합니다', exact: true }).click();
    await page.getByRole('button', { name: '초안 권한 다시 확인', exact: true }).click();
    await expect(page.getByRole('heading', { name: '로그인이 필요합니다', exact: true })).toBeVisible();
    expect(await originalParagraph!.evaluate(element => element.isConnected)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await originalParagraph!.evaluate(element => element.isConnected)).toBe(true);
    await page.keyboard.insertText(' EXPIRED-INPUT-MUST-NOT-ENTER');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByRole('heading', { name: '로그인이 필요합니다', exact: true })).toBeVisible();
    await expect(workspace(page)).toBeHidden();
    expect(await originalParagraph!.evaluate(element => {
      const owner = element.closest<HTMLElement>('[hidden][inert]');
      return element.isConnected && owner !== null && owner.hidden && owner.inert;
    })).toBe(true);
    expect(await originalParagraph!.evaluate(element => element.textContent)).toBe(originalParagraphText);
    expect(await records(page)).toEqual(retained);
    expect(requests.writes).toHaveLength(writesBeforeExpiry);
    // Independently exercise the genuine expired bearer against a valid update
    // contract. Neither a malformed request nor a fabricated 401 proves expiry.
    const expiredWriteKey = randomUUID();
    const expiredWrite = await page.request.put(`${root}/documents/${documentId}/snapshot`, {
      headers: { Authorization: bearer }, data: { expectedRevision: before.document!.revision,
        snapshotText: before.document!.snapshotText, idempotencyKey: expiredWriteKey },
    });
    expect(expiredWrite.status()).toBe(401);
    expect((await inspect(documentId, expiredWriteKey)).receipt).toBeNull();
    const after = await inspect(documentId);
    expect(after.document).toEqual(before.document);
    expect(after.documentCount).toBe(before.documentCount);
    expect(after.receiptCount).toBe(before.receiptCount);
    expect(await records(page)).toEqual(retained);
    expect(await rows(page)).toEqual(originals);
    expect(requests.writes).toHaveLength(writesBeforeExpiry);
    evidence.push({ kind: 'actual-site-expiry', apiExpiredBearerDenied: true, loginRequired: true,
      sameDeepestParagraphConnected: true, parentHiddenAndInert: true,
      fullNativeAndDurableSourceRetained: true, noAdditionalWriteOrReceipt: true, staleIdentityCompletionRefused: true,
      expiredKeyboardAndSaveRefused: true, expiredValidPutDenied: true });
    passed = true;
  } finally {
    evidence.push({ kind: 'final-causal-diagnostic', requested: causalDiagnostic, ...causal });
    evidence.push({ kind: 'final-held-response-observation', ...delivery,
      elapsedMilliseconds: heldStartedAt ? Date.now() - heldStartedAt : 0 });
    releaseIdentity?.();
    writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete', evidence }, null, 2), { mode: 0o600 });
    let cleanup = true;
    if (debuggerSession) {
      removeDebuggerListeners?.();
      try { await bounded(debuggerSession.send('Debugger.setPauseOnExceptions', { state: 'none' }), 2000); } catch { cleanup = false; }
      try { await bounded(debuggerSession.send('Debugger.resume'), 2000); } catch { /* Already resumed is expected. */ }
      try { await bounded(debuggerSession.detach(), 2000); } catch { cleanup = false; }
    }
    try { await restoreFetch?.(); } catch { cleanup = false; }
    if (browser) {
      try { await stopPrivateProfile(browser.context, browser.pid); rmSync(profile, { recursive: true, force: true }); }
      catch { cleanup = false; }
    } else rmSync(profile, { recursive: true, force: true });
    writeFileSync(evidenceFile, JSON.stringify({ status: passed && cleanup ? 'passed' : 'incomplete', evidence, cleanup }, null, 2), { mode: 0o600 });
    expect(cleanup).toBe(true);
  }
});

// Diagnostic allowlists: no arbitrary header value or failure text is persisted.
function identityHeaderMetadata(headers: Record<string, string>) {
  const length = headers['content-length'];
  const encoding = headers['content-encoding']?.toLowerCase();
  const transfer = headers['transfer-encoding']?.toLowerCase();
  return { contentLengthPresent: length !== undefined,
    contentLengthValid: length !== undefined && /^\d+$/.test(length) && Number.isSafeInteger(Number(length)),
    contentLength: length !== undefined && /^\d+$/.test(length) && Number.isSafeInteger(Number(length)) ? Number(length) : 0,
    contentEncoding: encoding === undefined ? 'absent' : ['identity', 'gzip', 'br', 'deflate'].includes(encoding) ? encoding : 'other',
    transferEncoding: transfer === undefined ? 'absent' : ['identity', 'chunked'].includes(transfer) ? transfer : 'other' };
}
function identityFailureClass(failure?: string) {
  const classes: Record<string, string> = { 'net::ERR_ABORTED': 'aborted', 'net::ERR_CONTENT_LENGTH_MISMATCH': 'content-length-mismatch',
    'net::ERR_INVALID_CHUNKED_ENCODING': 'invalid-chunked', 'net::ERR_INCOMPLETE_CHUNKED_ENCODING': 'incomplete-chunked', 'net::ERR_CONTENT_DECODING_FAILED': 'content-decoding',
    'net::ERR_EMPTY_RESPONSE': 'empty-response', 'net::ERR_TIMED_OUT': 'timed-out', 'net::ERR_CONNECTION_CLOSED': 'connection-closed',
    'net::ERR_CONNECTION_RESET': 'connection-reset', 'net::ERR_FAILED': 'failed' };
  return failure === undefined ? 'absent' : (Object.hasOwn(classes, failure) ? classes[failure] : 'other');
}
