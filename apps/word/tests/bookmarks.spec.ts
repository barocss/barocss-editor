import { test, expect, type Page } from '@playwright/test';
import { settled, placeCaret } from './helpers';
async function start(page: Page) { await page.goto('/?sample=references'); await settled(page); }
async function selectText(page: Page, text: string, from: number, to = from) {
  await page.evaluate(({ text, from, to }) => {
    const editable = (window as any).editorView.contentEditableElement as HTMLElement;
    editable.focus();
    const paragraph = [...editable.querySelectorAll('.w-paragraph')].find(node => node.textContent === text);
    if (!paragraph) throw new Error('Paragraph not found');
    const point = (offset: number) => {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const length = node.textContent?.length ?? 0;
        if (offset <= length) return { node, offset };
        offset -= length;
      }
      throw new Error('Offset not found');
    };
    const start = point(from), end = point(to);
    const range = document.createRange(); range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset);
    getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
  }, { text, from, to });
}
async function open(page: Page, name = '책갈피') {
  await page.getByRole('tab', { name: '참조', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
}

test('renaming updates links; deleting reports a missing target; undo and reopen restore it', async ({ page }) => {
  await start(page); await placeCaret(page, '#editor .w-paragraph', 0); await open(page);
  await page.getByRole('textbox', { name: '변경할 책갈피 이름', exact: true }).fill('새 목표');
  await page.getByRole('button', { name: '이름 변경', exact: true }).click();
  const ref = page.locator('#editor .w-field-ref').first();
  await expect(ref).toHaveAttribute('data-target', '새 목표'); await expect(ref).toHaveText('프로젝트 목표');
  await page.getByRole('button', { name: '책갈피 삭제', exact: true }).click();
  await expect(ref).toContainText('Reference source not found');
  await page.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.getByRole('tab', { name: '홈', exact: true }).click();
  await page.locator('[data-control=undo]').click(); await expect(ref).toHaveText('프로젝트 목표');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨'); await page.reload(); await settled(page);
  await expect(ref).toHaveAttribute('data-target', '새 목표'); await expect(ref).toHaveText('프로젝트 목표');
});

test('inserts a reference at the caret, follows it by mouse and keyboard, and refreshes its source text', async ({ page }) => {
  await start(page);
  await selectText(page, '새 참조를 여기에 삽입하세요.', 6); await open(page, '상호 참조');
  await page.getByRole('button', { name: '참조 삽입', exact: true }).click();
  const paragraph = page.locator('#editor .w-paragraph').nth(2);
  await expect(paragraph).toHaveText('새 참조를 프로젝트 목표여기에 삽입하세요.');
  const ref = paragraph.locator('.w-field-ref');
  await expect(ref).toHaveAttribute('contenteditable', 'false');
  const source = page.locator('#editor .w-paragraph').first();
  const sourceId = await source.locator('[data-bc-sid]').first().getAttribute('data-bc-sid');
  await ref.click();
  await expect.poll(() => page.evaluate(() => (window as any).editor.selection?.startNodeId)).toBe(sourceId);
  await ref.focus(); await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as any).editor.selection?.startNodeId)).toBe(sourceId);
  await page.keyboard.press('ArrowRight'); await page.keyboard.type('X');
  await expect(source).toContainText('프X로젝트 목표');
  await expect(ref).toHaveText('프X로젝트 목표');
});

test('adds a range bookmark and a point bookmark without losing text, and moves to the point', async ({ page }) => {
  await start(page);
  await selectText(page, '새 참조를 여기에 삽입하세요.', 0, 5); await open(page);
  await page.getByRole('textbox', { name: '새 책갈피 이름', exact: true }).fill('삽입 안내');
  await page.getByRole('button', { name: '추가', exact: true }).click();
  await expect(page.locator('.w-bookmark-preview')).toHaveText('새 참조를');
  await page.getByRole('button', { name: '닫기', exact: true }).last().click();
  await selectText(page, '새 참조를 여기에 삽입하세요.', 6); await open(page);
  await page.getByRole('textbox', { name: '새 책갈피 이름', exact: true }).fill('삽입 위치');
  await page.getByRole('button', { name: '추가', exact: true }).click();
  const paragraph = page.locator('#editor .w-paragraph').nth(2);
  await expect(paragraph).toHaveText('새 참조를 여기에 삽입하세요.');
  await expect(paragraph.locator('.w-bookmark')).toHaveAttribute('data-bookmark', '삽입 위치');
  await page.getByRole('button', { name: '위치로 이동', exact: true }).click();
  await page.keyboard.type('X');
  await expect(paragraph).toHaveText('새 참조를 X여기에 삽입하세요.');
});
