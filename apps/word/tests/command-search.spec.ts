import { expect, test } from '@playwright/test';
import { placeCaret, settled } from './helpers';

test('command search restores the selected text, formats it and opens authoring at the saved range', async ({ page }) => {
  await page.goto('/'); await placeCaret(page, '.w-paragraph');
  await page.keyboard.type('Command target'); await page.keyboard.press('Shift+Home');
  await page.getByRole('button', { name: '명령 검색', exact: true }).click();
  const query = page.getByRole('combobox', { name: '명령 검색어' });
  await query.fill('굵게'); await query.press('Enter');
  await expect(page.locator('.w-document .mark-bold')).toContainText('Command target');
  await expect(page.locator('.w-document')).not.toContainText('굵게');
  await page.getByRole('button', { name: '명령 검색', exact: true }).click();
  await query.fill('실행 취소'); await query.press('Enter');
  await expect(page.locator('.w-document .mark-bold').filter({ hasText: 'Command target' })).toHaveCount(0);
  await expect(page.locator('.w-document')).toContainText('Command target');
  await placeCaret(page, '.w-paragraph'); await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('Command target');
  await expect.poll(() => page.evaluate(() => window.editor.selection?.endOffset)).toBe(14);
  await page.getByRole('button', { name: '명령 검색', exact: true }).click();
  await query.fill('링크 편집'); await query.press('Enter');
  const link = page.getByRole('dialog', { name: '링크 편집', exact: true });
  await expect(link).toBeVisible();
  await link.getByLabel('링크 주소').fill('https://example.com/command');
  await link.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.locator('.w-document a[href="https://example.com/command"]')).toContainText('Command target');
  await page.getByRole('button', { name: '명령 검색', exact: true }).click();
  await query.fill('다시 실행');
  await expect(page.getByRole('option')).toHaveAttribute('aria-disabled', 'true');
  await query.press('Enter'); await expect(query).toBeVisible();
  await page.screenshot({ path: '../../.dev/artifacts/design-system/command-search-word.png', animations: 'disabled' });
});

// Public editor lifetime changes are diagnostic controls. Text selection and
// command admission still use the real glyph, search dialog and keyboard.
for (const retirement of ['same-root replacement', 'selection ABA', 'authority ABA', 'composition'] as const) {
  test(`command search refuses its captured range after ${retirement}`, async ({ page }) => {
    await page.goto('/?sample'); await settled(page);
    const glyph = page.locator('#editor .w-paragraph .mark-code').filter({ hasText: 'Normal' }).first();
    await glyph.dblclick();
    await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('Normal');
    await expect.poll(() => page.evaluate(() => window.editor.selection?.endOffset)).toBe(6);
    await page.getByRole('button', { name: '명령 검색', exact: true }).click();
    const query = page.getByRole('combobox', { name: '명령 검색어' });
    await query.fill('굵게');
    const before = await page.evaluate(kind => {
      const editor = window.editor, selection = structuredClone(editor.selection), root = editor.getRootId();
      if (kind === 'same-root replacement') {
        editor.loadDocument(editor.exportDocument(), String(editor.dataStore.getSessionId()));
        if (editor.getRootId() !== root) throw new Error('The same-root replacement control changed the durable root');
        editor.updateSelection(selection);
      } else if (kind === 'selection ABA') {
        editor.updateSelection(null); editor.updateSelection(selection);
      } else if (kind === 'authority ABA') {
        editor.setEditable(false); editor.setEditable(true);
      } else {
        window.editorView.contentEditableElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ㅎ' }));
      }
      return { native: editor.exportDocument(), history: editor.getHistoryStats(), selection: editor.selection };
    }, retirement);
    await query.press('Enter');
    await expect(page.getByRole('alert')).toContainText('문서가 변경되었습니다. 명령을 다시 선택하세요.');
    await expect(query).toBeVisible();
    expect(await page.evaluate(() => ({ native: window.editor.exportDocument(), history: window.editor.getHistoryStats(), selection: window.editor.selection }))).toEqual(before);
    if (retirement === 'composition') {
      await page.evaluate(() => window.editorView.contentEditableElement.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })));
    }
    await query.press('Escape');
    await glyph.dblclick();
    await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('Normal');
    await page.getByRole('button', { name: '명령 검색', exact: true }).click();
    await query.fill('굵게'); await query.press('Enter');
    await expect(page.locator('#editor .w-paragraph .mark-bold').filter({ hasText: 'Normal' }).first()).toBeVisible();
  });
}

test('command search rechecks its captured owner after native dialog focus restoration', async ({ page }) => {
  await page.goto('/?sample'); await settled(page);
  const glyph = page.locator('#editor .w-paragraph .mark-code').filter({ hasText: 'Normal' }).first();
  await glyph.dblclick(); await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('Normal');
  await expect.poll(() => page.evaluate(() => window.editor.selection?.endOffset)).toBe(6);
  await page.getByRole('button', { name: '명령 검색', exact: true }).click();
  const query = page.getByRole('combobox', { name: '명령 검색어' }); await query.fill('굵게');
  const before = await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('.office-command-trigger')!;
    const native = window.editorView.contentEditableElement;
    const retire = (event: FocusEvent) => {
      if (!(event.target instanceof Node) || event.target !== trigger && !native.contains(event.target)) return;
      document.removeEventListener('focus', retire, true);
      Object.assign(window, { wordSearchFocusRetired: true });
      window.editor.setEditable(false); window.editor.setEditable(true);
    };
    document.addEventListener('focus', retire, true);
    return { native: window.editor.exportDocument(), history: window.editor.getHistoryStats(), selection: window.editor.selection };
  });
  await query.press('Enter');
  await expect(query).not.toBeVisible();
  expect(await page.evaluate(() => (window as Window & { wordSearchFocusRetired?: boolean }).wordSearchFocusRetired)).toBe(true);
  await expect(page.getByRole('alert')).toContainText('문서가 변경되었습니다. 명령을 다시 선택하세요.');
  expect(await page.evaluate(() => ({ native: window.editor.exportDocument(), history: window.editor.getHistoryStats(), selection: window.editor.selection }))).toEqual(before);
});
