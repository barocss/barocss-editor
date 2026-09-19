import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function fixture(page: Page) {
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일').setInputFiles({ name: 'advanced.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: '연결된 업무' }, content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: '프로젝트와 업무를 연결하고 보기마다 필요한 정보만 표시합니다.' }] },
      { stype: 'noteDatabase', attributes: { source: 'tasks' } }, { stype: 'noteDatabase', attributes: { source: 'projects' } },
      { stype: 'resources', content: [
        { stype: 'dataset', attributes: { name: 'tasks', label: '업무', fields: [
          { name: '이름', kind: 'text' }, { name: '상태', kind: 'choice', options: ['진행 중', '완료'] }, { name: '수량', kind: 'number' }
        ], rowIds: ['t1', 't2'], records: [{ 이름: '출시 준비', 상태: '진행 중', 수량: 3 }, { 이름: '품질 검토', 상태: '완료', 수량: 1 }] } },
        { stype: 'dataset', attributes: { name: 'projects', label: '프로젝트 목록', fields: [
          { name: '이름', kind: 'text' }, { name: '예산', kind: 'number' }
        ], rowIds: ['p1', 'p2'], records: [{ 이름: '제품 출시', 예산: 10 }, { 이름: '사용자 조사', 예산: 20 }] } }
      ] }
    ] }
  })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('연결된 업무');
  await expect(page.locator('[data-note-database-ui]')).toHaveCount(2);
  return page.locator('[data-note-database-ui]').first();
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function addField(page: Page, name: string, kind: string) {
  await page.locator('[data-note-database-ui]').first().getByRole('button', { name: '필드 추가', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '필드 편집', exact: true });
  await editor.getByLabel('필드 이름', { exact: true }).fill(name);
  await editor.getByLabel('필드 이름', { exact: true }).press('Enter');
  await expect(editor.getByLabel('필드 이름', { exact: true })).toHaveValue(name);
  await choose(page, '필드 유형', kind);
  return editor;
}

test('관계·롤업·수식을 설정하고 연결된 항목의 편집과 저장 복원을 이어간다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const db = await fixture(page);
  let editor = await addField(page, '프로젝트', '관계');
  await choose(page, '관계 대상 데이터베이스', '프로젝트 목록');
  await editor.getByRole('button', { name: '관계 설정 적용' }).click();
  await editor.getByRole('button', { name: '필드 편집 닫기' }).click();
  await db.getByRole('button', { name: '행 1 · 프로젝트', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '행 1 · 프로젝트 관계 선택' });
  await picker.getByLabel('연결할 항목 검색').fill('출시');
  await expect(picker.getByRole('option')).toHaveCount(1);
  await picker.getByRole('option', { name: '제품 출시', exact: true }).click();
  await picker.getByLabel('연결할 항목 검색').fill('');
  await picker.getByRole('option', { name: '사용자 조사', exact: true }).click();
  await expect(picker.getByRole('option', { name: '제품 출시', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(picker.getByRole('option', { name: '사용자 조사', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: testInfo.outputPath('relation-picker.png') });
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);

  editor = await addField(page, '예산 합계', '롤업');
  await choose(page, '롤업 관계 속성', '프로젝트');
  await choose(page, '롤업 대상 속성', '예산');
  await choose(page, '롤업 계산', '합계');
  await editor.getByRole('button', { name: '롤업 설정 적용' }).click();
  await editor.getByRole('button', { name: '필드 편집 닫기' }).click();
  await expect(db.getByLabel('행 1 · 예산 합계', { exact: true })).toHaveText('30');

  editor = await addField(page, '가중 예산', '수식');
  await editor.getByLabel('수식', { exact: true }).fill('prop("예산 합계") * prop("수량")');
  await expect(editor.getByLabel('수식 결과 미리보기')).toHaveText('첫 항목: 90');
  await page.screenshot({ path: testInfo.outputPath('formula-editor.png') });
  await editor.getByRole('button', { name: '수식 적용', exact: true }).click();
  await editor.getByLabel('수식', { exact: true }).fill('prop("없는 속성") * 2');
  await expect(editor.getByRole('button', { name: '수식 적용', exact: true })).toBeDisabled();
  await expect(editor.getByRole('alert')).toContainText('찾을 수 없는 속성');
  await editor.getByRole('button', { name: '필드 편집 닫기' }).click();
  await expect(db.getByLabel('행 1 · 가중 예산', { exact: true })).toHaveText('90');

  await db.getByRole('button', { name: '행 1 열기', exact: true }).click();
  const peek = page.getByRole('dialog', { name: '데이터베이스 항목', exact: true });
  await expect(peek.getByLabel('항목 · 예산 합계', { exact: true })).toHaveAttribute('data-db-computed', 'true');
  await peek.getByRole('button', { name: '제품 출시 항목 열기', exact: true }).click();
  await expect(peek).toHaveCount(1);
  await expect(peek.getByLabel('항목 · 이름', { exact: true })).toHaveValue('제품 출시');
  await peek.getByRole('button', { name: '항목 · 예산', exact: true }).click();
  await peek.getByRole('spinbutton', { name: '항목 · 예산', exact: true }).fill('15');
  await peek.getByRole('spinbutton', { name: '항목 · 예산', exact: true }).press('Enter');
  await peek.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(db.getByLabel('행 1 · 예산 합계', { exact: true })).toHaveText('35');
  await expect(db.getByLabel('행 1 · 가중 예산', { exact: true })).toHaveText('105');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(db.getByLabel('행 1 · 가중 예산', { exact: true })).toHaveText('105');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '내보내기', exact: true }).click();
  await page.getByRole('button', { name: '파일 내려받기', exact: true }).click();
  const file = await download;
  const exported = JSON.parse(await readFile((await file.path())!, 'utf8'));
  const datasets = exported.document.content.find((node: { stype: string }) => node.stype === 'resources').content;
  const tasks = datasets.find((node: { attributes: { name: string } }) => node.attributes.name === 'tasks').attributes;
  expect(tasks.records[0].프로젝트).toEqual(['p1', 'p2']);
  // The field started as an empty text property; computation must leave that raw value untouched.
  expect(tasks.records[0]['가중 예산']).toBe('');
  expect(tasks.fields.find((field: { name: string }) => field.name === '가중 예산').formula.expression).toBe('prop("예산 합계") * prop("수량")');
  await page.setViewportSize({ width: 390, height: 844 });
  await db.getByRole('button', { name: '가중 예산 필드 편집', exact: true }).click();
  const popup = page.getByRole('dialog', { name: '필드 편집', exact: true });
  const bounds = (await popup.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await expect(popup.getByRole('button', { name: '수식 적용', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('formula-mobile.png') });
});

test('저장된 보기의 필터·정렬·속성 표시가 독립적이고 복제·삭제·다시 열기에 유지된다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const db = await fixture(page);
  await db.getByRole('button', { name: '보기 추가', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(db.getByRole('button', { name: '보기 추가', exact: true })).toBeFocused();
  await db.getByRole('button', { name: '보기 추가', exact: true }).click();
  await page.getByLabel('새 보기 이름', { exact: true }).fill('진행 업무');
  await page.getByRole('button', { name: '보드 보기', exact: true }).click();
  await page.getByRole('button', { name: '보기 만들기', exact: true }).click();
  await expect(db.getByRole('tab', { name: '진행 업무', exact: true })).toHaveAttribute('aria-selected', 'true');
  await db.getByRole('button', { name: '데이터베이스 보기 설정', exact: true }).click();
  await choose(page, '필터 필드', '상태');
  await db.getByLabel('필터 값', { exact: true }).fill('진행 중');
  await db.getByLabel('필터 값', { exact: true }).press('Enter');
  await choose(page, '정렬 필드', '수량');
  await choose(page, '정렬 방향', '내림차순');
  await db.getByRole('button', { name: '보기에 표시할 속성', exact: true }).click();
  await expect(page.getByLabel('이름 속성 표시', { exact: true })).toBeDisabled();
  await page.getByLabel('수량 속성 표시', { exact: true }).uncheck();
  await page.keyboard.press('Escape');
  await expect(db.locator('[data-db-record]')).toHaveCount(1);
  await expect(db.locator('[data-db-field="수량"]')).toHaveCount(0);
  await db.getByRole('tab', { name: '테이블', exact: true }).click();
  await expect(db.locator('tbody tr')).toHaveCount(2);
  await expect(db.locator('[data-db-field="수량"]')).toHaveCount(2);
  await expect(db.getByRole('combobox', { name: '정렬 필드', exact: true })).toHaveText('없음');
  await db.getByRole('tab', { name: '진행 업무', exact: true }).click();
  await expect(db.getByRole('combobox', { name: '정렬 방향', exact: true })).toHaveText('내림차순');
  await db.getByRole('button', { name: '현재 보기 메뉴', exact: true }).click();
  await page.getByLabel('보기 이름', { exact: true }).fill('출시 보드');
  await page.getByLabel('보기 이름', { exact: true }).press('Enter');
  await page.getByRole('menuitem', { name: '보기 복제', exact: true }).click();
  await expect(db.getByRole('tab', { name: '출시 보드 복사본', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(db.locator('[data-db-record]')).toHaveCount(1);
  await db.getByRole('button', { name: '현재 보기 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: '보기 삭제', exact: true }).click();
  await expect(db.getByRole('tab')).toHaveCount(2);
  await db.getByRole('button', { name: '데이터베이스 보기 설정', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('saved-views.png') });
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(db.getByRole('tab', { name: '출시 보드', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(db.locator('[data-db-record]')).toHaveCount(1);
  await expect(db.locator('[data-db-field="수량"]')).toHaveCount(0);
  await db.getByRole('tab', { name: '테이블', exact: true }).click();
  await expect(db.locator('tbody tr')).toHaveCount(2);
});
