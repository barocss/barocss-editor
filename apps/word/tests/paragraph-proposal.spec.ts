import { test, expect, type Page } from '@playwright/test';

const original = '승인 버튼의 글자는 읽기 쉬워야 한다.';
const review = (page: Page) => page.getByRole('complementary', { name: '문단 제안 검토' });
const target = (page: Page) => page.locator('#editor .w-paragraph').filter({ hasText: original }).first();
const native = (page: Page) => page.evaluate(() => JSON.stringify(window.editor.exportDocument()));
const libraryRows = (page: Page) => page.evaluate(() => new Promise<string>((resolve, reject) => {
  const request = indexedDB.open('barocss-word');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result, rows = db.transaction('documents').objectStore('documents').getAll();
    rows.onerror = () => { db.close(); reject(rows.error); };
    rows.onsuccess = () => { const result = JSON.stringify(rows.result); db.close(); resolve(result); };
  };
}));
async function select(page: Page) {
  await page.locator('#editor [contenteditable="true"]').first().focus();
  await target(page).click(); await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => window.editor.selection?.collapsed)).toBe(true);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home'); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+ArrowRight' : 'Shift+End');
  await expect.poll(() => page.evaluate(() => {
    const range = window.editor.selection;
    return range && range.startNodeId === range.endNodeId && range.startOffset === 0 && range.endOffset > 0;
  })).toBe(true);
}
async function open(page: Page) {
  await page.goto('/?sample=paragraph-proposal#word=existing-user-document');
  await expect(target(page)).toBeVisible(); await expect(review(page)).toBeVisible();
  await expect(page.getByRole('button', { name: '문서 보관함', exact: true })).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('#word=existing-user-document');
}

test('contextual fixed preview and rejection leave the full native document and selection unchanged', async ({ page }) => {
  await open(page); await select(page);
  const before = await native(page);
  const selection = await page.evaluate(() => structuredClone(window.editor.selection));
  await page.screenshot({ path: process.env.PROPOSAL_EVIDENCE_DIR ? `${process.env.PROPOSAL_EVIDENCE_DIR}/original-context.png` : test.info().outputPath('original-context.png') });
  await review(page).getByRole('button', { name: '선택 문단 제안 보기' }).click();
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'ready');
  await expect(review(page)).toContainText('실제 AI 분석을 하지 않았습니다.');
  await expect(review(page)).toContainText('DEC-01@v1');
  await expect(review(page)).toContainText('4.5:1은 REQ-01@v1과 DEC-01@v1에 없는 새 제안 기준');
  await expect(review(page).getByRole('button', { name: '적용 불가 · 미리 보기 전용' })).toBeDisabled();
  expect(await native(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.selection)).toEqual(selection);
  await review(page).locator('[data-proposal-replacement]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: process.env.PROPOSAL_EVIDENCE_DIR ? `${process.env.PROPOSAL_EVIDENCE_DIR}/proposal-context.png` : test.info().outputPath('proposal-context.png') });
  await review(page).getByRole('heading', { name: '새 기준과 가정 · 사람의 판단 필요' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: process.env.PROPOSAL_EVIDENCE_DIR ? `${process.env.PROPOSAL_EVIDENCE_DIR}/proposal-assumption-context.png` : test.info().outputPath('proposal-assumption-context.png') });
  await review(page).getByRole('button', { name: '제안 거절' }).click();
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'rejected');
  expect(await native(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.selection)).toEqual(selection);
});

test('selection A-B-A, clear, cross-paragraph and content undo permanently retire previews', async ({ page }) => {
  await open(page); await select(page);
  await review(page).getByRole('button', { name: '선택 문단 제안 보기' }).click();
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'ready');
  const before = await native(page);
  await page.keyboard.press('ArrowRight'); await select(page);
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'stale');
  expect(await native(page)).toBe(before);
  await review(page).getByRole('button', { name: '선택 문단 제안 보기' }).click();
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'ready');
  await page.evaluate(() => window.editor.updateSelection(null));
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'stale');
  await target(page).click(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+End');
  await review(page).getByRole('button', { name: '선택 문단 제안 보기' }).click();
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'unavailable');
  expect(await native(page)).toBe(before);
  await select(page); await review(page).getByRole('button', { name: '선택 문단 제안 보기' }).click();
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'ready');
  await page.keyboard.insertText('가상 변경');
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'stale');
  await page.keyboard.press('Meta+z');
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'stale');
  await expect(page.locator('#editor')).toContainText(original);
  await expect(review(page).getByRole('button', { name: '적용 불가 · 미리 보기 전용' })).toBeDisabled();
});

test('queued preview, foreign and embedded focus, read-only and session replacement cannot mutate', async ({ page }) => {
  await open(page); await select(page);
  const before = await native(page);
  // A real click queues the review, then a same-task model change retires its generation.
  await page.evaluate(() => {
    const range = structuredClone(window.editor.selection);
    (document.querySelector('.w-paragraph-proposal button') as HTMLButtonElement).click();
    window.editor.updateSelection({ ...range, startOffset: 1 }); window.editor.updateSelection(range);
  });
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'stale');
  expect(await native(page)).toBe(before);
  await select(page); await review(page).getByRole('button', { name: '선택 문단 제안 보기' }).click();
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'ready');
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.setAttribute('aria-label', '외부 입력'); document.body.append(input); input.focus();
  });
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'stale');
  await review(page).getByRole('button', { name: '선택 문단 제안 보기' }).click();
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'unavailable');
  expect(await native(page)).toBe(before);
  await page.getByRole('textbox', { name: '외부 입력' }).evaluate(element => element.remove());
  await select(page); await review(page).getByRole('button', { name: '선택 문단 제안 보기' }).click();
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'ready');
  await page.evaluate(() => {
    const input = document.createElement('input'); input.setAttribute('data-editor-input-owner', 'embedded');
    input.setAttribute('aria-label', '내부 입력'); document.querySelector('#editor')!.append(input); input.focus();
  });
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'stale');
  await review(page).getByRole('button', { name: '선택 문단 제안 보기' }).click();
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'unavailable');
  expect(await native(page)).toBe(before);
  await page.getByRole('textbox', { name: '내부 입력' }).evaluate(element => element.remove());
  await select(page); await page.evaluate(() => window.editor.setEditable(false));
  await review(page).getByRole('button', { name: '선택 문단 제안 보기' }).click();
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'unavailable');
  expect(await native(page)).toBe(before);
  await page.evaluate(() => window.editor.setEditable(true)); await select(page);
  await review(page).getByRole('button', { name: '선택 문단 제안 보기' }).click();
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'ready');
  await page.evaluate(() => {
    const tree = window.editor.exportDocument(), session = window.editor.dataStore.getSessionId();
    window.editor.loadDocument(tree, 'replacement-B'); window.editor.loadDocument(tree, session);
    if (window.editor.dataStore.getSessionId() !== session) throw new Error('Original session was not restored');
  });
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'stale');
  await expect(review(page).getByRole('button', { name: '적용 불가 · 미리 보기 전용' })).toBeDisabled();
});


test('fictional preview entry preserves an existing local Word library document', async ({ page }) => {
  await page.goto('/?sample');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  const title = page.getByLabel('문서 제목', { exact: true });
  await title.fill('보존할 실제 로컬 문서'); await title.blur();
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  const savedUrl = page.url(), savedRows = await libraryRows(page);
  const hash = new URL(savedUrl).hash; expect(hash).toContain('word=');
  await page.goto(`/?sample=paragraph-proposal${hash}`);
  await expect(target(page)).toBeVisible();
  await expect(page.locator('[data-word-save-status]')).toHaveCount(0);
  await select(page); const sampleNative = await native(page);
  await review(page).getByRole('button', { name: '선택 문단 제안 보기' }).click();
  await expect(review(page)).toHaveAttribute('data-proposal-state', 'ready');
  await review(page).getByRole('button', { name: '제안 거절' }).click();
  expect(await native(page)).toBe(sampleNative);
  expect(await libraryRows(page)).toBe(savedRows);
  await page.goto(savedUrl);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await expect(page.getByLabel('문서 제목', { exact: true })).toHaveValue('보존할 실제 로컬 문서');
  expect(await libraryRows(page)).toBe(savedRows);
});
