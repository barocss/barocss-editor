import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { INode } from '../../../packages/datastore/src/types';
import { createStarterDocument } from '../../../packages/office-word/src/starter-document';
import { createSampleDocument } from '../../../packages/office-word/src/sample-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';
import { openLocalLibrary } from './helpers/local-library';
import { nativeEditor } from './helpers/native-editor';
import { privateControl, launchPrivateProfile, stopPrivateProfile, type Inspection, type RealStatus } from './helpers/real-recovery-control';

const origin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';
const localOrigin = process.env.OFFICE_CRITERION_LOCAL_ORIGIN;
const sourceRoot = process.env.CRITERION_CONFIRMATION_WORKSPACE_ROOT;
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
    { stype: 'paragraph', attributes: { styleId: 'BusinessEvidence' }, content: [{ stype: 'inline-text', text: requirementText, marks: [{ stype: 'bold', range: [0, requirementText.length] }] }] },
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
const frozenRequest = (capture: Capture, idempotencyKey: string) => ({ schemaVersion: 1, expectedRevision: capture.documentRevision,
  snapshotHash: capture.snapshotHash, snapshotText: capture.snapshotText, context: capture.context, authorityEpoch: capture.authorityEpoch, idempotencyKey });

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
        if (new TextDecoder().decode(data).startsWith('["criterion-confirmation-v1"')) { gate.entered = true; await wait; }
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

// Root serially owns the protected services, runtime and actual execution.
// Automation confirms a fictional fixture; it is not an independent human approval exercise.
test('explicit exact native criterion confirmation is durable, idempotent and private without changing source', async () => {
  test.setTimeout(360_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const evidenceFile = join(directory, 'criterion-confirmation-real.json');
  const profileA = mkdtempSync(join(directory, 'criterion-a-')), profileB = mkdtempSync(join(directory, 'criterion-b-'));
  let a: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined, b: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let requests: ReturnType<typeof track> | undefined, phase = 'entry', passed = false;
  const evidence: Array<Record<string, unknown>> = [], cleanupSteps: Array<{ name: string; ok: boolean }> = [];
  const checkpoint = () => writeFileSync(evidenceFile, JSON.stringify({ status: passed ? 'checks-passed-cleanup-pending' : 'incomplete', phase,
    evidence, timeline: requests?.timeline ?? [], cleanupSteps }, null, 2), { mode: 0o600 });
  checkpoint();
  try {
    const initial = await privateControl<RealStatus>({ action: 'status' });
    const root = `${origin}/api/v1/tenants/${initial.tenantId}`;
    a = await launchPrivateProfile(profileA); const page = await a.context.newPage(); requests = track(page, checkpoint);
    await login(page, 'alpha-editor');
    const source = await seedAndOpen(page), documentUrl = page.url();
    const endpoint = `${root}/documents/${source.documentId}/criterion-confirmations`;
    const headers = () => ({ Authorization: requests!.bearer });
    const records = async (url = endpoint, bearer = requests!.bearer): Promise<ConfirmationReceipt[]> => {
      const response = await page.request.get(url, { headers: { Authorization: bearer } });
      expect(response.status()).toBe(200); return (await response.json() as { confirmations: ConfirmationReceipt[] }).confirmations;
    };
    const capture = async (): Promise<Capture> => {
      const response = await page.request.get(`${endpoint}/context`, { headers: headers() });
      expect(response.status()).toBe(200); return await response.json() as Capture;
    };
    expect(await records()).toEqual([]); // Ordinary save and imported authored claims are not confirmation.
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
    phase = 'controlled-await-dom-selection-aba'; checkpoint();
    await caret(page, requirementText);
    const beforePostCount = requests.timeline.filter(event => event.kind === 'request' && event.method === 'POST' && String(event.path).endsWith('/criterion-confirmations')).length;
    await installDigestGate(page);
    try {
      await confirmCriterion(page).click();
      await enteredDigestGate(page);
      await caret(page, decisionText); await caret(page, requirementText);
      await releaseDigestGate(page);
      await expect(confirmCriterion(page)).toBeEnabled();
      expect(requests.timeline.filter(event => event.kind === 'request' && event.method === 'POST' && String(event.path).endsWith('/criterion-confirmations'))).toHaveLength(beforePostCount);
      expect(await records()).toEqual([]); expect(await exported(page)).toStrictEqual(expectedAuthored);
      expect((await inspect(source.documentId)).document).toStrictEqual(committed.document);
    } finally {
      await releaseDigestGate(page, true);
    }
    await ensureBusinessPanel(page); await refreshConfirmation(page).click(); await expect(confirmCriterion(page)).toBeEnabled();
    phase = 'controlled-await-root-retirement'; checkpoint();
    await caret(page, requirementText); await installDigestGate(page);
    try {
      await confirmCriterion(page).click(); await enteredDigestGate(page);
      await openServerActions(page);
      await workspace(page).getByRole('button', { name: '새 Word', exact: true }).click();
      const starter = JSON.parse(wordFileText(createStarterDocument(), '')).document as INode;
      await expect.poll(async () => await exported(page)).toStrictEqual(starter);
      await releaseDigestGate(page);
      expect(requests.timeline.filter(event => event.kind === 'request' && event.method === 'POST' && String(event.path).endsWith('/criterion-confirmations'))).toHaveLength(beforePostCount);
      expect(await records()).toEqual([]); expect(await exported(page)).toStrictEqual(starter);
      expect((await inspect(source.documentId)).document).toStrictEqual(committed.document);
    } finally { await releaseDigestGate(page, true); }
    page.once('dialog', dialog => { void dialog.accept(); });
    await page.goto(documentUrl); await expect(status(page)).toHaveText('서버 저장 확인됨');
    expect(await exported(page)).toStrictEqual(expectedAuthored);
    await ensureBusinessPanel(page); await refreshConfirmation(page).click(); await expect(confirmCriterion(page)).toBeEnabled();
    phase = 'controlled-await-authenticated-account-retirement'; checkpoint();
    await caret(page, requirementText); await installDigestGate(page);
    try {
      await confirmCriterion(page).click(); await enteredDigestGate(page);
      await page.getByRole('button', { name: '로그아웃', exact: true }).click();
      await expect(workspace(page)).not.toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true })).toBeVisible({ timeout: 30_000 });
      // A full OIDC redirect destroys the held JavaScript context. In an SPA
      // return, releasing the real digest must still not revive the old account.
      const survived = await releaseDigestGate(page);
      evidence.push({ kind: 'account-retirement', controlledDigestContextSurvived: survived });
      expect(requests.timeline.filter(event => event.kind === 'request' && event.method === 'POST' && String(event.path).endsWith('/criterion-confirmations'))).toHaveLength(beforePostCount);
      expect((await inspect(source.documentId)).document).toStrictEqual(committed.document);
    } finally { await releaseDigestGate(page, true); }
    await login(page, 'alpha-editor', documentUrl); await expect(status(page)).toHaveText('서버 저장 확인됨');
    expect(await records()).toEqual([]); expect(await exported(page)).toStrictEqual(expectedAuthored);
    await ensureBusinessPanel(page); await refreshConfirmation(page).click(); await expect(confirmCriterion(page)).toBeEnabled();
    phase = 'lost-ack-explicit-ui-confirmation'; checkpoint();
    let lostBody: ReturnType<typeof frozenRequest> | undefined, lostReceipt: ConfirmationReceipt | undefined;
    let lost = false;
    await page.route('**/criterion-confirmations', async route => {
      if (route.request().method() !== 'POST' || lost) { await route.continue(); return; }
      lost = true; lostBody = route.request().postDataJSON() as ReturnType<typeof frozenRequest>;
      const response = await route.fetch(); expect([200, 201]).toContain(response.status());
      lostReceipt = await response.json() as ConfirmationReceipt;
      await route.abort('failed');
    });
    await confirmCriterion(page).click();
    await expect.poll(() => !!lostReceipt).toBe(true);
    expect(lostBody).toStrictEqual(frozenRequest(basis, lostBody!.idempotencyKey));
    await expect(confirmCriterion(page)).toBeEnabled();
    expect(await records()).toStrictEqual([lostReceipt]);
    const retry = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/criterion-confirmations'));
    await confirmCriterion(page).click(); const replay = await retry; expect([200, 201]).toContain(replay.status());
    expect(replay.request().postDataJSON()).toStrictEqual(lostBody);
    const receipt = await replay.json() as ConfirmationReceipt; expect(receipt).toStrictEqual(lostReceipt);
    await page.unroute('**/criterion-confirmations');
    await expect(confirmation(page)).toContainText('확인됨'); await expect(confirmCriterion(page)).toBeDisabled();
    expect(receipt.actorIdentityId).toBe(basis.actorIdentityId); expect(receipt.confirmedAt).not.toBe('1900-01-01T00:00:00Z');
    expect(Number.isNaN(Date.parse(receipt.confirmedAt))).toBe(false); expect(receipt.confirmationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(receipt.context).toStrictEqual(basis.context); expect(receipt.verification).toBe('not-run'); expect(receipt.scope).toBe('writer-self-confirmation');
    expect(await exported(page)).toStrictEqual(expectedAuthored);
    expect((await canonical(page, root, requests.bearer, source.documentId, expectedAuthored)).document).toStrictEqual(committed.document);
    await confirmation(page).getByText('원본 · 문서에 작성한 요구사항과 보관된 결정', { exact: true }).evaluate(node => node.scrollIntoView({ block: 'start' }));
    await expect(confirmation(page).getByRole('status')).toContainText(receipt.actorIdentityId);
    await page.screenshot({ path: join(directory, 'criterion-confirmed-native.png'), animations: 'disabled' });
    phase = 'native-input-and-whole-history-after-confirmation'; checkpoint();
    await caret(page, decisionText, 'End'); await page.keyboard.insertText(decisionAddition);
    const ordinaryEdit = structuredClone(expectedAuthored);
    const ordinaryRun = nativeParagraph(ordinaryEdit, decisionText).content!.find(node => typeof node !== 'string' && node.stype === 'inline-text') as INode;
    ordinaryRun.text = decisionText + decisionAddition;
    expect(await exported(page)).toStrictEqual(ordinaryEdit);
    await caret(page, decisionText + decisionAddition, 'End'); await page.keyboard.press('Meta+z');
    expect(await exported(page)).toStrictEqual(expectedAuthored);
    await caret(page, decisionText, 'End'); await page.keyboard.press('Meta+Shift+z');
    expect(await exported(page)).toStrictEqual(ordinaryEdit);
    await caret(page, decisionText + decisionAddition, 'End'); await page.keyboard.press('Meta+z');
    expect(await exported(page)).toStrictEqual(expectedAuthored);
    expect(await records()).toStrictEqual([receipt]); expect((await inspect(source.documentId)).document).toStrictEqual(committed.document);
    phase = 'duplicate-conflict-forgery'; checkpoint();
    const duplicate = await Promise.all([page.request.post(endpoint, { headers: headers(), data: lostBody }), page.request.post(endpoint, { headers: headers(), data: lostBody })]);
    for (const response of duplicate) { expect([200, 201]).toContain(response.status()); expect(await response.json()).toStrictEqual(receipt); }
    const conflict = await page.request.post(endpoint, { headers: headers(), data: { ...lostBody, expectedRevision: basis.documentRevision + 1 } });
    expect(conflict.status()).toBe(409);
    const forgedContext = await page.request.post(endpoint, { headers: headers(), data: { ...frozenRequest(basis, randomUUID()), context: { ...basis.context, requirement: { ...basis.context.requirement, version: 2 } } } });
    expect(forgedContext.status()).toBe(422);
    for (const forged of [{ actorIdentityId: 'forged' }, { confirmedAt: '1900-01-01T00:00:00Z' }, { status: 'approved' }]) {
      const response = await page.request.post(endpoint, { headers: headers(), data: { ...frozenRequest(basis, randomUUID()), ...forged } });
      expect([400, 422]).toContain(response.status());
    }
    expect(await records()).toStrictEqual([receipt]); expect((await inspect(source.documentId)).document).toStrictEqual(committed.document);
    phase = 'same-database-restart-reopen'; checkpoint();
    const stopped = await privateControl<RealStatus>({ action: 'db-stop' }); expect(stopped.databaseRunning).toBe(false);
    const restarted = await privateControl<RealStatus>({ action: 'db-start' });
    expect(restarted.databaseIdentity).toBe(initial.databaseIdentity); expect(restarted.databaseGeneration).toBe(initial.databaseGeneration);
    expect(restarted.postgresPid).not.toBe(initial.postgresPid);
    await page.reload(); await expect(status(page)).toHaveText('서버 저장 확인됨'); await ensureBusinessPanel(page); await refreshConfirmation(page).click();
    await expect(confirmation(page)).toContainText('확인됨'); expect(await records()).toStrictEqual([receipt]);
    expect((await canonical(page, root, requests.bearer, source.documentId, expectedAuthored)).document).toStrictEqual(committed.document);
    phase = 'trusted-original-local-backup-new-id-restore'; checkpoint();
    // These are the genuinely authored, currently confirmed source bytes. The
    // independent local UI imports them, downloads a backup and restores it.
    const trustedDownload = page.waitForEvent('download');
    await workspace(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Word 파일 내보내기', exact: true }).click();
    const trustedFile = readFileSync((await (await trustedDownload).path())!, 'utf8');
    expect(JSON.parse(trustedFile).document).toStrictEqual(expectedAuthored);
    const local = await a.context.newPage();
    try {
      await local.goto(localOrigin!); await openLocalLibrary(local);
      expect(await localSnapshots(local)).toEqual([]);
      await importLocalFile(local, 'confirmed-original.word.json', trustedFile);
      await expect(local.locator('[data-document]')).toHaveCount(1);
      const imported = (await localSnapshots(local))[0];
      expect(imported.row.title).toBe('Barocss Word (복원)');
      const expectedImported = derivedNative(expectedAuthored, JSON.parse(imported.text).document, 'Barocss Word (복원)');
      const archive = await downloadLocalBackup(local);
      const backup = JSON.parse(archive) as { documents: Array<{ product: string; row: { name: string }; text: string }> };
      expect(backup.documents).toHaveLength(1); expect(backup.documents[0].product).toBe('word');
      expect(backup.documents[0].row.name).toBe(imported.row.name); expect(backup.documents[0].text).toBe(imported.text);
      writeFileSync(join(directory, 'confirmed-source-local-backup.json'), archive, { mode: 0o600 });
      await importLocalFile(local, 'confirmed-source-backup.json', archive);
      await expect(local.locator('[data-document]')).toHaveCount(2);
      const localCopies = await localSnapshots(local);
      expect(localCopies.find(row => row.row.name === imported.row.name)).toStrictEqual(imported);
      const restored = localCopies.find(row => row.row.name !== imported.row.name)!;
      expect(restored.row.title).toBe('Barocss Word (복원) (복원)');
      const expectedRestored = derivedNative(expectedImported, JSON.parse(restored.text).document, 'Barocss Word (복원) (복원)');
      const restoredPair = expectedRestored.metadata!.wonfficeBusinessPair as Pair;
      for (const item of restoredPair.items) {
        (expectedAuthored.metadata!.wonfficeBusinessPair as Pair).items.forEach(source => expect(item.id).not.toBe(source.id));
      }
      // Inspect the mounted local Word and its deliberately untrusted confirmation UI.
      await local.getByRole('button', { name: 'Word Barocss Word (복원) (복원)', exact: true }).click();
      await expect(nativeEditor(local).locator('.w-paragraph').filter({ hasText: requirementText })).toBeVisible({ timeout: 30_000 });
      await nativeEditor(local).getByRole('menuitem', { name: '문서 패널', exact: true }).click();
      await nativeEditor(local).getByRole('menuitemcheckbox', { name: '요구·결정', exact: true }).click();
      const localConfirmation = nativeEditor(local).getByLabel('정확한 요구사항 버전 확인', { exact: true });
      await expect(localConfirmation).toContainText('로그인한 서버 문서의 작성자가 직접 확인해야 합니다.');
      await expect(localConfirmation).toContainText('검증 · 실행하지 않음');
      await expect(localConfirmation).not.toContainText(receipt.confirmationId);
      await expect(localConfirmation).not.toContainText(receipt.actorIdentityId);
      await local.screenshot({ path: join(directory, 'local-restored-unconfirmed.png'), animations: 'disabled' });
      await local.getByRole('button', { name: '파일 자료함', exact: true }).click(); await openLocalLibrary(local);
      const restoredArchive = await downloadLocalBackup(local);
      const restoredBackup = JSON.parse(restoredArchive) as typeof backup;
      const transported = restoredBackup.documents.find(entry => entry.row.name === restored.row.name)!;
      expect(transported.text).toBe(restored.text);
      writeFileSync(join(directory, 'actual-restored-local-backup.json'), restoredArchive, { mode: 0o600 });
      // The native file is extracted unchanged from the actual downloaded backup;
      // transport between origins is controlled, while import/backup/restore are real UI.
      await openServerActions(page);
      await workspace(page).getByLabel('Word 원본 파일로 새 서버 사본 준비').setInputFiles({ name: 'restored-new-id.word.json', mimeType: 'application/json', buffer: Buffer.from(transported.text) });
      const response = page.waitForResponse(response => response.request().method() === 'POST' && /\/documents$/.test(new URL(response.url()).pathname));
      await save(page).click(); const created = await response; expect(created.status()).toBe(201);
      const raw = await created.json() as { document: { documentId: string }; snapshotText: string };
      expect(raw.document.documentId).not.toBe(source.documentId);
      const expectedRestoredServer = derivedNative(expectedRestored, JSON.parse(raw.snapshotText).document, 'Barocss Word (복원) (복원)');
      const originalIds = (expectedAuthored.metadata!.wonfficeBusinessPair as Pair).items.map(item => item.id);
      const importedIds = (expectedImported.metadata!.wonfficeBusinessPair as Pair).items.map(item => item.id);
      for (const item of (expectedRestoredServer.metadata!.wonfficeBusinessPair as Pair).items) {
        expect(originalIds).not.toContain(item.id); expect(importedIds).not.toContain(item.id);
      }
      await expect(status(page)).toHaveText('서버 저장 확인됨');
      await canonical(page, root, requests.bearer, raw.document.documentId, expectedRestoredServer);
      const restoredEndpoint = `${root}/documents/${raw.document.documentId}/criterion-confirmations`;
      for (const reopen of [false, true]) {
        if (reopen) { await page.reload(); await expect(status(page)).toHaveText('서버 저장 확인됨'); }
        expect(await records(restoredEndpoint)).toEqual([]);
        expect(await exported(page)).toStrictEqual(expectedRestoredServer);
        await ensureBusinessPanel(page); await refreshConfirmation(page).click();
        await expect(confirmation(page).getByRole('status')).toHaveText('현재 버전의 서버 확인 기록은 미확인입니다.');
        await expect(confirmation(page)).toContainText('검증 · 실행하지 않음');
        await expect(confirmCriterion(page)).toBeEnabled();
        for (const trusted of [receipt.confirmationId, receipt.actorIdentityId, receipt.confirmedAt]) await expect(confirmation(page)).not.toContainText(trusted);
        await expect(confirmation(page).getByText('이전 확인 기록 · 현재 권한으로 조회', { exact: true })).toHaveCount(0);
        expect(await records()).toStrictEqual([receipt]);
        expect((await inspect(source.documentId)).document).toStrictEqual(committed.document);
      }
      await page.screenshot({ path: join(directory, 'server-restored-unconfirmed.png'), animations: 'disabled' });
      evidence.push({ kind: 'trusted-original-actual-local-backup-new-id-restore', originalDocumentId: source.documentId,
        originalConfirmationId: receipt.confirmationId, importedLocalId: imported.row.name, restoredLocalId: restored.row.name,
        restoredServerDocumentId: raw.document.documentId, archiveHash: hash(archive), restoredArchiveHash: hash(restoredArchive),
        currentPrivateReceiptsEmpty: true, currentUnconfirmedUI: true, originalNativeAndReceiptUnchanged: true,
        controlledTransport: 'unchanged native file extracted from actual downloaded local backup between two application origins' });
    } finally { await local.close(); }
    await page.goto(documentUrl); await expect(status(page)).toHaveText('서버 저장 확인됨');
    await ensureBusinessPanel(page); await refreshConfirmation(page).click(); await expect(confirmation(page)).toContainText('확인됨');
    expect(await exported(page)).toStrictEqual(expectedAuthored); expect(await records()).toStrictEqual([receipt]);
    expect((await inspect(source.documentId)).document).toStrictEqual(committed.document);
    phase = 'new-decision-version'; checkpoint();
    await ensureBusinessPanel(page);
    await caret(page, decisionText, 'End'); await page.keyboard.insertText(decisionAddition);
    const expectedEdited = structuredClone(expectedAuthored);
    const run = nativeParagraph(expectedEdited, decisionText).content!.find(node => typeof node !== 'string' && node.stype === 'inline-text') as INode;
    run.text = decisionText + decisionAddition;
    expect(await exported(page)).toStrictEqual(expectedEdited);
    await panel(page).getByRole('button', { name: '현재 결정 내용을 새 버전으로 보관', exact: true }).click();
    const expectedV2 = structuredClone(expectedEdited), nextPair = expectedV2.metadata!.wonfficeBusinessPair as Pair;
    const actualV2 = await exported(page), pinV2 = (actualV2.metadata!.wonfficeBusinessPair as Pair).items[1].versions[1].snapshotText;
    const pinV2Document: INode = structuredClone(expectedEdited); delete pinV2Document.metadata!.wonfficeBusinessPair;
    expect(JSON.parse(pinV2)).toStrictEqual(JSON.parse(wordFileText(pinV2Document, '')));
    nextPair.items[1].currentVersion = 2; nextPair.items[1].versions.push({ version: 2, snapshotText: pinV2 });
    expect(await exported(page)).toStrictEqual(expectedV2); expect(nextPair.relations).toStrictEqual(expectedPair.relations);
    await save(page).click(); await expect(status(page)).toHaveText('서버 저장 확인됨');
    let nextCommitted = await canonical(page, root, requests.bearer, source.documentId, expectedV2);
    const stale = await page.request.post(endpoint, { headers: headers(), data: frozenRequest(basis, randomUUID()) }); expect(stale.status()).toBe(409);
    const next = await capture(); expect(next.context.decision.version).toBe(1); expect(next.context.decision.currentVersion).toBe(2);
    expect(next.context.decision.snapshotText).toBe(pin); expect(next.context.decision.currentSnapshotText).toBe(pinV2);
    expect(await records()).toStrictEqual([receipt]); expect((await inspect(source.documentId)).document).toStrictEqual(nextCommitted.document);
    await ensureBusinessPanel(page); await refreshConfirmation(page).click(); await expect(confirmCriterion(page)).toBeEnabled();
    await confirmation(page).getByText('원본 · 문서에 작성한 요구사항과 보관된 결정', { exact: true }).evaluate(node => node.scrollIntoView({ block: 'start' }));
    await expect(confirmation(page).getByRole('status')).toContainText('미확인');
    await page.screenshot({ path: join(directory, 'criterion-new-context-unconfirmed.png'), animations: 'disabled' });
    phase = 'ambiguous-canonical-source'; checkpoint();
    const ambiguousNative = structuredClone(expectedV2);
    const surface = ambiguousNative.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'surface')!;
    surface.content!.push(structuredClone(nativeParagraph(ambiguousNative, requirementText)));
    const ambiguousText = wordFileText(ambiguousNative, '');
    const ambiguousSave = await page.request.put(`${root}/documents/${source.documentId}/snapshot`, { headers: headers(), data: {
      expectedRevision: nextCommitted.document!.revision, snapshotText: ambiguousText, idempotencyKey: randomUUID() } });
    expect(ambiguousSave.status()).toBe(200);
    const ambiguousStored = await inspect(source.documentId);
    expect(ambiguousStored.document!.snapshotText).toBe(ambiguousText); expect(ambiguousStored.document!.canonicalTree).toStrictEqual(ambiguousNative);
    const ambiguousContext = await page.request.get(`${endpoint}/context`, { headers: headers() }); expect([400, 409, 422]).toContain(ambiguousContext.status());
    const ambiguousAttempt = await page.request.post(endpoint, { headers: headers(), data: frozenRequest(next, randomUUID()) }); expect(ambiguousAttempt.status()).toBe(409);
    expect((await inspect(source.documentId)).document).toStrictEqual(ambiguousStored.document); expect(await records()).toStrictEqual([receipt]);
    const restore = await page.request.put(`${root}/documents/${source.documentId}/snapshot`, { headers: headers(), data: {
      expectedRevision: ambiguousStored.document!.revision, snapshotText: nextCommitted.document!.snapshotText, idempotencyKey: randomUUID() } });
    expect(restore.status()).toBe(200);
    nextCommitted = await canonical(page, root, requests.bearer, source.documentId, expectedV2);
    await page.reload(); await expect(status(page)).toHaveText('서버 저장 확인됨'); expect(await exported(page)).toStrictEqual(expectedV2);
    phase = 'independent-copy-unconfirmed'; checkpoint();
    await openServerActions(page);
    await workspace(page).getByLabel('Word 원본 파일로 새 서버 사본 준비').setInputFiles({ name: 'criterion-copy.word.json', mimeType: 'application/json', buffer: Buffer.from(nextCommitted.document!.snapshotText) });
    const copiedResponse = page.waitForResponse(response => response.request().method() === 'POST' && /\/documents$/.test(new URL(response.url()).pathname));
    await save(page).click(); const copiedRaw = await (await copiedResponse).json() as { document: { documentId: string }; snapshotText: string };
    await expect(status(page)).toHaveText('서버 저장 확인됨');
    const copied = JSON.parse(copiedRaw.snapshotText).document as INode, copyPair = copied.metadata!.wonfficeBusinessPair as Pair;
    const expectedCopy = structuredClone(expectedV2), expectedCopyPair = expectedCopy.metadata!.wonfficeBusinessPair as Pair;
    expectedCopyPair.items.forEach((item, index) => { expect(copyPair.items[index].id).not.toBe(item.id); item.derivedFrom = { itemId: item.id, version: item.currentVersion }; item.id = copyPair.items[index].id; });
    expectedCopyPair.relations[0].source.itemId = expectedCopyPair.items[0].id; expectedCopyPair.relations[0].target.itemId = expectedCopyPair.items[1].id;
    expect(copied).toStrictEqual(expectedCopy);
    expect(await records(`${root}/documents/${copiedRaw.document.documentId}/criterion-confirmations`)).toEqual([]);
    await page.goto(documentUrl); await expect(status(page)).toHaveText('서버 저장 확인됨');
    phase = 'private-authority-and-creator-downgrade'; checkpoint();
    b = await launchPrivateProfile(profileB); expect(b.pid).not.toBe(a.pid); const other = await b.context.newPage();
    const otherRequests = track(other, checkpoint); await login(other, 'beta-viewer', documentUrl);
    const denied = async (url: string, bearer: string) => {
      for (const suffix of ['', '/context']) { const response = await other.request.get(url + suffix, { headers: { Authorization: bearer } }); expect(response.status()).toBe(403); }
      const response = await other.request.post(url, { headers: { Authorization: bearer }, data: frozenRequest(next, randomUUID()) }); expect(response.status()).toBe(403);
    };
    await denied(endpoint, otherRequests.bearer); await denied(`${origin}/api/v1/tenants/${initial.betaTenantId}/documents/${source.documentId}/criterion-confirmations`, requests.bearer);
    await privateControl({ action: 'beta-active', active: false }); await denied(endpoint, otherRequests.bearer);
    await privateControl({ action: 'beta-active', active: true }); await privateControl({ action: 'beta-role', role: 'editor' });
    await other.reload(); await expect(workspace(other)).toBeVisible(); await expect(save(other)).toBeVisible();
    await workspace(other).getByLabel('Word 원본 파일로 새 서버 사본 준비').setInputFiles({ name: 'beta-criterion-copy.word.json', mimeType: 'application/json', buffer: Buffer.from(nextCommitted.document!.snapshotText) });
    const betaCreatedResponse = other.waitForResponse(response => response.request().method() === 'POST' && /\/documents$/.test(new URL(response.url()).pathname));
    await save(other).click(); const betaCreated = await (await betaCreatedResponse).json() as { document: { documentId: string }; snapshotText: string };
    await expect(status(other)).toHaveText('서버 저장 확인됨');
    const betaEndpoint = `${root}/documents/${betaCreated.document.documentId}/criterion-confirmations`;
    expect(await records(betaEndpoint, otherRequests.bearer)).toEqual([]);
    await ensureBusinessPanel(other); await refreshConfirmation(other).click(); await expect(confirmCriterion(other)).toBeEnabled(); await confirmCriterion(other).click();
    await expect(confirmation(other)).toContainText('확인됨');
    const betaReceipts = await records(betaEndpoint, otherRequests.bearer); expect(betaReceipts).toHaveLength(1); expect(betaReceipts[0].actorIdentityId).not.toBe(receipt.actorIdentityId);
    const betaCaptureResponse = await other.request.get(`${betaEndpoint}/context`, { headers: { Authorization: otherRequests.bearer } });
    expect(betaCaptureResponse.status()).toBe(200); const betaCapture = await betaCaptureResponse.json() as Capture;
    await privateControl({ action: 'beta-role', role: 'viewer' }); await denied(betaEndpoint, otherRequests.bearer);
    await privateControl({ action: 'beta-role', role: 'editor' });
    expect(await records(betaEndpoint, otherRequests.bearer)).toStrictEqual(betaReceipts);
    const retiredAuthority = await other.request.post(betaEndpoint, { headers: { Authorization: otherRequests.bearer }, data: frozenRequest(betaCapture, randomUUID()) });
    expect(retiredAuthority.status()).toBe(409); expect(await records(betaEndpoint, otherRequests.bearer)).toStrictEqual(betaReceipts);
    expect(await records()).toStrictEqual([receipt]); expect((await inspect(source.documentId)).document).toStrictEqual(nextCommitted.document);
    evidence.push({ kind: 'exact-confirmation', documentId: source.documentId, confirmationId: receipt.confirmationId,
      sourceHash: committed.document!.snapshotHash, sourceRevision: committed.document!.revision, requirementVersion: receipt.context.requirement.version,
      decisionReferencedVersion: receipt.context.decision.version, verification: receipt.verification,
      laterDecisionCurrentVersion: next.context.decision.currentVersion, databaseIdentity: restarted.databaseIdentity, browserPids: [a.pid, b.pid] });
    passed = true; checkpoint();
  } catch (error) {
    evidence.push({ kind: 'failure', phase, errorName: error instanceof Error ? error.name : 'unknown', messageHash: hash(error instanceof Error ? error.message : String(error)) }); checkpoint(); throw error;
  } finally {
    const clean = async (name: string, action: () => Promise<unknown>) => { try { await action(); cleanupSteps.push({ name, ok: true }); } catch { cleanupSteps.push({ name, ok: false }); } checkpoint(); };
    await clean('database-running', () => privateControl({ action: 'db-start' }));
    await clean('viewer-active', () => privateControl({ action: 'beta-active', active: true }));
    await clean('viewer-role', () => privateControl({ action: 'beta-role', role: 'viewer' }));
    if (a) await clean('profile-a-stopped', () => stopPrivateProfile(a!.context, a!.pid));
    if (b) await clean('profile-b-stopped', () => stopPrivateProfile(b!.context, b!.pid));
    const cleanup = cleanupSteps.every(step => step.ok); if (cleanup) [profileA, profileB].forEach(path => rmSync(path, { recursive: true, force: true }));
    writeFileSync(evidenceFile, JSON.stringify({ status: passed && cleanup ? 'passed' : 'incomplete', phase, evidence,
      timeline: requests?.timeline ?? [], cleanupSteps, cleanup, uncovered: ['physical OS Korean IME', 'independent human participation', 'organization-wide approval policy', 'verification execution'] }, null, 2), { mode: 0o600 });
    expect(cleanup).toBe(true);
  }
});
