import { test, expect } from '@playwright/test';

// A file imported into the test's isolated browser context; no existing user document.
test('문단에서 콜아웃 본문까지 실제 선택을 붙여넣기로 교체하고 실행 취소한다', async ({ page }) => {
  const run = (text: string) => ({ stype: 'inline-text', text, marks: [{ stype: 'bold', range: [0, text.length] }] });
  const paragraph = (text: string) => ({ stype: 'paragraph', content: [run(text)] });
  await page.goto('/');
  await expect(page.getByLabel('노트 파일')).toBeEnabled();
  await page.getByLabel('노트 파일').setInputFiles({ name: 'boundary.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: '붙여넣기 경계 검증', pageId: 'paste-boundary-fixture' }, content: [
      paragraph('Before'), { stype: 'callout', attributes: { type: 'note' }, content: [{ stype: 'calloutTitle', content: [run('Title')] }, paragraph('Inside')] }, paragraph('After')
    ] }
  })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('붙여넣기 경계 검증');
  const first = page.locator('.on-doc > p').first();
  const body = page.locator('.on-doc .w-callout > p');
  await expect(first).toHaveText('Before'); await expect(body).toHaveText('Inside');
  await first.click();
  await page.locator('.on-doc').evaluate(element => {
    const textLeaf = (scope: Element, value: string) => {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent === value) return node;
      throw new Error(`Missing fixture text: ${value}`);
    };
    const range = document.createRange();
    range.setStart(textLeaf(element.querySelector(':scope > p')!, 'Before'), 2);
    range.setEnd(textLeaf(element.querySelector('.w-callout > p')!, 'Inside'), 2);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().replace(/\s/g, ''))).toBe('foreTitleIn');
  await expect(page.getByRole('toolbar', { name: '선택한 글 서식' })).toBeVisible();
  await page.locator('.on-doc').evaluate(element => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'NEW'); clipboardData.setData('text/html', '<p><em>NEW</em></p>');
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(first).toHaveText('BeNEW');
  await expect(body).toHaveText('side');
  await expect(page.locator('.w-callout-title')).toHaveCount(1);
  await expect(page.locator('.on-doc > p').last()).toHaveText('After');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(true);
  await page.keyboard.press('Control+z');
  await expect(first).toHaveText('Before'); await expect(body).toHaveText('Inside');
  await expect(page.locator('.w-callout-title')).toHaveText('Title');
  await expect(page.locator('.on-doc > p').last()).toHaveText('After');
});
