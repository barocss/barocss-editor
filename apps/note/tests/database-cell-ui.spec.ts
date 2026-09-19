import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('table cell editing keeps row selection and keyboard navigation reaches computed values', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  await expect(page.getByLabel('노트 파일', { exact: true })).toBeEnabled();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'table-ui.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: '표 UI 검증' }, content: [
      { stype: 'noteDatabase', attributes: { source: 'tasks' } },
      { stype: 'resources', content: [{ stype: 'dataset', attributes: { name: 'tasks', label: '출시 업무', fields: [
        { name: '이름', kind: 'text' }, { name: '메모', kind: 'text' }, { name: '예산', kind: 'number' }, { name: '합계', kind: 'formula', formula: { expression: '1+2' } }
      ], rowIds: ['a', 'b'], records: [{ 이름: '출시 문서', 메모: '검토 전', 예산: 1840000 }, { 이름: '고객 요청', 메모: '정리 중', 예산: 325000 }] } }] }
    ] }
  })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('표 UI 검증');
  const db = page.locator('[data-note-database-ui]');
  const first = db.locator('[data-db-record="0"]');
  const memo = db.getByRole('button', { name: '행 1 · 메모', exact: true });
  await db.getByRole('checkbox', { name: '행 1 선택', exact: true }).click();
  await memo.click();
  const input = db.getByRole('textbox', { name: '행 1 · 메모', exact: true });
  await expect(input).toBeFocused();
  await input.press('Enter'); await expect(memo).toBeFocused(); // unchanged input also ends editing
  await memo.press('Enter'); await input.fill('취소 초안'); await input.press('Escape');
  await expect(memo).toHaveText('검토 전'); await expect(memo).toBeFocused();
  await memo.press('Enter'); await input.fill('검토 완료'); await input.press('Enter');
  await expect(memo).toHaveText('검토 완료'); await expect(first).toHaveAttribute('data-row-selected', 'true');
  await memo.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await expect(first.locator('[data-db-computed]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(db.locator('[data-db-record="1"] [data-db-computed]')).toBeFocused();
  const output = `${process.cwd()}/../../.dev/artifacts/design-system`;
  await mkdir(output, { recursive: true });
  await db.screenshot({ path: `${output}/data-table-note.png` });
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload(); await expect(memo).toHaveText('검토 완료');
});
