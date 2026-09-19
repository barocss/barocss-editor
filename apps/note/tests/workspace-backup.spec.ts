import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

const paragraph = (text: string, target?: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }, ...(target ? [{ stype: 'pageReference', attributes: { pageId: target, title: '연결된 페이지' } }] : [])] });
const entry = (id: string, title: string, content = [paragraph('본문')], metadata: Record<string, unknown> = {}) => ({ id, title, text: JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { pageId: id, title }, content } }), savedAt: 100, metadata: { version: 1, parentId: null, favorite: false, trashedAt: null, createdAt: 100, ...metadata } });
const archive = (pages: ReturnType<typeof entry>[], drafts: ReturnType<typeof entry>[] = []) => ({ format: 'barocss-note-workspace', version: 1, createdAt: '2026-09-07T00:00:00.000Z', pages, drafts });
async function rows(page: Page, dbName = 'barocss-note', storeName = 'documents') {
  return page.evaluate(async ({ dbName, storeName }) => new Promise<any[]>((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result, tx = db.transaction(storeName), all = tx.objectStore(storeName).getAll(); tx.oncomplete = () => { db.close(); resolve(all.result); }; };
  }), { dbName, storeName });
}
async function seed(page: Page, pages: ReturnType<typeof entry>[], drafts: ReturnType<typeof entry>[] = []) {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.evaluate(async ({ pages, drafts }) => {
    for (const [name, store, entries] of [['barocss-note', 'documents', pages], ['barocss-note-recovery', 'drafts', drafts]] as const) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(store, { keyPath: 'name' });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction(store, 'readwrite'), objectStore = tx.objectStore(store);
          objectStore.clear();
          for (const { id, ...value } of entries) objectStore.put({ ...value, name: id, revision: 1 });
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
        };
      });
    }
  }, { pages, drafts });
  await page.reload(); await expect(page.getByLabel('노트 제목')).toBeVisible();
}
async function preview(page: Page, value: ReturnType<typeof archive>) {
  await page.getByRole('button', { name: '보관함 백업 및 복원', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '보관함 백업 및 복원', exact: true });
  await dialog.getByLabel('보관함 백업 파일', { exact: true }).setInputFiles({ name: 'workspace.note-workspace.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await expect(dialog.getByLabel('복원 미리보기', { exact: true })).toBeVisible();
  return dialog;
}

test('전체 백업과 사본 복원은 계층·참조·휴지통·원본·초안을 보존한다', async ({ page, browser }, info) => {
  const source = [entry('backup-alpha', '루트', [paragraph('자기 참조 ', 'backup-alpha')]), entry('backup-beta', '하위', [paragraph('부모 참조 ', 'backup-alpha')], { parentId: 'backup-alpha', favorite: true }), entry('backup-trash', '보관된 삭제', undefined, { trashedAt: 100 }), { ...entry('backup-opaque', '열 수 없는 원본'), text: '{future-format: raw bytes}' }];
  const draft = entry('backup-draft', '수정한 루트', [paragraph('초안 자기 참조 ', 'backup-alpha')], { originalId: 'backup-alpha', page: source[0].metadata });
  await seed(page, source, [draft]);
  await page.getByRole('button', { name: '보관함 백업 및 복원', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '보관함 백업 및 복원', exact: true });
  const event = page.waitForEvent('download'); await dialog.getByRole('button', { name: '백업 다운로드', exact: true }).click();
  const bytes = await readFile((await (await event).path())!, 'utf8'), saved = JSON.parse(bytes);
  expect(saved.pages).toHaveLength(4); expect(saved.drafts).toHaveLength(1);
  expect(saved.pages.find((value: any) => value.id === 'backup-opaque').text).toBe(source[3].text);
  await dialog.getByRole('button', { name: '닫기', exact: true }).last().click();
  const original = await rows(page), restore = await preview(page, saved);
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = (await restore.boundingBox())!; expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390); expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: info.outputPath('backup-mobile.png') });
  await restore.getByRole('button', { name: '보관함에 복원', exact: true }).click(); await expect(restore.getByRole('status')).toHaveText('5개 페이지를 복원했습니다.');
  const after = await rows(page); expect(after).toHaveLength(9);
  for (const held of original) expect(after.find(value => value.name === held.name)).toEqual(held);
  const added = after.filter(value => !original.some(held => held.name === value.name));
  const root = added.find(value => value.title === '루트'), child = added.find(value => value.title === '하위'), heldDraft = added.find(value => value.title.includes('백업에서 복구한 초안'));
  expect(child.metadata).toMatchObject({ parentId: root.name, favorite: true });
  expect(JSON.parse(root.text).document.content[0].content[1].attributes.pageId).toBe(root.name);
  expect(JSON.parse(child.text).document.content[0].content[1].attributes.pageId).toBe(root.name);
  expect(JSON.parse(heldDraft.text).document.content[0].content[1].attributes.pageId).toBe(heldDraft.name);
  expect(added.find(value => value.title === '보관된 삭제').metadata.trashedAt).toBe(100);
  expect(added.find(value => value.title === '열 수 없는 원본').text).toBe(source[3].text);
  await restore.getByRole('button', { name: '닫기', exact: true }).last().click(); await page.reload();
  await expect(page.locator('[data-unreadable-note]')).toHaveCount(2);
  // Restore the same portable file in a different browser storage partition.
  const fresh = await browser.newContext({ baseURL: 'http://localhost:5183' });
  try {
    const other = await fresh.newPage(); await other.goto('/'); await expect(other.getByLabel('노트 제목')).toBeVisible();
    const target = await preview(other, saved); await target.getByRole('button', { name: '보관함에 복원', exact: true }).click();
    await expect(target.getByRole('status')).toHaveText('5개 페이지를 복원했습니다.');
    const transferred = await rows(other); expect(transferred.find(value => value.name === 'backup-beta').metadata.parentId).toBe('backup-alpha');
    await target.getByRole('button', { name: '닫기', exact: true }).last().click(); await other.reload(); await expect(other.getByLabel('노트 제목')).toHaveValue('루트');
  } finally { await fresh.close(); }
});

test('미리보기 후 다른 창의 ID 생성은 전체 복원을 멈추고 새 사본 미리보기를 제공한다', async ({ page }) => {
  await seed(page, [entry('existing', '기존')]);
  const value = archive([entry('incoming-root', '복원 루트'), entry('incoming-child', '복원 하위', [paragraph('부모 ', 'incoming-root')], { parentId: 'incoming-root' })]);
  const dialog = await preview(page, value);
  const other = await page.context().newPage();
  try {
    await other.goto('/'); await expect(other.getByLabel('노트 제목')).toBeVisible();
    await other.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'new.note.json', mimeType: 'application/json', buffer: Buffer.from(entry('incoming-root', '다른 창 원본').text) });
    await expect(other.getByLabel('노트 제목')).toHaveValue('다른 창 원본'); await expect(other.locator('[data-save-status]')).toHaveText('저장됨');
    const original = (await rows(page)).find(row => row.name === 'incoming-root');
    await dialog.getByRole('button', { name: '보관함에 복원', exact: true }).click(); await expect(dialog.getByRole('status')).toContainText('보관함이 변경되어');
    expect((await rows(page)).some(row => row.name === 'incoming-child')).toBe(false);
    await dialog.getByRole('button', { name: '보관함에 복원', exact: true }).click(); await expect(dialog.getByRole('status')).toHaveText('2개 페이지를 복원했습니다.');
    const current = await rows(page); expect(current.find(row => row.name === 'incoming-root')).toEqual(original);
    expect(current.find(row => row.name === 'incoming-child').metadata.parentId).toBe(current.find(row => row.title === '복원 루트').name);
  } finally { await other.close(); }
});

test('중간 저장 실패는 전체 취소되며 미리보기에서 재시도할 수 있다', async ({ page }) => {
  await seed(page, [entry('existing', '기존')]);
  const original = await rows(page), dialog = await preview(page, archive([entry('restore-one', '첫 페이지'), entry('restore-two', '둘째 페이지')]));
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    (window as any).restorePut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function (value, key) { if (value.name === 'restore-two') throw new DOMException('저장 공간이 부족합니다.', 'QuotaExceededError'); return put.call(this, value, key); };
  });
  await dialog.getByRole('button', { name: '보관함에 복원', exact: true }).click(); await expect(dialog.getByRole('alert')).toBeVisible(); expect(await rows(page)).toEqual(original);
  await expect(dialog.getByLabel('복원 미리보기')).toBeVisible(); await page.evaluate(() => (window as any).restorePut());
  await dialog.getByRole('button', { name: '보관함에 복원', exact: true }).click(); await expect(dialog.getByRole('status')).toHaveText('2개 페이지를 복원했습니다.'); expect(await rows(page)).toHaveLength(3);
});

test('미리보기 취소와 잘못된 파일은 보관함을 변경하지 않는다', async ({ page }) => {
  await seed(page, [entry('existing', '기존')]); const original = await rows(page);
  const dialog = await preview(page, archive([entry('unused', '미리보기만')]));
  await dialog.getByRole('button', { name: '닫기', exact: true }).last().click(); expect(await rows(page)).toEqual(original);
  await page.getByRole('button', { name: '보관함 백업 및 복원', exact: true }).click();
  await dialog.getByLabel('보관함 백업 파일', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(dialog.getByRole('alert')).toContainText('지원하는 Note 보관함 백업 파일이 아닙니다.'); await expect(dialog.getByLabel('복원 미리보기')).toHaveCount(0); expect(await rows(page)).toEqual(original);
});

test('전체 백업은 아직 지연 중인 중첩 항목 본문까지 반영하고 편집을 계속할 수 있다', async ({ page }) => {
  await page.addInitScript(() => {
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => schedule(handler, delay === 150 ? 60_000 : delay, ...args)) as typeof window.setTimeout;
  });
  const db = (source: string) => ({ stype: 'noteDatabase', attributes: { source } });
  const dataset = (name: string, id: string, title: string) => ({ stype: 'dataset', attributes: { name, fields: [{ name: '이름', kind: 'text' }], records: [{ 이름: title }], rowIds: [id] } });
  const document = { stype: 'note', attributes: { pageId: 'nested-backup', title: '중첩 백업' }, content: [db('outer'), { stype: 'resources', content: [dataset('outer', 'outer-item', '상위 작업'), { stype: 'richText', attributes: { id: 'outer-item' }, content: [db('inner'), { stype: 'resources', content: [dataset('inner', 'inner-item', '하위 작업'), { stype: 'richText', attributes: { id: 'inner-item' }, content: [paragraph('세부 내용 ')] }] }] }] }] };
  await seed(page, [{ ...entry('nested-backup', '중첩 백업'), text: JSON.stringify({ format: 'barocss-note', version: 1, document }) }]);
  await page.locator('.nw-document').getByRole('button', { name: '행 1 열기', exact: true }).click();
  await page.locator('[data-db-item-body]').last().getByRole('button', { name: '행 1 열기', exact: true }).click();
  const last = page.locator('[data-db-item-body] .on-doc > p').last(); await last.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' 백업 직전 마지막 입력');
  await expect(last).toContainText('백업 직전 마지막 입력'); expect((await rows(page))[0].text).not.toContain('백업 직전 마지막 입력');
  await page.getByRole('button', { name: '보관함 백업 및 복원', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '보관함 백업 및 복원', exact: true });
  const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: '백업 다운로드', exact: true }).click();
  const saved = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(saved.pages[0].text).toContain('백업 직전 마지막 입력');
  await dialog.getByRole('button', { name: '닫기', exact: true }).last().click();
  await last.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' 계속 편집');
  await page.getByRole('dialog', { name: '데이터베이스 항목', exact: true }).last().getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('dialog', { name: '데이터베이스 항목', exact: true }).last().getByRole('button', { name: '닫기', exact: true }).click();
  const exported = page.waitForEvent('download'); await page.getByRole('button', { name: '내보내기', exact: true }).click();
  await page.getByRole('button', { name: '파일 내려받기', exact: true }).click();
  expect(await readFile((await (await exported).path())!, 'utf8')).toContain('계속 편집');
});
