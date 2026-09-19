import { readFile } from 'node:fs/promises';
import { test, expect, type Page, type Locator } from '@playwright/test';

async function fixture(page: Page) {
  await page.goto('/');
  await expect(page.getByLabel('노트 파일')).toBeEnabled();
  const month = await page.evaluate(() => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; });
  await page.getByLabel('노트 파일').setInputFiles({ name: 'layouts.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: '제품 일정' }, content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: '자료와 일정을 같은 데이터로 관리합니다.' }] },
      { stype: 'noteDatabase', attributes: { source: 'tasks' } },
      { stype: 'resources', content: [
        { stype: 'dataset', attributes: { name: 'tasks', label: '출시 업무', fields: [
          { name: '이름', kind: 'text' }, { name: '상태', kind: 'choice', options: ['진행 중', '완료'] }, { name: '수량', kind: 'number' }, { name: '마감', kind: 'date' }
        ], rowIds: ['task-a', 'task-b', 'task-c', 'task-d'], records: [
          { 이름: 'Alpha', 상태: '진행 중', 수량: 3, 마감: `${month}-10` },
          { 이름: 'Beta', 상태: '완료', 수량: 1, 마감: `${month}-12` },
          { 이름: 'Gamma', 상태: '진행 중', 수량: 1, 마감: '' },
          { 이름: 'Delta', 상태: '완료', 수량: 3, 마감: 'invalid-date' }
        ] } },
        { stype: 'richText', attributes: { id: 'task-a' }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '출시 전 실제 본문 미리보기입니다.' }] }] }
      ] }
    ] }
  })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('제품 일정');
  const db = page.locator('[data-note-database-ui]');
  await expect(db.locator('[data-db-record]')).toHaveCount(4);
  return { db, month };
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function createView(page: Page, db: Locator, name: string, layout: string) {
  await db.getByRole('button', { name: '보기 추가', exact: true }).click();
  await page.getByLabel('새 보기 이름', { exact: true }).fill(name);
  await page.getByRole('button', { name: `${layout} 보기`, exact: true }).click();
  await page.getByRole('button', { name: '보기 만들기', exact: true }).click();
  await expect(db.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
}

test('갤러리 본문·카드 설정과 캘린더 날짜 추가·이동을 저장하고 복원한다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1360, height: 1000 });
  const { db, month } = await fixture(page);
  await createView(page, db, '자료 모음', '갤러리');
  await expect(db.locator('[data-db-gallery]')).toBeVisible();
  await expect(db.getByRole('button', { name: 'Alpha 본문 열기' })).toContainText('실제 본문 미리보기');
  await expect(db.locator('.ondb-gallery-preview')).toHaveCount(1);
  await db.getByRole('button', { name: 'Alpha 본문 열기' }).click();
  const peek = page.getByRole('dialog', { name: '데이터베이스 항목', exact: true });
  await expect(peek.locator('[data-db-item-body]')).toContainText('출시 전 실제 본문');
  await peek.getByRole('button', { name: '닫기', exact: true }).click();
  await db.getByRole('button', { name: '데이터베이스 보기 설정', exact: true }).click();
  await choose(page, '카드 크기', '크게');
  await choose(page, '카드 미리보기', '미리보기 없음');
  await expect(db.locator('.ondb-gallery-preview')).toHaveCount(0);
  await choose(page, '카드 미리보기', '본문 미리보기');
  await expect(db.locator('[data-db-gallery]')).toHaveAttribute('data-card-size', 'large');
  await page.screenshot({ path: testInfo.outputPath('gallery.png') });

  await createView(page, db, '출시 일정', '캘린더');
  await expect(db.locator('[data-db-calendar]')).toBeVisible();
  await expect(db.locator(`[data-db-calendar-day="${month}-10"]`)).toContainText('Alpha');
  await expect(db.getByLabel('날짜 미지정 항목')).toContainText('Gamma');
  await expect(db.getByLabel('날짜 미지정 항목')).toContainText('Delta');
  // Keep both endpoints visible before pressing: scrolling during dragTo interrupts native drag initiation.
  await db.locator(`[data-db-calendar-day="${month}-14"]`).scrollIntoViewIfNeeded();
  await expect(db.locator('[data-db-calendar-event="0"]')).toHaveAttribute('draggable', 'true');
  await db.locator('[data-db-calendar-event="0"]').dragTo(db.locator(`[data-db-calendar-day="${month}-14"]`));
  await expect(db.locator(`[data-db-calendar-day="${month}-14"] [data-db-calendar-event="0"]`)).toBeVisible();
  await expect(page.locator('.nw-document .on-doc > p').first()).toHaveText('자료와 일정을 같은 데이터로 관리합니다.');
  await db.getByRole('button', { name: `${month}-15에 항목 추가`, exact: true }).click();
  await expect(db.locator(`[data-db-calendar-day="${month}-15"] [data-db-calendar-event]`)).toHaveCount(1);
  await db.locator(`[data-db-calendar-day="${month}-15"] [data-db-calendar-event]`).click();
  await expect(peek.getByLabel('항목 · 마감', { exact: true })).toContainText(`${month}-15`);
  await peek.getByRole('button', { name: '닫기', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('calendar.png') });
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(db.getByRole('tab', { name: '출시 일정', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(db.locator(`[data-db-calendar-day="${month}-14"]`)).toContainText('Alpha');
  await expect(db.locator(`[data-db-calendar-day="${month}-15"] [data-db-calendar-event]`)).toHaveCount(1);
  await expect(page.locator('.nw-document .on-doc > p').first()).toHaveText('자료와 일정을 같은 데이터로 관리합니다.');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '내보내기', exact: true }).click();
  await page.getByRole('button', { name: '파일 내려받기', exact: true }).click();
  const exported = JSON.parse(await readFile((await (await downloaded).path())!, 'utf8'));
  expect(exported.document.content[0]).toMatchObject({ stype: 'paragraph', content: [{ stype: 'inline-text', text: '자료와 일정을 같은 데이터로 관리합니다.' }] });
  const resources = exported.document.content.find((node: { stype: string }) => node.stype === 'resources');
  const body = resources.content.find((node: { stype: string; attributes?: { id?: string } }) => node.stype === 'richText' && node.attributes?.id === 'task-a');
  expect(body.content).toMatchObject([{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '출시 전 실제 본문 미리보기입니다.' }] }]);
  await db.getByRole('tab', { name: '자료 모음', exact: true }).click();
  await expect(db.locator('[data-db-gallery]')).toHaveAttribute('data-card-size', 'large');
  await expect(db.locator('[data-db-gallery-row]')).toHaveCount(5);
  await page.setViewportSize({ width: 390, height: 844 });
  const gallery = (await db.locator('[data-db-gallery]').boundingBox())!;
  expect(gallery.x).toBeGreaterThanOrEqual(0);
  expect(gallery.x + gallery.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('gallery-mobile.png') });
  await db.getByRole('tab', { name: '출시 일정', exact: true }).click();
  const calendar = (await db.locator('[data-db-calendar]').boundingBox())!;
  expect(calendar.x + calendar.width).toBeLessThanOrEqual(390);
});

test('중첩 OR 필터와 다중 정렬은 적용 전 취소·보기 독립·재로드를 보장한다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 950 });
  const { db } = await fixture(page);
  await createView(page, db, '우선순위', '테이블');
  await db.getByRole('button', { name: '데이터베이스 보기 설정', exact: true }).click();
  await db.getByRole('button', { name: '고급 필터', exact: true }).click();
  const filter = page.getByRole('dialog', { name: '고급 필터', exact: true });
  await filter.getByRole('button', { name: '조건 추가', exact: true }).click();
  await choose(page, '조건 1.1 속성', '수량');
  await choose(page, '조건 1.1 연산자', '이상');
  await filter.getByLabel('조건 1.1 값', { exact: true }).fill('3');
  await filter.getByRole('button', { name: '조건 그룹 추가', exact: true }).click();
  await choose(page, '조건 그룹 1.2 결합', '하나 이상 (OR)');
  const group = filter.locator('[data-filter-depth="1"]');
  await group.getByRole('button', { name: '조건 추가', exact: true }).click();
  await choose(page, '조건 1.2.1 속성', '상태');
  await choose(page, '조건 1.2.1 연산자', '일치');
  await choose(page, '조건 1.2.1 값', '진행 중');
  await group.getByRole('button', { name: '조건 추가', exact: true }).click();
  await choose(page, '조건 1.2.2 연산자', '포함');
  await filter.getByLabel('조건 1.2.2 값', { exact: true }).fill('Delta');
  await expect(db.locator('[data-db-record]')).toHaveCount(4);
  await page.screenshot({ path: testInfo.outputPath('compound-filter.png') });
  await filter.getByRole('button', { name: '필터 적용', exact: true }).click();
  await expect(filter).toHaveCount(0);
  await expect(db.locator('[data-db-record]')).toHaveCount(2);
  await expect(db.locator('[data-db-record] .ondb-title-link')).toHaveText(['Alpha', 'Delta']);
  await db.getByRole('button', { name: '고급 필터', exact: true }).click();
  await filter.getByRole('button', { name: '조건 모두 지우기', exact: true }).click();
  await filter.getByRole('button', { name: '취소', exact: true }).click();
  await expect(db.locator('[data-db-record]')).toHaveCount(2);
  await db.getByRole('button', { name: '고급 필터', exact: true }).click();
  await filter.getByRole('button', { name: '조건 모두 지우기', exact: true }).click();
  await filter.getByRole('button', { name: '필터 적용', exact: true }).click();
  await expect(db.locator('[data-db-record]')).toHaveCount(4);

  await db.getByRole('button', { name: '다중 정렬', exact: true }).click();
  const sort = page.getByRole('dialog', { name: '다중 정렬', exact: true });
  await sort.getByRole('button', { name: '정렬 추가', exact: true }).click();
  await choose(page, '정렬 1 속성', '수량');
  await choose(page, '정렬 1 방향', '내림차순');
  await sort.getByRole('button', { name: '정렬 추가', exact: true }).click();
  await choose(page, '정렬 2 방향', '내림차순');
  await sort.getByRole('button', { name: '정렬 적용', exact: true }).click();
  await expect(db.locator('[data-db-record] .ondb-title-link')).toHaveText(['Delta', 'Alpha', 'Gamma', 'Beta']);
  await db.getByRole('tab', { name: '테이블', exact: true }).click();
  await expect(db.locator('[data-db-record] .ondb-title-link')).toHaveText(['Alpha', 'Beta', 'Gamma', 'Delta']);
  await db.getByRole('tab', { name: '우선순위', exact: true }).click();
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(db.locator('[data-db-record] .ondb-title-link')).toHaveText(['Delta', 'Alpha', 'Gamma', 'Beta']);
  await db.getByRole('button', { name: '데이터베이스 보기 설정', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await db.getByRole('button', { name: '고급 필터', exact: true }).click();
  await filter.getByRole('button', { name: '조건 추가', exact: true }).click();
  await filter.getByRole('combobox', { name: '조건 1.1 속성', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(filter).toBeVisible();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  const bounds = (await filter.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: testInfo.outputPath('filter-mobile.png') });
  await page.keyboard.press('Escape');
  await expect(filter).toHaveCount(0);
  await expect(db.getByRole('button', { name: '고급 필터', exact: true })).toBeFocused();
});

test('공통 보기 입력은 조합 입력을 지키고 잘못된 필터 값은 적용을 막는다', async ({ page }) => {
  const { db } = await fixture(page);
  await db.getByRole('button', { name: '보기 추가', exact: true }).click();
  const name = page.getByRole('textbox', { name: '새 보기 이름', exact: true });
  await expect(name).toBeFocused();
  await name.fill('검토용');
  await name.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(page.getByRole('dialog', { name: '새 보기', exact: true })).toBeVisible();
  await name.press('Enter');
  await expect(db.getByRole('tab', { name: '검토용', exact: true })).toHaveAttribute('aria-selected', 'true');
  await db.getByRole('button', { name: '데이터베이스 보기 설정', exact: true }).click();
  await db.getByRole('button', { name: '고급 필터', exact: true }).click();
  const filter = page.getByRole('dialog', { name: '고급 필터', exact: true });
  await expect(filter).toContainText('조건이 없으면 모든 항목');
  await filter.getByRole('button', { name: '조건 추가', exact: true }).click();
  await choose(page, '조건 1.1 속성', '수량');
  await choose(page, '조건 1.1 연산자', '이상');
  await filter.getByLabel('조건 1.1 값', { exact: true }).fill('');
  await expect(filter.getByRole('button', { name: '필터 적용', exact: true })).toBeDisabled();
  await expect(filter.getByRole('status')).toContainText('비교할 숫자');
  await expect(db.locator('[data-db-record]')).toHaveCount(4);
  await page.screenshot({ path: '../../.dev/artifacts/design-system/note-filter-error.png' });
  await filter.getByLabel('조건 1.1 값', { exact: true }).fill('3');
  await filter.getByRole('button', { name: '필터 적용', exact: true }).click();
  await expect(filter).toHaveCount(0);
  await expect(db.locator('[data-db-record] .ondb-title-link')).toHaveText(['Alpha', 'Delta']);
  await db.getByRole('button', { name: '보기에 표시할 속성', exact: true }).click();
  await expect(page.getByLabel('이름 속성 표시', { exact: true })).toBeDisabled();
  await page.getByLabel('수량 속성 표시', { exact: true }).uncheck();
  await page.screenshot({ animations: 'disabled', path: '../../.dev/artifacts/design-system/note-visible-properties.png' });
  await page.getByRole('dialog', { name: '속성 표시 설정' }).getByRole('button', { name: '닫기', exact: true }).click();
  await expect(db.getByRole('button', { name: '보기에 표시할 속성', exact: true })).toBeFocused();
});
