import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createSampleDeck } from '../../../packages/office-slides/src/sample-deck';
import type { INode } from '../../../packages/datastore/src/types';
import { deckFileText } from '../../../packages/office-slides/src/deck-file';
import { privateControl, launchPrivateProfile, stopPrivateProfile, type RealStatus, type Inspection } from './helpers/real-recovery-control';

const origin = 'http://127.0.0.1:5191';
const workspace = (page: Page) => page.locator('[data-server-slides-workspace]');
const paragraphs = (page: Page) => workspace(page).locator('.sl-stage .w-paragraph');
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
  'Slides acceptance requires the protected synthetic OIDC fixture and disposable PostgreSQL supervisor.');

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
    await page.getByRole('button', { name: 'Slides 자료', exact: true }).click();
    await page.getByRole('button', { name: '새 Slides 만들기', exact: true }).click();
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
    const request = indexedDB.open('barocss-slides-workspace', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'name' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents'), result = tx.objectStore('documents').getAll();
      tx.oncomplete = () => { db.close(); resolve(result.result); };
      tx.onabort = () => reject(tx.error);
    };
  }));
}
async function seed(page: Page, title: string, withWidthVariables = false) {
  const name = randomUUID(), document = createSampleDeck();
  if (withWidthVariables) {
    const variables = document.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'variables')!;
    variables.content!.push(
      { stype: 'variable', attributes: { name: 'Title width', label: 'Title width', kind: 'number', value: '14400' } },
      { stype: 'variable', attributes: { name: 'Alternate width', label: 'Alternate width', kind: 'number', value: '12000' } }
    );
  }
  const surfaces = document.content!.filter((node): node is INode => typeof node !== 'string' && node.stype === 'surface');
  const resources = document.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'resources')!;
  surfaces[0].attributes = { ...surfaces[0].attributes, trackId: 'server-native-track' };
  surfaces[1].attributes = { ...surfaces[1].attributes, id: 'server-native-target' };
  surfaces[0].content!.push({ stype: 'rectangle', attributes: { name: 'server-native-jump', x: 0, y: 0, width: 100, height: 100, goTo: 'server-native-target' } });
  resources.content!.push({ stype: 'motionTrack', attributes: { id: 'server-native-track' }, content: [
    { stype: 'motionStep', attributes: { kind: 'build', effect: 'appear', target: 'server-native-jump' } }
  ] });
  const rectangle = randomUUID(), ellipse = randomUUID(), line = randomUUID();
  surfaces[0].content!.push(
    { stype: 'rectangle', attributes: { objectId: rectangle, name: 'attached-target', x: 1500, y: 8500, width: 3000, height: 1500 } },
    { stype: 'ellipse', attributes: { objectId: ellipse, name: 'attached-target', x: 9000, y: 9300, width: 3000, height: 1500 } },
    { stype: 'connector', attributes: { objectId: line, name: 'attached-line', startObjectId: rectangle, endObjectId: ellipse, startSide: 'e', endSide: 'w', kind: 'elbow', startX: 4500, startY: 9250, endX: 9000, endY: 10050 } },
    { stype: 'connector', attributes: { objectId: randomUUID(), name: 'attached-branch', startObjectId: rectangle, endObjectId: line, endT: 0.4, startSide: 's', kind: 'straight', startX: 3000, startY: 10000, endX: 7500, endY: 9500 } }
  );
  document.metadata = { originalOwner: 'synthetic-A', loadedAt: 'original-native-loadedAt' };
  const text = deckFileText(document, '2026-10-01T00:00:00.000Z');
  await page.evaluate(({ name, title, text }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('barocss-slides-workspace', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'name' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ name, title, text, count: 1, savedAt: 100,
        metadata: { favorite: true, purpose: 'Slides source-retention' } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  }), { name, title, text });
  return { name, title, text, document: JSON.parse(text).document as INode };
}
async function records(page: Page): Promise<Pending[]> {
  return page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.slides.pending.v1:'))
    .map(key => JSON.parse(localStorage.getItem(key)!)));
}
async function typeInput(page: Page, text: string) {
  const paragraph = paragraphs(page).filter({ hasText: 'One engine' }).first();
  await expect(paragraph).toBeVisible();
  const glyphPoint = () => paragraph.evaluate(node => {
    const frame = node.closest('.sl-text-frame')!.getBoundingClientRect();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let text: Node | null;
    while ((text = walker.nextNode())) {
      for (let offset = 0; offset < (text.textContent?.length ?? 0); offset++) {
        if (!/\S/.test(text.textContent![offset])) continue;
        const range = document.createRange(); range.setStart(text, offset); range.setEnd(text, offset + 1);
        const bounds = range.getBoundingClientRect(), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
        // Long text can paint outside its native frame. Enter at a visible glyph inside its actual hit box.
        if (x > frame.left && x < frame.right && y > frame.top && y < frame.bottom) return { x, y };
      }
    }
    throw new Error('Visible title glyph missing');
  });
  const point = await glyphPoint();
  // The native Slides overlay receives the gesture and admits text editing.
  // Point at the visible paragraph instead of demanding a hit on the element below it.
  await page.mouse.dblclick(point.x, point.y);
  await expect.poll(() => paragraph.evaluate(node => node.closest('[contenteditable]')?.getAttribute('contenteditable'))).toBe('true');
  const admission = await paragraph.evaluate(node => {
    const selection = getSelection(), active = document.activeElement;
    return { connected: node.isConnected, editable: node.closest('[contenteditable]')?.getAttribute('contenteditable'),
      active: active ? { tag: active.tagName, class: active.className, containsParagraph: active.contains(node) } : null,
      range: selection ? { type: selection.type, anchorConnected: selection.anchorNode?.isConnected,
        focusConnected: selection.focusNode?.isConnected, anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset,
        ownsAnchor: node.contains(selection.anchorNode), ownsFocus: node.contains(selection.focusNode) } : null };
  });
  await test.info().attach(`title-input-admission-${text.replace(/\W/g, '_')}.json`, {body:JSON.stringify(admission),contentType:'application/json'});
  await expect.poll(() => paragraph.evaluate(node => node.contains(getSelection()?.focusNode ?? null))).toBe(true);
  await page.keyboard.press('Meta+ArrowUp');
  await expect.poll(() => paragraph.evaluate(node => {
    const selection = getSelection();
    if (!selection?.focusNode || !node.contains(selection.focusNode)) return false;
    const prefix = document.createRange(); prefix.selectNodeContents(node); prefix.setEnd(selection.focusNode, selection.focusOffset);
    return selection.isCollapsed && prefix.toString().length === 0;
  })).toBe(true);
  await page.keyboard.insertText(text);
  await expect(paragraph).toContainText(text);
  await expect.poll(async () => (await records(page)).some(record => record.snapshotText.includes(text))).toBe(true);
  await expect(save(page)).toBeEnabled();
}
async function openServerLibrary(page: Page) {
  const library = workspace(page).getByRole('complementary', { name: '서버 Slides 목록', exact: true });
  if (await library.isVisible()) return;
  const trigger = workspace(page).getByRole('button', { name: '서버 Slides 목록', exact: true });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await expect(workspace(page).getByRole('complementary', { name: '서버 Slides 목록', exact: true })).toBeVisible();
}
async function prepare(page: Page, title: string) {
  await openServerLibrary(page);
  await workspace(page).getByRole('button', { name: '이 기기의 로컬 문서 목록 확인' }).click();
  await workspace(page).getByRole('button', { name: `${title} · 새 서버 사본 준비`, exact: true }).click();
  await expect(save(page)).toBeEnabled();
  return (await records(page)).find(record => record.status === 'pending')!;
}
function inspect(documentId?: string, key?: string, operation: 'create' | 'update' = 'update', actor: Alias = 'alpha-editor') {
  return privateControl<Inspection<'slides'>>({ action: 'inspect', product: 'slides', ...(documentId ? { documentId } : {}),
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
  expect(api.document.product).toBe('slides');
  expect(api.document.pageId).toBeNull();
  expect(api.document.revision).toBe(db.document!.revision);
  expect(api.document.tenantId).toBe(db.document!.tenantId);
  expect(api.document.workspaceId).toBe(db.document!.workspaceId);
  expect(api.document.metadataRevision).toBe(db.document!.metadataRevision);
  expect(hash(api.snapshotText)).toBe(db.document!.snapshotHash);
  expect(JSON.parse(api.snapshotText).document).toEqual(db.document!.canonicalTree);
  const surfaces = JSON.parse(api.snapshotText).document.content.filter((node: { stype: string }) => node.stype === 'surface');
  expect(surfaces.length).toBeGreaterThan(1);
  await expect(workspace(page).locator('.sl-filmstrip button[data-slide]')).toHaveCount(surfaces.length);
  await expect(workspace(page).locator('.sl-stage')).toContainText('One engine');
  return db;
}

// One serial schedule owns its profiles and all private service controls.
test('real Slides native copy, fixed loss recovery, durable restart and sequential writers', async () => {
  test.setTimeout(360_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!), evidenceFile = join(directory, 'slides-real-recovery.json');
  const profileA = mkdtempSync(join(directory, 'slides-a-')), profileB = mkdtempSync(join(directory, 'slides-b-'));
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
    await seed(page, 'Unrelated local Slides draft');
    const source = await seed(page, 'Real rich Slides copy'), originalRows = await rows(page);
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
    expect(requests.writes[0]!.body).toMatchObject({ product: 'slides', fileFormat: 'barocss-slides', fileVersion: JSON.parse(source.text).version,
      snapshotText: source.text, idempotencyKey: key });
    expect(requests.writes[0]!.body).not.toHaveProperty('importMode');
    await expect(workspace(page).locator('.sl-stage .sl-connector')).toHaveCount(2);
    const fixed = requests.writes[0]!.body;
    expect(await rows(page)).toEqual(originalRows);
    await page.reload();
    // An unconfirmed create has no verified document URL. Re-enter the same
    // authenticated Slides workspace before selecting its retained pending copy.
    await login(page, 'alpha-editor', page.url());
    await openServerLibrary(page);
    page.once('dialog', dialog => dialog.accept());
    await workspace(page).getByRole('button', { name: `저장된 Slides 초안 복구 · ${pending.savedAt}`, exact: true }).click();
    const createsBefore = requests.writes.length;
    await save(page).click();
    await expect(saved(page)).toHaveText('서버 저장 확인됨');
    expect(requests.writes).toHaveLength(createsBefore);
    const documentUrl = page.url();
    await canonical(page, root, requests.bearer, documentId, source.text);
    expect((await inspect(undefined, key, 'create')).receipt!.snapshotText).toBe(source.text);
    expect((await records(page)).find(record => record.attempt?.idempotencyKey === key)?.status).toBe('confirmed');
    // Navigating the presentation is personal state and must not create a shared write.
    const navigationWrites = requests.writes.length;
    await page.getByRole('button', { name: '슬라이드 탐색 펼치기', exact: true }).click();
    await workspace(page).locator('.sl-filmstrip button[data-slide]').nth(1).click();
    await expect(workspace(page).locator('.sl-filmstrip button[data-slide]').nth(1)).toHaveAttribute('data-current', 'true');
    await workspace(page).locator('.sl-filmstrip button[data-slide]').first().click();
    await expect(saved(page)).toHaveText('서버 저장 확인됨');
    expect(requests.writes).toHaveLength(navigationWrites);
    expect((await inspect(documentId)).document!.snapshotText).toBe(source.text);
    for (const loss of ['before', 'after'] as const) {
      await typeInput(page, ` Slides-${loss}-input`);
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
      await openServerLibrary(page);
      await workspace(page).getByRole('button', { name: `저장된 Slides 초안 복구 · ${recovery.savedAt}`, exact: true }).click();
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
    await openServerLibrary(page);
    page.once('dialog', dialog => dialog.accept());
    await workspace(page).getByRole('button', { name: `저장된 Slides 초안 복구 · ${latest.savedAt}`, exact: true }).click();
    await expect(workspace(page)).toContainText('latest-input-before-process-restart');
    expect((await records(page)).find(record => record.draftId === latest.draftId)?.snapshotText).toBe(latest.snapshotText);
    await expect(workspace(page).locator('.sl-stage .sl-connector')).toHaveCount(2);
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
    for (const type of ['resources', 'docMeta', 'group', 'bTable']) {
      expect(findNative(source.document, type).length).toBeGreaterThan(0);
      expect(findNative(restored.document!.canonicalTree, type)).toEqual(findNative(source.document, type));
    }
    expect(findNative(restored.document!.canonicalTree, 'surface').map(node => (node as INode).attributes)).toEqual(
      findNative(source.document, 'surface').map(node => (node as INode).attributes));
    expect((restored.document!.canonicalTree as INode).metadata).toEqual(source.document.metadata);
    expect(restored.databaseIdentity).toBe(status.databaseIdentity);
    expect(restored.document!.revision).toBe(dbBefore.document!.revision + 1);
    expect(await rows(page)).toEqual(originalRows);
    b = await launchPrivateProfile(profileB);
    const other = await b.context.newPage(), otherRequests = track(other);
    await login(other, 'beta-viewer', documentUrl);
    await expect(save(other)).toHaveCount(0);
    const viewerParagraph = paragraphs(other).filter({ hasText: 'One engine' }).first();
    const viewerText = await viewerParagraph.textContent();
    await viewerParagraph.click(); await other.keyboard.type('viewer-forbidden-input');
    await expect(viewerParagraph).toHaveText(viewerText!);
    await expect(workspace(other).locator('[contenteditable=true]')).toHaveCount(0);
    const denied = await other.request.put(`${root}/documents/${documentId}/snapshot`, { headers: { Authorization: otherRequests.bearer },
      data: { expectedRevision: restored.document!.revision, snapshotText: restored.document!.snapshotText, idempotencyKey: 'slides-viewer-denied' } });
    expect(denied.status()).toBe(403);
    expect((await inspect(documentId, 'slides-viewer-denied', 'update', 'beta-viewer')).receipt).toBeNull();
    expect((await inspect(documentId)).document).toEqual(restored.document);
    await privateControl({ action: 'beta-role', role: 'editor' });
    await other.reload();
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

test('same physical profile preserves Slides source and A recovery across actual B login', async () => {
  test.setTimeout(180_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!), evidenceFile = join(directory, 'slides-real-account.json');
  const profile = mkdtempSync(join(directory, 'slides-account-'));
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
    const source = await seed(page, 'Account retained rich Slides'), originals = await rows(page);
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
    await expect(workspace(page).getByRole('button', { name: /^저장된 Slides 초안 복구/ })).toHaveCount(0);
    await expect(workspace(page).locator('[data-confirmed-local-copy]')).toHaveCount(0);
    await expect(save(page)).toHaveCount(0);
    // Residue remains physically readable. Scope checks are not physical storage encryption.
    expect(await records(page)).toEqual(retained);
    expect(await rows(page)).toEqual(originals);
    expect(requests.writes).toHaveLength(writesBeforeB);
    expect((await inspect(documentId)).document).toEqual(before.document);
    await logout(page);
    await login(page, 'alpha-editor', documentUrl);
    await openServerLibrary(page);
    page.once('dialog', dialog => dialog.accept());
    await workspace(page).getByRole('button', { name: `저장된 Slides 초안 복구 · ${pendingA.savedAt}`, exact: true }).click();
    await expect(workspace(page)).toContainText('A-private-recovery-input');
    expect((await records(page)).find(record => record.draftId === pendingA.draftId)?.attempt).toEqual(pendingA.attempt);
    await save(page).click(); await expect(saved(page)).toHaveText('서버 저장 확인됨');
    const result = await canonical(page, root, requests.bearer, documentId, pendingA.snapshotText);
    expect(result.document!.revision).toBe(before.document!.revision + 1);
    expect(requests.writes.at(-1)!.body.idempotencyKey).toBe(pendingA.attempt!.idempotencyKey);
    expect(await rows(page)).toEqual(originals);
    evidence.push({ kind: 'same-profile-A-B-A', sourceHash: hash(source.text), pendingHash: hash(pendingA.snapshotText),
      documentId, revision: result.document!.revision, physicallyReadableOriginalAndDraftUnderB: true,
      originalLocation: 'IndexedDB barocss-slides-workspace/documents', recoveryLocation: 'localStorage wonffice.slides.pending.v1' });
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

test('real Slides v1 head upgrades without changing document identity or its frozen receipt', async () => {
  test.setTimeout(120_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const profile = mkdtempSync(join(directory, 'slides-v1-'));
  let browser: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let passed = false;
  const evidence: Record<string, unknown> = {};
  try {
    const status = await privateControl<RealStatus>({ action: 'status' });
    const root = `${origin}/api/v1/tenants/${status.tenantId}`;
    browser = await launchPrivateProfile(profile);
    const page = await browser.context.newPage(), requests = track(page);
    await login(page, 'alpha-editor');
    const text = JSON.stringify({ format: 'barocss-slides', version: 1, document: createSampleDeck() });
    const key = `legacy-${randomUUID()}`;
    const created = await page.request.post(`${root}/documents`, { headers: { Authorization: requests.bearer },
      data: { workspaceId: status.workspaceId, product: 'slides', title: 'Existing v1 Slides',
        fileFormat: 'barocss-slides', fileVersion: 1, snapshotText: text, idempotencyKey: key } });
    expect(created.status()).toBe(201);
    const original = await created.json();
    expect(original.document.fileVersion).toBe(1);
    const documentId = original.document.documentId;
    await login(page, 'alpha-editor', `${origin}/?tenant=${status.tenantId}&workspace=${status.workspaceId}&document=${documentId}&product=slides`);
    await typeInput(page, 'explicit-v2-upgrade-input');
    await save(page).click();
    await expect(saved(page)).toHaveText('서버 저장 확인됨');
    const updated = await page.request.get(`${root}/documents/${documentId}`, { headers: { Authorization: requests.bearer } });
    const now = await updated.json();
    expect(now.document).toMatchObject({ documentId, fileVersion: 2, revision: 2 });
    expect(now.snapshotText).toContain('explicit-v2-upgrade-input');
    const oldReceipt = await page.request.get(`${root}/receipts/create/${key}`, { headers: { Authorization: requests.bearer } });
    expect(await oldReceipt.json()).toEqual(original);
    const downgrade = await page.request.put(`${root}/documents/${documentId}/snapshot`, {
      headers: { Authorization: requests.bearer }, data: { expectedRevision: 2, snapshotText: text, idempotencyKey: `down-${randomUUID()}` } });
    expect(downgrade.status()).toBe(422);
    await page.reload();
    await expect(workspace(page)).toContainText('explicit-v2-upgrade-input');
    const db = await canonical(page, root, requests.bearer, documentId, now.snapshotText);
    expect(db.document!.revision).toBe(2);
    Object.assign(evidence, { documentId, originalHash: hash(text), upgradedHash: hash(now.snapshotText),
      originalVersion: 1, upgradedVersion: 2, revision: 2, oldReceiptUnchanged: true, downgradeRefused: true });
    passed = true;
  } finally {
    let cleanup = true;
    if (browser) {
      try { await stopPrivateProfile(browser.context, browser.pid); rmSync(profile, { recursive: true, force: true }); }
      catch { cleanup = false; }
    }
    writeFileSync(join(directory, 'slides-real-version-upgrade.json'), JSON.stringify({ status: passed && cleanup ? 'passed' : 'incomplete', evidence, cleanup }, null, 2), { mode: 0o600 });
    expect(cleanup).toBe(true);
  }
});

test('real Canvas editing persists the same native deck and preserves current viewer authority', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const status = await privateControl<RealStatus>({ action: 'status' });
  const root = `${origin}/api/v1/tenants/${status.tenantId}`, requests = track(page);
  const otherContext = await browser.newContext();
  try {
    await login(page, 'alpha-editor');
    const source = await seed(page, 'Canvas native source'), originalRows = await rows(page);
    const pending = await prepare(page, source.title);
    await save(page).click(); await expect(saved(page)).toHaveText('서버 저장 확인됨');
    const created = await inspect(undefined, pending.attempt!.idempotencyKey, 'create');
    const documentId = created.receipt!.documentId;
    await canonical(page, root, requests.bearer, documentId, source.text);
    const library = workspace(page).getByRole('button', { name: '서버 Slides 목록', exact: true });
    if (await library.getAttribute('aria-expanded') === 'true') await library.click();
    await workspace(page).getByRole('button', { name: '멀티 슬라이드 보기', exact: true }).click();
    await expect(workspace(page).locator('.sl-stage')).toHaveAttribute('data-freeboard', 'true');
    await typeInput(page, ' Canvas authenticated first '); await page.keyboard.press('Escape');
    const second = paragraphs(page).filter({ hasText: 'What the second product cost' }).first();
    const frame = second.locator('xpath=ancestor::*[contains(@class, "sl-text-frame")]').first();
    const bounds = (await frame.boundingBox())!;
    await page.mouse.dblclick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.keyboard.press('End'); await page.keyboard.insertText(' Canvas authenticated second');
    await expect(second).toContainText('Canvas authenticated second'); await page.keyboard.press('Escape');
    await save(page).click(); await expect(saved(page)).toHaveText('서버 저장 확인됨');
    const expected = requests.writes.at(-1)!.body.snapshotText as string;
    expect(expected).toContain('Canvas authenticated first'); expect(expected).toContain('Canvas authenticated second');
    const confirmed = await canonical(page, root, requests.bearer, documentId, expected);
    expect(await rows(page)).toEqual(originalRows);
    const url = page.url();
    await page.reload(); await expect(workspace(page)).toBeVisible();
    await workspace(page).getByRole('button', { name: '멀티 슬라이드 보기', exact: true }).click();
    await expect(paragraphs(page).filter({ hasText: 'Canvas authenticated second' })).toBeVisible();
    await canonical(page, root, requests.bearer, documentId, expected);

    const other = await otherContext.newPage(), viewerRequests = track(other);
    await login(other, 'beta-viewer', url);
    await workspace(other).getByRole('button', { name: '멀티 슬라이드 보기', exact: true }).click();
    await expect(workspace(other).locator('.sl-stage')).toHaveAttribute('data-freeboard', 'true');
    await expect(workspace(other).locator('[contenteditable=true]')).toHaveCount(0);
    const paragraph = paragraphs(other).filter({ hasText: 'Canvas authenticated second' }).first(), text = await paragraph.textContent();
    await paragraph.dblclick(); await other.keyboard.type('viewer-denied');
    await expect(paragraph).toHaveText(text!);
    const label = workspace(other).locator('[data-board-label]').first(), before = (await label.boundingBox())!;
    await other.mouse.move(before.x + 8, before.y + 8); await other.mouse.down();
    await other.mouse.move(before.x + 60, before.y + 30, { steps: 4 });
    expect(await label.boundingBox()).toEqual(before); await other.mouse.up();
    expect(viewerRequests.writes).toHaveLength(0);
    await privateControl({ action: 'beta-active', active: false });
    await other.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(workspace(other)).not.toBeVisible();
    expect((await inspect(documentId)).document).toEqual(confirmed.document);
    await page.screenshot({ path: test.info().outputPath('authenticated-canvas.png') });
  } finally {
    await privateControl({ action: 'beta-active', active: true });
    await otherContext.close();
  }
});

test('real selected-object tools and inline property binding persist exact native bytes and retire a revoked picker', async ({ browser: _browser }, info) => {
  test.setTimeout(180_000);
  const status = await privateControl<RealStatus>({ action: 'status' });
  const root = `${origin}/api/v1/tenants/${status.tenantId}`;
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const profileA = mkdtempSync(join(directory, 'selected-writer-'));
  const profileB = mkdtempSync(join(directory, 'selected-reader-'));
  let a: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let b: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let passed = false;
  const evidence: Record<string, unknown> = { databaseIdentity: status.databaseIdentity };
  const children = (node: INode): INode[] => node.content!.filter((child): child is INode => typeof child !== 'string');
  const titleOf = (document: INode) => children(children(document).find(node => node.stype === 'surface')!).find(node => node.stype === 'textFrame' && node.attributes?.role === 'title')!;
  const exported = async (page: Page, name: string): Promise<INode> => {
    const [download] = await Promise.all([page.waitForEvent('download'), workspace(page).getByRole('button', { name: 'Slides 파일 내보내기', exact: true }).click()]);
    const path = info.outputPath(name); await download.saveAs(path);
    return JSON.parse(readFileSync(path, 'utf8')).document as INode;
  };
  const selectTitle = async (page: Page) => {
    const paragraph = paragraphs(page).filter({ hasText: 'One engine' }).first();
    const frame = paragraph.locator('xpath=ancestor::*[contains(@class, "sl-text-frame")]').first();
    const bounds = (await frame.boundingBox())!;
    await page.mouse.click(bounds.x + 8, bounds.y + 8);
  };
  const hideLibrary = async (page: Page) => {
    const trigger = workspace(page).getByRole('button', { name: '서버 Slides 목록', exact: true });
    if (await trigger.getAttribute('aria-expanded') === 'true') await trigger.click();
  };
  try {
    a = await launchPrivateProfile(profileA); b = await launchPrivateProfile(profileB);
    const writer = await a.context.newPage(), requests = track(writer);
    await login(writer, 'alpha-editor');
    const source = await seed(writer, 'Authenticated compact selection tools', true), originalRows = await rows(writer);
    const pending = await prepare(writer, source.title);
    await save(writer).click(); await expect(saved(writer)).toHaveText('서버 저장 확인됨');
    const created = await inspect(undefined, pending.attempt!.idempotencyKey, 'create');
    const documentId = created.receipt!.documentId, url = writer.url();
    await canonical(writer, root, requests.bearer, documentId, source.text);
    expect(await exported(writer, 'selected-initial.slides.json')).toEqual(source.document);
    await hideLibrary(writer); await selectTitle(writer);
    const tools = workspace(writer).locator('[data-slides-formatting]:visible');
    for (const label of ['굵게', '기울임', '밑줄', '취소선']) await expect(tools.getByRole('button', { name: label, exact: true })).toBeEnabled();
    await expect(tools.getByRole('button', { name: '굵게', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const geometry = (await tools.boundingBox())!;
    expect(geometry.width).toBeLessThanOrEqual(480); expect(geometry.height).toBeLessThanOrEqual(48);
    const expected = structuredClone(source.document), title = titleOf(expected), paragraph = children(title)[0], run = children(paragraph)[0];
    for (const label of ['굵게', '기울임', '밑줄', '취소선']) await tools.getByRole('button', { name: label, exact: true }).click();
    paragraph.attributes = { ...paragraph.attributes, bold: false };
    run.marks = ['italic', 'underline', 'strikethrough'].map(stype => ({ stype, range: [0, run.text!.length] }));
    await tools.getByRole('combobox', { name: 'Font', exact: true }).click();
    await writer.getByRole('option', { name: 'Georgia', exact: true }).click();
    run.marks.push({ stype: 'fontFamily', range: [0, run.text!.length], attrs: { family: 'Georgia' } });
    await tools.getByRole('combobox', { name: 'Size', exact: true }).click();
    await writer.getByRole('option', { name: '18', exact: true }).click();
    run.marks.push({ stype: 'fontSize', range: [0, run.text!.length], attrs: { size: 36 } });
    const renderedSize = workspace(writer).locator('.sl-stage .mark-fontSize').first();
    await expect.poll(() => renderedSize.evaluate(element => getComputedStyle(element).fontSize)).toBe('24px');
    expect(await renderedSize.evaluate(element => getComputedStyle(element).fontFamily)).toContain('Georgia');
    await writer.screenshot({ path: info.outputPath('authenticated-object-fonts.png') });
    expect(await exported(writer, 'selected-formatted.slides.json')).toEqual(expected);
    await selectTitle(writer);
    await tools.getByRole('button', { name: '선택 속성 열기', exact: true }).click();
    const panel = workspace(writer).locator('.sl-properties');
    await panel.getByRole('button', { name: '너비 변수 연결', exact: true }).click();
    const picker = panel.getByRole('dialog', { name: '너비 변수 선택', exact: true });
    await picker.getByRole('textbox', { name: '너비 변수 검색', exact: true }).fill('Title width');
    await picker.getByRole('button', { name: 'Title width 14400', exact: true }).click();
    await expect(picker).toHaveCount(0);
    title.attributes = { ...title.attributes, width: 14400, varBinds: [{ attr: 'width', var: 'Title width' }] };
    await writer.screenshot({ path: info.outputPath('authenticated-inline-variable.png') });
    expect(await exported(writer, 'selected-bound.slides.json')).toEqual(expected);
    await save(writer).click(); await expect(saved(writer)).toHaveText('서버 저장 확인됨');
    const wire = requests.writes.at(-1)!.body.snapshotText as string;
    expect(JSON.parse(wire).document).toEqual(expected);
    const confirmed = await canonical(writer, root, requests.bearer, documentId, wire);
    expect(await rows(writer)).toEqual(originalRows);
    await writer.reload(); await expect(workspace(writer)).toBeVisible();
    expect(await exported(writer, 'selected-reopened.slides.json')).toEqual(expected);
    await canonical(writer, root, requests.bearer, documentId, wire);

    const reader = await b.context.newPage(), readerRequests = track(reader);
    await login(reader, 'beta-viewer', url); await hideLibrary(reader);
    await selectTitle(reader); await reader.keyboard.type('viewer-forbidden-object-edit');
    await expect(workspace(reader).locator('[contenteditable=true]')).toHaveCount(0);
    await expect(workspace(reader).locator('[data-slides-formatting]')).toHaveCount(0);
    await expect(save(reader)).toHaveCount(0);
    expect(await exported(reader, 'selected-viewer.slides.json')).toEqual(expected);
    const deniedKey = `selected-viewer-${randomUUID()}`;
    const denied = await reader.request.put(`${root}/documents/${documentId}/snapshot`, { headers: { Authorization: readerRequests.bearer },
      data: { expectedRevision: confirmed.document!.revision, snapshotText: wire, idempotencyKey: deniedKey } });
    expect(denied.status()).toBe(403);
    expect((await inspect(documentId, deniedKey, 'update', 'beta-viewer')).receipt).toBeNull();

    await privateControl({ action: 'beta-role', role: 'editor' });
    await reader.reload(); await expect(save(reader)).toBeVisible(); await hideLibrary(reader); await selectTitle(reader);
    await workspace(reader).locator('[data-slides-formatting]:visible').getByRole('button', { name: '선택 속성 열기', exact: true }).click();
    const readerPanel = workspace(reader).locator('.sl-properties');
    await readerPanel.getByRole('button', { name: '너비 변수 연결', exact: true }).click();
    const pendingPicker = readerPanel.getByRole('dialog', { name: '너비 변수 선택', exact: true });
    await expect(pendingPicker.getByRole('button', { name: 'Alternate width 12000', exact: true })).toBeVisible();
    const staleOption = await pendingPicker.getByRole('button', { name: 'Alternate width 12000', exact: true }).elementHandle();
    const beforeRevocation = await inspect(documentId), writesBefore = readerRequests.writes.length, draftsBefore = await records(reader);
    await privateControl({ action: 'beta-role', role: 'viewer' });
    await reader.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(save(reader)).toHaveCount(0); await expect(pendingPicker).toHaveCount(0);
    await staleOption!.evaluate(element => (element as HTMLButtonElement).click());
    expect(await records(reader)).toEqual(draftsBefore);
    expect(readerRequests.writes).toHaveLength(writesBefore);
    expect(await exported(reader, 'selected-revoked.slides.json')).toEqual(expected);
    const revokedKey = `selected-revoked-${randomUUID()}`;
    const revoked = await reader.request.put(`${root}/documents/${documentId}/snapshot`, { headers: { Authorization: readerRequests.bearer },
      data: { expectedRevision: confirmed.document!.revision, snapshotText: wire, idempotencyKey: revokedKey } });
    expect(revoked.status()).toBe(403);
    expect((await inspect(documentId, revokedKey, 'update', 'beta-viewer')).receipt).toBeNull();
    expect((await inspect(documentId)).document).toEqual(beforeRevocation.document);
    await staleOption!.dispose();
    Object.assign(evidence, { documentId, sourceHash: hash(source.text), savedWireHash: hash(wire), revision: confirmed.document!.revision,
      initialViewerDenied: true, revokedPendingPickerDenied: true });
    await writer.screenshot({ path: info.outputPath('authenticated-selection-tools.png') });
    passed = true;
  } finally {
    const restored = await Promise.allSettled([privateControl({ action: 'beta-active', active: true }), privateControl({ action: 'beta-role', role: 'viewer' })]);
    const closed = await Promise.allSettled([a, b].flatMap(profile => profile ? [stopPrivateProfile(profile.context, profile.pid)] : []));
    const cleanup = restored.concat(closed).every(result => result.status === 'fulfilled');
    if (cleanup) for (const path of [profileA, profileB]) rmSync(path, { recursive: true, force: true });
    writeFileSync(join(directory, 'selected-object-evidence.json'), JSON.stringify({ status: passed && cleanup ? 'passed' : 'incomplete', cleanup, evidence }, null, 2), { mode: 0o600 });
    expect(cleanup).toBe(true);
  }
});
