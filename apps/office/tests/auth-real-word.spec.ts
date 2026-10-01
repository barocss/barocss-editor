import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createSampleDocument } from '../../../packages/office-word/src/sample-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';
import { privateControl, launchPrivateProfile, stopPrivateProfile, type RealStatus, type Inspection } from './helpers/real-recovery-control';

const origin = 'http://127.0.0.1:5191';
const workspace = (page: Page) => page.locator('[data-server-word-workspace]');
const paragraphs = (page: Page) => workspace(page).locator('.w-paragraph');
const save = (page: Page) => workspace(page).getByRole('button', { name: /^(저장|저장 확인·재시도)$/ });
const saved = (page: Page) => workspace(page).locator('[data-save-status]');
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
type Alias = 'alpha-editor' | 'beta-viewer';
interface Pending {
  draftId: string; status: string; snapshotText: string; savedAt: string; scope: { subject: string };
  attempt?: { operation: 'create' | 'update'; idempotencyKey: string; snapshotText: string };
}
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.skip(!process.env.OFFICE_AUTH_REAL_FILE || !process.env.OFFICE_AUTH_CONTROL_FILE,
  'Word acceptance requires the protected synthetic OIDC fixture and disposable PostgreSQL supervisor.');

async function login(page: Page, alias: Alias, url = origin, tenant: 'Alpha' | 'Beta' = 'Alpha') {
  await page.goto(url);
  await expect.poll(async () => await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible() ||
    await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await workspace(page).isVisible()).toBe(true);
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
    await workspace(page).isVisible()).toBe(true);
  if (!(await workspace(page).isVisible())) {
    await page.getByRole('button', { name: new RegExp(`Synthetic ${tenant}`) }).click();
    await page.getByRole('button', { name: `${tenant} workspace`, exact: true }).click();
    await page.getByRole('button', { name: 'Word 자료', exact: true }).click();
    await page.getByRole('button', { name: '새 Word 만들기', exact: true }).click();
  }
  await expect(workspace(page)).toBeVisible();
}
async function logout(page: Page) {
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
    const request = indexedDB.open('barocss-word', 1);
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
  const name = randomUUID(), document = createSampleDocument();
  document.metadata = { originalOwner: 'synthetic-A', loadedAt: 'original-native-loadedAt' };
  const text = wordFileText(document, '2026-10-01T00:00:00.000Z');
  await page.evaluate(({ name, title, text }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('barocss-word', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'name' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ name, title, text, count: 1, savedAt: 100,
        metadata: { favorite: true, purpose: 'Word source-retention' } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  }), { name, title, text });
  return { name, title, text, document };
}
async function records(page: Page): Promise<Pending[]> {
  return page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.word.pending.v1:'))
    .map(key => JSON.parse(localStorage.getItem(key)!)));
}
async function typeInput(page: Page, text: string) {
  const paragraph = paragraphs(page).filter({ hasText: 'This paragraph takes its font' }).first();
  await expect(paragraph).toBeVisible();
  await expect.poll(() => paragraph.evaluate(node => node.closest('[contenteditable]')?.getAttribute('contenteditable'))).toBe('true');
  const bounds = await paragraph.boundingBox();
  expect(bounds).not.toBeNull();
  await paragraph.click({ position: { x: 8, y: Math.min(10, bounds!.height / 2) } });
  await page.keyboard.press('Home');
  await page.keyboard.insertText(text);
  await expect(paragraph).toContainText(text);
  await expect.poll(async () => (await records(page)).some(record => record.snapshotText.includes(text))).toBe(true);
  await expect(save(page)).toBeEnabled();
}
async function prepare(page: Page, title: string) {
  await workspace(page).getByRole('button', { name: '이 기기의 로컬 문서 목록 확인' }).click();
  await workspace(page).getByRole('button', { name: `${title} · 새 서버 사본 준비`, exact: true }).click();
  await expect(save(page)).toBeEnabled();
  return (await records(page)).find(record => record.status === 'pending')!;
}
function inspect(documentId?: string, key?: string, operation: 'create' | 'update' = 'update', actor: Alias = 'alpha-editor') {
  return privateControl<Inspection<'word'>>({ action: 'inspect', product: 'word', ...(documentId ? { documentId } : {}),
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
  expect(api.document.product).toBe('word');
  expect(api.document.pageId).toBeNull();
  expect(api.document.revision).toBe(db.document!.revision);
  expect(api.document.tenantId).toBe(db.document!.tenantId);
  expect(api.document.workspaceId).toBe(db.document!.workspaceId);
  expect(api.document.metadataRevision).toBe(db.document!.metadataRevision);
  expect(hash(api.snapshotText)).toBe(db.document!.snapshotHash);
  expect(JSON.parse(api.snapshotText).document).toEqual(db.document!.canonicalTree);
  await expect(workspace(page).locator('table').first()).toBeVisible();
  await expect(workspace(page)).toContainText('this was added');
  await expect(workspace(page)).toContainText('Put the caret in a cell');
  await expect(workspace(page)).toContainText('This paragraph takes its font');
  return db;
}

// One serial schedule owns its profiles and all private service controls.
test('real Word native copy, fixed loss recovery, durable restart and sequential writers', async () => {
  test.setTimeout(360_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!), evidenceFile = join(directory, 'word-real-recovery.json');
  const profileA = mkdtempSync(join(directory, 'word-a-')), profileB = mkdtempSync(join(directory, 'word-b-'));
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
    const source = await seed(page, 'Real rich Word copy'), originalRows = await rows(page);
    const pending = await prepare(page, source.title);
    expect(pending.snapshotText).toBe(source.text);
    const key = pending.attempt!.idempotencyKey, before = await inspect();
    await page.route(`${root}/documents`, async route => {
      expect((await route.fetch()).ok()).toBe(true);
      await route.abort('failed');
    }, { times: 1 });
    await save(page).click();
    await expect(save(page)).toBeEnabled();
    await expect(saved(page)).not.toHaveText('서버 저장 확인됨');
    const uncertain = await inspect(undefined, key, 'create');
    expect(uncertain.receipt).not.toBeNull();
    expect(uncertain.documentCount).toBe(before.documentCount + 1);
    expect(uncertain.receiptCount).toBe(before.receiptCount + 1);
    const documentId = uncertain.receipt!.documentId;
    expect(requests.writes[0]!.body).toMatchObject({ product: 'word', fileFormat: 'barocss-word', fileVersion: 1,
      snapshotText: source.text, idempotencyKey: key });
    expect(requests.writes[0]!.body).not.toHaveProperty('importMode');
    const fixed = requests.writes[0]!.body;
    expect(await rows(page)).toEqual(originalRows);
    await page.reload();
    // An unconfirmed create has no verified document URL. Re-enter the same
    // authenticated Word workspace before selecting its retained pending copy.
    await login(page, 'alpha-editor', page.url());
    page.once('dialog', dialog => dialog.accept());
    await workspace(page).getByRole('button', { name: `저장된 Word 초안 복구 · ${pending.savedAt}`, exact: true }).click();
    const createsBefore = requests.writes.length;
    await save(page).click();
    await expect(saved(page)).toHaveText('서버 저장 확인됨');
    expect(requests.writes).toHaveLength(createsBefore);
    const documentUrl = page.url();
    await canonical(page, root, requests.bearer, documentId, source.text);
    expect((await inspect(undefined, key, 'create')).receipt!.snapshotText).toBe(source.text);
    expect((await records(page)).find(record => record.attempt?.idempotencyKey === key)?.status).toBe('confirmed');
    for (const loss of ['before', 'after'] as const) {
      await typeInput(page, ` Word-${loss}-input`);
      const beforeUpdate = await inspect(documentId), index = requests.writes.length;
      await page.route(`${root}/documents/${documentId}/snapshot`, async route => {
        if (loss === 'after') expect((await route.fetch()).ok()).toBe(true);
        await route.abort('failed');
      }, { times: 1 });
      await save(page).click();
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
      await workspace(page).getByRole('button', { name: `저장된 Word 초안 복구 · ${recovery.savedAt}`, exact: true }).click();
      const retryIndex = requests.writes.length;
      await save(page).click();
      await expect(saved(page)).toHaveText('서버 저장 확인됨');
      if (loss === 'before') expect(requests.writes[retryIndex]!.body).toEqual(update);
      else expect(requests.writes).toHaveLength(retryIndex);
      const result = await canonical(page, root, requests.bearer, documentId, update.snapshotText as string);
      expect(result.document!.revision).toBe(beforeUpdate.document!.revision + 1);
      expect(result.receiptCount).toBe(beforeUpdate.receiptCount + 1);
      evidence.push({ kind: `update-${loss}`, revision: result.document!.revision, hash: result.document!.snapshotHash });
    }
    await typeInput(page, ' latest-input-before-process-restart');
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
    await workspace(page).getByRole('button', { name: `저장된 Word 초안 복구 · ${latest.savedAt}`, exact: true }).click();
    await expect(workspace(page)).toContainText('latest-input-before-process-restart');
    expect((await records(page)).find(record => record.draftId === latest.draftId)?.snapshotText).toBe(latest.snapshotText);
    const dbBefore = await inspect(documentId);
    await page.route(`${root}/documents/${documentId}/snapshot`, async route => {
      await privateControl({ action: 'db-stop' });
      await route.continue();
    }, { times: 1 });
    const failed = page.waitForResponse(response => response.request().method() === 'PUT' && /\/snapshot$/.test(new URL(response.url()).pathname));
    await save(page).click(); expect((await failed).status()).toBe(503);
    await expect(saved(page)).not.toHaveText('서버 저장 확인됨');
    const failedUpdate = requests.writes.at(-1)!.body;
    await privateControl({ action: 'db-start' });
    await save(page).click(); await expect(saved(page)).toHaveText('서버 저장 확인됨');
    expect(requests.writes.at(-1)!.body).toEqual(failedUpdate);
    const restored = await canonical(page, root, requests.bearer, documentId, failedUpdate.snapshotText as string);
    const findNative = (value: unknown, stype: string): unknown[] => {
      if (!value || typeof value !== 'object') return [];
      const node = value as { stype?: string; content?: unknown[] };
      return [...(node.stype === stype ? [value] : []), ...(node.content ?? []).flatMap(child => findNative(child, stype))];
    };
    for (const type of ['resources', 'docMeta', 'bTable']) {
      expect(findNative(restored.document!.canonicalTree, type)).toEqual(findNative(source.document, type));
    }
    expect(restored.databaseIdentity).toBe(status.databaseIdentity);
    expect(restored.document!.revision).toBe(dbBefore.document!.revision + 1);
    expect(await rows(page)).toEqual(originalRows);
    b = await launchPrivateProfile(profileB);
    const other = await b.context.newPage(), otherRequests = track(other);
    await login(other, 'beta-viewer', documentUrl);
    await expect(save(other)).toHaveCount(0);
    const viewerParagraph = paragraphs(other).filter({ hasText: 'This paragraph takes its font' }).first();
    const viewerText = await viewerParagraph.textContent();
    await viewerParagraph.click(); await other.keyboard.type('viewer-forbidden-input');
    await expect(viewerParagraph).toHaveText(viewerText!);
    await expect(workspace(other).locator('[contenteditable=true]')).toHaveCount(0);
    const denied = await other.request.put(`${root}/documents/${documentId}/snapshot`, { headers: { Authorization: otherRequests.bearer },
      data: { expectedRevision: restored.document!.revision, snapshotText: restored.document!.snapshotText, idempotencyKey: 'word-viewer-denied' } });
    expect(denied.status()).toBe(403);
    expect((await inspect(documentId, 'word-viewer-denied', 'update', 'beta-viewer')).receipt).toBeNull();
    expect((await inspect(documentId)).document).toEqual(restored.document);
    await privateControl({ action: 'beta-role', role: 'editor' });
    await other.reload();
    // A reload ends navigation before the asynchronous server document opens.
    // Establish B's actual stale source before A advances the revision.
    await expect(workspace(other).locator('[contenteditable=true]').first()).toBeVisible();
    await expect(saved(other)).toHaveText('서버 저장 확인됨');
    const beforeWriterA = await inspect(documentId);
    const exportedB = other.waitForEvent('download');
    await workspace(other).getByRole('button', { name: 'Word 파일 내보내기', exact: true }).click();
    const bFile = await exportedB;
    const bNative = JSON.parse(readFileSync((await bFile.path())!, 'utf8'));
    expect(bNative.document).toEqual(JSON.parse(beforeWriterA.document!.snapshotText).document);
    await test.info().attach('stale-B-before-A.json', { body: JSON.stringify({ revision: beforeWriterA.document!.revision, document: bNative.document }), contentType: 'application/json' });
    await typeInput(page, ' writer-A-committed'); await save(page).click();
    await expect(saved(page)).toHaveText('서버 저장 확인됨');
    const afterA = await inspect(documentId);
    await typeInput(other, ' stale-writer-B-retained'); await save(other).click();
    await expect(workspace(other).getByRole('button', { name: '충돌 초안 복사', exact: true })).toBeVisible();
    expect((await records(other)).some(record => record.snapshotText.includes('stale-writer-B-retained'))).toBe(true);
    expect((await inspect(documentId)).document).toEqual(afterA.document);
    await workspace(other).getByRole('button', { name: '충돌 초안 복사', exact: true }).click();
    other.once('dialog', dialog => dialog.accept());
    await workspace(other).getByRole('button', { name: '서버 최신본 열기' }).click();
    await typeInput(other, ' writer-B-reconciled'); await save(other).click();
    await expect(saved(other)).toHaveText('서버 저장 확인됨');
    const afterB = await canonical(other, root, otherRequests.bearer, documentId);
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

test('same physical profile preserves Word source and A recovery across actual B login', async () => {
  test.setTimeout(180_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!), evidenceFile = join(directory, 'word-real-account.json');
  const profile = mkdtempSync(join(directory, 'word-account-'));
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
    const source = await seed(page, 'Account retained rich Word'), originals = await rows(page);
    await prepare(page, source.title);
    await save(page).click(); await expect(saved(page)).toHaveText('서버 저장 확인됨');
    const documentUrl = page.url(), sourcePending = (await records(page)).find(record => record.status === 'confirmed')!;
    const committed = await inspect(undefined, sourcePending.attempt!.idempotencyKey, 'create');
    const documentId = committed.receipt!.documentId;
    await expect(workspace(page).locator('[data-confirmed-local-copy]')).toContainText('이 기기에 남아 있습니다');
    await typeInput(page, ' A-private-recovery-input');
    await page.route(`${root}/documents/${documentId}/snapshot`, route => route.abort('failed'), { times: 1 });
    await save(page).click(); await expect(save(page)).toBeEnabled();
    const pendingA = (await records(page)).find(record => record.status === 'pending' &&
      record.snapshotText.includes('A-private-recovery-input'))!;
    expect(pendingA.attempt).toBeDefined();
    const retained = await records(page), before = await inspect(documentId), writesBeforeB = requests.writes.length;
    await logout(page);
    await login(page, 'beta-viewer', documentUrl);
    await expect(workspace(page)).not.toContainText('A-private-recovery-input');
    await expect(workspace(page).getByRole('button', { name: /^저장된 Word 초안 복구/ })).toHaveCount(0);
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
    await workspace(page).getByRole('button', { name: `저장된 Word 초안 복구 · ${pendingA.savedAt}`, exact: true }).click();
    await expect(workspace(page)).toContainText('A-private-recovery-input');
    expect((await records(page)).find(record => record.draftId === pendingA.draftId)?.attempt).toEqual(pendingA.attempt);
    await save(page).click(); await expect(saved(page)).toHaveText('서버 저장 확인됨');
    const result = await canonical(page, root, requests.bearer, documentId, pendingA.snapshotText);
    expect(result.document!.revision).toBe(before.document!.revision + 1);
    expect(requests.writes.at(-1)!.body.idempotencyKey).toBe(pendingA.attempt!.idempotencyKey);
    expect(await rows(page)).toEqual(originals);
    evidence.push({ kind: 'same-profile-A-B-A', sourceHash: hash(source.text), pendingHash: hash(pendingA.snapshotText),
      documentId, revision: result.document!.revision, physicallyReadableOriginalAndDraftUnderB: true,
      originalLocation: 'IndexedDB barocss-word/documents', recoveryLocation: 'localStorage wonffice.word.pending.v1' });
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
