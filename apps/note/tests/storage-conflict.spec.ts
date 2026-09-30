import { test, expect, type Page } from '@playwright/test';
import type { LibraryRow } from '@barocss/shared';
type KeptNote = LibraryRow & { text: string };
type RecoveryProbe = { unblock: () => void; count: () => number };
declare global {
  interface Window {
    restoreStorage: () => void;
    restoreDocumentStorage: () => void;
    recoveryProbe: RecoveryProbe;
    recoveryReadProbe: RecoveryProbe;
    lateRecoveryProbe: RecoveryProbe & { fail: () => void };
  }
}
const doc = { format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: '공동 문서', pageId: 'shared-page' }, content: [
  { stype: 'paragraph', content: [{ stype: 'inline-text', text: '시작' }, { stype: 'pageReference', attributes: { pageId: 'shared-page', title: '공동 문서' } }] }
] } };
async function stored(page: Page, id = 'shared-page') {
  return page.evaluate(async id => {
    return new Promise<KeptNote>((resolve, reject) => {
      const open = indexedDB.open('barocss-note');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('documents');
        const read = tx.objectStore('documents').get(id);
        tx.oncomplete = () => { db.close(); resolve(read.result); };
      };
    });
  }, id);
}
async function recoveryRows(page: Page) {
  return page.evaluate(async () => new Promise<KeptNote[]>((resolve, reject) => {
    const open = indexedDB.open('barocss-note-recovery');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('drafts'), read = tx.objectStore('drafts').getAll();
      tx.oncomplete = () => { db.close(); resolve(read.result); };
      tx.onabort = () => reject(tx.error);
    };
  }));
}
async function pair(page: Page) {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일').setInputFiles({ name: 'shared.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('공동 문서');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  const other = await page.context().newPage();
  await other.goto('/#shared-page'); await expect(other.getByLabel('노트 제목')).toHaveValue('공동 문서');
  return other;
}
async function typeAtStart(page: Page, text: string) {
  const run = page.locator('.on-doc > p [data-bc-sid]').first();
  await run.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home');
  await page.keyboard.insertText(text);
}

test('두 창의 저장 충돌은 최신본을 유지하고 내 초안을 새로고침 후 새 페이지로 복구한다', async ({ page }) => {
  const other = await pair(page);
  try {
    await page.getByLabel('노트 제목').fill('다른 창의 최신본');
    await typeAtStart(page, '최신 본문 ');
    await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
    const latest = await stored(page);
    await other.getByLabel('노트 제목').fill('내 편집');
    await typeAtStart(other, '복구할 본문 ');
    await expect(other.locator('[data-save-status]')).toHaveText('충돌한 초안 보관됨');
    await expect(other.locator('[data-note-conflict]')).toBeVisible();
    expect((await stored(page)).text).toBe(latest.text);
    await other.reload();
    await expect(other.getByLabel('노트 제목')).toHaveValue('다른 창의 최신본');
    const recovery = other.locator('[data-note-recovery]');
    await expect(recovery).toContainText('내 편집');
    await recovery.getByRole('button', { name: '내 초안을 새 페이지로 저장' }).click();
    await expect(other.getByLabel('노트 제목')).toHaveValue('내 편집 (복구한 초안)');
    await expect(other.locator('.on-doc')).toContainText('복구할 본문');
    const newId = new URL(other.url()).hash.slice(1);
    expect(newId).not.toBe('shared-page');
    await expect(other.locator('[data-note-page-reference]')).toHaveAttribute('data-page-id', newId);
    expect((await stored(page)).text).toBe(latest.text);
    await expect(other.locator('[data-note-recovery]')).toHaveCount(0);
    await other.reload();
    await expect(other.getByLabel('노트 제목')).toHaveValue('내 편집 (복구한 초안)');
    await expect(other.locator('.on-doc')).toContainText('복구할 본문');
  } finally { await other.close(); }
});

test('충돌 후 최신본 열기는 내 초안을 남기고 새 revision으로 편집을 계속한다', async ({ page }) => {
  const other = await pair(page);
  try {
    await page.getByLabel('노트 제목').fill('최신 제목');
    await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
    await other.getByLabel('노트 제목').fill('이전 창의 초안');
    await expect(other.locator('[data-save-status]')).toHaveText('충돌한 초안 보관됨');
    await other.locator('[data-note-conflict]').getByRole('button', { name: '최신본 열기' }).click();
    await expect(other.getByLabel('노트 제목')).toHaveValue('최신 제목');
    await expect(other.locator('[data-note-conflict]')).toHaveCount(0);
    await expect(other.locator('[data-note-recovery]')).toContainText('이전 창의 초안');
    await other.getByLabel('노트 제목').fill('최신본에서 계속');
    await typeAtStart(other, '최신본에 이어 쓰기 ');
    await expect(other.locator('[data-save-status]')).toHaveText('저장됨');
    const continued = (await stored(other)).text;
    expect(JSON.parse(continued).document.attributes.title).toBe('최신본에서 계속');
    expect(continued).toContain('최신본에 이어 쓰기');
    await expect(other.locator('[data-note-recovery]')).toContainText('이전 창의 초안');
  } finally { await other.close(); }
});


test('복구 저장이 실패하면 원본을 보호하고 저장 완료를 표시하지 않으며 재시도로 초안을 보관한다', async ({ page }) => {
  const other = await pair(page);
  try {
    await page.getByLabel('노트 제목').fill('변경된 원본');
    await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
    const latest = await stored(page);
    await other.evaluate(() => {
      const original = IDBFactory.prototype.open;
      window.restoreStorage = () => { IDBFactory.prototype.open = original; };
      IDBFactory.prototype.open = function (name, version) {
        if (name === 'barocss-note-recovery') throw new DOMException('Storage full', 'QuotaExceededError');
        return original.call(this, name, version);
      };
    });
    await other.getByLabel('노트 제목').fill('보관 실패한 내 초안');
    await expect(other.getByRole('alert').filter({ hasText: '내 초안을 보관하지 못했습니다' })).toBeVisible();
    await expect(other.locator('[data-save-status]')).toHaveText('확인이 필요합니다');
    await expect(other.locator('[data-note-conflict]').getByRole('button', { name: '최신본 열기' })).toBeDisabled();
    expect((await stored(page)).text).toBe(latest.text);
    await other.evaluate(() => window.restoreStorage());
    await other.getByRole('button', { name: '다시 시도' }).click();
    await expect(other.locator('[data-save-status]')).toHaveText('충돌한 초안 보관됨');
    await other.reload();
    await expect(other.getByLabel('노트 제목')).toHaveValue('변경된 원본');
    await expect(other.locator('[data-note-recovery]')).toContainText('보관 실패한 내 초안');
  } finally { await other.close(); }
});

test('복구 목록 읽기 실패 뒤 다시 시도는 목록을 다시 읽고 초안을 표시한다', async ({ page }) => {
  const other = await pair(page);
  try {
    await page.getByLabel('노트 제목').fill('복구 목록 원본');
    await typeAtStart(page, '목록 원본 본문 ');
    await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
    const original = await stored(page);
    await other.getByLabel('노트 제목').fill('복구할 초안');
    await typeAtStart(other, '목록 초안 본문 ');
    await expect(other.locator('[data-save-status]')).toHaveText('충돌한 초안 보관됨');
    const draft = (await recoveryRows(page))[0];
    expect(draft.title).toBe('복구할 초안');
    await other.addInitScript(() => {
      const open = IDBFactory.prototype.open;
      let blocked = true, count = 0;
      window.recoveryProbe = { unblock: () => { blocked = false; }, count: () => count };
      IDBFactory.prototype.open = function (name, version) {
        if (name === 'barocss-note-recovery') {
          count++;
          if (blocked) throw new DOMException('Recovery list unavailable', 'UnknownError');
        }
        return open.call(this, name, version);
      };
    });
    const url = other.url();
    await other.reload();
    const notice = other.locator('.nw-operation-notice').filter({ hasText: '복구 초안 목록을 읽지 못했습니다' });
    await expect(notice.getByRole('alert')).toBeVisible();
    await expect(other.locator('[data-save-status]')).toHaveText('확인이 필요합니다');
    expect(await other.evaluate(() => window.recoveryProbe.count())).toBe(1);
    const healthy = await page.context().newPage();
    try {
      await healthy.goto('/#shared-page');
      await expect(healthy.locator('[data-note-recovery]')).toContainText('복구할 초안');
      await expect(healthy.getByLabel('노트 제목')).toHaveValue('복구 목록 원본');
      expect(await stored(healthy)).toEqual(original);
      expect((await recoveryRows(healthy))[0]).toEqual(draft);
    } finally { await healthy.close(); }
    await notice.getByRole('button', { name: '다시 시도' }).click();
    await expect.poll(() => other.evaluate(() => window.recoveryProbe.count())).toBe(2);
    await expect(notice).toBeVisible();
    await expect(other.locator('[data-save-status]')).toHaveText('확인이 필요합니다');
    expect(await stored(page)).toEqual(original);
    expect((await recoveryRows(page))[0]).toEqual(draft);
    await other.evaluate(() => window.recoveryProbe.unblock());
    await notice.getByRole('button', { name: '다시 시도' }).click();
    await expect(other.locator('[data-note-recovery]')).toContainText('복구할 초안');
    await expect(notice).toHaveCount(0);
    await expect(other.locator('[data-save-status]')).toHaveText('저장됨');
    expect(await other.evaluate(() => window.recoveryProbe.count())).toBeGreaterThanOrEqual(3);
    expect(other.url()).toBe(url);
    await expect(other.getByLabel('노트 제목')).toHaveValue('복구 목록 원본');
    await expect(other.locator('.on-doc')).toContainText('목록 원본 본문');
    expect(await stored(page)).toEqual(original);
    expect((await recoveryRows(page))[0]).toEqual(draft);
  } finally { await other.close(); }
});

test('복구 목록의 비동기 IndexedDB 오류도 다시 읽어 복구한다', async ({ page }) => {
  const other = await pair(page);
  try {
    await page.getByLabel('노트 제목').fill('비동기 오류 원본');
    await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
    await other.getByLabel('노트 제목').fill('비동기 오류 초안');
    await expect(other.locator('[data-save-status]')).toHaveText('충돌한 초안 보관됨');
    const original = await stored(page), draft = (await recoveryRows(page))[0];
    await other.addInitScript(() => {
      const getAll = IDBObjectStore.prototype.getAll;
      let blocked = true, count = 0;
      window.recoveryReadProbe = { unblock: () => { blocked = false; }, count: () => count };
      IDBObjectStore.prototype.getAll = function () {
        const request = getAll.call(this);
        if (this.transaction.db.name === 'barocss-note-recovery') {
          count++;
          if (blocked) this.transaction.abort();
        }
        return request;
      };
    });
    await other.reload();
    const notice = other.locator('.nw-operation-notice').filter({ hasText: '복구 초안 목록을 읽지 못했습니다' });
    await expect(notice.getByRole('alert')).toBeVisible();
    await expect(other.locator('[data-save-status]')).toHaveText('확인이 필요합니다');
    expect(await other.evaluate(() => window.recoveryReadProbe.count())).toBe(1);
    const url = other.url();
    await other.getByRole('button', { name: '새 노트', exact: true }).click();
    await other.getByLabel('노트 제목').fill('목록 오류와 별개인 새 노트');
    const unrelatedId = new URL(other.url()).hash.slice(1);
    await expect.poll(async () => (await stored(page, unrelatedId))?.title).toBe('목록 오류와 별개인 새 노트');
    await expect(notice.getByRole('alert')).toBeVisible();
    await expect(other.locator('[data-save-status]')).toHaveText('확인이 필요합니다');
    await other.locator('[data-page-id="shared-page"]').click();
    expect(other.url()).toBe(url);
    await expect(other.getByLabel('노트 제목')).toHaveValue('비동기 오류 원본');
    await expect(other.locator('.on-doc')).toContainText('시작');
    expect(await stored(page)).toEqual(original);
    expect((await recoveryRows(page))[0]).toEqual(draft);
    await other.evaluate(() => window.recoveryReadProbe.unblock());
    await notice.getByRole('button', { name: '다시 시도' }).click();
    await expect(other.locator('[data-note-recovery]')).toContainText('비동기 오류 초안');
    await expect(notice).toHaveCount(0);
    expect(await other.evaluate(() => window.recoveryReadProbe.count())).toBe(2);
    expect(await stored(page)).toEqual(original);
    expect((await recoveryRows(page))[0]).toEqual(draft);
  } finally { await other.close(); }
});

test('문서 저장 실패의 다시 시도는 초안 목록과 별개로 저장을 재실행한다', async ({ page }) => {
  const other = await pair(page);
  try {
    const original = await stored(other);
    await page.evaluate(() => {
      const open = IDBFactory.prototype.open;
      window.restoreDocumentStorage = () => { IDBFactory.prototype.open = open; };
      IDBFactory.prototype.open = function (name, version) {
        if (name === 'barocss-note') throw new DOMException('Document storage unavailable', 'UnknownError');
        return open.call(this, name, version);
      };
    });
    await page.getByLabel('노트 제목').fill('저장 재시도 제목');
    const notice = page.locator('.nw-operation-notice').filter({ hasText: '노트를 이 브라우저에 저장하지 못했습니다' });
    await expect(notice.getByRole('alert')).toBeVisible();
    await expect(page.locator('[data-save-status]')).toHaveText('확인이 필요합니다');
    expect(await stored(other)).toEqual(original);
    await page.evaluate(() => window.restoreDocumentStorage());
    await notice.getByRole('button', { name: '다시 시도' }).click();
    await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
    expect((await stored(other)).title).toBe('저장 재시도 제목');
    await page.reload();
    await expect(page.getByLabel('노트 제목')).toHaveValue('저장 재시도 제목');
  } finally { await other.close(); }
});


test('문서 저장 완료 뒤 도착한 복구 목록 오류는 표시하고 다시 조회한다', async ({ page }) => {
  const other = await pair(page);
  try {
    await page.getByLabel('노트 제목').fill('늦은 오류 원본');
    await typeAtStart(page, '늦은 오류 원본 본문 ');
    await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
    await other.getByLabel('노트 제목').fill('늦은 오류 초안');
    await typeAtStart(other, '늦은 오류 초안 본문 ');
    await expect(other.locator('[data-save-status]')).toHaveText('충돌한 초안 보관됨');
    const original = await stored(page), draft = (await recoveryRows(page))[0];
    await other.addInitScript(() => {
      const open = IDBFactory.prototype.open;
      let blocked = true, count = 0;
      let fail: (() => void) | undefined;
      window.lateRecoveryProbe = {
        count: () => count,
        fail: () => fail?.(),
        unblock: () => { blocked = false; }
      };
      IDBFactory.prototype.open = function (name, version) {
        if (name === 'barocss-note-recovery') {
          count++;
          if (blocked) {
            // Hold only the synthetic storage request. UI and editor state stay untouched.
            const request = {
              error: new DOMException('Delayed recovery read failure', 'UnknownError'),
              onerror: null as IDBOpenDBRequest['onerror']
            } as IDBOpenDBRequest;
            fail = () => request.onerror?.call(request, new Event('error'));
            return request;
          }
        }
        return open.call(this, name, version);
      };
    });
    const url = other.url();
    await other.reload();
    await expect(other.getByLabel('노트 제목')).toHaveValue('늦은 오류 원본');
    await expect.poll(() => other.evaluate(() => window.lateRecoveryProbe.count())).toBe(1);
    const notice = other.locator('.nw-operation-notice').filter({ hasText: '복구 초안 목록을 읽지 못했습니다' });
    await expect(notice).toHaveCount(0);
    await other.getByRole('button', { name: '새 노트', exact: true }).click();
    await other.getByLabel('노트 제목').fill('늦은 오류 전에 저장된 새 노트');
    const unrelatedId = new URL(other.url()).hash.slice(1);
    await expect.poll(async () => (await stored(page, unrelatedId))?.title).toBe('늦은 오류 전에 저장된 새 노트');
    await expect(other.locator('[data-save-status]')).toHaveText('저장됨');
    await other.evaluate(() => window.lateRecoveryProbe.fail());
    await expect(notice.getByRole('alert')).toBeVisible();
    await expect(other.locator('[data-save-status]')).toHaveText('확인이 필요합니다');
    expect(await stored(page)).toEqual(original);
    expect((await recoveryRows(page))[0]).toEqual(draft);
    await other.evaluate(() => window.lateRecoveryProbe.unblock());
    await notice.getByRole('button', { name: '다시 시도' }).click();
    await expect(other.locator('[data-note-recovery]')).toContainText('늦은 오류 초안');
    await expect(notice).toHaveCount(0);
    expect(await other.evaluate(() => window.lateRecoveryProbe.count())).toBe(2);
    await other.locator('[data-page-id="shared-page"]').click();
    expect(other.url()).toBe(url);
    await expect(other.getByLabel('노트 제목')).toHaveValue('늦은 오류 원본');
    await expect(other.locator('.on-doc')).toContainText('늦은 오류 원본 본문');
    expect(await stored(page)).toEqual(original);
    expect((await recoveryRows(page))[0]).toEqual(draft);
  } finally { await other.close(); }
});
