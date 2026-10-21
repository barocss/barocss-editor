import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const title = 'Fictional compact block actions';

function producer() {
  return {
    stype: 'note',
    attributes: { pageId: '87112d76-205f-4967-859f-a2c168903e93', title },
    content: ['A', 'B', 'C', 'D'].map(text => ({
      stype: 'paragraph', attributes: {}, content: [{
        stype: 'inline-text', attributes: {}, content: [], text,
        marks: [{ stype: 'bold', range: [0, 1] }],
      }],
    })),
  };
}

type NativeNote = ReturnType<typeof producer>;

async function activeFile(page: Page) {
  return page.evaluate(() => new Promise<{ id: string; text: string; document: NativeNote }>((resolve, reject) => {
    const id = decodeURIComponent(location.hash.slice(1));
    const request = indexedDB.open('barocss-note', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('documents');
      const row = transaction.objectStore('documents').get(id);
      transaction.oncomplete = () => {
        db.close();
        if (!row.result) { reject(new Error(`Active Note ${id} was not saved`)); return; }
        const text: string = row.result.text;
        resolve({ id, text, document: JSON.parse(text).document });
      };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }));
}

async function selection(page: Page) {
  return page.evaluate(() => {
    const held = getSelection();
    const endpoint = (node: Node | null | undefined, offset: number | undefined) => {
      const element = node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement;
      return {
        sid: element?.closest('[data-bc-sid]')?.getAttribute('data-bc-sid'),
        paragraph: element?.closest('p')?.textContent,
        text: node?.nodeValue,
        offset,
        connected: node?.isConnected,
      };
    };
    return { anchor: endpoint(held?.anchorNode, held?.anchorOffset), focus: endpoint(held?.focusNode, held?.focusOffset), text: held?.toString() };
  });
}

async function selectMiddleBlocks(page: Page) {
  await page.locator('.on-doc > p').nth(1).click({ position: { x: 8, y: 10 } });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => selection(page)).toMatchObject({
    anchor: { paragraph: 'B', text: 'B', offset: 0, connected: true },
    focus: { paragraph: 'C', text: 'C', offset: 1, connected: true },
  });
  expect((await selection(page)).text).toMatch(/^B\n+C$/);
  await expect(page.locator('[data-note-formatting]')).toBeVisible();
}

test('More opens owned multi-block keyboard tools and preserves native undo, save and reopen', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByLabel('노트 제목', { exact: true })).toBeVisible();
  const source = producer();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({
    name: 'compact-multiblock.note.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document: source })),
  });
  await expect(page.getByLabel('노트 제목', { exact: true })).toHaveValue(title);
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  const imported = await activeFile(page);
  expect(imported.id).toMatch(/^[0-9a-f-]{36}$/);
  const expected = structuredClone(source);
  expected.attributes.pageId = imported.id;
  expect(imported.document).toEqual(expected);
  const rows = page.locator('.on-doc > p');
  await expect(rows).toHaveText(['A', 'B', 'C', 'D']);

  await selectMiddleBlocks(page);
  const selected = await selection(page);
  const primary = page.locator('[data-note-formatting]');
  const moreTrigger = primary.getByRole('button', { name: '추가 서식', exact: true });
  const more = page.getByRole('menu', { name: '추가 서식', exact: true });
  const childTrigger = more.getByRole('menuitem', { name: '선택 범위의 블록 작업', exact: true });
  const child = page.getByRole('menu', { name: '여러 블록 작업', exact: true });

  const openChild = async () => {
    await moreTrigger.focus(); await moreTrigger.press('Enter');
    await expect(more).toBeVisible();
    await expect(more.getByRole('menuitem', { name: '밑줄', exact: true })).toBeFocused();
    await page.keyboard.press('End'); await expect(childTrigger).toBeFocused();
    await page.keyboard.press('Enter'); await expect(child).toBeVisible();
    await expect(child.getByRole('menuitem', { name: '블록 복사', exact: true })).toBeFocused();
  };

  await openChild();
  expect(await selection(page)).toEqual(selected);
  expect(await activeFile(page)).toEqual(imported);
  await page.screenshot({ path: info.outputPath('owned-multiblock-child.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(child).toHaveCount(0); await expect(more).toBeVisible();
  await expect(childTrigger).toBeFocused(); await expect(primary).toBeVisible();
  expect(await selection(page)).toEqual(selected);
  expect(await activeFile(page)).toEqual(imported);
  await page.keyboard.press('Escape');
  await expect(more).toHaveCount(0); await expect(primary).toBeVisible();
  await expect(moreTrigger).toBeFocused();
  expect(await selection(page)).toEqual(selected);
  expect(await activeFile(page)).toEqual(imported);

  // Cancelling both UI layers must not add a native history transaction.
  await rows.first().click(); await page.keyboard.press('ControlOrMeta+z');
  await expect(rows).toHaveText(['A', 'B', 'C', 'D']);
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  expect((await activeFile(page)).document).toEqual(expected);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(rows).toHaveText(['A', 'B', 'C', 'D']);
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  expect((await activeFile(page)).document).toEqual(expected);

  await selectMiddleBlocks(page); await openChild();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await expect(child.getByRole('menuitem', { name: '블록 복제', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(rows).toHaveText(['A', 'B', 'C', 'B', 'C', 'D']);
  const duplicated = structuredClone(expected);
  duplicated.content.splice(3, 0, structuredClone(expected.content[1]), structuredClone(expected.content[2]));
  await expect.poll(async () => (await activeFile(page)).document).toEqual(duplicated);
  await rows.first().click(); await page.keyboard.press('ControlOrMeta+z');
  await expect(rows).toHaveText(['A', 'B', 'C', 'D']);
  await expect.poll(async () => (await activeFile(page)).document).toEqual(expected);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(rows).toHaveText(['A', 'B', 'C', 'B', 'C', 'D']);
  await expect.poll(async () => (await activeFile(page)).document).toEqual(duplicated);
  await page.getByLabel('노트 제목', { exact: true }).focus();
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  const saved = await activeFile(page);
  expect(saved.document).toEqual(duplicated);

  await page.getByRole('menubar', { name: '노트 메뉴', exact: true }).getByRole('menuitem', { name: '노트 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: '내보내기', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일 내려받기', exact: true }).click();
  const path = await (await download).path();
  if (!path) throw new Error('Note download did not produce a file');
  expect(JSON.parse(await readFile(path, 'utf8')).document).toEqual(duplicated);
  await page.reload(); await expect(page.getByLabel('노트 제목', { exact: true })).toHaveValue(title);
  await expect(rows).toHaveText(['A', 'B', 'C', 'B', 'C', 'D']);
  await expect.poll(() => activeFile(page)).toEqual(saved);
});
