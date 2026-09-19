import { test, expect, type Page } from '@playwright/test';

async function openReference(page: Page) {
  const paragraph = page.locator('#editor .w-paragraph').filter({ hasText: '두 번째 그림에도 캡션을 추가해 보세요.' }).last();
  await paragraph.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.getByRole('tab', { name: '참조', exact: true }).click();
  await page.getByRole('button', { name: '상호 참조', exact: true }).click();
  await page.getByRole('combobox', { name: '참조 종류', exact: true }).click();
  await page.getByRole('option', { name: '그림', exact: true }).click();
}

test('caption reference tracks its source through renumbering, description edits, undo and reload', async ({ page }) => {
  await page.goto('/?sample=captions');
  await openReference(page);
  await expect(page.getByRole('combobox', { name: '대상 캡션' })).toContainText('그림 1: 분기별 성장');
  await expect(page.locator('.w-bookmark-preview')).toHaveText('그림 1');
  await page.getByRole('button', { name: '참조 삽입', exact: true }).click();
  const ref = page.locator('#editor .w-field-ref[data-target-kind="caption"]');
  await expect(ref).toHaveText('그림 1');
  const target = await ref.getAttribute('data-target');
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect(ref).toHaveCount(0);
  await page.evaluate(() => (window as any).editor.run('redo'));
  await expect(ref).toHaveText('그림 1');
  await ref.click();
  await expect.poll(() => page.evaluate(() => {
    const editor = (window as any).editor, sel = editor.selection;
    return editor.dataStore.getNode(sel?.startNodeId)?.text;
  })).toBe('그림 ');
  await page.getByRole('img', { name: '첫 번째 그림', exact: true }).click();
  await page.getByRole('tab', { name: '참조', exact: true }).click();
  await page.getByRole('button', { name: '캡션 삽입', exact: true }).click();
  await page.getByRole('textbox', { name: '캡션 설명' }).fill('앞쪽 캡션');
  await page.getByRole('button', { name: '캡션 넣기', exact: true }).click();
  await expect(ref).toHaveText('그림 2'); await expect(ref).toHaveAttribute('data-target', target!);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨'); await page.reload();
  await expect(ref).toHaveText('그림 2'); await expect(ref).toHaveAttribute('data-target', target!);

  await openReference(page);
  await page.getByRole('combobox', { name: '대상 캡션' }).click();
  await page.getByRole('option', { name: '그림 2: 분기별 성장', exact: true }).click();
  await page.getByRole('combobox', { name: '참조 표시' }).click();
  await page.getByRole('option', { name: '캡션 전체', exact: true }).click();
  await page.getByRole('button', { name: '참조 삽입', exact: true }).click();
  await expect(ref).toHaveText(['그림 2', '그림 2: 분기별 성장']);
  const caption = page.locator('#editor .w-paragraph').filter({ has: page.locator('.w-field-seq') }).filter({ hasText: '분기별 성장' });
  await caption.click(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.type(' updated');
  await expect(ref.last()).toHaveText('그림 2: 분기별 성장 updated');
  await ref.last().focus(); await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => {
    const editor = (window as any).editor;
    const paragraph = editor.dataStore.getNode(editor.dataStore.getNode(editor.selection.startNodeId).parentId);
    return paragraph.content.some((id: string) => editor.dataStore.getNode(id)?.stype === 'fieldSeq');
  })).toBe(true);
  // Delete only the source caption. Its reference must not bind to the preceding caption.
  await caption.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+ArrowRight' : 'Shift+End');
  await page.keyboard.press('Backspace');
  await expect(ref.first()).toContainText('Reference source not found');
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect(ref).toHaveText(['그림 2', '그림 2: 분기별 성장 updated']);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨'); await page.reload();
  await expect(ref).toHaveText(['그림 2', '그림 2: 분기별 성장 updated']);
});

test('empty category and cancellation leave the document unchanged', async ({ page }) => {
  await page.goto('/?sample=captions');
  const before = await page.locator('#editor').textContent();
  await openReference(page);
  await page.getByRole('combobox', { name: '참조 종류', exact: true }).click();
  await page.getByRole('option', { name: '수식', exact: true }).click();
  await expect(page.getByRole('button', { name: '참조 삽입', exact: true })).toBeDisabled();
  await expect(page.locator('.w-bookmark-preview')).toContainText('캡션을 먼저 추가');
  await page.getByRole('button', { name: '닫기', exact: true }).last().click();
  await expect(page.locator('#editor')).toHaveText(before!);
});
