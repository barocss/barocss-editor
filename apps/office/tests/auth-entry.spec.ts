import { projectFeedbackAction } from './project-feedback-menu.helpers';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createSampleDocument } from '../../../packages/office-word/src/sample-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';
import { createSampleDeck } from '../../../packages/office-slides/src/sample-deck';
import { deckFileText } from '../../../packages/office-slides/src/deck-file';
import { noteTreeOf, openNoteTree } from '../../../packages/office-note/src/session';
import { serializeNoteFile } from '../../../packages/office-note/src/note-file-codec';

const id = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const documentId = '00000000-0000-4000-8000-000000000003';
const pageId = '00000000-0000-4000-8000-000000000005';
const snapshotText = JSON.stringify({ format: 'barocss-note', version: 1,
  document: { stype: 'note', attributes: { title: 'Alpha Note', pageId },
    content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Mock body' }] }] } });
const documentHead = { documentId, tenantId: id, workspaceId, product: 'note', title: 'Alpha Note',
  metadataRevision: 1, mode: 'snapshot', revision: 1, pageId,
  documentKey: `wonffice-${id}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 1,
  snapshotHash: createHash('sha256').update(snapshotText).digest('hex') };
const issuer = 'http://127.0.0.1:18180/realms/wonffice-local';
const officeOrigin = `http://127.0.0.1:${process.env.OFFICE_AUTH_TEST_PORT ?? '5191'}`;
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

test('login choice is intent; current server role decides admin entry', async ({ page }) => {
  await mockLogin(page, { role: 'viewer' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Wonffice에 들어가기' })).toBeVisible();
  await page.getByRole('button', { name: '회사 관리자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '회사를 선택하세요' })).toBeVisible();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await expect(page.getByRole('heading', { name: '관리자 권한이 없습니다' })).toBeVisible();
  await expect(page.getByRole('button', { name: '사용자 화면 보기' })).toBeVisible();
  await page.getByRole('button', { name: '사용자 화면 보기' }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Company · 사용자' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Alpha Workspace' })).toBeVisible();
});

test('server owner may reach the narrow company-admin placeholder', async ({ page }) => {
  await mockLogin(page, { role: 'owner' });
  await page.goto('/');
  await page.getByRole('button', { name: '회사 관리자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Company · 회사 관리자' })).toBeVisible();
  await expect(page.getByText('관리 업무 화면은 아직 연결되지 않았습니다.')).toBeVisible();
});

test('zero active tenants differs from API failure', async ({ page }) => {
  await mockLogin(page, { tenants: 0 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '접근할 수 있는 회사가 없습니다' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다른 계정으로 로그인' })).toBeVisible();
});

test('a permitted company with no workspaces is not reported as no company', async ({ page }) => {
  await mockLogin(page, { workspaceCount: 0 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Company · 사용자' })).toBeVisible();
  await expect(page.getByText('이 회사에는 자료함이 없습니다.')).toBeVisible();
  await expect(page.getByText('접근할 수 있는 회사가 없습니다')).toHaveCount(0);
});

test('workspace service failure does not appear as an empty workspace', async ({ page }) => {
  await mockLogin(page, { workspacesStatus: 503 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await expect(page.getByRole('heading', { name: '접근 권한을 확인하지 못했습니다' })).toBeVisible();
  await expect(page.getByText('이 회사에는 자료함이 없습니다.')).toHaveCount(0);
});

test('workspace cursor loads a later page without mixing in browser-local documents', async ({ page }) => {
  await mockLogin(page);
  const laterId = '00000000-0000-4000-8000-000000000004';
  await page.unroute(`**/api/v1/tenants/${id}/workspaces**`);
  await page.route(`**/api/v1/tenants/${id}/workspaces**`, route => {
    const after = new URL(route.request().url()).searchParams.get('after');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(after
      ? { workspaces: [{ id: laterId, name: 'Later Workspace' }], nextCursor: null }
      : { workspaces: [{ id: workspaceId, name: 'Alpha Workspace' }], nextCursor: workspaceId }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await expect(page.getByRole('button', { name: 'Later Workspace' })).toHaveCount(0);
  await page.getByRole('button', { name: '자료함 더 보기' }).click();
  await expect(page.getByRole('button', { name: 'Later Workspace' })).toBeVisible();
});

test('a late workspace response cannot restore the old company after logout', async ({ page, context }) => {
  await mockLogin(page);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.unroute(`**/api/v1/tenants/${id}/workspaces**`);
  await page.route(`**/api/v1/tenants/${id}/workspaces**`, async route => {
    await waiting;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ workspaces: [{ id: workspaceId, name: 'Alpha Workspace' }], nextCursor: null }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate(() => localStorage.setItem('wonffice.oidc.logout', String(Date.now())));
  await expect(page.getByRole('heading', { name: 'Wonffice에 들어가기' })).toBeVisible();
  release();
  await expect(page.getByText('Alpha Workspace')).toHaveCount(0);
});

test('a permitted workspace with documents is not reported as empty', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Alpha Note', exact: true })).toBeVisible();
  await expect(page.getByText('이 자료함에는 저장된 Note 문서가 없습니다.')).toHaveCount(0);
});

test('document list failure never becomes an empty company or empty document state', async ({ page }) => {
  await mockLogin(page, { documentsStatus: 503 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  const currentURL = page.url();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.locator('.ow-file-navigation').getByRole('alert')).toContainText('접근 권한을 확인하지 못했습니다.');
  await expect(page.locator('.ow-file-navigation').getByRole('button', { name: '다시 불러오기', exact: true })).toBeVisible();
  await expect(page).toHaveURL(currentURL);
  await expect(page.getByText('이 자료함에는 저장된 Note 문서가 없습니다.')).toHaveCount(0);
});

test('API outage shows retry, not an empty library', async ({ page }) => {
  await mockLogin(page, { apiStatus: 503 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '접근 권한을 확인하지 못했습니다' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 확인' })).toBeVisible();
  await expect(page.getByText('접근할 수 있는 회사가 없습니다')).toHaveCount(0);
});

test('a network failure can recover without turning into an empty company', async ({ page }) => {
  await mockLogin(page);
  const unavailable = (route: Route) => route.abort();
  await page.route('**/api/v1/me', unavailable);
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '접근 권한을 확인하지 못했습니다' })).toBeVisible();
  await page.unroute('**/api/v1/me', unavailable);
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByRole('heading', { name: '회사를 선택하세요' })).toBeVisible();
});

test('expired identity and revoked tenant are distinct states', async ({ page }) => {
  await mockLogin(page, { apiStatus: 401 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '로그인이 필요합니다' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 로그인' })).toBeVisible();

  await page.reload();
  await page.unroute('**/api/v1/me');
  await mockLogin(page, { accessStatus: 403 });
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다른 회사 선택' })).toBeVisible();
});

test('logout in another tab hides the prior company immediately', async ({ page, context }) => {
  await mockLogin(page);
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Company · 사용자' })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate(() => localStorage.setItem('wonffice.oidc.logout', String(Date.now())));
  await expect(page.getByRole('heading', { name: 'Wonffice에 들어가기' })).toBeVisible();
  await expect(page.getByText('Alpha Company')).toHaveCount(0);
});

test('restored visibility rechecks a revoked company role', async ({ page, context }) => {
  await mockLogin(page);
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Company · 사용자' })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/');
  await page.unroute(`**/api/v1/tenants/${id}/access`);
  await page.route(`**/api/v1/tenants/${id}/access`, route => route.fulfill({
    status: 403, contentType: 'application/json', body: '{"status":"forbidden"}',
  }));
  await page.bringToFront();
  // Headless Chromium may keep both tabs visible, so deliver the restore event.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Alpha Company · 사용자' })).toHaveCount(0);
});

test('reload uses provider SSO and checks current membership again', async ({ page }) => {
  await mockLogin(page, { role: 'admin' });
  const prompts: string[] = [];
  await page.route(`${issuer}/protocol/openid-connect/auth**`, route => {
    const url = new URL(route.request().url());
    prompts.push(url.searchParams.get('prompt') ?? '');
    return route.fulfill({ contentType: 'text/html', body: `<script>location.replace('${officeOrigin}/auth/callback?code=synthetic&state=${encodeURIComponent(url.searchParams.get('state') ?? '')}')</script>` });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '회사 관리자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Company · 회사 관리자' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '회사를 선택하세요' })).toBeVisible();
  expect(prompts).toEqual(['', 'none']);
});

test('a cancelled provider login returns to an explicit retry state', async ({ page }) => {
  await mockLogin(page);
  await page.route(`${issuer}/protocol/openid-connect/auth**`, route => {
    const state = new URL(route.request().url()).searchParams.get('state');
    return route.fulfill({ contentType: 'text/html', body: `<script>location.replace('${officeOrigin}/auth/callback?error=access_denied&state=${encodeURIComponent(state ?? '')}')</script>` });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '로그인이 필요합니다' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 로그인' })).toBeVisible();
  await expect(page.getByText('Alpha Company')).toHaveCount(0);
});

test('account switch rechecks the new server identity and does not retain the old company', async ({ page }) => {
  await mockLogin(page, { role: 'owner' });
  let account = 0;
  await page.route(`${issuer}/protocol/openid-connect/token`, route => route.fulfill({
    contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ access_token: `account-${++account}`, token_type: 'Bearer', expires_in: 300 }),
  }));
  await page.route('**/api/v1/me', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    issuer, subject: route.request().headers().authorization === 'Bearer account-1' ? 'account-A' : 'account-B',
    tenants: [{ tenantId: id, name: route.request().headers().authorization === 'Bearer account-1' ? 'First Company' : 'Second Company', role: 'owner' }], nextCursor: null,
  }) }));
  await page.goto('/');
  await page.getByRole('button', { name: '회사 관리자로 들어가기' }).click();
  await page.getByRole('button', { name: /First Company/ }).click();
  await expect(page.getByRole('heading', { name: 'First Company · 회사 관리자' })).toBeVisible();
  await page.getByRole('button', { name: '계정 전환' }).click();
  await expect(page.getByRole('heading', { name: 'Wonffice에 들어가기' })).toBeVisible();
  await page.getByRole('button', { name: '회사 관리자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '회사를 선택하세요' })).toBeVisible();
  await expect(page.getByText('First Company')).toHaveCount(0);
  await page.getByRole('button', { name: /Second Company/ }).click();
  await expect(page.getByRole('heading', { name: 'Second Company · 회사 관리자' })).toBeVisible();
});

test('all direct product URLs fail closed before local document reads', async ({ page }) => {
  await page.addInitScript(() => {
    (window as typeof window & { __officeDbOpens?: number }).__officeDbOpens = 0;
    const original = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      (window as typeof window & { __officeDbOpens: number }).__officeDbOpens++;
      return original(...args);
    }) as typeof indexedDB.open;
  });
  for (const product of ['note', 'word', 'slides', 'site']) {
    await page.goto(`/products/${product}/?workspace=other#${product}=secret`);
    const heading = page.getByRole('heading', { name: '문서 접근 확인이 필요합니다' });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    expect(await page.evaluate(() => (window as typeof window & { __officeDbOpens: number }).__officeDbOpens)).toBe(0);
  }
});

test('a direct Note URL enters the auth gate and verifies the protected document head', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  await page.goto(`/products/note/?tenant=${id}&workspace=${workspaceId}&document=${documentId}&product=note`);
  await expect(page.getByRole('heading', { name: 'Wonffice에 들어가기' })).toBeVisible();
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await expect(page.locator('[data-server-note-workspace] [data-note-editor]')).toContainText('Mock body');
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${documentId}\\?tenant=${id}(?:&|$)`) );
});

test('a saved local recovery draft remains available after leaving and reopening the server Note', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
  const paragraph = page.locator('[data-server-note-workspace] .on-doc > p').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' tab-one-recovery');
  await expect(paragraph).toContainText('tab-one-recovery');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage)
    .filter(key => key.startsWith('wonffice.note.pending.v1:')).length)).toBe(1);

  await page.getByRole('button', { name: '자료함으로 돌아가기' }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Company · 사용자' })).toBeVisible();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
  const recovery = page.getByRole('button', { name: /초안 복구 Alpha Note/ });
  await expect(recovery).toHaveCount(1);
  await recovery.click();
  await expect(page.locator('[data-server-note-workspace] .on-doc > p').first()).toContainText('tab-one-recovery');
});

test('two tabs keep separate recovery records and require a deliberate draft choice', async ({ page, context }) => {
  await mockLogin(page, { documentCount: 1 });
  const second = await context.newPage();
  await mockLogin(second, { documentCount: 1 });
  const open = async (target: Page) => {
    await target.goto('/');
    await target.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
    await target.getByRole('button', { name: /Alpha Company/ }).click();
    await target.getByRole('button', { name: 'Alpha Workspace' }).click();
    await target.getByRole('button', { name: 'Alpha Note' }).click();
  };
  const edit = async (target: Page, text: string) => {
    const paragraph = target.locator('[data-server-note-workspace] .on-doc > p').first();
    await paragraph.click();
    await target.keyboard.press('End');
    await target.keyboard.insertText(text);
    await expect(paragraph).toContainText(text);
  };
  await open(page);
  await open(second);
  await edit(page, ' first-tab');
  await edit(second, ' second-tab');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage)
    .filter(key => key.startsWith('wonffice.note.pending.v1:')).length)).toBe(2);
  const records = await page.evaluate(() => Object.keys(localStorage)
    .filter(key => key.startsWith('wonffice.note.pending.v1:'))
    .map(key => JSON.parse(localStorage.getItem(key)!) as { draftId: string; snapshotText: string }));
  expect(new Set(records.map(record => record.draftId)).size).toBe(2);

  await page.reload();
  const choices = page.getByRole('button', { name: /초안 복구 Alpha Note/ });
  await expect(choices).toHaveCount(2);
  const selected = records[0]!;
  await page.getByRole('button', { name: new RegExp(`초안 복구 Alpha Note ${selected.draftId.slice(0, 8)}`) }).click();
  const selectedText = JSON.parse(selected.snapshotText).document.content[0].content[0].text as string;
  await expect(page.locator('[data-server-note-workspace] .on-doc > p').first()).toContainText(selectedText);
  await second.close();
});

test('recovery checks current document access before exposing a saved local draft', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
  const paragraph = page.locator('[data-server-note-workspace] .on-doc > p').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' protected-recovery-body');
  await page.reload();
  await expect(page.getByRole('button', { name: /초안 복구 Alpha Note/ })).toHaveCount(1);
  await page.unroute(`**/api/v1/tenants/${id}/documents/${documentId}`);
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}`, route => route.fulfill({
    status: 403, contentType: 'application/json', body: '{"status":"forbidden"}'
  }));
  await page.getByRole('button', { name: /초안 복구 Alpha Note/ }).click();
  await expect(page.getByText('현재 계정의 초안 접근 권한을 확인하지 못했습니다. 복구 레코드는 그대로 보존합니다.')).toBeVisible();
  await expect(page.locator('[data-server-note-workspace] [data-note-editor]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /초안 복구/ })).toHaveCount(0);
  const retained = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:'))
    .map(key => localStorage.getItem(key)));
  expect(retained).toHaveLength(1);
  expect(retained[0]).toContain('protected-recovery-body');
});

test('a storage quota failure blocks navigation and names the current unprotected input', async ({ page }) => {
  await page.addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('wonffice.note.pending.v1:') && (window as typeof window & { __noteQuota?: boolean }).__noteQuota) throw new DOMException('quota', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  await mockLogin(page, { documentCount: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
  const paragraph = page.locator('[data-server-note-workspace] .on-doc > p').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' older-durable-input');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:')).length)).toBe(1);
  await page.evaluate(() => { (window as typeof window & { __noteQuota?: boolean }).__noteQuota = true; });
  await page.keyboard.insertText(' current-input-is-unprotected');
  await expect(page.getByText(/입력은 이 화면에만 있으므로 화면을 나갈 수 없습니다/)).toBeVisible();
  await page.getByRole('button', { name: '자료함으로 돌아가기' }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Note' })).toBeVisible();
  await expect(paragraph).toContainText('current-input-is-unprotected');
  await expect(page.getByRole('alert').filter({ hasText: '복구 가능한 저장소에 보관하지 못했습니다' })).toBeVisible();
});

test('a lost save response survives repeated reloads and retries the exact original request', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  const requests: Array<{ expectedRevision: number; snapshotText: string; idempotencyKey: string }> = [];
  await page.route(`**/api/v1/tenants/${id}/receipts/update/*`, route => route.fulfill({
    status: 404, contentType: 'application/json', body: '{"status":"receipt_not_found"}'
  }));
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}/snapshot`, async route => {
    const body = route.request().postDataJSON() as typeof requests[number];
    requests.push(body);
    if (requests.length === 1) return route.abort('failed');
    const head = { ...documentHead, revision: 2, snapshotHash: createHash('sha256').update(body.snapshotText).digest('hex') };
    await page.unroute(`**/api/v1/tenants/${id}/documents/${documentId}`);
    await page.route(`**/api/v1/tenants/${id}/documents/${documentId}`, read => read.fulfill({
      contentType: 'application/json', body: JSON.stringify({ document: head, snapshotText: body.snapshotText })
    }));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      operation: 'update', idempotencyKey: body.idempotencyKey,
      requestHash: createHash('sha256').update(JSON.stringify(['update', documentId, body.expectedRevision, body.snapshotText])).digest('hex'),
      document: head, snapshotText: body.snapshotText
    }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
  const paragraph = page.locator('[data-server-note-workspace] .on-doc > p').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' receipt-recovery');
  await page.locator('[data-server-note-workspace]').getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '저장 확인·재시도' })).toBeEnabled();
  for (let reload = 0; reload < 2; reload++) {
    await page.reload();
    const native = page.locator('[data-server-note-workspace]');
    await expect(paragraph).toHaveText('Mock body');
    await native.getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: '문서 작업', exact: true }).click();
    await expect(native.getByRole('complementary', { name: '문서 작업', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /초안 복구 Alpha Note/ })).toHaveCount(1);
    await page.getByRole('button', { name: /초안 복구 Alpha Note/ }).click();
    await expect(paragraph).toContainText('receipt-recovery');
  }
  await page.getByRole('button', { name: '저장 확인·재시도' }).click();
  await expect(page.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  const records = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:'))
    .map(key => JSON.parse(localStorage.getItem(key)!) as { status: string }));
  expect(records).toHaveLength(1);
  expect(records[0]?.status).toBe('confirmed');
});

test('a mismatched protected Note head never mounts a body', async ({ page }) => {
  await mockLogin(page, { documentCount: 1, openWorkspace: '00000000-0000-4000-8000-000000000009' });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
  await expect(page.locator('[data-server-note-workspace] [data-note-editor]')).toHaveCount(0);
});

test('viewer can open a Note but cannot start a new one', async ({ page }) => {
  await mockLogin(page, { role: 'viewer', documentCount: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '새 Note 만들기' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
  await expect(page.locator('[data-server-note-workspace] [data-note-editor]')).toContainText('Mock body');
  await expect(page.locator('[data-server-note-workspace]').getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
});

test('temporary access failure hides a mounted Note and retry restores it without a remount', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
  await expect(page.locator('[data-server-note-workspace] [data-note-editor]')).toContainText('Mock body');
  await page.evaluate(() => {
    const marker = document.createElement('input');
    marker.setAttribute('aria-label', 'pending edit marker');
    marker.value = 'unsaved text';
    document.querySelector('.office-auth-note-host')?.append(marker);
  });
  await page.unroute(`**/api/v1/tenants/${id}/access`);
  await page.route(`**/api/v1/tenants/${id}/access`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":"service_unavailable"}' }));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText('편집 중인 내용은 이 화면에 보존했습니다.')).toBeVisible();
  await expect(page.locator('#office-auth-curtain')).toBeVisible();
  await page.unroute(`**/api/v1/tenants/${id}/access`);
  await page.route(`**/api/v1/tenants/${id}/access`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tenantId: id, role: 'editor' }) }));
  await page.locator('#office-auth-curtain').getByRole('button', { name: '권한 다시 확인' }).click();
  await expect(page.getByLabel('pending edit marker')).toBeVisible();
  await expect(page.getByLabel('pending edit marker')).toHaveValue('unsaved text');
});

test('a new Note keeps its unsaved view through a successful access recheck', async ({ page }) => {
  await mockLogin(page);
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '새 Note 만들기' }).click();
  await expect(page.locator('[data-server-note-workspace]')).toBeVisible();
  await page.evaluate(() => {
    const marker = document.createElement('input');
    marker.setAttribute('aria-label', 'new note edit marker');
    marker.value = 'pending new note';
    document.querySelector('.office-auth-note-host')?.append(marker);
  });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByLabel('new note edit marker')).toHaveValue('pending new note');
  await expect(page.locator('[data-server-note-workspace]')).toBeVisible();
});

test('revoked Note access hides an actual unsaved edit and restores it only for the same authorized account', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
  const paragraph = page.locator('[data-server-note-workspace] .on-doc > p').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' private draft');
  await expect(paragraph).toContainText('private draft');
  await expect(page.locator('[data-server-note-workspace]').getByRole('button', { name: '저장', exact: true })).toBeEnabled();
  let writes = 0;
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}/snapshot`, route => {
    writes++;
    return route.fulfill({ status: 403, contentType: 'application/json', body: '{"status":"forbidden"}' });
  });
  await page.unroute(`**/api/v1/tenants/${id}/access`);
  await page.route(`**/api/v1/tenants/${id}/access`, route => route.fulfill({ status: 403, contentType: 'application/json', body: '{"status":"forbidden"}' }));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
  await expect(page.locator('[data-server-note-workspace]')).toBeHidden();
  await expect(page.getByText('private draft')).toBeHidden();
  await expect(page.locator('[data-server-note-workspace]').getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
  expect(writes).toBe(0);
  await page.getByRole('button', { name: '진입 선택' }).click();
  await expect(page.getByRole('heading', { name: 'Wonffice에 들어가기' })).toBeVisible();
  await page.unroute(`**/api/v1/tenants/${id}/access`);
  await page.route(`**/api/v1/tenants/${id}/access`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tenantId: id, role: 'editor' }) }));
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  const reopened = page.locator('[data-server-note-workspace]');
  await reopened.getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: '문서 작업', exact: true }).click();
  await reopened.getByRole('button', { name: /초안 복구 Alpha Note/ }).click();
  await expect(page.locator('[data-server-note-workspace]')).toBeVisible();
  await expect(paragraph).toContainText('private draft');
  expect(writes).toBe(0);
});

test('a different account cannot recover another account’s mounted Note draft', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
  const paragraph = page.locator('[data-server-note-workspace] .on-doc > p').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' account-one-draft');
  await expect(paragraph).toContainText('account-one-draft');
  await page.unroute('**/api/v1/me');
  await page.route('**/api/v1/me', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ issuer, subject: 'different-user', tenants: [{ tenantId: id, name: 'Alpha Company', role: 'editor' }], nextCursor: null }) }));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
  await expect(page.locator('[data-server-note-workspace]')).toHaveCount(0);
  await expect(page.getByText('account-one-draft')).toHaveCount(0);
});

test('Note navigation keeps the current unsaved document through a verified access recheck', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  const nextId = '00000000-0000-4000-8000-000000000009';
  const nextPageId = '00000000-0000-4000-8000-000000000010';
  const nextSnapshot = JSON.stringify({ format: 'barocss-note', version: 1,
    document: { stype: 'note', attributes: { title: 'Second Note', pageId: nextPageId },
      content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Second body' }] }] } });
  const nextHead = { ...documentHead, documentId: nextId, pageId: nextPageId, title: 'Second Note',
    documentKey: `wonffice-${id}-${nextId}`, snapshotHash: createHash('sha256').update(nextSnapshot).digest('hex') };
  const navigationWrites: Array<{ documentId: string; snapshotText: string }> = [];
  const originals = new Map([
    [documentId, { head: { ...documentHead }, text: snapshotText }],
    [nextId, { head: { ...nextHead }, text: nextSnapshot }]
  ]);
  await page.unroute(`**/api/v1/tenants/${id}/documents?**`);
  await page.route(`**/api/v1/tenants/${id}/documents?**`, route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ documents: [...originals.values()].map(value => value.head), nextCursor: null }) }));
  for (const [originalId, original] of originals) {
    await page.route(`**/api/v1/tenants/${id}/documents/${originalId}`, route => route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ document: original.head, snapshotText: original.text }) }));
    await page.route(`**/api/v1/tenants/${id}/documents/${originalId}/snapshot`, route => {
      const body = route.request().postDataJSON();
      expect(body.expectedRevision).toBe(original.head.revision);
      expect(JSON.parse(body.snapshotText).document.attributes.pageId).toBe(original.head.pageId);
      expect(body.idempotencyKey).toEqual(expect.any(String));
      navigationWrites.push({ documentId: originalId, snapshotText: body.snapshotText });
      original.text = body.snapshotText;
      original.head = { ...original.head, revision: original.head.revision + 1,
        snapshotHash: createHash('sha256').update(original.text).digest('hex') };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ operation: 'update', idempotencyKey: body.idempotencyKey,
        requestHash: createHash('sha256').update(JSON.stringify(['update', originalId, body.expectedRevision, body.snapshotText])).digest('hex'),
        document: original.head, snapshotText: original.text }) });
    });
  }
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
  await expect(page.locator('[data-server-note-workspace] .on-doc > p').first()).toContainText('Mock body');
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${documentId}\\?tenant=${id}(?:&|$)`));
  await expect(page.locator('.ow-file-navigation')).toBeVisible();
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  await page.locator('.ow-file-navigation').getByRole('button', { name: 'Second Note 열기', exact: true }).click();
  const paragraph = page.locator('[data-server-note-workspace] .on-doc > p').first();
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${nextId}\\?tenant=${id}(?:&|$)`));
  await expect(paragraph).toContainText('Second body');
  expect(navigationWrites).toHaveLength(1);
  expect(navigationWrites[0]!.documentId).toBe(documentId);
  expect(JSON.parse(navigationWrites[0]!.snapshotText).document).toMatchObject(JSON.parse(snapshotText).document);
  expect(originals.get(documentId)!.head.revision).toBe(documentHead.revision + 1);
  expect(originals.get(documentId)!.text).toBe(navigationWrites[0]!.snapshotText);
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' navigation draft');
  await expect(paragraph).toContainText('navigation draft');
  const recheckedDocuments: string[] = [];
  page.on('request', request => {
    if (request.method() === 'GET' && request.url().includes(`/api/v1/tenants/${id}/documents/`)) {
      recheckedDocuments.push(request.url());
    }
  });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#office-auth-curtain')).toBeVisible();
  await expect(page.locator('#office-auth-curtain')).toBeHidden();
  expect(recheckedDocuments.some(url => url.endsWith(`/documents/${nextId}`))).toBe(true);
  expect(recheckedDocuments.some(url => url.endsWith(`/documents/${documentId}`))).toBe(false);
  await expect(page.locator('[data-server-note-workspace]')).toBeVisible();
  await expect(paragraph).toContainText('navigation draft');
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${nextId}\\?tenant=${id}(?:&|$)`) );
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' still editable');
  await expect(paragraph).toContainText('navigation draft still editable');
  expect(navigationWrites).toHaveLength(1);
});

test('a stale Note save requires copying the typed draft before opening the server revision', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockLogin(page, { documentCount: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
  const paragraph = page.locator('[data-server-note-workspace] .on-doc > p').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' local conflict draft');
  await expect(paragraph).toContainText('local conflict draft');
  let puts = 0;
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}/snapshot`, route => {
    puts++;
    return route.fulfill({ status: 409, contentType: 'application/json', body: '{"status":"conflict"}' });
  });
  const note = page.locator('[data-server-note-workspace]');
  await note.getByRole('button', { name: '저장', exact: true }).click();
  await expect(note.getByText('서버의 최신본이 변경되었습니다.')).toBeVisible();
  expect(puts).toBe(1);
  await expect(paragraph).toContainText('local conflict draft');
  await expect(note.getByRole('button', { name: '저장', exact: true })).toBeDisabled();
  await expect(note.getByRole('button', { name: '서버 최신본 열기' })).toBeDisabled();
  await note.getByRole('button', { name: '초안 복사' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('local conflict draft');
  expect(JSON.parse(copied).format).toBe('barocss-note');
  const latestSnapshot = JSON.stringify({ format: 'barocss-note', version: 1,
    document: { stype: 'note', attributes: { title: 'Alpha Note', pageId },
      content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Server latest' }] }] } });
  await page.unroute(`**/api/v1/tenants/${id}/documents/${documentId}`);
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}`, route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ document: { ...documentHead, revision: 2, snapshotHash: createHash('sha256').update(latestSnapshot).digest('hex') }, snapshotText: latestSnapshot }) }));
  page.once('dialog', dialog => void dialog.accept());
  await note.getByRole('button', { name: '서버 최신본 열기' }).click();
  await expect(page.locator('[data-server-note-workspace] .on-doc > p').first()).toContainText('Server latest');
  expect(puts).toBe(1);
});

test('an authorized collaborative Note is not reported as a tenant denial or opened from a stale snapshot', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  await page.unroute(`**/api/v1/tenants/${id}/documents/${documentId}`);
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}`, route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ document: { ...documentHead, mode: 'collaborative' } }),
  }));
  let snapshotWrites = 0;
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}/snapshot`, route => {
    snapshotWrites++;
    return route.fulfill({ status: 409, contentType: 'application/json', body: '{"status":"collaborative_mode"}' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
  await expect(page.getByRole('heading', { name: '공동 편집을 열 수 없습니다' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('공동 편집 연결이 준비되지 않았습니다');
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toHaveCount(0);
  await expect(page.locator('[data-server-note-workspace]')).toHaveCount(0);
  expect(snapshotWrites).toBe(0);
});

test('an initializing Note is not presented as a missing tenant grant', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  await page.unroute(`**/api/v1/tenants/${id}/documents/${documentId}`);
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}`, route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ document: { ...documentHead, mode: 'initializing' } }),
  }));
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
  await expect(page.getByRole('heading', { name: '공동 편집을 열 수 없습니다' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('공동 편집 문서를 준비하는 중입니다');
  await expect(page.locator('[data-server-note-workspace]')).toHaveCount(0);
});

test('operator-only identity reaches operator entry after current server grant', async ({ page }) => {
  await mockLogin(page, { tenants: 0, operatorStatus: 200 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Wonffice 전체 서비스 운영자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: 'Wonffice 전체 서비스 운영자' })).toBeVisible();
  await expect(page).toHaveURL('/operator');
  await expect(page.getByText('접근할 수 있는 회사가 없습니다')).toHaveCount(0);
  await expect(page.getByText('이 권한으로 회사 문서를 열 수 없습니다.')).toBeVisible();
});

test('operator intent never grants a non-operator account access', async ({ page }) => {
  await mockLogin(page, { tenants: 0, operatorStatus: 403 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Wonffice 전체 서비스 운영자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '서비스 운영 권한이 없습니다' })).toBeVisible();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Wonffice 전체 서비스 운영자' })).toHaveCount(0);
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '접근할 수 있는 회사가 없습니다' })).toBeVisible();
});

test('operator route missing or unavailable fails closed instead of opening a workspace', async ({ page }) => {
  await mockLogin(page, { tenants: 0, operatorStatus: 404 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Wonffice 전체 서비스 운영자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '접근 권한을 확인하지 못했습니다' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wonffice 전체 서비스 운영자' })).toHaveCount(0);
});

test('operator grant is checked again after reload and prior content stays hidden', async ({ page }) => {
  await mockLogin(page, { tenants: 0, operatorStatus: 200 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Wonffice 전체 서비스 운영자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: 'Wonffice 전체 서비스 운영자' })).toBeVisible();
  await page.unroute('**/api/v1/operator/access');
  await page.route('**/api/v1/operator/access', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{"status":"forbidden"}' }));
  await page.reload();
  await expect(page.getByRole('heading', { name: '서비스 운영 권한이 없습니다' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wonffice 전체 서비스 운영자' })).toHaveCount(0);
  await expect(page).toHaveURL('/');
});

test('operator account switch cannot retain the previous grant', async ({ page }) => {
  await mockLogin(page, { tenants: 0, operatorStatus: 200 });
  let account = 0;
  await page.unroute(`${issuer}/protocol/openid-connect/token`);
  await page.route(`${issuer}/protocol/openid-connect/token`, route => route.fulfill({
    contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ access_token: `account-${++account}`, token_type: 'Bearer', expires_in: 300 }),
  }));
  await page.unroute('**/api/v1/operator/access');
  await page.route('**/api/v1/operator/access', route => route.fulfill({
    status: route.request().headers().authorization === 'Bearer account-1' ? 200 : 403,
    contentType: 'application/json', body: route.request().headers().authorization === 'Bearer account-1' ? '{"operator":true}' : '{"status":"forbidden"}',
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Wonffice 전체 서비스 운영자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: 'Wonffice 전체 서비스 운영자' })).toBeVisible();
  await page.getByRole('button', { name: '계정 전환' }).click();
  await expect(page.getByRole('heading', { name: 'Wonffice에 들어가기' })).toBeVisible();
  await page.getByRole('button', { name: 'Wonffice 전체 서비스 운영자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '서비스 운영 권한이 없습니다' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wonffice 전체 서비스 운영자' })).toHaveCount(0);
});

test('operator authentication and server failures have separate outcomes', async ({ page }) => {
  await mockLogin(page, { tenants: 0, operatorStatus: 401 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Wonffice 전체 서비스 운영자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '로그인이 필요합니다' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wonffice 전체 서비스 운영자' })).toHaveCount(0);

  await page.unroute('**/api/v1/operator/access');
  await page.route('**/api/v1/operator/access', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":"service_unavailable"}' }));
  await page.getByRole('button', { name: '다시 로그인' }).click();
  await expect(page.getByRole('heading', { name: '접근 권한을 확인하지 못했습니다' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 확인' })).toBeVisible();
});

test('direct operator URL is intent only and cannot skip login', async ({ page }) => {
  await page.goto('/operator');
  await expect(page.getByRole('heading', { name: 'Wonffice에 들어가기' })).toBeVisible();
  await expect(page.getByText('서비스 운영 권한을 확인하려면 로그인해 주세요.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wonffice 전체 서비스 운영자' })).toHaveCount(0);
});

async function localNoteRows(page: Page) {
  return page.evaluate(() => new Promise<unknown[]>((resolve, reject) => {
    const request = indexedDB.open('barocss-note', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('documents'), rows = transaction.objectStore('documents').getAll();
      transaction.oncomplete = () => { db.close(); resolve(rows.result); };
      transaction.onabort = () => reject(transaction.error);
    };
  }));
}

for (const loss of ['none', 'before-commit', 'after-commit'] as const) {
  test(`local Note C-copy preserves structured source and exact retry (${loss})`, async ({ page }) => {
    await mockLogin(page, { documentCount: 1 });
    await page.goto('/');
    const sourceId = '00000000-0000-4000-8000-000000000071';
    const copyId = '00000000-0000-4000-8000-000000000072';
    const copyPage = '00000000-0000-4000-8000-000000000073';
    const original = { stype: 'note', attributes: { title: 'Local structured Note', pageId: sourceId }, content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Structured local body', marks: [{ stype: 'bold', range: [0, 10] }] },
        { stype: 'pageReference', attributes: { pageId: sourceId, title: 'Self' } },
        { stype: 'pageReference', attributes: { pageId, title: 'External' } }] },
      { stype: 'codeBlock', attributes: { language: 'javascript' }, content: [{ stype: 'inline-text', text: 'const preserved = true;' }] },
      { stype: 'bTable', content: [{ stype: 'bTableBody', content: [{ stype: 'bTableRow', content: [
        { stype: 'bTableCell', content: [{ stype: 'inline-text', text: 'Local cell' }] }
      ] }] }] }
    ] };
    const sourceText = JSON.stringify({ format: 'barocss-note', version: 1, savedAt: '2026-10-01T00:00:00Z', document: original });
    await page.evaluate(({ sourceId, sourceText }) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('barocss-note', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'name' });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, transaction = db.transaction('documents', 'readwrite');
        transaction.objectStore('documents').put({ name: sourceId, title: 'Local structured Note', text: sourceText,
          savedAt: 100, revision: 7, metadata: { favorite: true, parentId: 'retained-local-parent' } });
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onabort = () => reject(transaction.error);
      };
    }), { sourceId, sourceText });
    const originalRows = await localNoteRows(page);
    const expected = structuredClone(original);
    expected.attributes.pageId = copyPage;
    const self = expected.content[0]!.content![1] as { attributes: { pageId: string } };
    self.attributes.pageId = copyPage;
    const copiedText = JSON.stringify({ format: 'barocss-note', version: 1, savedAt: '2026-10-01T00:00:00Z', document: expected }, null, 2) + '\n';
    const head = { ...documentHead, documentId: copyId, pageId: copyPage, title: original.attributes.title,
      documentKey: `wonffice-${id}-${copyId}`, snapshotHash: createHash('sha256').update(copiedText).digest('hex') };
    const requests: Record<string, unknown>[] = [];
    let receipt: Record<string, unknown> | undefined;
    await page.route(`**/api/v1/tenants/${id}/documents/${copyId}`, route => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ document: head, snapshotText: copiedText })
    }));
    await page.route(`**/api/v1/tenants/${id}/receipts/create/*`, route => route.fulfill({
      status: receipt ? 200 : 404, contentType: 'application/json', body: JSON.stringify(receipt ?? { status: 'receipt_not_found' })
    }));
    await page.route(`**/api/v1/tenants/${id}/documents`, route => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      requests.push(body);
      if (!(loss === 'before-commit' && requests.length === 1)) {
        receipt = { operation: 'create', idempotencyKey: body.idempotencyKey,
          requestHash: createHash('sha256').update(JSON.stringify(['create', workspaceId, 'note', original.attributes.title,
            'barocss-note', 1, 'new-page-copy', sourceText])).digest('hex'), document: head, snapshotText: copiedText };
      }
      if (loss !== 'none' && requests.length === 1) return route.abort('failed');
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(receipt) });
    });
    await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
    await page.getByRole('button', { name: /Alpha Company/ }).click();
    await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
    await expect(page.getByRole('button', { name: '서버 사본 준비 Local structured Note' })).toHaveCount(0);
    await page.getByRole('button', { name: '로컬 노트 사본 가져오기', exact: true }).click();
    await page.getByRole('button', { name: '이 기기의 로컬 노트 목록 확인' }).click();
    await page.getByRole('button', { name: '서버 사본 준비 Local structured Note' }).click();
    await expect(page.getByText('로컬 노트 사본 확인 필요', { exact: true })).toBeVisible();
    expect(requests).toHaveLength(0);
    await page.getByRole('button', { name: '저장 확인·재시도' }).click();
    if (loss !== 'none') {
      await expect(page.getByText('서버 사본 확인됨', { exact: true })).toHaveCount(0);
      for (let reload = 0; reload < 2; reload++) {
        await page.reload();
        await expect(page.getByRole('button', { name: /초안 복구 Local structured Note/ })).toHaveCount(1);
        await page.getByRole('button', { name: /초안 복구 Local structured Note/ }).click();
      }
      await page.getByRole('button', { name: '저장 확인·재시도' }).click();
    }
    await expect(page.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    await expect(page.locator('[data-server-note-workspace] .on-doc')).toContainText('const preserved = true;');
    await expect(page.locator('[data-server-note-workspace] .on-doc')).toContainText('Local cell');
    expect(requests).toHaveLength(loss === 'before-commit' ? 2 : 1);
    expect(requests[0]).toMatchObject({ workspaceId, title: original.attributes.title, snapshotText: sourceText, importMode: 'new-page-copy' });
    if (requests.length === 2) expect(requests[1]).toEqual(requests[0]);
    expect(await localNoteRows(page)).toEqual(originalRows);
    const records = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:'))
      .map(key => JSON.parse(localStorage.getItem(key)!)));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: 'confirmed', snapshotText: sourceText,
      source: { kind: 'indexeddb-note', name: sourceId }, confirmedCopy: { documentId: copyId, pageId: copyPage, revision: 1 } });
    await expect(page.locator('[data-confirmed-local-copy]')).toContainText(copyId);
    await page.reload();
    await expect(page.locator('[data-confirmed-local-copy]')).toContainText(copyId);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`authenticated Note keeps product styles separate from shell actions in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await mockLogin(page, { documentCount: 1 });
    await page.goto('/');
    const entry = page.getByRole('button', { name: '일반 사용자로 들어가기' });
    await expect(entry).toBeVisible();
    expect((await entry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await entry.click();
    await page.getByRole('button', { name: /Alpha Company/ }).click();
    await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha Workspace · Note 자료', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Alpha Note', exact: true }).click();
    const workspace = page.locator('[data-server-note-workspace]');
    const paragraph = workspace.locator('.on-doc > p').first();
    await expect(paragraph).toHaveText('Mock body');
    const before = await workspace.locator('.on-doc').evaluate(element => ({
      text: element.textContent,
      ids: [...element.querySelectorAll('[data-bc-sid]')].map(node => node.getAttribute('data-bc-sid')),
    }));
    const layout = await workspace.evaluate(element => {
      const main = element.querySelector('.nw-main')!;
      return { shell: getComputedStyle(element).display, document: main.getBoundingClientRect().width,
        background: getComputedStyle(main).backgroundColor, ink: getComputedStyle(main).color };
    });
    expect(layout.shell).toBe('flex');
    expect(layout.document).toBeGreaterThan(680);
    expect(layout.background).toBe(theme === 'dark' ? 'rgb(32, 37, 45)' : 'rgb(255, 255, 255)');
    expect(layout.ink).toBe(theme === 'dark' ? 'rgb(238, 241, 245)' : 'rgb(32, 37, 45)');
    const header = workspace.locator('.office-document-bar');
    const headerBox = (await header.boundingBox())!;
    expect(headerBox.y).toBe(0);
    expect(headerBox.height).toBeLessThanOrEqual(56);
    await expect(page.locator('.office-auth-brand')).toHaveCount(0);
    const side = (await workspace.locator('[data-workspace-panel="navigation"]').boundingBox())!;
    const main = (await workspace.locator('.nw-main').boundingBox())!;
    expect(side.y).toBe(headerBox.height);
    expect(main.y).toBe(headerBox.height);
    expect(side.x + side.width).toBeLessThanOrEqual(main.x + 0.5);
    expect(main.y + main.height).toBeLessThanOrEqual(900);
    const back = header.getByRole('button', { name: '자료함으로 돌아가기' });
    expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(32);
    await paragraph.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+ArrowRight' : 'Shift+End');
    await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('Mock body');
    const tools = page.locator('[data-note-formatting]');
    await expect(tools).toBeVisible();
    const surface = tools;
    const bounds = (await surface.boundingBox())!;
    expect(bounds.width).toBeLessThanOrEqual(480);
    expect(bounds.height).toBeLessThanOrEqual(48);
    const contrasts = await surface.evaluate(element => {
      const rgb = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const luminance = (color: string) => rgb(color).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
      const background = luminance(getComputedStyle(element).backgroundColor);
      return [...element.querySelectorAll('button')].map(button => {
        const foreground = luminance(getComputedStyle(button).color);
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      });
    });
    expect(contrasts).toHaveLength(6);
    for (const contrast of contrasts) expect(contrast).toBeGreaterThanOrEqual(4.5);
    for (const button of await tools.getByRole('button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(32);
      expect(box.height).toBeGreaterThanOrEqual(32);
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 0.5);
    }
    await tools.getByRole('button', { name: '추가 서식', exact: true }).click();
    await expect(page.getByRole('menu', { name: '추가 서식', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tools.getByRole('button', { name: '추가 서식', exact: true })).toBeFocused();
    expect(await workspace.locator('.on-doc').evaluate(element => ({
      text: element.textContent,
      ids: [...element.querySelectorAll('[data-bc-sid]')].map(node => node.getAttribute('data-bc-sid')),
    }))).toEqual(before);
    await expect(workspace.getByRole('button', { name: /초안 복구/ })).toHaveCount(0);
    await expect(page.locator('[data-save-status]')).not.toHaveText('저장 실패');
    await back.click();
    await expect(page.getByRole('heading', { name: 'Alpha Company · 사용자' })).toBeVisible();
    await expect(workspace).toHaveCount(0);
  });
}


test('authenticated Note tree saves pending native input before switching originals', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  const otherId = '00000000-0000-4000-8000-000000000006', otherPage = '00000000-0000-4000-8000-000000000007';
  const otherText = JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: 'Second Note', pageId: otherPage },
    content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Second native body' }] }] } });
  let text = snapshotText, revision = 1;
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  const head = () => ({ ...documentHead, revision, snapshotHash: digest(text) });
  const other = { ...documentHead, documentId: otherId, pageId: otherPage, title: 'Second Note', documentKey: `wonffice-${id}-${otherId}`, snapshotHash: digest(otherText) };
  const json = (value: unknown) => ({ contentType: 'application/json', body: JSON.stringify(value) });
  const writes: Record<string, unknown>[] = [];
  await page.route(`**/api/v1/tenants/${id}/projects?**`, route => route.fulfill(json({ projects: [], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${id}/documents?**`, route => route.fulfill(json({ documents: [head(), other], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}`, route => route.fulfill(json({ document: head(), snapshotText: text })));
  await page.route(`**/api/v1/tenants/${id}/documents/${otherId}`, route => route.fulfill(json({ document: other, snapshotText: otherText })));
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}/snapshot`, route => {
    const body = route.request().postDataJSON(); writes.push(body);
    text = body.snapshotText; revision++;
    return route.fulfill(json({ operation: 'update', idempotencyKey: body.idempotencyKey,
      requestHash: digest(JSON.stringify(['update', documentId, body.expectedRevision, body.snapshotText])), document: head(), snapshotText: text }));
  });
  await page.goto(`/?tenant=${id}&workspace=${workspaceId}&document=${documentId}&product=note`);
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  const native = page.locator('[data-server-note-workspace]'), paragraph = native.locator('.on-doc > p').first();
  await page.waitForURL(url => url.pathname === '/' && url.searchParams.get('document') === documentId);
  await page.waitForLoadState('networkidle');
  await expect(paragraph).toContainText('Mock body');
  await expect(native.getByRole('complementary', { name: '문서 작업' })).toBeHidden();
  await expect(native.getByRole('navigation', { name: '서버 문서 목록' })).toHaveCount(0);
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' immediate Note input');
  await expect(paragraph).toContainText('immediate Note input');
  const node = await paragraph.elementHandle();
  await page.locator('.ow-file-navigation').getByRole('button', { name: 'Alpha Note 열기' }).click();
  expect(await node!.evaluate(element => element.isConnected)).toBe(true); expect(writes).toHaveLength(0);
  await page.locator('.ow-file-navigation').getByRole('button', { name: 'Second Note 열기' }).click();
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${otherId}\\?tenant=${id}(?:&|$)`) );
  await expect(paragraph).toContainText('Second native body');
  expect(writes).toHaveLength(1); expect(text).toContain('immediate Note input');
  const installedNode = await paragraph.elementHandle();
  const beforeMenu = await paragraph.innerHTML();
  const beforeWrites = writes.length;
  await native.getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: '문서 작업', exact: true }).click();
  await expect(native.getByRole('button', { name: '새 노트', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(native.getByRole('complementary', { name: '문서 작업' })).toBeHidden();
  await expect(native.getByRole('menuitem', { name: '문서 메뉴', exact: true })).toBeFocused();
  expect(await installedNode!.evaluate(element => element.isConnected)).toBe(true);
  expect(await paragraph.innerHTML()).toBe(beforeMenu);
  expect(writes).toHaveLength(beforeWrites);
});


for (const outcome of ['recover', 'denied', 'mismatched-page'] as const) test(`compact Note entry recovery with unavailable list: ${outcome}`, async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  let exactReads = 0, writes = 0, exactStatus = 200;
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}`, route => {
    exactReads++;
    return route.fulfill({ status: exactStatus, contentType: 'application/json', body: JSON.stringify(exactStatus === 200 ? { document: documentHead, snapshotText } : { status: 'forbidden' }) });
  });
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}/snapshot`, route => {
    writes++;
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":"service_unavailable"}' });
  });
  const path = `/${workspaceId}/${documentId}?tenant=${id}`;
  await page.goto(path);
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  const native = page.locator('[data-server-note-workspace]');
  const paragraph = native.locator('.on-doc > p').first();
  await expect(paragraph).toContainText('Mock body');
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' exact recovery marker');
  const records = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:'))
    .map(key => localStorage.getItem(key)!));
  await expect.poll(records).toEqual([expect.stringContaining('exact recovery marker')]);
  if (outcome === 'mismatched-page') await page.evaluate(() => {
    for (const key of Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:'))) {
      const record = JSON.parse(localStorage.getItem(key)!);
      const file = JSON.parse(record.snapshotText);
      file.document.attributes.pageId = '00000000-0000-4000-8000-000000000006';
      record.snapshotText = JSON.stringify(file);
      localStorage.setItem(key, JSON.stringify(record));
    }
  });
  const persisted = await records();
  await page.route(`**/api/v1/tenants/${id}/documents?**`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":"service_unavailable"}' }));
  await page.reload();
  await expect(paragraph).toHaveText('Mock body');
  await expect(page).toHaveURL(new URL(path, page.url()).href);
  await native.getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: '문서 작업', exact: true }).click();
  await expect(native.getByRole('complementary', { name: '문서 작업', exact: true })).toBeVisible();
  if (outcome === 'denied') exactStatus = 403;
  const readsBeforeRecovery = exactReads;
  const recovery = native.getByRole('button', { name: /초안 복구 Alpha Note/ });
  await expect(recovery).toBeVisible(); await recovery.click();
  if (outcome === 'recover') await expect(paragraph).toContainText('exact recovery marker');
  else if (outcome === 'denied') {
    await expect(native.getByRole('alert').filter({ hasText: '현재 계정의 초안 접근 권한을 확인하지 못했습니다.' })).toContainText('복구 레코드는 그대로 보존합니다.');
    await expect(native.locator('[data-note-editor]')).toHaveCount(0);
  } else {
    await expect(native.getByRole('alert').filter({ hasText: '저장된 초안을 읽지 못했습니다.' })).toContainText('원본 레코드는 그대로 보존합니다.');
    await expect(paragraph).toHaveText('Mock body');
  }
  expect(exactReads).toBeGreaterThan(readsBeforeRecovery);
  expect(await records()).toEqual(persisted);
  expect(writes).toBe(0);
});


// Controlled OIDC/API responses exercise the shipped native editors and actual tree UI.
// This is not real OIDC/PostgreSQL acceptance evidence.
test('controlled mixed tree Note to Word holds the source original until the verified target installs', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  const wordId = '00000000-0000-4000-8000-000000000011';
  const slidesId = '00000000-0000-4000-8000-000000000012';
  const wordDocument = createSampleDocument();
  wordDocument.metadata = { originalOwner: 'synthetic-A', loadedAt: 'original-native-loadedAt' };
  const wordText = wordFileText(wordDocument, '2026-10-01T00:00:00.000Z');
  const slidesText = deckFileText(createSampleDeck(), '2026-10-01T00:00:00.000Z');
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const wordHead = { ...documentHead, documentId: wordId, product: 'word', title: 'Mixed rich Word', pageId: null,
    documentKey: `wonffice-${id}-${wordId}`, fileFormat: 'barocss-word', fileVersion: JSON.parse(wordText).version, snapshotHash: hash(wordText) };
  const slidesHead = { ...documentHead, documentId: slidesId, product: 'slides', title: 'Mixed rich Slides', pageId: null,
    documentKey: `wonffice-${id}-${slidesId}`, fileFormat: 'barocss-slides', fileVersion: JSON.parse(slidesText).version, snapshotHash: hash(slidesText) };
  let sourceHead = { ...documentHead }, sourceText = snapshotText;
  const writes: Array<{ documentId: string; snapshotText: string; expectedRevision: number; idempotencyKey: string }> = [];
  const receipts = new Map<string, unknown>();
  const json = (value: unknown) => ({ contentType: 'application/json', body: JSON.stringify(value) });
  await page.unroute(`**/api/v1/tenants/${id}/documents?**`);
  await page.route(`**/api/v1/tenants/${id}/documents?**`, route => {
    const product = new URL(route.request().url()).searchParams.get('product');
    return route.fulfill(json({ documents: [sourceHead, wordHead, slidesHead].filter(head => !product || head.product === product), nextCursor: null }));
  });
  await page.unroute(`**/api/v1/tenants/${id}/documents/${documentId}`);
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}`, route => route.fulfill(json({ document: sourceHead, snapshotText: sourceText })));
  await page.route(`**/api/v1/tenants/${id}/receipts/**`, route => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);
    return route.fulfill(receipts.has(key) ? json(receipts.get(key)) : { status: 404, ...json({ status: 'not_found' }) });
  });
  await page.route(`**/api/v1/tenants/${id}/documents/*/snapshot`, route => {
    const savedId = new URL(route.request().url()).pathname.split('/').at(-2)!;
    expect(savedId).toBe(documentId);
    const body = route.request().postDataJSON();
    expect(body.expectedRevision).toBe(sourceHead.revision);
    expect(body.idempotencyKey).toEqual(expect.any(String));
    const provided = JSON.parse(snapshotText).document;
    provided.content[0].content[0].text += ' mixed-tree-source-draft';
    expect(JSON.parse(body.snapshotText).document).toMatchObject(provided);
    writes.push({ documentId: savedId, ...body });
    sourceText = body.snapshotText;
    sourceHead = { ...sourceHead, revision: sourceHead.revision + 1, snapshotHash: hash(sourceText) };
    const receipt = { operation: 'update', idempotencyKey: body.idempotencyKey,
      requestHash: hash(JSON.stringify(['update', savedId, body.expectedRevision, body.snapshotText])), document: sourceHead, snapshotText: sourceText };
    receipts.set(body.idempotencyKey, receipt);
    return route.fulfill(json(receipt));
  });
  let targetReads = 0, release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/v1/tenants/${id}/documents/${wordId}`, async route => {
    targetReads++;
    await held;
    await route.fulfill(json({ document: wordHead, snapshotText: wordText }));
  });
  await page.route(`**/api/v1/tenants/${id}/documents/${slidesId}`, route => route.fulfill(json({ document: slidesHead, snapshotText: slidesText })));
  try {
    await page.goto(`/?tenant=${id}&workspace=${workspaceId}&document=${documentId}&product=note`);
    await page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true }).click();
    const note = page.locator('[data-server-note-workspace]'), word = page.locator('[data-server-word-workspace]');
    const paragraph = note.locator('.on-doc > p').first();
    await expect(paragraph).toContainText('Mock body');
    await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${documentId}\\?tenant=${id}(?:&|$)`));
    await expect(page.locator('.ow-file-navigation')).toBeVisible();
    await expect(page.locator('.ow-entry-status')).toHaveCount(0);
    await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' mixed-tree-source-draft');
    await expect(paragraph).toContainText('Mock body mixed-tree-source-draft');
    const sourceURL = page.url();
    const tree = page.locator('.ow-file-navigation');
    await expect(tree.getByRole('button', { name: 'Mixed rich Slides 열기', exact: true })).toBeVisible();
    await tree.getByRole('button', { name: 'Mixed rich Word 열기', exact: true }).click();
    // Baseline refusal must fail here. A denial is not an accepted transition.
    await expect.poll(() => targetReads).toBeGreaterThan(0);
    await expect(page).toHaveURL(sourceURL);
    await expect(note).toBeVisible(); await expect(paragraph).toContainText('Mock body mixed-tree-source-draft');
    await expect(word).toHaveCount(0);
    expect(writes).toHaveLength(1); expect(writes[0]!.documentId).toBe(documentId);
    expect(sourceHead.revision).toBe(documentHead.revision + 1); expect(sourceText).toBe(writes[0]!.snapshotText);
    const savedSource = sourceText;
    release();
    await expect(word.locator('.w-paragraph').first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${wordId}\\?tenant=${id}(?:&|$)`));
    await expect(note).toHaveCount(0); await expect(word.locator('.office-editor-header')).toHaveCount(1);
    await word.getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Word 파일 내보내기', exact: true }).click();
    const path = await (await downloaded).path(); expect(path).not.toBeNull();
    expect(JSON.parse(await readFile(path!, 'utf8')).document).toEqual(JSON.parse(wordText).document);
    expect(sourceText).toBe(savedSource); expect(writes).toHaveLength(1);
    expect(wordHead.revision).toBe(1); expect(wordHead.snapshotHash).toBe(hash(wordText));
  } finally { release(); }
});

type MixedProduct = 'note' | 'word' | 'slides';
async function controlledMixedWorkspace(page: Page, role: 'editor' | 'viewer', options: { project?: boolean } = {}) {
  await mockLogin(page, { role });
  const wordId = '00000000-0000-4000-8000-000000000021';
  const slidesId = '00000000-0000-4000-8000-000000000022';
  const siteId = '00000000-0000-4000-8000-000000000023';
  // Same rich Note structure as the real recovery schedule: marks, self-reference, code and table.
  const note = { stype: 'note', attributes: { title: 'Mixed rich Note', pageId }, content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Matrix structured body', marks: [{ stype: 'bold', range: [0, 6] }] },
      { stype: 'pageReference', attributes: { pageId, title: 'Self' } }] },
    { stype: 'codeBlock', attributes: { language: 'javascript' }, content: [{ stype: 'inline-text', text: 'const matrix = true;' }] },
    { stype: 'bTable', content: [{ stype: 'bTableBody', content: [{ stype: 'bTableRow', content: [
      { stype: 'bTableCell', content: [{ stype: 'inline-text', text: 'Matrix cell' }] }
    ] }] }] }
  ] };
  // Produce the server bytes through the same native Note session serializer.
  // Its full node fields must already match the viewer's read-only native body.
  const noteSession = openNoteTree(note);
  let noteText: string;
  try {
    const nativeNote = noteTreeOf({ getNode: sid => noteSession.editor.dataStore.getNode(sid) as never }, noteSession.rootId)!;
    const canonicalNote = { ...note, stype: 'note' as const, content: nativeNote.content as unknown[] };
    expect(canonicalNote).toMatchObject(note);
    noteText = serializeNoteFile(canonicalNote, { savedAt: '2026-10-01T00:00:00Z' });
  } finally { noteSession.close(); }
  const word = createSampleDocument(), slides = createSampleDeck();
  for (const native of [word, slides]) native.metadata = { originalOwner: 'synthetic-A', loadedAt: 'original-native-loadedAt' };
  const texts = {
    note: noteText,
    word: wordFileText(word, '2026-10-01T00:00:00.000Z'),
    slides: deckFileText(slides, '2026-10-01T00:00:00.000Z')
  };
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const originals = new Map((['note', 'word', 'slides'] as const).map(product => {
    const originalId = product === 'note' ? documentId : product === 'word' ? wordId : slidesId;
    return [originalId, { product, text: texts[product], head: { ...documentHead, documentId: originalId,
      product, title: `Mixed rich ${product === 'note' ? 'Note' : product === 'word' ? 'Word' : 'Slides'}`,
      pageId: product === 'note' ? pageId : null, documentKey: `wonffice-${id}-${originalId}`,
      fileFormat: `barocss-${product}`, fileVersion: JSON.parse(texts[product]).version, snapshotHash: hash(texts[product]) } }];
  }));
  // Site is only an authorized catalog head. This test supplies no native Site body or editor contract.
  const siteHead = { ...documentHead, documentId: siteId, product: 'site', title: 'Unsupported Site original', pageId: null,
    documentKey: `wonffice-${id}-${siteId}`, fileFormat: 'barocss-site', snapshotHash: hash('controlled unsupported Site head') };
  const writes: Array<{ product: MixedProduct; documentId: string; expectedRevision: number; snapshotText: string; idempotencyKey: string }> = [];
  const reads: string[] = [], servedSnapshots: Array<{ documentId: string; snapshotText: string }> = [], receipts = new Map<string, unknown>();
  const gates = new Map<string, { read: number; pending: Promise<void> }>();
  let deniedTarget = false;
  let sourceWriteGate: { write: number; pending: Promise<void> } | undefined;
  const holdSourceWrite = (nextWrite = 1) => {
    let release!: () => void;
    sourceWriteGate = { write: writes.filter(write => write.product === 'note').length + nextWrite, pending: new Promise<void>(resolve => { release = resolve; }) };
    return () => { sourceWriteGate = undefined; release(); };
  };
  const json = (value: unknown) => ({ contentType: 'application/json', body: JSON.stringify(value) });
  await page.unroute(`**/api/v1/tenants/${id}/documents?**`);
  await page.route(`**/api/v1/tenants/${id}/documents?**`, route => {
    const product = new URL(route.request().url()).searchParams.get('product');
    return route.fulfill(json({ documents: [...[...originals.values()].map(value => value.head), ...(product === null ? [siteHead] : [])]
      .filter(head => !product || head.product === product), nextCursor: null }));
  });
  await page.unroute(`**/api/v1/tenants/${id}/documents/${documentId}`);
  for (const [originalId, original] of originals) {
    await page.route(`**/api/v1/tenants/${id}/documents/${originalId}`, async route => {
      reads.push(originalId);
      const gate = gates.get(originalId);
      if (gate?.read === reads.filter(value => value === originalId).length) await gate.pending;
      if (originalId === wordId && deniedTarget) return route.fulfill({ status: 403, ...json({ status: 'forbidden' }) });
      servedSnapshots.push({ documentId: originalId, snapshotText: original.text });
      return route.fulfill(json({ document: original.head, snapshotText: original.text }));
    });
    await page.route(`**/api/v1/tenants/${id}/documents/${originalId}/snapshot`, async route => {
      const body = route.request().postDataJSON();
      expect(role).toBe('editor'); expect(body.expectedRevision).toBe(original.head.revision);
      expect(body.idempotencyKey).toEqual(expect.any(String));
      writes.push({ product: original.product, documentId: originalId, ...body });
      const gate = sourceWriteGate;
      if (original.product === 'note' && gate?.write === writes.filter(write => write.product === 'note').length) await gate.pending;
      original.text = body.snapshotText;
      original.head = { ...original.head, revision: original.head.revision + 1, snapshotHash: hash(original.text) };
      const receipt = { operation: 'update', idempotencyKey: body.idempotencyKey,
        requestHash: hash(JSON.stringify(['update', originalId, body.expectedRevision, body.snapshotText])), document: original.head, snapshotText: original.text };
      receipts.set(body.idempotencyKey, receipt);
      return route.fulfill(json(receipt));
    });
  }
  await page.route(`**/api/v1/tenants/${id}/documents/${siteId}`, route => {
    reads.push(siteId); return route.fulfill({ status: 403, ...json({ status: 'forbidden' }) });
  });
  await page.route(`**/api/v1/tenants/${id}/receipts/**`, route => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);
    return route.fulfill(receipts.has(key) ? json(receipts.get(key)) : { status: 404, ...json({ status: 'not_found' }) });
  });
  const projectId = '00000000-0000-4000-8000-000000000031', projectActor = 'synthetic-member';
  const feedbackKey = `${projectActor}:feedback:note:${documentId}`;
  let projectRevision = 1;
  const projectRecord = { id: projectId, title: 'Mixed native Project', goal: '', archived: false,
    comments: [], works: [], activities: [], drafts: { [feedbackKey]: 'Initial controlled project draft' } as Record<string, string>,
    results: [{ id: 'mixed-note-result', name: 'Mixed rich Note', document: { product: 'note', id: documentId }, inputs: [] }] };
  const projectWrites: Array<{ expectedRevision: number; idempotencyKey: string; action: { type: string; key: string; text: string } }> = [];
  if (options.project) {
    const projectValue = () => ({ tenantId: id, workspaceId, actor: { kind: 'human', id: projectActor }, project: { revision: projectRevision, record: projectRecord } });
    await page.route(`**/api/v1/tenants/${id}/projects?**`, route => route.fulfill(json({ projects: [projectValue()], nextCursor: null })));
    await page.route(`**/api/v1/tenants/${id}/projects/${projectId}`, route => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON();
        expect(body.expectedRevision).toBe(projectRevision); expect(body.idempotencyKey).toEqual(expect.any(String));
        expect(body.action.type).toBe('draft'); expect(body.action.key).toBe(`feedback:note:${documentId}`);
        projectWrites.push(body); projectRecord.drafts[feedbackKey] = body.action.text; projectRevision++;
      }
      return route.fulfill(json(projectValue()));
    });
  }
  await page.goto(`/?tenant=${id}&workspace=${workspaceId}&document=${documentId}&product=note${options.project ? `&project=${projectId}` : ''}`);
  await page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true }).click();
  const shell = (product: MixedProduct) => page.locator(`[data-server-${product}-workspace]`);
  await expect(shell('note').locator('.on-doc > p').first()).toContainText('Matrix structured body');
  await expect(page.locator('.ow-file-navigation')).toBeVisible(); await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  const hold = (originalId: string, nextRead = 1) => {
    let release!: () => void;
    const read = reads.filter(value => value === originalId).length + nextRead;
    gates.set(originalId, { read, pending: new Promise<void>(resolve => { release = resolve; }) });
    return () => { gates.delete(originalId); release(); };
  };
  return { wordId, slidesId, siteId, originals, texts, writes, reads, servedSnapshots, shell, hold, holdSourceWrite, projectRecord, projectWrites, feedbackKey, projectId, denyWord: (denied: boolean) => { deniedTarget = denied; } };
}
// Change only the declared editable text. All canonical native fields stay in
// the expected document, including marks, reference, code, table and attributes.
function expectedMixedNote(text: string, ...suffixes: string[]) {
  const expected = JSON.parse(text).document;
  expect(expected.content[0].content[0].stype).toBe('inline-text');
  expected.content[0].content[0].text += suffixes.join('');
  return expected;
}
async function expectProtectedMixedNote(page: Page, status: 'draft' | 'confirmed', expected: unknown) {
  await expect.poll(() => page.evaluate(({ status, expected }) => Object.keys(localStorage)
    .filter(key => key.startsWith('wonffice.note.pending.v1:')).some(key => {
      const record = JSON.parse(localStorage.getItem(key)!);
      return record.status === status && JSON.stringify(JSON.parse(record.snapshotText).document) === JSON.stringify(expected);
    }), { status, expected })).toBe(true);
}
// Hit the last editable glyph, before the atomic Self reference. A paragraph
// center click followed by End can instead move the caret to the later table.
async function appendMixedNoteInput(page: Page, paragraph: Locator, text: string) {
  const glyph = await paragraph.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let last: Text | undefined;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent && !node.parentElement?.closest('[contenteditable="false"]')) last = node as Text;
    }
    if (!last) throw new Error('Expected an editable native Note text leaf');
    const range = document.createRange();
    range.setStart(last, last.length - 1); range.setEnd(last, last.length);
    const rect = range.getBoundingClientRect();
    if (!rect.width || !rect.height) throw new Error('Expected a visible native Note glyph');
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, leaf: last.data };
  });
  await page.mouse.click(glyph.x, glyph.y);
  const remaining = await paragraph.evaluate((element, leaf) => {
    const selection = getSelection(), node = selection?.anchorNode;
    if (!selection?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !element.contains(node)
      || node.parentElement?.closest('[contenteditable="false"]') || node.textContent !== leaf) {
      throw new Error('The real glyph hit did not place an editable Note caret');
    }
    return leaf.length - selection.anchorOffset;
  }, glyph.leaf);
  expect(remaining).toBeGreaterThanOrEqual(0); expect(remaining).toBeLessThanOrEqual(1);
  if (remaining) await page.keyboard.press('ArrowRight');
  await expect.poll(() => paragraph.evaluate((element, leaf) => {
    const selection = getSelection(), node = selection?.anchorNode;
    return Boolean(selection?.isCollapsed && node?.nodeType === Node.TEXT_NODE && element.contains(node)
      && !node.parentElement?.closest('[contenteditable="false"]') && node.textContent === leaf && selection.anchorOffset === leaf.length);
  }, glyph.leaf)).toBe(true);
  await page.keyboard.insertText(text);
  await expect(paragraph).toContainText(text.trim());
}
async function assertMixedHeader(page: Page, product: MixedProduct) {
  const header = page.locator(`[data-server-${product}-workspace] .office-editor-header`);
  await expect(header).toHaveCount(1); const bounds = await header.boundingBox(); expect(bounds).not.toBeNull(); expect(bounds!.height).toBe(48);
  await expect(page.locator('.ow-native-slot .office-editor-header')).toHaveCount(1);
}
async function exportedMixedNative(page: Page, product: 'word' | 'slides') {
  await page.locator(`[data-server-${product}-workspace]`).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: `${product === 'word' ? 'Word' : 'Slides'} 파일 내보내기`, exact: true }).click();
  const path = await (await downloaded).path(); expect(path).not.toBeNull();
  return JSON.parse(await readFile(path!, 'utf8')).document;
}
for (const theme of ['light', 'dark'] as const) for (const role of ['editor', 'viewer'] as const) test(`controlled mixed tree ${role} ${theme} preserves rich originals through Note Word Slides Note`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: theme });
  const capture = (product: MixedProduct, checkpoint: string) => page.screenshot({ path: testInfo.outputPath(`controlled-mixed-${theme}-${role}-${product}-${checkpoint}-1440x900.png`) });
  const state = await controlledMixedWorkspace(page, role), sourceURL = page.url();
  const tree = page.locator('.ow-file-navigation');
  await expect(tree.getByRole('button', { name: 'Unsupported Site original 열기', exact: true })).toBeDisabled();
  await assertMixedHeader(page, 'note');
  const paragraph = state.shell('note').locator('.on-doc > p').first();
  if (role === 'editor') {
    await appendMixedNoteInput(page, paragraph, ' mixed-cycle-latest-input');
    await expect(paragraph).toContainText('mixed-cycle-latest-input');
  } else {
    await expect(state.shell('note').getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    await expect(state.shell('note').locator('[data-note-editor]').first()).toHaveAttribute('data-note-editable', 'false');
  }
  await capture('note', 'initial');
  const beforeTargetReads = state.reads.filter(value => value === state.wordId).length, release = state.hold(state.wordId);
  try {
    await tree.getByRole('button', { name: 'Mixed rich Word 열기', exact: true }).click();
    await expect.poll(() => state.reads.filter(value => value === state.wordId).length).toBeGreaterThan(beforeTargetReads);
    await expect(page).toHaveURL(sourceURL); await expect(state.shell('note')).toBeVisible(); await expect(state.shell('word')).toHaveCount(0);
    await expect(paragraph).toContainText(role === 'editor' ? 'mixed-cycle-latest-input' : 'Matrix structured body');
    expect(state.originals.get(state.wordId)!.text).toBe(state.texts.word);
    expect(state.writes.filter(write => write.product !== 'note')).toHaveLength(0);
    if (role === 'editor') {
      const expectedFirst = expectedMixedNote(state.texts.note, ' mixed-cycle-latest-input');
      expect(JSON.parse(state.originals.get(documentId)!.text).document).toEqual(expectedFirst);
      await expectProtectedMixedNote(page, 'confirmed', expectedFirst);
      const retained = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:')).map(key => JSON.parse(localStorage.getItem(key)!)));
      expect(retained.some(record => record.status === 'confirmed' && record.snapshotText.includes('mixed-cycle-latest-input'))).toBe(true);
      const frozenSource = state.originals.get(documentId)!.text;
      await appendMixedNoteInput(page, paragraph, ' mixed-cycle-during-target-load');
      await expect(paragraph).toContainText('mixed-cycle-during-target-load');
      await expectProtectedMixedNote(page, 'draft', expectedMixedNote(state.texts.note, ' mixed-cycle-latest-input', ' mixed-cycle-during-target-load'));
      await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:'))
        .some(key => { const record = JSON.parse(localStorage.getItem(key)!); return record.status === 'draft' && record.snapshotText.includes('mixed-cycle-during-target-load'); }))).toBe(true);
      expect(state.originals.get(documentId)!.text).toBe(frozenSource); await expect(page).toHaveURL(sourceURL);
    } else expect(state.writes).toHaveLength(0);
    release();
    await expect(state.shell('word').locator('.w-paragraph').first()).toBeVisible(); await assertMixedHeader(page, 'word');
    expect(state.writes.filter(write => write.product === 'word')).toHaveLength(0);
    expect(state.originals.get(state.wordId)!.text).toBe(state.texts.word); expect(state.originals.get(state.wordId)!.head.revision).toBe(1);
    await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${state.wordId}\\?tenant=${id}(?:&|$)`));
    expect(await exportedMixedNative(page, 'word')).toEqual(JSON.parse(state.texts.word).document);
    if (role === 'viewer') await expect(state.shell('word').getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    // A visible model node alone is insufficient for a populated desktop capture.
    await expect(state.shell('word').getByText('Contents', { exact: true }).first()).toBeInViewport();
    await capture('word', 'installed');
    await tree.getByRole('button', { name: 'Mixed rich Slides 열기', exact: true }).click();
    await expect(state.shell('slides').locator('.sl-stage')).toBeVisible(); await assertMixedHeader(page, 'slides');
    expect(state.writes.filter(write => write.product === 'slides')).toHaveLength(0);
    expect(state.originals.get(state.slidesId)!.text).toBe(state.texts.slides); expect(state.originals.get(state.slidesId)!.head.revision).toBe(1);
    await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${state.slidesId}\\?tenant=${id}(?:&|$)`));
    expect(await exportedMixedNative(page, 'slides')).toEqual(JSON.parse(state.texts.slides).document);
    if (role === 'viewer') await expect(state.shell('slides').getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    await capture('slides', 'installed');
    await tree.getByRole('button', { name: 'Mixed rich Note 열기', exact: true }).click();
    await expect(state.shell('note').locator('.on-doc > p').first()).toContainText(role === 'editor' ? 'mixed-cycle-latest-input' : 'Matrix structured body');
    if (role === 'editor') {
      await expect(state.shell('note').locator('.on-doc > p').first()).toContainText('mixed-cycle-during-target-load');
      expect(state.originals.get(documentId)!.text).toContain('mixed-cycle-during-target-load');
      expect(state.writes.filter(write => write.product === 'note')).toHaveLength(2);
    }
    await assertMixedHeader(page, 'note'); await expect(page).toHaveURL(sourceURL);
    await expect(state.shell('note').locator('.on-doc')).toContainText('const matrix = true;');
    await expect(state.shell('note').locator('.on-doc')).toContainText('Matrix cell');
    const expectedNote = expectedMixedNote(state.texts.note, ...(role === 'editor' ? [' mixed-cycle-latest-input', ' mixed-cycle-during-target-load'] : []));
    const note = JSON.parse(state.originals.get(documentId)!.text).document;
    expect(note).toEqual(expectedNote);
    const reopened = state.servedSnapshots.filter(read => read.documentId === documentId).at(-1)!;
    expect(JSON.parse(reopened.snapshotText).document).toEqual(expectedNote);
    if (role === 'editor') await expectProtectedMixedNote(page, 'confirmed', expectedNote);
    else expect(state.originals.get(documentId)!.text).toBe(state.texts.note);
    expect(note.attributes.pageId).toBe(pageId); expect(note.content[0].content.some((node: { attributes?: { pageId?: string } }) => node.attributes?.pageId === pageId)).toBe(true);
    if (role === 'viewer') expect(state.writes).toHaveLength(0);
    expect(state.reads).not.toContain(state.siteId);
    await capture('note', 'reopened');
  } finally { release(); }
});
test('controlled mixed target denial retains protected Note input and permits explicit tree retry', async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor'), sourceURL = page.url(), tree = page.locator('.ow-file-navigation');
  const paragraph = state.shell('note').locator('.on-doc > p').first();
  await appendMixedNoteInput(page, paragraph, ' retained-after-target-denial');
  await expect(paragraph).toContainText('retained-after-target-denial');
  state.denyWord(true); const release = state.hold(state.wordId);
  try {
    await tree.getByRole('button', { name: 'Mixed rich Word 열기', exact: true }).click();
    await expect.poll(() => state.reads.includes(state.wordId)).toBe(true);
    await expect(page).toHaveURL(sourceURL); await expect(state.shell('word')).toHaveCount(0);
    const expectedFirst = expectedMixedNote(state.texts.note, ' retained-after-target-denial');
    expect(JSON.parse(state.originals.get(documentId)!.text).document).toEqual(expectedFirst);
    await expectProtectedMixedNote(page, 'confirmed', expectedFirst);
    const retainedSource = state.originals.get(documentId)!.text, sourceRevision = state.originals.get(documentId)!.head.revision;
    release();
    await expect(tree.getByRole('alert')).toBeVisible(); await expect(page).toHaveURL(sourceURL);
    await expect(state.shell('note')).toBeVisible(); await expect(paragraph).toContainText('retained-after-target-denial');
    await expect(state.shell('word')).toHaveCount(0); await assertMixedHeader(page, 'note');
    expect(state.originals.get(state.wordId)!.text).toBe(state.texts.word);
    expect(state.writes.filter(write => write.product !== 'note')).toHaveLength(0);
    const records = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:')).map(key => ({ key, raw: localStorage.getItem(key)! })));
    expect(records.some(record => JSON.parse(record.raw).snapshotText === retainedSource)).toBe(true);
    await appendMixedNoteInput(page, paragraph, ' explicit-retry-latest-input');
    await expect(paragraph).toContainText('explicit-retry-latest-input');
    const expectedLatest = expectedMixedNote(state.texts.note, ' retained-after-target-denial', ' explicit-retry-latest-input');
    await expectProtectedMixedNote(page, 'draft', expectedLatest);
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:'))
      .some(key => JSON.parse(localStorage.getItem(key)!).snapshotText.includes('explicit-retry-latest-input')))).toBe(true);
    expect(state.originals.get(documentId)!.text).toBe(retainedSource);
    state.denyWord(false);
    await tree.getByRole('button', { name: 'Mixed rich Word 열기', exact: true }).click();
    await expect(state.shell('word').locator('.w-paragraph').first()).toBeVisible(); await assertMixedHeader(page, 'word');
    expect(state.writes.filter(write => write.product === 'word')).toHaveLength(0);
    expect(state.originals.get(state.wordId)!.text).toBe(state.texts.word); expect(state.originals.get(state.wordId)!.head.revision).toBe(1);
    await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${state.wordId}\\?tenant=${id}(?:&|$)`));
    expect(await exportedMixedNative(page, 'word')).toEqual(JSON.parse(state.texts.word).document);
    expect(state.originals.get(documentId)!.text).toContain('retained-after-target-denial');
    expect(state.originals.get(documentId)!.text).toContain('explicit-retry-latest-input');
    expect(JSON.parse(state.originals.get(documentId)!.text).document).toEqual(expectedLatest);
    await expectProtectedMixedNote(page, 'confirmed', expectedLatest);
    expect(state.originals.get(documentId)!.head.revision).toBe(sourceRevision + 1);
    expect(state.writes.filter(write => write.product === 'note')).toHaveLength(2);
    expect(await page.evaluate(keys => keys.map(key => ({ key, raw: localStorage.getItem(key)! })), records.map(record => record.key))).toEqual(records);
  } finally { release(); }
});

// Hold the native target's own second read, after its module/CSS has loaded.
// These cases exercise an inactive mounted target, rather than only a fetch gate.
for (const theme of ['light', 'dark'] as const) test(`controlled staged Word preserves active Note styles and lifecycle in ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: theme });
  const state = await controlledMixedWorkspace(page, 'editor'), sourceURL = page.url();
  const source = state.shell('note'), paragraph = source.locator('.on-doc > p').first();
  await appendMixedNoteInput(page, paragraph, ' staged-source-protected');
  const sourceNode = await source.locator('.on-doc').elementHandle(); expect(sourceNode).not.toBeNull();
  const describe = () => source.evaluate(element => {
    const body = element.querySelector('.on-doc')!, header = element.querySelector('.office-editor-header')!, main = element.querySelector('.nw-main')!;
    const describeElement = (one: Element) => {
      const box = one.getBoundingClientRect(), style = getComputedStyle(one);
      return { x: box.x, y: box.y, width: box.width, height: box.height, color: style.color,
        background: style.backgroundColor, font: style.font, display: style.display };
    };
    return { text: body.textContent, ids: [...body.querySelectorAll('[data-bc-sid]')].map(one => one.getAttribute('data-bc-sid')),
      body: describeElement(body), header: describeElement(header), main: describeElement(main) };
  });
  const before = await describe(), previousReads = state.reads.filter(value => value === state.wordId).length;
  const release = state.hold(state.wordId, 2);
  try {
    await page.locator('.ow-file-navigation').getByRole('button', { name: 'Mixed rich Word 열기', exact: true }).click();
    await expect.poll(() => state.reads.filter(value => value === state.wordId).length).toBe(previousReads + 2);
    const staged = page.locator('[data-native-entry="preparing"]');
    await expect(staged).toHaveCount(1); await expect(staged).toHaveAttribute('aria-hidden', 'true'); await expect(staged).toHaveAttribute('inert', '');
    await expect(page).toHaveURL(sourceURL); await expect(source).toBeVisible();
    expect(await source.locator('.on-doc').evaluate((node, original) => node === original, sourceNode!)).toBe(true);
    expect(await describe()).toEqual(before);
    const firstExpected = expectedMixedNote(state.texts.note, ' staged-source-protected');
    expect(JSON.parse(state.originals.get(documentId)!.text).document).toEqual(firstExpected);
    await expectProtectedMixedNote(page, 'confirmed', firstExpected);
    await appendMixedNoteInput(page, paragraph, ' staged-lifecycle-latest');
    const latestExpected = expectedMixedNote(state.texts.note, ' staged-source-protected', ' staged-lifecycle-latest');
    await expectProtectedMixedNote(page, 'draft', latestExpected);
    const sourceBeforeEvents = await describe();
    const allowed = await page.evaluate(() => {
      const allowed = window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
      window.dispatchEvent(new Event('beforeprint'));
      return allowed;
    });
    expect(allowed).toBe(true);
    await expect(page.locator('.w-print-pages, .sl-print-pages')).toHaveCount(0);
    expect(await describe()).toEqual(sourceBeforeEvents);
    expect(await source.locator('.on-doc').evaluate((node, original) => node === original, sourceNode!)).toBe(true);
    await expect(page).toHaveURL(sourceURL); await expectProtectedMixedNote(page, 'draft', latestExpected);
    expect(JSON.parse(state.originals.get(documentId)!.text).document).toEqual(firstExpected);
    expect(state.writes.filter(write => write.product !== 'note')).toHaveLength(0);
    await expect(page.locator('.office-editor-header:visible')).toHaveCount(1);
    expect((await source.locator('.office-editor-header').boundingBox())!.height).toBe(48);
  } finally { release(); await sourceNode!.dispose(); }
});

test('controlled staged target cancellation keeps late Word response out of the newer Slides intent', async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor'), sourceURL = page.url();
  const source = state.shell('note'), paragraph = source.locator('.on-doc > p').first(), tree = page.locator('.ow-file-navigation');
  await appendMixedNoteInput(page, paragraph, ' cancelled-target-source');
  const sourceNode = await source.locator('.on-doc').elementHandle(); expect(sourceNode).not.toBeNull();
  const wordReads = state.reads.filter(value => value === state.wordId).length;
  const releaseA = state.hold(state.wordId, 2), releaseB = state.hold(state.slidesId);
  try {
    await tree.getByRole('button', { name: 'Mixed rich Word 열기', exact: true }).click();
    await expect.poll(() => state.reads.filter(value => value === state.wordId).length).toBe(wordReads + 2);
    await expect(page.locator('[data-native-entry="preparing"]')).toHaveCount(1);
    await page.getByRole('button', { name: '취소', exact: true }).click();
    await expect(page.locator('[data-native-entry="preparing"]')).toHaveCount(0);
    await expect(page).toHaveURL(sourceURL); await expect(source).toBeVisible();
    expect(await source.locator('.on-doc').evaluate((node, original) => node === original, sourceNode!)).toBe(true);
    await appendMixedNoteInput(page, paragraph, ' newer-slides-intent-input');
    const expected = expectedMixedNote(state.texts.note, ' cancelled-target-source', ' newer-slides-intent-input');
    await expectProtectedMixedNote(page, 'draft', expected);
    await tree.getByRole('button', { name: 'Mixed rich Slides 열기', exact: true }).click();
    await expect.poll(() => state.reads.includes(state.slidesId)).toBe(true);
    await expectProtectedMixedNote(page, 'confirmed', expected);
    const servedA = state.servedSnapshots.filter(read => read.documentId === state.wordId).length;
    releaseA();
    await expect.poll(() => state.servedSnapshots.filter(read => read.documentId === state.wordId).length).toBe(servedA + 1);
    await expect(page).toHaveURL(sourceURL); await expect(source).toBeVisible();
    await expect(state.shell('word')).toHaveCount(0); await expect(state.shell('slides')).toHaveCount(0);
    expect(await source.locator('.on-doc').evaluate((node, original) => node === original, sourceNode!)).toBe(true);
    await expect(paragraph).toContainText('newer-slides-intent-input');
    expect(JSON.parse(state.originals.get(documentId)!.text).document).toEqual(expected);
    expect(state.writes.filter(write => write.product !== 'note')).toHaveLength(0);
    releaseB();
    await expect(state.shell('slides').locator('.sl-stage')).toBeVisible(); await assertMixedHeader(page, 'slides');
    await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${state.slidesId}\\?tenant=${id}(?:&|$)`));
    await expect(state.shell('word')).toHaveCount(0);
    expect(state.originals.get(state.wordId)!.text).toBe(state.texts.word);
    expect(state.originals.get(state.slidesId)!.text).toBe(state.texts.slides);
    expect(await exportedMixedNative(page, 'slides')).toEqual(JSON.parse(state.texts.slides).document);
    expect(state.writes.filter(write => write.product !== 'note')).toHaveLength(0);
    await expectProtectedMixedNote(page, 'confirmed', expected);
  } finally { releaseA(); releaseB(); await sourceNode!.dispose(); }
});

for (const invalidation of ['role-revoked', 'account-replaced'] as const) test(`controlled staged Word retires when ${invalidation}`, async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor'), sourceURL = page.url();
  const source = state.shell('note'), paragraph = source.locator('.on-doc > p').first();
  await appendMixedNoteInput(page, paragraph, ' authority-bound-source');
  const sourceNode = await source.locator('.on-doc').elementHandle(); expect(sourceNode).not.toBeNull();
  const previousReads = state.reads.filter(value => value === state.wordId).length, release = state.hold(state.wordId, 2);
  try {
    await page.locator('.ow-file-navigation').getByRole('button', { name: 'Mixed rich Word 열기', exact: true }).click();
    await expect.poll(() => state.reads.filter(value => value === state.wordId).length).toBe(previousReads + 2);
    await expect(page.locator('[data-native-entry="preparing"]')).toHaveCount(1);
    const expected = expectedMixedNote(state.texts.note, ' authority-bound-source');
    await expectProtectedMixedNote(page, 'confirmed', expected);
    const protectedRecords = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:'))
      .map(key => ({ key, raw: localStorage.getItem(key)! })));
    const writesBefore = state.writes.length;
    await page.route('**/api/v1/me', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ issuer,
      subject: invalidation === 'account-replaced' ? 'other-controlled-user' : 'synthetic-user',
      tenants: [{ tenantId: id, name: 'Alpha Company', role: invalidation === 'role-revoked' ? 'viewer' : 'editor' }], nextCursor: null }) }));
    await page.route(`**/api/v1/tenants/${id}/access`, route => route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ tenantId: id, role: invalidation === 'role-revoked' ? 'viewer' : 'editor' }) }));
    const rechecked = page.waitForResponse(response => response.url().endsWith('/api/v1/me'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await rechecked;
    await expect(page.getByRole('heading', { name: '접근 권한이 없습니다', exact: true })).toBeVisible();
    await expect(page.locator('[data-native-entry="preparing"]')).toHaveCount(0);
    await expect(source).toBeHidden();
    if (invalidation === 'account-replaced') expect(await sourceNode!.evaluate(node => node.isConnected)).toBe(false);
    // Note's current editor-to-viewer policy denies this retained writable host.
    // The source is hidden; the test does not demand unsafe writable UI retention.
    const servedBefore = state.servedSnapshots.filter(read => read.documentId === state.wordId).length;
    release();
    await expect.poll(() => state.servedSnapshots.filter(read => read.documentId === state.wordId).length).toBe(servedBefore + 1);
    await expect(state.shell('word')).toHaveCount(0); await expect(page).toHaveURL(sourceURL);
    expect(state.writes).toHaveLength(writesBefore);
    expect(JSON.parse(state.originals.get(documentId)!.text).document).toEqual(expected);
    expect(state.originals.get(state.wordId)!.text).toBe(state.texts.word);
    expect(await page.evaluate(keys => keys.map(key => ({ key, raw: localStorage.getItem(key)! })), protectedRecords.map(record => record.key))).toEqual(protectedRecords);
    await expect(page.getByRole('heading', { name: '접근 권한이 없습니다', exact: true })).toBeVisible();
  } finally { release(); await sourceNode!.dispose(); }
});

// Controlled DOM composition lifecycle plus real textarea input. This verifies
// the product guard witness; it does not claim operating-system IME coverage.
for (const latest of ['input', 'composition'] as const) test(`controlled Project latest feedback ${latest} during final native save refuses stale promotion`, async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor', { project: true }), sourceURL = page.url();
  const source = state.shell('note'), paragraph = source.locator('.on-doc > p').first(), tree = page.locator('.ow-file-navigation');
  await (await projectFeedbackAction(page, '의견 0')).click();
  const composer = page.getByRole('textbox', { name: '프로젝트 의견 입력', exact: true });
  await expect(composer).toHaveValue('Initial controlled project draft');
  const composerNode = await composer.elementHandle(); expect(composerNode).not.toBeNull();
  const originalProject = structuredClone(state.projectRecord);
  await appendMixedNoteInput(page, paragraph, ' project-source-first');
  const previousReads = state.reads.filter(value => value === state.wordId).length, releaseTarget = state.hold(state.wordId, 2);
  let releaseSave: (() => void) | undefined;
  try {
    await tree.getByRole('button', { name: 'Mixed rich Word 열기', exact: true }).click();
    await expect.poll(() => state.reads.filter(value => value === state.wordId).length).toBe(previousReads + 2);
    await expect(page.locator('[data-native-entry="preparing"]')).toHaveCount(1);
    await appendMixedNoteInput(page, paragraph, ' project-source-final-save');
    const expectedNote = expectedMixedNote(state.texts.note, ' project-source-first', ' project-source-final-save');
    await expectProtectedMixedNote(page, 'draft', expectedNote);
    releaseSave = state.holdSourceWrite();
    const previousWrites = state.writes.filter(write => write.product === 'note').length;
    releaseTarget();
    await expect.poll(() => state.writes.filter(write => write.product === 'note').length).toBe(previousWrites + 1);
    await expect(page).toHaveURL(sourceURL); await expect(source).toBeVisible();
    await composer.click(); await page.keyboard.press('End');
    if (latest === 'composition') await composer.dispatchEvent('compositionstart', { data: '' });
    await page.keyboard.insertText(' latest feedback after preparation');
    const expectedFeedback = 'Initial controlled project draft latest feedback after preparation';
    await expect(composer).toHaveValue(expectedFeedback);
    await expect.poll(() => state.projectRecord.drafts[state.feedbackKey]).toBe(expectedFeedback);
    if (latest === 'composition') {
      await page.keyboard.press('Escape');
      await expect(page.getByRole('complementary', { name: '프로젝트 의견', exact: true })).toBeVisible();
      await expect(composer).toHaveValue(expectedFeedback);
    }
    releaseSave();
    await expect(tree.getByRole('alert')).toBeVisible();
    await expect(page.locator('[data-native-entry="preparing"]')).toHaveCount(0);
    await expect(page).toHaveURL(sourceURL); await expect(source).toBeVisible(); await expect(state.shell('word')).toHaveCount(0);
    expect(await composerNode!.evaluate(node => node.isConnected)).toBe(true);
    await expect(composer).toHaveValue(expectedFeedback);
    expect(JSON.parse(state.originals.get(documentId)!.text).document).toEqual(expectedNote);
    await expectProtectedMixedNote(page, 'confirmed', expectedNote);
    expect(state.projectRecord).toEqual({ ...originalProject, drafts: { ...originalProject.drafts, [state.feedbackKey]: expectedFeedback } });
    expect(state.projectWrites).toHaveLength(1);
    expect(state.writes.filter(write => write.product !== 'note')).toHaveLength(0);
    if (latest === 'composition') await composer.dispatchEvent('compositionend', { data: ' latest feedback after preparation' });
    await tree.getByRole('button', { name: 'Mixed rich Word 열기', exact: true }).click();
    await expect(state.shell('word').locator('.w-paragraph').first()).toBeVisible(); await assertMixedHeader(page, 'word');
    expect(await exportedMixedNative(page, 'word')).toEqual(JSON.parse(state.texts.word).document);
    expect(state.projectRecord).toEqual({ ...originalProject, drafts: { ...originalProject.drafts, [state.feedbackKey]: expectedFeedback } });
    expect(state.projectWrites).toHaveLength(1); expect(state.writes.filter(write => write.product !== 'note')).toHaveLength(0);
  } finally { releaseTarget(); releaseSave?.(); await composerNode!.dispose(); }
});


test('library opening publishes its freshly verified creator identity to My', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  const person = '11111111-1111-4111-8111-111111111111';
  let currentUserId: string | null = null;
  await page.route('**/api/v1/me', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ issuer, subject: 'synthetic-user', currentUserId,
      tenants: [{ tenantId: id, name: 'Alpha Company', role: 'editor' }], nextCursor: null }) }));
  const attributed = { ...documentHead, creatorUserId: person };
  await page.route(`**/api/v1/tenants/${id}/documents?**`, route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ documents: [attributed], nextCursor: null }) }));
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}`, route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ document: attributed, snapshotText }) }));
  const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'PUT' && request.url().endsWith('/snapshot')) writes.push(request.url()); });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace', exact: true }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  const tree = page.locator('.ow-file-navigation');
  await tree.getByRole('button', { name: '내 파일', exact: true }).click();
  const group = (label: string) => tree.locator('section[data-tree-group]')
    .filter({ has: page.locator('.ow-tree-group').filter({ hasText: label }) }).locator('[data-original]');
  await expect(group('생성자 미확인')).toHaveCount(1);
  await expect(group('내가 만든 파일')).toHaveCount(0);
  // Same verified issuer/subject and role; only the new /me attribution field is now known.
  currentUserId = person;
  await page.locator('.office-auth-panel ul.office-auth-tenants').getByRole('button', { name: 'Alpha Note', exact: true }).click();
  await expect(page.locator('[data-server-note-workspace] .on-doc > p').first()).toHaveText('Mock body');
  await tree.getByRole('button', { name: '내 파일', exact: true }).click();
  await expect(group('내가 만든 파일')).toHaveCount(1);
  await expect(group('생성자 미확인')).toHaveCount(0);
  await expect(group('내가 만든 파일')).toHaveAttribute('data-original', JSON.stringify([id, workspaceId, 'note', documentId]));
  expect(writes).toEqual([]);
});


test('same-person library open retains My search and the Workspace tree instance', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace', exact: true }).click();
  await page.getByRole('button', { name: '파일 자료함', exact: true }).click();
  const tree = page.locator('.ow-file-navigation');
  await tree.getByRole('button', { name: '내 파일', exact: true }).click();
  await tree.getByRole('textbox', { name: '파일 검색', exact: true }).fill('Alpha');
  await tree.getByRole('combobox', { name: '파일 제품 필터', exact: true }).selectOption('note');
  await expect(tree.locator('[data-original]')).toHaveCount(1);
  const instance = await tree.elementHandle();
  await page.locator('.office-auth-panel ul.office-auth-tenants').getByRole('button', { name: 'Alpha Note', exact: true }).click();
  await expect(page.locator('[data-server-note-workspace] .on-doc > p').first()).toHaveText('Mock body');
  expect(await instance!.evaluate(element => element.isConnected)).toBe(true);
  await expect(tree.getByRole('button', { name: '내 파일', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(tree.getByRole('textbox', { name: '파일 검색', exact: true })).toHaveValue('Alpha');
  await expect(tree.getByRole('combobox', { name: '파일 제품 필터', exact: true })).toHaveValue('note');
  await expect(tree.locator('[data-original]')).toHaveAttribute('data-original', JSON.stringify([id, workspaceId, 'note', documentId]));
});
