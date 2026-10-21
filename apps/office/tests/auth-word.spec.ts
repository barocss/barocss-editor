import { projectFeedbackAction } from './project-feedback-menu.helpers';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect, type Page, type Locator } from '@playwright/test';
import type { INode } from '../../../packages/datastore/src/types';
import { createStarterDocument } from '../../../packages/office-word/src/starter-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';

const tenantId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const documentId = '00000000-0000-4000-8000-000000000003';
const secondDocumentId = '00000000-0000-4000-8000-000000000004';
const issuer = 'http://127.0.0.1:18180/realms/wonffice-local';
const origin = `http://127.0.0.1:${process.env.OFFICE_AUTH_TEST_PORT ?? '5191'}`;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const shell = (page: Page) => page.locator('[data-server-word-workspace]');
const save = (page: Page) => shell(page).getByRole('button', { name: /^(저장|저장 확인·재시도)$/ });
async function setup(page: Page, options: { viewer?: boolean; lostAck?: boolean; wrongProduct?: boolean; mode?: string; second?: boolean; failSave?: boolean; tree?: boolean; document?: INode } = {}) {
  let snapshotText = wordFileText(options.document ?? createStarterDocument(), '');
  let revision = 1;
  let viewer = !!options.viewer;
  const writes: Record<string, unknown>[] = [];
  const receipts = new Map<string, unknown>();
  let lose = !!options.lostAck;
  const head = () => ({ tenantId, workspaceId, documentId, product: options.wrongProduct ? 'note' : 'word', title: 'Server Word',
    metadataRevision: 1, mode: options.mode ?? 'snapshot', revision, pageId: null, documentKey: `wonffice-${tenantId}-${documentId}`,
    fileFormat: 'barocss-word', fileVersion: 1, snapshotHash: hash(snapshotText) });
  const secondText = wordFileText(createStarterDocument(), '');
  const secondHead = () => ({ ...head(), documentId: secondDocumentId, title: 'Second server Word', documentKey: `wonffice-${tenantId}-${secondDocumentId}`, revision: 1, snapshotHash: hash(secondText) });
  const json = (value: unknown) => ({ contentType: 'application/json', body: JSON.stringify(value) });
  await page.route(`${issuer}/.well-known/openid-configuration`, route => route.fulfill({ ...json({ issuer,
    authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, end_session_endpoint: `${issuer}/logout` }), headers: { 'access-control-allow-origin': '*' } }));
  await page.route(`${issuer}/auth**`, route => route.fulfill({ contentType: 'text/html', body: `<script>location.replace('${origin}/auth/callback?code=synthetic&state=${new URL(route.request().url()).searchParams.get('state')}')</script>` }));
  await page.route(`${issuer}/token`, route => route.fulfill({ ...json({ access_token: 'synthetic', token_type: 'Bearer', expires_in: 300 }), headers: { 'access-control-allow-origin': '*' } }));
  await page.route('**/api/v1/me', route => route.fulfill(json({ issuer, subject: 'word-synthetic', tenants: [{ tenantId, name: 'Word Company', role: viewer ? 'viewer' : 'editor' }], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/access`, route => route.fulfill(json({ tenantId, role: viewer ? 'viewer' : 'editor' })));
  await page.route(`**/api/v1/tenants/${tenantId}/workspaces**`, route => route.fulfill(json({ workspaces: [{ id: workspaceId, name: 'Word workspace' }], nextCursor: null })));
  if (!options.tree) await page.route(`**/api/v1/tenants/${tenantId}/projects?**`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ projects: [], nextCursor: null }) }));
  // Exact item discovery must verify project absence; list absence is not enough.
  await page.route(`**/api/v1/tenants/${tenantId}/projects/*`, route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ status: 'not_found' }) }));
  await page.route(`**/api/v1/tenants/${tenantId}/documents?**`, route => route.fulfill(json({ documents: ['word', null].includes(new URL(route.request().url()).searchParams.get('product')) ? [head(), ...(options.second ? [secondHead()] : [])] : [], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/documents/${documentId}`, route => route.fulfill(json({ document: head(), ...(options.mode ? {} : { snapshotText }) })));
  if (options.second) await page.route(`**/api/v1/tenants/${tenantId}/documents/${secondDocumentId}`, route => route.fulfill(json({ document: secondHead(), snapshotText: secondText })));
  await page.route(`**/api/v1/tenants/${tenantId}/receipts/**`, route => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);
    return route.fulfill(receipts.has(key) ? json(receipts.get(key)) : { status: 404, ...json({ status: 'not_found' }) });
  });
  await page.route(`**/api/v1/tenants/${tenantId}/documents/${documentId}/snapshot`, async route => {
    const body = route.request().postDataJSON(); writes.push(body);
    if (options.failSave) return route.fulfill({ status: 503, ...json({ status: 'unavailable' }) });
    if (viewer) return route.fulfill({ status: 403, ...json({ status: 'forbidden' }) });
    if (body.expectedRevision !== revision) return route.fulfill({ status: 409, ...json({ status: 'revision_conflict' }) });
    snapshotText = body.snapshotText; revision++;
    const receipt = { operation: 'update', idempotencyKey: body.idempotencyKey,
      requestHash: hash(JSON.stringify(['update', documentId, body.expectedRevision, body.snapshotText])), document: head(), snapshotText };
    receipts.set(body.idempotencyKey, receipt);
    if (lose) { lose = false; return route.abort('failed'); }
    return route.fulfill(json(receipt));
  });
  if (options.tree) {
    const projects = ['Alpha', 'Beta'].map((title, index) => ({ id: `00000000-0000-4000-8000-00000000000${index + 5}`, title,
      goal: '', archived: false, comments: [], works: [], activities: [], drafts: {},
      results: [{ id: `${title}-result`, name: 'Stale alias', document: { product: 'word', id: documentId }, inputs: [] }] }));
    const projectValue = (record: typeof projects[number]) => ({ tenantId, workspaceId, actor: { kind: 'human', id: 'synthetic-member' }, project: { revision: 1, record } });
    await page.route(`**/api/v1/tenants/${tenantId}/projects?**`, route => route.fulfill(json({ projects: projects.map(projectValue), nextCursor: null })));
    for (const record of projects) await page.route(`**/api/v1/tenants/${tenantId}/projects/${record.id}`, route => route.fulfill(json(projectValue(record))));
  }
  await page.goto(`/?tenant=${tenantId}&workspace=${workspaceId}&document=${documentId}&product=word${options.tree ? '&project=00000000-0000-4000-8000-000000000005&mode=read' : ''}`);
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  return { writes, text: () => snapshotText, revision: () => revision, setViewer: (value: boolean) => { viewer = value; } };
}
async function type(page: Page, text: string) {
  const paragraph = shell(page).locator('.w-paragraph').first();
  await paragraph.click(); await page.keyboard.type(text);
}

async function openWordActions(page: Page) {
  await shell(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: '열기…', exact: true }).click();
  await expect(page.getByRole('region', { name: '문서 작업', exact: true })).toBeVisible();
}

test('Word discovery mounts full editor and confirms native save without bootstrap globals', async ({ page }) => {
  const state = await setup(page);
  await expect(shell(page).locator('.w-paragraph').first()).toBeVisible();
  expect(await page.evaluate(() => typeof (window as unknown as { editor?: { run?: unknown } }).editor?.run)).toBe('undefined');
  await type(page, 'Word typed input');
  await expect(shell(page).locator('[data-save-status]')).toHaveText('저장되지 않음');
  await save(page).click();
  await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  expect(state.writes).toHaveLength(1); expect(state.revision()).toBe(2);
  expect(state.text()).toContain('Word typed input');
  await expect(shell(page).locator('.office-document-bar').getByRole('button', { name: 'Word 파일 내보내기', exact: true })).toHaveCount(0);
  await shell(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Word 파일 내보내기', exact: true }).click();
  const file = await downloaded, path = await file.path();
  expect(path).not.toBeNull();
  expect(JSON.parse(await readFile(path!, 'utf8')).document).toEqual(JSON.parse(state.text()).document);
  expect(state.writes).toHaveLength(1);
});

test('lost acknowledgement retains fixed request and confirms receipt without duplicate write', async ({ page }) => {
  const state = await setup(page, { lostAck: true });
  await type(page, 'First fixed input'); await save(page).click();
  await expect(shell(page).locator('[data-save-status]')).toHaveText('저장 확인 필요');
  await type(page, ' Later input');
  const rows = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.word.pending.v1:')).map(key => JSON.parse(localStorage.getItem(key)!)));
  expect(rows.some(row => row.status === 'pending' && row.snapshotText.includes('First fixed input'))).toBe(true);
  expect(rows.some(row => row.status === 'draft' && row.snapshotText.includes('Later input'))).toBe(true);
  await save(page).click();
  await expect(shell(page).locator('[data-save-status]')).toHaveText('저장되지 않음');
  expect(state.writes).toHaveLength(1);
  await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  expect(state.writes).toHaveLength(2); expect(state.text()).toContain('Later input');
});

test('viewer can select and copy but cannot type, replace, format or save', async ({ page }) => {
  const state = await setup(page, { viewer: true });
  const paragraph = shell(page).locator('.w-paragraph').first(); await expect(paragraph).toBeVisible();
  await paragraph.click(); await page.keyboard.type('Denied mutation'); await page.keyboard.press('ControlOrMeta+b');
  await expect(paragraph).not.toContainText('Denied mutation'); await expect(save(page)).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
  await expect(shell(page).locator('[contenteditable=true]')).toHaveCount(0);
});

for (const mode of ['initializing', 'collaborative']) test(`Word ${mode} never mounts snapshot editor`, async ({ page }) => {
  await setup(page, { mode }); await expect(page.getByRole('heading', { name: '공동 편집을 열 수 없습니다' })).toBeVisible();
  await expect(shell(page)).toHaveCount(0);
});
test('wrong-product direct URL is refused before native editor mounts', async ({ page }) => {
  await setup(page, { wrongProduct: true }); await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
  await expect(shell(page)).toHaveCount(0);
});

test('quota failure retains latest visible input and blocks Office exit until durable retry', async ({ page }) => {
  const state = await setup(page);
  await expect(shell(page).locator('.w-paragraph').first()).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreWordStorage: () => void }).restoreWordStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('wonffice.word.pending.v1:')) throw new DOMException('Synthetic quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await type(page, 'Protected latest input');
  await expect(shell(page).locator('[data-save-status]')).toHaveText('복구 저장 실패');
  const before = page.url();
  await page.getByRole('button', { name: '편집 집중 보기', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '작업 공간 파일 탐색' })).toBeHidden();
  await page.getByRole('button', { name: '자료함으로 돌아가기' }).click();
  await expect(shell(page).locator('.w-paragraph').first()).toContainText('Protected latest input');
  await expect(page.getByText('현재 입력을 복구 가능한 저장소에 보관하지 못했습니다.', { exact: false })).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await page.getByRole('navigation', { name: '작업 공간 도구' }).getByRole('button', { name: '로그아웃', exact: true }).click();
  expect(page.url()).toBe(before);
  await expect(shell(page).locator('.w-paragraph').first()).toContainText('Protected latest input');
  expect(state.writes).toHaveLength(0);
  await page.evaluate(() => (window as unknown as { restoreWordStorage: () => void }).restoreWordStorage());
  await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  expect(state.text()).toContain('Protected latest input');
});

test('reload exposes a separate protected last-input draft without replacing server head', async ({ page }) => {
  await setup(page); await type(page, 'Reload latest input');
  await expect(shell(page).locator('[data-save-status]')).toHaveText('저장되지 않음');
  await page.reload();
  await expect.poll(async () => await shell(page).isVisible() || await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible()).toBe(true);
  if (await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible()) await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await expect(shell(page).locator('.w-paragraph').first()).not.toContainText('Reload latest input');
  await openWordActions(page);
  const recover = shell(page).getByRole('button', { name: /저장된 Word 초안 복구/ });
  await expect(recover).toHaveCount(1);
  const stored = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.word.pending.v1:')).map(key => JSON.parse(localStorage.getItem(key)!)));
  expect(stored[0].snapshotText).toContain('Reload latest input');
  page.once('dialog', dialog => dialog.accept());
  await recover.click();
  await expect(shell(page).locator('.w-paragraph').first()).toContainText('Reload latest input');
  await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
});

test('fresh viewer focus revalidation retains the authorized read-only Word runtime', async ({ page }) => {
  await setup(page, { viewer: true });
  await expect(shell(page).locator('.w-paragraph').first()).toBeVisible();
  const me = page.waitForResponse(response => response.url().endsWith('/api/v1/me'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await me;
  await expect(shell(page).locator('.w-paragraph').first()).toBeVisible();
  await expect(save(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toHaveCount(0);
});

test('temporary same-account access recheck retains a fixed Word request and supports retry', async ({ page }) => {
  const state = await setup(page);
  await type(page, 'Focus check input');
  let releaseList!: () => void, releaseIdentity!: () => void;
  const listHeld = new Promise<void>(resolve => { releaseList = resolve; });
  const identityHeld = new Promise<void>(resolve => { releaseIdentity = resolve; });
  let enteredList!: () => void, enteredIdentity!: () => void;
  const waitingList = new Promise<void>(resolve => { enteredList = resolve; });
  const waitingIdentity = new Promise<void>(resolve => { enteredIdentity = resolve; });
  await page.route(`**/api/v1/tenants/${tenantId}/documents?**`, async route => { enteredList(); await listHeld; await route.fallback(); }, { times: 1 });
  await page.route('**/api/v1/me', async route => { enteredIdentity(); await identityHeld; await route.fallback(); }, { times: 1 });
  await save(page).click(); await waitingList;
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await waitingIdentity;
  releaseList();
  await expect(shell(page).locator('[data-save-status]')).toHaveText('저장 확인 필요');
  releaseIdentity();
  await expect(shell(page).locator('.w-paragraph').first()).toBeVisible();
  await expect(shell(page).locator('.w-paragraph').first()).toContainText('Focus check input');
  await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  expect(state.writes).toHaveLength(1);
});

test('unsupported native file leaves current Word model and source file unchanged', async ({ page }) => {
  await setup(page); await type(page, 'Retained current Word');
  const source = JSON.stringify({ format: 'barocss-word', version: 1, document: { stype: 'document', content: [{ stype: 'unknownWordNode', text: 'Unsupported source' }] } });
  page.once('dialog', dialog => dialog.accept());
  await openWordActions(page);
  await shell(page).getByLabel('Word 원본 파일로 새 서버 사본 준비').setInputFiles({ name: 'unsupported.word.json', mimeType: 'application/json', buffer: Buffer.from(source) });
  await expect(shell(page).getByText('지원하지 않는 Word 파일입니다.', { exact: false })).toBeVisible();
  await expect(shell(page).locator('.w-paragraph').first()).toContainText('Retained current Word');
  expect(JSON.parse(source).document.content[0].stype).toBe('unknownWordNode');
});

test('selected Word tools retire while a save owns the current busy document', async ({ page }) => {
  const state = await setup(page);
  await type(page, 'Busy owned Word input');
  await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  const tools = page.getByRole('toolbar', { name: '선택한 Word 글 서식 도구', exact: true });
  await expect(tools).toBeVisible();
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  await page.route(`**/api/v1/tenants/${tenantId}/documents?**`, async route => {
    entered(); await held; await route.fallback();
  }, { times: 1 });
  await save(page).click(); await waiting;
  await expect(shell(page).locator('[data-save-status]')).toHaveText('저장 중…');
  await expect(tools).toHaveCount(0);
  const paragraph = shell(page).locator('.w-paragraph').first();
  const before = await paragraph.textContent();
  await paragraph.click(); await page.keyboard.type('DENIED_WHILE_BUSY');
  await page.keyboard.press('ControlOrMeta+b'); await page.keyboard.press('ControlOrMeta+z');
  await expect(paragraph).toHaveText(before!);
  expect(state.writes).toHaveLength(0);
  release();
  await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  expect(state.writes).toHaveLength(1);
  expect(state.text()).toContain('Busy owned Word input');
  expect(state.text()).not.toContain('DENIED_WHILE_BUSY');
});

test('current viewer permission retires selected Word tools before further mutation', async ({ page }) => {
  const state = await setup(page);
  await type(page, 'Permission owned Word input');
  await save(page).click();
  await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  const paragraph = shell(page).locator('.w-paragraph').first();
  await paragraph.click(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  const tools = page.getByRole('toolbar', { name: '선택한 Word 글 서식 도구', exact: true });
  await expect(tools).toBeVisible();
  const savedText = state.text();
  const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/v1/me', route => route.fulfill(json({ issuer, subject: 'word-synthetic',
    tenants: [{ tenantId, name: 'Word Company', role: 'viewer' }], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/access`, route => route.fulfill(json({ tenantId, role: 'viewer' })));
  const rechecked = page.waitForResponse(response => response.url().endsWith('/api/v1/me'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await rechecked;
  await expect(save(page)).toHaveCount(0);
  await expect(tools).toHaveCount(0);
  await expect(shell(page).locator('[contenteditable=true]')).toHaveCount(0);
  await expect(shell(page).locator('.w-paragraph').first()).toContainText('Permission owned Word input');
  await shell(page).locator('.w-paragraph').first().click();
  await page.keyboard.type('DENIED_AFTER_PERMISSION_CHANGE'); await page.keyboard.press('ControlOrMeta+b');
  expect(state.writes).toHaveLength(1); expect(state.text()).toBe(savedText);
  await expect(shell(page).locator('.w-paragraph').first()).not.toContainText('DENIED_AFTER_PERMISSION_CHANGE');
});


async function changeCurrentWordRole(page: Page, role: 'editor' | 'viewer') {
  const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/v1/me', route => route.fulfill(json({ issuer, subject: 'word-synthetic',
    tenants: [{ tenantId, name: 'Word Company', role }], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/access`, route => route.fulfill(json({ tenantId, role })));
  const rechecked = page.waitForResponse(response => response.url().endsWith('/api/v1/me'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await rechecked;
  await expect(page.locator('#office-auth-curtain')).not.toBeVisible();
}

test('dirty Word draft survives current viewer demotion and writer promotion', async ({ page }) => {
  const state = await setup(page);
  const serverText = state.text();
  await type(page, 'Protected role-change draft');
  const paragraph = shell(page).locator('.w-paragraph').first();
  await expect(paragraph).toContainText('Protected role-change draft');
  const visible = await paragraph.textContent();
  const pending = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.word.pending.v1:'))
    .sort().map(key => localStorage.getItem(key)));
  const protectedDraft = await pending();
  await changeCurrentWordRole(page, 'viewer');
  await expect(paragraph).toHaveText(visible!);
  await expect(shell(page).locator('[contenteditable=true]')).toHaveCount(0);
  await paragraph.click(); await page.keyboard.type('DENIED'); await page.keyboard.press('ControlOrMeta+z');
  await expect(paragraph).toHaveText(visible!);
  expect(await pending()).toEqual(protectedDraft);
  expect(state.text()).toBe(serverText); expect(state.writes).toHaveLength(0);
  await changeCurrentWordRole(page, 'editor');
  await expect(save(page)).toBeVisible();
  await expect(shell(page).locator('[contenteditable=true]')).toHaveCount(1);
  await expect(paragraph).toHaveText(visible!);
  await paragraph.click();
  await expect(shell(page).locator('[contenteditable=true]')).toBeFocused();
  await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await expect.poll(() => page.evaluate(() => document.getSelection()?.toString() ?? '')).not.toBe('');
  await expect(page.getByRole('toolbar', { name: '선택한 Word 글 서식 도구', exact: true })).toBeVisible();
  await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  expect(state.text()).toContain('Protected role-change draft'); expect(state.writes).toHaveLength(1);
});

test('delayed imported Word file cannot replace the document after viewer demotion', async ({ page }) => {
  const state = await setup(page); await type(page, 'Retain before delayed import');
  await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  const paragraph = shell(page).locator('.w-paragraph').first();
  const visible = await paragraph.textContent();
  const source = createStarterDocument();
  const surface = source.content![1];
  if (typeof surface === 'string') throw new Error('Starter surface missing');
  const block = surface.content![0];
  if (typeof block === 'string') throw new Error('Starter paragraph missing');
  const text = block.content![0];
  if (typeof text === 'string') throw new Error('Starter text missing');
  text.text = 'Delayed imported source';
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  await page.route(`**/api/v1/tenants/${tenantId}/documents?**`, async route => {
    entered(); await held; await route.fallback();
  }, { times: 1 });
  await openWordActions(page);
  await shell(page).getByLabel('Word 원본 파일로 새 서버 사본 준비').setInputFiles({
    name: 'delayed.word.json', mimeType: 'application/json', buffer: Buffer.from(wordFileText(source, '')) });
  await waiting;
  const pending = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.word.pending.v1:'))
    .sort().map(key => localStorage.getItem(key)));
  const protectedRecords = await pending();
  await changeCurrentWordRole(page, 'viewer');
  release();
  await expect(shell(page).locator('[data-save-status]')).not.toHaveText('저장 중…');
  await expect(paragraph).toHaveText(visible!);
  expect(await pending()).toEqual(protectedRecords);
  expect(state.writes).toHaveLength(1); expect(state.text()).not.toContain('Delayed imported source');
});

test('fixed Word save waits for restored writer authority after a held list response', async ({ page }) => {
  const state = await setup(page); await type(page, 'Frozen permission retry input');
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  await page.route(`**/api/v1/tenants/${tenantId}/documents?**`, async route => {
    entered(); await held; await route.fallback();
  }, { times: 1 });
  await save(page).click(); await waiting;
  const pending = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.word.pending.v1:'))
    .sort().map(key => JSON.parse(localStorage.getItem(key)!)).filter(record => record.status === 'pending'));
  const fixed = await pending(); expect(fixed).toHaveLength(1);
  await changeCurrentWordRole(page, 'viewer'); release();
  await expect(shell(page).locator('[data-save-status]')).not.toHaveText('저장 중…');
  expect(state.writes).toHaveLength(0); expect(await pending()).toEqual(fixed);
  await changeCurrentWordRole(page, 'editor');
  await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].idempotencyKey).toBe(fixed[0].attempt.idempotencyKey);
  expect(state.writes[0].snapshotText).toBe(fixed[0].attempt.snapshotText);
  expect(state.text()).toContain('Frozen permission retry input');
});


test('native Word opening saves the final input before installing another original', async ({ page }) => {
  const state = await setup(page, { second: true });
  await expect(shell(page).locator('.w-paragraph').first()).toBeVisible();
  await type(page, 'Final input before native transition');
  const list = page.getByRole('complementary', { name: '작업 공간 파일 탐색' });
  if (!await list.isVisible()) await shell(page).locator('[data-workspace-toggle="navigation"]').click();
  await list.getByRole('button', { name: 'Second server Word 열기', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${secondDocumentId}\\?tenant=${tenantId}(?:&|$)`) );
  await expect(shell(page).locator('.w-paragraph').first()).not.toContainText('Final input before native transition');
  expect(state.writes).toHaveLength(1);
  expect(state.text()).toContain('Final input before native transition');
  if (!await list.isVisible()) await shell(page).locator('[data-workspace-toggle="navigation"]').click();
  await list.getByRole('button', { name: 'Server Word 열기', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${documentId}\\?tenant=${tenantId}(?:&|$)`) );
  await expect(shell(page).locator('.w-paragraph').first()).toContainText('Final input before native transition');
  expect(state.writes).toHaveLength(1);
});

test('failed native Word preparation preserves the current original and last draft', async ({ page }) => {
  const state = await setup(page, { second: true, failSave: true });
  await expect(shell(page).locator('.w-paragraph').first()).toBeVisible();
  await type(page, 'Retained failed transition input');
  const list = page.getByRole('complementary', { name: '작업 공간 파일 탐색' });
  if (!await list.isVisible()) await shell(page).locator('[data-workspace-toggle="navigation"]').click();
  await list.getByRole('button', { name: 'Second server Word 열기', exact: true }).click();
  await expect(shell(page).locator('[data-save-status]')).toHaveText('저장 확인 필요');
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${documentId}\\?tenant=${tenantId}(?:&|$)`) );
  await expect(shell(page).locator('.w-paragraph').first()).toContainText('Retained failed transition input');
  expect(state.writes).toHaveLength(1);
  const pending = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.word.pending.v1:')).map(key => JSON.parse(localStorage.getItem(key)!)));
  expect(pending.some(record => record.status === 'pending' && record.snapshotText.includes('Retained failed transition input'))).toBe(true);
});


test('retired Word role loading cannot lock or replace a newer viewer opening', async ({ page }) => {
  const state = await setup(page, { second: true });
  await expect(shell(page).locator('.w-paragraph').first()).toBeVisible();
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  await page.route(`**/api/v1/tenants/${tenantId}/documents/${secondDocumentId}`, async route => {
    entered(); await held; await route.fallback();
  }, { times: 1 });
  const list = page.getByRole('complementary', { name: '작업 공간 파일 탐색' });
  if (!await list.isVisible()) await shell(page).locator('[data-workspace-toggle="navigation"]').click();
  await list.getByRole('button', { name: 'Second server Word 열기', exact: true }).click(); await waiting;
  state.setViewer(true);
  const access = page.waitForResponse(response => response.url().endsWith('/access'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await access;
  await expect(save(page)).toHaveCount(0);
  await expect(list.getByRole('button', { name: 'Second server Word 열기', exact: true })).toBeEnabled();
  await list.getByRole('button', { name: 'Second server Word 열기', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${secondDocumentId}\\?tenant=${tenantId}(?:&|$)`) );
  const installed = await shell(page).locator('.w-paragraph').first().elementHandle();
  expect(installed).not.toBeNull();
  const retiredResponse = page.waitForResponse(response => response.url().endsWith(`/documents/${secondDocumentId}`));
  release(); await (await retiredResponse).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await installed!.evaluate(node => node.isConnected)).toBe(true);
  await expect(shell(page).locator('.w-paragraph').first()).toBeVisible();
  await expect(shell(page).locator('[contenteditable=true]')).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${secondDocumentId}\\?tenant=${tenantId}(?:&|$)`) );
});


test('authenticated workspace tree retains native Word and Project context across aliases and perspectives', async ({ page }) => {
  const state = await setup(page, { tree: true });
  await (await projectFeedbackAction(page, '직접 편집')).click();
  const navigation = page.getByRole('complementary', { name: '작업 공간 파일 탐색' });
  const header = shell(page).locator('.office-document-bar');
  await expect(header.getByRole('button', { name: '로그아웃', exact: true })).toHaveCount(0);
  await expect(header.getByRole('button', { name: '프로젝트로 돌아가기', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '작업 공간 도구' }).getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Server Word 열기' })).toHaveCount(3);
  await expect(navigation.getByText('Stale alias')).toHaveCount(0);
  const paragraph = shell(page).locator('.w-paragraph').first();
  await type(page, 'Unsaved same original input');
  await expect(paragraph).toContainText('Unsaved same original input');
  const node = await paragraph.elementHandle();
  const before = page.url();
  await navigation.getByRole('button', { name: 'Server Word 열기' }).nth(1).click();
  await expect(paragraph).toContainText('Unsaved same original input');
  expect(await node!.evaluate(element => element.isConnected)).toBe(true);
  expect(page.url()).toBe(before); expect(state.writes).toHaveLength(0);
  await navigation.locator('.ow-tree-perspectives').getByRole('button', { name: '원본 자료', exact: true }).click();
  await expect(navigation.getByRole('button', { name: 'Server Word 열기' })).toHaveCount(1);
  await navigation.getByRole('button', { name: 'Server Word 열기' }).click();
  expect(await node!.evaluate(element => element.isConnected)).toBe(true);
  expect(page.url()).toBe(before); expect(state.writes).toHaveLength(0);
});

test('authenticated workspace tree saves immediate input before opening another Word original', async ({ page }) => {
  const state = await setup(page, { tree: true, second: true });
  await (await projectFeedbackAction(page, '직접 편집')).click();
  const tree = page.locator('.ow-file-navigation');
  await expect(tree.getByRole('button', { name: 'Second server Word 열기' })).toBeVisible();
  await type(page, 'Immediate tree input');
  await expect(shell(page).locator('.w-paragraph').first()).toContainText('Immediate tree input');
  await tree.getByRole('button', { name: 'Second server Word 열기' }).click();
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${secondDocumentId}\\?tenant=${tenantId}(?:&|$)`) );
  await expect(shell(page).locator('.w-paragraph').first()).not.toContainText('Immediate tree input');
  expect(state.writes).toHaveLength(1); expect(state.text()).toContain('Immediate tree input');
  expect(new URL(page.url()).searchParams.has('project')).toBe(false);
});


for (const width of [1170, 1280, 1440]) for (const theme of ['light', 'dark'] as const) test(`authenticated Word frame geometry ${width} ${theme}`, async ({ page }, testInfo) => {
  const height = width === 1280 ? 800 : 900;
  await page.setViewportSize({ width, height });
  await setup(page, { tree: true });
  // Complete the provider round trip before measuring the native editor.
  await page.waitForURL(url => url.pathname === '/' && url.searchParams.get('document') === documentId);
  await page.waitForLoadState('networkidle');
  await expect(shell(page).locator('.w-paragraph').first()).toBeVisible();
  await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
  await (await projectFeedbackAction(page, '직접 편집')).click();
  await type(page, 'Wonffice workspace product overview');
  const paragraph = shell(page).locator('.w-paragraph').first();
  await expect(paragraph).toContainText('Wonffice workspace product overview');
  const header = shell(page).locator('.office-document-bar');
  await expect(header).toHaveCount(1);
  const geometry = await header.boundingBox();
  expect(geometry!.height).toBe(48);
  // Workspace/file identity lives in the persistent tree, rather than a repeated subtitle.
  await expect(page.locator('.ow-file-navigation')).toContainText('Word workspace');
  await expect(page.locator('.ow-file-navigation').getByRole('button', { name: 'Server Word 열기', exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
  // This native starter has an empty title; its file-head name must not rewrite the original.
  await expect(header.getByRole('textbox', { name: '문서 제목', exact: true })).toHaveValue('');
  const controls = await header.locator('button,input').evaluateAll(elements => elements.filter(element => element.getBoundingClientRect().width > 0).map(element => {
    const rect = element.getBoundingClientRect(), hit = element.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { name: element.getAttribute('aria-label') ?? element.textContent, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height,
      ownsHit: !!hit && (element === hit || element.contains(hit)) };
  }));
  for (const control of controls) {
    expect(control.height, control.name ?? '').toBeGreaterThanOrEqual(32); expect(control.width, control.name ?? '').toBeGreaterThanOrEqual(32);
    expect(control.x, control.name ?? '').toBeGreaterThanOrEqual(geometry!.x); expect(control.right, control.name ?? '').toBeLessThanOrEqual(geometry!.x + geometry!.width);
    expect(control.y, control.name ?? '').toBeGreaterThanOrEqual(geometry!.y); expect(control.bottom, control.name ?? '').toBeLessThanOrEqual(geometry!.y + geometry!.height);
    expect(control.ownsHit, control.name ?? '').toBe(true);
  }
  expect(geometry!.x).toBeGreaterThan(250); expect(geometry!.x + geometry!.width).toBeLessThanOrEqual(width);
  const footer = page.locator('.ow-workspace-rail-footer');
  const footerHits = await footer.locator('button').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { width: rect.width, height: rect.height, x: rect.x, y: rect.y, bottom: rect.bottom, ownsHit: !!hit && (element === hit || element.contains(hit)) };
  }));
  expect(footerHits).toHaveLength(2);
  for (const hit of footerHits) { expect(hit.width).toBeGreaterThanOrEqual(32); expect(hit.height).toBeGreaterThanOrEqual(32);
    expect(hit.x).toBeGreaterThanOrEqual(0); expect(hit.y).toBeGreaterThanOrEqual(0); expect(hit.bottom).toBeLessThanOrEqual(height); expect(hit.ownsHit).toBe(true); }
  await expect(shell(page).getByRole('complementary', { name: '서버 Word 목록' })).toHaveCount(0);
  await expect(shell(page).getByRole('complementary', { name: '문서 작업' })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath(`authenticated-word-${width}-${theme}.png`) });
  const node = await paragraph.elementHandle();
  await page.getByRole('button', { name: '편집 집중 보기', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '작업 공간 파일 탐색' })).toBeHidden();
  const rail = page.getByRole('navigation', { name: '작업 공간 도구' });
  await rail.getByRole('button', { name: '로그아웃', exact: true }).focus();
  await expect(rail.getByRole('button', { name: '로그아웃', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(rail.getByRole('button', { name: '프로젝트로 돌아가기', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '작업 공간 파일 펼치기', exact: true }).click();
  await openWordActions(page);
  await page.getByRole('region', { name: '문서 작업', exact: true }).getByRole('button', { name: '닫기', exact: true }).click();
  await expect(shell(page).getByRole('menuitem', { name: '문서 메뉴', exact: true })).toBeFocused();
  await openWordActions(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('region', { name: '문서 작업', exact: true }).getByRole('button', { name: '새 Word', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(shell(page).getByRole('menuitem', { name: '문서 메뉴', exact: true })).toBeFocused();
  expect(await node!.evaluate(element => element.isConnected)).toBe(true);
});


// Controlled transport and actual authenticated Word/native selection controls; no runtime mocks.
async function matrixWordExport(page: Page) {
  await shell(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  const waiting = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Word 파일 내보내기', exact: true }).click();
  const path = await (await waiting).path(); expect(path).not.toBeNull();
  return JSON.parse(await readFile(path!, 'utf8')).document;
}
async function matrixWordSurface(surface: Locator, width: number, height: number) {
  await expect(surface).toBeVisible(); const box = await surface.boundingBox(); expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width); expect(box!.y + box!.height).toBeLessThanOrEqual(height);
  return box!;
}
async function matrixWordHit(control: Locator) {
  const box = await control.boundingBox(); expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(32); expect(box!.height).toBeGreaterThanOrEqual(32);
  expect(await control.evaluate(node => {
    const rect = node.getBoundingClientRect(), hit = node.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return !!hit && (node === hit || node.contains(hit));
  })).toBe(true);
}
for (const [width, height] of [[1440, 900], [1280, 800]]) for (const theme of ['light', 'dark'] as const)
for (const role of ['editor', 'viewer'] as const) test(`controlled authenticated Word tools ${role} ${width}x${height} ${theme}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height }); await page.emulateMedia({ colorScheme: theme });
  const fixture = createStarterDocument();
  const surface = fixture.content![1] as INode, block = surface.content![0] as INode, inline = block.content![0] as INode;
  // Use an explicit supported empty mark set; omitted-mark typing normalization
  // is a separately retained codec boundary, not a compact UI expectation.
  inline.text = 'Authority sample'; inline.marks = [];
  const source = wordFileText(fixture, '');
  const state = await setup(page, { viewer: role === 'viewer', document: fixture });
  const paragraph = shell(page).locator('.w-paragraph').first(); await expect(paragraph).toHaveText('Authority sample');
  await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  const nativeBody = await paragraph.elementHandle(), header = shell(page).locator('.office-editor-header');
  await expect(header).toHaveCount(1); expect((await matrixWordSurface(header, width, height)).height).toBe(48);
  const primary = page.locator('[data-word-formatting]'); await expect(primary).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`${width}-${theme}-${role}-idle.png`), animations: 'disabled' });
  const before = await matrixWordExport(page);
  // The empty native title is intentional; the server head title is only the catalog identity.
  expect(before.content[0].content[0].content[0].text).toBe('');
  expect(state.text()).toBe(source); expect(state.writes).toHaveLength(0);
  await paragraph.click();
  const apple = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform));
  if (role === 'editor') {
    await page.keyboard.press(apple ? 'Meta+ArrowDown' : 'Control+End');
    for (let index = 0; index < 'Authority sample'.length; index++) await page.keyboard.press('Shift+ArrowLeft');
  } else await paragraph.click({ clickCount: 3 });
  await expect.poll(() => paragraph.evaluate(node => {
    const selection = getSelection(); return !!selection?.anchorNode && node.contains(selection.anchorNode) && selection.toString().trimEnd() === 'Authority sample';
  })).toBe(true);
  if (role === 'editor') {
    const box = await matrixWordSurface(primary, width, height);
    expect(box.height).toBeLessThanOrEqual(48); expect(box.width).toBeLessThanOrEqual(480);
    await info.attach(`${width}-${theme}-${role}-primary-dimensions`, { contentType: 'application/json', body: Buffer.from(JSON.stringify({ width: box.width, height: box.height })) });
    const bold = primary.getByRole('button', { name: 'Bold', exact: true }); await matrixWordHit(bold);
    await page.screenshot({ path: info.outputPath(`${width}-${theme}-${role}-selection-primary.png`), animations: 'disabled' });
    const trigger = primary.getByRole('button', { name: '추가 서식', exact: true }); await matrixWordHit(trigger); await trigger.click();
    const more = page.getByLabel('추가 Word 서식', { exact: true }); await matrixWordSurface(more, width, height);
    expect(await more.evaluate(node => node.contains(document.activeElement))).toBe(true);
    const font = more.locator('.w-toolbar-font-family'), ownedFont = await font.elementHandle(); await font.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`${width}-${theme}-${role}-owned-font-value.png`), animations: 'disabled' });
    await page.keyboard.press('Escape'); await expect(page.getByRole('listbox')).toHaveCount(0);
    await page.keyboard.press('Escape'); await expect(more).toBeHidden(); await expect(more).toHaveAttribute('inert', '');
    await expect(trigger).toBeFocused(); await expect(primary).toBeVisible();
    expect(await ownedFont!.evaluate(node => node.isConnected)).toBe(true); expect(state.text()).toBe(source); expect(state.writes).toHaveLength(0);
    await bold.click(); await expect(paragraph.locator('.mark-bold')).toHaveText('Authority sample');
    await paragraph.click(); await page.keyboard.press('ControlOrMeta+z'); await expect(paragraph.locator('.mark-bold')).toHaveCount(0);
    await expect(paragraph).toHaveText('Authority sample'); expect(await matrixWordExport(page)).toEqual(before);
    await paragraph.click(); await page.keyboard.press(apple ? 'Meta+ArrowDown' : 'Control+End'); await page.keyboard.insertText('!');
    await expect(paragraph).toHaveText('Authority sample!');
    const expected = structuredClone(before); expected.content[1].content[0].content[0].text = 'Authority sample!';
    await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    expect(state.writes).toHaveLength(1); expect(state.revision()).toBe(2);
    expect(JSON.parse(state.text()).document).toEqual(expected); expect(await matrixWordExport(page)).toEqual(expected);
  } else {
    await expect(primary).toHaveCount(0); await expect(shell(page).locator('[contenteditable=true]')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`${width}-${theme}-${role}-readonly-selection.png`), animations: 'disabled' });
    await shell(page).getByRole('button', { name: '명령 검색', exact: true }).click();
    const query = page.getByRole('combobox', { name: '명령 검색어', exact: true }); await expect(query).toBeFocused();
    await query.fill('굵게'); await expect(page.getByRole('option').filter({ hasText: '굵게' })).toHaveAttribute('aria-disabled', 'true');
    await query.press('Enter'); await expect(query).toBeFocused(); await expect(paragraph.locator('.mark-bold')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`${width}-${theme}-${role}-readonly-command-detail.png`), animations: 'disabled' });
    await query.press('Escape'); await expect(query).toHaveCount(0);
    await paragraph.click({ clickCount: 3 });
    await page.keyboard.insertText('DENIED-VIEWER-INPUT'); await page.keyboard.press('ControlOrMeta+b'); await page.keyboard.press('ControlOrMeta+s');
    await expect(paragraph).toHaveText('Authority sample'); await expect(paragraph.locator('.mark-bold')).toHaveCount(0); await expect(save(page)).toHaveCount(0);
    expect(state.text()).toBe(source); expect(state.revision()).toBe(1); expect(state.writes).toHaveLength(0);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.word.pending.v1:')))).toEqual([]);
    expect(await matrixWordExport(page)).toEqual(before);
  }
  expect(await nativeBody!.evaluate(node => node.isConnected)).toBe(true);
  await page.screenshot({ path: info.outputPath(`${width}-${theme}-${role}-dismissed-final-native.png`), animations: 'disabled' });
});
