import { readFileSync, writeFileSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { privateControl, launchPrivateProfile, stopPrivateProfile, type RealStatus, type Inspection } from './helpers/real-recovery-control';

const origin = 'http://127.0.0.1:5191';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const editor = (page: Page) => page.locator('[data-server-note-workspace] .on-doc');
const save = (page: Page) => page.locator('[data-server-note-workspace]').getByRole('button', { name: /^(저장|저장 확인·재시도)$/ });
const fixture = () => JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8')) as {
  users: Record<string, { username?: string; password: string }>;
};
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.skip(!process.env.OFFICE_AUTH_CONTROL_FILE || !process.env.OFFICE_AUTH_REAL_FILE,
  'The same-DB matrix requires the explicit private control descriptor and synthetic fixture.');

async function login(page: Page, alias: string, url = origin) {
  await page.goto(url);
  await expect.poll(async () => await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible() ||
    await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await page.locator('[data-server-note-workspace]').isVisible()).toBe(true);
  const button = page.getByRole('button', { name: '일반 사용자로 들어가기' });
  if (await button.isVisible()) {
    await button.click();
    const username = page.locator('#username');
    if (await username.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)) {
      const account = fixture().users[alias]!;
      await username.fill(account.username ?? alias);
      await page.locator('#password').fill(account.password);
      await page.locator('#kc-login').click();
    }
  }
  await expect.poll(async () => await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() ||
    await page.locator('[data-server-note-workspace]').isVisible(), { timeout: 15_000 }).toBe(true);
  if (!(await page.locator('[data-server-note-workspace]').isVisible())) {
    await page.getByRole('button', { name: /Synthetic Alpha/ }).click();
    await page.getByRole('button', { name: 'Alpha workspace' }).click();
    await page.getByRole('button', { name: '새 Note 만들기' }).click();
  }
  await expect(page.locator('[data-server-note-workspace]')).toBeVisible();
}

function track(page: Page) {
  const state = { bearer: '', writes: [] as Array<{ operation: 'create' | 'update'; body: Record<string, unknown> }> };
  page.on('request', request => {
    const auth = request.headers().authorization;
    if (auth) state.bearer = auth;
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && /\/documents$/.test(path)) state.writes.push({ operation: 'create', body: request.postDataJSON() });
    if (request.method() === 'PUT' && /\/snapshot$/.test(path)) state.writes.push({ operation: 'update', body: request.postDataJSON() });
  });
  return state;
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
  const pageId: string = crypto.randomUUID();
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
async function input(page: Page, text: string) {
  const paragraph = editor(page).locator(':scope > p').first();
  await expect.poll(() => paragraph.evaluate(node => node.closest('[contenteditable]')?.getAttribute('contenteditable'))).toBe('true');
  const bounds = await paragraph.boundingBox();
  expect(bounds).not.toBeNull();
  await paragraph.click({ position: { x: 8, y: Math.min(10, bounds!.height / 2) } });
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.insertText(text);
  await expect(paragraph).toContainText(text);
}
async function edit(page: Page, text: string) {
  await input(page, text);
  await expect.poll(async () => (await records(page)).some(record => record.snapshotText.includes(text))).toBe(true);
  await expect(save(page)).toBeEnabled();
}
async function records(page: Page) {
  return page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:'))
    .map(key => JSON.parse(localStorage.getItem(key)!) as { status: string; draftId: string; snapshotText: string;
      attempt?: { idempotencyKey: string }; scope: { subject: string } }));
}

// One serial schedule owns all service controls and both browser OS processes.
// It compares real API/PG effects; fault routes only suppress transport or delivery.
test('same database recovery matrix verifies real loss, restart, outage and two writers', async () => {
  test.setTimeout(480_000);
  const controlFile = process.env.OFFICE_AUTH_CONTROL_FILE!;
  expect(statSync(controlFile).mode & 0o077).toBe(0);
  const artifactDir = dirname(controlFile);
  const profileA = mkdtempSync(join(artifactDir, 'browser-a-'));
  const profileB = mkdtempSync(join(artifactDir, 'browser-b-'));
  const evidenceFile = join(artifactDir, 'recovery-evidence.json');
  const runId = crypto.randomUUID();
  writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete', runId }), { mode: 0o600 });
  let a: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let b: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let page: Page;
  let requests: ReturnType<typeof track>;
  const evidence: Array<Record<string, unknown>> = [];
  let documentId = '';
  let status: RealStatus;
  let root: string;
  const inspect = (key?: string, operation?: string, actor = 'alpha-editor') => privateControl<Inspection>({ action: 'inspect',
    ...(documentId ? { documentId } : {}), ...(key ? { idempotencyKey: key, operation, actor } : {}) });
  const canonical = async (current: Inspection) => {
    expect(current.document).not.toBeNull();
    const response = await page.request.get(`${root}/documents/${documentId}`, { headers: { Authorization: requests.bearer } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.snapshotText).toBe(current.document!.snapshotText);
    expect(body.document.revision).toBe(current.document!.revision);
    expect(body.document.pageId).toBe(current.document!.pageId);
    expect(body.document.title).toBe(current.document!.title);
    expect(body.document.product).toBe(current.document!.product);
    expect(body.document.tenantId).toBe(current.document!.tenantId);
    expect(body.document.workspaceId).toBe(current.document!.workspaceId);
    expect(body.document.metadataRevision).toBe(current.document!.metadataRevision);
    expect(hash(body.snapshotText)).toBe(current.document!.snapshotHash);
    expect(JSON.parse(body.snapshotText).document).toEqual(current.document!.canonicalTree);
    await expect(editor(page)).toContainText('const matrix = true;');
    await expect(editor(page)).toContainText('Matrix cell');
    const native = JSON.parse(body.snapshotText).document as { content: Array<{ content?: Array<{ stype: string; text?: string }> }> };
    for (const inline of native.content[0]!.content ?? []) {
      if (inline.stype === 'inline-text' && inline.text) await expect(editor(page).locator(':scope > p').first()).toContainText(inline.text);
    }
    await expect(editor(page).locator('[data-note-page-reference]')).toHaveAttribute('data-page-id', current.document!.pageId);
    await expect(editor(page).locator('table')).toContainText('Matrix cell');
    await expect(editor(page).locator('pre')).toContainText('const matrix = true;');
    evidence.push({ kind: 'canonical', revision: current.document!.revision,
      snapshotHash: current.document!.snapshotHash, canonicalTreeHash: current.document!.canonicalTreeHash });
  };
  const restart = async () => {
    const url = page.url(), browserPid = a!.pid;
    const persisted = await inspect();
    await stopPrivateProfile(a!.context, a!.pid);
    const stopped = await privateControl<RealStatus>({ action: 'api-stop' });
    expect(stopped.apiRunning).toBe(false);
    const restarted = await privateControl<RealStatus>({ action: 'api-start' });
    expect(restarted.apiPid).not.toBe(stopped.apiPid);
    expect(restarted.postgresPid).toBe(stopped.postgresPid);
    expect(restarted.databaseIdentity).toBe(status.databaseIdentity);
    expect(restarted.databaseGeneration).toBe(status.databaseGeneration);
    const preserved = await inspect();
    expect(preserved.document).toEqual(persisted.document);
    expect(preserved.documentCount).toBe(persisted.documentCount);
    expect(preserved.receiptCount).toBe(persisted.receiptCount);
    a = await launchPrivateProfile(profileA);
    expect(a!.pid).not.toBe(browserPid);
    page = await a!.context.newPage(); requests = track(page);
    await login(page, 'alpha-editor', url);
    evidence.push({ kind: 'process-restart', browserBefore: browserPid, browserAfter: a!.pid,
      apiBefore: stopped.apiPid, apiAfter: restarted.apiPid, postgresPid: restarted.postgresPid, databaseIdentity: restarted.databaseIdentity, databaseGeneration: restarted.databaseGeneration });
  };
  try {
    a = await launchPrivateProfile(profileA);
    page = await a.context.newPage();
    requests = track(page);
    status = await privateControl<RealStatus>({ action: 'status' });
    root = `${origin}/api/v1/tenants/${status.tenantId}`;
    await login(page, 'alpha-editor');
    for (const loss of ['database', 'before', 'after'] as const) {
      console.log(JSON.stringify({ event: 'real_note_matrix_stage', stage: 'create-' + loss }));
      const source = await seed(page, `Matrix copy ${loss}`);
      const originalRows = await localRows(page);
      await page.getByRole('button', { name: '로컬 노트 사본 가져오기', exact: true }).click();
      await page.getByRole('button', { name: '이 기기의 로컬 노트 목록 확인' }).click();
      await page.getByRole('button', { name: `서버 사본 준비 Matrix copy ${loss}` }).click();
      const before = await inspect();
      const index = requests.writes.length;
      if (loss === 'database') {
        const failedDestination = await privateControl<RealStatus>({ action: 'db-stop' });
        expect(failedDestination.databaseRunning).toBe(false);
      } else {
        await page.route(`${root}/documents`, async route => {
          if (loss === 'after') expect((await route.fetch()).ok()).toBe(true);
          await route.abort('failed');
        }, { times: 1 });
      }
      const destinationReply = loss === 'database' ? page.waitForResponse(response =>
        response.request().method() === 'GET' && new URL(response.url()).pathname.includes('/receipts/create/')) : undefined;
      await save(page).click();
      if (destinationReply) expect((await destinationReply).status()).toBe(503);
      await expect(save(page)).toBeEnabled();
      const fixed = loss === 'database' ? { workspaceId: status.workspaceId, product: 'note', title: source.document.attributes.title,
        fileFormat: 'barocss-note', fileVersion: 1, snapshotText: source.text,
        idempotencyKey: (await records(page)).find(record => record.snapshotText === source.text)!.attempt!.idempotencyKey, importMode: 'new-page-copy' } : requests.writes[index]!.body;
      const key = fixed.idempotencyKey as string;
      expect(fixed.snapshotText).toBe(source.text);
      if (loss === 'database') {
        expect(requests.writes).toHaveLength(index);
        expect((await records(page)).some(record => record.snapshotText === source.text && record.status === 'pending')).toBe(true);
        expect(await localRows(page)).toEqual(originalRows);
        const restored = await privateControl<RealStatus>({ action: 'db-start' });
        expect(restored.databaseRunning).toBe(true);
        expect(restored.postgresPid).not.toBe(before.postgresPid);
        expect(restored.databaseIdentity).toBe(status.databaseIdentity);
      }
      const uncertain = await inspect(key, 'create');
      expect(uncertain.receipt === null).toBe(loss !== 'after');
      expect(uncertain.documentCount).toBe(before.documentCount + (loss === 'after' ? 1 : 0));
      for (let reload = 0; reload < 2; reload++) {
        await login(page, 'alpha-editor', page.url());
        await expect(page.getByRole('button', { name: new RegExp(`초안 복구 Matrix copy ${loss}`) })).toHaveCount(1);
      }
      await restart();
      await page.getByRole('button', { name: new RegExp(`초안 복구 Matrix copy ${loss}`) }).click();
      await save(page).click();
      await expect(page.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
      const result = await inspect(key, 'create');
      expect(result.documentCount).toBe(before.documentCount + 1);
      expect(result.receiptCount).toBe(before.receiptCount + 1);
      expect(result.receipt).not.toBeNull();
      documentId = result.receipt!.documentId;
      const final = await inspect(key, 'create');
      const expected = structuredClone(source.document);
      expected.attributes.pageId = final.document!.pageId;
      (expected.content[0]!.content[1] as { attributes: { pageId: string } }).attributes.pageId = final.document!.pageId;
      expect(final.document!.canonicalTree).toEqual(expected);
      expect(final.document!.title).toBe(source.document.attributes.title);
      if (loss !== 'after') expect(requests.writes[0]!.body).toEqual(fixed);
      else expect(requests.writes).toHaveLength(0);
      expect(final.document!.pageId).not.toBe(source.pageId);
      expect(await localRows(page)).toEqual(originalRows);
      expect((await records(page)).find(record => record.attempt?.idempotencyKey === key)?.status).toBe('confirmed');
      await canonical(final);
      evidence.push({ kind: `create-${loss}-commit-loss`, receiptCount: final.receiptCount, documentCount: final.documentCount, requestHash: hash(JSON.stringify(fixed)) });
    }
    for (const loss of ['before', 'after'] as const) {
      console.log(JSON.stringify({ event: 'real_note_matrix_stage', stage: 'update-' + loss }));
      await edit(page, ` update-${loss}`);
      const before = await inspect();
      const index = requests.writes.length;
      await page.route(`${root}/documents/${documentId}/snapshot`, async route => {
        if (loss === 'after') expect((await route.fetch()).ok()).toBe(true);
        await route.abort('failed');
      }, { times: 1 });
      await save(page).click();
      await expect(save(page)).toBeEnabled();
      const fixed = requests.writes[index]!.body;
      const key = fixed.idempotencyKey as string;
      const uncertain = await inspect(key, 'update');
      expect(uncertain.receipt === null).toBe(loss === 'before');
      expect(uncertain.document!.revision).toBe(before.document!.revision + (loss === 'after' ? 1 : 0));
      await restart();
      await page.getByRole('button', { name: /초안 복구 Matrix copy after/ }).click();
      await save(page).click();
      await expect(page.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
      const final = await inspect(key, 'update');
      expect(final.document!.revision).toBe(before.document!.revision + 1);
      expect(final.document!.snapshotText).toBe(fixed.snapshotText);
      expect(final.receiptCount).toBe(before.receiptCount + 1);
      if (loss === 'before') expect(requests.writes[0]!.body).toEqual(fixed);
      else expect(requests.writes).toHaveLength(0);
      await canonical(final);
    }
    console.log(JSON.stringify({ event: 'real_note_matrix_stage', stage: 'database-outage' }));
    await edit(page, ' database-outage-input');
    const beforeOutage = await inspect();
    const stoppedDb = await privateControl<RealStatus>({ action: 'db-stop' });
    expect(stoppedDb.databaseRunning).toBe(false);
    expect(stoppedDb.postgresPid).toBeNull();
    const index = requests.writes.length;
    const outageReply = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith('/snapshot'));
    await save(page).click();
    expect((await outageReply).status()).toBe(503);
    await expect(save(page)).toBeEnabled();
    await expect(page.locator('[data-save-status]')).not.toHaveText('서버 저장 확인됨');
    const failed = requests.writes[index]!.body;
    expect((await records(page)).some(record => record.snapshotText === failed.snapshotText && record.status === 'pending')).toBe(true);
    const restoredDb = await privateControl<RealStatus>({ action: 'db-start' });
    expect(restoredDb.databaseRunning).toBe(true);
    expect(restoredDb.postgresPid).not.toBe(beforeOutage.postgresPid);
    expect(restoredDb.databaseIdentity).toBe(status.databaseIdentity);
    expect(restoredDb.databaseGeneration).toBe(status.databaseGeneration);
    await save(page).click();
    await expect(page.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    const recovered = await inspect(failed.idempotencyKey as string, 'update');
    expect(recovered.document!.revision).toBe(beforeOutage.document!.revision + 1);
    expect(recovered.receiptCount).toBe(beforeOutage.receiptCount + 1);
    expect(recovered.document!.snapshotText).toBe(failed.snapshotText);
    await canonical(recovered);
    await restart();
    await canonical(await inspect());
    evidence.push({ kind: 'db-outage-recovery', revision: recovered.document!.revision, snapshotHash: recovered.document!.snapshotHash });

    console.log(JSON.stringify({ event: 'real_note_matrix_stage', stage: 'two-writers' }));
    b = await launchPrivateProfile(profileB);
    const other = await b.context.newPage(), otherRequests = track(other);
    await login(other, 'beta-viewer', page.url());
    await expect(other.locator('[data-server-note-workspace]').getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    const beforeDenied = await inspect();
    const denied = await other.request.put(`${root}/documents/${documentId}/snapshot`, {
      headers: { Authorization: otherRequests.bearer }, data: { expectedRevision: recovered.document!.revision,
        snapshotText: recovered.document!.snapshotText, idempotencyKey: 'viewer-denied-matrix' }
    });
    expect(denied.status()).toBe(403);
    const deniedDb = await inspect('viewer-denied-matrix', 'update', 'beta-viewer');
    expect(deniedDb.receipt).toBeNull();
    expect(deniedDb.document!.snapshotText).toBe(beforeDenied.document!.snapshotText);
    expect(deniedDb.receiptCount).toBe(beforeDenied.receiptCount);
    await privateControl({ action: 'beta-role', role: 'editor' });
    await other.reload();
    await expect(editor(other)).toContainText('database-outage-input');
    await edit(page, ' writer-A'); await save(page).click();
    await expect(page.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    const afterA = await inspect();
    await edit(other, ' stale-writer-B'); await save(other).click();
    await expect(other.getByRole('button', { name: '초안 복사', exact: true })).toBeVisible();
    expect((await records(other)).some(record => record.snapshotText.includes('stale-writer-B'))).toBe(true);
    expect((await inspect()).document!.snapshotText).toBe(afterA.document!.snapshotText);
    await other.getByRole('button', { name: '초안 복사', exact: true }).click();
    other.once('dialog', dialog => dialog.accept());
    await other.getByRole('button', { name: '서버 최신본 열기' }).click();
    await expect(editor(other)).toContainText('writer-A');
    await edit(other, ' reconciled-writer-B'); await save(other).click();
    await expect(other.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    const afterB = await inspect();
    expect(afterB.document!.revision).toBe(afterA.document!.revision + 1);
    expect(afterB.document!.snapshotText).toContain('writer-A');
    expect(afterB.document!.snapshotText).toContain('reconciled-writer-B');
    expect(afterB.document!.snapshotText).not.toContain('stale-writer-B');
    await page.reload(); await canonical(afterB);
    evidence.push({ kind: 'two-real-writers-conflict', writerARevision: afterA.document!.revision, writerBRevision: afterB.document!.revision });
    await privateControl({ action: 'beta-active', active: false });
    await other.getByRole('button', { name: /초안 복구 Matrix copy after/ }).click();
    await expect(editor(other)).toHaveCount(0);
    expect((await records(other)).some(record => record.snapshotText.includes('stale-writer-B'))).toBe(true);
    const revoked = await other.request.get(`${root}/documents/${documentId}`, { headers: { Authorization: otherRequests.bearer } });
    expect(revoked.status()).toBe(403);
  } finally {
    const restored = await Promise.allSettled([
      privateControl({ action: 'db-start' }),
      privateControl({ action: 'beta-active', active: true }),
      privateControl({ action: 'beta-role', role: 'viewer' }),
    ]);
    const closed = await Promise.allSettled([
      ...[a, b].flatMap((profile, index) => profile ? [stopPrivateProfile(profile.context, profile.pid).then(() => {
        rmSync(index === 0 ? profileA : profileB, { recursive: true, force: true });
      })] : []),
    ]);
    expect([...restored, ...closed].every(result => result.status === 'fulfilled'), 'owned runtime cleanup completed').toBe(true);
  }
  writeFileSync(evidenceFile, JSON.stringify({ status: 'passed', runId, evidence }, null, 2), { mode: 0o600 });
});


test('real Note preserves immediate close input and blocks quota exit until exact draft recovery', async () => {
  test.setTimeout(150_000);
  const artifactDir = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const profile = mkdtempSync(join(artifactDir, 'immediate-profile-'));
  const evidenceFile = join(artifactDir, 'input-evidence.json'), runId = crypto.randomUUID();
  writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete', runId }), { mode: 0o600 });
  let a: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let proof: Record<string, unknown> | undefined;
  try {
    a = await launchPrivateProfile(profile);
    let page = await a.context.newPage();
    await login(page, 'alpha-editor');
    await page.locator('[data-server-note-workspace] .nw-sidebar > button').filter({ hasText: /^새 노트$/ }).click();
    await edit(page, 'Immediate baseline');
    await save(page).click();
    await expect(page.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    const url = page.url(), documentId = new URL(url).searchParams.get('document')!;
    const before = await privateControl<Inspection>({ action: 'inspect', documentId });
    const independentTab = await a.context.newPage();
    await login(independentTab, 'alpha-editor', url);
    await input(independentTab, ' independent-tab-close-input');
    await independentTab.close();
    // Close the OS process immediately after the input action, without awaiting a storage poll or save.
    await input(page, ' last-input-before-browser-close');
    const oldPid = a.pid;
    await stopPrivateProfile(a.context, a.pid);
    a = await launchPrivateProfile(profile);
    expect(a.pid).not.toBe(oldPid);
    page = await a.context.newPage();
    await login(page, 'alpha-editor', url);
    const tabDraft = (await records(page)).find(record => record.status === 'draft' && record.snapshotText.includes('independent-tab-close-input'))!;
    expect(tabDraft).toBeDefined();
    const tabRecovery = await a.context.newPage();
    await login(tabRecovery, 'alpha-editor', url);
    await tabRecovery.getByRole('button', { name: new RegExp(`^초안 복구 .* ${tabDraft.draftId.slice(0, 8)}$`) }).click();
    await expect(editor(tabRecovery)).toContainText('independent-tab-close-input');
    await expect(editor(tabRecovery)).not.toContainText('last-input-before-browser-close');
    expect((await records(tabRecovery)).find(record => record.draftId === tabDraft.draftId)?.snapshotText).toBe(tabDraft.snapshotText);
    await tabRecovery.close();
    const durable = (await records(page)).find(record => record.status === 'draft' && record.snapshotText.includes('last-input-before-browser-close'))!;
    expect(durable).toBeDefined();
    expect(durable.draftId).not.toBe(tabDraft.draftId);
    await page.getByRole('button', { name: new RegExp(`^초안 복구 .* ${durable.draftId.slice(0, 8)}$`) }).click();
    await expect(editor(page)).toContainText('last-input-before-browser-close');
    expect((await privateControl<Inspection>({ action: 'inspect', documentId })).document).toEqual(before.document);
    await save(page).click();
    await expect(page.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    const confirmed = await privateControl<Inspection>({ action: 'inspect', documentId });
    expect(confirmed.document!.snapshotText).toBe(durable.snapshotText);
    expect(confirmed.document!.revision).toBe(before.document!.revision + 1);
    await page.evaluate(() => {
      const write = Storage.prototype.setItem;
      (window as typeof window & { restorePendingStorage?: () => void }).restorePendingStorage = () => { Storage.prototype.setItem = write; };
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith('wonffice.note.pending.v1:')) throw new DOMException('quota', 'QuotaExceededError');
        return write.call(this, key, value);
      };
    });
    await input(page, ' latest-quota-input');
    await expect(page.getByText(/입력은 이 화면에만 있으므로 화면을 나갈 수 없습니다/)).toBeVisible();
    await page.getByRole('button', { name: '자료함으로 돌아가기' }).click();
    await expect(editor(page)).toContainText('latest-quota-input');
    expect((await records(page)).some(record => record.snapshotText.includes('latest-quota-input'))).toBe(false);
    expect((await privateControl<Inspection>({ action: 'inspect', documentId })).document).toEqual(confirmed.document);
    await page.evaluate(() => { (window as typeof window & { restorePendingStorage?: () => void }).restorePendingStorage!(); });
    // Storage restoration alone is not confirmation. The existing Save action retries protection and the real write.
    await save(page).click();
    await expect(page.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    const protectedLatest = (await records(page)).find(record => record.status === 'confirmed' && record.snapshotText.includes('latest-quota-input'))!;
    expect(protectedLatest).toBeDefined();
    await page.getByRole('button', { name: '자료함으로 돌아가기' }).click();
    await expect(page.locator('[data-server-note-workspace]')).toHaveCount(0);
    await login(page, 'alpha-editor', url);
    await expect(editor(page)).toContainText('latest-quota-input');
    const final = await privateControl<Inspection>({ action: 'inspect', documentId });
    expect(final.document!.snapshotText).toBe(protectedLatest.snapshotText);
    expect(final.document!.revision).toBe(confirmed.document!.revision + 1);
    expect(final.receiptCount).toBe(before.receiptCount + 2);
    proof = { browserBefore: oldPid, browserAfter: a.pid, immediateSnapshotHash: hash(durable.snapshotText),
      quotaSnapshotHash: hash(protectedLatest.snapshotText), revision: final.document!.revision, databaseIdentity: final.databaseIdentity };
  } finally {
    if (a) await stopPrivateProfile(a.context, a.pid);
    rmSync(profile, { recursive: true, force: true });
  }
  writeFileSync(evidenceFile, JSON.stringify({ status: 'passed', runId, proof }, null, 2), { mode: 0o600 });
});
