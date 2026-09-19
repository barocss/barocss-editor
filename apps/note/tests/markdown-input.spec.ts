import { test, expect } from '@playwright/test';

test('typed Markdown becomes editable headings, inline code and fenced code with undo', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'markdown.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { pageId: 'markdown-input', title: 'Markdown 입력 검증' }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }] } })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('Markdown 입력 검증');
  await page.locator('.on-doc > p').click();
  await page.keyboard.type('## ');
  await expect(page.locator('.on-doc > h2')).toBeVisible();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(page.locator('.on-doc > p')).toHaveText('##');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
  await expect(page.locator('.on-doc > h2')).toBeVisible();
  await page.keyboard.type('Heading'); await expect(page.locator('.on-doc > h2')).toHaveText('Heading');
  await page.keyboard.press('Enter');
  await page.keyboard.type('`code`');
  await expect(page.locator('.on-doc [style*="monospace"]').first()).toHaveText('code');
  await page.keyboard.type(' plain');
  await expect(page.locator('.on-doc [style*="monospace"]').first()).toHaveText('code');
  await expect(page.locator('.on-doc > p').first()).toHaveText('code plain');
  await page.keyboard.press('Enter'); await page.keyboard.type('```javascript'); await page.keyboard.press('Enter');
  await expect(page.locator('.on-doc pre')).toBeVisible();
  await page.keyboard.type('const n = 1;'); await expect(page.locator('.on-doc pre')).toContainText('const n = 1;');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload(); await expect(page.locator('.on-doc pre')).toContainText('const n = 1;');
});


test('composition and pasted Markdown remain literal; formatted shortcuts survive native deletion', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'markdown-edges.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { pageId: 'markdown-edges', title: 'Markdown 경계 검증' }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }] } })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('Markdown 경계 검증');
  const prose = page.locator('.on-doc > p').first(); await prose.click();
  await page.keyboard.type('**bold**');
  await expect(prose.locator('[style*="font-weight"]')).toHaveText('bold');
  await page.keyboard.type('!'); await expect(prose).toHaveText('bold!');
  await page.keyboard.press('Backspace'); await expect(prose).toHaveText('bold');
  await page.keyboard.press('Enter'); await page.keyboard.type('~~gone~~');
  await expect(page.locator('.on-doc [style*="line-through"]')).toHaveText('gone');
  await page.keyboard.press('Enter'); await page.keyboard.type('#');
  const last = page.locator('.on-doc > p').last();
  await last.dispatchEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' ', isComposing: true });
  await expect(page.locator('.on-doc h1')).toHaveCount(0);
  await expect(last).toHaveText('#');
  await page.keyboard.press('Enter');
  await page.locator('.on-doc > p').last().evaluate(element => {
    const data = new DataTransfer(); data.setData('text/plain', '`pasted`');
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(page.locator('.on-doc > p').last()).toHaveText('`pasted`');
  await expect(page.locator('.on-doc > p').last().locator('[style*="monospace"]')).toHaveCount(0);
});

for (const styled of [false, true]) test(`bare fence Enter converts an existing ${styled ? 'formatted' : 'plain'} paragraph`, async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'fence.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { pageId: 'fence-input', title: 'Fence regression' }, content: [{ stype: 'paragraph', content: styled ? [{ stype: 'inline-text', text: '```', marks: [{ stype: 'bold', range: [0, 3] }] }, { stype: 'inline-text', text: '' }] : [{ stype: 'inline-text', text: '' }] }] } })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('Fence regression');
  const paragraph = page.locator('.on-doc > p'); await paragraph.click();
  await page.keyboard.press('End');
  if (!styled) await page.keyboard.type('```');
  await page.keyboard.press('Enter');
  await expect(page.locator('.on-doc pre')).toBeVisible();
  await page.keyboard.type('hello'); await expect(page.locator('.on-doc pre')).toContainText('hello');
});
