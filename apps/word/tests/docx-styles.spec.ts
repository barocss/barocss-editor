import { test, expect } from '@playwright/test';
import { placeCaret, settled } from './helpers';

test('DOCX download and reopen keep shared styles editable through undo, reload and original navigation', async ({ page }, testInfo) => {
  await page.goto('/?sample=styles'); await settled(page);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  const original = page.url();
  const paragraphs = page.locator('#editor .w-paragraph');
  const originalText = await paragraphs.allTextContents();
  const sizes = await paragraphs.evaluateAll(els => els.map(el => getComputedStyle(el).fontSize));
  await page.getByRole('button', { name: '문서 작업', exact: true }).click();
  await page.getByRole('button', { name: 'DOCX 내보내기', exact: true }).click();
  const exportDialog = page.getByRole('dialog', { name: 'DOCX 내보내기', exact: true });
  await expect(exportDialog).toContainText('문단·글자 스타일');
  const downloaded = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'DOCX 다운로드', exact: true }).click();
  const download = await downloaded; const file = testInfo.outputPath('styles-roundtrip.docx'); await download.saveAs(file);
  await page.getByLabel('DOCX 파일 선택', { exact: true }).setInputFiles(file);
  const importDialog = page.getByRole('dialog', { name: 'DOCX 가져오기', exact: true });
  await expect(importDialog).toContainText('문단·글자 스타일');
  await importDialog.getByRole('button', { name: '새 문서로 열기', exact: true }).click();
  await settled(page); await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  expect(page.url()).not.toBe(original);
  expect(await paragraphs.allTextContents()).toEqual(originalText);
  expect(await paragraphs.evaluateAll(els => els.map(el => getComputedStyle(el).fontSize))).toEqual(sizes);
  await placeCaret(page, '#editor .w-paragraph', 0);
  await expect(page.getByRole('combobox', { name: 'Paragraph style', exact: true })).toHaveText('보고서 본문');
  await page.getByRole('button', { name: '스타일 상세 설정', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '스타일 이름', exact: true })).toHaveValue('보고서 본문');
  await page.getByRole('spinbutton', { name: '스타일 글자 크기', exact: true }).fill('18');
  await page.getByRole('spinbutton', { name: '스타일 글자 크기', exact: true }).press('Tab');
  await page.getByRole('button', { name: '변경 저장', exact: true }).click();
  for (const index of [0, 1]) {
    await expect(paragraphs.nth(index)).toHaveCSS('font-size', '24px');
    // A paragraph size must not be locked by materialized run formatting.
    await expect(paragraphs.nth(index).locator('.w-text').first()).toHaveCSS('font-size', '24px');
  }
  await expect(paragraphs.nth(2)).toHaveCSS('font-size', sizes[2]);
  await page.locator('[data-control=undo]').click(); await expect(paragraphs.first()).toHaveCSS('font-size', sizes[0]);
  await page.locator('[data-control=redo]').click(); await expect(paragraphs.first()).toHaveCSS('font-size', '24px');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload(); await settled(page); await expect(paragraphs.nth(1).locator('.w-text').first()).toHaveCSS('font-size', '24px');
  await page.goto(original); await page.reload(); await settled(page); await expect(paragraphs.first()).toHaveCSS('font-size', sizes[0]);
});
