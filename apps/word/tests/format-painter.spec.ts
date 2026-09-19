import { test, expect, type Page } from '@playwright/test';
import { settled } from './helpers';

async function fixture(page: Page) {
  await page.goto('/');
  await expect(page.locator('.w-paragraph')).toBeVisible();
  await page.evaluate(() => (window as any).editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow' }, content: [
    { stype: 'heading', attributes: { level: 1 }, content: [{ stype: 'inline-text', text: 'Source', marks: [{ stype: 'fontColor', attrs: { color: '#ee0000' }, range: [0, 6] }] }] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Target words', marks: [{ stype: 'italic', range: [0, 12] }, { stype: 'link', attrs: { href: 'https://target.test' }, range: [0, 12] }] }] }
  ] }] }));
  await expect(page.locator('.w-paragraph')).toHaveText('Target words');
}
async function select(page: Page, text: string, start = 0, end = text.length) {
  await page.evaluate(({ text, start, end }) => {
    const root = document.querySelector('#editor')!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null; while ((node = walker.nextNode()) && node.textContent !== text) {}
    if (!node) throw new Error(`Text missing: ${text}`);
    const editable = (window as any).editorView.contentEditableElement as HTMLElement;
    if (!editable.contains(document.activeElement)) editable.focus();
    const range = document.createRange(); range.setStart(node, start); range.setEnd(node, end);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  }, { text, start, end });
}
const painter = (page: Page) => page.getByRole('button', { name: '서식 복사', exact: true });

test('repeated paragraph painting supports caret targets, stepwise undo, Escape and reopen', async ({ page }) => {
  await page.goto('/?sample=format-painter');
  const source = '기준 문단 · 가운데 정렬과 넉넉한 줄 간격';
  const first = '첫 번째 적용 문단입니다. 이 문단을 클릭해 기준 문단의 배치를 적용하세요.';
  const second = '두 번째 적용 문단입니다. 연속 적용에서는 다시 서식을 복사할 필요가 없습니다.';
  await settled(page);
  await page.locator('#editor .w-paragraph').filter({ hasText: source }).click();
  await painter(page).click();
  await page.getByRole('button', { name: '문단 서식 포함', exact: true }).click();
  await page.getByRole('button', { name: '연속 적용', exact: true }).click();
  await expect(page.getByRole('button', { name: '연속 적용', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const firstParagraph = page.locator('#editor .w-paragraph').filter({ hasText: first });
  const secondParagraph = page.locator('#editor .w-paragraph').filter({ hasText: second });
  await firstParagraph.click();
  await expect(firstParagraph).toHaveCSS('text-align', 'center');
  await expect(firstParagraph.locator('.mark-charStyle')).toHaveCount(0);
  // Keyboard-only destination selection uses the same painter action.
  await select(page, second, 3, 3); await painter(page).click();
  await expect(secondParagraph).toHaveCSS('text-align', 'center');
  await expect(painter(page)).toHaveAttribute('data-state', 'on');
  await page.keyboard.press('Escape'); await expect(painter(page)).toHaveAttribute('data-state', 'off');
  await page.locator('[data-control=undo]').click();
  await expect(secondParagraph).not.toHaveCSS('text-align', 'center');
  await expect(firstParagraph).toHaveCSS('text-align', 'center');
  await page.locator('[data-control=redo]').click(); await expect(secondParagraph).toHaveCSS('text-align', 'center');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(firstParagraph).toHaveCSS('text-align', 'center');
  await expect(secondParagraph).toHaveCSS('text-align', 'center');
  await expect(page.locator('.office-format-painter-status')).toHaveCount(0);
});

test('repeated character painting keeps the source sample and typing cancels it', async ({ page }) => {
  await fixture(page); await select(page, 'Source'); await painter(page).click();
  await page.getByRole('button', { name: '연속 적용', exact: true }).click();
  await select(page, 'Target words', 0, 6); await painter(page).click();
  await expect(painter(page)).toHaveAttribute('data-state', 'on');
  await select(page, ' words', 1, 6); await painter(page).click();
  await expect(page.locator('.w-paragraph .mark-charStyle')).toHaveCount(2);
  await page.keyboard.press('ArrowRight'); await page.keyboard.type('!');
  await expect(painter(page)).toHaveAttribute('data-state', 'off');
});

test('paints inherited heading format, retains the target link and survives undo/redo and reload', async ({ page }) => {
  await fixture(page); await select(page, 'Source'); await painter(page).click();
  await expect(painter(page)).toHaveAttribute('data-state', 'on');
  await select(page, 'Target words', 0, 6); await painter(page).click();
  const painted = page.locator('.w-paragraph .mark-charStyle');
  await expect(painted).toHaveText('Target');
  await expect(painted).toHaveCSS('font-weight', '700');
  await expect(painted).toHaveCSS('font-size', '26.6667px');
  await expect(page.locator('.w-paragraph a').first()).toHaveAttribute('href', 'https://target.test');
  await expect(painter(page)).toHaveAttribute('data-state', 'off');
  await page.locator('[data-control=undo]').click();
  await expect(painted).toHaveCount(0);
  await expect(page.locator('.w-paragraph .mark-italic')).toHaveText('Target words');
  await page.locator('[data-control=redo]').click(); await expect(painted).toHaveText('Target');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload(); await expect(page.locator('.w-paragraph .mark-charStyle')).toHaveText('Target');
});

test('Escape cancels without changing the document', async ({ page }) => {
  await fixture(page); await select(page, 'Source'); await painter(page).click();
  await page.keyboard.press('Escape');
  await expect(painter(page)).toHaveAttribute('data-state', 'off');
  await expect(page.locator('.mark-charStyle')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '서식 복사 취소' })).toHaveCount(0);
});

test('dragging a destination applies the captured sample once', async ({ page }) => {
  await fixture(page); await select(page, 'Source'); await painter(page).click();
  await expect(painter(page)).toHaveAttribute('data-state', 'on');
  const box = await page.locator('.w-paragraph').evaluate(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const node = walker.nextNode()!;
    const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 6);
    const rect = range.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  await page.mouse.move(box.x + 1, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('.w-paragraph .mark-charStyle')).toHaveText('Target');
  await expect(painter(page)).toHaveAttribute('data-state', 'off');
});

test('tracked painting is recorded and one undo restores the destination', async ({ page }) => {
  await fixture(page); await page.getByRole('tab', { name: '검토', exact: true }).click();
  await page.getByRole('button', { name: '변경 내용 추적', exact: true }).click();
  await page.getByRole('tab', { name: '홈', exact: true }).click();
  await select(page, 'Source'); await painter(page).click(); await select(page, 'Target words', 0, 6); await painter(page).click();
  await expect.poll(() => page.evaluate(() => {
    const ed = (window as any).editor; return JSON.stringify(ed.exportDocument(ed.getRootId())).includes('formatChange');
  })).toBe(true);
  await page.locator('[data-control=undo]').click();
  await expect(page.locator('.w-paragraph .mark-charStyle')).toHaveCount(0);
});


test('switching the document cancels the captured sample', async ({ page }) => {
  await fixture(page); await select(page, 'Source'); await painter(page).click();
  await page.evaluate(() => {
    const ed = (window as any).editor; ed.loadDocument(ed.exportDocument(ed.getRootId()));
  });
  await expect(painter(page)).toHaveAttribute('data-state', 'off');
  await expect(page.locator('.mark-charStyle')).toHaveCount(0);
});

test('format menu starts painting and the cancel button leaves the content unchanged', async ({ page }) => {
  await fixture(page); await select(page, 'Source');
  await page.locator('.w-menubar [data-menu=format]').click();
  await page.getByRole('menuitem', { name: '서식 복사', exact: true }).click();
  await expect(painter(page)).toHaveAttribute('data-state', 'on');
  await page.getByRole('button', { name: '서식 복사 취소', exact: true }).click();
  await expect(painter(page)).toHaveAttribute('data-state', 'off');
  await expect(page.locator('.mark-charStyle')).toHaveCount(0);
});
