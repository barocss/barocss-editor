import { readFileSync, statSync } from 'node:fs';
import { expect, test, type BrowserContext } from '@playwright/test';

type AccountFile = { issuer: string; users: Record<string, { password: string }> };
const officeOrigin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';

test.skip(!process.env.OFFICE_AUTH_REAL_FILE, 'Set OFFICE_AUTH_REAL_FILE to a protected local synthetic-account file.');

function syntheticAccounts(): AccountFile {
  const path = process.env.OFFICE_AUTH_REAL_FILE!;
  expect(statSync(path).mode & 0o077).toBe(0);
  const fixture = JSON.parse(readFileSync(path, 'utf8')) as AccountFile;
  expect(fixture.issuer).toBe('http://127.0.0.1:18180/realms/wonffice-local');
  return fixture;
}

async function signIn(page: Awaited<ReturnType<BrowserContext['newPage']>>, name: string,
  password: string, destination: string) {
  await page.goto(officeOrigin);
  await page.getByRole('button', { name: destination }).click();
  await page.locator('#username').fill(name);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
}

test('two independent Keycloak accounts reach server-derived Office entry', async ({ browser }) => {
  const fixture = syntheticAccounts();
  const subjects: string[] = [];
  const tenantCounts: number[] = [];
  const roles: string[][] = [];
  const contexts: BrowserContext[] = [];
  try {
    for (const name of ['alpha-editor', 'beta-viewer']) {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      const meResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/me') && response.status() === 200);
      await signIn(page, name, fixture.users[name].password, '일반 사용자로 들어가기');
      const me = await (await meResponse).json() as { subject: string; tenants: Array<{ name: string; role: string }> };
      subjects.push(me.subject);
      tenantCounts.push(me.tenants.length);
      roles.push(me.tenants.map(tenant => tenant.role));
      if (me.tenants.length === 0) {
        await expect(page.getByRole('heading', { name: '접근할 수 있는 회사가 없습니다' })).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: '회사를 선택하세요' })).toBeVisible();
        await page.locator('.office-auth-tenants button').first().click();
        await expect(page.getByText('이 회사에는 저장된 문서가 없습니다.')).toBeVisible();
        await expect(page.getByText('서버 문서 자료함은 아직 연결되지 않았습니다.')).toBeVisible();
      }
      await expect(page.locator('.office-auth')).toBeVisible();
      await page.getByRole('button', { name: '로그아웃' }).click();
      await expect(page.getByRole('heading', { name: 'Wonffice에 들어가기' })).toBeVisible({ timeout: 15000 });
      const afterLogout = new URL(page.url());
      console.log(JSON.stringify({ event: 'office_auth_logout_destination', origin: afterLogout.origin, path: afterLogout.pathname }));
      await expect(page.getByText('로그아웃했습니다.')).toBeVisible();
    }
    expect(subjects).toHaveLength(2);
    expect(subjects[0]).not.toBe(subjects[1]);
    console.log(JSON.stringify({ event: 'office_auth_real_local_verified', independentContexts: contexts.length, distinctSubjects: true, activeTenantCounts: tenantCounts, roles }));
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

test('real server roles separate company admin, operator grant and unready status', async ({ browser }) => {
  const fixture = syntheticAccounts();
  const contexts: BrowserContext[] = [];
  const newPage = async () => {
    const context = await browser.newContext();
    contexts.push(context);
    return context.newPage();
  };
  try {
    const owner = await newPage();
    let ownerAuthorization = '';
    owner.on('request', request => {
      if (request.url().endsWith('/api/v1/me')) {
        ownerAuthorization = request.headers().authorization ?? '';
      }
    });
    await signIn(owner, 'alpha-editor', fixture.users['alpha-editor'].password, '회사 관리자로 들어가기');
    await owner.getByRole('button', { name: /Synthetic Alpha/ }).click();
    await expect(owner.getByRole('heading', { name: 'Synthetic Alpha · 회사 관리자' })).toBeVisible();
    expect(ownerAuthorization).toMatch(/^Bearer /);
    const status = await owner.request.get(`${officeOrigin}/api/v1/operator/status`,
      { headers: { authorization: ownerAuthorization } });
    expect(status.status()).toBe(200);
    expect((await status.json()).ready.httpStatus).toBe(503);
    const noToken = await owner.request.get(`${officeOrigin}/api/v1/me`);
    expect(noToken.status()).toBe(401);

    const viewer = await newPage();
    await signIn(viewer, 'beta-viewer', fixture.users['beta-viewer'].password, '회사 관리자로 들어가기');
    await viewer.getByRole('button', { name: /Synthetic Alpha/ }).click();
    await expect(viewer.getByRole('heading', { name: '관리자 권한이 없습니다' })).toBeVisible();
    await expect(viewer.getByRole('button', { name: '사용자 화면 보기' })).toBeVisible();

    const operator = await newPage();
    await signIn(operator, 'alpha-editor', fixture.users['alpha-editor'].password,
      'Wonffice 전체 서비스 운영자로 들어가기');
    await expect(operator.getByRole('heading', { name: 'Wonffice 전체 서비스 운영자' })).toBeVisible();
    await expect(operator).toHaveURL(`${officeOrigin}/operator`);

    const denied = await newPage();
    await signIn(denied, 'beta-viewer', fixture.users['beta-viewer'].password,
      'Wonffice 전체 서비스 운영자로 들어가기');
    await expect(denied.getByRole('heading', { name: '서비스 운영 권한이 없습니다' })).toBeVisible();
    await expect(denied.getByRole('heading', { name: 'Wonffice 전체 서비스 운영자' })).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

test('account switch can select the other Keycloak user without restoring prior company', async ({ browser }) => {
  const fixture = syntheticAccounts();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signIn(page, 'alpha-editor', fixture.users['alpha-editor'].password,
      '일반 사용자로 들어가기');
    await page.getByRole('button', { name: /Synthetic Alpha/ }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic Alpha · 사용자' })).toBeVisible();
    await page.getByRole('button', { name: '계정 전환' }).click();
    await expect(page.getByRole('heading', { name: 'Wonffice에 들어가기' })).toBeVisible();
    await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
    await expect(page.locator('#username')).toBeVisible();
    await page.locator('#username').fill('beta-viewer');
    await page.locator('#password').fill(fixture.users['beta-viewer'].password);
    await page.locator('#kc-login').click();
    await expect(page.getByRole('heading', { name: '회사를 선택하세요' })).toBeVisible();
    await page.getByRole('button', { name: /Synthetic Beta/ }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic Beta · 사용자' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Synthetic Alpha · 사용자' })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
