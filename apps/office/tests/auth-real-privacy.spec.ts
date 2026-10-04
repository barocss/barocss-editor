import type { PendingNoteRecord } from '../../note/src/server-pending';
import { parseWorkspaceRoute } from '../../../packages/office-workspace/src/routes';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test, type Page, type Route, type APIResponse } from '@playwright/test';
import { launchPrivateProfile, privateControl, stopPrivateProfile, type Inspection, type RealStatus } from './helpers/real-recovery-control';

const origin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';
const workspace = (page: Page) => page.locator('[data-server-note-workspace]');
const editor = (page: Page) => workspace(page).locator('.on-doc');
const save = (page: Page) => workspace(page).getByRole('button', { name: /^(저장|저장 확인·재시도)$/ });
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
type Alias = 'alpha-editor' | 'beta-viewer';
type RecordRow = { key: string; raw: string; record: PendingNoteRecord };
type TenantStatus = RealStatus & { betaTenantId: string; betaWorkspaceId: string };

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000, trace: 'off', screenshot: 'off', video: 'off' });
test.skip(!process.env.OFFICE_AUTH_CONTROL_FILE || !process.env.OFFICE_AUTH_REAL_FILE,
  'Real privacy acceptance requires the private control descriptor and protected synthetic-account fixture.');

function accounts() {
  const file = process.env.OFFICE_AUTH_REAL_FILE!;
  const stat = lstatSync(file);
  expect(stat.isFile()).toBe(true);
  expect(stat.uid).toBe(process.getuid?.());
  expect(stat.mode & 0o777).toBe(0o600);
  return JSON.parse(readFileSync(file, 'utf8')) as { issuer: string; users: Record<Alias, { id: string; username?: string; password: string }> };
}

// Credentials and bearer tokens stay in memory. Neither appears in artifacts or console output.
function documentIdFromURL(url: string): string {
  const parsed = parseWorkspaceRoute(url);
  expect('error' in parsed).toBe(false);
  if ('error' in parsed || parsed.route?.kind !== 'item') throw new Error('Expected saved document route');
  expect(parsed.route.itemId).toMatch(/^[0-9a-f-]{36}$/i);
  return parsed.route.itemId;
}
async function openDocumentActions(page: Page) {
  await expect(page.locator('[data-server-note-workspace]')).toBeVisible();
  await expect(page.locator('.ow-file-navigation')).toBeVisible();
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  const panel = page.locator('[data-server-note-workspace] .nw-sidebar');
  if (await panel.isVisible()) return;
  const menu = page.locator('[data-server-note-workspace]').getByRole('menubar', { name: '문서 메뉴', exact: true });
  await menu.getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menu', { name: '문서 메뉴', exact: true }).getByRole('menuitemcheckbox', { name: '문서 작업', exact: true }).click();
  await expect(panel).toBeVisible();
}
async function verifyIdentity(page: Page, alias: Alias, tenant: 'Alpha' | 'Beta' = 'Alpha') {
  const fixture = accounts(), account = fixture.users[alias];
  const status = await privateControl<TenantStatus>({ action: 'status' });
  const tenantId = tenant === 'Alpha' ? status.tenantId : status.betaTenantId;
  const expectedRole = {
    Alpha: { 'alpha-editor': 'owner', 'beta-viewer': 'viewer' },
    Beta: { 'alpha-editor': null, 'beta-viewer': 'owner' },
  }[tenant][alias];
  expect(expectedRole !== null, 'Requested fixture account must have seeded tenant access.').toBe(true);
  await expect.poll(async () => {
    try {
      const verified = await page.evaluate(async ({ source, tenantId }) => {
        const client = await import(source), identity = await client.loadIdentity();
        const role = await client.confirmTenant(tenantId);
        return { issuer: identity.issuer, subject: identity.subject, role,
          listedRole: identity.tenants.find((item: { tenantId: string }) => item.tenantId === tenantId)?.role };
      }, { source: '/src/auth-client.ts', tenantId });
      return verified.issuer === fixture.issuer && verified.subject === account.id &&
        verified.role === expectedRole && verified.listedRole === expectedRole;
    } catch { return false; }
  }, { timeout: 30_000, message: 'Fresh server identity and role must match the requested fixture account.' }).toBe(true);
}
async function login(page: Page, alias: Alias, target = origin) {
  await page.goto(target);
  await expect.poll(async () => await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible() ||
    await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await workspace(page).isVisible() ||
    await page.getByRole('heading', { name: '접근 권한이 없습니다' }).isVisible()).toBe(true);
  const entry = page.getByRole('button', { name: '일반 사용자로 들어가기' });
  if (await entry.isVisible()) {
    await entry.click();
    await expect.poll(async () => await page.locator('#username').isVisible() ||
      await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await workspace(page).isVisible() ||
      await page.getByRole('heading', { name: '접근 권한이 없습니다' }).isVisible(), { timeout: 30_000 }).toBe(true);
    if (await page.locator('#username').isVisible()) {
      const account = accounts().users[alias];
      await page.locator('#username').fill(account.username ?? alias);
      await page.locator('#password').fill(account.password);
      await page.locator('#kc-login').click();
    }
  }
  await expect.poll(async () => await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() ||
    await workspace(page).isVisible() || await page.getByRole('heading', { name: '접근 권한이 없습니다' }).isVisible()).toBe(true);
  await verifyIdentity(page, alias);
}
async function logout(page: Page) {
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wonffice에 들어가기' })).toBeVisible();
  await expect(page.getByText('로그아웃했습니다.', { exact: true })).toBeVisible();
}
async function bounded<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), 15_000);
    })]);
  } finally { clearTimeout(timer); }
}

async function enterNew(page: Page, tenant: 'Alpha' | 'Beta') {
  await page.getByRole('button', { name: new RegExp(`Synthetic ${tenant}`) }).click();
  await page.getByRole('button', { name: `${tenant} workspace`, exact: true }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await page.getByRole('button', { name: '새 Note 만들기', exact: true }).click();
  await expect(workspace(page)).toBeVisible();
  await expect(page.locator('.ow-file-navigation')).toBeVisible();
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  await openDocumentActions(page);
  await workspace(page).locator('.nw-sidebar > button').filter({ hasText: /^새 노트$/ }).click();
  await expect.poll(() => editor(page).locator(':scope > p').first().evaluate(element =>
    element.closest('[contenteditable]')?.getAttribute('contenteditable'))).toBe('true');
}
async function typeInput(page: Page, text: string) {
  const actions = page.locator('[data-server-note-workspace] .nw-sidebar');
  if (await actions.isVisible()) {
    await page.locator('[data-server-note-workspace]').getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: '문서 작업', exact: true }).click();
    await expect(actions).toBeHidden();
  }

  const paragraph = editor(page).locator(':scope > p').first();
  await expect(paragraph).toBeVisible();
  const bounds = await paragraph.boundingBox();
  expect(bounds).not.toBeNull();
  await paragraph.click({ position: { x: 8, y: Math.min(10, bounds!.height / 2) } });
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.insertText(text);
  await expect(paragraph).toContainText(text);
}
async function records(page: Page): Promise<RecordRow[]> {
  return page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:'))
    .sort().map(key => { const raw = localStorage.getItem(key)!; return { key, raw, record: JSON.parse(raw) }; }));
}
function track(page: Page) {
  const state = { bearer: '', writes: [] as Array<{ method: string; url: string; body: Record<string, unknown> }> };
  page.on('request', request => {
    if (request.headers().authorization) state.bearer = request.headers().authorization;
    if (['POST', 'PUT'].includes(request.method()) && /\/documents(?:\/[^/]+\/snapshot)?$/.test(new URL(request.url()).pathname)) {
      state.writes.push({ method: request.method(), url: request.url(), body: request.postDataJSON() });
    }
  });
  return state;
}
const inspect = (tenant: 'alpha' | 'beta', documentId?: string, idempotencyKey?: string,
  operation: 'create' | 'update' = 'update', actor: Alias = 'alpha-editor') => privateControl<Inspection>({
  action: 'inspect', tenant, ...(documentId ? { documentId } : {}), ...(idempotencyKey ? { idempotencyKey, operation, actor } : {})
});
function unchanged(before: Inspection, after: Inspection) {
  expect(after.document).toEqual(before.document);
  expect(after.documentCount).toBe(before.documentCount);
  expect(after.receiptCount).toBe(before.receiptCount);
  expect(after.databaseIdentity).toBe(before.databaseIdentity);
  expect(after.databaseGeneration).toBe(before.databaseGeneration);
}

async function localRows(page: Page) {
  return page.evaluate(() => new Promise<unknown[]>((resolve, reject) => {
    const request = indexedDB.open('barocss-note', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents'), rows = tx.objectStore('documents').getAll();
      tx.oncomplete = () => { db.close(); resolve(rows.result); };
      tx.onabort = () => reject(tx.error);
    };
  }));
}
async function seed(page: Page, title: string) {
  const pageId = randomUUID();
  const document = { stype: 'note', attributes: { title, pageId }, content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Matrix structured body', marks: [{ stype: 'bold', range: [0, 6] }] },
      { stype: 'pageReference', attributes: { pageId, title: 'Self' } }] },
    { stype: 'codeBlock', attributes: { language: 'javascript' }, content: [{ stype: 'inline-text', text: 'const matrix = true;' }] },
    { stype: 'bTable', content: [{ stype: 'bTableBody', content: [{ stype: 'bTableRow', content: [
      { stype: 'bTableCell', content: [{ stype: 'inline-text', text: 'Matrix cell' }] }
    ] }] }] }
  ] };
  const text = JSON.stringify({ format: 'barocss-note', version: 1, savedAt: '2026-10-01T00:00:00Z', document });
  await page.evaluate(({ pageId, title, text }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('barocss-note', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'name' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ name: pageId, title, text, revision: 3, savedAt: 100, metadata: { favorite: true } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  }), { pageId, title, text });
  return { document, text, pageId };
}

// The old editor tab stays alive while a second tab completes real IdP logout/login.
// Only the real API's transport response is delayed; auth and product input are never fabricated.
test('one physical profile retains latest A input across B and ignores a late A acknowledgement', async () => {
  test.setTimeout(180_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const runId = randomUUID(), evidenceFile = join(directory, 'privacy-account-evidence.json');
  writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete', runId }), { mode: 0o600 });
  const profile = mkdtempSync(join(directory, 'privacy-profile-'));
  let browser: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let release: (() => void) | undefined;
  let routeDone: Promise<void> | undefined;
  let passed = false;
  const evidence: Array<Record<string, unknown>> = [];
  try {
    accounts();
    browser = await launchPrivateProfile(profile);
    const a = await browser.context.newPage(), switching = await browser.context.newPage();
    const aRequests = track(a), switchRequests = track(switching);
    const status = await privateControl<TenantStatus>({ action: 'status' });
    const root = `${origin}/api/v1/tenants/${status.tenantId}`;
    await login(a, 'alpha-editor');
    await enterNew(a, 'Alpha');
    await typeInput(a, 'Privacy persisted baseline');
    await save(a).click();
    await expect(a.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    const documentUrl = a.url(), documentId = documentIdFromURL(documentUrl);
    expect(documentId).toMatch(/^[0-9a-f-]{36}$/i);
    const before = await inspect('alpha', documentId);
    await typeInput(a, ' earlier-A-attempt');
    let heldRoute: Route | undefined, realReply: APIResponse | undefined;
    let deliverySucceeded = false;
    let reached!: () => void, completed!: () => void;
    const reachedApi = new Promise<void>(resolve => { reached = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    routeDone = new Promise<void>(resolve => { completed = resolve; });
    await a.route(`${root}/documents/${documentId}/snapshot`, async route => {
      heldRoute = route;
      try {
        realReply = await route.fetch({ timeout: 15_000 });
        reached();
        await gate;
        await route.fulfill({ response: realReply });
        deliverySucceeded = true;
      } catch { /* Assertions below fail without exposing transport credentials. */ }
      finally { reached(); completed(); }
    }, { times: 1 });
    await save(a).click();
    await bounded(reachedApi, 'private_response_not_reached');
    expect(realReply).toBeDefined();
    expect(realReply!.status()).toBe(200);
    const fixed = aRequests.writes.at(-1)!.body;
    const committed = await inspect('alpha', documentId, fixed.idempotencyKey as string);
    expect(committed.receipt).not.toBeNull();
    expect(committed.document!.revision).toBe(before.document!.revision + 1);
    expect(committed.receiptCount).toBe(before.receiptCount + 1);
    await typeInput(a, ' latest-A-private-input');
    await expect.poll(async () => (await records(a)).some(row => row.record.snapshotText.includes('latest-A-private-input'))).toBe(true);
    const retainedA = await records(a);
    const latest = retainedA.find(row => row.record.snapshotText.includes('latest-A-private-input'))!;
    expect(latest.record.snapshotText).not.toBe(fixed.snapshotText);
    expect(latest.record.status).toBe('draft');
    await login(switching, 'alpha-editor');
    await logout(switching);
    await expect(workspace(a)).toHaveCount(0);
    await login(switching, 'beta-viewer', documentUrl);
    await expect(editor(switching)).toContainText('earlier-A-attempt');
    await expect(editor(switching)).not.toContainText('latest-A-private-input');
    await openDocumentActions(switching);
    await expect(workspace(switching).getByRole('button', { name: /^초안 복구 / })).toHaveCount(0);
    await expect(save(switching)).toHaveCount(0);
    const writesAtB = aRequests.writes.length + switchRequests.writes.length;
    const delivered = a.waitForResponse(response => response.request() === heldRoute!.request(), { timeout: 15_000 });
    release!();
    expect((await bounded(delivered, 'private_response_not_delivered')).status()).toBe(200);
    await bounded(routeDone, 'private_response_route_not_completed');
    expect(deliverySucceeded).toBe(true);
    // A response cannot restore the unmounted A workspace or replace the latest durable bytes.
    await expect(workspace(a)).toHaveCount(0);
    await expect(a.getByText('latest-A-private-input')).toHaveCount(0);
    await expect(editor(switching)).not.toContainText('latest-A-private-input');
    expect(await records(switching)).toEqual(retainedA);
    expect(aRequests.writes.length + switchRequests.writes.length).toBe(writesAtB);
    unchanged(committed, await inspect('alpha', documentId));
    await logout(switching);
    await login(switching, 'alpha-editor', documentUrl);
    await openDocumentActions(switching);
    const recover = switching.getByRole('button', { name: new RegExp(`^초안 복구 .* ${latest.record.draftId.slice(0, 8)}$`) });
    await expect(recover).toHaveCount(1);
    await recover.click();
    await expect(editor(switching)).toContainText('latest-A-private-input');
    expect((await records(switching)).find(row => row.key === latest.key)?.record.snapshotText).toBe(latest.record.snapshotText);
    expect(aRequests.writes.length + switchRequests.writes.length).toBe(writesAtB);
    unchanged(committed, await inspect('alpha', documentId));
    evidence.push({ kind: 'same-profile-A-B-A', browserPid: browser.pid, tabs: 2, staleAcknowledgementDeliveredUnderB: true,
      latestSnapshotHash: digest(latest.record.snapshotText), fixedRequestHash: digest(JSON.stringify(fixed)),
      committedRevision: committed.document!.revision, noAutomaticRetryUnderBOrRecovery: true });
    passed = true;
  } finally {
    release?.();
    try {
      if (routeDone) await bounded(routeDone, 'private_response_cleanup_not_completed');
    } finally {
      if (browser) await stopPrivateProfile(browser.context, browser.pid);
      rmSync(profile, { recursive: true, force: true });
    }
  }
  // A successful artifact exists only after browser process termination and profile removal.
  if (passed) writeFileSync(evidenceFile, JSON.stringify({ status: 'passed', runId, profileRemoved: true, evidence }, null, 2), { mode: 0o600 });
});

// Beta's owner creates a real Beta Note. Alpha has no Beta membership.
// Both the guessed direct URL and explicit document endpoints must deny access.
test('cross-tenant direct UI and API reads/writes leave real PostgreSQL effects unchanged', async () => {
  test.setTimeout(150_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const runId = randomUUID(), evidenceFile = join(directory, 'privacy-tenant-evidence.json');
  writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete', runId }), { mode: 0o600 });
  const profile = mkdtempSync(join(directory, 'tenant-privacy-profile-'));
  let browser: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let evidence: Record<string, unknown> | undefined;
  try {
    accounts();
    browser = await launchPrivateProfile(profile);
    const page = await browser.context.newPage(), requests = track(page);
    const status = await privateControl<TenantStatus>({ action: 'status' });
    expect(status.betaTenantId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(status.betaWorkspaceId).toMatch(/^[0-9a-f-]{36}$/i);
    await login(page, 'beta-viewer');
    await enterNew(page, 'Beta');
    await typeInput(page, 'Beta tenant private canonical body');
    await save(page).click();
    await expect(page.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    const url = page.url(), documentId = documentIdFromURL(url);
    const beforeBeta = await inspect('beta', documentId), beforeAlpha = await inspect('alpha');
    expect(beforeBeta.document!.snapshotText).toContain('Beta tenant private canonical body');
    await logout(page);
    await login(page, 'alpha-editor');
    expect(requests.bearer.startsWith('Bearer ')).toBe(true);
    const betaRoot = `${origin}/api/v1/tenants/${status.betaTenantId}`;
    const headers = { Authorization: requests.bearer };
    const key = `cross-tenant-${randomUUID()}`, createKey = `cross-create-${randomUUID()}`;
    const deniedRead = await page.request.get(`${betaRoot}/documents/${documentId}`, { headers });
    const deniedWrite = await page.request.put(`${betaRoot}/documents/${documentId}/snapshot`, { headers, data: {
      expectedRevision: beforeBeta.document!.revision, snapshotText: beforeBeta.document!.snapshotText, idempotencyKey: key
    } });
    const deniedCreate = await page.request.post(`${betaRoot}/documents`, { headers, data: {
      workspaceId: status.betaWorkspaceId, product: 'note', title: 'Cross tenant forbidden create',
      fileFormat: 'barocss-note', fileVersion: 1, importMode: 'new-page-copy',
      snapshotText: beforeBeta.document!.snapshotText, idempotencyKey: createKey
    } });
    expect(deniedRead.status()).toBe(403);
    expect(deniedWrite.status()).toBe(403);
    expect(deniedCreate.status()).toBe(403);
    expect((await deniedRead.text()).includes('Beta tenant private canonical body')).toBe(false);
    const deniedDb = await inspect('beta', documentId, key);
    expect(deniedDb.receipt).toBeNull();
    expect((await inspect('beta', documentId, createKey, 'create')).receipt).toBeNull();
    unchanged(beforeBeta, deniedDb);
    unchanged(beforeAlpha, await inspect('alpha'));
    await login(page, 'alpha-editor', url);
    await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
    await expect(workspace(page)).toHaveCount(0);
    await expect(page.getByText('Beta tenant private canonical body')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^초안 복구 / })).toHaveCount(0);
    unchanged(beforeBeta, await inspect('beta', documentId));
    unchanged(beforeAlpha, await inspect('alpha'));
    evidence = { kind: 'cross-tenant-real-denial', statuses: [deniedRead.status(), deniedWrite.status(), deniedCreate.status()],
      uiDenied: true, documentCount: beforeBeta.documentCount, receiptCount: beforeBeta.receiptCount,
      unchangedSnapshotHash: beforeBeta.document!.snapshotHash, unchangedRevision: beforeBeta.document!.revision };
  } finally {
    if (browser) await stopPrivateProfile(browser.context, browser.pid);
    rmSync(profile, { recursive: true, force: true });
  }
  if (evidence) writeFileSync(evidenceFile, JSON.stringify({ status: 'passed', runId, profileRemoved: true, evidence }, null, 2), { mode: 0o600 });
});

test('same physical Note account exit retains failed request and separate latest draft without publication', async () => {
  test.setTimeout(180_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const evidenceFile = join(directory, 'note-account-exit-evidence.json');
  const profile = mkdtempSync(join(directory, 'note-account-exit-'));
  const evidence: Array<Record<string, boolean | string>> = [];
  let browser: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined, page: Page | undefined;
  let passed = false, cleanup = false;
  writeFileSync(evidenceFile, JSON.stringify({ passed, evidence }), { mode: 0o600 });
  try {
    browser = await launchPrivateProfile(profile);
    page = await browser.context.newPage();
    const requests = track(page), fixture = accounts();
    const status = await privateControl<TenantStatus>({ action: 'status' });
    const root = `${origin}/api/v1/tenants/${status.tenantId}`;
    await login(page, 'alpha-editor');
    await page.getByRole('button', { name: /Synthetic Alpha/ }).click();
    await page.getByRole('button', { name: 'Alpha workspace', exact: true }).click();
    await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
    await page.getByRole('button', { name: '새 Note 만들기', exact: true }).click();
    await expect(workspace(page)).toBeVisible();
    const source = await seed(page, 'Account retained structured Note');
    const originals = await localRows(page);
    await openDocumentActions(page);
    await page.getByRole('button', { name: '로컬 노트 사본 가져오기', exact: true }).click();
    await page.getByRole('button', { name: '이 기기의 로컬 노트 목록 확인', exact: true }).click();
    await page.getByRole('button', { name: '서버 사본 준비 Account retained structured Note', exact: true }).click();
    await save(page).click();
    await expect(page.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    await expect.poll(() => {
      const parsed = parseWorkspaceRoute(page!.url());
      return !('error' in parsed) && parsed.route?.kind === 'item';
    }).toBe(true);
    const documentUrl = page.url(), documentId = documentIdFromURL(documentUrl);
    const baseline = await inspect('alpha', documentId);
    expect(baseline.document).not.toBeNull();
    await expect(editor(page).locator('pre')).toContainText('const matrix = true;');
    await expect(editor(page).locator('table')).toContainText('Matrix cell');
    expect(await localRows(page)).toEqual(originals);

    await typeInput(page, ' fixed-A-private-request');
    let releaseFailedWrite!: () => void, enteredFailedWrite!: () => void;
    const heldWrite = new Promise<void>(resolve => { releaseFailedWrite = resolve; });
    const writeEntered = new Promise<void>(resolve => { enteredFailedWrite = resolve; });
    await page.route(`${root}/documents/${documentId}/snapshot`, async route => {
      enteredFailedWrite();
      await heldWrite;
      await route.abort('failed');
    }, { times: 1 });
    await save(page).click(); await bounded(writeEntered, 'Note write must reach the controlled failure boundary.');
    const fixedRequest = requests.writes.at(-1)!.body;
    const fixedRow = (await records(page)).find(row => row.record.status === 'pending' &&
      row.record.attempt?.idempotencyKey === fixedRequest.idempotencyKey)!;
    expect(fixedRow).toBeDefined();
    expect(fixedRow.record.attempt?.snapshotText).toBe(fixedRequest.snapshotText);
    expect(fixedRow.record.scope.issuer === fixture.issuer &&
      fixedRow.record.scope.subject === fixture.users['alpha-editor'].id &&
      fixedRow.record.scope.tenantId === status.tenantId && fixedRow.record.scope.workspaceId === status.workspaceId,
    'Private pending scope must belong to the requested account and workspace.').toBe(true);
    const unconfirmed = await inspect('alpha', documentId, fixedRequest.idempotencyKey as string);
    expect(unconfirmed.receipt).toBeNull(); unchanged(baseline, unconfirmed);

    await typeInput(page, ' later-A-private-draft');
    await expect.poll(async () => (await records(page!)).some(row => row.record.status === 'draft' &&
      row.record.snapshotText.includes('later-A-private-draft'))).toBe(true);
    const separate = (await records(page)).find(row => row.record.status === 'draft' &&
      row.record.snapshotText.includes('later-A-private-draft'))!;
    expect(separate.record.draftId).not.toBe(fixedRow.record.draftId);
    expect(separate.record.snapshotText).not.toBe(fixedRow.record.snapshotText);
    expect((await records(page)).find(row => row.key === fixedRow.key)?.raw).toBe(fixedRow.raw);

    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      (window as typeof window & { restoreAccountExitStorage?: () => void }).restoreAccountExitStorage = () => {
        Storage.prototype.setItem = original;
      };
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith('wonffice.note.pending.v1:')) throw new DOMException('quota', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await typeInput(page, ' quota-A-private-latest');
    await expect(page.getByText(/입력은 이 화면에만 있으므로 화면을 나갈 수 없습니다/)).toBeVisible();
    releaseFailedWrite();
    await expect(save(page)).toBeEnabled();
    const quotaURL = page.url(), quotaRows = await records(page), writesAtQuota = requests.writes.length;
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(workspace(page)).toBeVisible();
    await expect(editor(page)).toContainText('quota-A-private-latest');
    expect(page.url()).toBe(quotaURL);
    expect(await records(page)).toEqual(quotaRows);
    expect(await localRows(page)).toEqual(originals);
    expect(requests.writes).toHaveLength(writesAtQuota);
    unchanged(baseline, await inspect('alpha', documentId));
    await verifyIdentity(page, 'alpha-editor');
    evidence.push({ kind: 'quota-account-exit', nativeLatestRetained: true, recordsUnchanged: true,
      originalUnchanged: true, noWrite: true, currentPrincipalUnchanged: true });
    await page.evaluate(() => {
      (window as typeof window & { restoreAccountExitStorage?: () => void }).restoreAccountExitStorage!();
    });

    const writesBeforeExit = requests.writes.length;
    const beforeExit = await inspect('alpha', documentId);
    evidence.push({ kind: 'before-account-exit', fixedRequestNotPublished:
      !beforeExit.document!.snapshotText.includes('fixed-A-private-request'), latestDraftNotPublished:
      !beforeExit.document!.snapshotText.includes('quota-A-private-latest') });
    try { await logout(page); }
    finally {
      const afterExit = await inspect('alpha', documentId), physical = await records(page);
      evidence.push({ kind: 'account-exit-publication-boundary',
        fixedRequestPublished: afterExit.document!.snapshotText.includes('fixed-A-private-request'),
        latestDraftPublished: afterExit.document!.snapshotText.includes('quota-A-private-latest'),
        noWrite: requests.writes.length === writesBeforeExit,
        fixedRequestRawUnchanged: physical.find(row => row.key === fixedRow.key)?.raw === fixedRow.raw });
    }
    const retained = await records(page);
    const latest = retained.find(row => row.record.status === 'draft' &&
      row.record.snapshotText.includes('quota-A-private-latest'))!;
    expect(latest).toBeDefined();
    expect(latest.record.draftId).toBe(separate.record.draftId);
    expect(retained.find(row => row.key === fixedRow.key)?.raw).toBe(fixedRow.raw);
    const writesAtB = requests.writes.length;
    await login(page, 'beta-viewer', documentUrl);
    await expect(editor(page)).not.toContainText('fixed-A-private-request');
    await expect(editor(page)).not.toContainText('later-A-private-draft');
    await expect(editor(page)).not.toContainText('quota-A-private-latest');
    await openDocumentActions(page);
    await expect(page.getByRole('button', { name: /^초안 복구 / })).toHaveCount(0);
    await expect(save(page)).toHaveCount(0);
    await expect(editor(page).locator('[contenteditable=true]')).toHaveCount(0);
    expect(await records(page)).toEqual(retained);
    expect(await localRows(page)).toEqual(originals);
    expect(requests.writes).toHaveLength(writesAtB);
    expect(writesAtB).toBe(writesBeforeExit);
    unchanged(baseline, await inspect('alpha', documentId));
    evidence.push({ kind: 'viewer-account-isolation', freshBIdentity: true, privateInputAbsent: true,
      recoveryActionsAbsent: true, editingUnavailable: true, recordsUnchanged: true,
      originalUnchanged: true, noAccountExitOrBWrite: true, serverUnchanged: true });

    await logout(page); await login(page, 'alpha-editor', documentUrl);
    await openDocumentActions(page);
    await page.getByRole('button', { name: new RegExp(`^초안 복구 .* ${fixedRow.record.draftId.slice(0, 8)}$`) }).click();
    await expect(editor(page)).toContainText('fixed-A-private-request');
    await expect(editor(page)).not.toContainText('later-A-private-draft');
    expect((await records(page)).find(row => row.key === fixedRow.key)?.raw).toBe(fixedRow.raw);
    expect(requests.writes).toHaveLength(writesAtB);
    unchanged(baseline, await inspect('alpha', documentId));
    // Choose the separate unsent draft explicitly. Its original revision is
    // still current; no expected revision or frozen request is rewritten.
    await page.getByRole('button', { name: new RegExp(`^초안 복구 .* ${latest.record.draftId.slice(0, 8)}$`) }).click();
    await expect(editor(page)).toContainText('quota-A-private-latest');
    await expect(editor(page).locator('pre')).toContainText('const matrix = true;');
    await expect(editor(page).locator('table')).toContainText('Matrix cell');
    expect((await records(page)).find(row => row.key === latest.key)?.raw).toBe(latest.raw);
    expect(requests.writes).toHaveLength(writesAtB);
    unchanged(baseline, await inspect('alpha', documentId));
    await save(page).click(); await expect(page.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    const explicit = requests.writes.at(-1)!.body;
    expect(explicit.expectedRevision).toBe(baseline.document!.revision);
    expect(explicit.snapshotText).toBe(latest.record.snapshotText);
    expect(explicit.idempotencyKey).not.toBe(fixedRequest.idempotencyKey);
    const converged = await inspect('alpha', documentId, explicit.idempotencyKey as string);
    expect(converged.receipt).not.toBeNull();
    expect(converged.document!.revision).toBe(baseline.document!.revision + 1);
    expect(converged.document!.pageId).toBe(baseline.document!.pageId);
    expect(converged.document!.snapshotText).toBe(latest.record.snapshotText);
    expect(converged.document!.canonicalTree).toEqual(JSON.parse(latest.record.snapshotText).document);
    const response = await page.request.get(`${root}/documents/${documentId}`, { headers: { Authorization: requests.bearer } });
    expect(response.status()).toBe(200);
    const api = await response.json();
    expect(api.snapshotText).toBe(converged.document!.snapshotText);
    expect(api.document.revision).toBe(converged.document!.revision);
    expect(api.document.pageId).toBe(converged.document!.pageId);
    expect(digest(api.snapshotText)).toBe(converged.document!.snapshotHash);
    expect(JSON.parse(api.snapshotText).document).toEqual(converged.document!.canonicalTree);
    expect((await inspect('alpha', documentId, fixedRequest.idempotencyKey as string)).receipt).toBeNull();
    expect((await records(page)).find(row => row.key === fixedRow.key)?.raw).toBe(fixedRow.raw);
    expect(await localRows(page)).toEqual(originals);
    expect(source.text).toBe((originals as Array<{ text: string }>).find(row => row.text === source.text)?.text);
    evidence.push({ kind: 'explicit-latest-convergence', freshBIdentity: true, noBWrite: true,
      fixedRequestImmutable: true, laterDraftSeparate: true, exactApiPgSnapshot: true, originalNativeUnchanged: true });
    passed = true;
  } finally {
    if (page && !page.isClosed()) await page.evaluate(() => {
      (window as typeof window & { restoreAccountExitStorage?: () => void }).restoreAccountExitStorage?.();
    }).catch(() => {});
    if (browser) await stopPrivateProfile(browser.context, browser.pid);
    rmSync(profile, { recursive: true, force: true }); cleanup = true;
    writeFileSync(evidenceFile, JSON.stringify({ passed, cleanup, evidence }, null, 2), { mode: 0o600 });
  }
});
