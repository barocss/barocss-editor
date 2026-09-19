import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const run = (text: string) => ({ stype: 'inline-text', text });
const paragraph = (...content: unknown[]) => ({ stype: 'paragraph', content });
const reference = (pageId: string, title: string) => ({ stype: 'pageReference', attributes: { pageId, title } });
const file = (pageId: string, title: string, content: unknown[]) => JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title, pageId }, content } });
async function importNote(page: Page, content: string) {
  await expect(page.getByLabel('노트 파일')).toBeEnabled();
  await page.getByLabel('노트 파일').setInputFiles({ name: 'page.note.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await expect(page.getByLabel('노트 제목')).toHaveValue(JSON.parse(content).document.attributes.title);
}
async function ready(page: Page) {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
}
const atom = (page: Page) => page.locator('[data-note-page-reference]');
const openPage = (page: Page, title: string) => page.getByRole('navigation', { name: '노트 목록' }).getByRole('button', { name: title, exact: true }).click();

test('[[ 참조 삽입·실행 취소·이름 변경·백링크·브라우저 뒤로가기와 휴지통 복원을 연결한다', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await ready(page);
  await importNote(page, file('project-target', '프로젝트 계획', [paragraph(run('목표를 정리합니다.'))]));
  await importNote(page, file('meeting-source', '출시 회의', [paragraph(run('회의에서 확인할 문서: '))]));
  const body = page.locator('.on-doc > p').first();
  await body.click(); await page.keyboard.press('End'); await page.keyboard.insertText('[[프로젝트');
  const picker = page.getByRole('listbox', { name: '페이지 연결', exact: true });
  await expect(picker.getByRole('option')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('page-picker.png') });
  await page.keyboard.press('Enter');
  await expect(atom(page)).toHaveCount(1);
  await expect(atom(page)).toHaveAttribute('data-page-id', 'project-target');
  await page.keyboard.press('Control+z'); await expect(atom(page)).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z'); await expect(atom(page)).toHaveCount(1);
  await page.keyboard.insertText(' 다음 단계');
  await expect(body).toContainText('다음 단계');
  await expect(body).not.toContainText('[[');
  await atom(page).click();
  await expect(page.getByLabel('노트 제목')).toHaveValue('프로젝트 계획');
  const links = page.getByLabel('이 페이지를 참조한 페이지', { exact: true });
  await links.locator('summary').click();
  await expect(links.getByRole('button', { name: '출시 회의 참조 페이지 열기', exact: true })).toContainText('회의에서 확인할 문서');
  await page.getByLabel('노트 제목').fill('제품 출시 계획');
  await links.getByRole('button', { name: '출시 회의 참조 페이지 열기', exact: true }).click();
  await expect(atom(page)).toContainText('제품 출시 계획');
  await page.goBack(); await expect(page.getByLabel('노트 제목')).toHaveValue('제품 출시 계획');
  await page.goForward(); await expect(page.getByLabel('노트 제목')).toHaveValue('출시 회의');
  await expect(body).toContainText('다음 단계');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload(); await expect(atom(page)).toContainText('제품 출시 계획');
  await atom(page).click();
  await page.getByRole('button', { name: '페이지 설정', exact: true }).click();
  await page.getByRole('button', { name: '휴지통으로 이동', exact: true }).click();
  await openPage(page, '출시 회의');
  await expect(atom(page)).toHaveAttribute('data-page-state', 'trashed');
  await atom(page).click();
  await expect(page.locator('[data-page-trashed]')).toBeVisible();
  await page.getByRole('button', { name: '페이지 복원', exact: true }).click();
  await expect(page.getByLabel('이 페이지를 참조한 페이지', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('backlinks.png') });
  await openPage(page, '출시 회의');
  await expect(atom(page)).toHaveAttribute('data-page-state', 'available');
});

test('개별 파일로 옮긴 참조는 가져오기 순서와 무관하게 같은 페이지를 찾는다', async ({ page, browser }) => {
  await ready(page);
  const target = file('portable-target', '옮길 대상', [paragraph(run('원본 대상'))]);
  await importNote(page, target);
  await importNote(page, file('portable-source', '옮길 회의록', [paragraph(reference('portable-target', '옮길 대상'))]));
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '내보내기', exact: true }).click();
  await page.getByRole('button', { name: '파일 내려받기', exact: true }).click();
  const exported = await readFile((await (await downloading).path())!, 'utf8');
  expect(JSON.parse(exported).document.attributes.pageId).toBe('portable-source');
  const fresh = await browser.newContext();
  try {
    const other = await fresh.newPage(); await other.goto('http://localhost:5183/');
    await expect(other.getByLabel('노트 제목')).toBeVisible();
    await importNote(other, exported);
    await expect(atom(other)).toHaveAttribute('data-page-state', 'missing');
    await importNote(other, target);
    await openPage(other, '옮길 회의록');
    await expect(atom(other)).toHaveAttribute('data-page-state', 'available');
    await atom(other).click();
    await expect(other.getByLabel('노트 제목')).toHaveValue('옮길 대상');
    await expect(other).toHaveURL(/#portable-target$/);
  } finally { await fresh.close(); }
});

test('항목 본문의 마지막 입력을 저장한 뒤 참조로 이동하고 백링크로 같은 항목을 다시 연다', async ({ page }) => {
  await ready(page);
  await importNote(page, file('item-target', '업무 기준', [paragraph(run('기준 문서'))]));
  await importNote(page, file('item-source', '업무 목록', [
    { stype: 'noteDatabase', attributes: { source: 'tasks' } },
    { stype: 'resources', content: [
      { stype: 'dataset', attributes: { name: 'tasks', label: '업무', fields: [{ name: '이름', kind: 'text' }], records: [{ 이름: '출시 준비' }], rowIds: ['task-1'] } },
      { stype: 'richText', attributes: { id: 'task-1' }, content: [paragraph(reference('item-target', '업무 기준')), paragraph(run('메모: '))] }
    ] }
  ]));
  await page.getByRole('button', { name: '행 1 열기', exact: true }).click();
  const peek = page.getByRole('dialog', { name: '데이터베이스 항목', exact: true });
  const last = peek.locator('[data-db-item-body] .on-doc > p').last();
  await last.click(); await page.keyboard.press('End'); await page.keyboard.insertText('이동 직전 입력');
  await peek.locator('[data-note-page-reference]').click();
  await expect(page.getByLabel('노트 제목')).toHaveValue('업무 기준');
  const backlinks = page.getByLabel('이 페이지를 참조한 페이지', { exact: true });
  await backlinks.locator('summary').click();
  await expect(backlinks).toContainText('출시 준비');
  await backlinks.getByRole('button', { name: '업무 목록 참조 페이지 열기', exact: true }).click();
  await expect(peek).toBeVisible();
  await expect(peek.getByLabel('항목 · 이름', { exact: true })).toHaveValue('출시 준비');
  await expect(last).toContainText('이동 직전 입력');
  await last.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' 뒤로가기 직전');
  await page.goBack();
  await expect(page.getByLabel('노트 제목')).toHaveValue('업무 기준');
  await page.goForward();
  await expect(peek).toBeVisible();
  await expect(last).toContainText('뒤로가기 직전');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await page.getByRole('button', { name: '행 1 열기', exact: true }).click();
  await expect(last).toContainText('이동 직전 입력 뒤로가기 직전');
});

test('참조를 포함한 본문을 HTML 클립보드로 복사해도 연결과 실행 취소가 유지된다', async ({ page }) => {
  await ready(page);
  await importNote(page, file('copy-target', '복사 대상', [paragraph(run('대상'))]));
  await importNote(page, file('copy-source', '복사 원본', [paragraph(run('앞 '), reference('copy-target', '복사 대상'), run(' 뒤')), paragraph(run('붙여넣을 곳: '))]));
  await page.evaluate(() => {
    const captured = window as unknown as { capturedClipboard?: Record<string, string> };
    // The model shortcut uses Clipboard API once its selection has reconciled;
    // browser-default copy uses the DOM event. Capture both without OS writes.
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      write: async (items: ClipboardItem[]) => {
        const data: Record<string, string> = {};
        for (const item of items) for (const type of item.types) data[type] = await (await item.getType(type)).text();
        captured.capturedClipboard = data;
      }
    } });
    // Intercept browser-default copy
    // after editor handlers; emulate native range serialization only when the
    // editor leaves browser-default copy intact, and never write the OS clipboard.
    document.addEventListener('copy', event => {
      const data: Record<string, string> = {};
      if (event.defaultPrevented) {
        for (const type of event.clipboardData?.types ?? []) data[type] = event.clipboardData!.getData(type);
      } else {
        const selection = window.getSelection();
        if (selection?.rangeCount) {
          const container = document.createElement('div');
          container.appendChild(selection.getRangeAt(0).cloneContents());
          data['text/html'] = container.innerHTML;
          data['text/plain'] = selection.toString();
        }
      }
      captured.capturedClipboard = data;
      event.preventDefault();
    }, { once: true });
  });
  const first = page.locator('.on-doc > p').first();
  await first.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+ArrowLeft' : 'Shift+Home');
  await expect.poll(() => first.evaluate(element => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return '';
    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return '';
    const fragment = document.createElement('div'); fragment.appendChild(range.cloneContents());
    return fragment.querySelector('[data-page-id]')?.getAttribute('data-page-id') ?? '';
  })).toBe('copy-target');
  await expect(page.getByRole('toolbar', { name: '선택한 글 서식' })).toBeVisible();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+c' : 'Control+c');
  await expect.poll(() => page.evaluate(() => (window as unknown as { capturedClipboard?: Record<string, string> }).capturedClipboard?.['text/html'])).toContain('data-page-id="copy-target"');
  const last = page.locator('.on-doc > p').last();
  await last.click(); await page.keyboard.press('End');
  await page.evaluate(() => {
    const data = (window as unknown as { capturedClipboard: Record<string, string> }).capturedClipboard;
    const transfer = new DataTransfer();
    for (const [type, value] of Object.entries(data)) transfer.setData(type, value);
    document.querySelector('.on-doc')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
  await expect(atom(page)).toHaveCount(2);
  await expect(atom(page).last()).toHaveAttribute('data-page-id', 'copy-target');
  await page.keyboard.press('Control+z'); await expect(atom(page)).toHaveCount(1);
});

test('가져온 파일의 ID가 읽을 수 없는 원본과 같아도 원본을 덮어쓰지 않는다', async ({ page }) => {
  await ready(page);
  const source = '{unreadable original';
  await page.evaluate(async source => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('barocss-note');
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('documents', 'readwrite');
        tx.objectStore('documents').put({ name: 'broken-reference-id', title: '보존할 원본', text: source, savedAt: Date.now() });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, source);
  await page.reload();
  await expect(page.locator('[data-unreadable-note]')).toContainText('보존할 원본');
  await importNote(page, file('broken-reference-id', '새로 가져온 문서', [paragraph(reference('broken-reference-id', '나 자신'))]));
  await expect(page).not.toHaveURL(/#broken-reference-id$/);
  const newId = new URL(page.url()).hash.slice(1);
  await expect(atom(page)).toHaveAttribute('data-page-id', newId);
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.getByLabel('노트 제목')).toHaveValue('새로 가져온 문서');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '보존할 원본 원본 내보내기', exact: true }).click();
  expect(await readFile((await (await downloading).path())!, 'utf8')).toBe(source);
});

test('중첩 항목 백링크는 바깥 항목부터 열고 안쪽의 마지막 입력까지 저장한다', async ({ page }) => {
  await ready(page);
  await importNote(page, file('nested-target', '중첩 기준', [paragraph(run('기준'))]));
  const database = (source: string) => ({ stype: 'noteDatabase', attributes: { source } });
  const dataset = (name: string, id: string, title: string) => ({ stype: 'dataset', attributes: { name, fields: [{ name: '이름', kind: 'text' }], records: [{ 이름: title }], rowIds: [id] } });
  await importNote(page, file('nested-source', '중첩 업무', [database('outer'), { stype: 'resources', content: [
    dataset('outer', 'outer-item', '상위 작업'),
    { stype: 'richText', attributes: { id: 'outer-item' }, content: [database('inner'), { stype: 'resources', content: [
      dataset('inner', 'inner-item', '하위 작업'),
      { stype: 'richText', attributes: { id: 'inner-item' }, content: [paragraph(reference('nested-target', '중첩 기준')), paragraph(run('세부 내용: '))] }
    ] }] }
  ] }]));
  await openPage(page, '중첩 기준');
  const backlinks = page.getByLabel('이 페이지를 참조한 페이지', { exact: true });
  await backlinks.locator('summary').click();
  await backlinks.getByRole('button', { name: '중첩 업무 참조 페이지 열기', exact: true }).click();
  const peek = page.getByRole('dialog', { name: '데이터베이스 항목', exact: true }).last();
  await expect(peek.getByLabel('항목 · 이름', { exact: true })).toHaveValue('하위 작업');
  const last = peek.locator('[data-db-item-body] .on-doc > p').last();
  await last.click(); await page.keyboard.press('End'); await page.keyboard.insertText('안쪽 마지막 입력');
  await page.goBack(); await expect(page.getByLabel('노트 제목')).toHaveValue('중첩 기준');
  await page.goForward();
  await expect(peek.getByLabel('항목 · 이름', { exact: true })).toHaveValue('하위 작업');
  await expect(last).toContainText('안쪽 마지막 입력');
});

test('긴 페이지 검색은 키보드 선택을 스크롤하고 작은 화면 안에 표시한다', async ({ page }, info) => {
  await ready(page);
  const pages = Array.from({ length: 30 }, (_, index) => ({ id: `candidate-${String(index + 1).padStart(2, '0')}`, title: `연결 후보 ${String(index + 1).padStart(2, '0')}`, text: file(`candidate-${String(index + 1).padStart(2, '0')}`, `연결 후보 ${String(index + 1).padStart(2, '0')}`, [paragraph(run('후보'))]) }));
  await page.evaluate(async pages => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('barocss-note');
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('documents', 'readwrite');
        for (const item of pages) tx.objectStore('documents').put({ name: item.id, title: item.title, text: item.text, savedAt: Date.now() });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, pages);
  await page.reload();
  await importNote(page, file('candidate-source', '찾아 연결하기', [paragraph(run('문서 '))]));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.on-doc > p').click(); await page.keyboard.press('End'); await page.keyboard.insertText('[[연결 후보');
  const picker = page.getByRole('listbox', { name: '페이지 연결', exact: true });
  await expect(picker.getByRole('option')).toHaveCount(30);
  await page.keyboard.press('ArrowUp');
  const chosen = picker.getByRole('option', { name: '연결 후보 30', exact: true });
  await expect(chosen).toHaveAttribute('aria-selected', 'true');
  await expect.poll(async () => {
    const menu = await picker.boundingBox(), option = await chosen.boundingBox();
    return !!menu && !!option && option.y >= menu.y && option.y + option.height <= menu.y + menu.height;
  }).toBe(true);
  const box = (await picker.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: info.outputPath('mobile-page-picker.png') });
  await page.keyboard.press('Enter');
  await expect(atom(page)).toHaveAttribute('data-page-id', 'candidate-30');
});
