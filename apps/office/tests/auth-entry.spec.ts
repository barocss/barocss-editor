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
  await expect(page).toHaveURL(new RegExp(`document=${documentId}`));
});

test('a saved local recovery draft remains available after leaving and reopening the server Note', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: 'Alpha Note' }).click();
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
  await page.getByRole('button', { name: 'Alpha Note' }).click();
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
  await page.getByRole('button', { name: 'Alpha Note' }).click();
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
  await page.getByRole('button', { name: 'Alpha Note' }).click();
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
  await page.getByRole('button', { name: 'Alpha Note' }).click();
  const paragraph = page.locator('[data-server-note-workspace] .on-doc > p').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' receipt-recovery');
  await page.locator('[data-server-note-workspace]').getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '저장 확인·재시도' })).toBeEnabled();
  for (let reload = 0; reload < 2; reload++) {
    await page.reload();
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

test('revoked Note access hides an actual unsaved edit and restores it only for the same authorized account', async ({ page }) => {
  await mockLogin(page, { documentCount: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: 'Alpha Note' }).click();
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
  await page.getByRole('button', { name: /초안 복구 Alpha Note/ }).click();
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
  await page.getByRole('button', { name: 'Alpha Note' }).click();
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
  await page.unroute(`**/api/v1/tenants/${id}/documents?**`);
  await page.route(`**/api/v1/tenants/${id}/documents?**`, route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ documents: [documentHead, nextHead], nextCursor: null }) }));
  await page.route(`**/api/v1/tenants/${id}/documents/${nextId}`, route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ document: nextHead, snapshotText: nextSnapshot }) }));
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: 'Alpha Note' }).click();
  await page.locator('[data-server-note-workspace]').getByRole('button', { name: 'Second Note' }).click();
  const paragraph = page.locator('[data-server-note-workspace] .on-doc > p').first();
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
  await expect(page).toHaveURL(new RegExp(`document=${nextId}`));
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' still editable');
  await expect(paragraph).toContainText('navigation draft still editable');
});

test('a stale Note save requires copying the typed draft before opening the server revision', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockLogin(page, { documentCount: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await page.getByRole('button', { name: /Alpha Company/ }).click();
  await page.getByRole('button', { name: 'Alpha Workspace' }).click();
  await page.getByRole('button', { name: 'Alpha Note' }).click();
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
  await page.getByRole('button', { name: 'Alpha Note' }).click();
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
  await page.getByRole('button', { name: 'Alpha Note' }).click();
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
    await page.getByRole('button', { name: 'Alpha Note' }).click();
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
