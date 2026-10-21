import { expect, test, type Page } from '@playwright/test';

async function storedNative(page: Page) {
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  return page.evaluate(() => new Promise<unknown>((resolve, reject) => {
    const open = indexedDB.open('barocss-note'); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result, transaction = db.transaction('documents');
      const row = transaction.objectStore('documents').get('command-search-native');
      transaction.oncomplete = () => { db.close(); resolve(JSON.parse(row.result.text).document); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }));
}

test('Note command dialogue reaches the actual selected native text and preserves its meaningful history', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'command.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { pageId: 'command-search-native', title: 'Command dialogue' },
      metadata: { loadedAt: 'synthetic-native-time', provenance: 'synthetic-command-dialogue', preserve: ['native', 'metadata'] }, content: [
        { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Command target', marks: [] }] }
      ] }
  })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('Command dialogue');
  const original = await storedNative(page);
  const nativeBody = await page.locator('.nw-document .on-doc').elementHandle();
  const paragraph = page.locator('.nw-document .on-doc > p');
  await paragraph.click();
  const apple = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform));
  await page.keyboard.press(apple ? 'Meta+ArrowDown' : 'Control+End');
  for (let index = 0; index < 'Command target'.length; index++) await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(() => paragraph.evaluate(node => {
    const selection = getSelection();
    return !!selection?.anchorNode && node.contains(selection.anchorNode) && selection.toString() === 'Command target';
  })).toBe(true);
  await page.getByRole('button', { name: '명령 검색', exact: true }).click();
  const query = page.getByRole('combobox', { name: '명령 검색어', exact: true });
  await expect(query).toBeFocused();
  await query.fill('굵게');
  await query.press('Enter');
  await expect(paragraph.locator('.mark-bold')).toHaveText('Command target');
  await page.getByRole('button', { name: '명령 검색', exact: true }).click();
  await query.fill('실행 취소'); await query.press('Enter');
  await expect(paragraph.locator('.mark-bold')).toHaveCount(0);
  await expect(paragraph).toHaveText('Command target');
  expect(await storedNative(page)).toEqual(original);
  const returnFocus = await page.evaluateHandle(() => document.activeElement);
  await page.getByRole('button', { name: '명령 검색', exact: true }).click();
  await query.press('Escape');
  await expect.poll(() => returnFocus.evaluate(element => element?.isConnected && document.activeElement === element)).toBe(true);
  expect(await storedNative(page)).toEqual(original);
  expect(await nativeBody!.evaluate(element => element.isConnected && element === document.querySelector('.nw-document .on-doc'))).toBe(true);
  await page.keyboard.press('ArrowRight'); await page.keyboard.insertText(' continued');
  await expect(paragraph).toHaveText('Command target continued');
});

test('Note command dialogue targets the last genuine nested input and keeps the complete parent native tree', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'nested.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { pageId: 'command-search-native', title: 'Nested command dialogue', retained: 'parent-attributes' },
      metadata: { loadedAt: 'synthetic-native-time', provenance: 'synthetic-nested-command' }, content: [
        { stype: 'paragraph', attributes: { retained: 'parent-block' }, content: [{ stype: 'inline-text', text: 'Parent remains intact', marks: [{ type: 'italic' }] }] },
        { stype: 'noteDatabase', attributes: { source: 'tasks' } },
        { stype: 'resources', content: [
          { stype: 'dataset', attributes: { name: 'tasks', fields: [{ name: 'Title', kind: 'text' }], records: [{ Title: 'Task' }], rowIds: ['task-row'] } },
          { stype: 'richText', attributes: { id: 'task-row', retained: 'nested-body' }, content: [
            { stype: 'paragraph', attributes: { retained: 'nested-block' }, content: [{ stype: 'inline-text', text: 'Nested target', marks: [] }] }
          ] }
        ] }
      ] }
  })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('Nested command dialogue');
  await page.getByRole('button', { name: '행 1 열기', exact: true }).click();
  const paragraph = page.locator('[data-db-item-body] .on-doc > p').first();
  await expect(paragraph).toHaveText('Nested target');
  const body = await paragraph.elementHandle();
  await paragraph.click();
  const apple = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform));
  await page.keyboard.press(apple ? 'Meta+ArrowDown' : 'Control+End');
  for (let index = 0; index < 'Nested target'.length; index++) await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(() => paragraph.evaluate(node => {
    const selection = getSelection(); return !!selection?.anchorNode && node.contains(selection.anchorNode) && selection.toString() === 'Nested target';
  })).toBe(true);
  await page.keyboard.press(apple ? 'Meta+Shift+p' : 'Control+Shift+p');
  const query = page.getByRole('combobox', { name: '명령 검색어', exact: true });
  const original = await storedNative(page);
  await query.fill('굵게'); await query.press('Enter');
  await expect(paragraph.locator('.mark-bold')).toHaveText('Nested target');
  await expect(page.locator('.nw-document > [data-note-editor] .on-doc').first().locator('p').first()).toHaveText('Parent remains intact');
  await page.keyboard.press(apple ? 'Meta+Shift+p' : 'Control+Shift+p');
  await query.fill('실행 취소'); await query.press('Enter');
  await expect(paragraph.locator('.mark-bold')).toHaveCount(0);
  await expect(paragraph).toHaveText('Nested target');
  // Preparing search flushes the actual nested child to the parent's durable tree.
  await page.keyboard.press(apple ? 'Meta+Shift+p' : 'Control+Shift+p');
  expect(await storedNative(page)).toEqual(original);
  await query.press('Escape');
  expect(await body!.evaluate(element => element.isConnected)).toBe(true);
  await paragraph.click(); await page.keyboard.press(apple ? 'Meta+ArrowDown' : 'Control+End');
  await page.keyboard.insertText(' continued'); await expect(paragraph).toHaveText('Nested target continued');
});
