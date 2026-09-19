import { test, expect } from '@playwright/test';
import { openDeck, pickMenu, visibleBoxes } from './helpers';

test('a new deck keeps Korean composition, trailing spaces, deletion and formatted text after reload', async ({ page }) => {
  await openDeck(page);
  await pickMenu(page, 'file.document.0');
  await expect(page.locator('.sl-count')).toHaveText('1 / 1');
  const [box] = await visibleBoxes(page, '.sl-text-frame');
  await page.mouse.dblclick(box.x, box.y);
  await expect(page.locator('.sl-overlay')).toHaveAttribute('data-editing', 'true');
  const text = () => page.evaluate(sid => {
    const editor = (window as any).editor;
    const read = (id: string): string => {
      const node = editor.dataStore.getNode(id);
      return typeof node?.text === 'string' ? node.text : (node?.content ?? []).map(read).join('');
    };
    return read(sid).replace(/\uFEFF/g, '');
  }, box.sid);
  const cdp = await page.context().newCDPSession(page);
  for (const [steps, commit] of [[['ㅎ', '하', '한'], '한'], [['ㄱ', '그', '글'], '글']] as const) {
    for (const step of steps) await cdp.send('Input.imeSetComposition', { text: step, selectionStart: step.length, selectionEnd: step.length });
    await cdp.send('Input.insertText', { text: commit });
  }
  await expect.poll(text).toBe('한글');
  await page.keyboard.type('   ');
  await expect.poll(text).toBe('한글   ');
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  await expect.poll(text).toBe('한글 ');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+b');
  await page.keyboard.insertText('굵은 문장');
  await page.keyboard.press('Control+b');
  await expect.poll(text).toBe('한글 굵은 문장');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  const frame = page.locator('.sl-stage .sl-text-frame').first();
  await expect(frame).toContainText('한글');
  await expect(frame).toContainText('굵은 문장');
  const restored = await frame.evaluate(element => {
    const text = [...element.querySelectorAll('*')].find(el => el.textContent === '굵은 문장' && !el.children.length);
    return text ? getComputedStyle(text).fontWeight : '';
  });
  expect(Number(restored)).toBeGreaterThanOrEqual(600);
  await cdp.detach();
});

test('pastes paragraphs into a new slide, undoes once, and saves the restored paste', async ({ page }) => {
  await openDeck(page);
  await pickMenu(page, 'file.document.0');
  await expect(page.locator('.sl-count')).toHaveText('1 / 1');
  const [box] = await visibleBoxes(page, '.sl-text-frame');
  await page.mouse.dblclick(box.x, box.y);
  await expect(page.locator('.sl-overlay')).toHaveAttribute('data-editing', 'true');
  const frame = page.locator(`.sl-stage [data-bc-sid="${box.sid}"]`);
  await frame.evaluate(element => {
    const data = new DataTransfer();
    data.setData('text/plain', '첫 문단\n두 번째 문단');
    data.setData('text/html', '<p>첫 문단</p><p><strong>두 번째 문단</strong></p>');
    const selection = document.getSelection();
    const anchor = selection?.anchorNode;
    const target = anchor?.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor?.parentElement;
    (target ?? element).dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(frame).toContainText('첫 문단');
  await expect(frame).toContainText('두 번째 문단');
  await page.keyboard.press('Control+z');
  await expect(frame).not.toContainText('첫 문단');
  await page.keyboard.press('Control+Shift+z');
  await expect(frame).toContainText('두 번째 문단');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');
  await expect(page.locator('.sl-stage .sl-text-frame').first()).toContainText('첫 문단');
  await expect(page.locator('.sl-stage .sl-text-frame').first()).toContainText('두 번째 문단');
});
