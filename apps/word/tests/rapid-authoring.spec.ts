import { test, expect } from '@playwright/test';
import { placeCaret } from './helpers';

for (const rate of [1, 4]) {
  test(`typing then keyboard selection keeps the link target at ${rate}x CPU slowdown`, async ({ page }) => {
    await page.goto('/');
    await placeCaret(page, '.w-paragraph');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    // No settling wait or pointer selection between typing and the shortcut.
    await page.keyboard.type('Keep these words');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('ControlOrMeta+k');
    const dialog = page.getByRole('dialog', { name: '링크 편집', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('링크 주소').fill('https://example.com/target');
    await dialog.getByRole('button', { name: '적용', exact: true }).click();
    await expect(page.locator('.w-document a')).toHaveText('Keep these words');
    await expect(page.locator('.w-paragraph')).toHaveText('Keep these words');
    await page.locator('[data-control=undo]').click();
    await expect(page.locator('.w-document a')).toHaveCount(0);
    await expect(page.locator('.w-paragraph')).toHaveText('Keep these words');
    await page.locator('[data-control=redo]').click();
    await expect(page.locator('.w-document a')).toHaveText('Keep these words');
  });
}

test('rapid text selection applies formatting and anchors a comment to exactly that text', async ({ page }, testInfo) => {
  await page.goto('/');
  await placeCaret(page, '.w-paragraph');
  await page.keyboard.type('Review this sentence');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('ControlOrMeta+b');
  await expect(page.locator('[data-control=bold]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.mark-bold')).toHaveText('Review this sentence');
  await expect(page.locator('.mark-bold')).toHaveCSS('font-weight', '700');
  await page.keyboard.press('ControlOrMeta+Alt+m');

  const dialog = page.getByRole('dialog', { name: '새 댓글', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('댓글 내용').fill('Check the entire sentence');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.locator('.w-comment-hit')).toHaveText('Review this sentence');
  await expect(page.locator('.w-comments-pane')).toContainText('Check the entire sentence');
  const status = page.locator('[data-word-save-status]');
  await expect(status).toHaveText('저장됨');
  const saved = page.url();
  await page.reload();
  await expect(status).toHaveText('저장됨');
  expect(page.url()).toBe(saved);
  await expect(page.locator('.mark-bold')).toHaveText('Review this sentence');
  await expect(page.locator('.mark-bold')).toHaveCSS('font-weight', '700');
  await page.locator('.w-comments-closed').click();
  await expect(page.locator('.w-comment-hit')).toHaveText('Review this sentence');
  await expect(page.locator('.w-comment-text')).toHaveText(['Check the entire sentence']);
  await expect(page.locator('.w-comment-orphan')).toHaveCount(0);
  await testInfo.attach('persisted-format-review', { body: JSON.stringify({
    url: page.url(), boldText: await page.locator('.mark-bold').textContent(),
    fontWeight: await page.locator('.mark-bold').evaluate(el => getComputedStyle(el).fontWeight),
    anchoredText: await page.locator('.w-comment-hit').textContent(),
    commentText: await page.locator('.w-comment-text').allTextContents()
  }, null, 2), contentType: 'application/json' });
});

test('rapid backward selection can be replaced and undone without losing characters', async ({ page }) => {
  await page.goto('/');
  await placeCaret(page, '.w-paragraph');
  await page.keyboard.type('Keep this Replace');
  for (let index = 0; index < 7; index++) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.type('changed');
  await expect(page.locator('.w-paragraph')).toHaveText('Keep this changed');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.w-paragraph')).not.toContainText('Keep');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.w-paragraph')).toHaveText('Keep this changed');
});
