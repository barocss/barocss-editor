import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { privateControl, launchPrivateProfile, stopPrivateProfile, type Inspection, type RealStatus } from './helpers/real-recovery-control';

const origin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const shell = (page: Page) => page.locator('[data-server-note-workspace]');
const tasks = (page: Page) => page.getByRole('complementary', { name: 'Note 작업', exact: true });
const review = (page: Page) => tasks(page).getByRole('region', { name: 'Note 제안 검토', exact: true });
const title = 'Fictional Wonffice onboarding';
const originalText = 'Wonffice에서 문서를 작성할 수 있습니다.';
const requestText = '제품 소개 문장을 명확하게 다듬어 주세요. 문서 작성과 프로젝트 작업을 한곳에서 관리한다는 내용을 한 문단으로 설명하세요. 줄바꿈은 넣지 마세요.';
interface Opened { document: { documentId: string; revision: number; snapshotHash: string }; snapshotText: string }
interface Execution { id: string; phase: string; appliedRevision?: number;
  input: { revision: number; snapshotText: string; target: { nodeId: string; text: string } };
  binding?: { product: string; operation: string; schema: string };
  proposal?: { replacement: string; reason: string; assumptions: string[] };
  provenance?: { kind: string; model: string; modelDigest: string; evalCount: number; promptEvalCount: number };
  expectedSnapshotText?: string; expectedSnapshotHash?: string }
interface Project { project: { revision: number; record: { id: string; works: { id: string; request: string }[];
  comments: { target: { kind: string; id: string; quote: string; selector: { version: number; pageId: string; paragraphIndex: number } } }[] } } }

test.use({ trace: 'off', video: 'off', actionTimeout: 15000, navigationTimeout: 30000 });
test.beforeAll(() => {
  if (!process.env.OFFICE_AUTH_REAL_FILE || !process.env.OFFICE_AUTH_CONTROL_FILE || process.env.OFFICE_LOCAL_AGENT_ENABLED !== 'true') {
    throw new Error('Real OIDC, private PostgreSQL control and the installed local model are required; this check cannot skip.');
  }
  expect(statSync(process.env.OFFICE_AUTH_REAL_FILE).mode & 0o077).toBe(0);
});
async function login(page: Page, alias: 'alpha-editor' | 'beta-viewer', url = origin) {
  await page.goto(url);
  await expect.poll(async () => await page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true }).isVisible() ||
    await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await page.locator('.ow-project-home').isVisible() || await shell(page).isVisible()).toBe(true);
  const enter = page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true });
  if (await enter.isVisible()) {
    await enter.click();
    await expect.poll(async () => await page.locator('#username').isVisible() ||
      await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() ||
      await page.locator('.ow-project-home').isVisible() || await shell(page).isVisible()).toBe(true);
    if (await page.locator('#username').isVisible()) {
      const fixture = JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8'));
      const account = fixture.users[alias];
      await page.locator('#username').fill(account.username ?? alias);
      await page.locator('#password').fill(account.password); await page.locator('#kc-login').click();
    }
  }
  await expect.poll(async () => await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() ||
    await page.locator('.ow-project-home').isVisible() || await shell(page).isVisible()).toBe(true);
  if (await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible()) {
    await page.getByRole('button', { name: /Synthetic Alpha/ }).click();
    await page.getByRole('button', { name: 'Alpha workspace', exact: true }).click();
  }
}
async function selectParagraph(page: Page, text: string) {
  const paragraph = shell(page).locator('.on-doc p').first(); await expect(paragraph).toHaveText(text);
  await paragraph.click(); await page.keyboard.press('Home');
  await page.keyboard.down('Shift');
  for (let i = 0; i < text.length; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe(text);
}

async function taskTheme(page: Page, selector: string) {
  await page.mouse.move(1, 1);
  const read = () => page.locator(selector).evaluate(element => {
    const style = getComputedStyle(element), canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    const rgba = (color: string) => { context.clearRect(0, 0, 1, 1); context.fillStyle = color;
      context.fillRect(0, 0, 1, 1); return Array.from(context.getImageData(0, 0, 1, 1).data); };
    const luminance = (color: number[]) => color.slice(0, 3).map(channel => {
      const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const panel = rgba(style.backgroundColor);
    const buttons = Array.from(element.querySelectorAll('.ow-note-task-list > button')).map(button => {
      const css = getComputedStyle(button), selected = button.getAttribute('aria-pressed') === 'true';
      const probe = document.createElement('span'); probe.style.display = 'none';
      probe.style.color = selected ? 'var(--ou-accent)' : 'var(--ou-ink)';
      probe.style.backgroundColor = selected ? 'var(--ou-accent-soft)' : 'transparent'; button.append(probe);
      const expected = getComputedStyle(probe), settled = css.color === expected.color && css.backgroundColor === expected.backgroundColor;
      probe.remove(); const background = rgba(css.backgroundColor), alpha = background[3] / 255;
      const painted = background.slice(0, 3).map((channel, index) => channel * alpha + panel[index] * (1 - alpha));
      const foregroundLuminance = luminance(rgba(css.color)), backgroundLuminance = luminance(painted);
      return { selected, disabled: (button as HTMLButtonElement).disabled, settled,
        color: css.color, background: css.backgroundColor, opacity: css.opacity,
        contrast: (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
        ink: css.getPropertyValue('--ou-ink').trim(), panel: css.getPropertyValue('--ou-panel').trim() };
    });
    return { color: style.color, background: style.backgroundColor, ink: style.getPropertyValue('--ou-ink').trim(),
      panel: style.getPropertyValue('--ou-panel').trim(), htmlTheme: document.documentElement.dataset.theme,
      bodyTheme: document.body.dataset.theme, buttons };
  });
  await expect.poll(async () => (await read()).buttons.every(button => button.settled)).toBe(true);
  const result = await read();
  for (const button of result.buttons) if (!button.disabled) expect(button.contrast, `${selector} selected=${button.selected}`).toBeGreaterThanOrEqual(4.5);
  return result;
}

test('real Note task generates a local-model proposal, applies one undoable draft and explicitly recovers the same Save while retaining later input', async ({ browserName }, info) => {
  test.setTimeout(1440000);
  expect(browserName).toBe('chromium');
  const directory = dirname(process.env.OFFICE_AUTH_CONTROL_FILE!);
  const evidenceFile = join(directory, 'note-task-evidence.json');
  const evidence: Record<string, unknown> = { status: 'incomplete', kind: 'real-oidc-api-private-postgres-live-local-model', physicalOsIme: 'not exercised' };
  const checkpoint = (phase: string) => { evidence.phase = phase; writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2), { mode: 0o600 }); };
  let a: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  let b: Awaited<ReturnType<typeof launchPrivateProfile>> | undefined;
  const profileA = mkdtempSync(join(directory, 'note-editor-')), profileB = mkdtempSync(join(directory, 'note-viewer-'));
  let revoked = false;
  let observedPage: Page | undefined;
  const pageErrors: string[] = [];
  try {
    checkpoint('login'); a = await launchPrivateProfile(profileA);
    const page = await a.context.newPage(); observedPage = page;
    page.on('pageerror', error => { pageErrors.push(error.message); });
    let bearer = ''; let nativeUpdates = 0; let modelRequests = 0;
    page.on('request', request => {
      if (request.headers().authorization) bearer = request.headers().authorization;
      if (request.method() === 'POST' && /\/execution$/.test(new URL(request.url()).pathname)) modelRequests++;
      if (request.method() === 'PUT' && /\/documents\/[0-9a-f-]+\/snapshot$/.test(new URL(request.url()).pathname)) nativeUpdates++;
    });
    await login(page, 'alpha-editor');
    const status = await privateControl<RealStatus>({ action: 'status' });
    const tenantApi = `${origin}/api/v1/tenants/${status.tenantId}`;
    const native = { stype: 'note', attributes: { title, pageId: randomUUID(), custom: 'keep-root' }, metadata: { loadedAt: 'authored-time', custom: 'keep-meta' }, content: [
      { stype: 'paragraph', attributes: { custom: 'keep-target' }, content: [{ stype: 'inline-text', text: originalText, marks: [] }] },
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Unrelated rich content', marks: [{ stype: 'bold', range: [0, 9] }], metadata: { custom: 'keep-rich' } }] }
    ], resources: [], pageReferences: [] };
    // Setup through the genuine authenticated API. The service mints the copy's page identity.
    const created = await page.request.post(`${tenantApi}/documents`, { headers: { Authorization: bearer }, data: {
      workspaceId: status.workspaceId, product: 'note', title, fileFormat: 'barocss-note', fileVersion: 1,
      snapshotText: `${JSON.stringify({ format: 'barocss-note', version: 1, document: native }, null, 2)}\n`,
      idempotencyKey: randomUUID(), importMode: 'new-page-copy' } });
    expect(created.status()).toBe(201); const before = await created.json() as Opened;
    const documentApi = `${tenantApi}/documents/${before.document.documentId}`;
    const inspect = () => privateControl<Inspection>({ action: 'inspect', documentId: before.document.documentId });
    const baseline = await inspect(); expect(baseline.document!.snapshotText).toBe(before.snapshotText);
    checkpoint('project-create');
    await page.getByRole('button', { name: '프로젝트 만들기', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '프로젝트 만들기', exact: true });
    await dialog.getByRole('textbox', { name: '프로젝트 이름', exact: true }).fill('Fictional Note task');
    await dialog.getByRole('textbox', { name: '프로젝트 목표', exact: true }).fill('제품 소개 문단을 검토하고 원본에 명시적으로 반영한다.');
    const projectResponse = page.waitForResponse(response => response.request().method() === 'POST' && /\/projects$/.test(new URL(response.url()).pathname));
    await dialog.getByRole('button', { name: '만들기', exact: true }).click();
    const initialProject = await (await projectResponse).json() as Project;
    const projectApi = `${tenantApi}/projects/${initialProject.project.record.id}`;
    await expect(page.getByRole('heading', { name: 'Fictional Note task', exact: true })).toBeVisible();
    const projectUrl = page.url();
    await page.getByRole('button', { name: '결과물 연결', exact: true }).click();
    const link = page.getByRole('dialog', { name: '결과물 연결', exact: true });
    await link.getByRole('textbox', { name: '결과물 이름', exact: true }).fill(title);
    await link.getByRole('button', { name: '연결할 원본', exact: true }).click();
    await page.locator(`[role="option"][id$="-note%3A${before.document.documentId}"]`).click();
    await link.getByRole('button', { name: '연결하기', exact: true }).click(); await expect(link).toBeHidden();
    const mainTasks = page.getByRole('region', { name: '작업', exact: true });
    await mainTasks.getByText('새 Note 작업', { exact: true }).click();
    await mainTasks.getByRole('button', { name: title, exact: true }).click();
    await expect(shell(page)).toBeVisible(); await expect(tasks(page)).toBeVisible();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/${status.workspaceId}/${before.document.documentId}`);
    const nativeUrl = page.url(); evidence.nativeUrl = nativeUrl; checkpoint('request-capture');
    await selectParagraph(page, originalText);
    await tasks(page).getByRole('button', { name: '선택한 문단으로 요청', exact: true }).click();
    const requestInput = tasks(page).getByRole('textbox', { name: 'Note 수정 요청 입력', exact: true });
    await requestInput.fill(requestText); await requestInput.focus(); await requestInput.press('Escape'); await expect(tasks(page)).toBeHidden();
    const taskToggle = shell(page).getByRole('button', { name: 'Note 작업', exact: true });
    await expect(taskToggle).toBeFocused(); await taskToggle.press('Enter'); await expect(tasks(page)).toBeVisible();
    await expect(requestInput).toHaveValue(requestText); expect(modelRequests).toBe(0);
    expect(nativeUpdates).toBe(0);
    await tasks(page).getByRole('textbox', { name: 'Note 수정 요청 입력', exact: true }).fill(requestText);
    let heldRequestBody: unknown;
    await page.route(projectApi, async route => {
      if (route.request().method() === 'PATCH' && route.request().postDataJSON().action?.type === 'request') {
        heldRequestBody = route.request().postDataJSON(); await route.abort('failed'); return;
      }
      await route.continue();
    });
    await tasks(page).getByRole('button', { name: '작업 요청 보관', exact: true }).click();
    await expect(tasks(page).getByRole('alert')).toBeVisible();
    await expect(requestInput).toHaveValue(requestText);
    const partialResponse = await page.request.get(projectApi, { headers: { Authorization: bearer } });
    expect(partialResponse.status()).toBe(200); const partial = await partialResponse.json() as Project;
    expect(partial.project.record.comments).toHaveLength(1); expect(partial.project.record.works).toHaveLength(0);
    expect(heldRequestBody).toBeDefined(); evidence.partialRequestFailure = partial;
    expect(modelRequests).toBe(0); expect(nativeUpdates).toBe(0);
    expect((await inspect()).document!.snapshotText).toBe(before.snapshotText);
    await page.unroute(projectApi);
    await tasks(page).getByRole('button', { name: '작업 요청 보관', exact: true }).click();
    await expect(review(page).getByRole('button', { name: '로컬 모델에 제안 요청', exact: true })).toBeVisible();
    const projectRead = await page.request.get(projectApi, { headers: { Authorization: bearer } }); expect(projectRead.status()).toBe(200);
    const current = await projectRead.json() as Project; expect(current.project.record.works).toHaveLength(1);
    expect(current.project.record.comments[0].target).toMatchObject({ kind: 'note-paragraph', quote: originalText,
      selector: { version: 1, pageId: JSON.parse(before.snapshotText).document.attributes.pageId, paragraphIndex: 0 } });
    expect((await inspect()).document!.snapshotText).toBe(before.snapshotText); expect(nativeUpdates).toBe(0);
    checkpoint('live-model-generation');
    const executionApi = `${projectApi}/works/${current.project.record.works[0].id}/execution`;
    const response = page.waitForResponse(response => response.request().method() === 'POST' && /\/execution$/.test(new URL(response.url()).pathname), { timeout: 900000 });
    await review(page).getByRole('button', { name: '로컬 모델에 제안 요청', exact: true }).click();
    const generated = await response; expect(generated.status()).toBe(200); const execution = (await generated.json() as { execution: Execution }).execution;
    evidence.execution = execution; checkpoint('proposal-review');
    expect(execution.phase).toBe('proposal'); expect(execution.binding).toMatchObject({ product: 'note', operation: 'note.paragraph.replace/v1', schema: 'barocss-note@1' });
    expect(execution.provenance).toMatchObject({ kind: 'live-local-model', model: 'qwen3.6:27b-coding',
      modelDigest: '3a12a518a499223fc5be0a6b43589f5c2809275e59572c29a73e0506ff67a735' });
    expect(execution.provenance!.evalCount).toBeGreaterThan(0); expect(execution.provenance!.promptEvalCount).toBeGreaterThan(0);
    expect(execution.input.snapshotText).toBe(before.snapshotText);
    const expected = JSON.parse(before.snapshotText); expected.document.content[0].content[0].text = execution.proposal!.replacement;
    expect(JSON.parse(execution.expectedSnapshotText!)).toEqual(expected); expect(execution.expectedSnapshotHash).toBe(hash(execution.expectedSnapshotText!));
    expect((await inspect()).document!.snapshotText).toBe(before.snapshotText); expect(nativeUpdates).toBe(0);
    await expect(review(page)).toContainText(execution.proposal!.replacement);
    await page.screenshot({ path: info.outputPath('note-task-review-light.png') });
    await page.emulateMedia({ colorScheme: 'dark' }); await page.screenshot({ path: info.outputPath('note-task-review-dark.png') });
    checkpoint('explicit-apply-history');
    const acceptance = page.waitForResponse(response => response.request().method() === 'POST' && /\/accept$/.test(new URL(response.url()).pathname));
    await review(page).getByRole('button', { name: '초안에 적용', exact: true }).click();
    const accepted = (await (await acceptance).json() as { execution: Execution }).execution;
    expect(accepted.input).toEqual(execution.input); expect(accepted.proposal).toEqual(execution.proposal);
    evidence.accepted = accepted;
    await expect(review(page).getByRole('status')).not.toHaveText('작업 결과를 확인하고 있습니다.');
    evidence.applyPanel = await review(page).innerText(); checkpoint('explicit-apply-history');
    await expect(shell(page).locator('.on-doc p').first()).toHaveText(execution.proposal!.replacement);
    await expect(review(page)).toContainText('초안에 적용됨 · 아직 저장하지 않음'); expect(nativeUpdates).toBe(0);
    await shell(page).locator('.on-doc p').first().click();
    await page.keyboard.press('Meta+z'); await expect(shell(page).locator('.on-doc p').first()).toHaveText(originalText);
    await page.keyboard.press('Meta+Shift+z'); await expect(shell(page).locator('.on-doc p').first()).toHaveText(execution.proposal!.replacement);
    expect((await inspect()).document!.snapshotText).toBe(before.snapshotText);
    const durableRecords = async () => await page.evaluate(({ tenant, workspace, documentId }) => Object.keys(localStorage)
      .filter(key => key.startsWith('wonffice.note.pending.v1:'))
      .map(key => JSON.parse(localStorage.getItem(key)!))
      .filter(record => record.scope.tenantId === tenant && record.scope.workspaceId === workspace && record.base.documentId === documentId),
      { tenant: status.tenantId, workspace: status.workspaceId, documentId: before.document.documentId }) as Array<{
        draftId: string; status: string; snapshotText: string; base: { expectedRevision: number }; attempt?: { snapshotText: string; idempotencyKey: string }
      }>;
    checkpoint('lost-save-response-later-input');
    let committed = false; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    let fixedBody: { snapshotText: string; expectedRevision: number; idempotencyKey: string } | undefined;
    await page.route(`${documentApi}/snapshot`, async route => {
      if (route.request().method() !== 'PUT') return route.continue();
      fixedBody = route.request().postDataJSON();
      const reply = await route.fetch(); expect(reply.status()).toBe(200); committed = true;
      await gate; await route.abort('failed');
    });
    await review(page).getByRole('button', { name: '이 변경 저장하고 확인', exact: true }).click();
    await expect.poll(() => committed).toBe(true);
    const paragraph = shell(page).locator('.on-doc p').first(); await paragraph.click(); await page.keyboard.press('End');
    await page.keyboard.insertText(' Later local draft.');
    await expect(paragraph).toHaveText(`${execution.proposal!.replacement} Later local draft.`);
    evidence.durableBeforeLostResponse = await durableRecords(); checkpoint('later-input-before-lost-response');
    release(); await expect(review(page)).toContainText('저장을 확인하지 못했습니다.');
    evidence.durableBeforeReceiptRecovery = await durableRecords(); checkpoint('later-input-before-receipt-recovery');
    await page.unroute(`${documentApi}/snapshot`);
    expect(fixedBody!.snapshotText).toBe(execution.expectedSnapshotText); expect(fixedBody!.expectedRevision).toBe(before.document.revision);
    const stored = await inspect(); expect(stored.document!.snapshotText).toBe(execution.expectedSnapshotText);
    expect(stored.document!.revision).toBe(before.document.revision + 1); expect(stored.receiptCount).toBe(baseline.receiptCount + 1);
    checkpoint('explicit-fixed-receipt-recovery');
    await review(page).getByRole('button', { name: '이 변경 저장하고 확인', exact: true }).click();
    await expect(review(page)).toContainText('원본 저장 확인됨'); expect(nativeUpdates).toBe(1);
    evidence.durableAfterReceiptRecovery = await durableRecords(); checkpoint('later-input-after-receipt-recovery');
    await expect(paragraph).toHaveText(`${execution.proposal!.replacement} Later local draft.`);
    expect((await inspect()).receiptCount).toBe(stored.receiptCount);
    const recordResponse = await page.request.get(executionApi, { headers: { Authorization: bearer } });
    expect(recordResponse.status()).toBe(200); expect((await recordResponse.json() as { execution: Execution }).execution.phase).toBe('applied');
    evidence.fixedSave = { idempotencyKey: fixedBody!.idempotencyKey, snapshotHash: hash(fixedBody!.snapshotText), expectedRevision: fixedBody!.expectedRevision };
    checkpoint('native-reload'); await page.reload(); await expect(shell(page)).toBeVisible();
    // Reload displays confirmed server bytes. Later input stays a protected,
    // deliberately recoverable draft; it cannot silently rebase onto revision 2.
    await expect(shell(page).locator('.on-doc p').first()).toHaveText(execution.proposal!.replacement);
    const durable = await durableRecords();
    const laterExpected = structuredClone(expected); laterExpected.document.content[0].content[0].text += ' Later local draft.';
    evidence.durableAfterReload = durable; checkpoint('later-input-after-reload');
    const laterDraft = durable.find(record => record.status === 'draft' && JSON.parse(record.snapshotText).document.content[0].content[0].text === laterExpected.document.content[0].content[0].text);
    expect(laterDraft).toBeDefined(); expect(JSON.parse(laterDraft!.snapshotText)).toEqual(laterExpected);
    expect(laterDraft!.base.expectedRevision).toBe(before.document.revision);
    expect(durable.find(record => record.status === 'confirmed' && record.attempt?.idempotencyKey === fixedBody!.idempotencyKey)?.attempt?.snapshotText).toBe(execution.expectedSnapshotText);
    evidence.laterDraft = { draftId: laterDraft!.draftId, snapshotHash: hash(laterDraft!.snapshotText), base: laterDraft!.base };
    const menu = shell(page).getByRole('menubar', { name: '문서 메뉴', exact: true });
    await menu.getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
    await page.getByRole('menu', { name: '문서 메뉴', exact: true }).getByRole('menuitemcheckbox', { name: '문서 작업', exact: true }).click();
    await shell(page).getByRole('button', { name: `초안 복구 ${title} ${laterDraft!.draftId.slice(0, 8)}`, exact: true }).click();
    await expect(shell(page).locator('.on-doc p').first()).toHaveText(`${execution.proposal!.replacement} Later local draft.`);
    expect(nativeUpdates).toBe(1); expect((await inspect()).receiptCount).toBe(stored.receiptCount);
    checkpoint('project-task-return'); await page.goto(projectUrl);
    await expect(page.getByRole('region', { name: '작업', exact: true })).toBeVisible();
    await page.getByRole('region', { name: '작업', exact: true }).getByRole('button', { name: new RegExp(requestText.slice(0, 15)) }).click();
    await expect(page.locator('.ow-note-task-detail')).toContainText('원본 저장 확인됨');
    checkpoint('explicit-decline'); await page.goto(nativeUrl); await expect(shell(page)).toBeVisible();
    await expect(shell(page).locator('.on-doc p').first()).toHaveText(execution.proposal!.replacement);
    await selectParagraph(page, execution.proposal!.replacement);
    await tasks(page).getByRole('button', { name: '선택한 문단으로 요청', exact: true }).click();
    await tasks(page).getByRole('textbox', { name: 'Note 수정 요청 입력', exact: true }).fill('제품 소개를 더 짧은 한 문단으로 다듬어 주세요. 줄바꿈은 넣지 마세요.');
    await tasks(page).getByRole('button', { name: '작업 요청 보관', exact: true }).click();
    await expect(tasks(page).getByRole('region', { name: 'Note 제안 검토', exact: true }).last().getByRole('button', { name: '로컬 모델에 제안 요청', exact: true })).toBeVisible();
    const secondRequest = await page.request.get(projectApi, { headers: { Authorization: bearer } });
    expect(secondRequest.status()).toBe(200); const secondRecord = await secondRequest.json() as Project;
    expect(secondRecord.project.record.works).toHaveLength(2); evidence.secondRequest = secondRecord; checkpoint('second-request-confirmed');
    await page.goto(projectUrl);
    const taskList = page.getByRole('region', { name: '작업', exact: true });
    await taskList.getByRole('button', { name: /제품 소개를 더 짧은/ }).click();
    const declineReview = page.locator('.ow-note-task-detail').getByRole('region', { name: 'Note 제안 검토', exact: true });
    await expect(declineReview).toContainText('요청 보관됨'); expect(modelRequests).toBe(1);
    const declineResponse = page.waitForResponse(response => response.request().method() === 'POST' && /\/execution$/.test(new URL(response.url()).pathname), { timeout: 900000 });
    await declineReview.getByRole('button', { name: '로컬 모델에 제안 요청', exact: true }).click();
    await expect(declineReview.getByRole('status')).toHaveText('작업 결과를 확인하고 있습니다.');
    const declinedProposal = (await (await declineResponse).json() as { execution: Execution }).execution;
    expect(declinedProposal.phase).toBe('proposal'); expect(declinedProposal.provenance!.kind).toBe('live-local-model');
    const decline = page.waitForResponse(response => response.request().method() === 'POST' && /\/reject$/.test(new URL(response.url()).pathname));
    await declineReview.getByRole('button', { name: '제안 거절', exact: true }).click();
    const declined = (await (await decline).json() as { execution: Execution }).execution;
    expect(declined.phase).toBe('rejected'); await expect(declineReview).toContainText('제안 거절');
    await page.emulateMedia({ colorScheme: 'light' });
    evidence.koreanTaskLight = await taskTheme(page, '.ow-project-home .ow-note-tasks');
    await page.screenshot({ path: info.outputPath('note-task-main-light.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    evidence.koreanTaskDark = await taskTheme(page, '.ow-project-home .ow-note-tasks');
    await page.screenshot({ path: info.outputPath('note-task-main-dark.png') });
    expect(modelRequests).toBe(2); await page.goto(nativeUrl); await expect(shell(page)).toBeVisible();
    await expect(shell(page).locator('.on-doc p').first()).toHaveText(execution.proposal!.replacement);
    expect((await inspect()).document!.snapshotText).toBe(execution.expectedSnapshotText);
    expect((await inspect()).receiptCount).toBe(stored.receiptCount); expect(nativeUpdates).toBe(1);
    evidence.declined = declined; checkpoint('decline-confirmed');
    // A separately mounted English task component uses this genuine authorized
    // repository. This is desktop component locale proof, not an application
    // language preference or an English native-editor claim.
    checkpoint('english-task-component');
    const entry = await (await page.request.get('/src/main.tsx')).text();
    const react = entry.match(/"([^"\n]*\/react\.js\?[^"\n]+)"/)?.[1];
    const client = entry.match(/"([^"\n]*\/react-dom_client\.js\?[^"\n]+)"/)?.[1];
    expect(react).toBeTruthy(); expect(client).toBeTruthy();
    await page.evaluate(async ({ react, client, sourceRoot, tenant, workspace, project }) => {
      const React = (await import(react!)).default as typeof import('react');
      const { createRoot } = (await import(client!)).default as typeof import('react-dom/client');
      const { OfficeLocaleProvider } = await import(`/@fs${sourceRoot}/packages/office-ui/src/index.ts`);
      const { ProjectTaskPanel } = await import(`/@fs${sourceRoot}/packages/office-workspace/src/project-task-panel.tsx`);
      const { serverProjectRepository } = await import(`/@fs${sourceRoot}/apps/office/src/project-client.ts`);
      const repository = serverProjectRepository(tenant, workspace, 'editor');
      const stored = await repository.read(project); if (!stored) throw new Error('Authorized project is missing');
      const documents = await repository.documents();
      const mount = document.createElement('div'); mount.dataset.noteTaskLocaleCheck = 'en'; mount.className = 'ow-project-home';
      Object.assign(mount.style, { position: 'fixed', inset: '0', zIndex: '1000', overflow: 'auto', background: 'var(--ou-panel)' });
      document.body.append(mount); const root = createRoot(mount);
      root.render(React.createElement(OfficeLocaleProvider, { locale: 'en', children: React.createElement(ProjectTaskPanel,
        { record: stored.record, revision: stored.revision, repository, documents, busy: false, onOpen: () => {} }) }));
      mount.addEventListener('note-task-locale-cleanup', () => { root.unmount(); mount.remove(); }, { once: true });
    }, { react, client, sourceRoot: fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, ''),
      tenant: status.tenantId, workspace: status.workspaceId, project: initialProject.project.record.id });
    const english = page.locator('[data-note-task-locale-check="en"]');
    await expect(english.getByRole('region', { name: 'Tasks', exact: true })).toBeVisible();
    await english.getByRole('button', { name: /제품 소개를 더 짧은/ }).click();
    await expect(english.getByRole('region', { name: 'Note proposal review', exact: true })).toContainText('Proposal declined');
    await expect(english.getByRole('button', { name: 'Open original and review', exact: true })).toBeVisible();
    await expect(english.getByText('Execution evidence', { exact: true })).toBeVisible();
    await page.emulateMedia({ colorScheme: 'light' }); evidence.englishTaskLight = await taskTheme(page, '[data-note-task-locale-check="en"] .ow-note-tasks'); await page.screenshot({ path: info.outputPath('note-task-english-light.png') });
    await page.emulateMedia({ colorScheme: 'dark' }); evidence.englishTaskDark = await taskTheme(page, '[data-note-task-locale-check="en"] .ow-note-tasks'); await page.screenshot({ path: info.outputPath('note-task-english-dark.png') });
    await english.evaluate(element => element.dispatchEvent(new Event('note-task-locale-cleanup')));
    expect(modelRequests).toBe(2); expect(nativeUpdates).toBe(1);
    expect((await inspect()).receiptCount).toBe(stored.receiptCount);
    evidence.englishDesktop = 'Actual task component, genuine authorized project/execution reads; application language preference and native editor not claimed';
    checkpoint('server-restart-and-independent-viewer');
    await privateControl({ action: 'api-stop' }); await privateControl({ action: 'db-stop' });
    await privateControl({ action: 'db-start' }); await privateControl({ action: 'api-start' });
    expect((await inspect()).document!.snapshotText).toBe(execution.expectedSnapshotText);
    b = await launchPrivateProfile(profileB); const viewer = await b.context.newPage(); let viewerBearer = '';
    viewer.on('request', request => { if (request.headers().authorization) viewerBearer = request.headers().authorization; });
    await login(viewer, 'beta-viewer', nativeUrl); await expect(shell(viewer)).toBeVisible();
    await expect(shell(viewer).locator('.on-doc p').first()).toHaveText(execution.proposal!.replacement);
    const forbidden = await viewer.request.put(`${documentApi}/snapshot`, { headers: { Authorization: viewerBearer }, data: {
      snapshotText: execution.expectedSnapshotText, expectedRevision: stored.document!.revision, idempotencyKey: randomUUID() } });
    expect(forbidden.status()).toBe(403); expect((await inspect()).receiptCount).toBe(stored.receiptCount);
    const foreign = await viewer.request.get(`${origin}/api/v1/tenants/${status.betaTenantId}/documents/${before.document.documentId}`, { headers: { Authorization: viewerBearer } });
    expect([403, 404]).toContain(foreign.status());
    await privateControl({ action: 'beta-active', active: false }); revoked = true;
    const denied = await viewer.request.get(documentApi, { headers: { Authorization: viewerBearer } }); expect(denied.status()).toBe(403);
    expect((await inspect()).receiptCount).toBe(stored.receiptCount);
    checkpoint('browser-restart'); await stopPrivateProfile(b.context, b.pid); b = undefined;
    b = await launchPrivateProfile(profileB); const reopened = await b.context.newPage();
    await privateControl({ action: 'beta-active', active: true }); revoked = false;
    await login(reopened, 'beta-viewer', nativeUrl); await expect(shell(reopened)).toBeVisible();
    await expect(shell(reopened).locator('.on-doc p').first()).toHaveText(execution.proposal!.replacement);
    expect((await inspect()).document!.snapshotText).toBe(execution.expectedSnapshotText);
    evidence.status = 'passed'; checkpoint('complete');
  } catch (error) {
    try {
      if (observedPage && !observedPage.isClosed()) {
        evidence.failureObservation = { phase: evidence.phase, pathname: new URL(observedPage.url()).pathname,
          text: await observedPage.locator('body').innerText(), pageErrors };
        await observedPage.screenshot({ path: info.outputPath('note-task-failure.png') });
        checkpoint(String(evidence.phase));
      }
    } catch { evidence.failureObservationUnavailable = true; }
    throw error;
  } finally {
    if (revoked) await privateControl({ action: 'beta-active', active: true });
    if (b) await stopPrivateProfile(b.context, b.pid); if (a) await stopPrivateProfile(a.context, a.pid);
    evidence.browserCleanup = true; checkpoint(String(evidence.phase));
  }
});
