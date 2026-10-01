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
type RecordRow = { key: string; raw: string; record: { draftId: string; snapshotText: string; status: string;
  scope: { subject: string }; attempt?: { idempotencyKey: string; snapshotText: string } } };
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
  return JSON.parse(readFileSync(file, 'utf8')) as { users: Record<Alias, { username?: string; password: string }> };
}

// Credentials and bearer tokens stay in memory. Neither appears in artifacts or console output.
async function login(page: Page, alias: Alias, target = origin) {
  await page.goto(target);
  await expect.poll(async () => await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible() ||
    await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await workspace(page).isVisible() ||
    await page.getByRole('heading', { name: '접근 권한이 없습니다' }).isVisible()).toBe(true);
  const entry = page.getByRole('button', { name: '일반 사용자로 들어가기' });
  if (await entry.isVisible()) {
    await entry.click();
    if (await page.locator('#username').waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)) {
      const account = accounts().users[alias];
      await page.locator('#username').fill(account.username ?? alias);
      await page.locator('#password').fill(account.password);
      await page.locator('#kc-login').click();
    }
  }
  await expect.poll(async () => await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() ||
    await workspace(page).isVisible() || await page.getByRole('heading', { name: '접근 권한이 없습니다' }).isVisible()).toBe(true);
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
  await page.getByRole('button', { name: '새 Note 만들기', exact: true }).click();
  await workspace(page).locator('.nw-sidebar > button').filter({ hasText: /^새 노트$/ }).click();
  await expect.poll(() => editor(page).locator(':scope > p').first().evaluate(element =>
    element.closest('[contenteditable]')?.getAttribute('contenteditable'))).toBe('true');
}
async function typeInput(page: Page, text: string) {
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
    const documentUrl = a.url(), documentId = new URL(documentUrl).searchParams.get('document')!;
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
    const url = page.url(), documentId = new URL(url).searchParams.get('document')!;
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
