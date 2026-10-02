import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createSampleDocument } from '../../../packages/office-word/src/sample-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';
import { createSampleDeck } from '../../../packages/office-slides/src/sample-deck';
import { deckFileText } from '../../../packages/office-slides/src/deck-file';
import type { INode } from '../../../packages/datastore/src/types';
import { privateControl, launchPrivateProfile, stopPrivateProfile, type RealStatus, type Inspection } from './helpers/real-recovery-control';

const origin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const word = (page: Page) => page.locator('[data-server-word-workspace]');
const slides = (page: Page) => page.locator('[data-server-slides-workspace]');
const feedback = (page: Page) => page.getByRole('complementary', { name: '프로젝트 의견', exact: true });
const paragraph = (page: Page) => word(page).locator('.w-paragraph').filter({ hasText: 'This paragraph takes its font' }).first();
const opinion = '앱이 켜져 있을 때의 조치도 안내하고, 교육자료에도 반영해줘.';
const projectTitle = 'Windows 베타 공개 · 내부 합성 검증';
const guideTitle = '고객 설치 안내';
const trainingTitle = '팀 교육자료';
interface Pin { id: string; document: { product: string; id: string }; revision: number; text: string; title: string }
interface ProjectView {
  tenantId: string; workspaceId: string; actor: { kind: string; id: string };
  project: { revision: number; record: { id: string; title: string; goal: string;
    results: Array<{ id: string; name: string; document: { product: string; id: string }; inputs: Pin[] }>;
    comments: Array<{ id: string; body: string; target: { kind: string; id: string; quote: string }; pin: Pin; actor: { kind: string; id: string }; workId?: string }>;
    works: Array<{ id: string; commentId: string; state: string; request: string; inputs: Pin[]; outputs: string[] }>;
    drafts: Record<string, string> } };
}
interface OpenDocument { document: { documentId: string; revision: number; snapshotHash: string }; snapshotText: string }

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
// This acceptance cannot become a skipped green when protected local prerequisites are absent.
test.beforeAll(() => {
  if (!process.env.OFFICE_AUTH_REAL_FILE || !process.env.OFFICE_AUTH_CONTROL_FILE) throw new Error('Protected real OIDC fixture and disposable PostgreSQL supervisor are required.');
});
async function login(page: Page, alias: 'alpha-editor' | 'beta-viewer', url = origin) {
  await page.goto(url);
  await expect.poll(async () => await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible() ||
    await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await page.locator('.ow-project-home').isVisible()).toBe(true);
  const enter = page.getByRole('button', { name: '일반 사용자로 들어가기' });
  if (await enter.isVisible()) {
    await enter.click();
    const username = page.locator('#username');
    if (await username.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)) {
      const fixture = JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8')) as { users: Record<string, { username?: string; password: string }> };
      const account = fixture.users[alias]!;
      await username.fill(account.username ?? alias); await page.locator('#password').fill(account.password); await page.locator('#kc-login').click();
    }
  }
  await expect.poll(async () => await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await page.locator('.ow-project-home').isVisible()).toBe(true);
  if (!(await page.locator('.ow-project-home').isVisible())) {
    await page.getByRole('button', { name: /Synthetic Alpha/ }).click();
    await page.getByRole('button', { name: 'Alpha workspace', exact: true }).click();
  }
  await expect(page.locator('.ow-project-home')).toBeVisible();
}
function track(page: Page) {
  const started = Date.now();
  const state = { bearer: '', phase: 'entry', projectWrites: [] as Array<Record<string, unknown>>, timeline: [] as Array<Record<string, unknown>> };
  page.on('request', request => {
    if (request.headers().authorization) state.bearer = request.headers().authorization;
    const path = new URL(request.url()).pathname;
    if (request.method() === 'PATCH' && /\/projects\/[0-9a-f-]+$/.test(path)) state.projectWrites.push(request.postDataJSON());
    if (!path.startsWith('/api/v1/')) return;
    const body = ['POST', 'PUT', 'PATCH'].includes(request.method()) ? request.postDataJSON() as Record<string, unknown> | null : null;
    const action = body?.action as { type?: string } | undefined;
    state.timeline.push({ atMs: Date.now() - started, kind: 'request', phase: state.phase, method: request.method(), path,
      ...(action?.type ? { action: action.type } : {}), ...(typeof body?.expectedRevision === 'number' ? { expectedRevision: body.expectedRevision } : {}),
      ...(typeof body?.snapshotText === 'string' ? { snapshotHash: hash(body.snapshotText), snapshotBytes: Buffer.byteLength(body.snapshotText) } : {}) });
  });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/api/v1/')) state.timeline.push({ atMs: Date.now() - started, kind: 'response', phase: state.phase,
      method: response.request().method(), path, status: response.status() });
  });
  return state;
}
async function notePhase(page: Page, state: ReturnType<typeof track>, phase: string) {
  state.phase = phase;
  const selected = await page.evaluate(() => getSelection()?.toString() ?? '');
  state.timeline.push({ kind: 'ui', phase, saveStatus: await page.locator('[data-save-status]').allTextContents(),
    selectionLength: selected.length, selectionHash: hash(selected),
    nativeEditable: await paragraph(page).count() ? await paragraph(page).evaluate(node => node.closest('[contenteditable]')?.getAttribute('contenteditable')) : null });
}

async function seedNative(page: Page, product: 'word' | 'slides', title: string) {
  const document = product === 'word' ? createSampleDocument() : createSampleDeck();
  const meta = document.content?.find((node): node is INode => typeof node !== 'string' && node.stype === 'docMeta');
  const titleNode = meta?.content?.find((node): node is INode => typeof node !== 'string' && node.stype === 'docTitle');
  if (titleNode) titleNode.content = [{ stype: 'inline-text', text: title }];
  document.metadata = { originalOwner: 'synthetic-connected-work', loadedAt: 'original-native-load' };
  const text = product === 'word' ? wordFileText(document, '2026-10-03T00:00:00.000Z') : deckFileText(document, '2026-10-03T00:00:00.000Z');
  const name = randomUUID();
  await page.evaluate(({ product, name, title, text }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(product === 'word' ? 'barocss-word' : 'barocss-slides-workspace', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'name' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ name, title, text, count: 1, savedAt: 100, metadata: { favorite: true, purpose: 'connected-work synthetic source' } });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    };
  }), { product, name, title, text });
  return { name, text };
}
async function importThroughExistingLibrary(page: Page, product: 'word' | 'slides', title: string) {
  await page.getByRole('button', { name: '자료함', exact: true }).click();
  await page.getByRole('button', { name: `${product === 'word' ? 'Word' : 'Slides'} 자료`, exact: true }).click();
  await page.getByRole('button', { name: `새 ${product === 'word' ? 'Word' : 'Slides'} 만들기`, exact: true }).click();
  const shell = product === 'word' ? word(page) : slides(page);
  await expect(shell).toBeVisible();
  const seeded = await seedNative(page, product, title);
  if (product === 'slides') {
    const nav = shell.getByRole('complementary', { name: '서버 Slides 목록', exact: true });
    if (!(await nav.isVisible())) await shell.getByRole('button', { name: '서버 Slides 목록', exact: true }).click();
  }
  await shell.getByRole('button', { name: '이 기기의 로컬 문서 목록 확인' }).click();
  await shell.getByRole('button', { name: `${title} · 새 서버 사본 준비`, exact: true }).click();
  const response = page.waitForResponse(response => response.request().method() === 'POST' && /\/documents$/.test(new URL(response.url()).pathname));
  await shell.getByRole('button', { name: /^(저장|저장 확인·재시도)$/ }).click();
  const saved = await response; expect(saved.status()).toBe(201);
  const raw = await saved.json() as { document: { documentId: string }; snapshotText: string };
  expect(raw.snapshotText).toBe(seeded.text);
  await expect(shell.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  return { id: raw.document.documentId, source: seeded };
}
async function linkResult(page: Page, name: string) {
  await page.getByRole('button', { name: '결과물 연결', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '결과물 연결', exact: true });
  await dialog.getByRole('textbox', { name: '결과물 이름', exact: true }).fill(name);
  await dialog.getByRole('button', { name: '연결할 원본', exact: true }).click();
  await page.getByRole('option').filter({ hasText: name }).click();
  await dialog.getByRole('button', { name: '연결하기', exact: true }).click();
  await expect(dialog).toBeHidden();
}
async function selectGuide(page: Page) {
  const p = paragraph(page); await expect(p).toBeVisible();
  await expect.poll(() => p.evaluate(node => node.closest('[contenteditable]')?.getAttribute('contenteditable'))).toBe('true');
  await p.scrollIntoViewIfNeeded(); const bounds = await p.boundingBox(); expect(bounds).not.toBeNull();
  await p.click({ position: { x: 8, y: Math.min(10, bounds!.height / 2) } }); await page.keyboard.press('Home');
  await page.keyboard.down('Shift'); for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('This');
}
function expectOnlyRecordedOpinion(before: INode, after: INode, threadId: string) {
  // Build the only allowed native delta on the original tree. Never normalize the saved document.
  const expected = structuredClone(before), targets: INode[] = [], threads: INode[] = [];
  const visit = (node: INode, inspect: (node: INode) => void) => {
    inspect(node); for (const child of node.content ?? []) if (typeof child !== 'string') visit(child, inspect);
  };
  visit(expected, node => { if (node.stype === 'inline-text' && node.text === 'This paragraph takes its font from ') targets.push(node); });
  visit(after, node => { if (node.stype === 'commentThread' && node.attributes?.id === threadId) threads.push(node); });
  expect(targets).toHaveLength(1); expect(threads).toHaveLength(1);
  const entries = threads[0].content ?? []; expect(entries).toHaveLength(1);
  const entry = entries[0] as INode;
  expect(entry.attributes?.author).toEqual(expect.any(String)); expect(String(entry.attributes?.author).length).toBeGreaterThan(0);
  expect(Number.isNaN(Date.parse(String(entry.attributes?.date)))).toBe(false);
  const resources = expected.content?.filter((node): node is INode => typeof node !== 'string' && node.stype === 'resources') ?? [];
  expect(resources).toHaveLength(1);
  targets[0].marks = [...(targets[0].marks ?? []), { stype: 'commentRef', range: [0, 4], attrs: { id: threadId } }];
  resources[0].content = [...(resources[0].content ?? []), { stype: 'commentThread', attributes: { id: threadId, resolved: false },
    content: [{ stype: 'paragraph', attributes: { author: entry.attributes!.author, date: entry.attributes!.date }, content: [{ stype: 'inline-text', text: opinion }] }] }];
  expect(after).toEqual(expected);
}

test('real Windows beta project preserves originals, recorded opinions, exact pins and current authority', async () => {
  test.setTimeout(360_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!), evidenceFile = join(directory, 'connected-project-evidence.json');
  const profileA = mkdtempSync(join(directory, 'project-editor-')), profileB = mkdtempSync(join(directory, 'project-viewer-'));
  let a: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined, b: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let passed = false, roleChanged = false;
  let diagnosticTrack: ReturnType<typeof track> | undefined;
  writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete' }), { mode: 0o600 });
  const evidence: Record<string, unknown> = {};
  try {
    const status = await privateControl<RealStatus>({ action: 'status' });
    const tenantRoot = `${origin}/api/v1/tenants/${status.tenantId}`;
    a = await launchPrivateProfile(profileA); const page = await a.context.newPage(), requests = track(page); diagnosticTrack = requests;
    await login(page, 'alpha-editor');
    await expect(page.getByRole('heading', { name: '프로젝트', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '프로젝트 만들기', exact: true }).click();
    const creating = page.getByRole('dialog', { name: '프로젝트 만들기', exact: true });
    await creating.getByRole('textbox', { name: '프로젝트 이름', exact: true }).fill(projectTitle);
    await creating.getByRole('textbox', { name: '프로젝트 목표', exact: true }).fill('고객 설치 안내와 팀 교육자료에 실행 중인 앱의 조치를 반영한다.');
    const createResponse = page.waitForResponse(response => response.request().method() === 'POST' && /\/projects$/.test(new URL(response.url()).pathname));
    await creating.getByRole('button', { name: '만들기', exact: true }).click();
    const created = await (await createResponse).json() as ProjectView, projectId = created.project.record.id;
    const projectUrl = `${origin}/?${new URLSearchParams({ tenant: status.tenantId, workspace: status.workspaceId, project: projectId })}`;
    const projectApi = `${tenantRoot}/projects/${projectId}`;
    const readProject = async () => {
      const response = await page.request.get(projectApi, { headers: { Authorization: requests.bearer } }); expect(response.status()).toBe(200);
      return response.json() as Promise<ProjectView>;
    };
    const readDocument = async (id: string, product: 'word' | 'slides') => {
      const response = await page.request.get(`${tenantRoot}/documents/${id}`, { headers: { Authorization: requests.bearer } }); expect(response.status()).toBe(200);
      const opened = await response.json() as OpenDocument;
      const stored = await privateControl<Inspection<'word' | 'slides'>>({ action: 'inspect', product, documentId: id });
      expect(opened.snapshotText).toBe(stored.document!.snapshotText); expect(hash(opened.snapshotText)).toBe(stored.document!.snapshotHash);
      expect(opened.document.revision).toBe(stored.document!.revision); return opened;
    };
    await expect(page.getByRole('heading', { name: projectTitle, exact: true })).toBeVisible();
    const guide = await importThroughExistingLibrary(page, 'word', guideTitle); await page.goto(projectUrl);
    await expect(page.getByRole('heading', { name: projectTitle, exact: true })).toBeVisible();
    const training = await importThroughExistingLibrary(page, 'slides', trainingTitle); await page.goto(projectUrl);
    await expect(page.getByRole('heading', { name: projectTitle, exact: true })).toBeVisible();
    await linkResult(page, guideTitle); await linkResult(page, trainingTitle);
    let current = await readProject(); expect(current.project.record.results).toHaveLength(2);
    expect(current.project.record.results.map(result => result.document.id).sort()).toEqual([guide.id, training.id].sort());
    const initialGuide = await readDocument(guide.id, 'word'), initialTraining = await readDocument(training.id, 'slides');
    requests.phase = 'open-guide'; await page.getByRole('button', { name: guideTitle, exact: true }).click(); await expect(word(page)).toBeVisible();
    await notePhase(page, requests, 'before-direct-edit');
    await page.getByRole('button', { name: '직접 편집', exact: true }).click();
    await expect.poll(() => paragraph(page).evaluate(node => node.closest('[contenteditable]')?.getAttribute('contenteditable'))).toBe('true');
    await expect(page.getByRole('button', { name: '읽기', exact: true })).toBeVisible();
    await notePhase(page, requests, 'direct-edit-ready');
    await selectGuide(page); requests.phase = 'native-quote-selected';
    requests.timeline.push({ kind: 'ui', phase: requests.phase, selectionLength: 4, selectionHash: hash('This') });
    await page.getByRole('button', { name: '프로젝트 의견 남기기', exact: true }).click();
    await expect(feedback(page)).toBeVisible(); await notePhase(page, requests, 'opinion-opened'); const input = feedback(page).getByRole('textbox', { name: '프로젝트 의견 입력', exact: true });
    await input.fill('초안 보관'); await input.dispatchEvent('compositionstart');
    await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true });
    await input.dispatchEvent('keydown', { key: 'Escape', code: 'Escape', isComposing: true, bubbles: true });
    await expect(feedback(page)).toBeVisible(); expect((await readProject()).project.record.comments).toHaveLength(0);
    await input.dispatchEvent('compositionend'); await input.fill(opinion);
    await feedback(page).getByRole('button', { name: '의견 닫기', exact: true }).click();
    await page.getByRole('button', { name: '의견 0', exact: true }).click(); await expect(input).toHaveValue(opinion);
    let dropped = false, originalPayload: unknown;
    await page.route(projectApi, async route => {
      if (route.request().method() !== 'PATCH' || route.request().postDataJSON()?.action?.type !== 'comment' || dropped) { await route.continue(); return; }
      dropped = true; originalPayload = route.request().postDataJSON();
      const committed = await route.fetch(); expect(committed.status()).toBe(200);
      const canonical = await committed.json() as ProjectView;
      const concurrent = await page.request.patch(projectApi, { headers: { Authorization: requests.bearer }, data: {
        expectedRevision: canonical.project.revision, idempotencyKey: randomUUID(), action: { type: 'metadata', goal: '서버에서 먼저 저장한 프로젝트 목표를 유지한다.' } } });
      expect(concurrent.status()).toBe(200); await route.abort('failed');
    });
    await notePhase(page, requests, 'first-comment-submit');
    await feedback(page).getByRole('button', { name: '댓글만 남기기', exact: true }).click();
    await expect(feedback(page).getByText('의견을 저장하지 못했습니다', { exact: true })).toBeVisible(); await expect(input).toHaveValue(opinion);
    expect(dropped).toBe(true); current = await readProject(); expect(current.project.record.comments).toHaveLength(1); expect(current.project.record.works).toHaveLength(0);
    await notePhase(page, requests, 'same-comment-retry');
    await feedback(page).getByRole('button', { name: '댓글만 남기기', exact: true }).click();
    await expect(page.getByRole('button', { name: '의견 1', exact: true })).toBeVisible();
    current = await readProject(); expect(current.project.record.comments).toHaveLength(1); expect(current.project.record.works).toHaveLength(0);
    expect(current.project.record.goal).toBe('서버에서 먼저 저장한 프로젝트 목표를 유지한다.');
    const commentRequests = requests.projectWrites.filter(payload => (payload.action as { type?: string })?.type === 'comment');
    expect(commentRequests).toHaveLength(2); expect(commentRequests[0]).toEqual(originalPayload); expect(commentRequests[1]).toEqual(originalPayload);
    const comment = current.project.record.comments[0], afterComment = await readDocument(guide.id, 'word');
    expect(comment.actor.kind).toBe('human'); expect(comment.actor.id).toBe(current.actor.id); expect(comment.target.kind).toBe('word-comment'); expect(comment.target.quote).toBe('This');
    expect(comment.pin.text).toBe(afterComment.snapshotText); expect(comment.pin.revision).toBe(afterComment.document.revision);
    expectOnlyRecordedOpinion(JSON.parse(initialGuide.snapshotText).document, JSON.parse(afterComment.snapshotText).document, comment.target.id);
    await feedback(page).getByRole('button', { name: '수정 작업 연결', exact: true }).click();
    await expect(feedback(page).getByText('실행기 미연결 · 원본은 자동 변경되지 않습니다.', { exact: true })).toBeVisible();
    current = await readProject(); expect(current.project.record.works).toHaveLength(1); const workId = current.project.record.works[0].id;
    expect(current.project.record.works[0].commentId).toBe(comment.id); expect(current.project.record.works[0].state).toBe('unconnected');
    expect((await readDocument(guide.id, 'word')).snapshotText).toBe(afterComment.snapshotText);
    await page.getByRole('button', { name: '프로젝트로 돌아가기', exact: true }).click();
    await expect(page.getByRole('heading', { name: projectTitle, exact: true })).toBeVisible();
    const workDetails = page.locator('.ow-project-work'); await workDetails.locator('summary').click();
    await workDetails.getByRole('button', { name: '후속 결과 연결', exact: true }).click();
    const pinning = page.getByRole('dialog', { name: '후속 결과 연결', exact: true });
    await pinning.getByRole('button', { name: '후속 결과물', exact: true }).click();
    await page.getByRole('option', { name: trainingTitle, exact: true }).click();
    await pinning.getByRole('button', { name: '현재 참고 원본', exact: true }).click();
    await page.getByRole('option', { name: guideTitle, exact: true }).click();
    await pinning.getByRole('button', { name: '같은 요청에 연결', exact: true }).click();
    await expect(pinning).toBeHidden(); current = await readProject();
    const trainingRecord = current.project.record.results.find(result => result.document.id === training.id)!;
    const trainingPin = trainingRecord.inputs[0];
    expect(trainingPin.text).toBe(afterComment.snapshotText); expect(trainingPin.revision).toBe(afterComment.document.revision);
    expect(current.project.record.works).toHaveLength(1); expect(current.project.record.works[0].id).toBe(workId);
    expect(current.project.record.works[0].inputs).toContainEqual(trainingPin);
    expect(current.project.record.works[0].outputs).toContain(trainingRecord.id);
    const trainingResult = page.locator('.ow-project-result').filter({ has: page.getByRole('button', { name: trainingTitle, exact: true }) });
    await trainingResult.getByText('요청과 참고 자료', { exact: true }).click();
    await trainingResult.getByRole('button', { name: `${guideTitle} · 버전 ${trainingPin.revision}`, exact: true }).click();
    const pinned = page.getByRole('dialog', { name: '사용한 원본 버전', exact: true }); await pinned.getByText('저장한 원본 데이터', { exact: true }).click();
    expect(await pinned.locator('details pre').textContent()).toBe(trainingPin.text); await page.keyboard.press('Escape');
    await workDetails.getByRole('button', { name: '일시 정지', exact: true }).click(); current = await readProject(); expect(current.project.record.works[0].state).toBe('paused');
    await page.reload(); await expect(page.getByRole('heading', { name: projectTitle, exact: true })).toBeVisible();
    await page.locator('.ow-project-work summary').click(); await page.getByRole('button', { name: '같은 작업 재개', exact: true }).click();
    current = await readProject(); expect(current.project.record.works).toHaveLength(1); expect(current.project.record.works[0].id).toBe(workId); expect(current.project.record.works[0].state).toBe('unconnected');
    await page.getByRole('button', { name: guideTitle, exact: true }).click(); await expect(word(page)).toBeVisible(); await page.getByRole('button', { name: '직접 편집', exact: true }).click();
    const p = paragraph(page); await p.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' Human correction.'); await expect(p).toContainText('Human correction.');
    await page.keyboard.press('Meta+z'); await expect(p).not.toContainText('Human correction.'); await page.keyboard.press('Meta+Shift+z'); await expect(p).toContainText('Human correction.');
    await page.getByRole('button', { name: '프로젝트로 돌아가기', exact: true }).click();
    const edited = await readDocument(guide.id, 'word'); expect(edited.snapshotText).toContain('Human correction.');
    expect((await readDocument(training.id, 'slides')).snapshotText).toBe(initialTraining.snapshotText);
    const pinResponse = await page.request.get(`${projectApi}/pins/${trainingPin.id}`, { headers: { Authorization: requests.bearer } }); expect(pinResponse.status()).toBe(200);
    const historical = await pinResponse.json() as { pin: Pin; sourceState: string }; expect(historical.pin.text).toBe(trainingPin.text); expect(historical.sourceState).toBe('changed');
    await page.getByRole('button', { name: trainingTitle, exact: true }).click(); await expect(slides(page)).toBeVisible(); await page.getByRole('button', { name: '프로젝트로 돌아가기', exact: true }).click();
    await expect(page.getByRole('heading', { name: projectTitle, exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('authenticated-project-home.png') });
    b = await launchPrivateProfile(profileB); const viewerPage = await b.context.newPage(), viewerRequests = track(viewerPage); await login(viewerPage, 'beta-viewer', projectUrl);
    await expect(viewerPage.getByRole('button', { name: '결과물 연결', exact: true })).toBeDisabled();
    const denied = await viewerPage.request.patch(projectApi, { headers: { Authorization: viewerRequests.bearer }, data: {
      expectedRevision: (await readProject()).project.revision, idempotencyKey: randomUUID(), action: { type: 'metadata', title: 'Denied' } } }); expect(denied.status()).toBe(403);
    expect((await viewerPage.request.get(`${origin}/api/v1/tenants/${status.betaTenantId}/projects/${projectId}`, { headers: { Authorization: viewerRequests.bearer } })).status()).toBe(403);
    await privateControl({ action: 'beta-role', role: 'editor' }); roleChanged = true; await viewerPage.reload();
    await expect(viewerPage.getByRole('button', { name: '결과물 연결', exact: true })).toBeEnabled();
    await viewerPage.getByRole('button', { name: guideTitle, exact: true }).click(); await expect(word(viewerPage)).toBeVisible(); await viewerPage.getByRole('button', { name: '직접 편집', exact: true }).click();
    await selectGuide(viewerPage); await viewerPage.getByRole('button', { name: '프로젝트 의견 남기기', exact: true }).click();
    await feedback(viewerPage).getByRole('textbox', { name: '프로젝트 의견 입력', exact: true }).fill('권한 회수 후 제출하면 안 되는 초안');
    const oldButton = await feedback(viewerPage).getByRole('button', { name: '댓글만 남기기', exact: true }).elementHandle(); expect(oldButton).not.toBeNull();
    await privateControl({ action: 'beta-role', role: 'viewer' }); await viewerPage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(viewerPage.getByRole('button', { name: '프로젝트 의견 남기기', exact: true })).toBeDisabled();
    const beforeRevoked = await readProject(); await oldButton!.evaluate(button => (button as HTMLButtonElement).click()); expect((await readProject()).project).toEqual(beforeRevoked.project);
    expect((await readDocument(guide.id, 'word')).snapshotText).toBe(edited.snapshotText);
    await privateControl({ action: 'beta-active', active: false }); await viewerPage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(async () => (await viewerPage.request.get(`${projectApi}/pins/${trainingPin.id}`, { headers: { Authorization: viewerRequests.bearer } })).status()).toBe(403);
    expect((await readDocument(guide.id, 'word')).snapshotText).toBe(edited.snapshotText);
    evidence.projectId = projectId; evidence.workId = workId; evidence.commentCount = 1; evidence.sourcePinHash = hash(trainingPin.text);
    evidence.humanSourceHash = hash(edited.snapshotText); evidence.trainingHash = hash(initialTraining.snapshotText); evidence.lostAckSamePayload = true;
    evidence.actualViewerDenied = true; evidence.revokedPinnedReadDenied = true; evidence.syntheticComposition = true; evidence.physicalOsIme = 'not exercised'; passed = true;
  } catch (error) {
    const failedPage = a?.context.pages().at(-1);
    if (failedPage && new URL(failedPage.url()).origin === origin) {
      const url = new URL(failedPage.url());
      if (diagnosticTrack) await notePhase(failedPage, diagnosticTrack, 'failed');
      const diagnostic = { path: url.pathname, queryKeys: Array.from(url.searchParams.keys()), headings: await failedPage.getByRole('heading').allTextContents(), timeline: diagnosticTrack?.timeline };
      writeFileSync(join(directory, 'failure-ui.json'), JSON.stringify(diagnostic), { mode: 0o600 });
      await failedPage.screenshot({ path: test.info().outputPath('failure-project-ui.png') });
    }
    throw error;
  } finally {
    if (roleChanged) { await privateControl({ action: 'beta-active', active: true }); await privateControl({ action: 'beta-role', role: 'viewer' }); }
    if (a) await stopPrivateProfile(a.context, a.pid); if (b) await stopPrivateProfile(b.context, b.pid);
    rmSync(profileA, { recursive: true, force: true }); rmSync(profileB, { recursive: true, force: true });
    writeFileSync(evidenceFile, JSON.stringify({ status: passed ? 'passed' : 'incomplete', cleanup: true, timeline: diagnosticTrack?.timeline, ...evidence }), { mode: 0o600 });
  }
});
