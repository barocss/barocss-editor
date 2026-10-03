import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createStarterDocument } from '../../../packages/office-word/src/starter-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';
import type { INode } from '../../../packages/datastore/src/types';
import { privateControl, launchPrivateProfile, stopPrivateProfile, type RealStatus, type Inspection } from './helpers/real-recovery-control';

const origin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const word = (page: Page) => page.locator('[data-server-word-workspace]');
const feedback = (page: Page) => page.getByRole('complementary', { name: '프로젝트 의견', exact: true });
const sentence = '설치 전 문서를 닫고 업데이트하세요.';
const parts = ['설치 전 ', '문서를 닫고 ', '업데이트하세요.'];
const paragraph = (page: Page) => word(page).locator('.w-paragraph').filter({ hasText: sentence }).first();
const opinion = '원문 서식을 유지하고 설치 안내를 검토해주세요. '.repeat(35).trim();
const projectTitle = '혼합 서식 의견 · 실제 권한 검증';
const guideTitle = '고객 설치 안내';
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

async function importMixed(page: Page) {
  await page.getByRole('button', { name: '자료함', exact: true }).click();
  await page.getByRole('button', { name: 'Word 자료', exact: true }).click();
  await page.getByRole('button', { name: '새 Word 만들기', exact: true }).click();
  await expect(word(page)).toBeVisible({ timeout: 30_000 });
  const document = createStarterDocument();
  const surface = document.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'surface')!;
  surface.content = ['first', 'equal'].map(id => ({ stype: 'paragraph', attributes: { objectId: `443-${id}`, styleId: 'Body' }, content: parts.map((text, index) => ({
    stype: 'inline-text', text, attributes: { objectId: `443-${id}-${index}` },
    ...(index === 1 ? { marks: [{ stype: 'bold', range: [0, text.length] as [number, number] }] } : {}),
    ...(index === 2 ? { marks: [{ stype: 'link', range: [0, text.length] as [number, number], attrs: { href: 'https://example.invalid/443-guide' } }] } : {})
  })) }));
  surface.content.push({ stype: 'paragraph', attributes: { objectId: '443-untouched', styleId: 'Body' }, content: [
    { stype: 'inline-text', text: '바꾸지 않는 안내', attributes: { objectId: '443-untouched-text' }, marks: [{ stype: 'italic', range: [0, 9] }] }
  ] });
  document.metadata = { originalOwner: '443-synthetic', loadedAt: 'original-native-load' };
  const titleNode = (document.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'docMeta')!.content![0] as INode);
  titleNode.content = [{ stype: 'inline-text', text: guideTitle }];
  const text = wordFileText(document, ''), name = randomUUID();
  await page.evaluate(({ name, text, title }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('barocss-word', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'name' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ name, title, text, count: 1, savedAt: 100 });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    };
  }), { name, text, title: guideTitle });
  await word(page).getByRole('button', { name: '이 기기의 로컬 문서 목록 확인' }).click();
  await word(page).getByRole('button', { name: `${guideTitle} · 새 서버 사본 준비`, exact: true }).click();
  const response = page.waitForResponse(response => response.request().method() === 'POST' && /\/documents$/.test(new URL(response.url()).pathname));
  await word(page).getByRole('button', { name: /^(저장|저장 확인·재시도)$/ }).click();
  const saved = await response; expect(saved.status()).toBe(201);
  const raw = await saved.json() as OpenDocument;
  expect(raw.snapshotText).toBe(text);
  await expect(word(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  return { id: raw.document.documentId, text };
}
async function selectMixed(page: Page, mode: 'forward' | 'backward' | 'keyboard') {
  const p = paragraph(page); await p.scrollIntoViewIfNeeded();
  await expect.poll(() => p.evaluate(node => node.closest('[contenteditable]')?.getAttribute('contenteditable'))).toBe('true');
  const ends = await p.evaluate(node => {
    const runs = Array.from(node.querySelectorAll('.w-text'));
    const texts = runs.map(run => document.createTreeWalker(run, NodeFilter.SHOW_TEXT).nextNode() as Text);
    if (texts.length !== 3 || texts.some(text => !text?.length)) throw new Error('Expected three visible native text runs');
    const point = (text: Text, last: boolean) => {
      const range = document.createRange(); range.setStart(text, last ? text.length - 1 : 0); range.setEnd(text, last ? text.length : 1);
      const rect = range.getBoundingClientRect(); return { x: last ? rect.right - 0.5 : rect.left + 0.5, y: rect.y + rect.height / 2 };
    };
    return { start: point(texts[0], false), end: point(texts.at(-1)!, true) };
  });
  if (mode === 'keyboard') {
    await page.mouse.click(ends.start.x + 1, ends.start.y); await page.keyboard.press('Home');
    await page.keyboard.down('Shift'); for (let i = 0; i < sentence.length; i++) await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift');
  } else {
    const start = mode === 'forward' ? ends.start : ends.end, end = mode === 'forward' ? ends.end : ends.start;
    // Start a fresh ordinary gesture; dragging an already selected range invokes native drag/drop.
    await page.mouse.click(ends.start.x, ends.start.y);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => page.evaluate(() => getSelection()?.isCollapsed)).toBe(true);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 16 }); await page.mouse.up();
  }
  const geometry = await p.evaluate(node => ({ html: node.innerHTML, rect: node.getBoundingClientRect().toJSON(), selectedText: getSelection()?.toString() }));
  writeFileSync(test.info().outputPath(`selection-${mode}.json`), JSON.stringify({ ends, ...geometry }), { mode: 0o600 });
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe(sentence);
}
function expectedComment(before: INode, after: INode, threadId: string): INode {
  const expected = structuredClone(before);
  const surface = expected.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'surface')!;
  const runs = (surface.content![0] as INode).content as INode[];
  runs.forEach((run, part) => { run.marks = [...(run.marks ?? []), { stype: 'commentRef', range: [0, parts[part].length], attrs: { id: threadId, part } }]; });
  const resources = expected.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'resources')!;
  const actualResources = after.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'resources')!;
  const thread = actualResources.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'commentThread' && node.attributes?.id === threadId)!;
  expect(thread).toBeDefined(); expect(thread.content).toHaveLength(1);
  const entry = thread.content![0] as INode;
  expect(entry.attributes?.author).toEqual(expect.any(String)); expect(String(entry.attributes?.author).length).toBeGreaterThan(0);
  expect(Number.isNaN(Date.parse(String(entry.attributes?.date)))).toBe(false);
  resources.content = [...(resources.content ?? []), { stype: 'commentThread', attributes: { id: threadId, resolved: false, coverage: parts.map(text => ({ text })) }, content: [
    { stype: 'paragraph', attributes: { author: entry.attributes!.author, date: entry.attributes!.date }, content: [{ stype: 'inline-text', text: opinion }] }
  ] }];
  return expected;
}

test('mixed Word opinion preserves ordered native runs, frozen receipts and actual current authority without inference', async () => {
  test.setTimeout(420_000);
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!), evidenceFile = join(directory, 'word-mixed-feedback-evidence.json');
  const profileA = mkdtempSync(join(directory, 'mixed-writer-')), profileB = mkdtempSync(join(directory, 'mixed-viewer-'));
  let a: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined, b: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let profileASafe = true, profileBSafe = true, passed = false, restoreBeta = false;
  const evidence: Record<string, unknown> = { physicalOsIme: 'not exercised' }, cleanupSteps: Array<{ step: string; status: string }> = [];
  let requests: ReturnType<typeof track> | undefined, failedPage: Page | undefined;
  const checkpoint = () => writeFileSync(evidenceFile, JSON.stringify({ status: 'incomplete', phase: requests?.phase, timeline: requests?.timeline, cleanupSteps, ...evidence }), { mode: 0o600 });
  checkpoint();
  try {
    const status = await privateControl<RealStatus>({ action: 'status' });
    profileASafe = false; a = await launchPrivateProfile(profileA);
    const page = await a.context.newPage(); failedPage = page; requests = track(page);
    let executionDispatches = 0;
    page.on('request', request => { if (request.method() === 'POST' && /\/execution$/.test(new URL(request.url()).pathname)) executionDispatches++; });
    await login(page, 'alpha-editor');
    await page.getByRole('button', { name: '프로젝트 만들기', exact: true }).click();
    const creating = page.getByRole('dialog', { name: '프로젝트 만들기', exact: true });
    await creating.getByRole('textbox', { name: '프로젝트 이름', exact: true }).fill(projectTitle);
    await creating.getByRole('textbox', { name: '프로젝트 목표', exact: true }).fill('혼합 서식의 원문을 보존하고 같은 의견에서 수정 작업을 연결한다.');
    const createResponse = page.waitForResponse(response => response.request().method() === 'POST' && /\/projects$/.test(new URL(response.url()).pathname));
    await creating.getByRole('button', { name: '만들기', exact: true }).click();
    const created = await (await createResponse).json() as ProjectView, projectId = created.project.record.id;
    const tenantRoot = `${origin}/api/v1/tenants/${status.tenantId}`, projectApi = `${tenantRoot}/projects/${projectId}`;
    const projectUrl = `${origin}/?${new URLSearchParams({ tenant: status.tenantId, workspace: status.workspaceId, project: projectId })}`;
    const headers = () => ({ Authorization: requests!.bearer });
    const readProject = async () => { const response = await page.request.get(projectApi, { headers: headers() }); expect(response.status()).toBe(200); return response.json() as Promise<ProjectView>; };
    const guide = await importMixed(page), documentApi = `${tenantRoot}/documents/${guide.id}`;
    const readDocument = async () => {
      const response = await page.request.get(documentApi, { headers: headers() }); expect(response.status()).toBe(200);
      const opened = await response.json() as OpenDocument;
      const stored = await privateControl<Inspection<'word'>>({ action: 'inspect', product: 'word', documentId: guide.id });
      expect(opened.snapshotText).toBe(stored.document!.snapshotText);
      expect(hash(opened.snapshotText)).toBe(stored.document!.snapshotHash); expect(opened.document.revision).toBe(stored.document!.revision);
      return opened;
    };
    await page.goto(projectUrl); await expect(page.getByRole('heading', { name: projectTitle, exact: true })).toBeVisible();
    await page.getByRole('button', { name: '결과물 연결', exact: true }).click();
    const linking = page.getByRole('dialog', { name: '결과물 연결', exact: true });
    await linking.getByRole('textbox', { name: '결과물 이름', exact: true }).fill(guideTitle);
    await linking.getByRole('button', { name: '연결할 원본', exact: true }).click();
    await page.locator(`[role="option"][id$="-word%3A${guide.id}"]`).click();
    await linking.getByRole('button', { name: '연결하기', exact: true }).click(); await expect(linking).toBeHidden();
    const initial = await readDocument(); expect(initial.snapshotText).toBe(guide.text);
    await page.getByRole('button', { name: guideTitle, exact: true }).click(); await expect(word(page)).toBeVisible();
    await page.getByRole('button', { name: '직접 편집', exact: true }).click();
    for (const mode of ['forward', 'backward', 'keyboard'] as const) {
      requests.phase = `capture-${mode}`; checkpoint();
      await selectMixed(page, mode);
      await page.getByRole('button', { name: '프로젝트 의견 남기기', exact: true }).click();
      await expect(feedback(page).locator('blockquote')).toHaveText(sentence);
      await expect(feedback(page).getByRole('textbox', { name: '프로젝트 의견 입력', exact: true })).toBeVisible();
      await feedback(page).getByRole('button', { name: '의견 닫기', exact: true }).click();
      await expect(feedback(page)).toBeHidden();
      expect((await readDocument()).snapshotText).toBe(initial.snapshotText); expect((await readProject()).project.record.comments).toHaveLength(0);
    }
    await selectMixed(page, 'forward'); await page.getByRole('button', { name: '프로젝트 의견 남기기', exact: true }).click();
    const input = feedback(page).getByRole('textbox', { name: '프로젝트 의견 입력', exact: true });
    await input.fill(opinion); await input.dispatchEvent('compositionstart');
    for (const key of ['Enter', 'Escape']) await input.dispatchEvent('keydown', { key, code: key, isComposing: true, keyCode: 229, bubbles: true });
    await expect(feedback(page)).toBeVisible(); expect((await readProject()).project.record.comments).toHaveLength(0);
    await input.dispatchEvent('compositionend'); await page.keyboard.press('Escape'); await expect(feedback(page)).toBeHidden();
    await page.getByRole('button', { name: '의견 0', exact: true }).click(); await expect(input).toHaveValue(opinion);
    await feedback(page).screenshot({ path: test.info().outputPath('mixed-long-opinion.png') });
    const panelBounds = await feedback(page).boundingBox(); expect(panelBounds).not.toBeNull();
    for (const button of await feedback(page).getByRole('button').all()) if (await button.isVisible()) {
      const bounds = await button.boundingBox(); expect(bounds!.height).toBeGreaterThanOrEqual(32); expect(bounds!.width).toBeGreaterThanOrEqual(32);
    }
    await feedback(page).evaluate(node => { node.scrollTop = node.scrollHeight; });
    const closeBounds = await feedback(page).getByRole('button', { name: '의견 닫기', exact: true }).boundingBox();
    expect(closeBounds!.y).toBeGreaterThanOrEqual(panelBounds!.y); expect(closeBounds!.y + closeBounds!.height).toBeLessThanOrEqual(panelBounds!.y + panelBounds!.height);
    await input.scrollIntoViewIfNeeded();
    requests.phase = 'lost-native-save-ack'; checkpoint();
    let saveDropped = false; const saves: unknown[] = [];
    await page.route(`${documentApi}/snapshot`, async route => {
      if (route.request().method() !== 'PUT') return route.continue();
      saves.push(route.request().postDataJSON());
      if (saveDropped) return route.continue(); saveDropped = true;
      const committed = await route.fetch(); expect(committed.status()).toBe(200); await route.abort('failed');
    });
    await feedback(page).getByRole('button', { name: '댓글만 남기기', exact: true }).click();
    await expect(feedback(page).getByText('의견을 저장하지 못했습니다', { exact: true })).toBeVisible(); await expect(input).toHaveValue(opinion);
    expect(saveDropped).toBe(true); expect((await readProject()).project.record.comments).toHaveLength(0);
    const savedNative = await readDocument();
    requests.phase = 'lost-comment-ack'; checkpoint();
    let commentDropped = false, firstCommentPayload: unknown;
    await page.route(projectApi, async route => {
      if (route.request().method() !== 'PATCH' || route.request().postDataJSON()?.action?.type !== 'comment' || commentDropped) return route.continue();
      commentDropped = true; firstCommentPayload = route.request().postDataJSON();
      const committed = await route.fetch(); expect(committed.status()).toBe(200); await route.abort('failed');
    });
    await feedback(page).getByRole('button', { name: '댓글만 남기기', exact: true }).click();
    await expect(feedback(page).getByText('의견을 저장하지 못했습니다', { exact: true })).toBeVisible(); await expect(input).toHaveValue(opinion);
    expect(commentDropped).toBe(true); let current = await readProject(); expect(current.project.record.comments).toHaveLength(1); expect(current.project.record.works).toHaveLength(0);
    await feedback(page).getByRole('button', { name: '댓글만 남기기', exact: true }).click();
    await expect(page.getByRole('button', { name: '의견 1', exact: true })).toBeVisible();
    current = await readProject(); const comment = current.project.record.comments[0];
    expect(current.project.record.comments).toHaveLength(1); expect(current.project.record.works).toHaveLength(0);
    const commentPayloads = requests.projectWrites.filter(payload => (payload.action as { type?: string })?.type === 'comment');
    expect(commentPayloads).toHaveLength(2); expect(commentPayloads[0]).toEqual(firstCommentPayload); expect(commentPayloads[1]).toEqual(firstCommentPayload);
    expect(saves.length).toBeGreaterThanOrEqual(2); expect(saves[1]).toEqual(saves[0]);
    const afterComment = await readDocument(); expect(afterComment.snapshotText).toBe(savedNative.snapshotText);
    expect(comment.target).toEqual({ kind: 'word-comment', id: comment.target.id, quote: sentence });
    expect(comment.body).toBe(opinion.trim()); expect(comment.pin.text).toBe(afterComment.snapshotText); expect(comment.pin.revision).toBe(afterComment.document.revision);
    const beforeTree = JSON.parse(initial.snapshotText).document as INode, afterTree = JSON.parse(afterComment.snapshotText).document as INode;
    const expected = expectedComment(beforeTree, afterTree, comment.target.id); expect(afterTree).toEqual(expected);
    expect(executionDispatches).toBe(0);
    expect(executionDispatches).toBe(0);
    requests.phase = 'lost-request-ack'; checkpoint();
    let requestDropped = false; const workRequests: unknown[] = [];
    await page.route(projectApi, async route => {
      if (route.request().method() !== 'PATCH' || route.request().postDataJSON()?.action?.type !== 'request') return route.continue();
      workRequests.push(route.request().postDataJSON()); if (requestDropped) return route.continue(); requestDropped = true;
      const committed = await route.fetch(); expect(committed.status()).toBe(200); await route.abort('failed');
    });
    await feedback(page).getByRole('button', { name: '수정 작업 연결', exact: true }).click();
    await expect(feedback(page).getByText('의견을 저장하지 못했습니다', { exact: true })).toBeVisible();
    current = await readProject(); expect(current.project.record.works).toHaveLength(1); const workId = current.project.record.works[0].id;
    await feedback(page).getByRole('button', { name: '수정 작업 연결', exact: true }).click();
    await expect(feedback(page).getByText('요청 보관됨 · 아직 실행하지 않음', { exact: true })).toBeVisible();
    current = await readProject(); expect(current.project.record.works).toHaveLength(1); expect(current.project.record.works[0].id).toBe(workId);
    expect(current.project.record.works[0].commentId).toBe(comment.id); expect(current.project.record.works[0].inputs).toContainEqual(comment.pin); expect(workRequests).toHaveLength(2); expect(workRequests[1]).toEqual(workRequests[0]);
    expect(executionDispatches).toBe(0);
    const executionApi = `${projectApi}/works/${workId}/execution`;
    const beforeUnsupported = await readDocument();
    const executionResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url() === executionApi);
    await feedback(page).getByRole('button', { name: '로컬 모델에 제안 요청', exact: true }).click();
    const refused = await executionResponse; expect(refused.status()).toBe(200);
    expect(await refused.json()).toMatchObject({ execution: { phase: 'unsupported', reason: 'unsupported_target' } });
    await expect(feedback(page).getByText('지원 범위 밖', { exact: true })).toBeVisible();
    await expect(feedback(page).getByText('이 대상의 자동 편집은 아직 지원하지 않습니다.', { exact: true })).toBeVisible();
    expect((await readDocument()).snapshotText).toBe(beforeUnsupported.snapshotText);
    const executionRead = await page.request.get(executionApi, { headers: headers() });
    const held = await executionRead.json() as { execution: { id: string; provenance?: unknown } };
    expect(held.execution.provenance).toBeUndefined();
    await feedback(page).getByRole('button', { name: '의견 닫기', exact: true }).click();
    await paragraph(page).click(); await page.keyboard.press('Meta+z');
    await word(page).getByRole('button', { name: /^(저장|저장 확인·재시도)$/ }).click();
    await expect.poll(async () => JSON.parse((await readDocument()).snapshotText).document).toEqual(beforeTree);
    await paragraph(page).click(); await page.keyboard.press('Meta+Shift+z');
    await word(page).getByRole('button', { name: /^(저장|저장 확인·재시도)$/ }).click();
    await expect.poll(async () => JSON.parse((await readDocument()).snapshotText).document).toEqual(expected);
    await page.reload(); await expect(word(page)).toBeVisible(); await page.getByRole('button', { name: '직접 편집', exact: true }).click();
    await page.getByRole('button', { name: '의견 1', exact: true }).click();
    await feedback(page).getByRole('button', { name: '대상 영역', exact: true }).click();
    await expect.poll(() => page.evaluate(() => {
      const selection = getSelection(); const owner = selection?.anchorNode?.parentElement?.closest('.w-paragraph');
      return { text: selection?.toString(), paragraph: Array.from(document.querySelectorAll('.w-paragraph')).indexOf(owner!) };
    })).toEqual({ text: sentence, paragraph: 0 });
    const frozenProject = await readProject(), frozenDocument = await readDocument();
    profileBSafe = false; b = await launchPrivateProfile(profileB); const viewer = await b.context.newPage(), viewerRequests = track(viewer);
    await login(viewer, 'beta-viewer', projectUrl); const viewerHeaders = { Authorization: viewerRequests.bearer };
    const denied = await viewer.request.patch(projectApi, { headers: viewerHeaders, data: firstCommentPayload }); expect(denied.status()).toBe(403);
    const deniedSave = await viewer.request.put(`${documentApi}/snapshot`, { headers: viewerHeaders, data: saves[0] }); expect(deniedSave.status()).toBe(403);
    const deniedWork = await viewer.request.post(executionApi, { headers: viewerHeaders, data: { expectedRevision: frozenProject.project.revision } }); expect(deniedWork.status()).toBe(403);
    expect((await viewer.request.get(`${origin}/api/v1/tenants/${status.betaTenantId}/projects/${projectId}`, { headers: viewerHeaders })).status()).toBe(404);
    expect((await page.request.get(`${origin}/api/v1/tenants/${status.betaTenantId}/projects/${projectId}`, { headers: headers() })).status()).toBe(403);
    await privateControl({ action: 'beta-active', active: false }); restoreBeta = true;
    expect((await viewer.request.get(`${projectApi}/pins/${comment.pin.id}`, { headers: viewerHeaders })).status()).toBe(403);
    expect((await viewer.request.patch(projectApi, { headers: viewerHeaders, data: workRequests[0] })).status()).toBe(403);
    expect((await viewer.request.put(`${documentApi}/snapshot`, { headers: viewerHeaders, data: saves[0] })).status()).toBe(403);
    expect(await readProject()).toEqual(frozenProject); expect((await readDocument()).snapshotText).toBe(frozenDocument.snapshotText);
    requests.phase = 'same-database-restart'; checkpoint();
    const beforeRestart = await privateControl<RealStatus>({ action: 'status' });
    await privateControl({ action: 'api-stop' }); await privateControl({ action: 'db-stop' }); await privateControl({ action: 'db-start' });
    const afterRestart = await privateControl<RealStatus>({ action: 'api-start' });
    expect(afterRestart.databaseIdentity).toBe(beforeRestart.databaseIdentity); expect(afterRestart.postgresPid).not.toBe(beforeRestart.postgresPid); expect(afterRestart.apiPid).not.toBe(beforeRestart.apiPid);
    expect(await readProject()).toEqual(frozenProject); expect((await readDocument()).snapshotText).toBe(frozenDocument.snapshotText);
    const restoredExecution = await page.request.get(executionApi, { headers: headers() }); expect(await restoredExecution.json()).toEqual(held);
    await page.reload(); await expect(word(page)).toBeVisible(); await page.getByRole('button', { name: '의견 1', exact: true }).click();
    await feedback(page).getByRole('button', { name: '대상 영역', exact: true }).click(); await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe(sentence);
    await page.screenshot({ path: test.info().outputPath('mixed-opinion-reopened.png') });
    evidence.projectId = projectId; evidence.commentId = comment.id; evidence.workId = workId; evidence.nativeBeforeHash = hash(initial.snapshotText); evidence.nativeAfterHash = hash(frozenDocument.snapshotText);
    evidence.commentOnlyNoDispatch = true; evidence.unsupportedBeforeInference = true; evidence.exactNativeUndoRedo = true;
    evidence.forwardBackwardKeyboard = true; evidence.sameFrozenReceipts = true; evidence.actualAuthorityDenied = true; evidence.syntheticComposition = true; evidence.sameDatabaseRestart = true;
    passed = true;
  } catch (error) {
    evidence.failure = 'acceptance_incomplete'; checkpoint();
    try { if (failedPage && !failedPage.isClosed() && new URL(failedPage.url()).origin === origin) {
      writeFileSync(join(directory, 'word-mixed-feedback-failure-ui.json'), JSON.stringify({ phase: requests?.phase, headings: await failedPage.getByRole('heading').allTextContents(), timeline: requests?.timeline }), { mode: 0o600 });
      await failedPage.screenshot({ path: test.info().outputPath('mixed-feedback-failure.png') });
    } } catch { evidence.failureUiStatus = 'diagnostic_failed'; checkpoint(); }
    throw error;
  } finally {
    const cleanup = async (step: string, operation: () => Promise<void>) => {
      const item = { step, status: 'pending' }; cleanupSteps.push(item); checkpoint();
      try { await operation(); item.status = 'complete'; } catch { item.status = 'failed'; }
      checkpoint(); return item.status === 'complete';
    };
    if (restoreBeta) await cleanup('restore-viewer', async () => { await privateControl({ action: 'beta-active', active: true }); });
    const stoppedA = a ? await cleanup('stop-writer-profile', () => stopPrivateProfile(a!.context, a!.pid)) : profileASafe;
    const stoppedB = b ? await cleanup('stop-viewer-profile', () => stopPrivateProfile(b!.context, b!.pid)) : profileBSafe;
    for (const [name, path, stopped] of [['writer', profileA, stoppedA], ['viewer', profileB, stoppedB]] as const) {
      if (stopped) await cleanup(`remove-${name}-profile`, async () => { rmSync(path, { recursive: true, force: true }); });
      else cleanupSteps.push({ step: `remove-${name}-profile`, status: 'unconfirmed' });
    }
    const cleanupComplete = cleanupSteps.every(step => step.status === 'complete');
    writeFileSync(evidenceFile, JSON.stringify({ status: passed && cleanupComplete ? 'passed' : 'incomplete', cleanup: cleanupComplete, timeline: requests?.timeline, cleanupSteps, ...evidence }), { mode: 0o600 });
    if (passed && !cleanupComplete) throw new Error('mixed_feedback_cleanup_incomplete');
  }
});
