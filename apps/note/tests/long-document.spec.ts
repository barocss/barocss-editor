import { test, expect } from '@playwright/test';

test('500 paragraphs retain edits, undo and saved content', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  const started = Date.now();
  await page.getByLabel('노트 파일').setInputFiles({ name: 'long.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: '긴 문서 검증' }, content: Array.from({ length: 500 }, (_, i) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text: `문단 ${i + 1}: 긴 문서에서 입력과 저장을 확인합니다.` }] })) }
  })) });
  const paragraphs = page.locator('.on-doc > p');
  await expect(paragraphs).toHaveCount(500);
  const loadedMs = Date.now() - started;
  const last = paragraphs.last(); await last.scrollIntoViewIfNeeded(); await last.click();
  await page.keyboard.press('End');
  const editStarted = Date.now(); await page.keyboard.type(' CHECK');
  await expect(last).toContainText(' CHECK');
  const editMs = Date.now() - editStarted;
  await page.keyboard.press('Backspace'); await expect(last).toContainText(' CHEC');
  // Deletion is a separate history entry from the preceding typing burst.
  await page.keyboard.press('Control+z'); await expect(last).toHaveText('문단 500: 긴 문서에서 입력과 저장을 확인합니다. CHECK');
  await page.keyboard.press('Control+z'); await expect(last).toHaveText('문단 500: 긴 문서에서 입력과 저장을 확인합니다.');
  await page.keyboard.press('Control+Shift+z'); await expect(last).toHaveText('문단 500: 긴 문서에서 입력과 저장을 확인합니다. CHECK');
  await page.keyboard.press('Control+Shift+z'); await expect(last).toHaveText('문단 500: 긴 문서에서 입력과 저장을 확인합니다. CHEC');
  await page.keyboard.type('!'); await expect(last).toContainText(' CHEC!');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload(); await expect(paragraphs).toHaveCount(500); await expect(last).toContainText(' CHEC!');
  await testInfo.attach('timings', { body: JSON.stringify({ paragraphs: 500, loadedMs, editMs }), contentType: 'application/json' });
});
