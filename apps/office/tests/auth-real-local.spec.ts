import { readFileSync, statSync } from 'node:fs';
import { expect, test, type BrowserContext } from '@playwright/test';

type AccountFile = { issuer: string; users: Record<string, { password: string; username?: string }> };
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
  await page.locator('#username').fill(syntheticAccounts().users[name].username ?? name);
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
        await expect(page.getByRole('heading', { name: /· 사용자/ })).toBeVisible();
        await expect(page.getByRole('button', { name: /^(Alpha|Beta) workspace$/ })).toBeVisible();
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
    await page.locator('#username').fill(fixture.users['beta-viewer'].username ?? 'beta-viewer');
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

test('two real accounts open one PostgreSQL Note while viewer cannot write', async ({ browser }) => {
  const fixture = syntheticAccounts();
  const ownerContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  try {
    const owner = await ownerContext.newPage();
    await signIn(owner, 'alpha-editor', fixture.users['alpha-editor'].password, '일반 사용자로 들어가기');
    await owner.getByRole('button', { name: /Synthetic Alpha/ }).click();
    await owner.getByRole('button', { name: 'Alpha workspace' }).click();
    await owner.getByRole('button', { name: '새 Note 만들기' }).click();
    await owner.getByRole('button', { name: '새 노트', exact: true }).click();
    const body = owner.locator('[data-server-note-workspace] [data-note-editor] .on-doc p').first();
    await expect(body).toBeVisible();
    await body.click();
    await owner.keyboard.type('Shared PostgreSQL Note');
    await expect(owner.locator('[data-save-status]')).toContainText('저장되지 않음');
    await owner.getByRole('button', { name: '저장', exact: true }).click();
    await expect(owner.locator('[data-save-status]')).toContainText('서버 저장 확인됨');
    const savedUrl = new URL(owner.url());
    const documentId = savedUrl.searchParams.get('document');
    expect(documentId).toMatch(/^[0-9a-f-]{36}$/i);

    const reopened = await ownerContext.newPage();
    await reopened.goto(`${officeOrigin}/products/note/?${savedUrl.searchParams}`);
    await expect(reopened.getByRole('heading', { name: 'Wonffice에 들어가기' })).toBeVisible();
    await expect(reopened.locator('[data-note-editor]')).toHaveCount(0);
    await reopened.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
    await expect(reopened.locator('[data-server-note-workspace] [data-note-editor]')).toContainText('Shared PostgreSQL Note');
    await reopened.locator('[data-server-note-workspace] [data-note-editor] .on-doc p').first().click();
    await reopened.keyboard.type(' unsaved');
    await expect(reopened.locator('[data-save-status]')).toContainText('저장되지 않음');
    await reopened.getByRole('button', { name: '자료함으로 돌아가기' }).click();
    await expect(reopened.getByRole('heading', { name: 'Synthetic Alpha · 사용자' })).toBeVisible();
    await reopened.getByRole('button', { name: 'Alpha workspace' }).click();
    await reopened.getByRole('button', { name: '새 노트', exact: true }).click();
    await reopened.getByRole('button', { name: /초안 복구/ }).click();
    await expect(reopened.locator('[data-server-note-workspace] [data-note-editor]')).toContainText('unsaved');
    await reopened.getByRole('button', { name: '로그아웃' }).click();
    await expect(reopened.getByRole('heading', { name: 'Wonffice에 들어가기' })).toBeVisible();
    await signIn(reopened, 'alpha-editor', fixture.users['alpha-editor'].password, '일반 사용자로 들어가기');
    await reopened.getByRole('button', { name: /Synthetic Alpha/ }).click();
    await reopened.getByRole('button', { name: 'Alpha workspace' }).click();
    await reopened.getByRole('button', { name: '새 노트', exact: true }).click();
    await reopened.getByRole('button', { name: /초안 복구/ }).click();
    await expect(reopened.locator('[data-server-note-workspace] [data-note-editor]')).toContainText('unsaved');

    const viewer = await viewerContext.newPage();
    await signIn(viewer, 'beta-viewer', fixture.users['beta-viewer'].password, '일반 사용자로 들어가기');
    await viewer.getByRole('button', { name: /Synthetic Alpha/ }).click();
    await viewer.getByRole('button', { name: 'Alpha workspace' }).click();
    await viewer.getByRole('button', { name: '새 노트' }).click();
    await expect(viewer.locator('[data-server-note-workspace] [data-note-editor]')).toContainText('Shared PostgreSQL Note');
    await expect(viewer.locator('[data-server-note-workspace]').getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    await expect(viewer.locator('[data-server-note-workspace] .nw-sidebar > button', { hasText: '새 노트' })).toHaveCount(0);
    expect(new URL(viewer.url()).searchParams.get('document')).toBe(documentId);
  } finally {
    await Promise.all([ownerContext.close(), viewerContext.close()]);
  }
});

test('real PostgreSQL C-copy keeps local original and verifies the new server tree', async ({ browser }) => {
  const fixture = syntheticAccounts();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signIn(page, 'alpha-editor', fixture.users['alpha-editor'].password, '일반 사용자로 들어가기');
    const sourceId = '00000000-0000-4000-8000-000000000081';
    const source = { format: 'barocss-note', version: 1, savedAt: '2026-10-01T00:00:00Z',
      document: { stype: 'note', attributes: { title: 'Real local copy', pageId: sourceId }, content: [
        { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Real copied body' },
          { stype: 'pageReference', attributes: { pageId: sourceId, title: 'Self' } }] },
        { stype: 'codeBlock', attributes: { language: 'javascript' }, content: [{ stype: 'inline-text', text: 'const realCopy = true;' }] }
      ] } };
    const sourceText = JSON.stringify(source);
    const row = { name: sourceId, title: 'Real local copy', text: sourceText, savedAt: 100, revision: 3, metadata: { favorite: true } };
    await page.evaluate(row => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('barocss-note', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'name' });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, transaction = db.transaction('documents', 'readwrite');
        transaction.objectStore('documents').put(row);
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onabort = () => reject(transaction.error);
      };
    }), row);
    await page.getByRole('button', { name: /Synthetic Alpha/ }).click();
    await page.getByRole('button', { name: 'Alpha workspace' }).click();
    await page.getByRole('button', { name: '새 Note 만들기' }).click();
    await page.getByRole('button', { name: '로컬 노트 사본 가져오기', exact: true }).click();
    await page.getByRole('button', { name: '이 기기의 로컬 노트 목록 확인' }).click();
    await page.getByRole('button', { name: '서버 사본 준비 Real local copy' }).click();
    const response = page.waitForResponse(value => value.request().method() === 'POST' && /\/documents$/.test(new URL(value.url()).pathname));
    await page.getByRole('button', { name: '저장 확인·재시도' }).click();
    const saved = await response;
    expect(saved.ok()).toBe(true);
    const receipt = await saved.json() as { document: { documentId: string; pageId: string; revision: number }; snapshotText: string };
    await expect(page.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    expect(receipt.document.documentId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(receipt.document.pageId).not.toBe(sourceId);
    expect(receipt.document.revision).toBe(1);
    const copied = JSON.parse(receipt.snapshotText) as typeof source;
    const expected = structuredClone(source);
    expected.document.attributes.pageId = receipt.document.pageId;
    (expected.document.content[0]!.content[1] as { attributes: { pageId: string } }).attributes.pageId = receipt.document.pageId;
    expect(copied).toEqual(expected);
    expect(await page.evaluate(() => new Promise<unknown>((resolve, reject) => {
      const request = indexedDB.open('barocss-note', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, transaction = db.transaction('documents'), item = transaction.objectStore('documents').get('00000000-0000-4000-8000-000000000081');
        transaction.oncomplete = () => { db.close(); resolve(item.result); };
        transaction.onabort = () => reject(transaction.error);
      };
    }))).toEqual(row);
    await page.reload();
    await expect(page.locator('[data-server-note-workspace] .on-doc')).toContainText('const realCopy = true;');
    await expect(page.locator('[data-confirmed-local-copy]')).toContainText(receipt.document.documentId);
  } finally { await context.close(); }
});
