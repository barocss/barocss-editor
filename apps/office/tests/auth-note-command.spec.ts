import { expect, test, type Page, type Locator } from '@playwright/test';
import { createHash } from 'node:crypto';
import { openNoteTree, noteTreeOf } from '../../../packages/office-note/src/session';
import { serializeNoteFile } from '../../../packages/office-note/src/note-file-codec';

// Controlled transport; the mounted authenticated host and every Note editor are real.
const id = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const documentId = '00000000-0000-4000-8000-000000000003';
const pageId = '00000000-0000-4000-8000-000000000005';
const fixture = { stype: 'note' as const, attributes: { title: 'Alpha Note', pageId }, content: [
  { stype: 'paragraph', attributes: { retained: 'parent-block' }, content: [{ stype: 'inline-text', text: 'Parent remains intact', marks: [{ type: 'italic' }] }] },
  { stype: 'noteDatabase', attributes: { source: 'tasks' } },
  { stype: 'resources', content: [
    { stype: 'dataset', attributes: { name: 'tasks', fields: [{ name: 'Title', kind: 'text' }], records: [{ Title: 'Task' }], rowIds: ['task-row'] } },
    { stype: 'richText', attributes: { id: 'task-row', retained: 'body' }, content: [{ stype: 'paragraph', attributes: { retained: 'deep-block' }, content: [{ stype: 'inline-text', text: 'Nested target', marks: [] }] }] }
  ] }
] };
const session = openNoteTree(fixture);
let snapshotText: string;
try { snapshotText = serializeNoteFile({ ...fixture, content: noteTreeOf(session.editor.dataStore, session.rootId)!.content as unknown[] }); }
finally { session.close(); }
const original = JSON.parse(snapshotText).document;
const documentHead = { documentId, tenantId: id, workspaceId, product: 'note', title: 'Alpha Note', metadataRevision: 1, mode: 'snapshot', revision: 1, pageId,
  documentKey: `wonffice-${id}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 1, snapshotHash: createHash('sha256').update(snapshotText).digest('hex') };
const issuer = 'http://127.0.0.1:18180/realms/wonffice-local';
const officeOrigin = `http://127.0.0.1:${process.env.OFFICE_AUTH_TEST_PORT ?? '5193'}`;
type Role = 'owner' | 'admin' | 'editor' | 'viewer';

async function mockLogin(page: Page, options: { role?: Role; tenants?: number; apiStatus?: number; accessStatus?: number; operatorStatus?: number; workspaceCount?: number; workspacesStatus?: number; documentCount?: number; documentsStatus?: number; openStatus?: number; openWorkspace?: string } = {}) {
  const { role = 'editor', tenants = 1, apiStatus = 200, accessStatus = 200,
    operatorStatus = 403, workspaceCount = 1, workspacesStatus = 200, documentCount = 0, documentsStatus = 200,
    openStatus = 200, openWorkspace = workspaceId } = options;
  await page.route(`${issuer}/.well-known/openid-configuration`, route => route.fulfill({
    contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ issuer, authorization_endpoint: `${issuer}/protocol/openid-connect/auth`, token_endpoint: `${issuer}/protocol/openid-connect/token`, end_session_endpoint: `${issuer}/protocol/openid-connect/logout` }),
  }));
  await page.route(`${issuer}/protocol/openid-connect/auth**`, route => {
    const state = new URL(route.request().url()).searchParams.get('state');
    return route.fulfill({ contentType: 'text/html', body: `<script>location.replace('${officeOrigin}/auth/callback?code=synthetic&state=${encodeURIComponent(state ?? '')}')</script>` });
  });
  await page.route(`${issuer}/protocol/openid-connect/logout**`, route => {
    const state = new URL(route.request().url()).searchParams.get('state');
    return route.fulfill({ contentType: 'text/html', body: `<script>location.replace('${officeOrigin}/?state=${encodeURIComponent(state ?? '')}')</script>` });
  });
  await page.route(`${issuer}/protocol/openid-connect/token`, route => route.fulfill({
    contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 300 }),
  }));
  await page.route('**/api/v1/me', route => route.fulfill({
    status: apiStatus, contentType: 'application/json',
    body: JSON.stringify(apiStatus === 200 ? { issuer, subject: 'synthetic-user', tenants: tenants ? [{ tenantId: id, name: 'Alpha Company', role }] : [], nextCursor: null } : { status: 'service_unavailable' }),
  }));
  await page.route(`**/api/v1/tenants/${id}/access`, route => route.fulfill({ status: accessStatus, contentType: 'application/json', body: JSON.stringify(accessStatus === 200 ? { tenantId: id, role } : { status: 'forbidden' }) }));
  await page.route(`**/api/v1/tenants/${id}/workspaces**`, route => route.fulfill({
    status: workspacesStatus, contentType: 'application/json',
    body: JSON.stringify(workspacesStatus === 200
      ? { workspaces: workspaceCount ? [{ id: workspaceId, name: 'Alpha Workspace' }] : [], nextCursor: null }
      : { status: workspacesStatus === 403 ? 'forbidden' : 'service_unavailable' }),
  }));
  await page.route(`**/api/v1/tenants/${id}/projects?**`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ projects: [], nextCursor: null }) }));
  // Exact item discovery must verify project absence; list absence is not enough.
  await page.route(`**/api/v1/tenants/${id}/projects/*`, route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ status: 'not_found' }) }));
  await page.route(`**/api/v1/tenants/${id}/documents?**`, route => route.fulfill({
    status: documentsStatus, contentType: 'application/json',
    body: JSON.stringify(documentsStatus === 200
      ? { documents: Array.from({ length: documentCount }, () => documentHead), nextCursor: null }
      : { status: documentsStatus === 403 ? 'forbidden' : 'service_unavailable' }),
  }));
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}`, route => route.fulfill({
    status: openStatus, contentType: 'application/json', body: JSON.stringify(openStatus === 200
      ? { document: { ...documentHead, workspaceId: openWorkspace }, snapshotText }
      : { status: openStatus === 403 ? 'forbidden' : 'service_unavailable' }),
  }));
  await page.route('**/api/v1/operator/access', route => route.fulfill({ status: operatorStatus, contentType: 'application/json', body: JSON.stringify(operatorStatus === 200 ? { operator: true } : { status: operatorStatus === 403 ? 'forbidden' : 'service_unavailable' }) }));
}


async function assertContained(surface: Locator, width: number, height: number) {
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox(); expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width); expect(box!.y + box!.height).toBeLessThanOrEqual(height);
}
async function assertActualHit(control: Locator) {
  const box = await control.boundingBox(); expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(32); expect(box!.height).toBeGreaterThanOrEqual(32);
  expect(await control.evaluate(node => {
    const rect = node.getBoundingClientRect(), hit = node.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return !!hit && (node === hit || node.contains(hit));
  })).toBe(true);
}

for (const [width, height] of [[1440, 900], [1280, 800]]) for (const theme of ['light', 'dark'] as const)
for (const role of ['editor', 'viewer'] as const) test(`controlled authenticated Note ${role} ${width}x${height} ${theme} command search keeps native target, authority and full bytes`, async ({ page }, info) => {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme: theme });
  let writes = 0;
  page.on('request', request => { if (/\/api\/v1\/tenants\/[^/]+\/documents/.test(new URL(request.url()).pathname) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) writes++; });
  await mockLogin(page, { role, documentCount: 1 });
  await page.goto(`/products/note/?tenant=${id}&workspace=${workspaceId}&document=${documentId}&product=note`);
  await page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true }).click();
  const host = page.locator('[data-server-note-workspace]');
  await expect(host.locator('[data-note-editor]').first()).toHaveAttribute('data-note-editable', String(role === 'editor'));
  await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
  const status = host.locator('[data-save-status]');
  await expect(status).toHaveText('서버 저장 확인됨'); await expect(status).toHaveAttribute('data-quiet', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  const header = host.locator('.office-editor-header'); await expect(header).toHaveCount(1);
  await assertContained(header, width, height); expect((await header.boundingBox())!.height).toBe(48);
  await expect(page.locator('[data-note-formatting]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`${width}-${theme}-${role}-idle.png`), animations: 'disabled' });
  await host.getByRole('button', { name: '행 1 열기', exact: true }).click();
  const paragraph = page.locator('[data-db-item-body] .on-doc > p').first();
  await expect(paragraph).toHaveText('Nested target'); const nativeBody = await paragraph.elementHandle();
  await paragraph.click();
  const apple = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform));
  if (role === 'editor') {
    await page.keyboard.press(apple ? 'Meta+ArrowDown' : 'Control+End');
    for (let index = 0; index < 'Nested target'.length; index++) await page.keyboard.press('Shift+ArrowLeft');
  } else await paragraph.click({ clickCount: 3 });
  await expect.poll(() => paragraph.evaluate(node => {
    const selected = getSelection(); return !!selected?.anchorNode && node.contains(selected.anchorNode) && selected.toString().trimEnd() === 'Nested target';
  })).toBe(true);
  const primary = page.locator('[data-note-formatting]');
  if (role === 'editor') {
    await assertContained(primary, width, height);
    const primaryBox = await primary.boundingBox(); expect(primaryBox).not.toBeNull();
    expect(primaryBox!.height).toBeLessThanOrEqual(48); expect(primaryBox!.width).toBeLessThanOrEqual(480);
    await info.attach(`${width}-${theme}-${role}-primary-dimensions`, {
      contentType: 'application/json', body: Buffer.from(JSON.stringify({ width: primaryBox!.width, height: primaryBox!.height })),
    });
    await assertActualHit(primary.getByRole('button', { name: '굵게', exact: true }));
    await page.screenshot({ path: info.outputPath(`${width}-${theme}-${role}-selection-primary.png`), animations: 'disabled' });
    const moreTrigger = primary.getByRole('button', { name: '추가 서식', exact: true });
    await assertActualHit(moreTrigger); await moreTrigger.click();
    const more = page.getByRole('menu', { name: '추가 서식', exact: true });
    await assertContained(more, width, height); await expect(primary).toBeVisible();
    await expect(more.getByRole('menuitem', { name: '밑줄', exact: true })).toBeFocused();
    await page.screenshot({ path: info.outputPath(`${width}-${theme}-${role}-owned-more.png`), animations: 'disabled' });
    await page.keyboard.press('Escape'); await expect(more).toHaveCount(0);
    await expect(moreTrigger).toBeFocused(); await expect(primary).toBeVisible();
    await expect(paragraph).toHaveText('Nested target');
  } else {
    await expect(primary).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`${width}-${theme}-${role}-readonly-selection.png`), animations: 'disabled' });
  }
  const search = async (label: string) => {
    await page.keyboard.press(apple ? 'Meta+Shift+p' : 'Control+Shift+p');
    const query = page.getByRole('combobox', { name: '명령 검색어', exact: true });
    await expect(query).toBeFocused(); await query.fill(label); return query;
  };
  const query = await search('굵게');
  if (role === 'editor') {
    await expect(page.getByRole('option').filter({ hasText: '굵게' })).not.toHaveAttribute('aria-disabled', 'true');
    await query.press('Enter'); await expect(paragraph.locator('.mark-bold')).toHaveText('Nested target');
    await (await search('실행 취소')).press('Enter'); await expect(paragraph.locator('.mark-bold')).toHaveCount(0);
    await (await search('본문 찾기')).press('Enter');
    const navigation = page.getByRole('region', { name: '문서 탐색', exact: true });
    await navigation.getByRole('searchbox', { name: '본문에서 찾기', exact: true }).fill('Nested target');
    await expect(navigation.getByRole('status')).toHaveText('1 / 1');
    await navigation.getByRole('searchbox').press('Escape');
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:'))
      .map(key => JSON.parse(localStorage.getItem(key)!)).filter(record => record.scope.documentRef === '00000000-0000-4000-8000-000000000005')
      .map(record => JSON.parse(record.snapshotText).document))).toEqual([original]);
    await expect(status).toHaveText('저장되지 않음'); await expect(status).not.toHaveAttribute('data-quiet', 'true');
  } else {
    await expect(page.getByRole('option').filter({ hasText: '굵게' })).toHaveAttribute('aria-disabled', 'true');
    await page.screenshot({ path: info.outputPath(`${width}-${theme}-${role}-readonly-command-detail.png`), animations: 'disabled' });
    await query.press('Enter'); await expect(query).toBeFocused(); await expect(paragraph.locator('.mark-bold')).toHaveCount(0);
    await query.fill('본문 찾기'); await query.press('Enter');
    const navigation = page.getByRole('region', { name: '문서 탐색', exact: true });
    await navigation.getByRole('searchbox', { name: '본문에서 찾기', exact: true }).fill('Parent remains intact');
    await expect(navigation.getByRole('status')).toHaveText('검색 결과 없음');
    await navigation.getByRole('searchbox').press('Escape');
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:')))).toEqual([]);
    await expect(status).toHaveText('서버 저장 확인됨');
    await paragraph.click({ clickCount: 3 });
    await page.keyboard.insertText('DENIED-VIEWER-INPUT');
    await page.keyboard.press(apple ? 'Meta+s' : 'Control+s');
    await expect(paragraph).toHaveText('Nested target');
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:')))).toEqual([]);
    // A sibling control does not own this child command target.
    await page.keyboard.press('Tab');
    expect(await paragraph.evaluate(node => !node.contains(document.activeElement) && document.activeElement !== node.closest('[data-side-peek]'))).toBe(true);
    await page.keyboard.press(apple ? 'Meta+Shift+p' : 'Control+Shift+p');
    await expect(page.getByRole('combobox', { name: '명령 검색어', exact: true })).toHaveCount(0);
  }
  expect(await nativeBody!.evaluate(node => node.isConnected)).toBe(true);
  await expect(paragraph).toHaveText('Nested target');
  if (role === 'editor') {
    await paragraph.click(); await page.keyboard.press(apple ? 'Meta+ArrowDown' : 'Control+End');
    await page.keyboard.insertText('!'); await expect(paragraph).toHaveText('Nested target!');
    const edited = structuredClone(original);
    edited.content[2].content[1].content[0].content[0].text = 'Nested target!';
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:'))
      .map(key => JSON.parse(localStorage.getItem(key)!)).filter(record => record.scope.documentRef === '00000000-0000-4000-8000-000000000005')
      .map(record => JSON.parse(record.snapshotText).document))).toEqual([edited]);
    await expect(status).toHaveText('저장되지 않음'); await expect(status).not.toHaveAttribute('data-quiet', 'true');
  }
  await page.screenshot({ path: info.outputPath(`${width}-${theme}-${role}-dismissed-continued-input.png`), animations: 'disabled' });
  expect(writes).toBe(0); expect(JSON.parse(snapshotText).document).toEqual(original);
});
