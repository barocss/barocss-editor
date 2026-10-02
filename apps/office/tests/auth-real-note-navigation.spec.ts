import { readFileSync, statSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { privateControl, type Inspection, type RealStatus } from './helpers/real-recovery-control';

const origin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000, trace: 'off', video: 'off' });
test.skip(!process.env.OFFICE_AUTH_CONTROL_FILE || !process.env.OFFICE_AUTH_REAL_FILE,
  'Real navigation acceptance requires the private control descriptor and protected synthetic-account fixture.');
const title = 'Fictional grouped navigation';
const host = (page: Page) => page.locator('[data-server-note-workspace]');
const producer = () => {
  const text = (value: string) => ({ stype: 'inline-text', attributes: {}, content: [], text: value, marks: [{ stype: 'bold', range: [0, value.length] }] });
  return { stype: 'note', attributes: { pageId: 'ecb8ed22-71c2-4e8a-8a31-d07c5d53fcd2', title }, content: [
    { stype: 'heading', attributes: { level: 1 }, content: [text('Alpha heading')] },
    { stype: 'paragraph', attributes: {}, content: [text('First navigation phrase')] },
    { stype: 'heading', attributes: { level: 2 }, content: [text('Beta heading')] },
    { stype: 'paragraph', attributes: {}, content: [text('Second navigation phrase')] },
  ] };
};
async function login(page: Page, alias: string, url = origin) {
  await page.goto(url); await page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true }).click();
  const path = process.env.OFFICE_AUTH_REAL_FILE!; expect(statSync(path).mode & 0o077).toBe(0);
  const account = JSON.parse(readFileSync(path, 'utf8')).users[alias];
  await page.locator('#username').fill(account.username ?? alias); await page.locator('#password').fill(account.password); await page.locator('#kc-login').click();
  await expect.poll(async () => await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await host(page).isVisible()).toBe(true);
}
async function seed(page: Page) {
  const document = producer();
  await page.evaluate(({ document, title }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('barocss-note', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'name' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ name: document.attributes.pageId, title, text: JSON.stringify({ format: 'barocss-note', version: 1, document }), revision: 1, savedAt: 100 });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), { document, title });
}

test('real writer and viewer grouped Find and Outline preserve canonical data and retire on current denial', async ({ browser }, info) => {
  const a = await browser.newContext(), b = await browser.newContext();
  try {
    await privateControl<RealStatus>({ action: 'beta-active', active: true });
    const writer = await a.newPage(), viewer = await b.newPage(); let bearer = ''; let mutations = 0;
    for (const page of [writer, viewer]) page.on('request', request => {
      if (page === writer && request.headers().authorization) bearer = request.headers().authorization;
      if (/^\/api\/v1\/tenants\/[^/]+\/documents/.test(new URL(request.url()).pathname) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) mutations++;
    });
    await login(writer, 'alpha-editor'); await writer.getByRole('button', { name: /Synthetic Alpha/ }).click();
    await writer.getByRole('button', { name: 'Alpha workspace', exact: true }).click(); await writer.getByRole('button', { name: '새 Note 만들기', exact: true }).click();
    await expect(host(writer)).toBeVisible(); await seed(writer);
    await writer.getByRole('button', { name: '로컬 노트 사본 가져오기', exact: true }).click();
    await writer.getByRole('button', { name: '이 기기의 로컬 노트 목록 확인', exact: true }).click();
    await writer.getByRole('button', { name: `서버 사본 준비 ${title}`, exact: true }).click();
    await host(writer).getByRole('button', { name: '저장 확인·재시도', exact: true }).click();
    await expect(host(writer).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    const url = writer.url(), documentId = new URL(url).searchParams.get('document')!;
    const status = await privateControl<RealStatus>({ action: 'status' });
    const inspect = () => privateControl<Inspection>({ action: 'inspect', documentId });
    const initial = (await inspect()).document!;
    const api = async () => {
      const reply = await writer.request.get(`${origin}/api/v1/tenants/${status.tenantId}/documents/${documentId}`, { headers: { Authorization: bearer } });
      expect(reply.status()).toBe(200); return reply.json();
    };
    const canonical = await api(); expect(canonical.snapshotText).toBe(initial.snapshotText);
    const expected = producer(); expect(initial.pageId).toMatch(/^[0-9a-f-]{36}$/); expect(initial.pageId).not.toBe(expected.attributes.pageId); expected.attributes.pageId = initial.pageId!; expect(initial.canonicalTree).toEqual(expected);
    const heldMutations = mutations;
    const unchanged = async () => { expect((await inspect()).document).toEqual(initial); expect(await api()).toEqual(canonical); expect(mutations).toBe(heldMutations); };
    const menu = (page: Page) => host(page).getByRole('menubar', { name: '서버 노트 메뉴', exact: true }).getByRole('menuitem', { name: '서버 노트 메뉴', exact: true });
    const openMenu = async (page: Page) => { await menu(page).focus(); await menu(page).press('Enter'); await expect(page.getByRole('menu', { name: '서버 노트 메뉴', exact: true })).toBeVisible(); };
    const navigate = async (page: Page, role: 'writer' | 'viewer') => {
      await openMenu(page); await page.getByRole('menuitem', { name: '찾기', exact: true }).click();
      const panel = page.getByRole('region', { name: '문서 탐색', exact: true }), query = panel.getByRole('searchbox', { name: '본문에서 찾기', exact: true });
      await expect(query).toBeFocused(); await query.fill('navigation'); await expect(panel.getByRole('status')).toHaveText('1 / 2');
      await query.press('Enter'); await expect(panel.getByRole('status')).toHaveText('2 / 2');
      await expect(host(page).locator('[data-note-find-current]')).toHaveText('Second navigation phrase');
      await query.press('Shift+Enter'); await expect(panel.getByRole('status')).toHaveText('1 / 2');
      await query.press('Escape'); await expect(panel).toHaveCount(0); await unchanged();
      await openMenu(page); await page.keyboard.press('End'); await expect(page.getByRole('menuitem', { name: '목차', exact: true })).toBeFocused(); await page.keyboard.press('Enter');
      const outline = page.getByRole('navigation', { name: '본문 목차', exact: true });
      await expect(outline.getByRole('button')).toHaveText(['Alpha heading', 'Beta heading']);
      const heading = outline.getByRole('button', { name: 'Beta heading', exact: true }); await heading.click();
      await expect(heading).toHaveAttribute('aria-current', 'location'); await expect(host(page).locator('.on-doc h2')).toBeInViewport();
      await page.screenshot({ path: info.outputPath(`${role}-grouped-outline.png`) });
      await page.getByRole('button', { name: '문서 탐색 닫기', exact: true }).click(); await expect(outline).toHaveCount(0); await unchanged();
    };
    await navigate(writer, 'writer'); await expect(host(writer).getByRole('button', { name: '저장', exact: true })).toBeDisabled();
    await login(viewer, 'beta-viewer', url); await expect(host(viewer)).toBeVisible();
    await expect(host(viewer).locator('[data-note-editor]').first()).toHaveAttribute('data-note-editable', 'false');
    await navigate(viewer, 'viewer'); await expect(host(viewer).getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    await expect(viewer.locator('[data-note-formatting],[data-note-block-menu]')).toHaveCount(0);
    await openMenu(viewer); await viewer.getByRole('menuitem', { name: '찾기', exact: true }).click();
    await expect(viewer.getByRole('region', { name: '문서 탐색', exact: true })).toBeVisible();
    await privateControl<RealStatus>({ action: 'beta-active', active: false });
    await viewer.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(viewer.getByRole('heading', { name: '접근 권한이 없습니다', exact: true })).toBeVisible();
    await expect(viewer.locator('.office-auth-note-host')).toBeHidden(); await expect(viewer.locator('.office-auth-note-host')).toHaveAttribute('inert', '');
    await expect(viewer.getByRole('region', { name: '문서 탐색', exact: true })).toHaveCount(0); await unchanged();
    await viewer.reload(); await expect(viewer.getByRole('heading', { name: '접근 권한이 없습니다', exact: true })).toBeVisible(); await unchanged();
    await info.attach('canonical-navigation-proof.json', { body: JSON.stringify({ documentId, revision: initial.revision, snapshotHash: initial.snapshotHash, fullCanonicalUnchanged: true, navigationWrites: mutations - heldMutations }), contentType: 'application/json' });
  } finally { await a.close(); await b.close(); }
});
