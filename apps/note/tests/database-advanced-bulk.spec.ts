import { test, expect } from '@playwright/test';
test('advanced bulk choices and relations update computed values and expose formula settings', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'advanced-bulk.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: '고급 속성 검증' }, content: [
    { stype: 'noteDatabase', attributes: { source: 'data' } }, { stype: 'resources', content: [{ stype: 'dataset', attributes: { name: 'data', label: '업무', kind: 'inline', fields: [
      { name: '이름', kind: 'text' }, { name: '태그', kind: 'choices', options: ['기존', '추가'] }, { name: '수', kind: 'number' },
      { name: '계산', kind: 'formula', formula: { expression: 'prop("수") * 2' } },
      { name: '연결', kind: 'relation', relation: { source: 'data', multiple: true } }, { name: '합계', kind: 'rollup', rollup: { relationField: '연결', field: '계산', operation: 'sum' } }
    ], rowIds: ['a','b'], records: [{ 이름: 'A', 태그: ['기존'], 수: 2, 연결: [] }, { 이름: 'B', 태그: [], 수: 3, 연결: [] }] } }] }
  ] } })) });
  const db = page.locator('[data-note-database-ui]'); await expect(db.locator('[data-db-record]')).toHaveCount(2);
  await db.getByRole('checkbox', { name: '보이는 행 전체 선택' }).click();
  const bulk = db.getByRole('group', { name: '선택한 행 일괄 작업' });
  await bulk.getByLabel('일괄 변경 필드').selectOption('태그');
  await bulk.getByRole('button', { name: '일괄 변경 값', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: '추가', exact: true }).click(); await page.keyboard.press('Escape');
  await bulk.getByLabel('일괄 선택 적용 방식').selectOption('add');
  await bulk.getByRole('button', { name: '선택 행에 적용' }).click();
  await expect(db.getByRole('button', { name: '행 1 · 태그', exact: true })).toContainText('기존');
  await expect(db.getByRole('button', { name: '행 1 · 태그', exact: true })).toContainText('추가');
  await expect(db.getByRole('button', { name: '행 2 · 태그', exact: true })).toContainText('추가');
  await bulk.getByLabel('일괄 변경 필드').selectOption('연결');
  await bulk.getByRole('button', { name: '일괄 변경 값', exact: true }).click();
  await page.getByRole('option', { name: 'B', exact: true }).click(); await page.keyboard.press('Escape');
  await bulk.getByRole('button', { name: '선택 행에 적용' }).click();
  await expect(db.locator('[data-db-record="0"] [data-db-field="합계"]')).toHaveText('6');
  await bulk.getByLabel('일괄 변경 필드').selectOption('계산');
  await expect(bulk.getByRole('button', { name: '선택 행에 적용' })).toBeDisabled();
  await bulk.getByRole('button', { name: '계산 설정 열기' }).click();
  await expect(page.getByLabel('수식', { exact: true })).toBeVisible();
  await page.getByLabel('수식', { exact: true }).fill('prop("수") * 3');
  await page.getByRole('button', { name: '수식 적용', exact: true }).click();
  await page.getByRole('button', { name: '필드 편집 닫기', exact: true }).click();
  await expect(db.locator('[data-db-record="0"] [data-db-field="합계"]')).toHaveText('9');
  await bulk.getByLabel('일괄 변경 필드').selectOption('합계');
  await bulk.getByRole('button', { name: '계산 설정 열기' }).click();
  await page.getByRole('combobox', { name: '롤업 계산', exact: true }).click();
  await page.getByRole('option', { name: '개수', exact: true }).click();
  await page.getByRole('button', { name: '롤업 설정 적용', exact: true }).click();
  await page.getByRole('button', { name: '필드 편집 닫기', exact: true }).click();
  await expect(db.locator('[data-db-record="0"] [data-db-field="합계"]')).toHaveText('1');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨'); await page.reload();
  await expect(db.locator('[data-db-record="0"] [data-db-field="합계"]')).toHaveText('1');
  await expect(db.getByRole('button', { name: '행 1 · 태그', exact: true })).toContainText('기존');
});
