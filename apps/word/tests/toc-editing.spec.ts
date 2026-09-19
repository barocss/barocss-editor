import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page, text = '제목') {
  await page.goto('/');
  await expect(page.locator('#editor .w-paragraph').first()).toBeVisible();
  await page.evaluate(text => {
    const ed = (window as any).editor;
    ed.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow' }, content: [
      { stype: 'tableOfContents', attributes: { scope: 'document' }, content: [] },
      { stype: 'heading', attributes: { level: 1 }, content: [{ stype: 'inline-text', text }] }
    ] }] });
    const root = ed.exportDocument(ed.getRootId());
    const sid = root.content[0].content[1].content[0].sid;
    (window as any).__tocTextId = sid;
    (window as any).editorView.contentEditableElement.focus();
    ed.updateSelection({ selection: { type: 'range', startNodeId: sid, endNodeId: sid,
      startOffset: text.length, endOffset: text.length, collapsed: true }, applySelectionToView: true });
  }, text);
  if (text) await expect(page.locator('.w-toc-text')).toHaveText(text);
  else await expect(page.locator('.w-toc-empty')).toBeVisible();
}
const modelText = (page: Page) => page.evaluate(() => {
  const w = window as any;
  return w.editor.dataStore.getNode(w.__tocTextId)?.text;
});

test('committed Korean composition refreshes the generated TOC', async ({ page }) => {
  await setup(page);
  const cdp = await page.context().newCDPSession(page);
  for (const text of ['ㅎ', '하', '한']) {
    await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
    await page.waitForTimeout(60);
    await expect(page.locator('.w-toc-text')).toHaveText(`제목${text}`);
    await expect.poll(() => page.evaluate(() => (window as any).editorView._isComposing)).toBe(true);
  }
  await cdp.send('Input.insertText', { text: '한' });
  await expect.poll(() => modelText(page)).toBe('제목한');
  await expect(page.locator('.w-toc-text')).toHaveText('제목한');
  await expect(page.locator('.w-toc')).toHaveAttribute('contenteditable', 'false');
});

test('cancelling a composition restores the TOC label', async ({ page }) => {
  await setup(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'ㅎ', selectionStart: 1, selectionEnd: 1 });
  await expect(page.locator('.w-toc-text')).toHaveText('제목ㅎ');
  await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
  await expect.poll(() => modelText(page)).toBe('제목');
  await expect(page.locator('.w-toc-text')).toHaveText('제목');
});

test('erasing all heading characters keeps the TOC and undo restores each deletion', async ({ page }) => {
  await setup(page, '가나다');
  for (const expected of ['가나', '가', '']) {
    await page.keyboard.press('Backspace');
    await expect.poll(() => modelText(page)).toBe(expected);
    await expect(page.locator('.w-toc')).toHaveCount(1);
  }
  await expect(page.locator('.w-toc-empty')).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(page.locator('.w-toc')).toHaveCount(1);
  for (const expected of ['가', '가나', '가나다']) {
    await page.evaluate(() => (window as any).editor.run('undo'));
    await expect.poll(() => modelText(page)).toBe(expected);
    await expect(page.locator('.w-toc-text')).toHaveText(expected);
  }
});

test('successive compositions populate an empty TOC and survive save/reopen', async ({ page }) => {
  await setup(page, '');
  const cdp = await page.context().newCDPSession(page);
  for (const [draft, commit] of [['ㅎ', '한'], ['ㄱ', '글'], ['ㅈ', '자']]) {
    await cdp.send('Input.imeSetComposition', { text: draft, selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: commit, selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: commit });
  }
  await expect.poll(() => modelText(page)).toBe('한글자');
  await expect(page.locator('.w-toc-text')).toHaveText('한글자');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.w-toc-text')).toHaveText('한글');
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect(page.locator('.w-toc-text')).toHaveText('한글자');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('.w-toc-text')).toHaveText('한글자');
});

test('typing and deletion remain separate undo actions', async ({ page }) => {
  await setup(page, 'Title');
  await page.keyboard.type('abc');
  await page.keyboard.press('Backspace');
  await expect.poll(() => modelText(page)).toBe('Titleab');
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect.poll(() => modelText(page)).toBe('Titleabc');
});
