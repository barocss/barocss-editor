import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { INode } from '../../../packages/datastore/src/types';
import type { VerificationBasis, VerificationReceipt, VerificationRequest } from '../../word/src/criterion-verification-client';
import { createStarterDocument } from '../../../packages/office-word/src/starter-document';
import { createSampleDocument } from '../../../packages/office-word/src/sample-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';
import { openLocalLibrary } from './helpers/local-library';
import { nativeEditor } from './helpers/native-editor';
import { privateControl, launchPrivateProfile, stopPrivateProfile, type Inspection, type RealStatus } from './helpers/real-recovery-control';

const origin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';
const localOrigin = process.env.OFFICE_CRITERION_LOCAL_ORIGIN;
const sourceRoot = process.env.CRITERION_VERIFICATION_WORKSPACE_ROOT;
const requirementText = 'Fictional requirement: preserve customer-authored formatting and exact revision references.';
const decisionText = 'Fictional decision: retain full native evidence and use the existing editor history.';
const decisionAddition = ' Include a separate recovery check.';
const confirmation = (page: Page) => workspace(page).getByLabel('정확한 요구사항 버전 확인', { exact: true });
const refreshConfirmation = (page: Page) => confirmation(page).getByRole('button', { name: '서버 확인 기록 읽기', exact: true });
const confirmCriterion = (page: Page) => confirmation(page).getByRole('button', { name: '이 요구사항 버전을 직접 확인', exact: true });
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
  if (localOrigin !== 'http://127.0.0.1:5186' || !sourceRoot)
    throw new Error('The same-source local Office on port 5186 and its source root are required for actual backup/restore.');
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
    { stype: 'paragraph', attributes: { styleId: 'BusinessEvidence' }, content: [{ stype: 'inline-text', text: requirementText, marks: [{ stype: 'bold', range: [0, 10] }, { stype: 'italic', range: [12, 21] }] }] },
    { stype: 'paragraph', attributes: { styleId: 'BusinessEvidence' }, content: [{ stype: 'inline-text', text: decisionText }] },
  ];
  document.content = document.content!.filter(node => typeof node !== 'string' && (node.stype === 'docMeta' || node === surface || node === resources));
  document.metadata = { originalOwner: 'fictional-business-pair', loadedAt: 'original-native-loadedAt', retained: { purpose: 'strict rich evidence' }, approved: true, actorIdentityId: 'forged-native-actor', confirmedAt: '1900-01-01T00:00:00Z' };
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
  await openServerActions(page);
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

interface CriterionContext {
  schemaVersion: 1;
  requirement: { itemId: string; version: number; locator: PairItem['locator']; snapshotText: string };
  decision: { itemId: string; version: number; currentVersion: number; locator: PairItem['locator']; snapshotText: string; currentSnapshotText: string };
  relation: Pair['relations'][number];
}
interface Capture {
  schemaVersion: 1; documentRevision: number; snapshotHash: string; snapshotText: string;
  context: CriterionContext; authorityEpoch: string; actorIdentityId: string;
}
interface ConfirmationReceipt {
  schemaVersion: 1; confirmationId: string; tenantId: string; documentId: string; actorIdentityId: string;
  confirmedAt: string; documentRevision: number; snapshotHash: string; context: CriterionContext;
  idempotencyKey: string; requestHash: string; verification: 'not-run'; scope: 'writer-self-confirmation';
}


async function ensureBusinessPanel(page: Page) {
  if (!await panel(page).isVisible()) {
    await workspace(page).getByRole('menuitem', { name: '문서 패널', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: '요구·결정', exact: true }).click();
  }
  await expect(panel(page)).toBeVisible();
}
async function openServerActions(page: Page) {
  // An unsaved server entry exposes import controls before the native App/menu exists.
  if (await workspace(page).getByRole('button', { name: '이 기기의 로컬 문서 목록 확인', exact: true }).isVisible()) return;
  const actions = workspace(page).getByRole('region', { name: '문서 작업', exact: true });
  if (!await actions.isVisible()) {
    await workspace(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
    await page.getByRole('menuitem', { name: '열기…', exact: true }).click();
  }
  await expect(actions).toBeVisible();
}
interface LocalSnapshot { row: { name: string; title?: string; revision?: number }; text: string }
async function localSnapshots(page: Page): Promise<LocalSnapshot[]> {
  return page.evaluate(async root => {
    const { productStore } = await import(`/@fs${root}/packages/office-workspace/src/index.ts`);
    return productStore('word').snapshots();
  }, sourceRoot!) as Promise<LocalSnapshot[]>;
}
async function importLocalFile(page: Page, name: string, text: string) {
  await page.getByRole('button', { name: '백업 및 가져오기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '백업 및 가져오기', exact: true });
  await dialog.getByLabel('백업 또는 제품 JSON 파일', { exact: true }).setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
  await dialog.getByRole('button', { name: '새 사본으로 복원', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
async function downloadLocalBackup(page: Page): Promise<string> {
  await page.getByRole('button', { name: '백업 및 가져오기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '백업 및 가져오기', exact: true });
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '전체 자료 백업', exact: true }).click();
  const text = readFileSync((await (await download).path())!, 'utf8');
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  return text;
}
function derivedNative(original: INode, copied: INode, title: string): INode {
  const expected = structuredClone(original), sourcePair = original.metadata!.wonfficeBusinessPair as Pair;
  const expectedPair = expected.metadata!.wonfficeBusinessPair as Pair, actualPair = copied.metadata!.wonfficeBusinessPair as Pair;
  expect(actualPair.items).toHaveLength(2);
  const ids = actualPair.items.map(item => item.id);
  expect(ids[0]).not.toBe(ids[1]);
  expectedPair.items.forEach((item, index) => {
    expect(ids[index]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    sourcePair.items.forEach(source => expect(ids[index]).not.toBe(source.id));
    item.derivedFrom = { itemId: item.id, version: item.currentVersion }; item.id = ids[index];
  });
  expectedPair.relations[0].source.itemId = ids[0]; expectedPair.relations[0].target.itemId = ids[1];
  let titles = 0;
  const rename = (node: INode) => {
    if (node.stype === 'docTitle') { node.content = [{ stype: 'inline-text', text: title }]; titles++; }
    node.content?.forEach(child => { if (typeof child !== 'string') rename(child); });
  };
  rename(expected); expect(titles).toBe(1); expect(copied).toStrictEqual(expected);
  return expected;
}

async function installDigestGate(page: Page) {
  await page.evaluate(() => {
      const host = window as typeof window & { __criterionGate?: { entered: boolean; release: () => void; restore: () => void } };
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      let release!: () => void;
      const wait = new Promise<void>(resolve => { release = resolve; });
      const gate = { entered: false, release, restore: () => { crypto.subtle.digest = digest; delete host.__criterionGate; } };
      host.__criterionGate = gate;
      crypto.subtle.digest = async (algorithm, data) => {
        // Controlled browser scheduling only; the real digest still executes.
        // No product hook, fake authority or network response is supplied.
        if (new TextDecoder().decode(data).startsWith('["criterion-verification-v1"')) { gate.entered = true; await wait; }
        return digest(algorithm, data);
      };
  });
}
async function releaseDigestGate(page: Page, restore = false) {
  return page.evaluate(restore => {
    const gate = (window as typeof window & { __criterionGate?: { release: () => void; restore: () => void } }).__criterionGate;
    gate?.release(); if (restore) gate?.restore(); return !!gate;
  }, restore);
}
async function enteredDigestGate(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __criterionGate?: { entered: boolean } }).__criterionGate?.entered === true)).toBe(true);
}

const verification = (page: Page) => workspace(page).getByLabel('확인된 가상 기준의 실제 실행', { exact: true });
const refreshRuns = (page: Page) => verification(page).getByRole('button', { name: '실행 문맥과 기록 읽기', exact: true });
const runButton = (page: Page) => verification(page).getByRole('button', { name: /^(표본 실행|새 표본 실행|같은 실행 재시도)$/ });
const addition = ' Fictional active-button contrast: minimum 4.5:1.';
test('author, confirm and really execute an exact fictional criterion through authenticated Word', async () => {
  test.setTimeout(360_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!), evidenceFile = join(directory, 'criterion-verification-real.json');
  const profileA = mkdtempSync(join(directory, 'verification-a-')), profileB = mkdtempSync(join(directory, 'verification-b-'));
  let a: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined, b: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let requests: ReturnType<typeof track> | undefined, phase = 'entry', passed = false;
  const evidence: Array<Record<string, unknown>> = [], cleanupSteps: Array<{ name: string; ok: boolean }> = [];
  const checkpoint = () => writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete', phase, evidence, timeline: requests?.timeline ?? [], cleanupSteps }, null, 2), { mode: 0o600 });
  checkpoint();
  try {
    const initial = await privateControl<RealStatus>({ action: 'status' });
    const root = `${origin}/api/v1/tenants/${initial.tenantId}`;
    a = await launchPrivateProfile(profileA); const page = await a.context.newPage(); requests = track(page, checkpoint);
    await login(page, 'alpha-editor');
    const source = await seedAndOpen(page), documentUrl = page.url();
    const endpoint = `${root}/documents/${source.documentId}/criterion-confirmations`;
    const runsEndpoint = `${root}/documents/${source.documentId}/criterion-verifications`;
    const headers = () => ({ Authorization: requests!.bearer });
    const records = async (url = endpoint): Promise<ConfirmationReceipt[]> => {
      const response = await page.request.get(url, { headers: headers() }); expect(response.status()).toBe(200);
      return (await response.json() as { confirmations: ConfirmationReceipt[] }).confirmations;
    };
    const capture = async (): Promise<Capture> => {
      const response = await page.request.get(`${endpoint}/context`, { headers: headers() }); expect(response.status()).toBe(200); return await response.json() as Capture;
    };
    const runs = async (url = runsEndpoint, bearer = requests!.bearer): Promise<VerificationReceipt[]> => {
      const response = await page.request.get(url, { headers: { Authorization: bearer } }); expect(response.status()).toBe(200);
      return (await response.json() as { runs: VerificationReceipt[] }).runs;
    };
    const executionBasis = async (): Promise<VerificationBasis> => {
      const response = await page.request.get(`${runsEndpoint}/context`, { headers: headers() }); expect(response.status()).toBe(200); return await response.json() as VerificationBasis;
    };
    phase = 'native-ui-authoring'; checkpoint();
    await ensureBusinessPanel(page);
    await caret(page, requirementText); await panel(page).getByRole('button', { name: '요구사항 문단 지정', exact: true }).click();
    await expect(panel(page)).toContainText('요구사항 지정됨');
    await caret(page, decisionText); await panel(page).getByRole('button', { name: '결정 문단 지정', exact: true }).click();
    await expect(panel(page)).toContainText('결정 지정됨');
    const anchors = await exported(page), expectedAnchors = structuredClone(source.document), bookmarkIds: string[] = [];
    for (const text of [requirementText, decisionText]) {
      const anchor = nativeParagraph(anchors, text).content![0] as INode;
      expect(anchor.stype).toBe('bookmarkAnchor'); expect(anchor.attributes?.id).toMatch(/^business_[0-9a-f-]{36}$/);
      bookmarkIds.push(anchor.attributes!.id as string);
      nativeParagraph(expectedAnchors, text).content!.unshift({ stype: 'bookmarkAnchor', attributes: { id: anchor.attributes!.id } });
    }
    expect(bookmarkIds[0]).not.toBe(bookmarkIds[1]); expect(anchors).toStrictEqual(expectedAnchors);
    await panel(page).getByRole('button', { name: '항목과 관계 작성', exact: true }).click(); await expect(panel(page)).toContainText('supported_by');
    const authored = await exported(page), pair = authored.metadata!.wonfficeBusinessPair as Pair;
    expect(pair.items).toHaveLength(2); pair.items.forEach(item => expect(item.id).toMatch(/^[0-9a-f-]{36}$/));
    const pin = pair.items[0].versions[0].snapshotText;
    expect(JSON.parse(pin)).toStrictEqual(JSON.parse(wordFileText(expectedAnchors, '')));
    const expectedPair: Pair = { schemaVersion: 1, items: (['requirement', 'decision'] as const).map((kind, index) => ({ id: pair.items[index].id,
      kind, currentVersion: 1, locator: { kind: 'point-bookmark', bookmarkId: bookmarkIds[index] }, versions: [{ version: 1, snapshotText: pin }] })),
      relations: [{ kind: 'supported_by', source: { itemId: pair.items[0].id, version: 1 }, target: { itemId: pair.items[1].id, version: 1 } }] };
    const expectedAuthored = { ...expectedAnchors, metadata: { ...expectedAnchors.metadata, wonfficeBusinessPair: expectedPair } };
    expect(authored).toStrictEqual(expectedAuthored);
    await save(page).click(); await expect(status(page)).toHaveText('서버 저장 확인됨');
    const committed = await canonical(page, root, requests.bearer, source.documentId, expectedAuthored);
    expect(await records()).toEqual([]);
    const basis = await capture(); expect(basis.snapshotText).toBe(committed.document!.snapshotText);
    expect(basis.snapshotHash).toBe(committed.document!.snapshotHash); expect(basis.documentRevision).toBe(committed.document!.revision);
    expect(basis.context).toStrictEqual({ schemaVersion: 1,
      requirement: { itemId: pair.items[0].id, version: 1, locator: expectedPair.items[0].locator, snapshotText: pin },
      decision: { itemId: pair.items[1].id, version: 1, currentVersion: 1, locator: expectedPair.items[1].locator, snapshotText: pin, currentSnapshotText: pin },
      relation: expectedPair.relations[0] });
    expect(basis.actorIdentityId).not.toBe('forged-native-actor');
    await ensureBusinessPanel(page); await refreshConfirmation(page).click(); await expect(confirmCriterion(page)).toBeEnabled();
    await expect(confirmation(page)).toContainText(/미실행|실행하지 않음|not.run/i);
    await expect(confirmation(page)).toContainText(requirementText);
    await expect(confirmation(page)).toContainText(decisionText);
    phase = 'qualitative-not-executable'; checkpoint();
    let releaseRead!: () => void, readEntered = false;
    const readGate = new Promise<void>(resolve => { releaseRead = resolve; });
    await page.route('**/criterion-verifications/context', async route => {
      if (readEntered) { await route.continue(); return; }
      readEntered = true; const result = await route.fetch(); await readGate; await route.fulfill({ response: result });
    });
    const beforeReadPosts = requests.timeline.filter(event => event.kind === 'request' && event.method === 'POST' && String(event.path).endsWith('/criterion-verifications')).length;
    await refreshRuns(page).click(); await expect.poll(() => readEntered).toBe(true);
    await expect(verification(page).getByRole('status')).toHaveText('실행 문맥과 기록을 읽는 중입니다.');
    expect(requests.timeline.filter(event => event.kind === 'request' && event.method === 'POST' && String(event.path).endsWith('/criterion-verifications'))).toHaveLength(beforeReadPosts);
    releaseRead();
    await expect(verification(page)).toContainText('실행 불가'); await page.unroute('**/criterion-verifications/context'); await expect(runButton(page)).toBeDisabled();
    expect(await runs()).toEqual([]);
    phase = 'author-new-requirement-version'; checkpoint();
    await caret(page, requirementText, 'End'); await page.keyboard.insertText(addition);
    const expectedEdited = structuredClone(expectedAuthored);
    const writtenRun = nativeParagraph(expectedEdited, requirementText).content!.find(node => typeof node !== 'string' && node.stype === 'inline-text') as INode;
    writtenRun.text = requirementText + addition;
    expect(await exported(page)).toStrictEqual(expectedEdited);
    await panel(page).getByRole('button', { name: '현재 요구사항 내용을 새 버전으로 보관', exact: true }).click();
    const actualV2 = await exported(page), expectedV2 = structuredClone(expectedEdited), nextPair = expectedV2.metadata!.wonfficeBusinessPair as Pair;
    const newPin = (actualV2.metadata!.wonfficeBusinessPair as Pair).items[0].versions[1].snapshotText;
    const withoutPair: INode = structuredClone(expectedEdited); delete withoutPair.metadata!.wonfficeBusinessPair;
    expect(JSON.parse(newPin)).toStrictEqual(JSON.parse(wordFileText(withoutPair, '')));
    nextPair.items[0].currentVersion = 2; nextPair.items[0].versions.push({ version: 2, snapshotText: newPin }); nextPair.relations[0].source.version = 2;
    expect(actualV2).toStrictEqual(expectedV2); expect(nextPair.items[0].versions[0]).toStrictEqual(expectedPair.items[0].versions[0]);
    expect(nextPair.items[1]).toStrictEqual(expectedPair.items[1]); expect(nextPair.relations[0].target).toStrictEqual(expectedPair.relations[0].target);
    await caret(page, requirementText + addition, 'End'); await page.keyboard.press('Meta+z'); expect(await exported(page)).toStrictEqual(expectedEdited);
    await caret(page, requirementText + addition, 'End'); await page.keyboard.press('Meta+Shift+z'); expect(await exported(page)).toStrictEqual(expectedV2);
    await save(page).click(); await expect(status(page)).toHaveText('서버 저장 확인됨');
    const savedV2 = await canonical(page, root, requests.bearer, source.documentId, expectedV2);
    await ensureBusinessPanel(page); await refreshConfirmation(page).click(); await expect(confirmCriterion(page)).toBeEnabled(); await confirmCriterion(page).click();
    await expect(confirmCriterion(page)).toBeDisabled(); const confirmations = await records(); expect(confirmations).toHaveLength(1);
    const captured = await executionBasis(); expect(captured.confirmationId).toBe(confirmations[0].confirmationId);
    expect(captured.context.requirement.version).toBe(2); expect(captured.context.decision.version).toBe(1); expect(captured.executable.status).toBe('executable');
    await refreshRuns(page).click(); await expect(runButton(page)).toBeEnabled(); await expect(verification(page).getByRole('status')).toHaveText('검증 · 실행하지 않음');
    phase = 'selection-aba-no-post'; checkpoint();
    const postCount = () => requests!.timeline.filter(event => event.kind === 'request' && event.method === 'POST' && String(event.path).endsWith('/criterion-verifications')).length;
    await caret(page, requirementText + addition); const beforePosts = postCount(); await installDigestGate(page);
    try {
      await runButton(page).click(); await enteredDigestGate(page); await expect(verification(page).getByRole('status')).toHaveText('실행 중 · 결과는 아직 미확인입니다.'); await caret(page, decisionText); await caret(page, requirementText + addition); await releaseDigestGate(page);
      await expect(runButton(page)).toBeEnabled(); expect(postCount()).toBe(beforePosts); expect(await runs()).toEqual([]); expect(await exported(page)).toStrictEqual(expectedV2);
    } finally { await releaseDigestGate(page, true); }
    phase = 'root-retirement-no-post'; checkpoint();
    await refreshRuns(page).click(); await caret(page, requirementText + addition); await installDigestGate(page);
    try {
      await runButton(page).click(); await enteredDigestGate(page); await openServerActions(page); await workspace(page).getByRole('button', { name: '새 Word', exact: true }).click();
      await expect.poll(async () => await exported(page)).toStrictEqual(JSON.parse(wordFileText(createStarterDocument(), '')).document);
      await releaseDigestGate(page); expect(postCount()).toBe(beforePosts); expect(await runs()).toEqual([]);
    } finally { await releaseDigestGate(page, true); }
    page.once('dialog', dialog => { void dialog.accept(); }); await page.goto(documentUrl); await expect(status(page)).toHaveText('서버 저장 확인됨');
    await ensureBusinessPanel(page); await refreshRuns(page).click(); await expect(runButton(page)).toBeEnabled();
    phase = 'account-retirement-no-post'; checkpoint();
    await caret(page, requirementText + addition); await installDigestGate(page);
    try {
      await runButton(page).click(); await enteredDigestGate(page); await page.getByRole('button', { name: '로그아웃', exact: true }).click();
      await expect(workspace(page)).not.toBeVisible({ timeout: 30_000 }); await expect(page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true })).toBeVisible({ timeout: 30_000 });
      await releaseDigestGate(page); expect(postCount()).toBe(beforePosts); expect((await inspect(source.documentId)).document).toStrictEqual(savedV2.document);
    } finally { await releaseDigestGate(page, true); }
    await login(page, 'alpha-editor', documentUrl); await expect(status(page)).toHaveText('서버 저장 확인됨'); await ensureBusinessPanel(page); await refreshRuns(page).click(); await expect(runButton(page)).toBeEnabled();
    phase = 'real-execution-lost-ack'; checkpoint();
    let lostBody: VerificationRequest | undefined, lostReceipt: VerificationReceipt | undefined, lost = false;
    await page.route('**/criterion-verifications', async route => {
      if (route.request().method() !== 'POST' || lost) { await route.continue(); return; }
      lost = true; lostBody = route.request().postDataJSON() as VerificationRequest;
      const response = await route.fetch(); expect([200, 201]).toContain(response.status()); lostReceipt = await response.json() as VerificationReceipt; await route.abort('failed');
    });
    await runButton(page).click(); await expect.poll(() => !!lostReceipt).toBe(true);
    await expect(runButton(page)).toHaveText('같은 실행 재시도'); expect(await runs()).toStrictEqual([lostReceipt]);
    const retry = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/criterion-verifications'));
    await runButton(page).click(); const response = await retry; expect([200, 201]).toContain(response.status()); expect(response.request().postDataJSON()).toStrictEqual(lostBody);
    expect(await response.json()).toStrictEqual(lostReceipt); await page.unroute('**/criterion-verifications');
    await expect(verification(page).getByRole('status')).toHaveText('실행 결과 · 통과');
    const terminal: VerificationReceipt[] = [lostReceipt!];
    const assertOutput = (receipt: VerificationReceipt) => {
      expect(hash(receipt.outputText)).toBe(receipt.outputHash); const output = JSON.parse(receipt.outputText);
      expect(output.context).toStrictEqual(receipt.context); expect(output.confirmationId).toBe(receipt.confirmationId); expect(output.executionId).toBe(receipt.runId);
      expect(output.requesterIdentityId).toBe(captured.actorIdentityId); expect(output.request.snapshotText).toBe(savedV2.document!.snapshotText);
      expect(output.specimen.sourceHash).toBe(hash(receipt.specimen.sourceText)); expect(output.evaluator).toStrictEqual(captured.evaluator);
      if (receipt.outcome !== 'error') { expect(output.executor.id).toBe('local-playwright-chromium'); expect(output.executor.browserVersion).toBeTruthy(); expect(output.rendered.tagName).toBe('BUTTON'); }
      return output;
    };
    expect(assertOutput(lostReceipt!).evaluation.ratio).toBe(21);
    phase = 'fresh-lost-ack-survives-reopen'; checkpoint();
    let freshBody: VerificationRequest | undefined, freshReceipt: VerificationReceipt | undefined;
    await page.route('**/criterion-verifications', async route => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      freshBody = route.request().postDataJSON() as VerificationRequest;
      const raw = await route.fetch(); expect([200, 201]).toContain(raw.status()); freshReceipt = await raw.json() as VerificationReceipt;
      await route.abort('failed');
    });
    await runButton(page).click(); await expect.poll(() => !!freshReceipt).toBe(true);
    await expect(verification(page).getByRole('status')).toHaveText('검증 · 실행 결과 미확인');
    expect(freshBody!.idempotencyKey).not.toBe(lostBody!.idempotencyKey); terminal.push(freshReceipt!);
    await verification(page).getByLabel('등록된 검증 표본', { exact: true }).selectOption('low');
    await verification(page).getByLabel('등록된 검증 표본', { exact: true }).selectOption('dark');
    await expect(verification(page).getByRole('status')).toHaveText('검증 · 실행 결과 미확인'); await expect(runButton(page)).toHaveText('같은 실행 재시도');
    await page.unroute('**/criterion-verifications');
    await page.reload(); await expect(status(page)).toHaveText('서버 저장 확인됨'); await ensureBusinessPanel(page); await refreshRuns(page).click();
    await expect(verification(page).getByRole('status')).toHaveText('검증 · 실행 결과 미확인'); await expect(runButton(page)).toHaveText('같은 실행 재시도');
    const freshRetry = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/criterion-verifications'));
    await runButton(page).click(); const replayFresh = await freshRetry; expect(replayFresh.request().postDataJSON()).toStrictEqual(freshBody);
    expect(await replayFresh.json()).toStrictEqual(freshReceipt); expect(await runs()).toStrictEqual(terminal);
    await expect(verification(page).getByRole('status')).toHaveText('실행 결과 · 통과');

    phase = 'executed-original-local-backup-new-id-restore'; checkpoint();
    // Reuse the actual #428 UI backup/restore path with this genuinely confirmed
    // and executed source. Cross-origin transport preserves downloaded bytes.
    const trustedDownload = page.waitForEvent('download');
    await workspace(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Word 파일 내보내기', exact: true }).click();
    const trustedFile = readFileSync((await (await trustedDownload).path())!, 'utf8');
    expect(JSON.parse(trustedFile).document).toStrictEqual(expectedV2);
    expect(await runs()).toStrictEqual(terminal); expect(await records()).toStrictEqual(confirmations);
    const local = await a.context.newPage();
    try {
      await local.goto(localOrigin!); await openLocalLibrary(local);
      expect(await localSnapshots(local)).toEqual([]);
      await importLocalFile(local, 'confirmed-executed-original.word.json', trustedFile);
      await expect(local.locator('[data-document]')).toHaveCount(1);
      const imported = (await localSnapshots(local))[0]; expect(imported.row.title).toBe('Barocss Word (복원)');
      const expectedImported = derivedNative(expectedV2, JSON.parse(imported.text).document, 'Barocss Word (복원)');
      const archive = await downloadLocalBackup(local);
      const backup = JSON.parse(archive) as { documents: Array<{ product: string; row: { name: string }; text: string }> };
      expect(backup.documents).toHaveLength(1); expect(backup.documents[0].product).toBe('word');
      expect(backup.documents[0].row.name).toBe(imported.row.name); expect(backup.documents[0].text).toBe(imported.text);
      writeFileSync(join(directory, 'executed-source-local-backup.json'), archive, { mode: 0o600 });
      await importLocalFile(local, 'executed-source-backup.json', archive);
      await expect(local.locator('[data-document]')).toHaveCount(2);
      const copies = await localSnapshots(local);
      expect(copies.find(row => row.row.name === imported.row.name)).toStrictEqual(imported);
      const restored = copies.find(row => row.row.name !== imported.row.name)!;
      expect(restored.row.title).toBe('Barocss Word (복원) (복원)');
      const expectedRestored = derivedNative(expectedImported, JSON.parse(restored.text).document, 'Barocss Word (복원) (복원)');
      const originalIds = (expectedV2.metadata!.wonfficeBusinessPair as Pair).items.map(item => item.id);
      for (const item of (expectedRestored.metadata!.wonfficeBusinessPair as Pair).items) expect(originalIds).not.toContain(item.id);
      await local.getByRole('button', { name: 'Word Barocss Word (복원) (복원)', exact: true }).click();
      await expect(nativeEditor(local).locator('.w-paragraph').filter({ hasText: requirementText + addition })).toBeVisible({ timeout: 30_000 });
      await nativeEditor(local).getByRole('menuitem', { name: '문서 패널', exact: true }).click();
      await nativeEditor(local).getByRole('menuitemcheckbox', { name: '요구·결정', exact: true }).click();
      const localConfirmation = nativeEditor(local).getByLabel('정확한 요구사항 버전 확인', { exact: true });
      const localVerification = nativeEditor(local).getByLabel('확인된 가상 기준의 실제 실행', { exact: true });
      await expect(localConfirmation).toContainText('로그인한 서버 문서의 작성자가 직접 확인해야 합니다.');
      await expect(localVerification).toContainText('로그인한 서버 문서의 현재 작성자만 실행 기록을 조회할 수 있습니다.');
      await expect(localVerification.getByRole('status')).toHaveText('검증 · 실행 기록 미확인');
      for (const receipt of terminal) {
        await expect(localVerification).not.toContainText(receipt.runId); await expect(localVerification).not.toContainText(receipt.outputHash);
      }
      await expect(localConfirmation).not.toContainText(confirmations[0].confirmationId);
      await local.screenshot({ path: join(directory, 'local-restored-no-confirmation-or-execution.png'), animations: 'disabled' });
      await local.getByRole('button', { name: '파일 자료함', exact: true }).click(); await openLocalLibrary(local);
      const secondArchive = await downloadLocalBackup(local), secondBackup = JSON.parse(secondArchive) as typeof backup;
      const transported = secondBackup.documents.find(entry => entry.row.name === restored.row.name)!;
      expect(transported.text).toBe(restored.text);
      writeFileSync(join(directory, 'actual-restored-executed-source-backup.json'), secondArchive, { mode: 0o600 });
      await openServerActions(page);
      await workspace(page).getByLabel('Word 원본 파일로 새 서버 사본 준비').setInputFiles({ name: 'restored-executed-new-id.word.json', mimeType: 'application/json', buffer: Buffer.from(transported.text) });
      const response = page.waitForResponse(response => response.request().method() === 'POST' && /\/documents$/.test(new URL(response.url()).pathname));
      await save(page).click(); const created = await response; expect(created.status()).toBe(201);
      const raw = await created.json() as { document: { documentId: string }; snapshotText: string };
      expect(raw.document.documentId).not.toBe(source.documentId);
      const expectedServer = derivedNative(expectedRestored, JSON.parse(raw.snapshotText).document, 'Barocss Word (복원) (복원)');
      const importedIds = (expectedImported.metadata!.wonfficeBusinessPair as Pair).items.map(item => item.id);
      for (const item of (expectedServer.metadata!.wonfficeBusinessPair as Pair).items) {
        expect(originalIds).not.toContain(item.id); expect(importedIds).not.toContain(item.id);
      }
      await expect(status(page)).toHaveText('서버 저장 확인됨'); await canonical(page, root, requests.bearer, raw.document.documentId, expectedServer);
      const copyConfirmationEndpoint = `${root}/documents/${raw.document.documentId}/criterion-confirmations`;
      const copyRunsEndpoint = `${root}/documents/${raw.document.documentId}/criterion-verifications`;
      for (const reopen of [false, true]) {
        if (reopen) { await page.reload(); await expect(status(page)).toHaveText('서버 저장 확인됨'); }
        expect(await records(copyConfirmationEndpoint)).toEqual([]); expect(await runs(copyRunsEndpoint)).toEqual([]);
        expect(await exported(page)).toStrictEqual(expectedServer);
        await ensureBusinessPanel(page); await refreshConfirmation(page).click();
        await expect(confirmation(page).getByRole('status')).toHaveText('현재 버전의 서버 확인 기록은 미확인입니다.');
        await expect(confirmCriterion(page)).toBeEnabled(); await refreshRuns(page).click();
        await expect(verification(page).getByRole('status')).toHaveText('검증 · 실행하지 않음'); await expect(runButton(page)).toBeDisabled();
        await expect(verification(page).locator('.w-criterion-run')).toHaveCount(0);
        await expect(confirmation(page)).not.toContainText(confirmations[0].confirmationId);
        for (const receipt of terminal) {
          const lookup = await page.request.get(`${copyRunsEndpoint}/${receipt.runId}`, { headers: headers() }); expect(lookup.status()).toBe(404);
          const denialBody = await lookup.text(); expect(denialBody).not.toContain(receipt.outputHash); expect(denialBody).not.toContain(receipt.outputText);
          await expect(verification(page)).not.toContainText(receipt.runId); await expect(verification(page)).not.toContainText(receipt.outputHash);
        }
        expect(await records()).toStrictEqual(confirmations); expect(await runs()).toStrictEqual(terminal);
        expect((await inspect(source.documentId)).document).toStrictEqual(savedV2.document);
      }
      await page.screenshot({ path: join(directory, 'server-restored-no-confirmation-or-execution.png'), animations: 'disabled' });
      evidence.push({ kind: 'trusted-executed-original-actual-local-backup-new-id-restore', originalDocumentId: source.documentId,
        originalConfirmationId: confirmations[0].confirmationId, originalRunIds: terminal.map(receipt => receipt.runId),
        originalOutputHashes: terminal.map(receipt => receipt.outputHash), importedLocalId: imported.row.name, restoredLocalId: restored.row.name,
        restoredServerDocumentId: raw.document.documentId, archiveHash: hash(archive), secondArchiveHash: hash(secondArchive),
        currentConfirmationAndRunListsEmpty: true, currentUnconfirmedAndNotRunUI: true, privateOriginalRunLookup404NoOutput: true,
        originalNativeConfirmationAndOutputsUnchanged: true, controlledTransport: 'unchanged native file extracted from actual downloaded local backup between two application origins' });
    } finally { await local.close(); }
    await page.goto(documentUrl); await expect(status(page)).toHaveText('서버 저장 확인됨');
    expect(await exported(page)).toStrictEqual(expectedV2); expect(await records()).toStrictEqual(confirmations); expect(await runs()).toStrictEqual(terminal);
    await ensureBusinessPanel(page); await refreshRuns(page).click(); await expect(verification(page).getByRole('status')).toHaveText('실행 결과 · 통과');

    phase = 'actual-failed-unsupported-and-error'; checkpoint();
    for (const [id, outcome, label] of [['low', 'failed', '실패'], ['transparent', 'unsupported', '지원 불가']] as const) {
      await verification(page).getByLabel('등록된 검증 표본', { exact: true }).selectOption(id);
      const done = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/criterion-verifications'));
      await runButton(page).click(); const raw = await done; expect([200, 201]).toContain(raw.status()); const receipt = await raw.json() as VerificationReceipt;
      expect(receipt.outcome).toBe(outcome); const output = assertOutput(receipt);
      if (id === 'low') { expect(output.rendered.color).toBe('rgb(119, 119, 119)'); expect(output.evaluation.ratio).toBeLessThan(4.5); }
      else { expect(output.rendered.color).toBe('rgba(255, 255, 255, 0.5)'); expect(output.evaluation).not.toHaveProperty('ratio'); }
      terminal.push(receipt); await expect(verification(page).getByRole('status')).toHaveText(`실행 결과 · ${label}`);
    }
    const unavailable = await privateControl<RealStatus>({ action: 'criterion-executor-mode', mode: 'unavailable' }); expect(unavailable.apiPid).not.toBe(initial.apiPid);
    await verification(page).getByLabel('등록된 검증 표본', { exact: true }).selectOption('dark');
    const errorResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/criterion-verifications'));
    await runButton(page).click(); const rawError = await errorResponse; expect([200, 201]).toContain(rawError.status()); const errorReceipt = await rawError.json() as VerificationReceipt;
    expect(errorReceipt.outcome).toBe('error'); const errorOutput = assertOutput(errorReceipt); expect(errorOutput.executor).toBeNull(); expect(errorOutput.rendered).toBeNull(); expect(errorOutput.error).toBe('executor_unavailable');
    terminal.push(errorReceipt); await expect(verification(page).getByRole('status')).toHaveText('실행 결과 · 실행 오류');
    await privateControl({ action: 'criterion-executor-mode', mode: 'live' });
    expect(await runs()).toStrictEqual(terminal); expect(await exported(page)).toStrictEqual(expectedV2); expect(await records()).toStrictEqual(confirmations);
    await page.screenshot({ path: join(directory, 'criterion-real-error-and-history.png'), animations: 'disabled' });
    phase = 'duplicates-conflicts-forgery'; checkpoint();
    const duplicate = await Promise.all([page.request.post(runsEndpoint, { headers: headers(), data: lostBody }), page.request.post(runsEndpoint, { headers: headers(), data: lostBody })]);
    for (const one of duplicate) { expect([200, 201]).toContain(one.status()); expect(await one.json()).toStrictEqual(lostReceipt); }
    const keyConflict = await page.request.post(runsEndpoint, { headers: headers(), data: { ...lostBody, specimen: captured.specimens.find(one => one.id === 'low') } }); expect(keyConflict.status()).toBe(409);
    for (const forgery of [{ passed: true }, { requesterIdentityId: 'forged' }, { startedAt: '1900-01-01T00:00:00Z' }, { outputText: 'uploaded-pass' }]) {
      expect((await page.request.post(runsEndpoint, { headers: headers(), data: { ...lostBody, idempotencyKey: randomUUID(), ...forgery } })).status()).toBe(400);
    }
    for (const change of [{ confirmationId: randomUUID() }, { specimen: { ...lostBody!.specimen, version: 2 } }, { evaluator: { ...lostBody!.evaluator, version: 2 } }, { context: { ...lostBody!.context, requirement: { ...lostBody!.context.requirement, version: 3 } } }]) {
      expect([409, 422]).toContain((await page.request.post(runsEndpoint, { headers: headers(), data: { ...lostBody, idempotencyKey: randomUUID(), ...change } })).status());
    }
    expect(await runs()).toStrictEqual(terminal);
    phase = 'full-native-input-history'; checkpoint();
    await caret(page, decisionText, 'End'); await page.keyboard.insertText(decisionAddition);
    const ordinaryEdit = structuredClone(expectedV2), ordinaryRun = nativeParagraph(ordinaryEdit, decisionText).content!.find(node => typeof node !== 'string' && node.stype === 'inline-text') as INode;
    ordinaryRun.text = decisionText + decisionAddition; expect(await exported(page)).toStrictEqual(ordinaryEdit);
    await caret(page, decisionText + decisionAddition, 'End'); await page.keyboard.press('Meta+z'); expect(await exported(page)).toStrictEqual(expectedV2);
    await caret(page, decisionText, 'End'); await page.keyboard.press('Meta+Shift+z'); expect(await exported(page)).toStrictEqual(ordinaryEdit);
    await caret(page, decisionText + decisionAddition, 'End'); await page.keyboard.press('Meta+z'); expect(await exported(page)).toStrictEqual(expectedV2);
    phase = 'actual-api-db-restart-and-reopen'; checkpoint();
    const prior = await privateControl<RealStatus>({ action: 'status' });
    await privateControl({ action: 'api-stop' }); await privateControl({ action: 'db-stop' });
    const dbRestart = await privateControl<RealStatus>({ action: 'db-start' }); expect(dbRestart.databaseIdentity).toBe(initial.databaseIdentity); expect(dbRestart.postgresPid).not.toBe(initial.postgresPid);
    const apiRestart = await privateControl<RealStatus>({ action: 'api-start' }); expect(apiRestart.apiPid).not.toBe(prior.apiPid);
    await page.reload(); await expect(status(page)).toHaveText('서버 저장 확인됨'); await ensureBusinessPanel(page);
    await expect(verification(page).getByRole('status')).toHaveText('검증 · 실행 기록 미확인');
    await refreshRuns(page).click(); await expect(verification(page).getByRole('status')).toHaveText('실행 결과 · 실행 오류');
    expect(await runs()).toStrictEqual(terminal); expect((await canonical(page, root, requests.bearer, source.documentId, expectedV2)).document).toStrictEqual(savedV2.document);
    evidence.push({ kind: 'actual-process-restart', oldApiPid: prior.apiPid, newApiPid: apiRestart.apiPid, oldPostgresPid: initial.postgresPid, newPostgresPid: dbRestart.postgresPid, databaseIdentity: dbRestart.databaseIdentity });
    phase = 'changed-version-historical'; checkpoint();
    await caret(page, decisionText, 'End'); await page.keyboard.insertText(decisionAddition); await panel(page).getByRole('button', { name: '현재 결정 내용을 새 버전으로 보관', exact: true }).click();
    const actualDecisionV2 = await exported(page), expectedDecisionV2 = structuredClone(ordinaryEdit), decisionPair = expectedDecisionV2.metadata!.wonfficeBusinessPair as Pair;
    const decisionPin = (actualDecisionV2.metadata!.wonfficeBusinessPair as Pair).items[1].versions[1].snapshotText;
    const decisionClean: INode = structuredClone(ordinaryEdit); delete decisionClean.metadata!.wonfficeBusinessPair;
    expect(JSON.parse(decisionPin)).toStrictEqual(JSON.parse(wordFileText(decisionClean, '')));
    decisionPair.items[1].currentVersion = 2; decisionPair.items[1].versions.push({ version: 2, snapshotText: decisionPin }); expect(actualDecisionV2).toStrictEqual(expectedDecisionV2);
    await save(page).click(); await expect(status(page)).toHaveText('서버 저장 확인됨'); await refreshRuns(page).click();
    await expect(verification(page).getByRole('status')).toHaveText('검증 · 실행하지 않음'); await expect(runButton(page)).toBeDisabled(); await expect(verification(page)).toContainText('이전 문맥');
    expect((await executionBasis()).confirmationId).toBeNull(); expect(await runs()).toStrictEqual(terminal);
    const stale = await page.request.post(runsEndpoint, { headers: headers(), data: { ...lostBody, idempotencyKey: randomUUID() } }); expect(stale.status()).toBe(409);
    phase = 'new-requirement-v3-keeps-old-results-historical'; checkpoint();
    const requirementExtra = ' Retain full original evidence.';
    await caret(page, requirementText + addition, 'End'); await page.keyboard.insertText(requirementExtra);
    const expectedV3 = structuredClone(expectedDecisionV2);
    const reqRun = nativeParagraph(expectedV3, requirementText + addition).content!.find(node => typeof node !== 'string' && node.stype === 'inline-text') as INode;
    reqRun.text = requirementText + addition + requirementExtra;
    expect(await exported(page)).toStrictEqual(expectedV3);
    await panel(page).getByRole('button', { name: '현재 요구사항 내용을 새 버전으로 보관', exact: true }).click();
    const actualV3 = await exported(page), v3Pair = expectedV3.metadata!.wonfficeBusinessPair as Pair;
    const v3Pin = (actualV3.metadata!.wonfficeBusinessPair as Pair).items[0].versions[2].snapshotText;
    const v3Clean: INode = structuredClone(expectedV3); delete v3Clean.metadata!.wonfficeBusinessPair;
    expect(JSON.parse(v3Pin)).toStrictEqual(JSON.parse(wordFileText(v3Clean, '')));
    v3Pair.items[0].currentVersion = 3; v3Pair.items[0].versions.push({ version: 3, snapshotText: v3Pin }); v3Pair.relations[0].source.version = 3;
    expect(actualV3).toStrictEqual(expectedV3); expect(v3Pair.items[0].versions.slice(0, 2)).toStrictEqual(nextPair.items[0].versions);
    await save(page).click(); await expect(status(page)).toHaveText('서버 저장 확인됨'); await refreshRuns(page).click();
    await expect(verification(page).getByRole('status')).toHaveText('검증 · 실행하지 않음'); await expect(runButton(page)).toBeDisabled(); await expect(verification(page)).toContainText('이전 문맥');
    expect((await executionBasis()).confirmationId).toBeNull(); expect(await runs()).toStrictEqual(terminal);
    expect((await page.request.post(runsEndpoint, { headers: headers(), data: { ...freshBody, idempotencyKey: randomUUID() } })).status()).toBe(409);
    let finalSource = await canonical(page, root, requests.bearer, source.documentId, expectedV3);
    phase = 'ambiguous-source-no-retargeting'; checkpoint();
    const ambiguous = structuredClone(expectedV3), ambiguousSurface = ambiguous.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'surface')!;
    ambiguousSurface.content!.push(structuredClone(nativeParagraph(ambiguous, requirementText + addition + requirementExtra)));
    const ambiguousText = wordFileText(ambiguous, '');
    const ambiguousResponse = await page.request.put(`${root}/documents/${source.documentId}/snapshot`, { headers: headers(), data: { expectedRevision: finalSource.document!.revision, snapshotText: ambiguousText, idempotencyKey: randomUUID() } }); expect(ambiguousResponse.status()).toBe(200);
    const ambiguousStored = await canonical(page, root, requests.bearer, source.documentId, ambiguous);
    expect([400, 409, 422]).toContain((await page.request.get(`${runsEndpoint}/context`, { headers: headers() })).status());
    expect((await page.request.post(runsEndpoint, { headers: headers(), data: { ...freshBody, idempotencyKey: randomUUID() } })).status()).toBe(409);
    expect(await runs()).toStrictEqual(terminal); expect((await inspect(source.documentId)).document).toStrictEqual(ambiguousStored.document);
    const restored = await page.request.put(`${root}/documents/${source.documentId}/snapshot`, { headers: headers(), data: { expectedRevision: ambiguousStored.document!.revision, snapshotText: finalSource.document!.snapshotText, idempotencyKey: randomUUID() } }); expect(restored.status()).toBe(200);
    finalSource = await canonical(page, root, requests.bearer, source.documentId, expectedV3);
    await page.reload(); await expect(status(page)).toHaveText('서버 저장 확인됨'); expect(await exported(page)).toStrictEqual(expectedV3);

    phase = 'independent-copy-no-inheritance'; checkpoint();
    await openServerActions(page);
    await workspace(page).getByLabel('Word 원본 파일로 새 서버 사본 준비').setInputFiles({ name: 'criterion-copy.word.json', mimeType: 'application/json', buffer: Buffer.from(finalSource.document!.snapshotText) });
    const copyResponse = page.waitForResponse(response => response.request().method() === 'POST' && /\/documents$/.test(new URL(response.url()).pathname));
    await save(page).click(); const copyRaw = await (await copyResponse).json() as { document: { documentId: string }; snapshotText: string }; await expect(status(page)).toHaveText('서버 저장 확인됨');
    const copied = JSON.parse(copyRaw.snapshotText).document as INode, copyPair = copied.metadata!.wonfficeBusinessPair as Pair;
    const expectedCopy = structuredClone(expectedV3), expectedCopyPair = expectedCopy.metadata!.wonfficeBusinessPair as Pair;
    expectedCopyPair.items.forEach((item, index) => { expect(copyPair.items[index].id).not.toBe(item.id); item.derivedFrom = { itemId: item.id, version: item.currentVersion }; item.id = copyPair.items[index].id; });
    expectedCopyPair.relations[0].source.itemId = expectedCopyPair.items[0].id; expectedCopyPair.relations[0].target.itemId = expectedCopyPair.items[1].id;
    expect(copied).toStrictEqual(expectedCopy);
    expect(await runs(`${root}/documents/${copyRaw.document.documentId}/criterion-verifications`)).toEqual([]);
    await page.goto(documentUrl); await expect(status(page)).toHaveText('서버 저장 확인됨');
    phase = 'two-real-users-current-authorization'; checkpoint();
    b = await launchPrivateProfile(profileB); expect(b.pid).not.toBe(a.pid); const other = await b.context.newPage(), otherRequests = track(other, checkpoint);
    await login(other, 'beta-viewer', documentUrl);
    const denied = async (url: string, bearer: string) => {
      for (const suffix of ['', '/context', `/${lostReceipt!.runId}`]) expect((await other.request.get(url + suffix, { headers: { Authorization: bearer } })).status()).toBe(403);
      expect((await other.request.post(url, { headers: { Authorization: bearer }, data: lostBody })).status()).toBe(403);
    };
    await denied(runsEndpoint, otherRequests.bearer); await denied(`${origin}/api/v1/tenants/${initial.betaTenantId}/documents/${source.documentId}/criterion-verifications`, requests.bearer);
    await privateControl({ action: 'beta-active', active: false }); await denied(runsEndpoint, otherRequests.bearer);
    await privateControl({ action: 'beta-active', active: true }); await privateControl({ action: 'beta-role', role: 'editor' }); await other.reload(); await expect(workspace(other)).toBeVisible();
    await ensureBusinessPanel(other); await refreshConfirmation(other).click(); await expect(confirmCriterion(other)).toBeEnabled(); await confirmCriterion(other).click(); await expect(confirmCriterion(other)).toBeDisabled();
    await refreshRuns(other).click(); await expect(runButton(other)).toBeEnabled();
    const betaResult = other.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/criterion-verifications'));
    await runButton(other).click(); const betaRaw = await betaResult; expect([200, 201]).toContain(betaRaw.status()); const betaReceipt = await betaRaw.json() as VerificationReceipt;
    expect(betaReceipt.outcome).toBe('passed'); expect(betaReceipt.requesterIdentityId).not.toBe(captured.actorIdentityId);
    const betaBasisResponse = await other.request.get(`${runsEndpoint}/context`, { headers: { Authorization: otherRequests.bearer } }); const betaBasis = await betaBasisResponse.json() as VerificationBasis;
    const betaRequest = { schemaVersion: 1, expectedRevision: betaBasis.documentRevision, snapshotHash: betaBasis.snapshotHash, snapshotText: betaBasis.snapshotText, context: betaBasis.context, authorityEpoch: betaBasis.authorityEpoch, idempotencyKey: randomUUID(), confirmationId: betaBasis.confirmationId, specimen: betaBasis.specimens[0], evaluator: betaBasis.evaluator };
    phase = 'role-aba-between-context-and-records'; checkpoint();
    let authorityChanged = false;
    await other.route('**/criterion-verifications/context', async route => {
      if (authorityChanged) { await route.continue(); return; }
      const oldContext = await route.fetch(); expect(oldContext.status()).toBe(200); authorityChanged = true;
      await privateControl({ action: 'beta-role', role: 'viewer' }); await privateControl({ action: 'beta-role', role: 'editor' });
      await route.fulfill({ response: oldContext });
    });
    await refreshRuns(other).click(); await expect(verification(other).getByRole('status')).toHaveText('검증 · 실행 기록 미확인');
    await expect(verification(other).getByRole('alert')).toContainText('읽지 못했습니다'); await other.unroute('**/criterion-verifications/context');
    await privateControl({ action: 'beta-role', role: 'viewer' }); await denied(runsEndpoint, otherRequests.bearer);
    await privateControl({ action: 'beta-role', role: 'editor' }); expect((await other.request.post(runsEndpoint, { headers: { Authorization: otherRequests.bearer }, data: betaRequest })).status()).toBe(409);
    expect((await runs()).filter(one => one.runId === betaReceipt.runId)).toStrictEqual([betaReceipt]); expect((await inspect(source.documentId)).document).toStrictEqual(finalSource.document);
    evidence.push({ kind: 'exact-runs', runs: [...terminal, betaReceipt], browserPids: [a.pid, b.pid], authoredRequirementVersion: 2, sourceHash: finalSource.document!.snapshotHash });
    passed = true;
  } catch (error) { evidence.push({ kind: 'failure', phase, errorName: error instanceof Error ? error.name : 'unknown', messageHash: hash(error instanceof Error ? error.message : String(error)) }); checkpoint(); throw error; }
  finally {
    const clean = async (name: string, action: () => Promise<unknown>) => { try { await action(); cleanupSteps.push({ name, ok: true }); } catch { cleanupSteps.push({ name, ok: false }); } checkpoint(); };
    await clean('database-running', () => privateControl({ action: 'db-start' })); await clean('api-running', () => privateControl({ action: 'api-start' }));
    await clean('executor-live', () => privateControl({ action: 'criterion-executor-mode', mode: 'live' }));
    await clean('viewer-active', () => privateControl({ action: 'beta-active', active: true })); await clean('viewer-role', () => privateControl({ action: 'beta-role', role: 'viewer' }));
    if (a) await clean('profile-a-stopped', () => stopPrivateProfile(a!.context, a!.pid)); if (b) await clean('profile-b-stopped', () => stopPrivateProfile(b!.context, b!.pid));
    const cleanup = cleanupSteps.every(step => step.ok); if (cleanup) [profileA, profileB].forEach(path => rmSync(path, { recursive: true, force: true }));
    writeFileSync(evidenceFile, JSON.stringify({ status: passed && cleanup ? 'passed' : 'incomplete', phase, evidence, timeline: requests?.timeline ?? [], cleanupSteps, cleanup, uncovered: ['physical Korean IME', 'independent human participation', 'full Goal/release'] }, null, 2), { mode: 0o600 }); expect(cleanup).toBe(true);
  }
});
