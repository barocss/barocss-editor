import { test, expect, type Page } from '@playwright/test';

async function caret(page: Page, text: string, offset: number) {
  await page.evaluate(({ text, offset }) => {
    const ed = (window as any).editor;
    const root = ed.exportDocument(ed.getRootId());
    const find = (node: any): any => node.text === text ? node.sid : node.content?.map(find).find(Boolean);
    const sid = find(root);
    (window as any).editorView.contentEditableElement.focus();
    ed.updateSelection({ selection: { type: 'range', startNodeId: sid, endNodeId: sid, startOffset: offset, endOffset: offset, collapsed: true }, applySelectionToView: true });
  }, { text, offset });
}
async function toc(page: Page) {
  await page.getByRole('tab', { name: '참조', exact: true }).click();
  await page.getByRole('button', { name: '목차', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '목차', exact: true })).toBeVisible();
}
async function choose(page: Page, label: string, name: string) {
  await page.getByRole('dialog').getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name, exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#editor .w-paragraph').first()).toBeVisible();
  await page.evaluate(() => (window as any).editor.loadDocument({ stype: 'document', content: [
    { stype: 'surface', attributes: { kind: 'flow' }, content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Intro text' }] },
      { stype: 'heading', attributes: { level: 1 }, content: [{ stype: 'inline-text', text: 'First chapter' }] },
      { stype: 'heading', attributes: { level: 2 }, content: [{ stype: 'inline-text', text: 'Details' }] },
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'ABCDEF' }] }
    ] },
    { stype: 'surface', attributes: { kind: 'flow', pageNumberStart: 8 }, content: [
      { stype: 'heading', attributes: { level: 1 }, content: [{ stype: 'inline-text', text: 'Second chapter' }] },
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Last paragraph' }] }
    ] }
  ] }));
  await caret(page, 'Intro text', 0);
});
test('split at caret, continue typing, undo/redo and save/reopen sections', async ({ page }) => {
  await caret(page, 'ABCDEF', 3);
  await page.getByRole('tab', { name: '레이아웃', exact: true }).click();
  await page.getByRole('button', { name: '구역 나누기 (다음 페이지)', exact: true }).click();
  await expect(page.locator('.w-surface')).toHaveCount(3);
  await expect(page.locator('.w-surface').nth(0)).toContainText('ABC');
  await expect(page.locator('.w-surface').nth(1)).toContainText('DEF');
  await page.keyboard.type('New ');
  await expect(page.locator('.w-surface').nth(1)).toContainText('New DEF');
  await page.evaluate(async () => { const ed = (window as any).editor; await ed.run('undo'); await ed.run('undo'); });
  await expect(page.locator('.w-surface')).toHaveCount(2);
  await expect(page.locator('.w-surface').first()).toContainText('ABCDEF');
  await page.evaluate(() => (window as any).editor.run('redo'));
  await expect(page.locator('.w-surface')).toHaveCount(3);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload(); await expect(page.locator('.w-surface')).toHaveCount(3);
});
test('whole-document TOC updates titles automatically and persists settings', async ({ page }) => {
  await toc(page);
  await page.screenshot({ path: '/tmp/word-toc-settings.png', animations: 'disabled' });
  await page.getByRole('button', { name: '목차 삽입', exact: true }).click();
  await expect(page.locator('.w-toc-entry')).toHaveCount(3);
  await expect(page.locator('.w-toc-entry').last()).toContainText('Second chapter');
  await expect(page.locator('.w-toc-entry').last().locator('.w-toc-page')).toHaveText('8');
  await caret(page, 'First chapter', 13); await page.keyboard.type(' updated');
  await expect(page.locator('.w-toc-entry').first()).toContainText('First chapter updated');
  await caret(page, 'Intro text', 0); await toc(page);
  await choose(page, '제목 단계', '제목 1');
  await page.getByRole('button', { name: '설정 적용' }).click();
  await expect(page.locator('.w-toc')).toHaveCount(1);
  await expect(page.locator('.w-toc-entry')).toHaveCount(2);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload(); await expect(page.locator('.w-toc-entry')).toHaveCount(2);
  await expect(page.locator('.w-toc-entry').first()).toContainText('First chapter updated');
});
test('section-only TOC, remove and undo, keyboard heading navigation', async ({ page }) => {
  await toc(page); await choose(page, '목차 범위', '현재 구역');
  await page.getByRole('button', { name: '목차 삽입', exact: true }).click();
  await expect(page.locator('.w-toc-entry')).toHaveCount(2);
  await page.locator('.w-toc-entry').first().focus(); await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => {
    const ed = (window as any).editor; return ed.dataStore.getNode(ed.selection?.startNodeId)?.text;
  })).toBe('First chapter');
  await toc(page); await page.getByRole('button', { name: '목차 제거' }).click();
  await expect(page.locator('.w-toc')).toHaveCount(0);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect(page.locator('.w-toc-entry')).toHaveCount(2);
});
