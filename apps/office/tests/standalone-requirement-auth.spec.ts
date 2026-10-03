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
  lifecycle?: 'unlinked' | 'linked'; schemaVersion: number; items: PairItem[];
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
  await workspace(page).getByRole('button', { name: 'Word 파일 내보내기', exact: true }).click();
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
  await page.getByRole('button', { name: '자료함', exact: true }).click();
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
test('authors a standalone rich requirement before an explicit decision link and retains pins across real save recovery, copies, restart and authority changes', async () => {
  test.setTimeout(300_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const evidenceFile = join(directory, 'standalone-requirement-real.json');
  const profileA = mkdtempSync(join(directory, 'standalone-requirement-a-')), profileB = mkdtempSync(join(directory, 'standalone-requirement-b-'));
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
    phase = 'standalone-native-authoring'; checkpoint();
    await page.getByRole('button', { name: '요구·결정', exact: true }).click();
    await caret(page, requirementText);
    await panel(page).getByRole('button', { name: '요구사항 문단 지정', exact: true }).click();
    await expect(panel(page)).toContainText('요구사항 지정됨');
    await panel(page).getByRole('button', { name: '요구사항 기록', exact: true }).click();
    await expect(panel(page)).toContainText('요구사항');
    const authored = await exported(page), pair = authored.metadata!.wonfficeBusinessPair as Pair;
    expect(pair.schemaVersion).toBe(2); expect(pair.lifecycle).toBe('unlinked');
    expect(pair.items).toHaveLength(1); expect(pair.relations).toStrictEqual([]);
    const requirement = pair.items[0];
    expect(requirement.kind).toBe('requirement');
    expect(requirement.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const expectedAnchors = structuredClone(source.document);
    const requirementAnchor = nativeParagraph(authored, requirementText).content![0] as INode;
    expect(requirementAnchor.stype).toBe('bookmarkAnchor');
    expect(requirementAnchor.attributes?.id).toMatch(/^business_[0-9a-f-]{36}$/);
    nativeParagraph(expectedAnchors, requirementText).content!.unshift({ stype: 'bookmarkAnchor', attributes: { id: requirementAnchor.attributes!.id } });
    const pinV1 = requirement.versions[0].snapshotText;
    expect(JSON.parse(pinV1)).toStrictEqual(JSON.parse(wordFileText(expectedAnchors, '')));
    const expectedRequirement: PairItem = { id: requirement.id, kind: 'requirement', currentVersion: 1,
      locator: { kind: 'point-bookmark', bookmarkId: String(requirementAnchor.attributes!.id) },
      versions: [{ version: 1, snapshotText: pinV1 }] };
    const expectedStandalone: INode = { ...expectedAnchors, metadata: { ...expectedAnchors.metadata,
      wonfficeBusinessPair: { schemaVersion: 2, lifecycle: 'unlinked', items: [expectedRequirement], relations: [] } } };
    expect(authored).toStrictEqual(expectedStandalone);
    expect(requests.timeline.filter(event => typeof event.path === 'string' && /\/(?:works|work-requests|models|inference|confirmations|verifications)(?:\/|$)/.test(event.path))).toHaveLength(0);
    await caret(page, requirementText); await page.keyboard.press('Meta+z');
    expect(await exported(page)).toStrictEqual(expectedAnchors);
    await caret(page, requirementText); await page.keyboard.press('Meta+Shift+z');
    expect(await exported(page)).toStrictEqual(expectedStandalone);
    await save(page).click(); await expect(status(page)).toHaveText('서버 저장 확인됨');
    const standaloneCommitted = await canonical(page, root, requests.bearer, source.documentId, expectedStandalone);
    await page.reload(); await expect(status(page)).toHaveText('서버 저장 확인됨');
    expect(await exported(page)).toStrictEqual(expectedStandalone);

    phase = 'standalone-independent-copy'; checkpoint();
    await workspace(page).getByLabel('Word 원본 파일로 새 서버 사본 준비').setInputFiles({
      name: 'fictional-standalone.word.json', mimeType: 'application/json', buffer: Buffer.from(wordFileText(expectedStandalone, '')),
    });
    const copyResponse = page.waitForResponse(response => response.request().method() === 'POST' && /\/documents$/.test(new URL(response.url()).pathname));
    await save(page).click(); const copyCreated = await copyResponse; expect(copyCreated.status()).toBe(201);
    const copyRaw = await copyCreated.json() as { document: { documentId: string }; snapshotText: string };
    expect(copyRaw.document.documentId).not.toBe(source.documentId);
    const copiedStandalone = JSON.parse(copyRaw.snapshotText).document as INode;
    const derivedRequirement = (copiedStandalone.metadata!.wonfficeBusinessPair as Pair).items[0];
    expect(derivedRequirement.id).not.toBe(expectedRequirement.id);
    expect(derivedRequirement.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const expectedStandaloneCopy = structuredClone(expectedStandalone);
    const copiedItem = (expectedStandaloneCopy.metadata!.wonfficeBusinessPair as Pair).items[0];
    copiedItem.derivedFrom = { itemId: copiedItem.id, version: 1 }; copiedItem.id = derivedRequirement.id;
    expect(copiedStandalone).toStrictEqual(expectedStandaloneCopy);
    await expect(status(page)).toHaveText('서버 저장 확인됨');
    await canonical(page, root, requests.bearer, copyRaw.document.documentId, expectedStandaloneCopy);
    expect((await inspect(source.documentId)).document).toStrictEqual(standaloneCommitted.document);
    await page.goto(documentUrl); await expect(status(page)).toHaveText('서버 저장 확인됨');
    await page.getByRole('button', { name: '요구·결정', exact: true }).click();

    phase = 'later-explicit-decision-link'; checkpoint();
    await caret(page, decisionText);
    await panel(page).getByRole('button', { name: '연결할 결정 문단 지정', exact: true }).click();
    await expect(panel(page).getByRole('button', { name: '결정 연결', exact: true })).toBeDisabled();
    await panel(page).getByLabel('연결할 요구사항 버전', { exact: true }).selectOption('1');
    const beforeLink = await exported(page), expectedBeforeLink = structuredClone(expectedStandalone);
    const decisionAnchor = nativeParagraph(beforeLink, decisionText).content![0] as INode;
    expect(decisionAnchor.stype).toBe('bookmarkAnchor');
    expect(decisionAnchor.attributes?.id).not.toBe(requirementAnchor.attributes!.id);
    nativeParagraph(expectedBeforeLink, decisionText).content!.unshift({ stype: 'bookmarkAnchor', attributes: { id: decisionAnchor.attributes!.id } });
    expect(beforeLink).toStrictEqual(expectedBeforeLink);
    await panel(page).getByRole('button', { name: '결정 연결', exact: true }).click();
    await expect(panel(page)).toContainText('supported_by');
    const linked = await exported(page), linkedPair = linked.metadata!.wonfficeBusinessPair as Pair;
    const decision = linkedPair.items.find(item => item.kind === 'decision')!;
    const cleanDecisionPin = structuredClone(expectedBeforeLink); delete cleanDecisionPin.metadata!.wonfficeBusinessPair;
    expect(JSON.parse(decision.versions[0].snapshotText)).toStrictEqual(JSON.parse(wordFileText(cleanDecisionPin, '')));
    const expectedV2: INode = { ...expectedBeforeLink, metadata: { ...expectedBeforeLink.metadata,
      wonfficeBusinessPair: { schemaVersion: 2, lifecycle: 'linked', items: [expectedRequirement, {
        id: decision.id, kind: 'decision', currentVersion: 1,
        locator: { kind: 'point-bookmark', bookmarkId: String(decisionAnchor.attributes!.id) },
        versions: [{ version: 1, snapshotText: decision.versions[0].snapshotText }],
      }], relations: [{ kind: 'supported_by', source: { itemId: expectedRequirement.id, version: 1 }, target: { itemId: decision.id, version: 1 } }] } } };
    expect(linked).toStrictEqual(expectedV2); expect(linkedPair.items[0]).toStrictEqual(expectedRequirement);
    for (let repeat = 0; repeat < 2; repeat++) {
      await caret(page, decisionText); await page.keyboard.press('Meta+z');
      expect(await exported(page)).toStrictEqual(expectedBeforeLink);
      await caret(page, decisionText); await page.keyboard.press('Meta+Shift+z');
      expect(await exported(page)).toStrictEqual(expectedV2);
    }
    const nextPair = expectedV2.metadata!.wonfficeBusinessPair as Pair;
    await page.screenshot({ path: join(directory, 'standalone-explicit-linked.png'), animations: 'disabled' });
    phase = 'lost-save-ack'; checkpoint();
    let dropped = false;
    await page.route('**/api/v1/**/snapshot', async route => {
      if (route.request().method() !== 'PUT' || dropped) { await route.continue(); return; }
      dropped = true;
      const response = await route.fetch(); expect(response.status()).toBe(200);
      await route.abort('connectionfailed');
    });
    const writesBefore = requests.writes.length;
    await save(page).click();
    await expect(save(page)).toHaveText('저장 확인·재시도');
    const frozen = requests.writes.slice(writesBefore).find(write => write.method === 'PUT');
    expect(frozen).toBeDefined();
    await save(page).click(); await expect(status(page)).toHaveText('서버 저장 확인됨');
    const retried = requests.writes.slice(writesBefore).filter(write => write.method === 'PUT');
    // A receipt GET is also permitted. If PUT is retried it must preserve the complete frozen envelope.
    retried.forEach(write => expect(write).toStrictEqual(frozen));
    await page.unroute('**/api/v1/**/snapshot');
    expect((await inspect(source.documentId)).document!.revision).toBe(standaloneCommitted.document!.revision + 1);
    phase = 'canonical-save'; checkpoint();
    await expect(status(page)).toHaveText('서버 저장 확인됨');
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
    await other.getByRole('button', { name: '요구·결정', exact: true }).click();
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
    await privateControl({ action: 'beta-active', active: false });
    const revoked = await other.request.get(`${root}/documents/${source.documentId}`, { headers: { Authorization: otherRequests.bearer } });
    expect(revoked.status()).toBe(403);
    await deny(otherRequests.bearer, initial.tenantId, 'business-pair-revoked-denied', 403);
    await other.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(workspace(other)).not.toBeVisible();
    evidence.push({ kind: 'native-authored-standalone-and-explicit-link', documentId: source.documentId, sourceHash: hash(wordFileText(source.document, '')),
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
      uncovered: ['physical OS Korean IME', 'same-document account/role ABA during pending native write requires root-owned focused lifetime checks'] }, null, 2), { mode: 0o600 });
    expect(cleanup).toBe(true);
  }
});
