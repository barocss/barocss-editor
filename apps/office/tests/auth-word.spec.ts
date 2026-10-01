import { createHash } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { createStarterDocument } from '../../../packages/office-word/src/starter-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';

const tenantId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const documentId = '00000000-0000-4000-8000-000000000003';
const issuer = 'http://127.0.0.1:18180/realms/wonffice-local';
const origin = `http://127.0.0.1:${process.env.OFFICE_AUTH_TEST_PORT ?? '5191'}`;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const shell = (page: Page) => page.locator('[data-server-word-workspace]');
const save = (page: Page) => shell(page).getByRole('button', { name: /^(저장|저장 확인·재시도)$/ });
async function setup(page: Page, options: { viewer?: boolean; lostAck?: boolean; wrongProduct?: boolean; mode?: string } = {}) {
  let snapshotText = wordFileText(createStarterDocument(), '');
  let revision = 1;
  const writes: Record<string, unknown>[] = [];
  const receipts = new Map<string, unknown>();
  let lose = !!options.lostAck;
  const head = () => ({ tenantId, workspaceId, documentId, product: options.wrongProduct ? 'note' : 'word', title: 'Server Word',
    metadataRevision: 1, mode: options.mode ?? 'snapshot', revision, pageId: null, documentKey: `wonffice-${tenantId}-${documentId}`,
    fileFormat: 'barocss-word', fileVersion: 1, snapshotHash: hash(snapshotText) });
  const json = (value: unknown) => ({ contentType: 'application/json', body: JSON.stringify(value) });
  await page.route(`${issuer}/.well-known/openid-configuration`, route => route.fulfill({ ...json({ issuer,
    authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, end_session_endpoint: `${issuer}/logout` }), headers: { 'access-control-allow-origin': '*' } }));
  await page.route(`${issuer}/auth**`, route => route.fulfill({ contentType: 'text/html', body: `<script>location.replace('${origin}/auth/callback?code=synthetic&state=${new URL(route.request().url()).searchParams.get('state')}')</script>` }));
  await page.route(`${issuer}/token`, route => route.fulfill({ ...json({ access_token: 'synthetic', token_type: 'Bearer', expires_in: 300 }), headers: { 'access-control-allow-origin': '*' } }));
  await page.route('**/api/v1/me', route => route.fulfill(json({ issuer, subject: 'word-synthetic', tenants: [{ tenantId, name: 'Word Company', role: options.viewer ? 'viewer' : 'editor' }], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/access`, route => route.fulfill(json({ tenantId, role: options.viewer ? 'viewer' : 'editor' })));
  await page.route(`**/api/v1/tenants/${tenantId}/workspaces**`, route => route.fulfill(json({ workspaces: [{ id: workspaceId, name: 'Word workspace' }], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/documents?**`, route => route.fulfill(json({ documents: new URL(route.request().url()).searchParams.get('product') === 'word' ? [head()] : [], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/documents/${documentId}`, route => route.fulfill(json({ document: head(), ...(options.mode ? {} : { snapshotText }) })));
  await page.route(`**/api/v1/tenants/${tenantId}/receipts/**`, route => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);
    return route.fulfill(receipts.has(key) ? json(receipts.get(key)) : { status: 404, ...json({ status: 'not_found' }) });
  });
  await page.route(`**/api/v1/tenants/${tenantId}/documents/${documentId}/snapshot`, async route => {
    const body = route.request().postDataJSON(); writes.push(body);
    if (options.viewer) return route.fulfill({ status: 403, ...json({ status: 'forbidden' }) });
    if (body.expectedRevision !== revision) return route.fulfill({ status: 409, ...json({ status: 'revision_conflict' }) });
    snapshotText = body.snapshotText; revision++;
    const receipt = { operation: 'update', idempotencyKey: body.idempotencyKey,
      requestHash: hash(JSON.stringify(['update', documentId, body.expectedRevision, body.snapshotText])), document: head(), snapshotText };
    receipts.set(body.idempotencyKey, receipt);
    if (lose) { lose = false; return route.abort('failed'); }
    return route.fulfill(json(receipt));
  });
  await page.goto(`/?tenant=${tenantId}&workspace=${workspaceId}&document=${documentId}&product=word`);
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  return { writes, text: () => snapshotText, revision: () => revision };
}
async function type(page: Page, text: string) {
  const paragraph = shell(page).locator('.w-paragraph').first();
  await paragraph.click(); await page.keyboard.type(text);
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
  await page.getByRole('button', { name: '자료함으로 돌아가기' }).click();
  await expect(shell(page).locator('.w-paragraph').first()).toContainText('Protected latest input');
  await expect(page.getByText('현재 입력을 복구 가능한 저장소에 보관하지 못했습니다.', { exact: false })).toBeVisible();
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
  await shell(page).getByLabel('Word 원본 파일로 새 서버 사본 준비').setInputFiles({ name: 'unsupported.word.json', mimeType: 'application/json', buffer: Buffer.from(source) });
  await expect(shell(page).getByText('지원하지 않는 Word 파일입니다.', { exact: false })).toBeVisible();
  await expect(shell(page).locator('.w-paragraph').first()).toContainText('Retained current Word');
  expect(JSON.parse(source).document.content[0].stype).toBe('unknownWordNode');
});

test('selected Word tools retire while a save owns the current busy document', async ({ page }) => {
  const state = await setup(page);
  await type(page, 'Busy owned Word input');
  await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  const tools = page.getByRole('toolbar', { name: '선택한 Word 글 서식', exact: true });
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
  const tools = page.getByRole('toolbar', { name: '선택한 Word 글 서식', exact: true });
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
  await paragraph.click(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await expect(page.getByRole('toolbar', { name: '선택한 Word 글 서식', exact: true })).toBeVisible();
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
