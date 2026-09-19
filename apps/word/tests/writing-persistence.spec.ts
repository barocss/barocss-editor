import { test, expect } from '@playwright/test';
import { placeCaret } from './helpers';

test('Korean, repeated spaces, deletion, paste and table edits survive automatic save and reload', async ({ page }) => {
 await page.goto('/?sample'); const status = page.locator('[data-word-save-status]'); await expect(status).toHaveText('저장됨');
 const paragraph = page.locator('.w-paragraph').first();
 await placeCaret(page, '.w-paragraph'); await page.keyboard.press('End');
 const cdp = await page.context().newCDPSession(page);
 await cdp.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 });
 await cdp.send('Input.insertText', { text: '한글' });
 await page.keyboard.type('   END'); await page.keyboard.press('Backspace');
 await expect(paragraph).toContainText('한글   EN');
 await paragraph.evaluate(el => {
  const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', ' 붙여넣기');
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
 });
 await expect(paragraph).toContainText('한글   EN 붙여넣기');
 const expected = await paragraph.textContent();
 await placeCaret(page, '.w-cell', 2); await page.keyboard.press('End'); await page.keyboard.type(' TABLE');
 const cell = page.locator('.w-cell').nth(2); await expect(cell).toContainText('TABLE');
 const cellText = await cell.textContent();
 await expect(status).toHaveText('저장됨'); await page.reload();
 await expect(status).toHaveText('저장됨'); await expect(paragraph).toHaveText(expected!); await expect(cell).toHaveText(cellText!);
 await cdp.detach();
});
