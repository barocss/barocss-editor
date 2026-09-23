import { readFileSync, statSync } from 'node:fs';
import { expect, test, type BrowserContext } from '@playwright/test';

type AccountFile = { issuer: string; users: Record<string, { password: string }> };
const officeOrigin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';

test.skip(!process.env.OFFICE_AUTH_REAL_FILE, 'Set OFFICE_AUTH_REAL_FILE to a protected local synthetic-account file.');

test('two independent Keycloak accounts reach server-derived Office entry', async ({ browser }) => {
  const path = process.env.OFFICE_AUTH_REAL_FILE!;
  expect(statSync(path).mode & 0o077).toBe(0);
  const fixture = JSON.parse(readFileSync(path, 'utf8')) as AccountFile;
  expect(fixture.issuer).toBe('http://127.0.0.1:18180/realms/wonffice-local');
  const subjects: string[] = [];
  const tenantCounts: number[] = [];
  const roles: string[][] = [];
  const contexts: BrowserContext[] = [];
  try {
    for (const name of ['alpha-editor', 'beta-viewer']) {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      const meResponse = page.waitForResponse(response => response.url().endsWith('/api/me') && response.status() === 200);
      await page.goto(officeOrigin);
      await page.getByRole('button', { name: '사용자로 들어가기' }).click();
      await page.locator('#username').fill(name);
      await page.locator('#password').fill(fixture.users[name].password);
      await page.locator('#kc-login').click();
      const me = await (await meResponse).json() as { subject: string; tenants: Array<{ name: string; role: string }> };
      subjects.push(me.subject);
      tenantCounts.push(me.tenants.length);
      roles.push(me.tenants.map(tenant => tenant.role));
      if (me.tenants.length === 0) {
        await expect(page.getByRole('heading', { name: '접근할 수 있는 회사가 없습니다' })).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: '회사를 선택하세요' })).toBeVisible();
        await page.locator('.office-auth-tenants button').first().click();
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
