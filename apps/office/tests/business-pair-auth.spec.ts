import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { INode } from '../../../packages/datastore/src/types';
import { createSampleDocument } from '../../../packages/office-word/src/sample-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';
import { privateControl, launchPrivateProfile, stopPrivateProfile, type Inspection, type RealStatus } from './helpers/real-recovery-control';

const origin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';
const requirementText = 'Fictional requirement: preserve customer-authored formatting and exact revision references.';
const decisionText = 'Fictional decision: retain full native evidence and use the existing editor history.';
const decisionAddition = ' Include a separate recovery check.';
const workspace = (page: Page) => page.locator('[data-server-word-workspace]');
const panel = (page: Page) => workspace(page).locator('.w-business-pair');
const save = (page: Page) => workspace(page).getByRole('button', { name: /^(저장|저장 확인·재시도)$/ });
const status = (page: Page) => workspace(page).locator('[data-save-status]');
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
type Alias = 'alpha-editor' | 'beta-viewer';
interface PairItem {
  id: string; kind: 'requirement' | 'decision'; currentVersion: number;
  locator: { kind: 'point-bookmark'; bookmarkId: string };
  versions: Array<{ version: number; snapshotText: string }>;
  derivedFrom?: { itemId: string; version: number };
}
interface Pair {
  schemaVersion: number; items: PairItem[];
  relations: Array<{ kind: string; source: { itemId: string; version: number }; target: { itemId: string; version: number } }>;
}

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.beforeAll(() => {
  if (!process.env.OFFICE_AUTH_REAL_FILE || !process.env.OFFICE_AUTH_CONTROL_FILE)
    throw new Error('Protected real OIDC fixture and disposable PostgreSQL supervisor are required.');
});

async function login(page: Page, alias: Alias, url = origin) {
  const authenticated = async () => await page.locator('.ow-project-home').isVisible() || await workspace(page).isVisible();
  await page.goto(url);
  await expect.poll(async () => await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible() ||
    await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await authenticated()).toBe(true);
  const enter = page.getByRole('button', { name: '일반 사용자로 들어가기' });
  if (await enter.isVisible()) {
    await enter.click();
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
  await expect.poll(async () => await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await authenticated()).toBe(true);
  if (!(await authenticated())) {
    await page.getByRole('button', { name: /Synthetic Alpha/ }).click();
    await page.getByRole('button', { name: 'Alpha workspace', exact: true }).click();
  }
  await expect.poll(authenticated).toBe(true);
}

function track(page: Page, checkpoint: () => void) {
  const state = { bearer: '', writes: [] as Array<{ method: string; path: string; body: Record<string, unknown> }>,
    timeline: [] as Array<Record<string, unknown>> };
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (request.headers().authorization) state.bearer = request.headers().authorization;
    if (!path.startsWith('/api/v1/')) return;
    const body = ['POST', 'PUT'].includes(request.method()) ? request.postDataJSON() as Record<string, unknown> | null : null;
    if (body && (/\/documents$/.test(path) || /\/snapshot$/.test(path))) state.writes.push({ method: request.method(), path, body });
    state.timeline.push({ kind: 'request', method: request.method(), path,
      ...(typeof body?.snapshotText === 'string' ? { snapshotHash: hash(body.snapshotText) } : {}) });
    checkpoint();
  });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/api/v1/')) state.timeline.push({ kind: 'response', path, status: response.status() });
    checkpoint();
  });
  page.on('pageerror', error => { state.timeline.push({ kind: 'pageerror', messageHash: hash(error.message) }); checkpoint(); });
  return state;
}

function nativeParagraph(document: INode, text: string): INode {
  const found: INode[] = [];
  const walk = (node: INode) => {
    if (node.stype === 'paragraph' && node.content?.some(child => typeof child !== 'string' && child.text === text)) found.push(node);
    node.content?.forEach(child => { if (typeof child !== 'string') walk(child); });
  };
  walk(document);
  expect(found).toHaveLength(1);
  return found[0];
}
async function exported(page: Page): Promise<INode> {
  const download = page.waitForEvent('download');
  await workspace(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Word 파일 내보내기', exact: true }).click();
  return JSON.parse(readFileSync((await (await download).path())!, 'utf8')).document as INode;
}
async function caret(page: Page, text: string, position: 'Home' | 'End' = 'Home') {
  const paragraph = workspace(page).locator('.w-paragraph').filter({ hasText: text }).first();
  await expect(paragraph).toBeVisible();
  await expect.poll(() => paragraph.evaluate(node => node.closest('[contenteditable]')?.getAttribute('contenteditable'))).toBe('true');
  await paragraph.scrollIntoViewIfNeeded();
  const bounds = await paragraph.boundingBox(); expect(bounds).not.toBeNull();
  await paragraph.click({ position: position === 'Home' ? { x: 8, y: Math.min(10, bounds!.height / 2) }
    : { x: Math.max(8, bounds!.width - 8), y: Math.max(4, bounds!.height - 8) } });
  await page.keyboard.press(position === 'Home' ? 'Meta+ArrowLeft' : 'Meta+ArrowRight');
}
async function inspect(documentId?: string) {
  return privateControl<Inspection<'word'>>({ action: 'inspect', product: 'word', ...(documentId ? { documentId } : {}) });
}
async function canonical(page: Page, root: string, bearer: string, documentId: string, expected: INode) {
  const db = await inspect(documentId);
  expect(db.document).not.toBeNull();
  const response = await page.request.get(`${root}/documents/${documentId}`, { headers: { Authorization: bearer } });
  expect(response.status()).toBe(200);
  const api = await response.json() as { snapshotText: string; document: { revision: number } };
  expect(api.snapshotText).toBe(db.document!.snapshotText);
  expect(api.document.revision).toBe(db.document!.revision);
  expect(hash(api.snapshotText)).toBe(db.document!.snapshotHash);
  expect(JSON.parse(api.snapshotText).document).toStrictEqual(expected);
  expect(db.document!.canonicalTree).toStrictEqual(expected);
  return db;
}
async function seedAndOpen(page: Page) {
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await page.getByRole('button', { name: 'Word 자료', exact: true }).click();
  await page.getByRole('button', { name: '새 Word 만들기', exact: true }).click();
  await expect(workspace(page)).toBeVisible({ timeout: 30_000 });
  const document = createSampleDocument();
  const surface = document.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'surface')!;
  const resources = document.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'resources')!;
  resources.content!.push({ stype: 'styleDef', attributes: { id: 'BusinessEvidence', name: 'Business evidence', type: 'paragraph', basedOn: 'Body', fontSize: 31 } });
  surface.content = [
    { stype: 'paragraph', attributes: { styleId: 'BusinessEvidence' }, content: [{ stype: 'inline-text', text: requirementText, marks: [{ stype: 'bold', range: [0, requirementText.length] }] }] },
    { stype: 'paragraph', attributes: { styleId: 'BusinessEvidence' }, content: [{ stype: 'inline-text', text: decisionText }] },
  ];
  document.content = document.content!.filter(node => typeof node !== 'string' && (node.stype === 'docMeta' || node === surface || node === resources));
  document.metadata = { originalOwner: 'fictional-business-pair', loadedAt: 'original-native-loadedAt', retained: { purpose: 'strict rich evidence' } };
  expect(document.metadata).not.toHaveProperty('wonfficeBusinessPair');
  const text = wordFileText(document, ''), name = randomUUID(), title = 'Fictional native business pair';
  await page.evaluate(({ name, title, text }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('barocss-word', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'name' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ name, title, text, count: 1, savedAt: 100 });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    };
  }), { name, title, text });
  await workspace(page).getByRole('button', { name: '이 기기의 로컬 문서 목록 확인' }).click();
  await workspace(page).getByRole('button', { name: `${title} · 새 서버 사본 준비`, exact: true }).click();
  const response = page.waitForResponse(response => response.request().method() === 'POST' && /\/documents$/.test(new URL(response.url()).pathname));
  await save(page).click();
  const created = await response; expect(created.status()).toBe(201);
  const raw = await created.json() as { document: { documentId: string }; snapshotText: string };
  expect(raw.snapshotText).toBe(text);
  await expect(status(page)).toHaveText('서버 저장 확인됨');
  expect(await exported(page)).toStrictEqual(document);
  return { documentId: raw.document.documentId, document };
}

// Root owns the shared private services. This spec executes only in its serial schedule.
test('authored native business pair retains exact evidence and identity across history, durable restart and authority changes', async () => {
  test.setTimeout(300_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const evidenceFile = join(directory, 'business-pair-real.json');
  const profileA = mkdtempSync(join(directory, 'business-pair-a-')), profileB = mkdtempSync(join(directory, 'business-pair-b-'));
  let a: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined, b: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let requests: ReturnType<typeof track> | undefined, phase = 'entry', passed = false;
  const evidence: Array<Record<string, unknown>> = [], cleanupSteps: Array<{ name: string; ok: boolean }> = [];
  const checkpoint = () => writeFileSync(evidenceFile, JSON.stringify({ status: passed ? 'checks-passed-cleanup-pending' : 'incomplete', phase,
    evidence, timeline: requests?.timeline ?? [], cleanupSteps }, null, 2), { mode: 0o600 });
  checkpoint();
  try {
    const initial = await privateControl<RealStatus>({ action: 'status' });
    const root = `${origin}/api/v1/tenants/${initial.tenantId}`;
    a = await launchPrivateProfile(profileA);
    const page = await a.context.newPage(); requests = track(page, checkpoint);
    await login(page, 'alpha-editor');
    const source = await seedAndOpen(page), documentUrl = page.url();
    phase = 'native-authoring'; checkpoint();
    await workspace(page).getByRole('menuitem', { name: '문서 패널', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: '요구·결정', exact: true }).click();
    await expect(panel(page)).toContainText('승인 여부는 미확인');
    await caret(page, requirementText);
    await panel(page).getByRole('button', { name: '요구사항 문단 지정', exact: true }).click();
    await expect(panel(page)).toContainText('요구사항 지정됨');
    await caret(page, decisionText);
    await panel(page).getByRole('button', { name: '결정 문단 지정', exact: true }).click();
    await expect(panel(page)).toContainText('결정 지정됨');
    const anchors = await exported(page);
    const expectedAnchors = structuredClone(source.document), bookmarkIds: string[] = [];
    for (const text of [requirementText, decisionText]) {
      const paragraph = nativeParagraph(anchors, text);
      const anchor = paragraph.content![0] as INode;
      expect(anchor.stype).toBe('bookmarkAnchor');
      expect(anchor.attributes?.id).toMatch(/^business_[0-9a-f-]{36}$/);
      bookmarkIds.push(anchor.attributes!.id as string);
      nativeParagraph(expectedAnchors, text).content!.unshift({ stype: 'bookmarkAnchor', attributes: { id: anchor.attributes!.id } });
    }
    expect(bookmarkIds[0]).not.toBe(bookmarkIds[1]);
    expect(anchors).toStrictEqual(expectedAnchors);
    await panel(page).getByRole('button', { name: '항목과 관계 작성', exact: true }).click();
    await expect(panel(page)).toContainText('supported_by');
    const authored = await exported(page), pair = authored.metadata!.wonfficeBusinessPair as Pair;
    expect(pair.schemaVersion).toBe(1); expect(pair.items).toHaveLength(2);
    pair.items.forEach(item => expect(item.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
    expect(pair.items[0].id).not.toBe(pair.items[1].id);
    const pinV1 = pair.items[0].versions[0].snapshotText;
    // Export and native reconciliation order JSON properties differently. Verify
    // every authored key/value, then freeze the independently checked pin bytes.
    expect(JSON.parse(pinV1)).toStrictEqual(JSON.parse(wordFileText(expectedAnchors, '')));
    expect(pair.items[1].versions[0].snapshotText).toBe(pinV1);
    const expectedPair: Pair = { schemaVersion: 1, items: (['requirement', 'decision'] as const).map((kind, index) => ({
      id: pair.items[index].id, kind, currentVersion: 1, locator: { kind: 'point-bookmark', bookmarkId: bookmarkIds[index] },
      versions: [{ version: 1, snapshotText: pinV1 }],
    })), relations: [{ kind: 'supported_by', source: { itemId: pair.items[0].id, version: 1 }, target: { itemId: pair.items[1].id, version: 1 } }] };
    const expectedAuthored = { ...expectedAnchors, metadata: { ...expectedAnchors.metadata, wonfficeBusinessPair: expectedPair } };
    expect(authored).toStrictEqual(expectedAuthored);
    await caret(page, decisionText, 'End');
    await page.keyboard.press('Meta+z');
    expect(await exported(page)).toStrictEqual(expectedAnchors);
    await caret(page, decisionText, 'End'); await page.keyboard.press('Meta+Shift+z');
    expect(await exported(page)).toStrictEqual(expectedAuthored);
    await caret(page, decisionText, 'End'); await page.keyboard.insertText(decisionAddition);
    writeFileSync(join(directory, 'native-after-ordinary-edit.json'), JSON.stringify(await exported(page), null, 2), { mode: 0o600 });
    await expect(workspace(page).locator('.w-paragraph').filter({ hasText: decisionText }).first()).toHaveText(decisionText + decisionAddition);
    const expectedEdited = structuredClone(expectedAuthored);
    const changedRun = nativeParagraph(expectedEdited, decisionText).content!.find(node => typeof node !== 'string' && node.stype === 'inline-text') as INode;
    changedRun.text = decisionText + decisionAddition;
    // Existing native text insertion explicitly writes the adjusted mark list.
    changedRun.marks = [];
    expect(await exported(page)).toStrictEqual(expectedEdited);
    await caret(page, decisionText + decisionAddition, 'End'); await page.keyboard.press('Meta+z');
    expect(await exported(page)).toStrictEqual(expectedAuthored);
    await caret(page, decisionText, 'End'); await page.keyboard.press('Meta+Shift+z');
    expect(await exported(page)).toStrictEqual(expectedEdited);
    await panel(page).getByRole('button', { name: '현재 결정 내용을 새 버전으로 보관', exact: true }).click();
    await expect(panel(page)).toContainText('결정 · v2');
    await expect(panel(page)).toContainText('다시 검토해야 합니다');
    await page.screenshot({ path: join(directory, 'authored-pair-v2.png'), animations: 'disabled' });
    const pinV2Document: INode = structuredClone(expectedEdited); delete pinV2Document.metadata!.wonfficeBusinessPair;
    const expectedV2 = structuredClone(expectedEdited);
    const nextPair = expectedV2.metadata!.wonfficeBusinessPair as Pair;
    nextPair.items[1].currentVersion = 2;
    const actualV2 = await exported(page);
    const pinV2 = (actualV2.metadata!.wonfficeBusinessPair as Pair).items[1].versions[1].snapshotText;
    expect(JSON.parse(pinV2)).toStrictEqual(JSON.parse(wordFileText(pinV2Document, '')));
    nextPair.items[1].versions.push({ version: 2, snapshotText: pinV2 });
    expect(await exported(page)).toStrictEqual(expectedV2);
    await caret(page, decisionText + decisionAddition, 'End'); await page.keyboard.press('Meta+z');
    expect(await exported(page)).toStrictEqual(expectedEdited);
    await caret(page, decisionText + decisionAddition, 'End'); await page.keyboard.press('Meta+Shift+z');
    expect(await exported(page)).toStrictEqual(expectedV2);
    await panel(page).getByRole('button', { name: '보관된 v1 내용', exact: true }).last().click();
    await expect(panel(page)).toContainText('보관된 내용 · 텍스트 보기');
    await panel(page).getByText('전체 원본과 서식 데이터', { exact: true }).click();
    expect(await panel(page).locator('pre').textContent()).toBe(pinV1);
    await page.screenshot({ path: join(directory, 'historic-rich-pin.png'), animations: 'disabled' });
    await panel(page).getByRole('button', { name: '보관 내용 닫기', exact: true }).click();
    phase = 'canonical-save'; checkpoint();
    await save(page).click(); await expect(status(page)).toHaveText('서버 저장 확인됨');
    const committed = await canonical(page, root, requests.bearer, source.documentId, expectedV2);
    await page.reload(); await expect(workspace(page)).toBeVisible({ timeout: 30_000 });
    await expect(status(page)).toHaveText('서버 저장 확인됨');
    expect(await exported(page)).toStrictEqual(expectedV2);
    phase = 'database-restart'; checkpoint();
    const stopped = await privateControl<RealStatus>({ action: 'db-stop' }); expect(stopped.databaseRunning).toBe(false);
    const restarted = await privateControl<RealStatus>({ action: 'db-start' });
    expect(restarted.databaseIdentity).toBe(initial.databaseIdentity);
    expect(restarted.databaseGeneration).toBe(initial.databaseGeneration);
    expect(restarted.postgresPid).not.toBe(initial.postgresPid);
    await page.reload(); await expect(status(page)).toHaveText('서버 저장 확인됨');
    const afterRestart = await canonical(page, root, requests.bearer, source.documentId, expectedV2);
    expect(afterRestart.document).toStrictEqual(committed.document);
    expect(await exported(page)).toStrictEqual(expectedV2);
    phase = 'independent-server-copy'; checkpoint();
    const copyText = wordFileText(expectedV2, '');
    const copyIds: string[][] = [];
    for (const kind of ['file', 'local'] as const) {
      await page.goto(documentUrl); await expect(status(page)).toHaveText('서버 저장 확인됨');
      await workspace(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
      await page.getByRole('menuitem', { name: '열기…', exact: true }).click();
      await expect(workspace(page).getByRole('region', { name: '문서 작업', exact: true })).toBeVisible();
      if (kind === 'file') {
        await workspace(page).getByLabel('Word 원본 파일로 새 서버 사본 준비').setInputFiles({
          name: 'fictional-pair.word.json', mimeType: 'application/json', buffer: Buffer.from(copyText),
        });
      } else {
        await page.evaluate(({ text }) => new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('barocss-word', 1);
          open.onupgradeneeded = () => open.result.createObjectStore('documents', { keyPath: 'name' });
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result, tx = db.transaction('documents', 'readwrite');
            tx.objectStore('documents').put({ name: 'fictional-pair-copy', title: 'Fictional pair copy', text, count: 1, savedAt: 100 });
            tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
          };
        }), { text: copyText });
        await workspace(page).getByRole('button', { name: '이 기기의 로컬 문서 목록 확인' }).click();
        await workspace(page).getByRole('button', { name: 'Fictional pair copy · 새 서버 사본 준비', exact: true }).click();
      }
      await expect(save(page)).toBeEnabled();
      const response = page.waitForResponse(response => response.request().method() === 'POST' && /\/documents$/.test(new URL(response.url()).pathname));
      await save(page).click(); const created = await response; expect(created.status()).toBe(201);
      const raw = await created.json() as { document: { documentId: string }; snapshotText: string };
      expect(raw.document.documentId).not.toBe(source.documentId);
      const copied = JSON.parse(raw.snapshotText).document as INode;
      const derived = copied.metadata!.wonfficeBusinessPair as Pair;
      const expectedCopy = structuredClone(expectedV2), expectedCopyPair = expectedCopy.metadata!.wonfficeBusinessPair as Pair;
      const ids = derived.items.map(item => item.id); expect(ids[0]).not.toBe(ids[1]);
      expectedCopyPair.items.forEach((item, index) => {
        expect(ids[index]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        expect(ids[index]).not.toBe(item.id); copyIds.forEach(previous => expect(previous).not.toContain(ids[index]));
        item.derivedFrom = { itemId: item.id, version: item.currentVersion }; item.id = ids[index];
      });
      expectedCopyPair.relations[0].source.itemId = ids[0]; expectedCopyPair.relations[0].target.itemId = ids[1];
      expect(copied).toStrictEqual(expectedCopy); copyIds.push(ids);
      await expect(status(page)).toHaveText('서버 저장 확인됨');
      await canonical(page, root, requests.bearer, raw.document.documentId, expectedCopy);
      expect((await inspect(source.documentId)).document).toStrictEqual(committed.document);
      await page.reload(); await expect(status(page)).toHaveText('서버 저장 확인됨');
      expect(await exported(page)).toStrictEqual(expectedCopy);
    }
    await page.goto(documentUrl); await expect(status(page)).toHaveText('서버 저장 확인됨');
    phase = 'independent-authority'; checkpoint();
    b = await launchPrivateProfile(profileB); expect(b.pid).not.toBe(a.pid);
    const other = await b.context.newPage(), otherRequests = track(other, checkpoint);
    await login(other, 'beta-viewer', documentUrl);
    await expect(workspace(other)).toBeVisible({ timeout: 30_000 });
    await expect(save(other)).toHaveCount(0);
    await expect(workspace(other).locator('[contenteditable=true]')).toHaveCount(0);
    await workspace(other).getByRole('menuitem', { name: '문서 패널', exact: true }).click();
    await other.getByRole('menuitemcheckbox', { name: '요구·결정', exact: true }).click();
    await expect(panel(other).getByRole('button', { name: '현재 결정 내용을 새 버전으로 보관', exact: true })).toBeDisabled();
    expect(await exported(other)).toStrictEqual(expectedV2);
    const deny = async (token: string, tenantId: string, key: string, expectedStatus: number) => {
      const response = await other.request.put(`${origin}/api/v1/tenants/${tenantId}/documents/${source.documentId}/snapshot`, {
        headers: { Authorization: token }, data: { expectedRevision: committed.document!.revision, snapshotText: committed.document!.snapshotText, idempotencyKey: key },
      });
      expect(response.status()).toBe(expectedStatus);
      expect((await inspect(source.documentId)).document).toStrictEqual(committed.document);
    };
    await deny(otherRequests.bearer, initial.tenantId, 'business-pair-viewer-denied', 403);
    await deny(requests.bearer, initial.betaTenantId, 'business-pair-cross-tenant-denied', 403);
    // Bind the denial to the currently authenticated writer and the actual authored pair.
    const identities = JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8')) as {
      issuer: string; users: Record<Alias, { id: string }>;
    };
    for (const [browserPage, bearer, alias] of [[page, requests.bearer, 'alpha-editor'], [other, otherRequests.bearer, 'beta-viewer']] as const) {
      const response = await browserPage.request.get(`${origin}/api/v1/me`, { headers: { Authorization: bearer } });
      expect(response.status()).toBe(200);
      const identity = await response.json() as { issuer: string; subject: string };
      expect(identity.issuer === identities.issuer && identity.subject === identities.users[alias].id,
        'The denial uses the current requested principal.').toBe(true);
    }
    const beforeDeniedRead = await inspect(source.documentId);
    const deniedRead = await page.request.get(`${origin}/api/v1/tenants/${initial.betaTenantId}/documents/${source.documentId}`,
      { headers: { Authorization: requests.bearer } });
    expect(deniedRead.status()).toBe(403);
    const privateMarkers = [requirementText, decisionText, 'wonfficeBusinessPair', ...pair.items.map(item => item.id)];
    const deniedBody = await deniedRead.text();
    expect(privateMarkers.some(marker => deniedBody.includes(marker)), 'Denied API response exposes no authored or pinned pair content.').toBe(false);
    expect(await inspect(source.documentId)).toStrictEqual(beforeDeniedRead);
    const crossTenantURL = new URL(origin);
    crossTenantURL.search = new URLSearchParams({ tenant: initial.betaTenantId, workspace: initial.betaWorkspaceId,
      document: source.documentId, product: 'word' }).toString();
    await page.goto(crossTenantURL.href);
    await expect(page.getByRole('heading', { name: '접근 권한이 없습니다', exact: true })).toBeVisible();
    await expect(workspace(page)).toHaveCount(0);
    await expect(page.locator('.w-business-pair')).toHaveCount(0);
    expect(await page.evaluate(markers => markers.some(marker => document.body.textContent?.includes(marker)), privateMarkers),
      'Denied direct UI exposes no authored or pinned pair content.').toBe(false);
    expect(await inspect(source.documentId)).toStrictEqual(beforeDeniedRead);
    evidence.push({ kind: 'authored-word-cross-tenant-read-denial', apiStatus: deniedRead.status(),
      currentPrincipalsVerified: true, apiContentAbsent: true, uiContentAbsent: true,
      canonicalTreeRevisionReceiptUnchanged: true });

    await privateControl({ action: 'beta-active', active: false });
    const revoked = await other.request.get(`${root}/documents/${source.documentId}`, { headers: { Authorization: otherRequests.bearer } });
    expect(revoked.status()).toBe(403);
    await deny(otherRequests.bearer, initial.tenantId, 'business-pair-revoked-denied', 403);
    await other.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(workspace(other)).not.toBeVisible();
    evidence.push({ kind: 'native-authored-pair', documentId: source.documentId, sourceHash: hash(wordFileText(source.document, '')),
      finalHash: committed.document!.snapshotHash, revision: committed.document!.revision, itemIds: pair.items.map(item => item.id),
      originalReference: nextPair.relations[0], databaseIdentity: restarted.databaseIdentity, independentBrowserPids: [a.pid, b.pid] });
    passed = true; checkpoint();
  } catch (error) {
    evidence.push({ kind: 'failure', phase, errorName: error instanceof Error ? error.name : 'unknown',
      messageHash: hash(error instanceof Error ? error.message : String(error)) }); checkpoint();
    throw error;
  } finally {
    const clean = async (name: string, action: () => Promise<unknown>) => {
      try { await action(); cleanupSteps.push({ name, ok: true }); }
      catch { cleanupSteps.push({ name, ok: false }); }
      checkpoint();
    };
    await clean('database-running', () => privateControl({ action: 'db-start' }));
    await clean('viewer-active', () => privateControl({ action: 'beta-active', active: true }));
    await clean('viewer-role', () => privateControl({ action: 'beta-role', role: 'viewer' }));
    if (a) await clean('profile-a-stopped', () => stopPrivateProfile(a!.context, a!.pid));
    if (b) await clean('profile-b-stopped', () => stopPrivateProfile(b!.context, b!.pid));
    const cleanup = cleanupSteps.every(step => step.ok);
    if (cleanup) [profileA, profileB].forEach(path => rmSync(path, { recursive: true, force: true }));
    writeFileSync(evidenceFile, JSON.stringify({ status: passed && cleanup ? 'passed' : 'incomplete', phase,
      evidence, timeline: requests?.timeline ?? [], cleanupSteps, cleanup,
      uncovered: ['independent native copy/new-ID restore is not covered by this spec; a separate root-owned desktop case is required', 'physical OS Korean IME'] }, null, 2), { mode: 0o600 });
    expect(cleanup).toBe(true);
  }
});
