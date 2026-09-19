import { test, expect } from '@playwright/test';
test('range paste respects filtered rows, undoes atomically, refuses overflow and persists', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'bulk.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: '일괄 검증' }, content: [
    { stype: 'noteDatabase', attributes: { source: 'data', where: '그룹', equals: '보임' } }, { stype: 'resources', content: [{ stype: 'dataset', attributes: { name: 'data', label: '업무', kind: 'inline', fields: [{ name: '이름', kind: 'text' }, { name: '상태', kind: 'text' }, { name: '수', kind: 'number' }, { name: '그룹', kind: 'text' }], records: [{ 이름: 'A', 상태: '', 그룹: '보임' }, { 이름: 'B', 상태: '', 그룹: '숨김' }, { 이름: 'C', 상태: '', 그룹: '보임' }], rowIds: ['a','b','c'] } }] }
  ] } })) });
  const db = page.locator('[data-note-database-ui]'), rows = db.locator('[data-db-record]');
  await expect(rows).toHaveCount(2);
  const cell = db.getByRole('button', { name: '행 1 · 상태', exact: true });
  await cell.focus();
  const paste = async (text: string) => cell.evaluate((element, value) => {
    const data = new DataTransfer(); data.setData('text/plain', value);
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  }, text);
  await paste('First\t10\nLast\t20');
  await expect(db.getByRole('button', { name: '행 1 · 상태', exact: true })).toHaveText('First');
  await expect(db.getByRole('button', { name: '행 3 · 상태', exact: true })).toHaveText('Last');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(db.getByRole('button', { name: '행 1 · 상태', exact: true })).toHaveText('비어 있음');
  await paste('First\t10\nLast\t20');
  await paste('1\n2\n3');
  await expect(db.getByRole('alert')).toContainText('행이 부족');
  await expect(db.getByRole('button', { name: '행 1 · 상태', exact: true })).toHaveText('First');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨'); await page.reload();
  await expect(db.getByRole('button', { name: '행 3 · 상태', exact: true })).toHaveText('Last');
  await expect(db.locator('.ondb-count')).toContainText('전체 3');
});
