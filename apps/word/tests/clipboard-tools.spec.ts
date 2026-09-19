import { test, expect, type Page } from '@playwright/test';
import { placeCaret } from './helpers';

async function mockClipboard(page: Page, denied = false, value = '') {
  await page.addInitScript(({ denied, value }) => {
    (window as any).__clip = { text: value, html: '', writes: 0 };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      write: async (items: ClipboardItem[]) => {
        if (denied) throw new DOMException('Denied', 'NotAllowedError');
        const item = items[0];
        const clip = (window as any).__clip;
        clip.text = item.types.includes('text/plain') ? await (await item.getType('text/plain')).text() : '';
        clip.html = item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '';
        clip.writes++;
      },
      read: async () => {
        if (denied) throw new DOMException('Denied', 'NotAllowedError');
        const clip = (window as any).__clip;
        return [new ClipboardItem({ 'text/plain': new Blob([clip.text], { type: 'text/plain' }),
          ...(clip.html ? { 'text/html': new Blob([clip.html], { type: 'text/html' }) } : {}) })];
      }
    } });
  }, { denied, value });
}

async function selectText(page: Page, value = 'Keep these words') {
  await page.goto('/'); await placeCaret(page, '.w-paragraph');
  await page.keyboard.type(value); await page.keyboard.press('Shift+Home');
}

test('ribbon copies formatting, cuts once, pastes and preserves history and reload', async ({ page }) => {
  await mockClipboard(page); await selectText(page);
  await page.keyboard.press('ControlOrMeta+b');
  await page.getByRole('button', { name: '복사', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__clip.text)).toBe('Keep these words');
  await expect.poll(() => page.evaluate(() => (window as any).__clip.html)).toMatch(/strong|bold|700/);
  await page.getByRole('button', { name: '잘라내기', exact: true }).click();
  await expect(page.locator('.w-paragraph')).not.toContainText('Keep');
  await page.locator('[data-control=undo]').click();
  await expect(page.locator('.w-paragraph')).toHaveText('Keep these words');
  await expect(page.locator('.mark-bold')).toHaveText('Keep these words');
  await page.locator('[data-control=redo]').click();
  await page.getByRole('button', { name: '붙여넣기', exact: true }).click();
  await expect(page.locator('.w-paragraph')).toHaveText('Keep these words');
  await expect(page.locator('.mark-bold')).toHaveText('Keep these words');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('.w-paragraph')).toHaveText('Keep these words');
});

test('denied cut keeps source text and offers a manual copy field', async ({ page }) => {
  await mockClipboard(page, true); await selectText(page);
  await page.getByRole('button', { name: '잘라내기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '잘라내기 도움말' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('복사할 텍스트')).toHaveValue('Keep these words');
  await expect(page.locator('.w-paragraph')).toHaveText('Keep these words');
});

test('denied paste accepts literal text at the saved range and undoes once', async ({ page }) => {
  await mockClipboard(page, true); await selectText(page);
  await page.locator('.w-menubar [data-menu=edit]').click();
  await page.getByRole('menuitem', { name: '붙여넣기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '붙여넣기 도움말' });
  await dialog.getByLabel('붙여넣을 텍스트').fill('**literal**  text');
  await dialog.getByRole('button', { name: '텍스트 붙여넣기', exact: true }).click();
  await expect(page.locator('.w-paragraph')).toHaveText('**literal**  text');
  await expect(page.locator('.mark-bold')).toHaveCount(0);
  await page.locator('[data-control=undo]').click();
  await expect(page.locator('.w-paragraph')).toHaveText('Keep these words');
});

test('empty selection disables copy and cut, while paste accepts a caret', async ({ page }) => {
  await mockClipboard(page); await page.goto('/'); await placeCaret(page, '.w-paragraph');
  await expect(page.getByRole('button', { name: '복사', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '잘라내기', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '붙여넣기', exact: true })).toBeEnabled();
});


test('cut across paragraphs restores text, marks and block structure with one undo', async ({ page }) => {
  await mockClipboard(page); await page.goto('/'); await placeCaret(page, '.w-paragraph');
  await page.keyboard.type('First paragraph');
  await page.keyboard.press('Enter'); await page.keyboard.type('Second paragraph');
  await page.keyboard.press('Shift+Home'); await page.keyboard.press('ControlOrMeta+b');
  const before = await page.evaluate(() => {
    const ed = (window as any).editor;
    return ed.exportDocument(ed.getRootId());
  });
  await page.evaluate(() => {
    const paragraphs = document.querySelectorAll('.w-paragraph');
    const texts = (el: Element) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const result: Text[] = []; while (walker.nextNode()) result.push(walker.currentNode as Text); return result;
    };
    const first = texts(paragraphs[0])[0], last = texts(paragraphs[1]).at(-1)!;
    const range = document.createRange(); range.setStart(first, 2); range.setEnd(last, last.length - 2);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await page.getByRole('button', { name: '잘라내기', exact: true }).click();
  await expect(page.locator('.w-paragraph')).toHaveCount(1);
  await expect(page.locator('.w-paragraph')).toHaveText('Fiph');
  await page.locator('[data-control=undo]').click();
  await expect.poll(() => page.evaluate(() => {
    const ed = (window as any).editor; return ed.exportDocument(ed.getRootId());
  })).toEqual(before);
  await page.locator('[data-control=redo]').click();
  await expect(page.locator('.w-paragraph')).toHaveText('Fiph');
});

for (const denied of [false, true]) test(`tracked cut ${denied ? 'preserves source on denial' : 'writes clipboard before recording a move'}`, async ({ page }) => {
  await mockClipboard(page, denied); await selectText(page);
  await page.getByRole('tab', { name: '검토', exact: true }).click();
  await page.getByRole('button', { name: '변경 내용 추적', exact: true }).click();
  await page.getByRole('tab', { name: '홈', exact: true }).click();
  await page.getByRole('button', { name: '잘라내기', exact: true }).click();
  const marks = () => page.evaluate(() => {
    const ed = (window as any).editor;
    return JSON.stringify(ed.exportDocument(ed.getRootId())).includes('moveFrom');
  });
  if (denied) {
    await expect(page.getByRole('dialog', { name: '잘라내기 도움말' })).toBeVisible();
    expect(await marks()).toBe(false);
  } else {
    await expect.poll(() => page.evaluate(() => (window as any).__clip.text)).toBe('Keep these words');
    await expect.poll(marks).toBe(true);
    await page.locator('[data-control=undo]').click();
    await expect.poll(marks).toBe(false);
  }
  await expect(page.locator('.w-paragraph')).toHaveText('Keep these words');
});

test('closing the paste fallback changes neither content nor history', async ({ page }) => {
  await mockClipboard(page, true); await selectText(page);
  await page.getByRole('button', { name: '붙여넣기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '붙여넣기 도움말' });
  await dialog.getByLabel('붙여넣을 텍스트').fill('discard this');
  await dialog.getByRole('button', { name: '닫기', exact: true }).last().click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.w-paragraph')).toHaveText('Keep these words');
});


test('paste fallback refuses a document changed while the dialog was open', async ({ page }) => {
  await mockClipboard(page, true); await selectText(page);
  await page.getByRole('button', { name: '붙여넣기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '붙여넣기 도움말' });
  await dialog.getByLabel('붙여넣을 텍스트').fill('stale paste');
  await page.evaluate(async () => {
    const ed = (window as any).editor, at = ed.selection;
    ed.updateSelection({ selection: { ...at, startOffset: 16, endOffset: 16, collapsed: true }, applySelectionToView: false });
    await ed.run('insertText', { text: 'X' });
  });
  await dialog.getByRole('button', { name: '텍스트 붙여넣기', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('문서가 변경되었습니다');
  await expect(page.locator('.w-paragraph')).toHaveText('Keep these wordsX');
});

test('clipboard group fits with the Home controls at the desktop app width', async ({ page }) => {
  await page.setViewportSize({ width: 1127, height: 850 }); await page.goto('/');
  const groups = page.locator('.w-toolbar-ribbon [data-ribbon-group]');
  await expect(groups).toHaveCount(6);
  const rows = await groups.evaluateAll(items => items.map(el => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(rows).size).toBe(1);
});


test('keyboard copy, cut and paste use the same commands and undo restores text', async ({ page }) => {
  await mockClipboard(page); await selectText(page);
  await expect(page.getByRole('button', { name: '잘라내기', exact: true })).toBeEnabled();
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(() => page.evaluate(() => (window as any).__clip.writes)).toBe(1);
  await page.keyboard.press('ControlOrMeta+x');
  await expect(page.locator('.w-paragraph')).toHaveText('');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(page.locator('.w-paragraph')).toHaveText('Keep these words');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.w-paragraph')).toHaveText('');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.w-paragraph')).toHaveText('Keep these words');
});
