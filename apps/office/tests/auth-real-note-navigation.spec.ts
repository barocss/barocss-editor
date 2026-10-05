import { parseWorkspaceRoute } from '../../../packages/office-workspace/src/routes';
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
function documentIdFromURL(url: string): string {
  const parsed = parseWorkspaceRoute(url);
  expect('error' in parsed).toBe(false);
  if ('error' in parsed || parsed.route?.kind !== 'item') throw new Error('Expected saved document route');
  expect(parsed.route.itemId).toMatch(/^[0-9a-f-]{36}$/i);
  return parsed.route.itemId;
}
async function openDocumentActions(page: Page) {
  await expect(page.locator('[data-server-note-workspace]')).toBeVisible();
  await expect(page.locator('.ow-file-navigation')).toBeVisible();
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  const panel = page.locator('[data-server-note-workspace] .nw-sidebar');
  if (await panel.isVisible()) return;
  const menu = page.locator('[data-server-note-workspace]').getByRole('menubar', { name: '문서 메뉴', exact: true });
  await menu.getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menu', { name: '문서 메뉴', exact: true }).getByRole('menuitemcheckbox', { name: '문서 작업', exact: true }).click();
  await expect(panel).toBeVisible();
}
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
    await writer.getByRole('button', { name: 'Alpha workspace', exact: true }).click();
    await writer.getByRole('button', { name: '파일 자료함', exact: true }).click();
    await writer.getByRole('button', { name: '새 Note 만들기', exact: true }).click();
    await expect(host(writer)).toBeVisible(); await expect(writer.locator('.ow-file-navigation')).toBeVisible();
    await expect(writer.locator('.ow-entry-status')).toHaveCount(0); await seed(writer); await openDocumentActions(writer);
    await writer.getByRole('button', { name: '로컬 노트 사본 가져오기', exact: true }).click();
    await writer.getByRole('button', { name: '이 기기의 로컬 노트 목록 확인', exact: true }).click();
    await writer.getByRole('button', { name: `서버 사본 준비 ${title}`, exact: true }).click();
    await host(writer).getByRole('button', { name: '저장 확인·재시도', exact: true }).click();
    await expect(host(writer).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    await expect.poll(() => { const parsed = parseWorkspaceRoute(writer.url()); return !('error' in parsed) && parsed.route?.kind === 'item'; }).toBe(true);
    const url = writer.url(), documentId = documentIdFromURL(url);
    const status = await privateControl<RealStatus>({ action: 'status' });
    const inspect = () => privateControl<Inspection>({ action: 'inspect', documentId });
    const initial = (await inspect()).document!;
    const api = async () => {
      const reply = await writer.request.get(`${origin}/api/v1/tenants/${status.tenantId}/documents/${documentId}`, { headers: { Authorization: bearer } });
      expect(reply.status()).toBe(200); return reply.json();
    };
    const canonical = await api(); expect(canonical.snapshotText).toBe(initial.snapshotText);
    const expected = producer(); expect(initial.pageId).toMatch(/^[0-9a-f-]{36}$/); expect(initial.pageId).not.toBe(expected.attributes.pageId); expected.attributes.pageId = initial.pageId!; expect(initial.canonicalTree).toEqual(expected);
    if (await writer.locator('[data-server-note-workspace] .nw-sidebar').isVisible()) {
      await host(writer).getByRole('menubar', { name: '문서 메뉴', exact: true }).getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
      const actions = writer.getByRole('menu', { name: '문서 메뉴', exact: true }).getByRole('menuitemcheckbox', { name: '문서 작업', exact: true });
      await expect(actions).toHaveAttribute('aria-checked', 'true'); await actions.click();
    }
    await expect(writer.locator('[data-server-note-workspace] .nw-sidebar')).toBeHidden();
    const heldMutations = mutations;
    const unchanged = async () => { expect((await inspect()).document).toEqual(initial); expect(await api()).toEqual(canonical); expect(mutations).toBe(heldMutations); };
    const openSearch = async (page: Page) => {
      const header = host(page).locator('.office-editor-header');
      await expect(page.locator('.ow-file-navigation')).toBeVisible();
      await expect(page.locator('.ow-entry-status')).toHaveCount(0);
      await expect(header).toHaveCount(1);
      const bounds = await header.boundingBox(); expect(bounds).not.toBeNull();
      expect(bounds!.height).toBe(48);
      const trigger = header.getByRole('button', { name: '명령 검색', exact: true });
      const hit = await trigger.boundingBox(); expect(hit).not.toBeNull();
      expect(hit!.height).toBeGreaterThanOrEqual(32); expect(hit!.width).toBeGreaterThanOrEqual(32);
      expect(hit!.y).toBeGreaterThanOrEqual(bounds!.y);
      expect(hit!.y + hit!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
      const point = { x: hit!.x + hit!.width / 2, y: hit!.y + hit!.height / 2 };
      expect(await trigger.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), point)).toBe(true);
      await page.mouse.click(point.x, point.y);
      const query = page.getByRole('combobox', { name: '명령 검색어', exact: true });
      await expect(query).toBeFocused(); return query;
    };
    const find = async (page: Page) => {
      const query = await openSearch(page); await query.fill('본문 찾기');
      await expect(page.getByRole('option').filter({ hasText: '본문 찾기' })).toHaveAttribute('aria-selected', 'true');
      await query.press('Enter');
    };
    const navigate = async (page: Page, role: 'writer' | 'viewer') => {
      await find(page);
      const panel = page.getByRole('region', { name: '문서 탐색', exact: true }), query = panel.getByRole('searchbox', { name: '본문에서 찾기', exact: true });
      await expect(query).toBeFocused(); await query.fill('navigation'); await expect(panel.getByRole('status')).toHaveText('1 / 2');
      await query.press('Enter'); await expect(panel.getByRole('status')).toHaveText('2 / 2');
      await expect(host(page).locator('[data-note-find-current]')).toHaveText('Second navigation phrase');
      await query.press('Shift+Enter'); await expect(panel.getByRole('status')).toHaveText('1 / 2');
      await query.press('Escape'); await expect(panel).toHaveCount(0); await unchanged();
      const commands = await openSearch(page); await commands.fill('문서');
      const findOption = page.getByRole('option').filter({ hasText: '본문 찾기' });
      const outlineOption = page.getByRole('option').filter({ hasText: '목차' });
      await commands.press('End'); await expect(outlineOption).toHaveAttribute('aria-selected', 'true');
      await expect(commands).toHaveAttribute('aria-activedescendant', (await outlineOption.getAttribute('id'))!);
      await commands.press('Home'); await expect(findOption).toHaveAttribute('aria-selected', 'true');
      await expect(commands).toHaveAttribute('aria-activedescendant', (await findOption.getAttribute('id'))!);
      await commands.press('ArrowDown'); await expect(outlineOption).toHaveAttribute('aria-selected', 'true');
      await commands.press('Enter');
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
    await find(viewer);
    await expect(viewer.getByRole('region', { name: '문서 탐색', exact: true })).toBeVisible();
    await privateControl<RealStatus>({ action: 'beta-active', active: false });
    await viewer.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(viewer.getByRole('heading', { name: '접근 권한이 없습니다', exact: true })).toBeVisible();
    await expect(viewer.locator('.office-auth-note-host')).toBeHidden(); await expect(viewer.locator('.office-auth-note-host')).toHaveAttribute('inert', '');
    await expect(viewer.getByRole('region', { name: '문서 탐색', exact: true })).toHaveCount(0); await unchanged();
    await viewer.reload(); await expect(viewer.getByRole('heading', { name: '접근 권한이 없습니다', exact: true })).toBeVisible(); await unchanged();
    await info.attach('canonical-navigation-proof.json', { body: JSON.stringify({ documentId, revision: initial.revision, snapshotHash: initial.snapshotHash, fullCanonicalUnchanged: true, navigationWrites: mutations - heldMutations }), contentType: 'application/json' });
  } finally {
    await a.close(); await b.close();
    // This test owns the temporary revocation; later serial cases retain the seeded viewer grant.
    await privateControl<RealStatus>({ action: 'beta-active', active: true });
  }
});
