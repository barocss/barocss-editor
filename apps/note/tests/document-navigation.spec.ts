import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
const text = (text: string) => ({ stype: 'inline-text', text });
const paragraph = (value: string) => ({ stype: 'paragraph', content: [text(value)] });
const heading = (value: string, level = 1) => ({ stype: 'heading', attributes: { level }, content: [text(value)] });
const findKey = process.platform === 'darwin' ? 'Meta+f' : 'Control+f';
// Imported trees omit empty node fields; the session serializer writes them after an edit.
function contentOf(source: string) {
  const normalize = (value: any): any => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([key, child]) => !(['attributes', 'content', 'marks'].includes(key) && child && typeof child === 'object' && !Object.keys(child).length)).map(([key, child]) => [key, normalize(child)])) : value;
  return normalize(JSON.parse(source).document);
}
async function setup(page: Page) {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'navigation.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { pageId: 'navigation', title: '문서 탐색 테스트' }, content: [
    heading('프로젝트 개요'), { stype: 'paragraph', content: [text('출시 '), { ...text('일정'), marks: [{ stype: 'bold' }] }, text(' 확인 · Alpha alpha')] },
    { stype: 'bDetails', attributes: { open: false }, content: [{ stype: 'bSummary', content: [text('접힌 내용')] }, heading('세부 일정', 2), paragraph('출시 일정은 접힌 본문에도 있습니다.')] },
    ...Array.from({ length: 18 }, (_, index) => paragraph(`일반 문단 ${index + 1}`)), heading('다음 단계', 2), paragraph('문서 끝'),
    { stype: 'noteDatabase', attributes: { source: 'tasks' } }, { stype: 'resources', content: [{ stype: 'dataset', attributes: { name: 'tasks', fields: [{ name: '이름', kind: 'text' }], records: [{ 이름: '작업' }], rowIds: ['task-one'] } }, { stype: 'richText', attributes: { id: 'task-one' }, content: [heading('항목 전용 제목'), paragraph('항목 전용 검색어')] }] }
  ] } })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('문서 탐색 테스트'); await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
}
async function stored(page: Page) {
  return page.evaluate(() => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open('barocss-note'); request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result, tx = db.transaction('documents'), read = tx.objectStore('documents').get('navigation'); tx.oncomplete = () => { db.close(); resolve(read.result.text); }; };
  }));
}
const panel = (page: Page) => page.getByRole('region', { name: '문서 탐색', exact: true });

test('찾기는 서식 경계를 이어 검색하고 접힌 본문을 보여주며 원본·선택·실행 취소를 보존한다', async ({ page }) => {
  await setup(page); const original = await stored(page);
  await page.locator('.on-doc > p').first().click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End'); await page.keyboard.insertText(' 보존할 수정');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨'); const edited = await stored(page);
  const selection = () => page.evaluate(() => { const held = getSelection(); return { id: held?.anchorNode?.parentElement?.closest('[data-bc-sid]')?.getAttribute('data-bc-sid'), offset: held?.anchorOffset }; });
  const caret = await selection();
  await page.keyboard.press(findKey);
  const nav = panel(page), query = nav.getByRole('searchbox', { name: '본문에서 찾기' });
  await expect(query).toBeFocused(); await query.fill('출시 일정'); await expect(nav.getByRole('status')).toHaveText('1 / 2');
  await expect.poll(() => page.evaluate(() => [...CSS.highlights.keys()].filter(name => name.startsWith('note-find-')).length)).toBe(2);
  await query.press('Enter'); await expect(nav.getByRole('status')).toHaveText('2 / 2');
  await expect(page.locator('details.w-details')).toHaveAttribute('open', '');
  expect(await stored(page)).toBe(edited);
  await query.press('Shift+Enter'); await expect(nav.getByRole('status')).toHaveText('1 / 2');
  await query.fill('alpha'); await expect(nav.getByRole('status')).toHaveText('1 / 2');
  await nav.getByRole('button', { name: '대소문자 구분' }).click(); await expect(nav.getByRole('status')).toHaveText('1 / 1');
  await query.fill('없는 검색어'); await expect(nav.getByRole('status')).toHaveText('검색 결과 없음'); await expect(nav.getByRole('button', { name: '다음 검색 결과' })).toBeDisabled();
  await query.press('Escape'); await expect(nav).toHaveCount(0); await expect(page.locator('details.w-details')).not.toHaveAttribute('open');
  expect(await selection()).toEqual(caret);
  expect(await stored(page)).toBe(edited);
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: '내보내기', exact: true }).click();
  await page.getByRole('button', { name: '파일 내려받기', exact: true }).click();
  expect(JSON.parse(await readFile((await (await downloaded).path())!, 'utf8')).document).toEqual(JSON.parse(edited).document);
  await page.locator('.on-doc > p').first().click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect.poll(async () => contentOf(await stored(page))).toEqual(contentOf(original));
});

test('목차는 계층을 보여주고 이동·수정·페이지 전환과 좁은 화면을 지원한다', async ({ page }, info) => {
  await setup(page); await page.getByRole('menubar', { name: '노트 메뉴' }).getByRole('menuitem', { name: '보기', exact: true }).click(); await page.getByRole('menuitem', { name: '목차', exact: true }).click(); const nav = panel(page);
  await expect(nav.getByRole('button', { name: '프로젝트 개요', exact: true })).toHaveAttribute('data-heading-level', '1');
  await expect(nav.getByRole('button', { name: '세부 일정', exact: true })).toHaveAttribute('data-heading-level', '2');
  await expect(nav.getByRole('button', { name: '항목 전용 제목' })).toHaveCount(0);
  await nav.getByRole('button', { name: '다음 단계', exact: true }).click();
  await expect(page.locator('.on-doc h2').filter({ hasText: '다음 단계' })).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 }); const bounds = (await nav.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('outline-mobile.png') });
  await nav.getByRole('button', { name: '문서 탐색 닫기' }).click();
  const target = page.locator('.on-doc h2').filter({ hasText: '다음 단계' }); await target.click(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End'); await page.keyboard.insertText(' 수정');
  await page.getByRole('menubar', { name: '노트 메뉴' }).getByRole('menuitem', { name: '보기', exact: true }).click(); await page.getByRole('menuitem', { name: '목차', exact: true }).click(); await expect(nav.getByRole('button', { name: '다음 단계 수정', exact: true })).toBeVisible();
  // The compact workspace hides the library. Restore the wide layout before creating a page.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '새 노트', exact: true }).click(); await expect(nav).toHaveCount(0);
});

test('중첩 항목의 Cmd/Ctrl+F는 그 본문만 찾고 IME Enter는 결과 이동을 하지 않는다', async ({ page }) => {
  await setup(page); await page.locator('[data-note-database-ui]').getByRole('button', { name: '행 1 열기', exact: true }).click();
  const body = page.locator('[data-db-item-body] .on-doc'); await body.locator('p').click(); await page.keyboard.press(findKey);
  const nav = panel(page); await expect(nav).toHaveCount(1); const query = nav.getByRole('searchbox');
  await query.fill('항목 전용'); await expect(nav.getByRole('status')).toHaveText('1 / 2');
  await query.dispatchEvent('compositionstart'); await query.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true }); await expect(nav.getByRole('status')).toHaveText('1 / 2'); await query.dispatchEvent('compositionend');
  await query.fill('프로젝트 개요'); await expect(nav.getByRole('status')).toHaveText('검색 결과 없음');
  await query.press('Escape'); await expect(nav).toHaveCount(0); await expect(body).toBeVisible();
});

test('검색 중 편집·실행 취소는 결과를 갱신하고 다른 페이지에서 돌아와도 탐색창을 다시 열지 않는다', async ({ page }) => {
  await setup(page); await page.getByRole('menubar', { name: '노트 메뉴' }).getByRole('menuitem', { name: '편집', exact: true }).click(); await page.getByRole('menuitem', { name: '본문 찾기', exact: true }).click();
  const nav = panel(page); await nav.getByRole('searchbox').fill('문서 끝'); await expect(nav.getByRole('status')).toHaveText('1 / 1');
  const ending = page.locator('.nw-document .on-doc > p').filter({ hasText: '문서 끝' });
  await ending.click(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End'); await page.keyboard.insertText(' 문서 끝');
  await expect(nav.getByRole('status')).toHaveText('1 / 2'); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await expect(nav.getByRole('status')).toHaveText('1 / 1');
  await nav.getByRole('button', { name: '문서 탐색 닫기' }).click();
  await page.getByRole('button', { name: '새 노트', exact: true }).click();
  await page.getByRole('navigation', { name: '노트 목록' }).getByRole('button', { name: '문서 탐색 테스트', exact: true }).click();
  await expect(page.getByLabel('노트 제목')).toHaveValue('문서 탐색 테스트'); await expect(nav).toHaveCount(0);
});
