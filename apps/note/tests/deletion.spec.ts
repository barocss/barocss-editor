import { expect, test, type Page } from '@playwright/test';
import { checkTrailingSpaceEditing } from '../../../test-support/prose-input';

const run = (text: string) => ({ stype: 'inline-text', text });
async function setup(page: Page) {
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'delete.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { pageId: 'delete-test', title: '삭제 검증' }, content: [
      { stype: 'paragraph', content: [run('Start')] },
      { stype: 'paragraph', content: [run('Before'), { stype: 'pageReference', attributes: { pageId: 'project', title: '프로젝트' } }, run('After')] }
    ] }
  })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('삭제 검증');
}
async function caret(page: Page, value: string, offset: number) {
  await page.locator('.on-doc').evaluate((body, { value, offset }) => {
    const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walk.nextNode())) {
      if (node.textContent === value) {
        (body.closest('[contenteditable="true"]') as HTMLElement)?.focus();
        getSelection()!.setBaseAndExtent(node, offset, node, offset);
        return;
      }
    }
    throw new Error(`Missing text: ${value}`);
  }, { value, offset });
}

test('입력 직후 Backspace는 글자를 지우고 다음 입력·실행 취소·저장에도 반영된다', async ({ page }) => {
  await setup(page);
  await caret(page, 'Start', 5);
  await page.keyboard.type('abc');
  await page.keyboard.press('Backspace');
  const paragraph = page.locator('.on-doc > p').first();
  await expect(paragraph).toHaveText('Startab');
  await page.keyboard.press('Backspace');
  await expect(paragraph).toHaveText('Starta');
  await page.keyboard.insertText('한글');
  await page.keyboard.press('Backspace');
  await expect(paragraph).toHaveText('Starta한');
  await page.keyboard.press('Control+z');
  // Undo restores the deleted character without also undoing the preceding typing.
  await expect(paragraph).toHaveText('Starta한글');
  await page.keyboard.press('Control+Shift+z');
  await expect(paragraph).toHaveText('Starta한');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(paragraph).toHaveText('Starta한');
});

for (const key of ['Backspace', 'Delete']) {
  test(`${key}는 인접한 프로젝트 링크만 삭제하고 실행 취소로 복원한다`, async ({ page }) => {
    await setup(page);
    await caret(page, key === 'Backspace' ? 'After' : 'Before', key === 'Backspace' ? 0 : 6);
    await page.keyboard.press(key);
    await expect(page.locator('[data-note-page-reference]')).toHaveCount(0);
    await expect(page.locator('.on-doc > p').nth(1)).toHaveText('BeforeAfter');
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-note-page-reference]')).toHaveCount(1);
  });
}

test('새로 삽입한 링크 뒤에서 입력한 글자와 링크를 연속해서 지운다', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: '새 노트', exact: true }).click();
  await page.locator('.on-doc > p').first().click();
  await page.keyboard.insertText('[[삭제 검증');
  await expect(page.getByRole('listbox', { name: '페이지 연결' })).toBeVisible();
  await page.keyboard.press('Enter');
  const reference = page.locator('[data-note-page-reference]');
  await expect(reference).toHaveCount(1);
  await page.keyboard.type('abc');
  await expect(page.locator('.on-doc > p').first()).toContainText('abc');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.on-doc > p').first()).toContainText('ab');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(reference).toHaveCount(0);
});

test('빈 문단에서 한글 조합을 확정한 뒤 Backspace로 실제 글자를 지운다', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: '새 노트', exact: true }).click();
  await page.locator('.on-doc > p').first().click();
  await page.locator('.on-doc').evaluate(body => {
    const target = getSelection()!.anchorNode!;
    const host = body.closest('[contenteditable="true"]')!;
    host.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    host.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertCompositionText', data: '한글', isComposing: true }));
    target.textContent = '\uFEFF한글';
    getSelection()!.setBaseAndExtent(target, 3, target, 3);
    host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: '한글', isComposing: true }));
    host.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '한글' }));
  });
  await expect(page.locator('.on-doc > p').first()).toContainText('한글');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.on-doc > p').first()).toHaveText('한');
});

test('문장 끝 연속 공백은 각각 보이고 다음 입력·Backspace·저장 위치를 유지한다', async ({ page }) => {
  await setup(page);
  const paragraph = page.locator('.on-doc > p').first();
  await checkTrailingSpaceEditing(page, paragraph, 'Start');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect.poll(() => paragraph.textContent()).toBe('Start  X');
});
