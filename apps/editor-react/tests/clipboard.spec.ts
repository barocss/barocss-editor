import { expect, test, type Page } from '@playwright/test';
import type { Editor } from '@barocss/editor-core';
declare global { interface Window { clipboardEditor: Editor; } }

async function select(page: Page, id: string, from: number, to = from) {
  await page.evaluate(({ id, from, to }) => {
    const host = document.querySelector(`[data-bc-layer="content"] [data-bc-sid="${id}"]`)!;
    const editable = host.closest<HTMLElement>('[contenteditable="true"]')!; editable.focus();
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT), nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    const at = (offset: number): [Text, number] => {
      for (const node of nodes) { if (offset <= node.length) return [node, offset]; offset -= node.length; }
      throw new Error('No text endpoint');
    };
    const range = document.createRange(); range.setStart(...at(from)); range.setEnd(...at(to));
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    window.clipboardEditor.updateSelection({ type: 'range', startNodeId: id, startOffset: from, endNodeId: id, endOffset: to, collapsed: from === to });
  }, { id, from, to });
}
async function state(page: Page) {
  return page.evaluate(() => JSON.stringify(window.clipboardEditor.dataStore.getAllNodes().sort((a, b) => a.sid!.localeCompare(b.sid!))));
}
for (const view of ['dom', 'react']) test.describe(`${view} native clipboard`, () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`/tests/fixtures/clipboard.html?view=${view}`);
    await expect(page.locator('[data-bc-layer="content"]')).toBeVisible();
    await expect(page.locator('[data-bc-layer="content"] [data-bc-sid="b1"]')).toHaveText('xy');
  });
  test('native copy/paste preserves partial boundaries and marks; undo and redo restore exact nodes', async ({ page }) => {
    await select(page, 'a1', 1, 3);
    await page.keyboard.press('ControlOrMeta+c');
    await expect.poll(() => page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      for (const item of items) if (item.types.includes('text/html')) return (await (await item.getType('text/html')).text()).includes('data-wonffice-fragment');
      return false;
    })).toBe(true);
    await select(page, 'b1', 1);
    const before = await state(page);
    await page.keyboard.press('ControlOrMeta+v');
    await expect(page.locator('[data-bc-layer="content"] [data-bc-sid="b"]')).toHaveText('xBCy');
    await expect(page.locator('[data-bc-layer="content"] [data-bc-sid="b"] strong')).toHaveText('BC');
    const after = await state(page);
    expect(await page.evaluate(() => window.clipboardEditor.getHistoryStats().totalEntries)).toBe(1);
    expect(await page.evaluate(() => window.clipboardEditor.undo())).toBe(true);
    expect(await state(page)).toBe(before);
    expect(await page.evaluate(() => window.clipboardEditor.redo())).toBe(true);
    expect(await state(page)).toBe(after);
  });
  test('native cut deletes once and restores the original selection on undo', async ({ page }) => {
    await select(page, 'a1', 1, 3);
    const before = await state(page);
    await page.keyboard.press('ControlOrMeta+x');
    await expect(page.locator('[data-bc-layer="content"] [data-bc-sid="a"]')).toHaveText('AD');
    expect(await page.evaluate(() => window.clipboardEditor.getHistoryStats().totalEntries)).toBe(1);
    expect(await page.evaluate(() => window.clipboardEditor.undo())).toBe(true);
    expect(await state(page)).toBe(before);
  });
  test('whole-block clipboard content splits the target at the real DOM caret', async ({ page }) => {
    expect(await page.evaluate(() => window.clipboardEditor.executeCommand('copyBlocks', { nodeIds: ['a'] }))).toBe(true);
    await select(page, 'b1', 1);
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(() => page.locator('[data-bc-layer="content"] [data-bc-stype="paragraph"]').allTextContents()).toEqual(['ABCD', 'x', 'ABCD', 'y']);
    expect(await page.evaluate(() => window.clipboardEditor.undo())).toBe(true);
    await expect.poll(() => page.locator('[data-bc-layer="content"] [data-bc-stype="paragraph"]').allTextContents()).toEqual(['ABCD', 'xy']);
  });
  test('delayed clipboard data cannot overwrite a changed selection', async ({ page }) => {
    expect(await page.evaluate(() => window.clipboardEditor.executeCommand('copyBlocks', { nodeIds: ['a'] }))).toBe(true);
    await select(page, 'b1', 1);
    const before = await state(page);
    expect(await page.evaluate(async () => {
      const items = await navigator.clipboard.read(), read = navigator.clipboard.read.bind(navigator.clipboard);
      let resolve!: (items: ClipboardItems) => void;
      navigator.clipboard.read = () => new Promise<ClipboardItems>(done => { resolve = done; });
      try {
        const pending = window.clipboardEditor.executeCommand('paste');
        window.clipboardEditor.updateSelection({ type: 'range', startNodeId: 'a1', startOffset: 0, endNodeId: 'a1', endOffset: 0, collapsed: true });
        resolve(items);
        return await pending;
      } finally { navigator.clipboard.read = read; }
    })).toBe(false);
    expect(await state(page)).toBe(before);
    expect(await page.evaluate(() => window.clipboardEditor.getHistoryStats().totalEntries)).toBe(0);
  });
});
