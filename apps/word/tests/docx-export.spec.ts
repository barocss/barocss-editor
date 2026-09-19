import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('DOCX export reports fidelity before downloading and keeps the active document', async ({ page }) => {
 await page.goto('/?sample'); await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
 await page.getByRole('button', { name: '문서 작업', exact: true }).click();
 const before = await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
 await page.getByRole('button', { name: 'DOCX 내보내기', exact: true }).click();
 const dialog = page.getByRole('dialog', { name: 'DOCX 내보내기', exact: true }); await expect(dialog).toBeVisible();
 await expect(dialog).toContainText('원본은 .word.json으로 보관하세요');
 await dialog.getByRole('button', { name: '취소', exact: true }).click(); await expect(dialog).toBeHidden();
 await page.getByRole('button', { name: 'DOCX 내보내기', exact: true }).click();
 const pending = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'DOCX 다운로드', exact: true }).click();
 const download = await pending; expect(download.suggestedFilename()).toBe('Barocss Word.docx');
 await download.saveAs('/tmp/barocss-word-export.docx');
 const bytes = await readFile('/tmp/barocss-word-export.docx'); expect(bytes.subarray(0, 2).toString()).toBe('PK');
 await expect(dialog).toBeHidden();
 await expect(page.getByRole('dialog', { name: '문서 작업', exact: true })).toContainText('DOCX 다운로드 요청됨');
 expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(before);
});

test('DOCX conversion and download errors can be retried without changing the document', async ({ page }) => {
 await page.goto('/?sample'); await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
 const before = await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
 await page.getByRole('button', { name: '문서 작업', exact: true }).click();
 await page.evaluate(() => {
   const ed = (window as any).editor, original = ed.exportDocument;
   ed.exportDocument = () => { ed.exportDocument = original; throw new Error('test conversion failure'); };
 });
 await page.getByRole('button', { name: 'DOCX 내보내기', exact: true }).click();
 const dialog = page.getByRole('dialog', { name: 'DOCX 내보내기', exact: true });
 await expect(dialog.getByRole('alert')).toContainText('DOCX 변환 실패');
 await expect(dialog.getByRole('button', { name: 'DOCX 다운로드', exact: true })).toBeDisabled();
 await dialog.getByRole('button', { name: '다시 시도', exact: true }).click();
 await expect(dialog).toContainText('변환 시 달라지는 부분');
 await page.evaluate(() => {
   const original = URL.createObjectURL;
   URL.createObjectURL = blob => {
     if (blob instanceof Blob && blob.type.includes('wordprocessingml')) { URL.createObjectURL = original; throw new Error('test download failure'); }
     return original(blob);
   };
 });
 await dialog.getByRole('button', { name: 'DOCX 다운로드', exact: true }).click();
 await expect(dialog.getByRole('alert')).toContainText('DOCX 다운로드 실패');
 await expect(dialog).toContainText('변환 시 달라지는 부분');
 const pending = page.waitForEvent('download');
 await dialog.getByRole('button', { name: '다시 시도', exact: true }).click();
 expect((await pending).suggestedFilename()).toMatch(/\.docx$/);
 await expect(dialog).toBeHidden();
 expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(before);
 const actions = page.getByRole('dialog', { name: '문서 작업', exact: true });
 await expect(actions).toContainText('DOCX 다운로드 요청됨');
 await page.setViewportSize({ width: 390, height: 840 });
 await actions.locator('.office-task-status').scrollIntoViewIfNeeded();
 expect(await actions.locator('.office-task-status').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
 await page.screenshot({ path: '../../.dev/artifacts/design-system/docx-output-status.png' });
});
