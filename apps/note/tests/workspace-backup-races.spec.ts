import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const entry = (id: string, title: string, body = '본문') => ({
  id, title, savedAt: 100,
  text: JSON.stringify({ format: 'barocss-note', version: 1, document: {
    stype: 'note', attributes: { pageId: id, title },
    content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: body }] }],
  } }),
  metadata: { version: 1, parentId: null, favorite: false, trashedAt: null, createdAt: 100 } as Record<string, unknown>,
});

async function seed(page: Page, pages: ReturnType<typeof entry>[], drafts: ReturnType<typeof entry>[] = []) {
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.evaluate(async ({ pages, drafts }) => {
    for (const [name, store, entries] of [['barocss-note', 'documents', pages], ['barocss-note-recovery', 'drafts', drafts]] as const) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(store, { keyPath: 'name' });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction(store, 'readwrite'), table = tx.objectStore(store);
          table.clear();
          for (const { id, ...value } of entries) table.put({ ...value, name: id, revision: 1 });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onabort = () => reject(tx.error);
        };
      });
    }
    history.replaceState(null, '', `/#${encodeURIComponent(pages[0].id)}`);
  }, { pages, drafts });
  await page.reload();
  await expect(page.getByLabel('노트 제목')).toHaveValue(pages[0].title);
}

async function rows(page: Page, dbName = 'barocss-note', storeName = 'documents') {
  return page.evaluate(({ dbName, storeName }) => new Promise<{ name: string; title: string; text: string }[]>((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(storeName), all = tx.objectStore(storeName).getAll();
      tx.oncomplete = () => { db.close(); resolve(all.result); };
      tx.onabort = () => reject(tx.error);
    };
  }), { dbName, storeName });
}

/** Hold delivery of the next completed page snapshot, without retaining an IDB lock.
 * Another tab can finish its real writes while backup still holds the earlier page snapshot. */
async function holdPageSnapshot(page: Page) {
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, options) {
      const tx = transaction.call(this, stores, mode, options);
      if (this.name !== 'barocss-note' || mode !== 'readonly' || !tx.objectStoreNames.contains('documents')) return tx;
      IDBDatabase.prototype.transaction = transaction;
      Object.defineProperty(tx, 'oncomplete', {
        configurable: true,
        set(handler: (event: Event) => void) {
          tx.addEventListener('complete', event => {
            (window as any).__backupSnapshotHeld = true;
            (window as any).__releaseBackupSnapshot = () => handler.call(tx, event);
          }, { once: true });
        },
      });
      return tx;
    };
  });
}

async function startHeldBackup(page: Page) {
  await page.getByRole('button', { name: '보관함 백업 및 복원', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '보관함 백업 및 복원', exact: true });
  await holdPageSnapshot(page);
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '백업 다운로드', exact: true }).click();
  await page.waitForFunction(() => (window as any).__backupSnapshotHeld === true);
  return { dialog, download };
}

test('백업 중 뒤로 가기는 완료 후 재개되고 이전 방문 기록을 덮어쓰지 않는다', async ({ page }) => {
  await seed(page, [entry('history-a', '페이지 A'), entry('history-b', '페이지 B'), entry('history-c', '페이지 C')]);
  const navigation = page.getByRole('navigation', { name: '노트 목록' });
  for (const title of ['페이지 B', '페이지 C']) {
    await navigation.getByRole('button', { name: title, exact: true }).click();
    await expect(page.getByLabel('노트 제목')).toHaveValue(title);
  }
  const { dialog, download } = await startHeldBackup(page);
  await page.goBack();
  await expect(page).toHaveURL(/#history-b$/);
  await expect(page.getByLabel('노트 제목')).toHaveValue('페이지 C');
  await page.evaluate(() => (window as any).__releaseBackupSnapshot());
  await download;
  await expect(page.getByLabel('노트 제목')).toHaveValue('페이지 B');
  await dialog.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.goBack();
  await expect(page).toHaveURL(/#history-a$/);
  await expect(page.getByLabel('노트 제목')).toHaveValue('페이지 A');
});

test('백업 도중 다른 창이 초안을 새 페이지로 복구해도 초안 내용이 백업에서 사라지지 않는다', async ({ page }) => {
  const original = entry('original-page', '최신 원본');
  const draft = { ...entry('original-page', '다른 창 초안', 'DRAFT-TRANSFER-CONTENT'), id: 'held-draft', metadata: { originalId: original.id, page: original.metadata } };
  await seed(page, [original], [draft]);
  await expect(page.locator('[data-recovery-draft="held-draft"]')).toBeVisible();
  const other = await page.context().newPage();
  try {
    await other.goto('/#original-page');
    const recovery = other.locator('[data-recovery-draft="held-draft"]');
    await expect(recovery).toBeVisible();
    const { download } = await startHeldBackup(page);
    await recovery.getByRole('button', { name: '내 초안을 새 페이지로 저장', exact: true }).click();
    await expect(other.getByLabel('노트 제목')).toHaveValue('다른 창 초안 (복구한 초안)');
    await expect(recovery).toHaveCount(0);
    expect(await rows(other, 'barocss-note-recovery', 'drafts')).toHaveLength(0);
    const current = await rows(other);
    expect(current.find(row => row.name === original.id)?.text).toBe(original.text);
    expect(current.find(row => row.name !== original.id)?.text).toContain('DRAFT-TRANSFER-CONTENT');
    await page.evaluate(() => (window as any).__releaseBackupSnapshot());
    const file = await download;
    const saved = JSON.parse(await readFile((await file.path())!, 'utf8'));
    // Pages were captured before the transfer; recovery-first must retain the original draft bytes.
    expect(saved.pages).toHaveLength(1);
    expect(saved.pages[0].text).toBe(original.text);
    expect(saved.drafts).toHaveLength(1);
    expect(saved.drafts[0]).toMatchObject({ id: 'held-draft', text: draft.text });
  } finally { await other.close(); }
});
