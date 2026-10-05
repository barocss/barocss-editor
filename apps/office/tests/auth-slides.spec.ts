import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createStarterDeck } from '../../../packages/office-slides/src/starter-deck';
import { createProjectRecord } from '../../../packages/shared/src/index';
import { deckFileText } from '../../../packages/office-slides/src/deck-file';

const tenantId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const documentId = '00000000-0000-4000-8000-000000000003';
const secondId = '00000000-0000-4000-8000-000000000004';
const sharedModule = `/@fs${fileURLToPath(new URL('../../../packages/shared/src/index.ts', import.meta.url))}`;
const issuer = 'http://127.0.0.1:18180/realms/wonffice-local';
const origin = `http://127.0.0.1:${process.env.OFFICE_AUTH_TEST_PORT ?? '5191'}`;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const shell = (page: Page) => page.locator('[data-server-slides-workspace]');
const save = (page: Page) => shell(page).getByRole('button', { name: /^(저장|저장 확인·재시도)$/ });
// Server-document scenarios use a populated original; empty-placeholder first input is a separate native scenario.
function serverDeck(title: string) {
  const deck = createStarterDeck();
  const slide = deck.content?.find(node => typeof node !== 'string' && node.stype === 'surface');
  const frame = typeof slide === 'object' && slide.content?.find(node => typeof node !== 'string' && node.stype === 'textFrame');
  const paragraph = typeof frame === 'object' && frame.content?.find(node => typeof node !== 'string' && node.stype === 'paragraph');
  const run = typeof paragraph === 'object' && paragraph.content?.find(node => typeof node !== 'string' && node.stype === 'inline-text');
  if (!run || typeof run === 'string') throw new Error('Starter title structure is missing');
  run.text = title;
  return deck;
}
async function setup(page: Page, options: { viewer?: boolean; lostAck?: boolean; wrongProduct?: boolean; mode?: string; second?: boolean; empty?: boolean; compact?: boolean; projectStatus?: number; collision?: boolean; multiTenant?: boolean; catalogFail?: boolean } = {}) {
  let snapshotText = deckFileText(options.empty ? createStarterDeck() : serverDeck('Server Slides native title'), '');
  const secondText = deckFileText(serverDeck('Second Slides native title'), '');
  const secondHead = () => ({ ...head(), documentId: secondId, title: 'Second Slides', revision: 1, documentKey: `wonffice-${tenantId}-${secondId}`, snapshotHash: hash(secondText) });
  let revision = 1;
  const writes: Record<string, unknown>[] = [];
  const receipts = new Map<string, unknown>();
  let lose = !!options.lostAck;
  const head = () => ({ tenantId, workspaceId, documentId, product: options.wrongProduct ? 'note' : 'slides', title: 'Server Slides',
    metadataRevision: 1, mode: options.mode ?? 'snapshot', revision, pageId: null, documentKey: `wonffice-${tenantId}-${documentId}`,
    fileFormat: 'barocss-slides', fileVersion: JSON.parse(snapshotText).version, snapshotHash: hash(snapshotText) });
  const json = (value: unknown) => ({ contentType: 'application/json', body: JSON.stringify(value) });
  await page.route(`${issuer}/.well-known/openid-configuration`, route => route.fulfill({ ...json({ issuer,
    authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, end_session_endpoint: `${issuer}/logout` }), headers: { 'access-control-allow-origin': '*' } }));
  await page.route(`${issuer}/auth**`, route => route.fulfill({ contentType: 'text/html', body: `<script>location.replace('${origin}/auth/callback?code=synthetic&state=${new URL(route.request().url()).searchParams.get('state')}')</script>` }));
  await page.route(`${issuer}/token`, route => route.fulfill({ ...json({ access_token: 'synthetic', token_type: 'Bearer', expires_in: 300 }), headers: { 'access-control-allow-origin': '*' } }));
  await page.route('**/api/v1/me', route => route.fulfill(json({ issuer, subject: 'slides-synthetic', tenants: [{ tenantId, name: 'Slides Company', role: options.viewer ? 'viewer' : 'editor' }, ...(options.multiTenant ? [{ tenantId: secondId, name: 'Other Company', role: 'editor' }] : [])], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/access`, route => route.fulfill(json({ tenantId, role: options.viewer ? 'viewer' : 'editor' })));
  await page.route(`**/api/v1/tenants/${tenantId}/workspaces**`, route => route.fulfill(json({ workspaces: [{ id: workspaceId, name: 'Slides workspace' }], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/projects?**`, route => route.fulfill(json({ projects: [], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/projects/${documentId}`, route => route.fulfill(options.collision
    ? json({ tenantId, workspaceId, actor: { kind: 'human', id: 'synthetic' }, project: { revision: 1, record: { ...createProjectRecord('Collision', 'Fictional route fixture'), id: documentId } } })
    : { status: options.projectStatus ?? 404, ...json({ status: 'not_found' }) }));
  if (options.second) await page.route(`**/api/v1/tenants/${tenantId}/projects/${secondId}`, route => route.fulfill({ status: 404, ...json({ status: 'not_found' }) }));
  await page.route(`**/api/v1/tenants/${tenantId}/documents?**`, route => route.fulfill(options.catalogFail ? { status: 503, ...json({ status: 'unavailable' }) } : json({ documents: [null, 'slides'].includes(new URL(route.request().url()).searchParams.get('product')) ? [head(), ...(options.second ? [secondHead()] : [])] : [], nextCursor: null })));
  if (options.second) await page.route(`**/api/v1/tenants/${tenantId}/documents/${secondId}`, route => route.fulfill(json({ document: secondHead(), snapshotText: secondText })));
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
  await page.goto(options.compact ? `/${workspaceId}/${documentId}` : `/?tenant=${tenantId}&workspace=${workspaceId}&document=${documentId}&product=slides`);
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  return { writes, text: () => snapshotText, revision: () => revision,
    advance: () => { snapshotText = deckFileText(serverDeck('CONFLICT SERVER LATEST'), ''); revision++; } };
}
async function type(page: Page, text: string) {
  const paragraph = shell(page).locator('.sl-stage .w-paragraph').first();
  const frame = paragraph.locator('xpath=ancestor::*[contains(@class, "sl-text-frame")]').first();
  const bounds = await frame.boundingBox(); if (!bounds) throw new Error('Visible title frame is missing');
  // The native object overlay handles the real pointer gesture before text mode starts.
  await page.mouse.dblclick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await paragraph.click({ position: { x: 8, y: 8 } }); await page.keyboard.press('Home'); await page.keyboard.insertText(text);
  await expect(paragraph).toContainText(text);
}

test('Slides discovery mounts full editor and confirms native save without bootstrap globals', async ({ page }) => {
  const state = await setup(page);
  await expect(shell(page).locator('.sl-stage .w-paragraph').first()).toBeVisible();
  expect(await page.evaluate(() => typeof (window as unknown as { editor?: { run?: unknown } }).editor?.run)).toBe('undefined');
  await type(page, 'Slides typed input');
  await expect(shell(page).locator('[data-save-status]')).toHaveText('저장되지 않음');
  await save(page).click();
  await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  expect(state.writes).toHaveLength(1); expect(state.revision()).toBe(2);
  expect(state.text()).toContain('Slides typed input');
});

test('empty starter accepts first input through its visible native placeholder and reopens saved input', async ({ page }) => {
  const state = await setup(page, { empty: true });
  await expect(shell(page).locator('.sl-stage .sl-text-frame').first()).toBeVisible();
  await type(page, 'First empty starter title');
  await expect(shell(page).locator('.sl-stage [contenteditable=true]')).toHaveCount(1);
  await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  expect(state.text()).toContain('First empty starter title'); expect(state.writes).toHaveLength(1);
  await page.reload();
  if (await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible()) await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await expect(shell(page).locator('.sl-stage')).toContainText('First empty starter title');
});

test('lost acknowledgement retains fixed request and confirms receipt without duplicate write', async ({ page }) => {
  const state = await setup(page, { lostAck: true });
  await type(page, 'First fixed input'); await save(page).click();
  await expect(shell(page).locator('[data-save-status]')).toHaveText('저장 확인 필요');
  await type(page, ' Later input');
  const rows = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.slides.pending.v1:')).map(key => JSON.parse(localStorage.getItem(key)!)));
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
  const paragraph = shell(page).locator('.sl-stage .w-paragraph').first(); await expect(paragraph).toBeVisible();
  await paragraph.click(); await page.keyboard.type('Denied mutation'); await page.keyboard.press('ControlOrMeta+b');
  await expect(paragraph).not.toContainText('Denied mutation'); await expect(save(page)).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
  await expect(shell(page).locator('[contenteditable=true]')).toHaveCount(0);
});

for (const mode of ['initializing', 'collaborative']) test(`Slides ${mode} never mounts snapshot editor`, async ({ page }) => {
  await setup(page, { mode }); await expect(page.getByRole('heading', { name: '공동 편집을 열 수 없습니다' })).toBeVisible();
  await expect(shell(page)).toHaveCount(0);
});
test('wrong-product direct URL is refused before native editor mounts', async ({ page }) => {
  await setup(page, { wrongProduct: true }); await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
  await expect(shell(page)).toHaveCount(0);
});

test('quota failure retains latest visible input and blocks Office exit until durable retry', async ({ page }) => {
  const state = await setup(page);
  await expect(shell(page).locator('.sl-stage .w-paragraph').first()).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreSlidesStorage: () => void }).restoreSlidesStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('wonffice.slides.pending.v1:')) throw new DOMException('Synthetic quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await type(page, 'Protected latest input');
  await expect(shell(page).locator('[data-save-status]')).toHaveText('복구 저장 실패');
  await page.getByRole('button', { name: '자료함으로 돌아가기' }).click();
  await expect(shell(page).locator('.sl-stage .w-paragraph').first()).toContainText('Protected latest input');
  await expect(page.getByText('현재 입력을 복구 가능한 저장소에 보관하지 못했습니다.', { exact: false })).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await page.evaluate(() => (window as unknown as { restoreSlidesStorage: () => void }).restoreSlidesStorage());
  await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  expect(state.text()).toContain('Protected latest input');
});

test('reload exposes a separate protected last-input draft without replacing server head', async ({ page }) => {
  await setup(page); await type(page, 'Reload latest input');
  await expect(shell(page).locator('[data-save-status]')).toHaveText('저장되지 않음');
  await page.reload();
  await expect.poll(async () => await shell(page).isVisible() || await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible()).toBe(true);
  if (await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible()) await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await expect(shell(page).locator('.sl-stage .w-paragraph').first()).not.toContainText('Reload latest input');
  await shell(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: '서버 Slides 목록', exact: true }).click();
  const recover = shell(page).getByRole('button', { name: /저장된 Slides 초안 복구/ });
  await expect(recover).toHaveCount(1);
  const stored = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.slides.pending.v1:')).map(key => JSON.parse(localStorage.getItem(key)!)));
  expect(stored[0].snapshotText).toContain('Reload latest input');
  page.once('dialog', dialog => dialog.accept());
  await recover.click();
  await expect(shell(page).locator('.sl-stage .w-paragraph').first()).toContainText('Reload latest input');
  await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
});

test('fresh viewer focus revalidation retains the authorized read-only Slides runtime', async ({ page }) => {
  await setup(page, { viewer: true });
  await expect(shell(page).locator('.sl-stage .w-paragraph').first()).toBeVisible();
  const me = page.waitForResponse(response => response.url().endsWith('/api/v1/me'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await me;
  await expect(shell(page).locator('.sl-stage .w-paragraph').first()).toBeVisible();
  await expect(save(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toHaveCount(0);
});

test('temporary same-account access recheck retains a fixed Slides request and supports retry', async ({ page }) => {
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
  await expect(shell(page).locator('.sl-stage .w-paragraph').first()).toBeVisible();
  await expect(shell(page).locator('.sl-stage .w-paragraph').first()).toContainText('Focus check input');
  await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  expect(state.writes).toHaveLength(1);
});

test('unsupported native file leaves current Slides model and source file unchanged', async ({ page }) => {
  await setup(page); await type(page, 'Retained current Slides');
  const source = JSON.stringify({ format: 'barocss-slides', version: 1, document: { stype: 'document', content: [{ stype: 'unknownSlidesNode', text: 'Unsupported source' }] } });
  page.once('dialog', dialog => dialog.accept());
  await shell(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: '서버 Slides 목록', exact: true }).click();
  await shell(page).getByLabel('Slides 원본 파일로 새 서버 사본 준비').setInputFiles({ name: 'unsupported.slides.json', mimeType: 'application/json', buffer: Buffer.from(source) });
  await expect(shell(page).getByText('지원하지 않는 Slides 파일입니다.', { exact: false })).toBeVisible();
  await expect(shell(page).locator('.sl-stage .w-paragraph').first()).toContainText('Retained current Slides');
  expect(JSON.parse(source).document.content[0].stype).toBe('unknownSlidesNode');
});

async function changeCurrentSlidesRole(page: Page, role: 'viewer' | 'editor') {
  const json = (value: unknown) => ({ contentType: 'application/json', body: JSON.stringify(value) });
  await page.route('**/api/v1/me', route => route.fulfill(json({ issuer, subject: 'slides-synthetic',
    tenants: [{ tenantId, name: 'Slides Company', role }], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/access`, route => route.fulfill(json({ tenantId, role })));
  const rechecked = page.waitForResponse(response => response.url().endsWith('/api/v1/me'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await rechecked;
  await expect(page.locator('#office-auth-curtain')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toHaveCount(0);
}

test('dirty Slides draft survives current viewer demotion and writer promotion', async ({ page }) => {
  const state = await setup(page); const confirmed = state.text();
  await type(page, 'Protected Slides role-change draft');
  const paragraph = shell(page).locator('.sl-stage .w-paragraph').first();
  const visible = await paragraph.textContent();
  const pending = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.slides.pending.v1:'))
    .sort().map(key => localStorage.getItem(key)));
  const protectedDraft = await pending();
  await changeCurrentSlidesRole(page, 'viewer');
  await expect(paragraph).toHaveText(visible!);
  await expect(shell(page).locator('[contenteditable=true]')).toHaveCount(0);
  await paragraph.click(); await page.keyboard.type('DENIED'); await page.keyboard.press('ControlOrMeta+z');
  await expect(paragraph).toHaveText(visible!);
  expect(await pending()).toEqual(protectedDraft); expect(state.text()).toBe(confirmed); expect(state.writes).toHaveLength(0);
  await changeCurrentSlidesRole(page, 'editor');
  await expect(save(page)).toBeVisible();
  await expect(shell(page).locator('.sl-stage [contenteditable=true]')).toHaveCount(1);
  await expect(paragraph).toHaveText(visible!);
  await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  expect(state.text()).toContain('Protected Slides role-change draft'); expect(state.writes).toHaveLength(1);
});

test('delayed imported Slides file cannot replace the document after viewer demotion', async ({ page }) => {
  const state = await setup(page); await type(page, 'Retain Slides before delayed import');
  await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  const paragraph = shell(page).locator('.sl-stage .w-paragraph').first(); const visible = await paragraph.textContent();
  const source = createStarterDeck();
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  await page.route(`**/api/v1/tenants/${tenantId}/documents?**`, async route => { entered(); await held; await route.fallback(); }, { times: 1 });
  await shell(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: '서버 Slides 목록', exact: true }).click();
  await shell(page).getByLabel('Slides 원본 파일로 새 서버 사본 준비').setInputFiles({
    name: 'delayed.slides.json', mimeType: 'application/json', buffer: Buffer.from(deckFileText(source, '')) });
  await waiting;
  const pending = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.slides.pending.v1:'))
    .sort().map(key => localStorage.getItem(key)));
  const protectedRecords = await pending();
  await changeCurrentSlidesRole(page, 'viewer'); release();
  await expect(shell(page).locator('[data-save-status]')).not.toHaveText('저장 중…');
  await expect(paragraph).toHaveText(visible!); expect(await pending()).toEqual(protectedRecords);
  expect(state.writes).toHaveLength(1); expect(state.text()).toContain('Retain Slides before delayed import');
});

test('fixed Slides save waits for restored writer authority after a held list response', async ({ page }) => {
  const state = await setup(page); await type(page, 'Frozen Slides permission retry');
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  await page.route(`**/api/v1/tenants/${tenantId}/documents?**`, async route => { entered(); await held; await route.fallback(); }, { times: 1 });
  await save(page).click(); await waiting;
  const pending = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.slides.pending.v1:'))
    .sort().map(key => JSON.parse(localStorage.getItem(key)!)).filter(record => record.status === 'pending'));
  const fixed = await pending(); expect(fixed).toHaveLength(1);
  await changeCurrentSlidesRole(page, 'viewer'); release();
  await expect(shell(page).locator('[data-save-status]')).not.toHaveText('저장 중…');
  expect(state.writes).toHaveLength(0); expect(await pending()).toEqual(fixed);
  await changeCurrentSlidesRole(page, 'editor');
  await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  expect(state.writes).toHaveLength(1); expect(state.writes[0].idempotencyKey).toBe(fixed[0].attempt.idempotencyKey);
  expect(state.writes[0].snapshotText).toBe(fixed[0].attempt.snapshotText);
});


test('Canvas edits use the authenticated document and stop on current viewer authority', async ({ page }) => {
  const state = await setup(page);
  await expect(shell(page).locator('.sl-stage .w-paragraph').first()).toBeVisible();
  await shell(page).getByRole('button', { name: '멀티 슬라이드 보기', exact: true }).click();
  await expect(shell(page).locator('.sl-stage')).toHaveAttribute('data-freeboard', 'true');
  await expect(shell(page).locator('.sl-map')).toHaveCount(0);
  const title = shell(page).locator('.sl-stage .sl-text-frame').first();
  const titleBounds = (await title.boundingBox())!;
  await page.mouse.dblclick(titleBounds.x + titleBounds.width / 2, titleBounds.y + titleBounds.height / 2);
  await page.keyboard.press('End'); await page.keyboard.insertText('Authenticated Canvas input');
  await expect(title).toContainText('Authenticated Canvas input');
  await page.keyboard.press('Escape');
  await save(page).click();
  await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  const confirmed = state.text();
  expect(confirmed).toContain('Authenticated Canvas input');
  await changeCurrentSlidesRole(page, 'viewer');
  await expect(shell(page).locator('[contenteditable=true]')).toHaveCount(0);
  const paragraph = shell(page).locator('.sl-stage .w-paragraph').first();
  const visible = await paragraph.textContent();
  await paragraph.dblclick(); await page.keyboard.type('DENIED Canvas input');
  await expect(paragraph).toHaveText(visible!);
  const label = shell(page).locator('[data-board-label]').first();
  const before = (await label.boundingBox())!;
  await page.mouse.move(before.x + 8, before.y + 8); await page.mouse.down();
  await page.mouse.move(before.x + 65, before.y + 30, { steps: 5 });
  expect(await label.boundingBox()).toEqual(before);
  await page.mouse.up();
  expect(state.text()).toBe(confirmed); expect(state.writes).toHaveLength(1);
  await changeCurrentSlidesRole(page, 'editor');
  await expect(save(page)).toBeVisible();
  await shell(page).getByRole('button', { name: '슬라이드 보기', exact: true }).click();
  await expect(paragraph).toContainText('Authenticated Canvas input');
  expect(state.text()).toBe(confirmed);
});


test('Slides owned opening preserves last stage and rich notes input then returns the installed guard', async ({ page }) => {
  const state = await setup(page, { second: true });
  await type(page, 'FINAL STAGE INPUT');
  await shell(page).getByRole('button', { name: '발표자 노트', exact: true }).click();
  const notes = shell(page).getByRole('region', { name: '발표자 노트', exact: true });
  await notes.getByRole('textbox', { name: '발표자 노트 입력', exact: true }).fill('First presenter note');
  const paragraph = notes.locator('.sl-notes-host .w-paragraph').first();
  await expect(paragraph).toContainText('First presenter note');
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' FINAL RICH NOTE');
  const result = await page.evaluate(async ({ module, secondId }) => {
    const { captureProductNavigation } = await import(module) as typeof import('@barocss/shared');
    const source = captureProductNavigation();
    if (!source?.open) throw new Error('Native Slides host not ready');
    const target = await source.open(secondId);
    return { sourceCurrent: source.isCurrent(), target: target && { product: target.product, id: target.id, current: target.isCurrent() } };
  }, { module: sharedModule, secondId });
  expect(result).toEqual({ sourceCurrent: false, target: { product: 'slides', id: secondId, current: true } });
  expect(state.text()).toContain('FINAL STAGE INPUT'); expect(state.text()).toContain('FINAL RICH NOTE');
  expect(state.writes).toHaveLength(1);
  const reopened = await page.evaluate(async ({ module, documentId }) => {
    const { captureProductNavigation } = await import(module) as typeof import('@barocss/shared');
    const source = captureProductNavigation(); const target = await source?.open?.(documentId);
    return !!target && target.id === documentId && target.isCurrent();
  }, { module: sharedModule, documentId });
  expect(reopened).toBe(true);
  await expect(shell(page).locator('.sl-stage')).toContainText('FINAL STAGE INPUT');
  expect(state.writes).toHaveLength(1);
});

test('Slides target read locks competing preparation and a stale authority response cannot replace the source', async ({ page }) => {
  const state = await setup(page, { second: true });
  await type(page, 'RETAIN SOURCE BEFORE TARGET'); await save(page).click();
  await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), waiting = new Promise<void>(resolve => { entered = resolve; });
  await page.route(`**/api/v1/tenants/${tenantId}/documents/${secondId}`, async route => { entered(); await held; await route.fallback(); }, { times: 1 });
  await page.evaluate(({ module, secondId }) => {
    (window as any).__targetOpening = import(module).then(({ captureProductNavigation }) => captureProductNavigation().open(secondId));
  }, { module: sharedModule, secondId });
  await waiting;
  await expect(shell(page).locator('.sl-stage [contenteditable=true]')).toHaveCount(0);
  await shell(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: '서버 Slides 목록', exact: true }).click();
  await expect(shell(page).getByRole('button', { name: '새 Slides', exact: true })).toBeDisabled();
  await changeCurrentSlidesRole(page, 'viewer'); release();
  expect(await page.evaluate(async () => !!await (window as any).__targetOpening)).toBe(false);
  await expect(shell(page).locator('.sl-stage')).toContainText('RETAIN SOURCE BEFORE TARGET');
  const current = await page.evaluate(async module => (await import(module)).captureProductNavigation()?.id, sharedModule);
  expect(current).toBe(documentId); expect(state.writes).toHaveLength(1);
});

test('Slides export is a document-menu download with the exact confirmed native content', async ({ page }) => {
  const state = await setup(page); await type(page, 'MENU EXPORT INPUT'); await save(page).click();
  await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  await expect(shell(page).locator('.office-document-bar').getByRole('button', { name: 'Slides 파일 내보내기', exact: true })).toHaveCount(0);
  await shell(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  const downloaded = page.waitForEvent('download'); await page.getByRole('menuitem', { name: 'Slides 파일 내보내기', exact: true }).click();
  const file = await downloaded, path = await file.path(); expect(path).not.toBeNull();
  expect(JSON.parse(await readFile(path!, 'utf8')).document).toEqual(JSON.parse(state.text()).document);
  expect(state.writes).toHaveLength(1);
});


test('explicit conflict recovery locks the source and retains its fixed request before installing the latest native document', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const state = await setup(page); await type(page, 'RETAIN CONFLICT DRAFT'); state.advance();
  await save(page).click();
  await expect(shell(page).getByRole('button', { name: '충돌 초안 복사', exact: true })).toBeVisible();
  await shell(page).getByRole('button', { name: '충돌 초안 복사', exact: true }).click();
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), waiting = new Promise<void>(resolve => { entered = resolve; });
  await page.route(`**/api/v1/tenants/${tenantId}/documents/${documentId}`, async route => { entered(); await held; await route.fallback(); }, { times: 1 });
  await shell(page).getByRole('button', { name: '서버 최신본 열기', exact: true }).click(); await waiting;
  await expect(shell(page).locator('.sl-stage [contenteditable=true]')).toHaveCount(0);
  await expect(shell(page).locator('.sl-stage')).toContainText('RETAIN CONFLICT DRAFT');
  release();
  await expect(shell(page).locator('.sl-stage')).toContainText('CONFLICT SERVER LATEST');
  await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  const retained = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.slides.pending.v1:'))
    .map(key => JSON.parse(localStorage.getItem(key)!)));
  expect(retained.some(record => record.status === 'pending' && record.snapshotText.includes('RETAIN CONFLICT DRAFT'))).toBe(true);
  expect(state.writes).toHaveLength(1);
});


test('short authorized route uses current single-tenant membership and preserves the original on reload', async ({ page }) => {
  await setup(page, { compact: true });
  await expect(shell(page).locator('.sl-stage')).toContainText('Server Slides native title');
  await expect(page).toHaveURL(`${origin}/${workspaceId}/${documentId}?tenant=${tenantId}`);
  await page.reload();
  await expect(shell(page).locator('.sl-stage')).toContainText('Server Slides native title');
});

test('short route asks for a company before reading any overlapping Workspace identity', async ({ page }) => {
  const tenantReads: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/v1/tenants/')) tenantReads.push(request.url()); });
  await setup(page, { compact: true, multiTenant: true });
  await expect(page.getByRole('heading', { name: '회사를 선택하세요' })).toBeVisible();
  expect(tenantReads).toEqual([]);
  await expect(shell(page)).toHaveCount(0);
  await page.getByRole('button', { name: /Slides Company/ }).click();
  await expect(shell(page).locator('.sl-stage')).toContainText('Server Slides native title');
  await expect(page).toHaveURL(`${origin}/${workspaceId}/${documentId}?tenant=${tenantId}`);
});

test('short route refuses a project/document collision without opening either original', async ({ page }) => {
  await setup(page, { compact: true, collision: true });
  await expect(page.getByRole('alert')).toContainText('ambiguous');
  await expect(shell(page)).toHaveCount(0);
  await expect(page).toHaveURL(`${origin}/${workspaceId}/${documentId}`);
});

for (const projectStatus of [403, 503]) test(`short route does not treat the other namespace failure ${projectStatus} as absence`, async ({ page }) => {
  await setup(page, { compact: true, projectStatus });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(shell(page)).toHaveCount(0);
  await expect(page).toHaveURL(`${origin}/${workspaceId}/${documentId}`);
});

test('exact short route still opens when unrelated whole-tree catalog pages fail', async ({ page }) => {
  await setup(page, { compact: true, catalogFail: true });
  await expect(shell(page).locator('.sl-stage')).toContainText('Server Slides native title');
  await expect(page).toHaveURL(`${origin}/${workspaceId}/${documentId}?tenant=${tenantId}`);
});

// These desktop pairs use the same populated original and controlled transport.
// They do not qualify real OIDC, PostgreSQL, or unrelated product surfaces.
async function currentSlidesFile(page: Page) {
  await shell(page).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Slides 파일 내보내기', exact: true }).click();
  const path = await (await downloading).path();
  expect(path).not.toBeNull();
  const file = JSON.parse(await readFile(path!, 'utf8'));
  expect(file.format).toBe('barocss-slides'); expect(file.version).toBe(2);
  // Download creation has its own savedAt; compare the entire native tree.
  return file.document;
}

async function selectPopulatedTitle(page: Page, viewer: boolean) {
  const paragraph = shell(page).locator('.sl-stage .w-paragraph').first();
  await expect(paragraph).toHaveText('Server Slides native title');
  // Read the actual first/last glyphs. A blank point in the centred title frame
  // can select the object without establishing the native text caret.
  const glyphs = await paragraph.evaluate(element => {
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text: Node | null;
    while ((text = walker.nextNode())) {
      if (text.textContent !== 'Server Slides native title') continue;
      const start = element.ownerDocument.createRange(), end = element.ownerDocument.createRange();
      start.setStart(text, 0); start.setEnd(text, 1);
      end.setStart(text, text.textContent.length - 1); end.setEnd(text, text.textContent.length);
      const a = start.getBoundingClientRect(), b = end.getBoundingClientRect();
      return { x1: a.left, centre: a.left + a.width / 2, y1: a.top + a.height / 2, x2: b.right, y2: b.top + b.height / 2 };
    }
    throw new Error('Populated native title glyphs are missing');
  });
  if (!viewer) {
    await page.mouse.dblclick(glyphs.centre, glyphs.y1);
    await expect.poll(() => paragraph.evaluate(element => {
      const selection = element.ownerDocument.getSelection();
      return !!selection?.anchorNode && element.contains(selection.anchorNode);
    })).toBe(true);
    const apple = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform));
    await page.keyboard.press(apple ? 'Meta+ArrowLeft' : 'Home');
    for (let offset = 0; offset < 'Server Slides native title'.length; offset++) await page.keyboard.press('Shift+ArrowRight');
  } else {
    // Read glyph geometry only; the pointer creates the browser selection.
    await page.mouse.move(glyphs.x1, glyphs.y1); await page.mouse.down();
    await page.mouse.move(glyphs.x2, glyphs.y2, { steps: 8 }); await page.mouse.up();
  }
  await expect.poll(() => paragraph.evaluate(element => {
    const selection = element.ownerDocument.getSelection();
    return selection && element.contains(selection.anchorNode) && element.contains(selection.focusNode) ? selection.toString() : '';
  })).toBe('Server Slides native title');
  return paragraph;
}

async function captureSlidesUi(page: Page, info: TestInfo, label: string, surfaces: Locator[]) {
  const geometry = [];
  for (const surface of surfaces) {
    const readSurface = () => surface.evaluate(element => {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      const root = element.closest('[data-server-slides-workspace]');
      const selection = element.ownerDocument.getSelection();
      const title = root?.querySelector('.sl-stage .w-paragraph');
      const ownsTitleRange = !!selection && !!title && !!selection.anchorNode && !!selection.focusNode &&
        title.contains(selection.anchorNode) && title.contains(selection.focusNode) &&
        selection.toString() === 'Server Slides native title';
      const floating = element.matches('[data-floating-surface]');
      const primary = element.matches('[data-slides-formatting]');
      const detail = element.matches('#slides-details');
      const toolbarReady = !primary || (!!element.querySelector('[data-editor-context-toolbar]') &&
        !!element.querySelector('[data-control=bold]') &&
        !!element.querySelector('[aria-label="선택 도구 더보기"]') && !!element.querySelector('[aria-label="선택 속성 열기"]'));
      const controls = [...element.querySelectorAll('button,[role=menuitem],[role=menuitemcheckbox]')]
        .filter(control => {
          const paint = getComputedStyle(control);
          return !control.closest('[hidden]') && control.getClientRects().length > 0 && paint.display !== 'none' && paint.visibility === 'visible';
        })
        .map(control => {
          const box = control.getBoundingClientRect();
          const hit = control.ownerDocument.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return { disabled: control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true' || !!control.closest('[inert]'),
            name: control.getAttribute('aria-label') ?? control.textContent, width: box.width, height: box.height,
            layoutWidth: (control as HTMLElement).offsetWidth, layoutHeight: (control as HTMLElement).offsetHeight,
            x: box.x, y: box.y, right: box.right, bottom: box.bottom, ownsHit: !!hit && (control === hit || control.contains(hit)) };
        });
      return { ready: element.isConnected && !element.closest('[hidden],[inert]') && rect.width > 0 && rect.height > 0 &&
        style.display !== 'none' && style.visibility === 'visible' && (!floating || element.getAttribute('data-floating-ready') === 'true') &&
        toolbarReady && (!primary || ownsTitleRange),
        floating, primary, detail, toolbarReady, ownsTitleRange,
        placement: { left: element.style.left, top: element.style.top, viewportWidth: element.ownerDocument.defaultView?.innerWidth,
          ancestors: [...(function* () { let parent = element.parentElement; while (parent) { yield parent; parent = parent.parentElement; } })()].map(parent => ({ className: parent.className, transform: getComputedStyle(parent).transform, translate: getComputedStyle(parent).translate, bounds: parent.getBoundingClientRect().toJSON(), position: getComputedStyle(parent).position, filter: getComputedStyle(parent).filter, contain: getComputedStyle(parent).contain })) },
        bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, controls };
    }, undefined, { timeout: 5_000 });
    let measurement: Awaited<ReturnType<typeof readSurface>> | undefined;
    // Poll only actual native readiness. Bounds, controls, and the owned range
    // come from this same observation; geometry failures are never retried.
    await expect.poll(async () => { measurement = await readSurface(); return measurement.ready; }).toBe(true);
    if (!measurement) throw new Error('Slides surface readiness was not observed');
    await info.attach(`${label}-surface-observation`, { body: JSON.stringify(measurement), contentType: 'application/json' });
    const { bounds } = measurement;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    if (measurement.primary) {
      expect(bounds.width).toBeLessThanOrEqual(480); expect(bounds.height).toBeLessThanOrEqual(48);
    }
    const measureControl = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const hit = element.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true' || !!element.closest('[inert]'), name: element.getAttribute('aria-label') ?? element.textContent, width: rect.width, height: rect.height,
        layoutWidth: (element as HTMLElement).offsetWidth, layoutHeight: (element as HTMLElement).offsetHeight,
        x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, ownsHit: !!hit && (element === hit || element.contains(hit)) };
    };
    const controls = [];
    const candidates = surface.locator('button,[role=menuitem],[role=menuitemcheckbox]');
    if (!measurement.detail) {
      controls.push(...measurement.controls);
    } else for (const candidate of await candidates.all()) {
      if (!await candidate.evaluate(element => {
        const style = getComputedStyle(element);
        return !element.closest('[hidden]') && element.getClientRects().length > 0 && style.display !== 'none' && style.visibility === 'visible';
      })) continue;
      // Native detail is scrollable. Reveal each control, including below the fold.
      await candidate.scrollIntoViewIfNeeded();
      controls.push(await candidate.evaluate(measureControl));
    }
    for (const control of controls) {
      // Transformed DOMRects can round a 32px layout target to 31.99997px.
      // Keep the exact CSS target requirement; genuine 24px controls still fail.
      expect(control.layoutWidth, control.name ?? '').toBeGreaterThanOrEqual(32);
      expect(control.layoutHeight, control.name ?? '').toBeGreaterThanOrEqual(32);
      expect(control.width, control.name ?? '').toBeGreaterThanOrEqual(32 - .001);
      expect(control.height, control.name ?? '').toBeGreaterThanOrEqual(32 - .001);
      expect(control.x, control.name ?? '').toBeGreaterThanOrEqual(0);
      expect(control.y, control.name ?? '').toBeGreaterThanOrEqual(0);
      expect(control.right, control.name ?? '').toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(control.bottom, control.name ?? '').toBeLessThanOrEqual(page.viewportSize()!.height);
      if (!control.disabled) expect(control.ownsHit, control.name ?? '').toBe(true);
    }
    geometry.push({ bounds, controls, readiness: { floating: measurement.floating, primary: measurement.primary, detail: measurement.detail,
      toolbarReady: measurement.toolbarReady, ownsTitleRange: measurement.ownsTitleRange } });
  }
  await info.attach(`${label}-geometry`, { body: JSON.stringify(geometry), contentType: 'application/json' });
  await info.attach(`${label}-screenshot`, { body: await page.screenshot({ animations: label === 'during-parent-motion' ? 'allow' : 'disabled' }), contentType: 'image/png' });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  for (const theme of ['light', 'dark'] as const) for (const viewer of [false, true]) {
    test(`matched authenticated Slides selection ${viewport.width}x${viewport.height} ${theme} ${viewer ? 'viewer' : 'writer'}`, async ({ page }, info) => {
      await page.setViewportSize(viewport); await page.emulateMedia({ colorScheme: theme });
      const state = await setup(page, { viewer });
      await expect(shell(page).locator('.sl-stage .w-paragraph').first()).toBeVisible();
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
      const header = shell(page).locator('.office-editor-header');
      await expect(header).toHaveCount(1); expect((await header.boundingBox())!.height).toBe(48);
      await captureSlidesUi(page, info, 'idle', [header]);
      const confirmedText = state.text();
      const sourcePaths = ['apps/office/src/auth-app.tsx', 'apps/slide/src/app.tsx', 'apps/slide/src/runtime.ts', 'apps/slide/src/server-workspace.tsx',
        'packages/office-slides/src/selection-chrome.tsx', 'packages/office-slides/src/selection-tools.tsx',
        'packages/office-ui/src/command-search.tsx', 'packages/office-ui/src/secondary-popup.tsx', 'apps/office/tests/auth-slides.spec.ts'];
      const source = await Promise.all(sourcePaths.map(async path => ({ path, sha256: hash(await readFile(new URL(`../../../${path}`, import.meta.url), 'utf8')) })));
      await info.attach('controlled-source-binding', { body: JSON.stringify({ viewport, theme, role: viewer ? 'viewer' : 'writer', transport: 'controlled', source }), contentType: 'application/json' });
      const original = JSON.parse(state.text());
      expect(await currentSlidesFile(page)).toEqual(original.document);
      const protectedRows = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.slides.pending.v1:')).sort().map(key => localStorage.getItem(key)));
      const beforeRows = await protectedRows();
      const paragraph = await selectPopulatedTitle(page, viewer);
      const primary = shell(page).locator('[data-slides-formatting]').filter({ has: page.getByRole('button', { name: '굵게', exact: true }) });
      if (!viewer) {
        await expect(primary).toHaveCount(1);
        await captureSlidesUi(page, info, 'primary', [header, primary]);
        await primary.getByRole('button', { name: '굵게', exact: true }).click();
        await expect(paragraph.locator('.mark-bold')).not.toHaveCount(0);
        await header.locator('[data-control=undo]').click();
        await expect(paragraph.locator('.mark-bold')).toHaveCount(0);
        expect(await currentSlidesFile(page)).toEqual(original.document);
        await selectPopulatedTitle(page, false);
        const more = primary.getByRole('button', { name: '선택 도구 더보기', exact: true });
        await more.click();
        const popup = page.getByRole('menu', { name: '선택한 Slides 추가 도구', exact: true });
        await captureSlidesUi(page, info, 'more', [popup]);
        await expect(popup.locator('[data-control=align-left]')).toBeEnabled();
        await page.keyboard.press('Escape'); await expect(popup).toHaveCount(0); await expect(more).toBeFocused();
        const detail = primary.getByRole('button', { name: '선택 속성 열기', exact: true });
        await detail.click();
        const panel = shell(page).locator('#slides-details');
        await expect(panel).toBeFocused(); await captureSlidesUi(page, info, 'detail', [panel]);
        await page.keyboard.press('Escape'); await expect(panel).toBeHidden(); await expect(detail).toBeFocused();
      } else {
        await expect(shell(page).locator('[data-slides-formatting]')).toHaveCount(0);
        await expect(shell(page).getByRole('button', { name: '선택 도구 더보기', exact: true })).toHaveCount(0);
        const panels = header.getByRole('menuitem', { name: '패널', exact: true });
        await panels.click(); await page.getByRole('menuitemcheckbox', { name: '속성 · 크기, 위치, 모양', exact: true }).click();
        const panel = shell(page).locator('#slides-details');
        await expect(panel).toBeVisible();
        const fields = panel.locator('.sl-properties-body');
        await expect(fields).toHaveAttribute('disabled', ''); await expect(fields).toHaveAttribute('inert', '');
        const authority = await fields.locator('input,select,textarea,button').evaluateAll(controls => controls.map(control => ({
          disabled: control.matches(':disabled'), inert: !!control.closest('[inert]')
        })));
        expect(authority.length).toBeGreaterThan(0);
        expect(authority.every(control => control.disabled && control.inert)).toBe(true);
        await panel.focus(); await captureSlidesUi(page, info, 'viewer-detail', [header, panel]);
        await page.keyboard.press('Escape'); await expect(panel).toBeHidden(); await expect(panels).toBeFocused();
        await paragraph.click(); await page.keyboard.type('FORBIDDEN UI INPUT'); await page.keyboard.press('ControlOrMeta+b');
        await expect(paragraph).toHaveText('Server Slides native title');
      }
      const search = header.getByRole('button', { name: '명령 검색', exact: true });
      await search.focus(); await search.press('Enter');
      const query = page.getByRole('combobox', { name: '명령 검색어', exact: true });
      await expect(query).toBeFocused(); await query.fill('사각형');
      const result = page.getByRole('option'); await expect(result).toHaveCount(1);
      if (viewer) {
        await expect(result).toHaveAttribute('aria-disabled', 'true');
        await query.press('Enter'); await expect(query).toBeVisible();
      } else await expect(result).not.toHaveAttribute('aria-disabled', 'true');
      await captureSlidesUi(page, info, 'search', [page.getByRole('dialog', { name: '명령 검색', exact: true })]);
      await query.press('Escape'); await expect(query).toHaveCount(0); await expect(search).toBeFocused();
      if (viewer) {
        await expect(shell(page).locator('[contenteditable=true]')).toHaveCount(0);
        await expect(save(page)).toHaveCount(0); expect(await currentSlidesFile(page)).toEqual(original.document);
        expect(await protectedRows()).toEqual(beforeRows); expect(state.text()).toBe(confirmedText);
        expect(state.revision()).toBe(1); expect(state.writes).toHaveLength(0);
      } else {
        await type(page, 'CONTINUED MATCHED INPUT ');
        await save(page).click(); await expect(shell(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
        expect(state.writes).toHaveLength(1); expect(state.revision()).toBe(2);
        expect(await currentSlidesFile(page)).toEqual(JSON.parse(state.text()).document);
        expect(state.text()).toContain('CONTINUED MATCHED INPUT ');
        await page.reload(); await expect(shell(page).locator('.sl-stage')).toContainText('CONTINUED MATCHED INPUT ');
        expect(await currentSlidesFile(page)).toEqual(JSON.parse(state.text()).document); expect(state.writes).toHaveLength(1);
      }
      await captureSlidesUi(page, info, 'continued-or-retained', [header]);
      const afterSource = await Promise.all(sourcePaths.map(async path => ({ path, sha256: hash(await readFile(new URL(`../../../${path}`, import.meta.url), 'utf8')) })));
      expect(afterSource).toEqual(source);
    });
  }
}

test('Slides nested selection menu retains viewport placement while native CSS entrance is replayed', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const state = await setup(page);
  await expect(shell(page).locator('.sl-stage .w-paragraph').first()).toBeVisible();
  const original = JSON.parse(state.text()).document;
  await selectPopulatedTitle(page, false);
  const primary = shell(page).locator('[data-slides-formatting]').filter({ has: page.getByRole('button', { name: '굵게', exact: true }) });
  await expect(primary).toHaveAttribute('data-floating-ready', 'true');
  await primary.getByRole('button', { name: '선택 도구 더보기', exact: true }).click();
  const popup = page.getByRole('menu', { name: '선택한 Slides 추가 도구', exact: true });
  await expect(popup).toHaveAttribute('data-floating-ready', 'true');
  // Replay the current owner's actual CSS animation and hold its midpoint.
  // This isolates a child opened before parent motion ends; it does not set
  // native content or selection, and is recorded as controlled CSS replay.
  const currentMotion = await primary.evaluate(element => {
    const surface = element as HTMLElement;
    surface.style.animation = 'none';
    void surface.offsetHeight;
    surface.style.removeProperty('animation');
    const active = surface.getAnimations();
    for (const animation of active) { animation.pause(); animation.currentTime = Number(animation.effect?.getTiming().duration) / 2; }
    return { translate: getComputedStyle(element).translate, bounds: element.getBoundingClientRect().toJSON(), animations: active.map(animation => ({ time: animation.currentTime, state: animation.playState })) };
  });
  expect(currentMotion.animations.length).toBeGreaterThan(0);
  await info.attach('current-parent-motion', { body: JSON.stringify(currentMotion), contentType: 'application/json' });
  await captureSlidesUi(page, info, 'during-parent-motion', [popup]);
  await page.keyboard.press('Escape'); await expect(popup).toHaveCount(0);
  expect(await currentSlidesFile(page)).toEqual(original);
  expect(state.writes).toHaveLength(0);
});
