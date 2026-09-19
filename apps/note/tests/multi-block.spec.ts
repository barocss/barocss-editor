import { test, expect } from '@playwright/test';
test('multiple selected blocks move, duplicate, delete and restore with undo', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'batch.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { pageId: 'batch', title: '여러 블록 검증' }, content: ['A', 'B', 'C', 'D'].map(text => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] })) } })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('여러 블록 검증');
  const paragraphs = page.locator('.on-doc > p');
  const select = async () => {
    await expect(async () => {
    await paragraphs.nth(1).click();
    await page.locator('.on-doc').evaluate(element => {
      const firstText = (node: Node) => document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()!;
      const range = document.createRange(); range.setStart(firstText(element.children[1]), 0); range.setEnd(firstText(element.children[2]), 1);
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
    });
    await expect(page.getByRole('button', { name: '선택 범위의 블록 작업' })).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 5000 });
    await page.getByRole('button', { name: '선택 범위의 블록 작업' }).click();
  };
  for (const [label, text] of [['블록 위로 이동', ['B', 'C', 'A', 'D']], ['블록 아래로 이동', ['A', 'D', 'B', 'C']], ['블록 복제', ['A', 'B', 'C', 'B', 'C', 'D']], ['블록 삭제', ['A', 'D']]] as const) {
    await select(); await page.getByRole('menuitem', { name: label, exact: true }).click();
    await expect(paragraphs).toHaveText([...text]);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect(paragraphs).toHaveText(['A', 'B', 'C', 'D']);
  }
  await select(); await page.getByRole('menuitem', { name: '블록 복제', exact: true }).click();
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨'); await page.reload();
  await expect(paragraphs).toHaveText(['A', 'B', 'C', 'B', 'C', 'D']);
  expect(errors).toEqual([]);
});

test('Shift grip selection drags a group and copies rich blocks for paste', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).copiedBlocks = {};
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async (items: ClipboardItem[]) => {
      for (const type of items[0].types) (window as any).copiedBlocks[type] = await (await items[0].getType(type)).text();
    } } });
  });
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'grips.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { pageId: 'grips', title: '손잡이 검증' }, content: ['A', 'B', 'C', 'D'].map(text => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text, marks: [{ stype: 'bold', range: [0, 1] }] }] })) } })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('손잡이 검증');
  const rows = page.locator('.on-doc > p'), grip = page.locator('[data-note-grip]');
  await rows.nth(1).hover(); await grip.click(); await page.keyboard.press('Escape');
  await rows.nth(2).hover(); await grip.click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-note-batch-selected]')).toHaveCount(2);
  await page.getByRole('button', { name: '선택 범위의 블록 작업' }).click();
  await page.getByRole('menuitem', { name: '블록 복사', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).copiedBlocks['text/plain'])).toBe('B\nC');
  await rows.nth(1).hover();
  const handle = (await grip.boundingBox())!, end = (await rows.nth(3).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(end.x + 40, end.y + end.height + 10, { steps: 12 }); await page.mouse.up();
  await expect(rows).toHaveText(['A', 'D', 'B', 'C']);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(rows).toHaveText(['A', 'B', 'C', 'D']);
  await page.keyboard.press('Escape'); await rows.last().click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(5); await rows.last().click();
  await rows.last().evaluate(element => {
    const data = new DataTransfer(); for (const [type, value] of Object.entries((window as any).copiedBlocks)) data.setData(type, value as string);
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(page.locator('.on-doc')).toContainText('B');
  await expect(rows).toHaveText(['A', 'B', 'C', 'D', 'B', 'C']);
  await expect(rows.last().locator('[style*="font-weight"]')).toHaveText('C');
});
