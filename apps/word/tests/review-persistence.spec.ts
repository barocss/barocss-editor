import { test, expect, type Page } from '@playwright/test';
import { placeCaret } from './helpers';

async function startComment(page: Page) {
  await page.goto('/?sample');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.locator('.w-comments-closed').click();
  await placeCaret(page, '.w-paragraph', 1);
  await page.keyboard.press('Home');
  await page.keyboard.down('Shift');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');
  await expect(page.getByLabel('Add comment')).toBeEnabled();
  await page.getByLabel('New comment', { exact: true }).fill('검토할 문장');
  await page.getByLabel('Add comment').click();
  return page.locator('.w-comment').filter({ hasText: '검토할 문장' });
}

test('review dates are captured per action and comments, replies and revisions survive reopen', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2040-01-02T12:00:00Z'));
  const thread = await startComment(page);
  const body = await page.locator('#editor .w-paragraph').allTextContents();
  await expect(thread.locator('.w-comment-orphan')).toHaveCount(0);
  await expect(thread).toContainText('2040-01-02');
  await page.clock.setFixedTime(new Date('2040-01-03T12:00:00Z'));
  await thread.getByLabel('Edit comment', { exact: true }).click();
  await page.getByLabel('Edit comment text').fill('검토할 문장 수정');
  await page.getByLabel('Edit comment text').press('Enter');
  await expect(thread.locator('.w-comment-orphan')).toHaveCount(0);
  await expect(thread).toContainText('2040-01-02');
  await expect(thread).not.toContainText('2040-01-03');
  await thread.getByLabel('Reply', { exact: true }).fill('확인했습니다');
  await thread.getByLabel('Send reply').click();
  await expect(thread).toContainText('2040-01-03');
  await expect(thread.locator('.w-comment-orphan')).toHaveCount(0);
  await expect(page.locator('#editor .w-paragraph')).toHaveText(body);
  await page.getByRole('tab', { name: '검토', exact: true }).click();
  await page.getByRole('button', { name: '변경 내용 추적', exact: true }).click();
  await placeCaret(page, '.w-paragraph', 1);
  await page.keyboard.press('End');
  await page.keyboard.type(' Review persisted.');
  const inserted = page.locator('#editor .w-insertion').filter({ hasText: 'Review persisted.' });
  await expect(inserted).toHaveCount(1);
  await expect(thread.locator('.w-comment-orphan')).toHaveCount(0);
  const dates = () => page.evaluate(() => {
    const dates: string[] = [];
    const visit = (node: any) => {
      if (node.text?.includes('Review persisted.')) {
        for (const mark of node.marks ?? []) if (mark.stype === 'insertion') dates.push(mark.attrs?.date);
      }
      for (const child of node.content ?? []) visit(child);
    };
    visit((window as any).editor.exportDocument());
    return dates;
  });
  await expect.poll(dates).toEqual(['2040-01-03']);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(inserted).toHaveCount(1);
  await expect.poll(dates).toEqual(['2040-01-03']);
  await page.locator('.w-comments-closed').click();
  await expect(thread.locator('.w-comment-text')).toHaveText(['검토할 문장 수정', '확인했습니다']);
  await expect(thread).toContainText('2040-01-02');
  await expect(thread).toContainText('2040-01-03');
  await expect(thread.locator('.w-comment-orphan')).toHaveCount(0);
  await thread.getByLabel('Resolve comment').click();
  await expect(thread).toHaveAttribute('data-resolved', 'true');
  await page.getByRole('tab', { name: '검토', exact: true }).click();
  await placeCaret(page, '#editor .w-insertion', await inserted.evaluate(el =>
    Array.from(document.querySelectorAll('#editor .w-insertion')).indexOf(el)));
  await page.getByRole('button', { name: '적용', exact: true }).click();
  await expect(inserted).toHaveCount(0);
  await expect(page.locator('#editor')).toContainText('Review persisted.');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await page.locator('.w-comments-closed').click();
  await expect(thread).toHaveAttribute('data-resolved', 'true');
  await expect(inserted).toHaveCount(0);
  await expect(page.locator('#editor')).toContainText('Review persisted.');
});

test('composition Enter does not submit a reply or finish editing a comment', async ({ page }) => {
  const thread = await startComment(page);
  const body = await page.locator('#editor .w-paragraph').allTextContents();
  const cdp = await page.context().newCDPSession(page);
  const reply = thread.getByLabel('Reply', { exact: true });
  await reply.focus();
  await cdp.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 });
  await reply.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true });
  await expect(thread.locator('.w-comment-text')).toHaveCount(1);
  await expect(reply).toBeFocused();
  await reply.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, bubbles: true });
  await expect(thread.locator('.w-comment-text')).toHaveCount(1);
  await cdp.send('Input.insertText', { text: '한' });
  await reply.press('Enter');
  await expect(thread.locator('.w-comment-text')).toHaveText(['검토할 문장', '한']);

  await thread.getByLabel('Edit comment', { exact: true }).first().click();
  const edit = page.getByLabel('Edit comment text');
  await edit.fill('');
  await cdp.send('Input.imeSetComposition', { text: '글', selectionStart: 1, selectionEnd: 1 });
  await edit.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true });
  await expect(edit).toBeVisible();
  await expect(edit).toBeFocused();
  await cdp.send('Input.insertText', { text: '글' });
  await edit.press('Enter');
  await expect(page.locator('.w-comment-text').filter({ hasText: /^글$/ })).toHaveCount(1);
  await expect(page.locator('#editor .w-paragraph')).toHaveText(body);
});
