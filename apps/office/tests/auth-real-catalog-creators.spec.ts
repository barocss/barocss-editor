import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createSampleDocument } from '../../../packages/office-word/src/sample-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';
import { createSampleDeck } from '../../../packages/office-slides/src/sample-deck';
import { deckFileText } from '../../../packages/office-slides/src/deck-file';
import { siteFileText } from '../../../packages/office-site/src/site-file';
import { serializeNoteFile, type NoteDocument } from '../../../packages/office-note/src/note-file-codec';
import { representativeDocument } from '../../note/tests/document-centered.helpers';
import { siteNativeFixture } from './helpers/site-native-fixture';
import { launchPrivateProfile, privateControl, stopPrivateProfile, type RealStatus, type Inspection } from './helpers/real-recovery-control';

const origin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';
const products = ['note', 'word', 'slides', 'site'] as const;
type Product = typeof products[number];
type Head = { documentId: string; creatorUserId: string | null; revision: number; product: Product; title: string };
type Receipt = { document: Head; snapshotText: string; idempotencyKey: string };
const tree = (page: Page) => page.locator('.ow-file-navigation');
const myGroup = (page: Page, label: string) => tree(page).locator('section[data-tree-group]')
  .filter({ has: page.locator('.ow-tree-group').filter({ hasText: label }) });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000, trace: 'off', video: 'off' });

async function login(page: Page, alias: 'alpha-editor' | 'beta-viewer', status: RealStatus) {
  const fixturePath = process.env.OFFICE_AUTH_REAL_FILE;
  if (!fixturePath || statSync(fixturePath).mode & 0o077) throw new Error('Protected real account fixture is required');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const account = fixture.users[alias];
  await page.goto(origin);
  await page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true }).click();
  await page.locator('#username').fill(account.username ?? alias);
  await page.locator('#password').fill(account.password);
  await page.locator('#kc-login').click();
  await page.getByRole('button', { name: /Synthetic Alpha/ }).click();
  await page.getByRole('button', { name: 'Alpha workspace', exact: true }).click();
  await expect(tree(page)).toBeVisible();
  const identity = await page.evaluate(async source => {
    const client = await import(source) as typeof import('../src/auth-client');
    return client.loadIdentity();
  }, '/src/auth-client.ts');
  expect(identity.issuer === fixture.issuer && identity.subject === account.id, 'Fresh identity must match the requested synthetic account').toBe(true);
  expect(identity.tenants.find(item => item.tenantId === status.tenantId)?.role).toBe(alias === 'alpha-editor' ? 'owner' : 'editor');
  expect(identity.currentUserId).toMatch(/^[0-9a-f-]{36}$/);
  return identity.currentUserId!;
}
async function api(page: Page, path: string, method = 'GET', body?: unknown) {
  return page.evaluate(async ({ path, method, body, source }) => {
    const { captureAuthorizedFetch } = await import(source) as typeof import('../src/auth-client');
    const response = await captureAuthorizedFetch()(path, { method,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    return { status: response.status, value: await response.json() };
  }, { path, method, body, source: '/src/auth-client.ts' });
}
async function denied(page: Page, path: string, method = 'GET', body?: unknown) {
  // The authenticated client throws on 403. Observe the actual HTTP denial as well.
  let authorization = '';
  const capture = (request: import('@playwright/test').Request) => {
    if (request.url() === `${origin}${path}` && request.method() === method) authorization = request.headers().authorization ?? '';
  };
  page.on('request', capture);
  const response = page.waitForResponse(response => response.url() === `${origin}${path}` && response.request().method() === method);
  const kind = await page.evaluate(async ({ path, method, body, source }) => {
    const { captureAuthorizedFetch, AuthError } = await import(source) as typeof import('../src/auth-client');
    try {
      await captureAuthorizedFetch()(path, { method,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
      return null;
    } catch (cause) { return cause instanceof AuthError ? cause.kind : 'unexpected'; }
  }, { path, method, body, source: '/src/auth-client.ts' });
  page.off('request', capture);
  expect(kind).toBe('forbidden');
  const wire = await response; expect(wire.status()).toBe(403);
  expect(authorization.startsWith('Bearer ')).toBe(true);
  // Chromium can discard the unread body after the client throws. A second real
  // request with that same current bearer verifies the denied response contents.
  const read = await page.request.fetch(`${origin}${path}`, { method, headers: { authorization },
    ...(body === undefined ? {} : { data: body }) });
  expect(read.status()).toBe(403);
  return read.json();
}
async function my(page: Page) {
  await tree(page).locator('.ow-tree-perspectives').getByRole('button', { name: '내 파일', exact: true }).click();
  await expect(myGroup(page, '내가 만든 파일')).toHaveCount(1);
}
async function refresh(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('wonffice:catalog-refresh')));
}
function file(product: Product): string {
  if (product === 'word') return wordFileText(createSampleDocument(), '2026-10-05T00:00:00.000Z');
  if (product === 'slides') return deckFileText(createSampleDeck(), '2026-10-05T00:00:00.000Z');
  if (product === 'site') return siteFileText(siteNativeFixture(true), '2026-10-05T00:00:00.000Z');
  return serializeNoteFile(representativeDocument() as NoteDocument, { savedAt: '2026-10-05T00:00:00.000Z' });
}

test('real two-person catalog attributes all four originals and a new copy without granting creator authority', async ({ browser: _browser }, info) => {
  test.setTimeout(180_000);
  const control = process.env.OFFICE_AUTH_CONTROL_FILE;
  if (!control) throw new Error('Private PostgreSQL control is required');
  const directory = mkdtempSync(join('/private/tmp/', '468-creator-profiles-'));
  const profiles: Awaited<ReturnType<typeof launchPrivateProfile>>[] = [];
  const originals: Receipt[] = [];
  try {
    const status = await privateControl<RealStatus>({ action: 'status' });
    await privateControl({ action: 'beta-role', role: 'editor' });
    const a = await launchPrivateProfile(join(directory, 'a')); profiles.push(a);
    const b = await launchPrivateProfile(join(directory, 'b')); profiles.push(b);
    expect(a.pid).not.toBe(b.pid);
    const pageA = a.context.pages()[0], pageB = b.context.pages()[0];
    await pageA.emulateMedia({ colorScheme: 'light' });
    await pageB.emulateMedia({ colorScheme: 'dark' });
    const personA = await login(pageA, 'alpha-editor', status);
    const root = `/api/v1/tenants/${status.tenantId}`;
    for (const product of products) {
      const submitted = file(product);
      const result = await api(pageA, `${root}/documents`, 'POST', { workspaceId: status.workspaceId,
        product, title: `Creator ${product} ${randomUUID()}`, fileFormat: `barocss-${product}`,
        fileVersion: product === 'slides' ? 2 : 1, snapshotText: submitted,
        idempotencyKey: `creator-${product}-${randomUUID()}`, ...(product === 'note' ? { importMode: 'new-page-copy' } : {}) });
      expect(result.status).toBe(201);
      const receipt = result.value as Receipt;
      if (product !== 'note') expect(receipt.snapshotText).toBe(submitted);
      expect(receipt.document.creatorUserId).toBe(personA);
      expect(receipt.document.revision).toBe(1); originals.push(receipt);
    }
    await refresh(pageA); await my(pageA);
    await expect(myGroup(pageA, '내가 만든 파일').locator('[data-original]')).toHaveCount(4);
    await expect(myGroup(pageA, '작업 공간에서 공유된 파일').locator('[data-original]')).toHaveCount(0);
    const personB = await login(pageB, 'beta-viewer', status);
    expect(personB).not.toBe(personA);
    await my(pageB);
    await expect(myGroup(pageB, '내가 만든 파일').locator('[data-original]')).toHaveCount(0);
    await expect(myGroup(pageB, '작업 공간에서 공유된 파일').locator('[data-original]')).toHaveCount(4);
    await pageA.screenshot({ path: info.outputPath('creator-a-my-light.png') });
    await pageB.screenshot({ path: info.outputPath('creator-b-my-dark.png') });
    const writeRequests: string[] = [];
    pageB.on('request', request => { if (request.method() === 'PUT' && request.url().endsWith('/snapshot')) writeRequests.push(request.url()); });
    for (const original of originals) {
      const { product, documentId, title } = original.document;
      await tree(pageB).locator(`[data-original='${JSON.stringify([status.tenantId, status.workspaceId, product, documentId])}']`).click();
      await expect(pageB.locator(`[data-native-entry="active"] [data-server-${product}-workspace]`)).toBeVisible();
      await expect(pageB.locator('.ow-entry-status')).toHaveCount(0);
      await tree(pageB).locator('.ow-tree-footer').getByRole('button', { name: '자료함', exact: true }).click();
      const read = await api(pageB, `${root}/documents/${documentId}`);
      expect(read.status).toBe(200); expect(read.value.document).toMatchObject({ documentId, creatorUserId: personA, revision: 1, title });
      expect(JSON.parse(read.value.snapshotText)).toEqual(JSON.parse(original.snapshotText));
      await expect(myGroup(pageB, '작업 공간에서 공유된 파일').locator('[data-original]')).toHaveCount(4);
    }
    expect(writeRequests).toEqual([]);
    const word = originals.find(receipt => receipt.document.product === 'word')!;
    const copyInput = { workspaceId: status.workspaceId, product: 'word', title: `Creator copy ${randomUUID()}`,
      fileFormat: 'barocss-word', fileVersion: 1, snapshotText: word.snapshotText, idempotencyKey: `creator-copy-${randomUUID()}` };
    const copy = await api(pageB, `${root}/documents`, 'POST', copyInput);
    expect(copy.status).toBe(201); expect(copy.value.document.creatorUserId).toBe(personB);
    expect(copy.value.document.documentId).not.toBe(word.document.documentId);
    expect(copy.value.snapshotText).toBe(word.snapshotText);
    const replay = await api(pageB, `${root}/documents`, 'POST', copyInput);
    expect(replay.status).toBe(201); expect(replay.value).toEqual(copy.value);
    const changed = await api(pageB, `${root}/documents`, 'POST', { ...copyInput, title: 'Conflicting frozen request' });
    expect(changed.status).toBe(409);
    await refresh(pageB);
    await expect(myGroup(pageB, '내가 만든 파일').locator('[data-original]')).toHaveCount(1);
    await expect(myGroup(pageB, '작업 공간에서 공유된 파일').locator('[data-original]')).toHaveCount(4);
    await privateControl({ action: 'api-stop' });
    await privateControl({ action: 'db-stop' });
    const restartedDb = await privateControl<RealStatus>({ action: 'db-start' });
    const restartedApi = await privateControl<RealStatus>({ action: 'api-start' });
    expect(restartedDb.databaseIdentity).toBe(status.databaseIdentity);
    expect(restartedDb.databaseGeneration).toBe(status.databaseGeneration);
    expect(restartedDb.postgresPid).not.toBe(status.postgresPid);
    expect(restartedApi.apiPid).not.toBe(status.apiPid);
    const persistedReceipt = await api(pageB, `${root}/receipts/create/${copyInput.idempotencyKey}`);
    expect(persistedReceipt.status).toBe(200); expect(persistedReceipt.value).toEqual(copy.value);
    for (const original of originals) {
      const persisted = await api(pageA, `${root}/documents/${original.document.documentId}`);
      expect(persisted.status).toBe(200); expect(persisted.value.document.creatorUserId).toBe(personA);
      expect(JSON.parse(persisted.value.snapshotText)).toEqual(JSON.parse(original.snapshotText));
    }
    const cross = await denied(pageA, `/api/v1/tenants/${status.betaTenantId}/documents?workspaceId=${status.betaWorkspaceId}`);
    expect(JSON.stringify(cross)).not.toContain(word.document.title);
    await privateControl({ action: 'beta-role', role: 'viewer' });
    const viewerKey = `creator-viewer-${randomUUID()}`;
    const inspectCopy = () => privateControl<Inspection<'word'>>({ action: 'inspect', product: 'word',
      documentId: copy.value.document.documentId, idempotencyKey: viewerKey, operation: 'update', actor: 'beta-viewer' });
    const beforeDenied = await inspectCopy();
    expect(beforeDenied.document).not.toBeNull(); expect(beforeDenied.receipt).toBeNull();
    await denied(pageB, `${root}/documents/${copy.value.document.documentId}/snapshot`, 'PUT', {
      expectedRevision: 1, snapshotText: copy.value.snapshotText, idempotencyKey: viewerKey });
    const afterDenied = await inspectCopy();
    expect(afterDenied.document).toEqual(beforeDenied.document);
    expect(afterDenied.receipt).toBeNull(); expect(afterDenied.receiptCount).toBe(beforeDenied.receiptCount);
    expect(afterDenied.documentCount).toBe(beforeDenied.documentCount);
    const same = await api(pageB, `${root}/documents/${copy.value.document.documentId}`);
    expect(same.status).toBe(200); expect(same.value.document).toMatchObject({ revision: 1, creatorUserId: personB });
    await privateControl({ action: 'beta-active', active: false });
    await refresh(pageB);
    await expect(pageB.getByRole('heading', { name: '접근 권한이 없습니다', exact: true })).toBeVisible();
    await expect(tree(pageB).locator('[data-original]')).toHaveCount(0);
    // Revocation retires the whole authenticated frame, including its tree.
    await expect(tree(pageB)).toHaveCount(0);
    const deniedScreen = await pageB.locator('#root').innerText();
    for (const original of originals) expect(deniedScreen).not.toContain(original.document.title);
    expect(deniedScreen).not.toContain(copyInput.title);
    await expect(pageB.locator('[data-native-entry="active"]')).toHaveCount(0);
    const after = await privateControl<RealStatus>({ action: 'status' });
    expect(after.databaseIdentity).toBe(status.databaseIdentity);
    await info.attach('real-creator-summary', { body: JSON.stringify({ products: [...products], distinctBrowserProcesses: true,
      samePrivateDatabase: true, apiAndDatabaseRestart: true, createdByA: 4, copiedByB: 1, unchangedNativeFiles: 4, viewerWriteDenied: true, viewerDatabaseUnchanged: true,
      revokedTreeCleared: true, authority: 'current tenant membership; creator is attribution only' }), contentType: 'application/json' });
  } finally {
    const restored = await Promise.allSettled([privateControl({ action: 'beta-active', active: true }),
      privateControl({ action: 'beta-role', role: 'viewer' })]);
    const closed = await Promise.allSettled(profiles.map(profile => stopPrivateProfile(profile.context, profile.pid)));
    rmSync(directory, { recursive: true, force: true });
    expect(restored.concat(closed).every(result => result.status === 'fulfilled'), 'Private test roles and browser processes must be restored').toBe(true);
  }
});
