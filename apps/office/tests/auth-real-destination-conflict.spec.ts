import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { privateControl, launchPrivateProfile, stopPrivateProfile, type RealStatus, type Inspection } from './helpers/real-recovery-control';

const origin = 'http://127.0.0.1:5191';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const editor = (page: Page) => page.locator('[data-server-note-workspace] .on-doc');
const save = (page: Page) => page.locator('[data-server-note-workspace]').getByRole('button', { name: /^(저장|저장 확인·재시도)$/ });
interface PendingRecord {
  draftId: string; status: string; snapshotText: string; savedAt: string;
  scope: Record<string, string>; base: Record<string, unknown>;
  source?: { kind: string; name: string }; confirmedCopy?: unknown;
  attempt?: { operation: string; workspaceId: string; title: string; snapshotText: string; idempotencyKey: string };
}
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.skip(!process.env.OFFICE_AUTH_CONTROL_FILE || !process.env.OFFICE_AUTH_REAL_FILE,
  'Destination schedules require the private PostgreSQL control and synthetic OIDC fixture.');

async function login(page: Page, url = origin, alias: 'alpha-editor' | 'beta-viewer' = 'alpha-editor') {
  await page.goto(url);
  await expect.poll(async () => await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible() ||
    await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await page.locator('[data-server-note-workspace]').isVisible()).toBe(true);
  const button = page.getByRole('button', { name: '일반 사용자로 들어가기' });
  if (await button.isVisible()) {
    await button.click();
    const username = page.locator('#username');
    if (await username.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)) {
      const fixture = JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8')) as {
        users: Record<string, { username?: string; password: string }>;
      };
      const account = fixture.users[alias]!;
      await username.fill(account.username ?? alias);
      await page.locator('#password').fill(account.password);
      await page.locator('#kc-login').click();
    }
  }
  await expect.poll(async () => await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() ||
    await page.locator('[data-server-note-workspace]').isVisible()).toBe(true);
  if (!(await page.locator('[data-server-note-workspace]').isVisible())) {
    const tenant = alias === 'alpha-editor' ? 'Alpha' : 'Beta';
    await page.getByRole('button', { name: new RegExp(`Synthetic ${tenant}`) }).click();
    await page.getByRole('button', { name: `${tenant} workspace` }).click();
    await page.getByRole('button', { name: '새 Note 만들기' }).click();
  }
  await expect(page.locator('[data-server-note-workspace]')).toBeVisible();
}
function track(page: Page) {
  const state = { bearer: '', creates: [] as Record<string, unknown>[] };
  page.on('request', request => {
    const authorization = request.headers().authorization;
    if (authorization) state.bearer = authorization;
    if (request.method() === 'POST' && /\/documents$/.test(new URL(request.url()).pathname)) state.creates.push(request.postDataJSON());
  });
  return state;
}
function snapshot(title: string, pageId: string, body: string) {
  const document = { stype: 'note', attributes: { title, pageId }, content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: body, marks: [{ stype: 'bold', range: [0, 6] }] },
      { stype: 'pageReference', attributes: { pageId, title: 'Self' } }] },
    { stype: 'codeBlock', attributes: { language: 'javascript' }, content: [{ stype: 'inline-text', text: 'const copy = true;' }] }
  ] };
  return { document, text: JSON.stringify({ format: 'barocss-note', version: 1, savedAt: '2026-10-01T00:00:00Z', document }) };
}
async function rows(page: Page) {
  return page.evaluate(() => new Promise<unknown[]>((resolve, reject) => {
    const request = indexedDB.open('barocss-note', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents'), result = tx.objectStore('documents').getAll();
      tx.oncomplete = () => { db.close(); resolve(result.result); };
      tx.onabort = () => reject(tx.error);
    };
  }));
}
async function seed(page: Page, pageId: string, title: string, text: string) {
  await page.evaluate(({ pageId, title, text }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('barocss-note', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'name' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ name: pageId, title, text, revision: 7, savedAt: 100, metadata: { favorite: true, source: 'destination-proof' } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  }), { pageId, title, text });
}
async function records(page: Page): Promise<Array<{ key: string; raw: string; record: PendingRecord }>> {
  return page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:'))
    .map(key => { const raw = localStorage.getItem(key)!; return { key, raw, record: JSON.parse(raw) }; }));
}
async function prepare(page: Page, title: string, text: string) {
  await page.getByRole('button', { name: '로컬 노트 사본 가져오기', exact: true }).click();
  await page.getByRole('button', { name: '이 기기의 로컬 노트 목록 확인' }).click();
  await page.getByRole('button', { name: `서버 사본 준비 ${title}`, exact: true }).click();
  await expect(save(page)).toBeEnabled();
  const pending = (await records(page)).find(entry => entry.record.snapshotText === text)!;
  expect(pending.record.status).toBe('pending');
  expect(pending.record.attempt?.snapshotText).toBe(text);
  return pending;
}
function createBody(status: RealStatus, title: string, snapshotText: string, idempotencyKey: string) {
  return { workspaceId: status.workspaceId, product: 'note', title, fileFormat: 'barocss-note', fileVersion: 1,
    snapshotText, idempotencyKey, importMode: 'new-page-copy' };
}
async function inspect(documentId?: string, key?: string) {
  return privateControl<Inspection>({ action: 'inspect', ...(documentId ? { documentId } : {}),
    ...(key ? { idempotencyKey: key, operation: 'create', actor: 'alpha-editor' } : {}) });
}
async function canonical(page: Page, root: string, bearer: string, state: Inspection) {
  expect(state.document).not.toBeNull();
  const response = await page.request.get(`${root}/documents/${state.document!.documentId}`, { headers: { Authorization: bearer } });
  expect(response.status()).toBe(200);
  const api = await response.json();
  expect(api.snapshotText).toBe(state.document!.snapshotText);
  expect(api.document).toMatchObject({ documentId: state.document!.documentId, pageId: state.document!.pageId,
    revision: state.document!.revision, snapshotHash: state.document!.snapshotHash, title: state.document!.title,
    metadataRevision: state.document!.metadataRevision, mode: state.document!.mode });
  expect(hash(api.snapshotText)).toBe(state.document!.snapshotHash);
  expect(JSON.parse(api.snapshotText).document).toEqual(state.document!.canonicalTree);
}
// Physical origin storage is readable under another login. Product recovery remains account scoped.
async function inspectResidualUnderB(page: Page, pageId: string, originalRows: unknown[],
  requests: ReturnType<typeof track>) {
  await expect(page.getByText(`로컬 원본 ${pageId}은 이 기기의 Note 저장소에 유지합니다.`, { exact: false })).toBeVisible();
  const retained = await records(page);
  const writesBefore = requests.creates.length, before = await inspect();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wonffice에 들어가기' })).toBeVisible();
  await expect(page.getByText('로그아웃했습니다.', { exact: true })).toBeVisible();
  await login(page, origin, 'beta-viewer');
  const fixture = JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8'));
  const claims = JSON.parse(Buffer.from(requests.bearer.split('.')[1]!, 'base64url').toString('utf8'));
  expect(claims.sub).toBe(fixture.users['beta-viewer'].id);
  // This is an actual read of the whole original row while B is authenticated, not an A-only read.
  expect(await rows(page)).toEqual(originalRows);
  expect(await records(page)).toEqual(retained);
  await expect(editor(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^초안 복구 / })).toHaveCount(0);
  await expect(page.locator('[data-confirmed-local-copy]')).toHaveCount(0);
  await expect(page.getByText(pageId, { exact: false })).toHaveCount(0);
  expect(requests.creates.length).toBe(writesBefore);
  const after = await inspect();
  expect(after.documentCount).toBe(before.documentCount);
  expect(after.receiptCount).toBe(before.receiptCount);
  return { actualIdpAccountSwitch: 'alpha-editor-to-beta-viewer', indexedDbLocation: 'barocss-note/documents',
    originalPageId: pageId, originalRowsHash: hash(JSON.stringify(originalRows)), originalRowsReadableUnderB: true,
    rawPendingReadableUnderB: true, rawPendingUnchanged: true, productRecoveryHiddenUnderB: true,
    noAutomaticSourceOpenOrCreate: true, originalResidualNoticeVisibleUnderA: true };
}
async function withPrivatePage(name: string, run: (page: Page, status: RealStatus, root: string, requests: ReturnType<typeof track>) => Promise<Record<string, unknown>>) {
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const profile = mkdtempSync(join(directory, `browser-destination-${name}-`));
  const evidencePath = join(directory, `destination-${name}-evidence.json`);
  writeFileSync(evidencePath, JSON.stringify({ status: 'incomplete' }), { mode: 0o600 });
  let browser: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  try {
    browser = await launchPrivateProfile(profile);
    const page = await browser.context.newPage(), requests = track(page);
    const status = await privateControl<RealStatus>({ action: 'status' });
    await login(page);
    expect(requests.bearer).not.toBe('');
    const evidence = await run(page, status, `${origin}/api/v1/tenants/${status.tenantId}`, requests);
    writeFileSync(evidencePath, JSON.stringify({ status: 'passed', databaseIdentity: status.databaseIdentity, browserPid: browser.pid, ...evidence }, null, 2), { mode: 0o600 });
  } finally {
    if (browser) await stopPrivateProfile(browser.context, browser.pid);
    rmSync(profile, { recursive: true, force: true });
  }
}

test('existing server page identity is copied into new identities without overwriting its destination', async () => {
  test.setTimeout(120_000);
  await withPrivatePage('identity', async (page, status, root, requests) => {
    const title = `Destination identity ${randomUUID()}`;
    const initial = snapshot(title, randomUUID(), 'Existing destination body');
    const initialKey = randomUUID();
    const response = await page.request.post(`${root}/documents`, { headers: { Authorization: requests.bearer },
      data: createBody(status, title, initial.text, initialKey) });
    expect(response.status()).toBe(201);
    const existingReceipt = await response.json();
    const existingId: string = existingReceipt.document.documentId, existingPage: string = existingReceipt.document.pageId;
    const existing = await inspect(existingId, initialKey);
    await canonical(page, root, requests.bearer, existing);
    const source = snapshot(title, existingPage, 'Local source copy body');
    await seed(page, existingPage, title, source.text);
    const originalRows = await rows(page);
    const pending = await prepare(page, title, source.text), key = pending.record.attempt!.idempotencyKey;
    expect(pending.record.scope.documentRef).toBe(existingPage);
    await save(page).click();
    await expect(page.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    await expect(page.locator('[data-confirmed-local-copy]')).toHaveCount(1);
    const receipt = await inspect(undefined, key);
    expect(receipt.receipt).not.toBeNull();
    const newId = receipt.receipt!.documentId;
    expect(newId).not.toBe(existingId);
    const copy = await inspect(newId, key);
    expect(copy.document!.pageId).not.toBe(existingPage);
    expect(copy.documentCount).toBe(existing.documentCount + 1);
    expect(copy.receiptCount).toBe(existing.receiptCount + 1);
    const expected = structuredClone(source.document);
    expected.attributes.pageId = copy.document!.pageId;
    (expected.content[0]!.content[1] as { attributes: { pageId: string } }).attributes.pageId = copy.document!.pageId;
    expect(copy.document!.canonicalTree).toEqual(expected);
    expect(copy.document!.title).toBe(title);
    expect(copy.document!.revision).toBe(1);
    await canonical(page, root, requests.bearer, copy);
    expect((await inspect(existingId, initialKey)).document).toEqual(existing.document);
    await canonical(page, root, requests.bearer, existing);
    expect(await rows(page)).toEqual(originalRows);
    const confirmed = (await records(page)).find(entry => entry.key === pending.key)!.record;
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.snapshotText).toBe(source.text);
    expect(confirmed.attempt).toEqual(pending.record.attempt);
    expect(confirmed.source).toEqual(pending.record.source);
    await expect(editor(page)).toContainText('Local source copy body');
    await expect(editor(page).locator('[data-note-page-reference]')).toHaveAttribute('data-page-id', copy.document!.pageId);
    await expect(editor(page).locator('pre')).toContainText('const copy = true;');
    expect(requests.creates).toHaveLength(1);
    expect(requests.creates[0]).toEqual(createBody(status, title, source.text, key));
    const residual = await inspectResidualUnderB(page, existingPage, originalRows, requests);
    return { residual, sourceHash: hash(source.text), existingId, existingPage, newId, newPage: copy.document!.pageId,
      existingSnapshotHash: existing.document!.snapshotHash, copySnapshotHash: copy.document!.snapshotHash,
      documentCount: copy.documentCount, receiptCount: copy.receiptCount, fixedKey: key };
  });
});

test('real different-body receipt cannot confirm or rotate the fixed local-copy attempt after recovery', async () => {
  test.setTimeout(120_000);
  await withPrivatePage('receipt', async (page, status, root, requests) => {
    const title = `Destination receipt ${randomUUID()}`, pageId = randomUUID();
    const source = snapshot(title, pageId, 'Original fixed local source');
    await seed(page, pageId, title, source.text);
    const originalRows = await rows(page);
    const pending = await prepare(page, title, source.text), key = pending.record.attempt!.idempotencyKey;
    const before = await inspect();
    const occupied = snapshot(title, randomUUID(), 'Different committed receipt body');
    const response = await page.request.post(`${root}/documents`, { headers: { Authorization: requests.bearer },
      data: createBody(status, title, occupied.text, key) });
    expect(response.status()).toBe(201);
    const occupiedReceipt = await response.json(), documentId: string = occupiedReceipt.document.documentId;
    const destination = await inspect(documentId, key);
    expect(destination.documentCount).toBe(before.documentCount + 1);
    expect(destination.receiptCount).toBe(before.receiptCount + 1);
    await canonical(page, root, requests.bearer, destination);
    const assertUnconfirmed = async () => {
      await expect(save(page)).toBeEnabled();
      await expect(page.locator('[data-save-status]')).toHaveText('저장 확인 필요');
      await expect(page.getByText('연결 또는 저장에 실패했습니다. 같은 요청으로 확인하거나 다시 시도하세요.', { exact: true })).toBeVisible();
      await expect(page.locator('[data-confirmed-local-copy]')).toHaveCount(0);
      await expect(editor(page)).toContainText('Original fixed local source');
      await expect(editor(page)).not.toContainText('Different committed receipt body');
      await expect(page.getByText(`로컬 원본 ${pageId}은 이 기기의 Note 저장소에 유지합니다.`, { exact: false })).toBeVisible();
      expect(await rows(page)).toEqual(originalRows);
      const entries = await records(page), current = entries.find(entry => entry.key === pending.key)!;
      expect(entries.filter(entry => entry.record.source?.name === pageId)).toHaveLength(1);
      // savedAt records the deliberate retry; all fixed request/source bytes and identities must stay equal.
      expect({ ...current.record, savedAt: pending.record.savedAt }).toEqual(pending.record);
      const unchanged = await inspect(documentId, key);
      expect(unchanged.document).toEqual(destination.document);
      expect(unchanged.receipt).toEqual(destination.receipt);
      expect(unchanged.documentCount).toBe(destination.documentCount);
      expect(unchanged.receiptCount).toBe(destination.receiptCount);
      expect(requests.creates).toHaveLength(0);
    };
    await save(page).click();
    await assertUnconfirmed();
    const persisted = (await records(page)).find(entry => entry.key === pending.key)!;
    await login(page, page.url());
    expect((await records(page)).find(entry => entry.key === pending.key)!.raw).toBe(persisted.raw);
    await page.getByRole('button', { name: new RegExp(`초안 복구 ${title}`) }).click();
    await save(page).click();
    await assertUnconfirmed();
    const conflict = await page.request.post(`${root}/documents`, { headers: { Authorization: requests.bearer },
      data: createBody(status, title, source.text, key) });
    expect(conflict.status()).toBe(409);
    expect(await conflict.json()).toMatchObject({ status: 'key_reuse' });
    await assertUnconfirmed();
    await canonical(page, root, requests.bearer, destination);
    const residual = await inspectResidualUnderB(page, pageId, originalRows, requests);
    return { residual, fixedKey: key, sourceHash: hash(source.text), fixedAttemptHash: hash(JSON.stringify(pending.record.attempt)),
      occupiedDocumentId: documentId, occupiedSnapshotHash: destination.document!.snapshotHash,
      documentCount: destination.documentCount, receiptCount: destination.receiptCount, originalBodyPostStatus: 409,
      rawPendingPreservedAcrossReload: true, productCreatePosts: requests.creates.length };
  });
});
