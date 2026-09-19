import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const products = ['Note', 'Word', 'Slides', 'Site'] as const;
async function create(page: Page, product: typeof products[number], title: string) {
  await page.getByRole('button', { name: `${product[0]} ${product} 새 자료 만들기`, exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름' }).fill(title);
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await page.locator('.office-product-menu [data-menu]').click();
  await expect(page.getByRole('menuitem', { name: '자료함', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
}
async function home(page: Page) {
  await page.locator('.office-product-menu [data-menu]').click();
  await page.getByRole('menuitem', { name: '자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: '전체 자료', exact: true })).toBeVisible();
}
test('creates and reopens all four products in one origin without changing document identities', async ({ page }) => {
  await page.goto('/');
  const urls = new Map<string, string>();
  for (const product of products) {
    await create(page, product, `${product} 업무 자료`);
    urls.set(product, page.url());
    await home(page);
    await expect(page.locator('[data-document]')).toHaveCount(urls.size);
    await expect(page.getByRole('button', { name: `${product[0]} ${product} 업무 자료`, exact: true })).toBeVisible();
  }
  for (const product of products) {
    await page.getByRole('button', { name: `${product[0]} ${product} 업무 자료`, exact: true }).click();
    await expect(page).toHaveURL(urls.get(product)!);
    await home(page);
  }
});

test('search, rename, folder, favorite, trash and restore retain the original identity', async ({ page }) => {
  await page.goto('/'); await create(page, 'Word', '분기 실적 보고서'); const url = page.url(); await home(page);
  const row = page.locator('[data-document]').first(); const id = await row.getAttribute('data-document');
  await page.getByRole('textbox', { name: '자료 검색' }).fill('없는 검색어'); await expect(page.locator('[data-document]')).toHaveCount(0);
  await page.getByRole('textbox', { name: '자료 검색' }).fill('분기'); await expect(row).toBeVisible();
  await page.getByRole('button', { name: '분기 실적 보고서 관리', exact: true }).click();
  await page.getByRole('textbox', { name: '자료 이름', exact: true }).fill('분기 실적 확정');
  await page.getByRole('textbox', { name: '자료 폴더' }).fill('경영'); await page.getByRole('button', { name: '변경 저장' }).click();
  await expect(row).toHaveAttribute('data-document', id!);
  await page.getByRole('button', { name: '분기 실적 확정 즐겨찾기' }).click();
  await page.getByRole('button', { name: '분기 실적 확정 관리' }).click(); await page.getByRole('button', { name: '휴지통으로 이동' }).click();
  await expect(page.locator('[data-document]')).toHaveCount(0);
  await page.getByRole('button', { name: '휴지통', exact: true }).click(); await expect(row).toHaveAttribute('data-document', id!);
  await page.getByRole('button', { name: '분기 실적 확정 관리' }).click(); await page.getByRole('button', { name: '복원', exact: true }).click();
  await page.getByRole('button', { name: '즐겨찾기', exact: true }).click();
  await page.getByRole('button', { name: 'W 분기 실적 확정', exact: true }).click(); await expect(page).toHaveURL(url);
});

test('flushes the last Word keystroke before navigation, and blocks navigation on storage failure', async ({ page }) => {
  await page.goto('/'); await create(page, 'Word', '저장 경계');
  const editor = page.locator('.w-paragraph').last(); await editor.click(); await page.keyboard.type('FINAL INPUT');
  await home(page);
  await page.getByRole('textbox', { name: '자료 검색' }).fill('FINAL INPUT'); await expect(page.locator('[data-document]')).toHaveCount(1);
  await page.getByRole('button', { name: 'W 저장 경계', exact: true }).click();
  await expect(page.locator('.w-paragraph').last()).toContainText('FINAL INPUT');
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; (window as any).__restorePut = () => IDBObjectStore.prototype.put = original; IDBObjectStore.prototype.put = function(...args) { if (this.transaction.db.name === 'barocss-word') throw new DOMException('Full', 'QuotaExceededError'); return original.apply(this, args as any); }; });
  await page.locator('.w-paragraph').last().click(); await page.keyboard.press('End'); await page.keyboard.type(' PENDING');
  await page.locator('.office-product-menu [data-menu]').click();
  await page.getByRole('menuitem', { name: '자료함', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Wonffice 작업 공간' })).toContainText('마지막 입력을 저장하지 못했습니다');
  await expect(page.locator('.w-paragraph').last()).toContainText('PENDING');
  await page.evaluate(() => (window as any).__restorePut()); await home(page);
});

test('backup restores independent copies with remapped references and preserves originals', async ({ page }) => {
  await page.goto('/');
  await create(page, 'Note', '회의록'); await home(page);
  await create(page, 'Slides', '발표 자료'); await home(page);
  // Exercise the public workspace API for byte-level assertions, alongside the real UI paths above.
  const result = await page.evaluate(async () => {
    const { OfficeWorkspace, workspaceIdentity } = await import('/@fs/Users/user/github/barocss/barocss-editor/packages/office-workspace/src/index.ts');
    const workspace = new OfficeWorkspace(workspaceIdentity()); const before = await workspace.list();
    await workspace.link(before[0].key, before[1].key);
    const backup = await workspace.backup(); const originals = backup.documents.map((d: any) => d.text);
    const count = await workspace.restore(backup); const after = await workspace.list();
    const source = after.find((d: any) => d.copiedFrom === before[0].key)!;
    const target = after.find((d: any) => d.copiedFrom === before[1].key)!;
    const preserved = await Promise.all(backup.documents.map(async (d: any, i: number) => (await workspace.require(d.product, d.row.name)).text === originals[i]));
    return { count, length: after.length, links: source.references, target: target.key, preserved };
  });
  expect(result.count).toBe(2); expect(result.length).toBe(4); expect(result.links).toEqual([result.target]); expect(result.preserved).toEqual([true, true]);
});

test('links Word and Slides through the editor shell and warns when the original is trashed', async ({ page }) => {
  await page.goto('/'); await create(page, 'Slides', '주간 발표'); await home(page);
  await create(page, 'Word', '주간 보고');
  await page.locator('.office-product-menu [data-menu]').click();
  await page.getByRole('menuitem', { name: '연결한 자료', exact: true }).click();
  await page.getByRole('button', { name: '원본 자료', exact: true }).click();
  await page.getByRole('combobox', { name: '원본 자료 검색' }).fill('주간');
  await page.getByRole('option', { name: '주간 발표 Slides', exact: true }).click();
  await page.getByRole('button', { name: '원본 참조 추가' }).click();
  await page.getByRole('button', { name: '주간 발표 · Slides', exact: true }).click();
  await expect(page).toHaveURL(/products\/slides/); await home(page);
  await page.getByRole('button', { name: '주간 발표 관리' }).click(); await page.getByRole('button', { name: '휴지통으로 이동' }).click();
  await page.getByRole('button', { name: 'W 주간 보고', exact: true }).click();
  await page.locator('.office-product-menu [data-menu]').click();
  await page.getByRole('menuitem', { name: '연결한 자료', exact: true }).click();
  await expect(page.getByRole('button', { name: '주간 발표 · Slides · 사용할 수 없음' })).toBeDisabled();
});

test('copies Note prose into a Site body and preserves the source after native-file migration', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { OfficeWorkspace, workspaceIdentity } = await import('/@fs/Users/user/github/barocss/barocss-editor/packages/office-workspace/src/index.ts');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    const file = JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: '이전 회의록' }, content: [{ stype: 'heading', attributes: { level: 2 }, content: [{ stype: 'inline-text', text: '제품 계획' }] }, { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Note 본문을 Site에서도 편집합니다.' }] }] } });
    await workspace.importFile(file); const note = (await workspace.list())[0]; const before = await workspace.require('note', note.id);
    const site = await workspace.noteToSite(note.id); const after = await workspace.require('note', note.id);
    return { site, workspace: workspace.id, same: before.text === after.text };
  });
  expect(result.same).toBe(true);
  await page.goto(`/products/site/index.html?workspace=${result.workspace}#site=${result.site}`);
  await page.locator('[data-admin-open]').first().click();
  await expect(page.locator('[data-frame="desktop"]')).toContainText('제품 계획');
  await expect(page.locator('[data-frame="desktop"]')).toContainText('Note 본문을 Site에서도 편집합니다.');
});

test('does not open a trashed document by URL and refuses an invalid restore without changing existing files', async ({ page }) => {
  await page.goto('/'); await create(page, 'Note', '보존할 노트'); const url = page.url(); await home(page);
  await page.getByRole('button', { name: '보존할 노트 관리' }).click(); await page.getByRole('button', { name: '휴지통으로 이동' }).click();
  await expect(page.locator('[data-document]')).toHaveCount(0);
  await page.goto(url); await expect(page.getByRole('alert')).toContainText('휴지통에 있는 자료');
  await page.getByRole('button', { name: '자료함으로 돌아가기' }).click();
  const result = await page.evaluate(async () => {
    const { OfficeWorkspace, workspaceIdentity } = await import('/@fs/Users/user/github/barocss/barocss-editor/packages/office-workspace/src/index.ts');
    const workspace = new OfficeWorkspace(workspaceIdentity()); const before = await workspace.backup();
    const backup = structuredClone(before); backup.documents.push({ ...backup.documents[0], row: { name: 'invalid' }, text: '{"format":"barocss-note","version":1,"document":{"stype":"invalid"}}' });
    let rejected = false; try { await workspace.restore(backup); } catch { rejected = true; }
    return { rejected, same: JSON.stringify((await workspace.backup()).documents) === JSON.stringify(before.documents) };
  });
  expect(result).toEqual({ rejected: true, same: true });
});

test('flushes delayed Note input before switching products', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => original(handler, delay === 150 || delay === 350 ? 60_000 : delay, ...args)) as typeof window.setTimeout;
  });
  await page.goto('/'); await create(page, 'Note', '마지막 노트 입력');
  await page.locator('[contenteditable="true"]').click(); await page.keyboard.type('NOTE LAST INPUT');
  await home(page); await page.getByRole('textbox', { name: '자료 검색' }).fill('NOTE LAST INPUT');
  await expect(page.locator('[data-document]')).toHaveCount(1);
  await page.getByRole('button', { name: 'N 마지막 노트 입력', exact: true }).click();
  await expect(page.locator('[contenteditable="true"]')).toContainText('NOTE LAST INPUT');
});

test('exports a legacy product library with its conflict draft and imports both as copies', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { OfficeWorkspace, workspaceIdentity, productStore } = await import('/@fs/Users/user/github/barocss/barocss-editor/packages/office-workspace/src/index.ts');
    const { documentLibrary, productLibraryArchive } = await import('/@fs/Users/user/github/barocss/barocss-editor/packages/shared/src/index.ts');
    const workspace = new OfficeWorkspace(workspaceIdentity()); const id = await workspace.create('word', '이전 보관함 원본');
    const source = await workspace.require('word', id); const drafts = documentLibrary({ db: 'barocss-word-recovery', store: 'drafts' });
    await drafts.keep({ name: 'draft-one', title: '충돌한 작업', metadata: { originalId: id } }, source.text);
    const archive = await productLibraryArchive('word', productStore('word'), drafts);
    const count = await workspace.importFile(JSON.stringify(archive));
    return { count, total: (await workspace.list()).length, unchanged: (await workspace.require('word', id)).text === source.text, draftKept: !!await drafts.read('draft-one') };
  });
  expect(result).toEqual({ count: 2, total: 3, unchanged: true, draftKept: true });
});

test('downloads a product backup and restores it through the shared library UI', async ({ page }) => {
  await page.goto('/'); await create(page, 'Word', '백업 화면 검증');
  await page.getByRole('button', { name: '문서 보관함', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '보관함 전체 백업', exact: true }).click();
  const file = await downloadEvent; const bytes = await readFile((await file.path())!);
  expect(JSON.parse(bytes.toString()).format).toBe('wonffice-product-library');
  await page.keyboard.press('Escape'); await home(page);
  await page.getByRole('button', { name: '백업 및 가져오기' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'word-library.json', mimeType: 'application/json', buffer: bytes });
  await page.getByRole('button', { name: '새 사본으로 복원' }).click();
  await expect(page.locator('[data-document]')).toHaveCount(2);
  await expect(page.getByRole('status')).toContainText('1개 자료를 새 사본으로 복원');
  await expect(page.getByRole('button', { name: 'W 백업 화면 검증', exact: true })).toBeVisible();
});

test('editing a deck preserves the name assigned in the shared library', async ({ page }) => {
  await page.goto('/'); await create(page, 'Slides', '이름을 유지할 발표 자료'); const url = page.url();
  await page.getByLabel('새 슬라이드', { exact: true }).click(); await home(page);
  await page.getByRole('button', { name: 'S 이름을 유지할 발표 자료', exact: true }).click();
  await expect(page).toHaveURL(url);
  await expect(page.locator('.sl-filmstrip button[data-slide]')).toHaveCount(2);
});
