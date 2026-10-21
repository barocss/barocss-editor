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
    await expect.poll(async () => await username.isVisible() ||
      await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await authenticated()).toBe(true);
    if (await username.isVisible()) {
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
  await workspace(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  const action = page.getByRole('menu', { name: '문서 메뉴', exact: true }).locator('[data-menu-block="file:native-export"]').getByRole('menuitem', { name: 'Word 파일 내보내기', exact: true });
  await expect(action).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), action.click()]);
  return JSON.parse(readFileSync((await download.path())!, 'utf8')).document as INode;
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
  await page.getByLabel('작업 공간 파일 탐색', { exact: true }).getByRole('button', { name: '자료함', exact: true }).click();
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
  let profileASafe = true, profileBSafe = true;
  const evidence: Array<Record<string, unknown>> = [], cleanupSteps: Array<{ name: string; ok: boolean }> = [];
  const checkpoint = () => writeFileSync(evidenceFile, JSON.stringify({ status: passed ? 'checks-passed-cleanup-pending' : 'incomplete', phase,
    evidence, timeline: requests?.timeline ?? [], cleanupSteps }, null, 2), { mode: 0o600 });
  checkpoint();
  try {
    const initial = await privateControl<RealStatus>({ action: 'status' });
    const root = `${origin}/api/v1/tenants/${initial.tenantId}`;
    profileASafe = false; a = await launchPrivateProfile(profileA);
    const page = await a.context.newPage(); requests = track(page, checkpoint);
    await login(page, 'alpha-editor');
    const source = await seedAndOpen(page), documentUrl = page.url();
    phase = 'standalone-native-authoring'; checkpoint();
    await businessPanel(page, !await panel(page).isVisible());
    await caret(page, requirementText);
    await panel(page).getByRole('button', { name: '요구사항 문단 지정', exact: true }).click();
    await expect(panel(page)).toContainText('요구사항 지정됨');
    const capturedNative = await exported(page);
    const editable = workspace(page).locator('[contenteditable=true]').first();
    await editable.dispatchEvent('compositionstart');
    await panel(page).getByRole('button', { name: '요구사항 기록', exact: true }).click();
    await expect(panel(page).getByRole('alert')).toContainText('입력이 끝난 뒤');
    expect(await exported(page)).toStrictEqual(capturedNative);
    await editable.dispatchEvent('compositionend');
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
    await expect(panel(page)).toContainText('결정 미연결');
    await expect(panel(page).getByRole('button', { name: '서버 확인 기록 읽기', exact: true })).toHaveCount(0);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
      await page.screenshot({ path: join(directory, `standalone-${theme}.png`), animations: 'disabled' });
    }
    await page.evaluate(() => { delete document.documentElement.dataset.theme; });
    await businessPanel(page, !await panel(page).isVisible());
    expect(await exported(page)).toStrictEqual(expectedStandalone);
    await businessPanel(page, !await panel(page).isVisible());
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
    const standaloneCopyIds: string[] = [];
    for (const sourceKind of ['file', 'local']) {
      await documentActions(page);
      if (sourceKind === 'file') {
    await workspace(page).getByLabel('Word 원본 파일로 새 서버 사본 준비').setInputFiles({
      name: 'fictional-standalone.word.json', mimeType: 'application/json', buffer: Buffer.from(wordFileText(expectedStandalone, '')),
    });
      } else {
        await page.evaluate(({ text }) => new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('barocss-word', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'name' });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result, tx = db.transaction('documents', 'readwrite');
            tx.objectStore('documents').put({ name: 'fictional-standalone-copy', title: 'Fictional standalone copy', text, count: 1, savedAt: 100 });
            tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
          };
        }), { text: wordFileText(expectedStandalone, '') });
        await workspace(page).getByRole('button', { name: '이 기기의 로컬 문서 목록 확인' }).click();
        await workspace(page).getByRole('button', { name: 'Fictional standalone copy · 새 서버 사본 준비', exact: true }).click();
      }
    const copyResponse = page.waitForResponse(response => response.request().method() === 'POST' && /\/documents$/.test(new URL(response.url()).pathname));
    await save(page).click(); const copyCreated = await copyResponse; expect(copyCreated.status()).toBe(201);
    const copyRaw = await copyCreated.json() as { document: { documentId: string }; snapshotText: string };
    expect(copyRaw.document.documentId).not.toBe(source.documentId);
    const copiedStandalone = JSON.parse(copyRaw.snapshotText).document as INode;
    const derivedRequirement = (copiedStandalone.metadata!.wonfficeBusinessPair as Pair).items[0];
    expect(derivedRequirement.id).not.toBe(expectedRequirement.id);
    expect(standaloneCopyIds).not.toContain(derivedRequirement.id); standaloneCopyIds.push(derivedRequirement.id);
    expect(derivedRequirement.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const expectedStandaloneCopy = structuredClone(expectedStandalone);
    const copiedItem = (expectedStandaloneCopy.metadata!.wonfficeBusinessPair as Pair).items[0];
    copiedItem.derivedFrom = { itemId: copiedItem.id, version: 1 }; copiedItem.id = derivedRequirement.id;
    expect(copiedStandalone).toStrictEqual(expectedStandaloneCopy);
    await expect(status(page)).toHaveText('서버 저장 확인됨');
    await canonical(page, root, requests.bearer, copyRaw.document.documentId, expectedStandaloneCopy);
    expect((await inspect(source.documentId)).document).toStrictEqual(standaloneCommitted.document);
    await page.goto(documentUrl); await expect(status(page)).toHaveText('서버 저장 확인됨');
    }

    await businessPanel(page, !await panel(page).isVisible());
    phase = 'later-explicit-decision-link'; checkpoint();
    await panel(page).getByLabel('연결할 요구사항 버전', { exact: true }).selectOption('1');
    await panel(page).getByRole('button', { name: '연결 취소', exact: true }).click();
    await expect(workspace(page).locator('[contenteditable=true]').first()).toBeFocused();
    expect(await exported(page)).toStrictEqual(expectedStandalone);
    // Store a second authored version, then deliberately link the historical v1.
    const revisionSuffix = ' Fictional authored revision.';
    await caret(page, requirementText, 'End'); await page.keyboard.insertText(revisionSuffix);
    const revisedRun = nativeParagraph(expectedStandalone, requirementText).content!.find((node): node is INode => typeof node !== 'string' && node.text === requirementText)!;
    revisedRun.text = requirementText + revisionSuffix;
    // Appending plain text outside the original bold range preserves that range.
    expect(await exported(page)).toStrictEqual(expectedStandalone);
    const secondPinSource = structuredClone(expectedStandalone); delete secondPinSource.metadata!.wonfficeBusinessPair;
    const expectedSecondPin = JSON.parse(wordFileText(secondPinSource, ''));
    await panel(page).getByRole('button', { name: '현재 요구사항 내용을 새 버전으로 보관', exact: true }).click();
    await expect(panel(page)).toContainText('요구사항 · v2');
    expectedRequirement.currentVersion = 2;
    const storedSecondPin = ((await exported(page)).metadata!.wonfficeBusinessPair as Pair).items[0].versions[1].snapshotText;
    expect(JSON.parse(storedSecondPin)).toStrictEqual(expectedSecondPin);
    expectedRequirement.versions.push({ version: 2, snapshotText: storedSecondPin });
    expect(await exported(page)).toStrictEqual(expectedStandalone);
    expect(expectedRequirement.versions[0].snapshotText).toBe(pinV1);
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
    const versionSelect = panel(page).getByLabel('연결할 요구사항 버전', { exact: true });
    expect((await versionSelect.boundingBox())!.height).toBeGreaterThanOrEqual(32);
    const linkButton = panel(page).getByRole('button', { name: '결정 연결', exact: true });
    expect((await linkButton.boundingBox())!.height).toBeGreaterThanOrEqual(32);
    await workspace(page).locator('[contenteditable=true]').first().dispatchEvent('compositionstart');
    await linkButton.click();
    await expect(panel(page).getByRole('alert')).toContainText('입력이 끝난 뒤');
    expect(await exported(page)).toStrictEqual(expectedBeforeLink);
    await expect(versionSelect).toHaveValue('1');
    await workspace(page).locator('[contenteditable=true]').first().dispatchEvent('compositionend');
    await linkButton.click();
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
    await expect(panel(page)).toContainText('다시 검토해야 합니다');
    await expect(panel(page).getByRole('button', { name: '이 요구사항 버전을 직접 확인', exact: true })).toBeDisabled();
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
    let frozen: { method: string; path: string; body: Record<string, unknown> } | undefined;
    await page.route('**/api/v1/**/snapshot', async route => {
      if (route.request().method() !== 'PUT' || dropped) { await route.continue(); return; }
      dropped = true;
      frozen = { method: 'PUT', path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() as Record<string, unknown> };
      const response = await route.fetch(); expect(response.status()).toBe(200);
      await route.abort('connectionfailed');
    });
    const writesBefore = requests.writes.length;
    await save(page).click();
    await expect(save(page)).toHaveText('저장 확인·재시도');
    await expect.poll(() => !!frozen).toBe(true);
    expect(JSON.parse(String(frozen!.body.snapshotText)).document).toStrictEqual(expectedV2);
    await page.reload(); await expect(workspace(page)).toBeVisible();
    await expect.poll(async () => await status(page).textContent() === '서버 저장 확인됨' || await save(page).textContent() === '저장 확인·재시도').toBe(true);
    if (await status(page).textContent() !== '서버 저장 확인됨') await save(page).click();
    await expect(status(page)).toHaveText('서버 저장 확인됨');
    const retried = requests.writes.slice(writesBefore).filter(write => write.method === 'PUT');
    // A receipt GET is also permitted. If PUT is retried it must preserve the complete frozen envelope.
    retried.forEach(write => expect(write).toStrictEqual(frozen));
    const receiptPath = `/receipts/update/${String(frozen!.body.idempotencyKey)}`;
    expect(requests.timeline.some(event => event.kind === 'request' && event.method === 'GET' && String(event.path).endsWith(receiptPath))).toBe(true);
    const unchanged = (await inspect(source.documentId)).document;
    const conflicting = JSON.parse(String(frozen!.body.snapshotText));
    conflicting.document.metadata = { ...conflicting.document.metadata, conflictProbe: 'fictional' };
    const conflict = await page.request.put(`${root}/documents/${source.documentId}/snapshot`, { headers: { Authorization: requests.bearer }, data: { ...frozen!.body, snapshotText: JSON.stringify(conflicting) } });
    expect(conflict.status()).toBe(409); expect((await inspect(source.documentId)).document).toStrictEqual(unchanged);
    await page.unroute('**/api/v1/**/snapshot');
    expect((await inspect(source.documentId)).document!.revision).toBe(standaloneCommitted.document!.revision + 1);
    phase = 'canonical-save'; checkpoint();
    await expect(status(page)).toHaveText('서버 저장 확인됨');
    const committed = await canonical(page, root, requests.bearer, source.documentId, expectedV2);
    await page.reload(); await expect(workspace(page)).toBeVisible({ timeout: 30_000 });
    await expect(status(page)).toHaveText('서버 저장 확인됨');
    expect(await exported(page)).toStrictEqual(expectedV2);
    phase = 'stale-review-original-pin'; checkpoint();
    await businessPanel(page, !await panel(page).isVisible());
    await caret(page, requirementText, 'End'); await page.keyboard.insertText(' Fictional later change.');
    await expect(panel(page)).toContainText('다시 검토해야 합니다');
    const changedNative = await exported(page);
    expect((changedNative.metadata!.wonfficeBusinessPair as Pair).items[0]).toStrictEqual(expectedRequirement);
    await panel(page).getByRole('button', { name: '보관된 v1 내용', exact: true }).first().click();
    const pinView = panel(page).locator('section').filter({ has: page.getByRole('button', { name: '보관 내용 닫기', exact: true }) });
    await pinView.getByText('전체 원본과 서식 데이터', { exact: true }).click();
    expect(await pinView.locator('pre').textContent()).toBe(pinV1);
    await panel(page).getByRole('button', { name: '보관 내용 닫기', exact: true }).click();
    await caret(page, requirementText, 'End'); await page.keyboard.press('Meta+z');
    expect(await exported(page)).toStrictEqual(expectedV2);
    phase = 'database-restart'; checkpoint();
    await privateControl({ action: 'api-stop' });
    const stopped = await privateControl<RealStatus>({ action: 'db-stop' }); expect(stopped.databaseRunning).toBe(false);
    await privateControl({ action: 'db-start' });
    const restarted = await privateControl<RealStatus>({ action: 'api-start' });
    expect(restarted.apiPid).not.toBe(initial.apiPid);
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
      await documentActions(page);
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
    profileBSafe = false; b = await launchPrivateProfile(profileB); expect(b.pid).not.toBe(a.pid);
    const other = await b.context.newPage(), otherRequests = track(other, checkpoint);
    await login(other, 'beta-viewer', documentUrl);
    await expect(workspace(other)).toBeVisible({ timeout: 30_000 });
    await expect(save(other)).toHaveCount(0);
    await expect(workspace(other).locator('[contenteditable=true]')).toHaveCount(0);
    await businessPanel(other, true);
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
    await clean('api-running', () => privateControl({ action: 'api-start' }));
    await clean('viewer-active', () => privateControl({ action: 'beta-active', active: true }));
    await clean('viewer-role', () => privateControl({ action: 'beta-role', role: 'viewer' }));
    if (a) await clean('profile-a-stopped', async () => { await stopPrivateProfile(a!.context, a!.pid); profileASafe = true; });
    if (b) await clean('profile-b-stopped', async () => { await stopPrivateProfile(b!.context, b!.pid); profileBSafe = true; });
    const cleanup = profileASafe && profileBSafe && cleanupSteps.every(step => step.ok);
    if (cleanup) [profileA, profileB].forEach(path => rmSync(path, { recursive: true, force: true }));
    writeFileSync(evidenceFile, JSON.stringify({ status: passed && cleanup ? 'passed' : 'incomplete', phase,
      evidence, timeline: requests?.timeline ?? [], cleanupSteps, cleanup,
      uncovered: ['physical OS Korean IME', 'same-document account/role ABA during pending native write requires root-owned focused lifetime checks'] }, null, 2), { mode: 0o600 });
    expect(cleanup).toBe(true);
  }
});


const uiRequirementText = 'Fictional requirement: retain rich evidence.';
const uiOrdinaryText = 'Ordinary draft paragraph; no business item.';
const uiDecisionText = 'Fictional decision: preserve authored source.';
async function documentActions(page: Page) {
  const actions = workspace(page).getByRole('region', { name: '문서 작업', exact: true });
  if (await actions.isVisible()) return;
  await workspace(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menu', { name: '문서 메뉴', exact: true }).getByRole('menuitem', { name: '열기…', exact: true }).click();
  await expect(actions).toBeVisible();
}
async function businessPanel(page: Page, open: boolean) {
  if (await panel(page).isVisible() === open) return;
  await workspace(page).getByRole('menuitem', { name: '문서 패널', exact: true }).click();
  await workspace(page).getByRole('menuitemcheckbox', { name: '요구·결정', exact: true }).click();
  await expect(panel(page))[open ? 'toBeVisible' : 'toBeHidden']();
}
async function uiCaret(page: Page, index: number, text: string, end = false) {
  const paragraph = workspace(page).locator('.w-document .w-paragraph').nth(index);
  await expect(paragraph).toHaveText(text);
  await paragraph.click({ position: { x: 8, y: 8 } });
  await page.keyboard.press(end ? 'Meta+ArrowRight' : 'Meta+ArrowLeft');
}
async function verifyPublicIdentity(page: Page, alias: Alias, tenantId: string, expectedRole: 'owner' | 'editor' | 'viewer') {
  const fixture = JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8')) as { issuer: string; users: Record<Alias, { id: string }> };
  let verified: { issuer: string; subject: string; currentUserId?: string | null; role: string; listedRole?: string } | undefined;
  await expect.poll(async () => {
    try {
      verified = await page.evaluate(async tenant => {
        const source = '/src/auth-client.ts';
        const client = await import(source);
        const identity = await client.loadIdentity(), role = await client.confirmTenant(tenant);
        return { issuer: identity.issuer, subject: identity.subject, currentUserId: identity.currentUserId,
          role, listedRole: identity.tenants.find((one: { tenantId: string; role: string }) => one.tenantId === tenant)?.role };
      }, tenantId);
      return verified!.issuer === fixture.issuer && verified!.subject === fixture.users[alias].id &&
        /^[0-9a-f-]{36}$/i.test(verified!.currentUserId ?? '') && verified!.role === expectedRole && verified!.listedRole === expectedRole;
    } catch { return false; }
  }).toBe(true);
  return verified!;
}
async function authorInitialRichParagraph(page: Page, observe: (state: Record<string, unknown>) => void = () => {}) {
  await page.getByLabel('작업 공간 파일 탐색', { exact: true }).getByRole('button', { name: '자료함', exact: true }).click();
  await page.getByRole('button', { name: 'Word 자료', exact: true }).click();
  await page.getByRole('button', { name: '새 Word 만들기', exact: true }).click();
  await expect(workspace(page)).toBeVisible();
  await workspace(page).getByRole('button', { name: '새 Word', exact: true }).click();
  await expect(workspace(page).locator('.w-shell')).toBeVisible();
  const starter = await exported(page), expected = structuredClone(starter);
  expect(Object.hasOwn(starter.metadata ?? {}, 'wonfficeBusinessPair')).toBe(false);
  const surface = expected.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'surface')!;
  expect(surface.content).toHaveLength(1);
  const blank = structuredClone(surface.content![0]) as INode;
  expect(blank.stype).toBe('paragraph'); expect(blank.content).toHaveLength(1);
  expect((blank.content![0] as INode).text).toBe('');
  const ordinary = surface.content![0] as INode;
  (ordinary.content![0] as INode).text = uiOrdinaryText;
  const rich = structuredClone(blank); (rich.content![0] as INode).text = uiRequirementText;
  (rich.content![0] as INode).marks = [{ stype: 'bold', range: [0, uiRequirementText.length] }];
  surface.content!.push(rich);
  observe({ starter, expected });
  await uiCaret(page, 0, ''); await page.keyboard.insertText(uiOrdinaryText);
  await page.keyboard.press('Enter'); await page.keyboard.insertText(uiRequirementText);
  await page.keyboard.press('Meta+Shift+ArrowLeft');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(uiRequirementText);
  await page.keyboard.press('Meta+b');
  const authored = await exported(page); observe({ starter, expected, actual: authored }); expect(authored).toStrictEqual(expected);
  expect(Object.hasOwn(authored.metadata ?? {}, 'wonfficeBusinessPair')).toBe(false);
  return { starter, expected };
}

test('current actual UI authors rich text before recording one standalone requirement and later deliberately links a decision', async ({ browserName }, info) => {
  test.setTimeout(300_000); expect(browserName).toBe('chromium');
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const profile = mkdtempSync(join(directory, '450-ui-author-'));
  let owned: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let page: Page | undefined, primary: unknown, cleanupFailure: unknown;
  const evidence: Record<string, unknown> = { phase: 'login', status: 'incomplete', initialAuthoring: 'actual public Word pointer/keyboard/Bold; no seeded native/import/storage', physicalOsIme: 'not exercised' };
  const checkpoint = (phase: string) => { evidence.phase = phase; writeFileSync(join(directory, '450-ui-authoring.json'), JSON.stringify(evidence, null, 2), { mode: 0o600 }); };
  try {
    const fixture = await privateControl<RealStatus>({ action: 'status' });
    owned = await launchPrivateProfile(profile); evidence.browserPid = owned.pid; page = await owned.context.newPage();
    const requests = track(page, () => {});
    await login(page, 'alpha-editor');
    evidence.identity = await verifyPublicIdentity(page, 'alpha-editor', fixture.tenantId, 'owner');
    checkpoint('actual-initial-rich-ui');
    const source = await authorInitialRichParagraph(page, state => { evidence.initialAuthoring = state; checkpoint('actual-initial-rich-ui'); }); evidence.starter = source.starter; evidence.initialAuthored = source.expected;
    await businessPanel(page, true); await uiCaret(page, 1, uiRequirementText);
    await panel(page).getByRole('button', { name: '요구사항 문단 지정', exact: true }).click();
    await expect(panel(page)).toContainText('요구사항 지정됨');
    const anchored = await exported(page), expectedAnchored = structuredClone(source.expected);
    const anchor = nativeParagraph(anchored, uiRequirementText).content![0] as INode;
    expect(anchor.stype).toBe('bookmarkAnchor'); expect(anchor.attributes?.id).toMatch(/^business_[0-9a-f-]{36}$/);
    nativeParagraph(expectedAnchored, uiRequirementText).content!.unshift({ stype: 'bookmarkAnchor', attributes: { id: anchor.attributes!.id } });
    expect(anchored).toStrictEqual(expectedAnchored);
    checkpoint('first-standalone-record');
    await panel(page).getByRole('button', { name: '요구사항 기록', exact: true }).click();
    await expect(panel(page)).toContainText('결정 미연결');
    const recorded = await exported(page), payload = recorded.metadata!.wonfficeBusinessPair as Pair;
    expect(payload.items).toHaveLength(1); expect(payload.relations).toStrictEqual([]);
    const item = payload.items[0]; expect(item.id).toMatch(/^[0-9a-f-]{36}$/); expect(item.kind).toBe('requirement');
    const pin = item.versions[0].snapshotText; expect(JSON.parse(pin)).toStrictEqual(JSON.parse(wordFileText(expectedAnchored, '')));
    const expectedItem: PairItem = { id: item.id, kind: 'requirement', currentVersion: 1,
      locator: { kind: 'point-bookmark', bookmarkId: String(anchor.attributes!.id) }, versions: [{ version: 1, snapshotText: pin }] };
    const expectedStandalone: INode = { ...expectedAnchored, metadata: { ...expectedAnchored.metadata,
      wonfficeBusinessPair: { schemaVersion: 2, lifecycle: 'unlinked', items: [expectedItem], relations: [] } } };
    expect(recorded).toStrictEqual(expectedStandalone);
    await uiCaret(page, 1, uiRequirementText); await page.keyboard.press('Meta+z'); expect(await exported(page)).toStrictEqual(expectedAnchored);
    await uiCaret(page, 1, uiRequirementText); await page.keyboard.press('Meta+Shift+z'); expect(await exported(page)).toStrictEqual(expectedStandalone);
    const createdResponse = page.waitForResponse(response => response.request().method() === 'POST' && /\/documents$/.test(new URL(response.url()).pathname));
    await save(page).click(); const response = await createdResponse; expect(response.status()).toBe(201);
    const created = await response.json() as { document: { documentId: string } }; const documentId = created.document.documentId;
    const root = `${origin}/api/v1/tenants/${fixture.tenantId}`;
    await expect(status(page)).toHaveText('서버 저장 확인됨');
    await canonical(page, root, requests.bearer, documentId, expectedStandalone);
    checkpoint('standalone-reopen'); await page.reload(); await expect(workspace(page)).toBeVisible();
    expect(await exported(page)).toStrictEqual(expectedStandalone);
    await businessPanel(page, true); await expect(panel(page)).toContainText('결정 미연결');
    const themes: Record<string, unknown> = {};
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await expect.poll(() => page!.evaluate(() => document.getAnimations().filter(one => one.playState === 'running').length)).toBe(0);
      themes[theme] = await workspace(page).locator('.w-document .w-paragraph').nth(1).evaluate(element => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode(); while (node && !node.textContent?.trim()) node = walker.nextNode();
        const leaf = node?.parentElement ?? element;
        const range = document.createRange(); if (node) range.selectNodeContents(node);
        const rect = node ? range.getBoundingClientRect() : element.getBoundingClientRect();
        const covers = document.elementFromPoint(rect.x + Math.min(rect.width / 2, 40), rect.y + rect.height / 2);
        const lineage: Array<Record<string, unknown>> = [];
        for (let one: Element | null = leaf; one; one = one.parentElement) {
          const style = getComputedStyle(one); lineage.push({ tag: one.tagName, className: one.className, color: style.color,
            background: style.backgroundColor, opacity: style.opacity, visibility: style.visibility, display: style.display,
            textFill: style.webkitTextFillColor, filter: style.filter, blend: style.mixBlendMode, zIndex: style.zIndex, position: style.position, transform: style.transform });
        }
        return { darkMedia: matchMedia('(prefers-color-scheme: dark)').matches, htmlTheme: document.documentElement.dataset.theme,
          bodyTheme: document.body.dataset.theme, nativeText: element.textContent, leafTag: leaf.tagName, lineage, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          sheets: [...document.querySelectorAll('.w-sheet,.w-sheets')].map(one => { const style=getComputedStyle(one), box=one.getBoundingClientRect(); return { tag: one.tagName, className: one.className, zIndex: style.zIndex, position: style.position, background: style.backgroundColor, pointer: style.pointerEvents, box: { x: box.x, y: box.y, width: box.width, height: box.height } }; }),
          coveredBy: covers ? { tag: covers.tagName, className: covers.className, ownText: covers.textContent?.slice(0, 160) } : null };
      });
      evidence.themeProjection = themes; checkpoint('settled-theme-projection');
      await page.screenshot({ path: info.outputPath(`450-ui-${theme}.png`) });
      await workspace(page).locator('.w-document .w-paragraph').nth(1).screenshot({ path: info.outputPath(`450-native-paragraph-${theme}.png`) });
    }
    expect(requests.timeline.filter(one => typeof one.path === 'string' && /\/(?:execution|models|inference|confirmations|verifications)(?:\/|$)/.test(one.path))).toHaveLength(0);
    evidence.standalone = { documentId, itemId: item.id, rawPin: pin, native: expectedStandalone };
    checkpoint('later-ui-decision-authoring');
    await businessPanel(page, false); await uiCaret(page, 0, uiOrdinaryText, true);
    await page.keyboard.press('Meta+Shift+ArrowLeft');
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(uiOrdinaryText);
    await page.keyboard.insertText(uiDecisionText);
    const expectedDecisionDraft = structuredClone(expectedStandalone);
    const ordinaryRun = nativeParagraph(expectedDecisionDraft, uiOrdinaryText).content!.find((one): one is INode => typeof one !== 'string' && one.stype === 'inline-text')!;
    ordinaryRun.text = uiDecisionText;
    // Replacing the selected plain run authors an explicit empty mark array.
    // The unedited requirement and its earlier raw pin retain their original shape.
    ordinaryRun.marks = [];
    const actualDecisionDraft = await exported(page);
    evidence.decisionAuthoring = { basis: expectedStandalone, expected: expectedDecisionDraft, actual: actualDecisionDraft };
    checkpoint('later-ui-decision-authoring');
    expect(actualDecisionDraft).toStrictEqual(expectedDecisionDraft);
    await businessPanel(page, true); await uiCaret(page, 0, uiDecisionText);
    await panel(page).getByRole('button', { name: '연결할 결정 문단 지정', exact: true }).click();
    await expect(panel(page)).toContainText('결정 지정됨');
    await panel(page).getByLabel('연결할 요구사항 버전', { exact: true }).selectOption('1');
    const linkBasis = await exported(page), expectedLinkBasis = structuredClone(expectedDecisionDraft);
    const decisionAnchor = nativeParagraph(linkBasis, uiDecisionText).content![0] as INode;
    expect(decisionAnchor.stype).toBe('bookmarkAnchor'); expect(decisionAnchor.attributes?.id).toMatch(/^business_[0-9a-f-]{36}$/);
    expect(decisionAnchor.attributes!.id).not.toBe(anchor.attributes!.id);
    nativeParagraph(expectedLinkBasis, uiDecisionText).content!.unshift({ stype: 'bookmarkAnchor', attributes: { id: decisionAnchor.attributes!.id } });
    expect(linkBasis).toStrictEqual(expectedLinkBasis);
    await panel(page).getByRole('button', { name: '결정 연결', exact: true }).click();
    await expect(panel(page)).toContainText('supported_by');
    const linked = await exported(page), linkedPayload = linked.metadata!.wonfficeBusinessPair as Pair;
    const decision = linkedPayload.items.find(one => one.kind === 'decision')!;
    expect(decision.id).toMatch(/^[0-9a-f-]{36}$/); expect(decision.id).not.toBe(item.id);
    const pinBasis = structuredClone(expectedLinkBasis); delete pinBasis.metadata!.wonfficeBusinessPair;
    expect(JSON.parse(decision.versions[0].snapshotText)).toStrictEqual(JSON.parse(wordFileText(pinBasis, '')));
    const expectedLinked: INode = { ...expectedLinkBasis, metadata: { ...expectedLinkBasis.metadata,
      wonfficeBusinessPair: { schemaVersion: 2, lifecycle: 'linked', items: [expectedItem, {
        id: decision.id, kind: 'decision', currentVersion: 1,
        locator: { kind: 'point-bookmark', bookmarkId: String(decisionAnchor.attributes!.id) },
        versions: [{ version: 1, snapshotText: decision.versions[0].snapshotText }],
      }], relations: [{ kind: 'supported_by', source: { itemId: item.id, version: 1 }, target: { itemId: decision.id, version: 1 } }] } } };
    expect(linked).toStrictEqual(expectedLinked);
    expect(linkedPayload.items[0]).toStrictEqual(expectedItem); expect(linkedPayload.items[0].versions[0].snapshotText).toBe(pin);
    await uiCaret(page, 0, uiDecisionText); await page.keyboard.press('Meta+z'); expect(await exported(page)).toStrictEqual(expectedLinkBasis);
    await uiCaret(page, 0, uiDecisionText); await page.keyboard.press('Meta+Shift+z'); expect(await exported(page)).toStrictEqual(expectedLinked);
    await save(page).click(); await expect(status(page)).toHaveText('서버 저장 확인됨');
    await canonical(page, root, requests.bearer, documentId, expectedLinked);
    checkpoint('linked-reopen'); await page.reload(); await expect(workspace(page)).toBeVisible();
    expect(await exported(page)).toStrictEqual(expectedLinked);
    expect(requests.timeline.filter(one => typeof one.path === 'string' && /\/(?:execution|models|inference|confirmations|verifications)(?:\/|$)/.test(one.path))).toHaveLength(0);
    evidence.linked = { documentId, requirementId: item.id, unchangedRawRequirementPin: pin, native: expectedLinked };
    evidence.status = 'passed'; checkpoint('initial-authoring-and-later-link-complete');
  } catch (error) {
    primary = error;
    try { if (page && !page.isClosed()) { evidence.failure = { phase: evidence.phase, pathname: new URL(page.url()).pathname,
      text: await page.locator('body').innerText() }; await page.screenshot({ path: info.outputPath('450-ui-failure.png') }); checkpoint(String(evidence.phase)); } }
    catch { evidence.observationUnavailable = true; }
  } finally {
    try { if (owned) await stopPrivateProfile(owned.context, owned.pid); evidence.cleanup = true; }
    catch (cleanup) { evidence.cleanup = false; evidence.cleanupError = cleanup instanceof Error ? cleanup.message : String(cleanup); checkpoint(String(evidence.phase)); cleanupFailure = cleanup; }
    checkpoint(String(evidence.phase));
  }
  if (primary) throw primary;
  if (cleanupFailure) throw cleanupFailure;
});

interface PendingGateSnapshot {
  observed: boolean; classMatches: boolean; rootId?: string; documentId?: string; epoch?: number;
  entered: number; released: number; selectionCalls?: unknown[]; servedModules?: string[]; history?: unknown; selection?: unknown; internalTree?: unknown; editable?: boolean;
}
async function installPendingNativeGate(page: Page, documentId: string) {
  const root = process.env.BUSINESS_PAIR_WORKSPACE_ROOT!;
  const channel = `wonffice-450-test-${randomUUID()}`;
  await page.evaluate(async ({ root, channel, documentId }) => {
    const coreSource = `/@fs${root}/packages/editor-core/src/editor.ts`;
    const storeSource = `/@fs${root}/packages/datastore/src/data-store.ts`;
    const sharedSource = `/@fs${root}/packages/shared/src/document-save/product-host.ts`;
    const { Editor } = await import(coreSource), { DataStore } = await import(storeSource);
    const { productDocumentHost } = await import(sharedSource);
    const update = Editor.prototype.updateSelection, acquire = DataStore.prototype.acquireLock, unlock = DataStore.prototype.releaseLock;
    type Receiver = { dataStore: { getNode(id: string): { stype: string } | undefined; getDocumentEpoch(): number };
      getRootId(): string; getHistoryStats(): unknown; exportDocument(): unknown; selection: unknown; isEditable: boolean };
    let editor: Receiver | undefined, observe = true, armed = false, entered = 0, released = 0;
    let observedLock: { store: Receiver['dataStore']; id: string; root: string; documentId: string } | undefined;
    const selectionCalls: unknown[] = [];
    let release: (() => void) | undefined;
    let pause: Promise<void> | undefined;
    const observeReceiver = (receiver: Receiver) => { editor = receiver; observe = false; };
    const updateWrapper = function (this: Receiver, ...args: unknown[]) {
      const result = update.apply(this, args);
      const selection = args[0] as { type?: string; selection?: { type?: string } } | null;
      if (selectionCalls.length < 12) selectionCalls.push({ type: selection?.type, innerType: selection?.selection?.type, root: this.getRootId(), stype: this.dataStore.getNode(this.getRootId())?.stype });
      if (observe && (selection?.type === 'range' || selection?.selection?.type === 'range') &&
        this.dataStore.getNode(this.getRootId())?.stype === 'document') observeReceiver(this);
      return result;
    };
    const acquireWrapper = async function (this: Receiver['dataStore'], ...args: unknown[]) {
      const pending = armed && editor?.dataStore === this && args[0] === 'word-snapshot-input';
      if (pending) { armed = false; entered++; await pause; }
      const id = await acquire.apply(this, args);
      if (pending) observedLock = { store: this, id, root: editor!.getRootId(), documentId };
      return id;
    };
    const releaseWrapper = function (this: Receiver['dataStore'], ...args: unknown[]) {
      const result = unlock.apply(this, args);
      if (observedLock?.store === this && args[0] === observedLock.id) { released++; observedLock = undefined; }
      return result;
    };
    Editor.prototype.updateSelection = updateWrapper;
    DataStore.prototype.acquireLock = acquireWrapper;
    DataStore.prototype.releaseLock = releaseWrapper;
    const snapshot = () => ({ selectionCalls, servedModules: performance.getEntriesByType('resource').map(one => one.name).filter(name => name.includes('editor-core') || name.includes('/data-store.ts') || name.includes('office-word/src/word-kit')), observed: !!editor, classMatches: !!editor && editor instanceof Editor && editor.dataStore instanceof DataStore,
      rootId: editor?.getRootId(), documentId: productDocumentHost()?.id(), epoch: editor?.dataStore.getDocumentEpoch(), entered, released,
      history: editor?.getHistoryStats(), selection: editor?.selection, internalTree: editor?.exportDocument(), editable: editor?.isEditable });
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{ action: string; id: string }>).detail;
      let failure: string | undefined;
      if (detail.action === 'arm') {
        if (!editor || !(editor instanceof Editor) || !(editor.dataStore instanceof DataStore) || productDocumentHost()?.id() !== documentId)
          failure = 'Actual selected native receiver/module/document was not qualified';
        else { pause = new Promise<void>(resolve => { release = resolve; }); armed = true; }
      }
      if (detail.action === 'release') release?.();
      if (detail.action === 'restore') {
        release?.(); armed = false;
        if (Editor.prototype.updateSelection === updateWrapper) Editor.prototype.updateSelection = update;
        if (DataStore.prototype.acquireLock === acquireWrapper) DataStore.prototype.acquireLock = acquire;
        if (DataStore.prototype.releaseLock === releaseWrapper) DataStore.prototype.releaseLock = unlock;
        document.removeEventListener(channel, handle);
      }
      document.dispatchEvent(new CustomEvent(channel + ':result', { detail: { id: detail.id, failure, value: snapshot() } }));
    };
    document.addEventListener(channel, handle);
  }, { root, channel, documentId });
  return async (action: 'arm' | 'snapshot' | 'release' | 'restore') => page.evaluate(({ channel, action }) => new Promise<PendingGateSnapshot>((resolve, reject) => {
    const id = crypto.randomUUID();
    const reply = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; failure?: string; value: PendingGateSnapshot }>).detail;
      if (detail.id !== id) return;
      document.removeEventListener(channel + ':result', reply);
      if (detail.failure) reject(new Error(detail.failure)); else resolve(detail.value);
    };
    document.addEventListener(channel + ':result', reply);
    document.dispatchEvent(new CustomEvent(channel, { detail: { action, id } }));
  }), { channel, action });
}
async function rawWordScope(page: Page, scope: { issuer: string; subject: string; tenantId: string; workspaceId: string }) {
  return page.evaluate(expected => Object.keys(localStorage).filter(key => key.startsWith('wonffice.word.pending.v1:')).flatMap(key => {
    const raw = localStorage.getItem(key)!;
    const record = JSON.parse(raw) as { scope?: Record<string, string> };
    return record.scope && Object.entries(expected).every(([name, value]) => record.scope![name] === value) ? [{ key, raw }] : [];
  }).sort((a, b) => a.key.localeCompare(b.key)), scope);
}
async function refreshPublicRole(page: Page, role: 'editor' | 'viewer', tenantId: string) {
  await privateControl({ action: 'beta-role', role });
  await verifyPublicIdentity(page, 'beta-viewer', tenantId, role);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(workspace(page)).toBeVisible();
  await expect.poll(() => workspace(page).locator('[contenteditable=true]').count()).toBe(role === 'viewer' ? 0 : 1);
  await verifyPublicIdentity(page, 'beta-viewer', tenantId, role);
}
async function publicLogout(page: Page) {
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wonffice에 들어가기', exact: true })).toBeVisible();
}
for (const operation of ['record', 'link'] as const) for (const mutation of ['role', 'account'] as const) {
  test(`current genuine ${mutation} ABA retires a pending standalone ${operation} action without source or history publication`, async ({ browserName }, info) => {
    test.setTimeout(300_000); expect(browserName).toBe('chromium');
    const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
    const profile = mkdtempSync(join(directory, `450-${mutation}-${operation}-`));
    let owned: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
    let page: Page | undefined, primary: unknown;
    let gate: Awaited<ReturnType<typeof installPendingNativeGate>> | undefined;
    const evidence: Record<string, unknown> = { status: 'incomplete', phase: 'login', operation, mutation,
      controlledFault: 'exact actual selected receiver pre-original word-snapshot-input acquisition; private membership grant and focus stimulus', auth: 'genuine public OIDC issuer/subject/internalUUID/role' };
    const checkpoint = (phase: string) => { evidence.phase = phase; writeFileSync(join(directory, `450-${mutation}-${operation}.json`), JSON.stringify(evidence, null, 2), { mode: 0o600 }); };
    try {
      const fixture = await privateControl<RealStatus>({ action: 'status' });
      await privateControl({ action: 'beta-role', role: 'editor' });
      owned = await launchPrivateProfile(profile); evidence.browserPid = owned.pid;
      page = await owned.context.newPage(); const requests = track(page, () => {});
      await login(page, 'beta-viewer');
      const initialIdentity = await verifyPublicIdentity(page, 'beta-viewer', fixture.tenantId, 'editor');
      evidence.identityA = initialIdentity;
      await authorInitialRichParagraph(page);
      await businessPanel(page, true); await uiCaret(page, 1, uiRequirementText);
      await panel(page).getByRole('button', { name: '요구사항 문단 지정', exact: true }).click();
      await expect(panel(page)).toContainText('요구사항 지정됨');
      if (operation === 'link') {
        await panel(page).getByRole('button', { name: '요구사항 기록', exact: true }).click();
        await expect(panel(page)).toContainText('결정 미연결');
        await businessPanel(page, false); await uiCaret(page, 0, uiOrdinaryText, true);
        await page.keyboard.press('Meta+Shift+ArrowLeft'); await page.keyboard.insertText(uiDecisionText);
        await businessPanel(page, true); await uiCaret(page, 0, uiDecisionText);
        await panel(page).getByRole('button', { name: '연결할 결정 문단 지정', exact: true }).click();
        await expect(panel(page)).toContainText('결정 지정됨');
        await panel(page).getByLabel('연결할 요구사항 버전', { exact: true }).selectOption('1');
      }
      const baselineNative = await exported(page);
      const createdResponse = page!.waitForResponse(response => response.request().method() === 'POST' && /\/documents$/.test(new URL(response.url()).pathname));
      await save(page).click(); const created = await createdResponse; expect(created.status()).toBe(201);
      const doc = await created.json() as { document: { documentId: string } }, documentId = doc.document.documentId;
      await expect(status(page)).toHaveText('서버 저장 확인됨');
      const originalUrl = page.url(), root = `${origin}/api/v1/tenants/${fixture.tenantId}`;
      const baselineDb = await canonical(page, root, requests.bearer, documentId, baselineNative);
      const draftScope = { issuer: initialIdentity.issuer, subject: initialIdentity.subject, tenantId: fixture.tenantId, workspaceId: fixture.workspaceId };
      const originalRaw = await rawWordScope(page, draftScope); expect(originalRaw.length).toBeGreaterThan(0);
      const originalImmutable = originalRaw.filter(one => JSON.parse(one.raw).status === 'confirmed');
      expect(originalImmutable.length).toBeGreaterThan(0); evidence.rawScopeBefore = originalRaw;
      gate = await installPendingNativeGate(page, documentId);
      await uiCaret(page, operation === 'record' ? 1 : 0, operation === 'record' ? uiRequirementText : uiDecisionText);
      evidence.actualReceiver = await gate('snapshot'); checkpoint('actual-receiver-qualification');
      await expect.poll(async () => { evidence.actualReceiver = await gate!('snapshot'); checkpoint('actual-receiver-qualification'); return (evidence.actualReceiver as PendingGateSnapshot).observed; }).toBe(true);
      const observed = await gate('snapshot'); expect(observed.classMatches).toBe(true); expect(observed.documentId).toBe(documentId);
      evidence.actualReceiver = observed;
      await gate('arm');
      const actionName = operation === 'record' ? '요구사항 기록' : '결정 연결';
      await panel(page).getByRole('button', { name: actionName, exact: true }).click();
      await expect.poll(async () => (await gate!('snapshot')).entered).toBe(1);
      const before = await gate('snapshot'); evidence.beforeTransition = before; evidence.nativeBefore = baselineNative; evidence.databaseBefore = baselineDb;
      expect(before.history).toStrictEqual(observed.history);
      checkpoint('actual-pending-native-intent');
      let active = page;
      if (mutation === 'role') {
        await refreshPublicRole(page, 'viewer', fixture.tenantId);
        evidence.identityB = await verifyPublicIdentity(page, 'beta-viewer', fixture.tenantId, 'viewer');
        await refreshPublicRole(page, 'editor', fixture.tenantId);
        const returned = await verifyPublicIdentity(page, 'beta-viewer', fixture.tenantId, 'editor'); evidence.returnedIdentity = returned;
        expect(returned.currentUserId).toBe(initialIdentity.currentUserId); expect(returned.subject).toBe(initialIdentity.subject);
        expect(await exported(page)).toStrictEqual(baselineNative);
      } else {
        const other = await owned.context.newPage();
        await login(other, 'beta-viewer', originalUrl); await verifyPublicIdentity(other, 'beta-viewer', fixture.tenantId, 'editor');
        await publicLogout(other);
        await expect(page.getByText('다른 창에서 로그아웃했습니다. 다시 로그인해 주세요.', { exact: true })).toBeVisible();
        await login(other, 'alpha-editor', originalUrl);
        const changed = await verifyPublicIdentity(other, 'alpha-editor', fixture.tenantId, 'owner'); evidence.identityB = changed;
        expect(changed.currentUserId).not.toBe(initialIdentity.currentUserId); expect(changed.subject).not.toBe(initialIdentity.subject);
        expect(await exported(other)).toStrictEqual(baselineNative);
        await publicLogout(other); await login(other, 'beta-viewer', originalUrl);
        const returned = await verifyPublicIdentity(other, 'beta-viewer', fixture.tenantId, 'editor'); evidence.returnedIdentity = returned;
        expect(returned.currentUserId).toBe(initialIdentity.currentUserId); expect(returned.subject).toBe(initialIdentity.subject);
        expect(await exported(other)).toStrictEqual(baselineNative); active = other;
      }
      const beforeRelease = await gate('snapshot'); evidence.preRelease = beforeRelease;
      const preReleaseRaw = await rawWordScope(page, draftScope); evidence.rawScopePreRelease = preReleaseRaw;
      for (const row of originalRaw) expect(preReleaseRaw.find(one => one.key === row.key)).toStrictEqual(row);
      expect((await inspect(documentId)).document).toStrictEqual(baselineDb.document);
      expect((await inspect(documentId)).receiptCount).toBe(baselineDb.receiptCount);
      checkpoint('genuine-aba-before-release');
      await gate('release');
      if (mutation === 'role') await expect(panel(page).getByRole('alert')).toBeVisible();
      await expect.poll(async () => (await gate!('snapshot')).released).toBe(1);
      // Matching release witnesses this actual paused native phase, not alone the outer action.
      await expect.poll(async () => (await gate!('snapshot')).internalTree).toStrictEqual(beforeRelease.internalTree);
      const after = await gate('snapshot'); evidence.afterRelease = after;
      const afterRaw = await rawWordScope(page, draftScope); evidence.rawScopeAfterRelease = afterRaw;
      expect(afterRaw).toStrictEqual(preReleaseRaw);
      expect(after.history).toStrictEqual(beforeRelease.history); expect(after.selection).toStrictEqual(beforeRelease.selection);
      expect(await exported(active)).toStrictEqual(baselineNative);
      expect((await inspect(documentId)).document).toStrictEqual(baselineDb.document); expect((await inspect(documentId)).receiptCount).toBe(baselineDb.receiptCount);
      expect(requests.timeline.filter(one => typeof one.path === 'string' && /\/(?:execution|models|inference|confirmations|verifications)(?:\/|$)/.test(one.path))).toHaveLength(0);
      if (mutation === 'account') {
        await businessPanel(active, true); await uiCaret(active, operation === 'record' ? 1 : 0, operation === 'record' ? uiRequirementText : uiDecisionText);
        await panel(active).getByRole('button', { name: operation === 'record' ? '요구사항 문단 지정' : '연결할 결정 문단 지정', exact: true }).click();
        if (operation === 'link') await panel(active).getByLabel('연결할 요구사항 버전', { exact: true }).selectOption('1');
      }
      await panel(active).getByRole('button', { name: actionName, exact: true }).click();
      await expect(panel(active)).toContainText(operation === 'record' ? '결정 미연결' : 'supported_by');
      const fresh = await exported(active), freshPair = fresh.metadata!.wonfficeBusinessPair as Pair;
      expect(freshPair.lifecycle).toBe(operation === 'record' ? 'unlinked' : 'linked');
      expect(freshPair.items).toHaveLength(operation === 'record' ? 1 : 2); expect(freshPair.relations).toHaveLength(operation === 'record' ? 0 : 1);
      if (operation === 'link') expect(freshPair.items.find(one => one.kind === 'requirement')).toStrictEqual((baselineNative.metadata!.wonfficeBusinessPair as Pair).items[0]);
      const throughFresh = await gate('snapshot'); expect(throughFresh.entered).toBe(1); expect(throughFresh.released).toBe(1);
      if (mutation === 'account') { expect(throughFresh.internalTree).toStrictEqual(beforeRelease.internalTree); expect(throughFresh.history).toStrictEqual(beforeRelease.history); }
      expect((await inspect(documentId)).document).toStrictEqual(baselineDb.document); expect((await inspect(documentId)).receiptCount).toBe(baselineDb.receiptCount);
      const freshRaw = await rawWordScope(page, draftScope); evidence.rawScopeThroughFresh = freshRaw;
      for (const row of originalImmutable) expect(freshRaw.find(one => one.key === row.key)).toStrictEqual(row);
      evidence.freshControl = fresh; evidence.throughFreshControl = throughFresh;
      await gate('restore'); gate = undefined;
      evidence.status = 'passed'; checkpoint('stale-refused-fresh-explicit-control');
    } catch (error) {
      primary = error;
      try { if (page && !page.isClosed()) { evidence.failure = { phase: evidence.phase, pathname: new URL(page.url()).pathname,
        text: await page.locator('body').innerText() }; await page.screenshot({ path: info.outputPath('450-aba-failure.png') }); checkpoint(String(evidence.phase)); } }
      catch { evidence.observationUnavailable = true; }
      throw error;
    } finally {
      const cleanup: Array<{ name: string; ok: boolean; reason?: string }> = [];
      for (const [name, run] of [
        ['actual-owned-prototype', async () => { if (gate) await gate('restore'); }],
        ['membership-viewer', async () => { await privateControl({ action: 'beta-role', role: 'viewer' }); }],
        ['actual-owned-profile', async () => { if (owned) await stopPrivateProfile(owned.context, owned.pid); }],
      ] as const) {
        try { await run(); cleanup.push({ name, ok: true }); }
        catch (error) { cleanup.push({ name, ok: false, reason: error instanceof Error ? error.message : String(error) }); }
      }
      evidence.cleanup = cleanup; checkpoint(String(evidence.phase));
      if (!primary) expect(cleanup.every(one => one.ok)).toBe(true);
    }
  });
}
