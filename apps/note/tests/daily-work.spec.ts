import { test, expect, type Page } from '@playwright/test';
const text = (value: string) => ({ stype: 'inline-text', text: value });
const paragraph = (value: string) => ({ stype: 'paragraph', content: [text(value)] });
async function writingFixture(page: Page) {
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일').setInputFiles({ name: 'daily.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: '제품 구현 계획' }, content: [
      paragraph('이번 주 출시 준비'), { stype: 'blockQuote', content: [paragraph('사용자 피드백')] },
      paragraph('정리할 내용'), { stype: 'codeBlock', attributes: { language: 'javascript' }, content: [text('const ready = true;')] },
      { stype: 'bTable', content: [{ stype: 'bTableBody', content: ['이름', '진행 중'].map(value => ({ stype: 'bTableRow', content: [
        { stype: 'bTableCell', content: [text(value)] }, { stype: 'bTableCell', content: [text('상태')] }
      ] })) }] }, paragraph('다음 단계')
    ] }
  })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('제품 구현 계획');
}
async function menuAt(page: Page, locator: ReturnType<Page['locator']>) {
  await locator.hover();
  await page.locator('[data-note-grip]').click();
  await expect(page.locator('[data-note-block-menu]')).toBeVisible();
}
async function selectLine(page: Page) {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+ArrowLeft' : 'Shift+Home');
}

test('블록 변환·복제·중첩과 내어쓰기가 내용과 저장을 보존한다', async ({ page }) => {
  await writingFixture(page);
  await menuAt(page, page.locator('.on-doc > p').first());
  await page.locator('[data-note-convert="heading2"]').click();
  await expect(page.locator('.on-doc > h2')).toHaveText('이번 주 출시 준비');
  await menuAt(page, page.locator('.on-doc > h2'));
  await page.locator('[data-note-block-action="duplicateNoteBlock"]').click();
  await expect(page.locator('.on-doc > h2')).toHaveCount(2);
  const block = page.locator('.on-doc > p').filter({ hasText: '정리할 내용' });
  await menuAt(page, block);
  await page.locator('[data-note-block-action="indentNoteBlock"]').click();
  await expect(page.locator('.on-doc blockquote')).toContainText('정리할 내용');
  await menuAt(page, page.locator('.on-doc blockquote p').filter({ hasText: '정리할 내용' }));
  await page.locator('[data-note-block-action="outdentNoteBlock"]').click();
  await expect(block).toBeVisible();
  await page.locator('.on-doc > p').last().click();
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('.on-doc > h2')).toHaveCount(2);
  await expect(block).toBeVisible();
});

test('기존 링크 주소를 수정·그대로 적용·해제하고 표 머리글을 전환한다', async ({ page }) => {
  await writingFixture(page);
  const first = page.locator('.on-doc > p').first();
  await first.click();
  await selectLine(page);
  const tools = page.locator('[data-note-formatting]');
  await tools.getByRole('button', { name: '링크', exact: true }).click();
  await page.getByLabel('링크 주소').fill('https://example.com/first');
  await page.getByLabel('링크 주소').press('Enter');
  await expect(first.locator('a')).toHaveAttribute('href', 'https://example.com/first');
  await tools.getByRole('button', { name: '링크', exact: true }).click();
  await expect(page.getByLabel('링크 주소')).toHaveValue('https://example.com/first');
  await page.getByRole('button', { name: '링크 적용', exact: true }).click();
  await expect(first.locator('a')).toHaveAttribute('href', 'https://example.com/first');
  await tools.getByRole('button', { name: '링크', exact: true }).click();
  await page.getByLabel('링크 주소').fill('https://example.com/updated');
  await page.getByRole('button', { name: '링크 적용', exact: true }).click();
  await expect(first.locator('a')).toHaveAttribute('href', 'https://example.com/updated');
  await tools.getByRole('button', { name: '링크', exact: true }).click();
  await page.getByRole('button', { name: '링크 해제', exact: true }).click();
  await expect(first.locator('a')).toHaveCount(0);
  const table = page.locator('.on-doc table');
  await table.locator('td').first().click();
  await page.locator('[data-note-table-context]').getByLabel('행 편집', { exact: true }).click();
  await page.getByRole('menuitem', { name: '첫 행을 머리글로 사용' }).click();
  await expect(table.locator('th')).toHaveCount(2);
  await expect(table.locator('th').first()).toHaveText('이름');
  await page.keyboard.press('Escape');
  await table.locator('th').first().click();
  await page.keyboard.press('Control+z');
  await expect(table.locator('th')).toHaveCount(0);
});

test('페이지 검색·즐겨찾기·하위페이지·휴지통 복원이 다시 열어도 유지된다', async ({ page }) => {
  await writingFixture(page);
  await page.getByRole('button', { name: '페이지 설정', exact: true }).click();
  await page.getByRole('button', { name: '즐겨찾기 추가', exact: true }).click();
  await page.getByRole('button', { name: '하위 페이지 만들기', exact: true }).click();
  await page.getByLabel('노트 제목').fill('품질 검증');
  await page.getByLabel('노트 제목').press('Tab');
  const child = page.getByRole('navigation', { name: '노트 목록' }).getByRole('button', { name: '품질 검증', exact: true });
  await expect(child).toHaveAttribute('data-page-depth', '1');
  await page.getByLabel('노트 검색').fill('출시 준비');
  await expect(page.getByRole('navigation', { name: '노트 목록' }).getByRole('button', { name: '제품 구현 계획', exact: true })).toBeVisible();
  await expect(child).toHaveCount(0);
  await page.getByLabel('노트 검색').fill('');
  await page.getByRole('button', { name: '즐겨찾기', exact: true }).click();
  const parent = page.getByRole('navigation', { name: '노트 목록' }).getByRole('button', { name: '제품 구현 계획', exact: true });
  await parent.click();
  await page.getByRole('button', { name: '페이지 설정', exact: true }).click();
  await page.getByRole('button', { name: '휴지통으로 이동', exact: true }).click();
  await page.getByRole('button', { name: '모든 페이지', exact: true }).click();
  await expect(parent).toHaveCount(0);
  await expect(child).toHaveCount(0);
  await page.getByRole('button', { name: '휴지통', exact: true }).click();
  await parent.click();
  await page.getByRole('button', { name: '페이지 복원', exact: true }).click();
  await page.getByRole('button', { name: '모든 페이지', exact: true }).click();
  await expect(child).toBeVisible();
  await child.click();
  await page.getByRole('button', { name: '페이지 설정', exact: true }).click();
  await page.getByLabel('상위 페이지').selectOption('');
  await page.getByRole('button', { name: '완료', exact: true }).click();
  await expect(child).toHaveAttribute('data-page-depth', '0');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(child).toHaveAttribute('data-page-depth', '0');
  await page.getByRole('button', { name: '템플릿으로 만들기', exact: true }).click();
  await page.getByLabel('새 페이지 템플릿').selectOption('project');
  await page.getByRole('button', { name: '페이지 만들기', exact: true }).click();
  await expect(page.locator('.on-doc')).toContainText('목표');
});

test('코드 블록에서 줄바꿈·탭·붙여넣기와 언어 설정을 저장한다', async ({ page }) => {
  await writingFixture(page);
  const code = page.locator('.w-code');
  await code.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('return ready;');
  await expect(code).toHaveText('const ready = true;\n\treturn ready;');
  await page.getByLabel('코드 언어', { exact: true }).selectOption('typescript');
  await code.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await expect.poll(() => code.evaluate(node => node.contains(getSelection()?.anchorNode ?? null))).toBe(true);
  // Dispatch the same clipboard event handled by a native paste, without using the user's clipboard.
  await code.evaluate(node => {
    const data = new DataTransfer(); data.setData('text/plain', '\n// **literal**\n  done();');
    data.setData('text/html', '<p>not code</p>');
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(code).toContainText('// **literal**');
  await expect(page.locator('.w-code')).toHaveCount(1);
  await page.locator('.on-doc > p').last().click();
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(code).toContainText('// **literal**');
  await expect(code).toHaveAttribute('data-language', 'typescript');
});

test('HTML 붙여넣기는 커서 양쪽의 글과 공백·서식을 지키고 한 번에 실행 취소된다', async ({ page }) => {
  await writingFixture(page);
  const first = page.locator('.on-doc > p').first();
  await first.click(); await selectLine(page);
  await page.keyboard.type('AlphaOmega');
  await expect(first).toHaveText('AlphaOmega');
  await expect.poll(() => page.evaluate(() => getSelection()?.anchorOffset)).toBe(10);
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => getSelection()?.anchorOffset)).toBe(5);
  await first.evaluate(node => {
    const data = new DataTransfer(); data.setData('text/plain', 'Bold Link\nNext');
    data.setData('text/html', '<p><strong>Bold</strong> <a href="https://example.com">Link</a></p><p>Next</p>');
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(first).toHaveText('AlphaBold Link');
  await expect(first.locator('a')).toHaveText('Link');
  await expect(page.locator('.on-doc > p').nth(1)).toHaveText('NextOmega');
  await page.keyboard.press('Control+z');
  await expect(first).toHaveText('AlphaOmega');
  await expect(page.locator('.on-doc')).not.toContainText('NextOmega');
});

test('데이터베이스 항목은 Side peek에서 속성·본문을 편집하고 표·보드·저장에 반영한다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await writingFixture(page);
  await page.locator('.on-doc > p').last().hover();
  await page.getByRole('button', { name: '블록 추가', exact: true }).click();
  await page.locator('[data-note-insert] [data-note-control="insertNoteDatabase"]').click();
  const db = page.locator('[data-note-database-ui]').first();
  const peek = page.getByRole('dialog', { name: '데이터베이스 항목', exact: true });
  const fieldPopup = page.getByRole('dialog', { name: '필드 편집', exact: true });
  const choose = async (label: string, option: string) => {
    await page.getByLabel(label, { exact: true }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  const field = async (name: string, kind: string) => {
    await fieldPopup.getByLabel('필드 이름', { exact: true }).fill(name);
    await fieldPopup.getByLabel('필드 이름', { exact: true }).press('Enter');
    await fieldPopup.getByLabel('필드 유형', { exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(fieldPopup).toBeVisible();
    await expect(peek).toBeVisible();
    await choose('필드 유형', kind);
    await fieldPopup.getByRole('button', { name: '필드 편집 닫기', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(fieldPopup).toHaveCount(0);
  };
  await db.getByLabel('데이터베이스 이름', { exact: true }).fill('출시 작업');
  await db.getByLabel('데이터베이스 이름', { exact: true }).press('Enter');
  await db.getByRole('button', { name: '행 1 열기', exact: true }).click();
  await expect(peek).toBeVisible();
  await expect(peek).not.toHaveAttribute('aria-modal', 'true');
  await peek.getByLabel('항목 · 이름', { exact: true }).fill('배포 준비');
  await peek.getByLabel('항목 · 이름', { exact: true }).press('Tab');
  await choose('항목 · 상태', '진행 중');
  const body = peek.locator('[data-db-item-body] .on-doc');
  await body.locator('p').first().click();
  await page.keyboard.type('Release checklist');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Verify backup');
  await expect(body).toContainText('Release checklist');
  await expect(body).toContainText('Verify backup');
  await peek.getByRole('button', { name: '항목에 속성 추가', exact: true }).click();
  await field('예상 시간', '숫자');
  await expect(peek).toBeVisible();
  await peek.getByRole('button', { name: '항목 · 예상 시간', exact: true }).click();
  await peek.getByLabel('항목 · 예상 시간', { exact: true }).fill('10');
  await peek.getByLabel('항목 · 예상 시간', { exact: true }).press('Enter');
  await expect(peek.getByRole('button', { name: '항목 · 예상 시간', exact: true })).toHaveText('10');
  await peek.getByRole('button', { name: '항목에 속성 추가', exact: true }).click();
  await field('승인됨', '체크박스');
  await peek.getByRole('button', { name: '항목 · 승인됨', exact: true }).click();
  // The left-hand collection remains interactive while the item page is open.
  await db.getByRole('button', { name: '새 항목', exact: true }).click();
  await expect(peek).toBeVisible();
  await peek.getByRole('button', { name: '다음 항목', exact: true }).click();
  await peek.getByLabel('항목 · 이름', { exact: true }).fill('검증');
  await peek.getByLabel('항목 · 이름', { exact: true }).press('Tab');
  await expect(body).not.toContainText('Release checklist');
  await choose('항목 · 상태', '완료');
  await peek.getByRole('button', { name: '이전 항목', exact: true }).click();
  await expect(peek.getByLabel('항목 · 이름', { exact: true })).toHaveValue('배포 준비');
  await expect(body).toContainText('Verify backup');
  await peek.getByRole('button', { name: '전체 너비로 보기', exact: true }).click();
  expect((await peek.boundingBox())!.width).toBe(1440);
  await peek.getByRole('button', { name: '옆으로 보기', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('database-item-side-peek.png') });
  await peek.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(peek).toHaveCount(0);
  await expect(db.getByRole('button', { name: '행 1 열기', exact: true })).toHaveText('배포 준비');
  await db.getByRole('button', { name: '데이터베이스 보기 설정', exact: true }).click();
  await choose('정렬 필드', '이름');
  await expect(db.locator('tbody tr').first()).toHaveAttribute('data-db-record', '1');
  await choose('필터 필드', '상태');
  await db.getByLabel('필터 값', { exact: true }).fill('진행 중');
  await db.getByLabel('필터 값', { exact: true }).press('Enter');
  await expect(db.locator('tbody tr')).toHaveCount(1);
  await choose('필터 필드', '없음');
  await db.getByRole('button', { name: '보드', exact: true }).click();
  await choose('행 1 · 상태', '완료');
  await expect(db.getByRole('region', { name: '완료 그룹', exact: true }).locator('[data-db-record]')).toHaveCount(2);
  await page.getByLabel('노트 제목').click();
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(db.getByRole('tab', { name: '보드', exact: true })).toHaveAttribute('aria-selected', 'true');
  await db.getByRole('button', { name: '행 1 열기', exact: true }).click();
  await expect(peek.getByRole('button', { name: '항목 · 예상 시간', exact: true })).toHaveText('10');
  await expect(peek.getByRole('button', { name: '항목 · 승인됨', exact: true }).locator('[data-checked=true]')).toBeVisible();
  await expect(body).toContainText('Verify backup');
});

test('항목 본문의 빠른 전환·부모 실행 취소·문서 이동은 마지막 입력을 보존한다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await writingFixture(page);
  await page.locator('.on-doc > p').last().hover();
  await page.getByRole('button', { name: '블록 추가', exact: true }).click();
  await page.locator('[data-note-insert] [data-note-control="insertNoteDatabase"]').click();
  const db = page.locator('[data-note-database-ui]').first();
  await db.getByRole('button', { name: '새 항목', exact: true }).click();
  await db.getByRole('button', { name: '행 1 열기', exact: true }).click();
  const peek = page.getByRole('dialog', { name: '데이터베이스 항목', exact: true });
  const body = peek.locator('[data-db-item-body] .on-doc');
  await expect(peek.locator('.ondb-body-note')).toHaveCSS('border-top-width', '0px');
  await body.locator('p').first().click();
  await page.keyboard.type('First');
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  await peek.getByRole('button', { name: '다음 항목', exact: true }).click();
  await expect(body).not.toContainText('First');
  await body.locator('p').first().click();
  await page.keyboard.type('Second');
  await peek.getByRole('button', { name: '이전 항목', exact: true }).click();
  await expect(body).toHaveText('First');
  await peek.getByRole('button', { name: '항목 · 상태', exact: true }).click();
  await page.getByRole('option', { name: '진행 중', exact: true }).click();
  await body.locator('p').first().click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.type(' changed');
  await peek.getByRole('button', { name: '전체 너비로 보기', exact: true }).focus();
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.keyboard.press('Control+z');
  await expect(body).toHaveText('First');
  await body.locator('p').first().click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.type(' revised');
  // Switch the entire Note immediately, while the body's debounce is still pending.
  const nav = page.getByRole('navigation', { name: '노트 목록' });
  await nav.getByRole('button', { name: '첫 회의록', exact: true }).click();
  await nav.getByRole('button', { name: '제품 구현 계획', exact: true }).click();
  await db.getByRole('button', { name: '행 1 열기', exact: true }).click();
  await expect(body).toHaveText('First revised');
  await peek.getByRole('button', { name: '다음 항목', exact: true }).click();
  await expect(body).toHaveText('Second');
  await peek.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(false);
  await page.reload();
  await db.getByRole('button', { name: '행 1 열기', exact: true }).click();
  await expect(body).toHaveText('First revised');
});
