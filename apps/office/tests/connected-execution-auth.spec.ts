import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createStarterDocument } from '../../../packages/office-word/src/starter-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';
import { createStarterDeck } from '../../../packages/office-slides/src/starter-deck';
import { deckFileText } from '../../../packages/office-slides/src/deck-file';
import type { INode } from '../../../packages/datastore/src/types';
import { privateControl, launchPrivateProfile, stopPrivateProfile, type RealStatus, type Inspection } from './helpers/real-recovery-control';

const origin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const word = (page: Page) => page.locator('[data-server-word-workspace]');
const slides = (page: Page) => page.locator('[data-server-slides-workspace]');
const feedback = (page: Page) => page.getByRole('complementary', { name: '프로젝트 의견', exact: true });
const paragraph = (page: Page) => word(page).locator('.w-paragraph').first();
const opinion = '앱이 켜져 있을 때의 조치도 안내하고, 교육자료에도 반영해줘.';
const projectTitle = 'Windows 베타 공개 · 실제 로컬 모델 검증';
const guideText = 'Windows 베타 설치: 설치 파일을 실행하고 설치 완료 후 Wonffice를 시작하세요.';
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
  if (process.env.OFFICE_LOCAL_AGENT_ENABLED !== 'true') throw new Error('The installed local model must be explicitly enabled for this live acceptance.');
});
async function login(page: Page, alias: 'alpha-editor' | 'beta-viewer', url = origin) {
  const authenticated = async () => await page.locator('.ow-project-home').isVisible() || await word(page).isVisible() || await slides(page).isVisible();
  await page.goto(url);
  await expect.poll(async () => await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible() ||
    await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await authenticated()).toBe(true);
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
  await expect.poll(async () => await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await authenticated()).toBe(true);
  if (!(await authenticated())) {
    await page.getByRole('button', { name: /Synthetic Alpha/ }).click();
    await page.getByRole('button', { name: 'Alpha workspace', exact: true }).click();
  }
  await expect.poll(authenticated).toBe(true);
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
  const document = product === 'word' ? createStarterDocument() : createStarterDeck();
  const meta = document.content?.find((node): node is INode => typeof node !== 'string' && node.stype === 'docMeta');
  const titleNode = meta?.content?.find((node): node is INode => typeof node !== 'string' && node.stype === 'docTitle');
  if (titleNode) titleNode.content = [{ stype: 'inline-text', text: title }];
  if (product === 'word') {
    const surface = document.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'surface')!;
    const p = surface.content![0] as INode; p.content = [{ stype: 'inline-text', text: guideText }];
  }
  document.metadata = { originalOwner: 'synthetic-connected-work', loadedAt: 'original-native-load' };
  const text = product === 'word' ? wordFileText(document, '') : deckFileText(document, '');
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

interface Execution {
  id: string; projectId: string; workId: string; actorId: string; documentId: string; phase: string;
  input: { request: string; revision: number; snapshotHash: string; snapshotText: string;
    target: { nodeId: string; text: string; from: number; to: number };
    inputs: Array<{ id: string; documentId: string; revision: number; snapshotHash: string; snapshotText: string }> };
  pendingOutputs: Array<{ resultId: string; reason: string; inputs: Array<{ id: string; documentId: string; revision: number; snapshotHash: string; snapshotText: string }> }>;
  proposal?: { replacement: string; reason: string; assumptions: string[] };
  provenance?: { kind: string; model: string; modelDigest: string; runtimeVersion: string; adapterVersion: string;
    inputHash: string; responseHash: string; proposalHash: string; contextTokens: number; outputTokenLimit: number;
    promptBytes: number; promptEvalCount: number; evalCount: number; startedAt: string; completedAt: string };
  expectedSnapshotText?: string; expectedSnapshotHash?: string; appliedRevision?: number;
}
const executionPanel = (page: Page) => feedback(page).getByRole('region', { name: '연결된 수정 작업', exact: true });
async function selectCompleteGuide(page: Page) {
  const p = paragraph(page); await expect(p).toHaveText(guideText);
  await expect.poll(() => p.evaluate(node => node.closest('[contenteditable]')?.getAttribute('contenteditable'))).toBe('true');
  await p.scrollIntoViewIfNeeded(); const bounds = await p.boundingBox(); expect(bounds).not.toBeNull();
  await p.click({ position: { x: 8, y: Math.min(10, bounds!.height / 2) } }); await page.keyboard.press('Home');
  await page.keyboard.down('Shift');
  for (let i = 0; i < guideText.length; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe(guideText);
}
function expectedReplacement(original: string, threadId: string, replacement: string) {
  const envelope = JSON.parse(original) as { format: string; version: number; document: INode; savedAt?: string };
  // Construct the allowed delta from PRE-CALL bytes, never from observed native exports.
  expect(envelope.savedAt).toBeUndefined();
  const targets: INode[] = [];
  const visit = (node: INode) => {
    if (node.stype === 'inline-text' && node.marks?.some(mark => mark.stype === 'commentRef' && mark.attrs?.id === threadId)) targets.push(node);
    for (const child of node.content ?? []) if (typeof child !== 'string') visit(child);
  };
  visit(envelope.document); expect(targets).toHaveLength(1);
  const target = targets[0]; expect(target.text).toBe(guideText); expect(target.marks).toHaveLength(1);
  expect(target.marks![0].range).toEqual([0, guideText.length]);
  target.text = replacement; target.marks![0].range = [0, replacement.length];
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

test('live local proposal uses exact native Word, human acceptance, durable attempt and explicit training follow-up', async () => {
  test.setTimeout(960_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const evidenceFile = join(directory, 'connected-execution-evidence.json');
  const profileA = mkdtempSync(join(directory, 'execution-editor-')), profileB = mkdtempSync(join(directory, 'execution-viewer-'));
  let a: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined, b: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let passed = false, viewerRevoked = false;
  const evidence: Record<string, unknown> = { type: 'real-oidc-api-private-postgres-live-local-model', physicalOsIme: 'not exercised' };
  const timelines: Array<Array<Record<string, unknown>>> = [];
  writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete' }), { mode: 0o600 });
  try {
    const status = await privateControl<RealStatus>({ action: 'status' });
    const tenantRoot = `${origin}/api/v1/tenants/${status.tenantId}`;
    a = await launchPrivateProfile(profileA); let page = await a.context.newPage(), requests = track(page); timelines.push(requests.timeline);
    await login(page, 'alpha-editor');
    await page.getByRole('button', { name: '프로젝트 만들기', exact: true }).click();
    const creating = page.getByRole('dialog', { name: '프로젝트 만들기', exact: true });
    await creating.getByRole('textbox', { name: '프로젝트 이름', exact: true }).fill(projectTitle);
    await creating.getByRole('textbox', { name: '프로젝트 목표', exact: true }).fill('내부 가상 Windows 베타 설치 안내와 팀 교육자료에 실행 중인 앱의 조치를 반영한다.');
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
      expect(opened.snapshotText).toBe(stored.document!.snapshotText);
      expect(opened.document.snapshotHash).toBe(hash(opened.snapshotText)); expect(opened.document.snapshotHash).toBe(stored.document!.snapshotHash);
      expect(opened.document.revision).toBe(stored.document!.revision); return opened;
    };
    const guide = await importThroughExistingLibrary(page, 'word', guideTitle); await page.goto(projectUrl);
    await expect(page.getByRole('heading', { name: projectTitle, exact: true })).toBeVisible();
    const training = await importThroughExistingLibrary(page, 'slides', trainingTitle); await page.goto(projectUrl);
    await expect(page.getByRole('heading', { name: projectTitle, exact: true })).toBeVisible();
    await linkResult(page, guideTitle); await linkResult(page, trainingTitle);
    const initialTraining = await readDocument(training.id, 'slides');
    await page.getByRole('button', { name: guideTitle, exact: true }).click(); await expect(word(page)).toBeVisible();
    await page.getByRole('button', { name: '직접 편집', exact: true }).click(); await selectCompleteGuide(page);
    await page.getByRole('button', { name: '프로젝트 의견 남기기', exact: true }).click();
    await feedback(page).getByRole('textbox', { name: '프로젝트 의견 입력', exact: true }).fill(opinion);
    requests.phase = 'comment-only'; await feedback(page).getByRole('button', { name: '댓글만 남기기', exact: true }).click();
    await expect(page.getByRole('button', { name: '의견 1', exact: true })).toBeVisible();
    let current = await readProject(); expect(current.project.record.comments).toHaveLength(1); expect(current.project.record.works).toHaveLength(0);
    const comment = current.project.record.comments[0]; expect(comment.target.quote).toBe(guideText); expect(comment.target.kind).toBe('word-comment');
    requests.phase = 'explicit-revision-request'; await feedback(page).getByRole('button', { name: '수정 작업 연결', exact: true }).click();
    await expect(executionPanel(page).getByRole('button', { name: '로컬 모델에 제안 요청', exact: true })).toBeVisible();
    current = await readProject(); expect(current.project.record.works).toHaveLength(1);
    const workId = current.project.record.works[0].id, executionApi = `${projectApi}/works/${workId}/execution`;
    const readExecution = async () => {
      const response = await page.request.get(executionApi, { headers: { Authorization: requests.bearer } }); expect(response.status()).toBe(200);
      return (await response.json() as { execution: Execution | null }).execution;
    };
    expect(await readExecution()).toBeNull();
    expect(timelines.flat().filter(entry => entry.method === 'POST' && String(entry.path).endsWith('/execution'))).toHaveLength(0);
    await page.getByRole('button', { name: '프로젝트로 돌아가기', exact: true }).click();
    await expect(page.getByRole('heading', { name: projectTitle, exact: true })).toBeVisible();
    const details = page.locator('.ow-project-work'); await details.locator('summary').first().click();
    await details.getByRole('button', { name: '일시 정지', exact: true }).click(); expect(await readExecution()).toBeNull();
    await page.reload(); await expect(page.getByRole('heading', { name: projectTitle, exact: true })).toBeVisible();
    await page.locator('.ow-project-work summary').first().click();
    await page.getByRole('button', { name: '같은 작업 재개', exact: true }).click(); expect(await readExecution()).toBeNull();
    await page.getByRole('button', { name: guideTitle, exact: true }).click(); await expect(word(page)).toBeVisible();
    await page.getByRole('button', { name: '직접 편집', exact: true }).click();
    await page.getByRole('button', { name: '의견 1', exact: true }).click();
    const preCall = await readDocument(guide.id, 'word'); expect(preCall.snapshotText).toBe(comment.pin.text);
    requests.phase = 'live-inference'; await notePhase(page, requests, requests.phase);
    const liveResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url() === executionApi, { timeout: 660_000 });
    await executionPanel(page).getByRole('button', { name: '로컬 모델에 제안 요청', exact: true }).click();
    const actualResponse = await liveResponse; expect(actualResponse.status()).toBe(200);
    const proposed = (await actualResponse.json() as { execution: Execution }).execution;
    expect(proposed.phase).toBe('proposal'); expect(proposed.workId).toBe(workId); expect(proposed.actorId).toBe(current.actor.id);
    expect(proposed.input.request).toBe(opinion); expect(proposed.input.snapshotText).toBe(preCall.snapshotText);
    expect(proposed.input.revision).toBe(preCall.document.revision); expect(proposed.input.snapshotHash).toBe(hash(preCall.snapshotText));
    expect(proposed.input.target).toEqual({ nodeId: comment.target.id, text: guideText, from: 0, to: guideText.length });
    expect(proposed.provenance).toMatchObject({ kind: 'live-local-model', model: 'qwen3.6:27b-coding', runtimeVersion: '0.34.4',
      modelDigest: '3a12a518a499223fc5be0a6b43589f5c2809275e59572c29a73e0506ff67a735', contextTokens: 32768, outputTokenLimit: 4096 });
    expect(proposed.provenance!.promptBytes).toBeLessThanOrEqual(24576); expect(proposed.provenance!.promptEvalCount).toBeGreaterThan(0);
    expect(proposed.provenance!.evalCount).toBeLessThanOrEqual(4096); expect(proposed.provenance!.responseHash).toMatch(/^[a-f0-9]{64}$/);
    expect(proposed.provenance!.proposalHash).toBe(hash(JSON.stringify({ replacement: proposed.proposal!.replacement,
      reason: proposed.proposal!.reason, assumptions: proposed.proposal!.assumptions })));
    expect(proposed.proposal!.replacement).not.toBe(guideText); expect(proposed.proposal!.reason.trim()).not.toBe('');
    const expected = expectedReplacement(preCall.snapshotText, comment.target.id, proposed.proposal!.replacement);
    expect(proposed.expectedSnapshotText).toBe(expected); expect(proposed.expectedSnapshotHash).toBe(hash(expected));
    expect(proposed.pendingOutputs).toEqual([]);
    for (const pin of proposed.input.inputs) {
      expect(pin.documentId).toBe(guide.id); expect(pin.snapshotText).toBe(preCall.snapshotText);
      expect(pin.revision).toBe(preCall.document.revision); expect(pin.snapshotHash).toBe(hash(preCall.snapshotText));
    }
    expect((await readDocument(guide.id, 'word')).snapshotText).toBe(preCall.snapshotText);
    expect((await readDocument(training.id, 'slides')).snapshotText).toBe(initialTraining.snapshotText);
    await expect(executionPanel(page).getByRole('button', { name: '이 변경 승인 및 저장', exact: true })).toBeEnabled();
    requests.phase = 'human-accept'; await executionPanel(page).getByRole('button', { name: '이 변경 승인 및 저장', exact: true }).click();
    await expect(executionPanel(page).getByRole('status')).toHaveText('원본 반영 확인', { timeout: 30_000 });
    const accepted = await readExecution(); expect(accepted!.phase).toBe('applied'); expect(accepted!.id).toBe(proposed.id);
    const applied = await readDocument(guide.id, 'word'); expect(applied.snapshotText).toBe(expected);
    expect(accepted!.appliedRevision).toBe(applied.document.revision); expect(applied.document.revision).toBe(preCall.document.revision + 1);
    // Link the training follow-up AFTER the guide was actually accepted and saved.
    // A second tab retains this mounted Word editor's genuine Undo/Redo history.
    const linkingPage = await a.context.newPage(), linkingRequests = track(linkingPage); timelines.push(linkingRequests.timeline);
    linkingRequests.phase = 'deliberate-follow-up-after-guide-save';
    await login(linkingPage, 'alpha-editor', projectUrl);
    await expect(linkingPage.getByRole('heading', { name: projectTitle, exact: true })).toBeVisible();
    const followUpWork = linkingPage.locator('.ow-project-work'); await followUpWork.locator('summary').first().click();
    await followUpWork.getByRole('button', { name: '후속 결과 연결', exact: true }).click();
    const linking = linkingPage.getByRole('dialog', { name: '후속 결과 연결', exact: true });
    await linking.getByRole('button', { name: '후속 결과물', exact: true }).click(); await linkingPage.getByRole('option', { name: trainingTitle, exact: true }).click();
    await linking.getByRole('button', { name: '현재 참고 원본', exact: true }).click(); await linkingPage.getByRole('option', { name: guideTitle, exact: true }).click();
    await linking.getByRole('button', { name: '같은 요청에 연결', exact: true }).click(); await expect(linking).toBeHidden();
    current = await readProject(); expect(current.project.record.works).toHaveLength(1); expect(current.project.record.works[0].id).toBe(workId);
    const trainingRecord = current.project.record.results.find(result => result.document.id === training.id)!;
    const fixedPin = trainingRecord.inputs[0]; expect(fixedPin.text).toBe(expected); expect(fixedPin.revision).toBe(applied.document.revision);
    const linkedExecution = await readExecution(); expect(linkedExecution!.id).toBe(proposed.id); expect(linkedExecution!.phase).toBe('applied');
    expect(linkedExecution!.input).toEqual(proposed.input); expect(linkedExecution!.provenance).toEqual(proposed.provenance);
    expect(linkedExecution!.pendingOutputs).toContainEqual({ resultId: trainingRecord.id, reason: 'unsupported_target',
      inputs: [{ id: fixedPin.id, documentId: guide.id, revision: fixedPin.revision, snapshotHash: hash(expected), snapshotText: expected }] });
    await linkingPage.close(); await page.bringToFront();
    await executionPanel(page).getByRole('button', { name: '실행 기록 확인', exact: true }).click();
    const pending = executionPanel(page).locator('[aria-label="후속 결과물 상태"]');
    await expect(pending.getByText(`${trainingTitle} · 대기: 이 결과물의 자동 편집은 아직 지원하지 않습니다.`, { exact: true })).toBeVisible();
    await expect(pending.locator('p').filter({ hasText: `${guideTitle} · 버전 ${fixedPin.revision} ·` })).toBeVisible();
    expect((await readDocument(training.id, 'slides')).snapshotText).toBe(initialTraining.snapshotText);
    requests.phase = 'native-undo'; await paragraph(page).click(); await page.keyboard.press('Meta+z');
    await expect(paragraph(page)).toHaveText(guideText);
    await word(page).getByRole('button', { name: /^(저장|저장 확인·재시도)$/ }).click();
    await expect(word(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    expect((await readDocument(guide.id, 'word')).snapshotText).toBe(preCall.snapshotText);
    requests.phase = 'native-redo'; await paragraph(page).click(); await page.keyboard.press('Meta+Shift+z');
    await expect(paragraph(page)).toHaveText(proposed.proposal!.replacement);
    await word(page).getByRole('button', { name: /^(저장|저장 확인·재시도)$/ }).click();
    await expect(word(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    expect((await readDocument(guide.id, 'word')).snapshotText).toBe(expected);
    const url = page.url(), beforeBrowser = a.pid;
    await stopPrivateProfile(a.context, a.pid); a = undefined;
    const stopped = await privateControl<RealStatus>({ action: 'api-stop' }); expect(stopped.apiRunning).toBe(false);
    const restarted = await privateControl<RealStatus>({ action: 'api-start' }); expect(restarted.apiPid).not.toBe(stopped.apiPid);
    expect(restarted.databaseIdentity).toBe(status.databaseIdentity); expect(restarted.databaseGeneration).toBe(status.databaseGeneration);
    a = await launchPrivateProfile(profileA); expect(a.pid).not.toBe(beforeBrowser);
    page = await a.context.newPage(); requests = track(page); timelines.push(requests.timeline); await login(page, 'alpha-editor', url);
    await expect(word(page)).toBeVisible(); expect((await readDocument(guide.id, 'word')).snapshotText).toBe(expected);
    const restored = await readExecution(); expect(restored!.id).toBe(proposed.id); expect(restored!.proposal).toEqual(proposed.proposal);
    expect(restored!.provenance).toEqual(proposed.provenance); expect(restored!.pendingOutputs).toEqual(linkedExecution!.pendingOutputs);
    expect(timelines.flat().filter(entry => entry.method === 'POST' && String(entry.path).endsWith('/execution'))).toHaveLength(1);
    const replay = await page.request.post(executionApi, { headers: { Authorization: requests.bearer }, data: { expectedRevision: (await readProject()).project.revision } });
    expect(replay.status()).toBe(200); const replayed = (await replay.json() as { execution: Execution }).execution;
    expect(replayed.id).toBe(proposed.id); expect(replayed.provenance).toEqual(proposed.provenance);
    const pinRead = await page.request.get(`${projectApi}/pins/${fixedPin.id}`, { headers: { Authorization: requests.bearer } });
    expect(pinRead.status()).toBe(200); const historical = await pinRead.json() as { pin: Pin; sourceState: string };
    expect(historical.pin.text).toBe(fixedPin.text); expect(historical.sourceState).toBe('changed');
    expect((await readDocument(training.id, 'slides')).snapshotText).toBe(initialTraining.snapshotText);
    b = await launchPrivateProfile(profileB); const viewer = await b.context.newPage(), viewerRequests = track(viewer); timelines.push(viewerRequests.timeline);
    await login(viewer, 'beta-viewer', projectUrl);
    const denied = await viewer.request.post(executionApi, { headers: { Authorization: viewerRequests.bearer }, data: { expectedRevision: (await readProject()).project.revision } });
    expect(denied.status()).toBe(403);
    const forbiddenAcceptance = await viewer.request.post(`${executionApi}/${proposed.id}/accept`, { headers: { Authorization: viewerRequests.bearer }, data: {} });
    expect(forbiddenAcceptance.status()).toBe(403);
    await privateControl({ action: 'beta-active', active: false }); viewerRevoked = true;
    const revoked = await viewer.request.get(executionApi, { headers: { Authorization: viewerRequests.bearer } }); expect(revoked.status()).toBe(403);
    const revokedPin = await viewer.request.get(`${projectApi}/pins/${fixedPin.id}`, { headers: { Authorization: viewerRequests.bearer } }); expect(revokedPin.status()).toBe(403);
    expect((await readDocument(guide.id, 'word')).snapshotText).toBe(expected);
    evidence.projectId = projectId; evidence.workId = workId; evidence.attemptId = proposed.id; evidence.provenance = proposed.provenance;
    evidence.beforeHash = hash(preCall.snapshotText); evidence.appliedHash = hash(expected); evidence.trainingHash = hash(initialTraining.snapshotText);
    evidence.guidePinHash = hash(fixedPin.text); evidence.pendingOutputs = linkedExecution!.pendingOutputs;
    evidence.commentOnlyNoDispatch = true; evidence.exactNativeUndoRedo = true; evidence.browserApiRestart = true;
    evidence.replayedAttemptIdentity = true; evidence.actualViewerDenied = true; evidence.revokedEvidenceDenied = true;
    passed = true;
  } finally {
    if (viewerRevoked) await privateControl({ action: 'beta-active', active: true });
    if (a) await stopPrivateProfile(a.context, a.pid); if (b) await stopPrivateProfile(b.context, b.pid);
    rmSync(profileA, { recursive: true, force: true }); rmSync(profileB, { recursive: true, force: true });
    writeFileSync(evidenceFile, JSON.stringify({ status: passed ? 'passed' : 'incomplete', cleanup: true, timelines, ...evidence }), { mode: 0o600 });
  }
});
