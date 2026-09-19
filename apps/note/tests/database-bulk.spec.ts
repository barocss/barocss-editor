import { test, expect } from '@playwright/test';
test('database arrow navigation and visible-row bulk edit/delete preserve undo and save', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'bulk.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: '일괄 검증' }, content: [
    { stype: 'noteDatabase', attributes: { source: 'data', where: '그룹', equals: '보임' } }, { stype: 'resources', content: [{ stype: 'dataset', attributes: { name: 'data', label: '업무', kind: 'inline', fields: [{ name: '이름', kind: 'text' }, { name: '상태', kind: 'text' }, { name: '그룹', kind: 'text' }], records: [{ 이름: 'A', 상태: '', 그룹: '보임' }, { 이름: 'B', 상태: '', 그룹: '숨김' }, { 이름: 'C', 상태: '', 그룹: '보임' }], rowIds: ['a','b','c'] } }] }
  ] } })) });
  const db = page.locator('[data-note-database-ui]'), rows = db.locator('[data-db-record]');
  await expect(rows).toHaveCount(2);
  await db.getByRole('button', { name: '행 1 · 상태', exact: true }).focus();
  await page.keyboard.press('ArrowDown'); await expect(db.getByRole('button', { name: '행 3 · 상태', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(db.getByRole('button', { name: '행 3 · 그룹', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter');
  await expect(db.getByRole('textbox', { name: '행 3 · 상태', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await db.getByRole('checkbox', { name: '보이는 행 전체 선택', exact: true }).click();
  const bulk = db.getByRole('group', { name: '선택한 행 일괄 작업' }); await expect(bulk).toContainText('2개 선택');
  await bulk.getByLabel('일괄 변경 필드').selectOption('상태');
  await bulk.getByRole('button', { name: '일괄 변경 값' }).click();
  await bulk.getByRole('textbox', { name: '일괄 변경 값' }).fill('완료'); await page.keyboard.press('Enter');
  await bulk.getByRole('button', { name: '선택 행에 적용' }).click();
  await expect(db.getByRole('button', { name: '행 1 · 상태', exact: true })).toHaveText('완료');
  await expect(db.getByRole('button', { name: '행 3 · 상태', exact: true })).toHaveText('완료');
  await bulk.getByRole('button', { name: '선택 행 삭제' }).click(); await expect(rows).toHaveCount(0); await expect(db.locator('.ondb-count')).toContainText('전체 1');
  await db.getByRole('button', { name: '새 항목', exact: true }).focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await expect(rows).toHaveCount(2);
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨'); await page.reload(); await expect(rows).toHaveCount(2);
  await expect(db.getByRole('button', { name: '행 3 · 상태', exact: true })).toHaveText('완료');
});
