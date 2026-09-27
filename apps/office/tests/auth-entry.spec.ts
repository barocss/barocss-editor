import { expect, test, type Page, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';

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
    return route.fulfill({ contentType: 'text/html', body: `<script>location.replace('http://127.0.0.1:5191/auth/callback?code=synthetic&state=${encodeURIComponent(state ?? '')}')</script>` });
  });
  await page.route(`${issuer}/protocol/openid-connect/logout**`, route => {
    const state = new URL(route.request().url()).searchParams.get('state');
    return route.fulfill({ contentType: 'text/html', body: `<script>location.replace('http://127.0.0.1:5191/?state=${encodeURIComponent(state ?? '')}')</script>` });
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
  await expect(page.getByRole('button', { name: 'Alpha Note' })).toBeVisible();
  await expect(page.getByText('이 자료함에는 저장된 Note 문서가 없습니다.')).toHaveCount(0);
});

test('document list failure never becomes an empty company or empty document state', async ({ page }) => {
  await mockLogin(page, { documentsStatus: 503 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await expect(page.getByRole('heading', { name: '접근 권한을 확인하지 못했습니다' })).toBeVisible();
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
    return route.fulfill({ contentType: 'text/html', body: `<script>location.replace('http://127.0.0.1:5191/auth/callback?code=synthetic&state=${encodeURIComponent(url.searchParams.get('state') ?? '')}')</script>` });
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
    return route.fulfill({ contentType: 'text/html', body: `<script>location.replace('http://127.0.0.1:5191/auth/callback?error=access_denied&state=${encodeURIComponent(state ?? '')}')</script>` });
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
  await expect(page).toHaveURL(new RegExp(`document=${documentId}`));
});

test('a mismatched protected Note head never mounts a body', async ({ page }) => {
  await mockLogin(page, { documentCount: 1, openWorkspace: '00000000-0000-4000-8000-000000000009' });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: 'Alpha Note' }).click();
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
  await expect(page.locator('[data-server-note-workspace] [data-note-editor]')).toHaveCount(0);
});

test('viewer can open a Note but cannot start a new one', async ({ page }) => {
  await mockLogin(page, { role: 'viewer', documentCount: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await expect(page.getByRole('button', { name: '새 Note 만들기' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Alpha Note' }).click();
  await expect(page.locator('[data-server-note-workspace] [data-note-editor]')).toContainText('Mock body');
  await expect(page.locator('[data-server-note-workspace]').getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
});

test('temporary access failure hides a mounted Note and retry restores it without a remount', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: 'Alpha Note' }).click();
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
  await page.getByRole('button', { name: '새 Note 만들기' }).click();
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
