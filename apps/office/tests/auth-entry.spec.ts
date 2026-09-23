import { expect, test, type Page } from '@playwright/test';

const id = '00000000-0000-4000-8000-000000000001';
const issuer = 'http://127.0.0.1:18180/realms/wonffice-local';
type Role = 'owner' | 'admin' | 'editor' | 'viewer';

async function mockLogin(page: Page, options: { role?: Role; tenants?: number; apiStatus?: number; accessStatus?: number; operatorStatus?: number } = {}) {
  const { role = 'editor', tenants = 1, apiStatus = 200, accessStatus = 200, operatorStatus = 403 } = options;
  await page.route(`${issuer}/.well-known/openid-configuration`, route => route.fulfill({
    contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ issuer, authorization_endpoint: `${issuer}/protocol/openid-connect/auth`, token_endpoint: `${issuer}/protocol/openid-connect/token`, end_session_endpoint: `${issuer}/protocol/openid-connect/logout` }),
  }));
  await page.route(`${issuer}/protocol/openid-connect/auth**`, route => {
    const state = new URL(route.request().url()).searchParams.get('state');
    return route.fulfill({ contentType: 'text/html', body: `<script>location.replace('http://127.0.0.1:5191/auth/callback?code=synthetic&state=${encodeURIComponent(state ?? '')}')</script>` });
  });
  await page.route(`${issuer}/protocol/openid-connect/token`, route => route.fulfill({
    contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 300 }),
  }));
  await page.route('**/api/me', route => route.fulfill({
    status: apiStatus, contentType: 'application/json',
    body: JSON.stringify(apiStatus === 200 ? { issuer, subject: 'synthetic-user', tenants: tenants ? [{ tenantId: id, name: 'Alpha Company', role }] : [], nextCursor: null } : { status: 'service_unavailable' }),
  }));
  await page.route(`**/api/tenants/${id}/access`, route => route.fulfill({ status: accessStatus, contentType: 'application/json', body: JSON.stringify(accessStatus === 200 ? { tenantId: id, role } : { status: 'forbidden' }) }));
  await page.route('**/api/operator/access', route => route.fulfill({ status: operatorStatus, contentType: 'application/json', body: JSON.stringify(operatorStatus === 200 ? { operator: true } : { status: operatorStatus === 403 ? 'forbidden' : 'service_unavailable' }) }));
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
  await expect(page.getByText('서버 문서 자료함은 아직 연결되지 않았습니다.')).toBeVisible();
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

test('API outage shows retry, not an empty library', async ({ page }) => {
  await mockLogin(page, { apiStatus: 503 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '접근 권한을 확인하지 못했습니다' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 확인' })).toBeVisible();
  await expect(page.getByText('접근할 수 있는 회사가 없습니다')).toHaveCount(0);
});

test('expired identity and revoked tenant are distinct states', async ({ page }) => {
  await mockLogin(page, { apiStatus: 401 });
  await page.goto('/');
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '로그인이 필요합니다' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 로그인' })).toBeVisible();

  await page.reload();
  await page.unroute('**/api/me');
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
  await page.route('**/api/me', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    issuer, subject: route.request().headers().authorization === 'Bearer account-1' ? 'account-A' : 'account-B',
    tenants: [{ tenantId: id, name: route.request().headers().authorization === 'Bearer account-1' ? 'First Company' : 'Second Company', role: 'owner' }], nextCursor: null,
  }) }));
  await page.goto('/');
  await page.getByRole('button', { name: '회사 관리자로 들어가기' }).click();
  await page.getByRole('button', { name: /First Company/ }).click();
  await expect(page.getByRole('heading', { name: 'First Company · 회사 관리자' })).toBeVisible();
  await page.getByRole('button', { name: '계정 전환' }).click();
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
  await page.unroute('**/api/operator/access');
  await page.route('**/api/operator/access', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{"status":"forbidden"}' }));
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
  await page.unroute('**/api/operator/access');
  await page.route('**/api/operator/access', route => route.fulfill({
    status: route.request().headers().authorization === 'Bearer account-1' ? 200 : 403,
    contentType: 'application/json', body: route.request().headers().authorization === 'Bearer account-1' ? '{"operator":true}' : '{"status":"forbidden"}',
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Wonffice 전체 서비스 운영자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: 'Wonffice 전체 서비스 운영자' })).toBeVisible();
  await page.getByRole('button', { name: '계정 전환' }).click();
  await expect(page.getByRole('heading', { name: '서비스 운영 권한이 없습니다' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wonffice 전체 서비스 운영자' })).toHaveCount(0);
});

test('operator authentication and server failures have separate outcomes', async ({ page }) => {
  await mockLogin(page, { tenants: 0, operatorStatus: 401 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Wonffice 전체 서비스 운영자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '로그인이 필요합니다' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wonffice 전체 서비스 운영자' })).toHaveCount(0);

  await page.unroute('**/api/operator/access');
  await page.route('**/api/operator/access', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":"service_unavailable"}' }));
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
