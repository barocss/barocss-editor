import { test, expect, type Page } from '@playwright/test';
const doc = { format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: '공동 문서', pageId: 'shared-page' }, content: [
  { stype: 'paragraph', content: [{ stype: 'inline-text', text: '시작' }, { stype: 'pageReference', attributes: { pageId: 'shared-page', title: '공동 문서' } }] }
] } };
async function stored(page: Page, id = 'shared-page') {
  return page.evaluate(async id => {
    return new Promise<any>((resolve, reject) => {
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
      (window as any).restoreStorage = () => { IDBFactory.prototype.open = original; };
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
    await other.evaluate(() => (window as any).restoreStorage());
    await other.getByRole('button', { name: '다시 시도' }).click();
    await expect(other.locator('[data-save-status]')).toHaveText('충돌한 초안 보관됨');
    await other.reload();
    await expect(other.getByLabel('노트 제목')).toHaveValue('변경된 원본');
    await expect(other.locator('[data-note-recovery]')).toContainText('보관 실패한 내 초안');
  } finally { await other.close(); }
});
