import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { NATIVE_NOTE_FIXTURES } from '../../note/src/native2-scenario-fixtures';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const documentId = '33333333-3333-4333-8333-333333333333';
const currentUserId = '44444444-4444-4444-8444-444444444444';
const issuer = 'http://127.0.0.1:18180/realms/wonffice-local';
const original = NATIVE_NOTE_FIXTURES.SOURCE_A;
const snapshotText = JSON.stringify(original);
const snapshotHash = createHash('sha256').update(snapshotText).digest('hex');
const document = { documentId, tenantId, workspaceId, product: 'note', title: 'Controlled original',
  creatorUserId: null, metadataRevision: 1, mode: 'snapshot', pageId: original.document.attributes.pageId,
  documentKey: `wonffice-${tenantId}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 2,
  revision: 1, snapshotHash };
const nativePath = `/api/v1/tenants/${tenantId}/note-native2/documents/${documentId}`;

async function controlledLogin(page: Page): Promise<string[]> {
  const nativeCalls: string[] = [];
  let officeOrigin = '';
  await page.route(`${issuer}/.well-known/openid-configuration`, route => route.fulfill({
    contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token` }),
  }));
  await page.route(`${issuer}/authorize**`, route => {
    const state = new URL(route.request().url()).searchParams.get('state');
    return route.fulfill({ contentType: 'text/html',
      body: `<script>location.replace(${JSON.stringify(`${officeOrigin}/auth/callback?code=controlled&state=${encodeURIComponent(state ?? '')}`)})</script>` });
  });
  await page.route(`${issuer}/token`, route => route.fulfill({
    contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ access_token: 'controlled-only', token_type: 'Bearer', expires_in: 300 }),
  }));
  await page.route('**/api/v1/me', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ issuer, subject: 'controlled-person', currentUserId,
      tenants: [{ tenantId, name: 'Controlled tenant', role: 'editor' }], nextCursor: null }) }));
  await page.route(`**/api/v1/tenants/${tenantId}/access`, route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ tenantId, role: 'editor' }) }));
  await page.route(`**/api/v1/tenants/${tenantId}/workspaces**`, route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ workspaces: [{ id: workspaceId, name: 'Controlled workspace' }], nextCursor: null }) }));
  await page.route(`**${nativePath}`, route => {
    nativeCalls.push(route.request().url());
    expect(route.request().method()).toBe('GET');
    expect(route.request().headers().authorization).toBe('Bearer controlled-only');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ document, snapshotText }) });
  });
  await page.route(`**${nativePath}/schema-bundle`, route => {
    nativeCalls.push(route.request().url());
    expect(route.request().method()).toBe('GET');
    expect(route.request().headers().authorization).toBe('Bearer controlled-only');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'pinned', documentId,
      documentRevision: 1, snapshotHash, nativeFormat: { format: 'barocss-note', version: 2 },
      bundle: original.schemaBundle }) });
  });
  await page.goto('/');
  officeOrigin = new URL(page.url()).origin;
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  await expect(page.getByRole('heading', { name: '회사를 선택하세요' })).toBeVisible();
  return nativeCalls;
}

test('controlled browser login opens exact native2 raw and bundle through the Office private reader', async ({ page }) => {
  const nativeCalls = await controlledLogin(page);
  const read = await page.evaluate(async scope => {
    const moduleUrl = '/src/native2-authenticated-reader.ts';
    const authUrl = '/src/auth-client.ts';
    const readerModule = await import(/* @vite-ignore */ moduleUrl);
    const authModule = await import(/* @vite-ignore */ authUrl);
    const reader = readerModule.createAuthenticatedNative2Reader();
    const result = await reader.open(scope);
    const delivered = { snapshotText: result.read.snapshotText, file: result.read.file,
      provenance: result.provenance, currentBefore: result.isCurrent() };
    authModule.clearSession();
    return { ...delivered, currentAfter: result.isCurrent() };
  }, { tenantId, workspaceId, documentId });
  expect(read.snapshotText).toBe(snapshotText);
  expect(read.file).toEqual({ fileVersion: 2, document: original.document,
    schemaBundle: original.schemaBundle, ...('savedAt' in original ? { savedAt: original.savedAt } : {}) });
  expect(read.provenance).toEqual({ issuer, subject: 'controlled-person', currentUserId,
    tenantId, workspaceId, documentId, role: 'editor' });
  expect(read.currentBefore).toBe(true);
  expect(read.currentAfter).toBe(false);
  expect(nativeCalls.map(url => new URL(url).pathname)).toEqual([nativePath, `${nativePath}/schema-bundle`]);
});
