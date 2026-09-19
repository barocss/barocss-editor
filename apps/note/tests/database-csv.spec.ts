import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('database CSV previews, appends atomically, undoes and exports saved rows', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'csv.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: 'CSV 데이터 검증' }, content: [
    { stype: 'noteDatabase', attributes: { source: 'data' } }, { stype: 'resources', content: [{ stype: 'dataset', attributes: { name: 'data', label: '연락처', kind: 'inline', fields: [{ name: '이름', kind: 'text' }, { name: '수', kind: 'number' }], records: [{ 이름: '기존', 수: 1 }], rowIds: ['existing'] } }] }
  ] } })) });
  const db = page.locator('[data-note-database-ui]'); await expect(db.locator('[data-db-record]')).toHaveCount(1);
  await db.getByRole('button', { name: '데이터베이스 CSV', exact: true }).click();
  const picker = db.getByLabel('데이터베이스 CSV 파일');
  await picker.setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from('이름,수\n실패,no') });
  await expect(db.getByRole('alert')).toContainText('올바른 숫자');
  await expect(db.locator('[data-db-record]')).toHaveCount(1);
  await picker.setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from('이름,수\r\n"한글\n이름",2\r\n새 행,3') });
  await expect(db.getByText('people.csv · 2개 행')).toBeVisible();
  await expect(db.locator('[data-db-record]')).toHaveCount(1);
  await db.getByRole('button', { name: '행 추가하기', exact: true }).click();
  await expect(db.locator('[data-db-record]')).toHaveCount(3);
  await db.getByRole('button', { name: '데이터베이스 CSV', exact: true }).focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(db.locator('[data-db-record]')).toHaveCount(1);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
  await expect(db.locator('[data-db-record]')).toHaveCount(3);
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨'); await page.reload();
  await expect(db.locator('[data-db-record]')).toHaveCount(3);
  await db.getByRole('button', { name: '데이터베이스 CSV', exact: true }).click();
  const downloading = page.waitForEvent('download'); await db.getByRole('menuitem', { name: '전체 행 CSV 내보내기' }).click();
  const download = await downloading; const source = await readFile((await download.path())!, 'utf8');
  expect(source).toContain('"기존","1"'); expect(source).toContain('"한글\n이름","2"'); expect(source).toContain('"새 행","3"');
});
