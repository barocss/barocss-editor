import { test, expect } from '@playwright/test';
import { placeCaret } from './helpers';
test('popup inserts, cancels, edits, undoes and persists a Word equation', async ({ page }) => {
 await page.goto('/'); await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
 await page.getByRole('tablist', { name: '도구 모음 선택' }).getByRole('tab', { name: '삽입', exact: true }).click();
 await placeCaret(page, '.w-paragraph');
 const count = await page.locator('.w-math').count();
 await page.getByRole('button', { name: '수식 삽입', exact: true }).click();
 const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('button', { name: '등호 정렬', exact: true })).toHaveCount(0);
 await expect(dialog.getByRole('button', { name: '조건식', exact: true })).toHaveCount(0);
 const input = dialog.locator('.me-row input').first();
 await dialog.getByRole('button', { name: '수식', exact: true }).click(); await input.fill('ζ'); await dialog.getByRole('button', { name: '취소', exact: true }).click();
 await expect(page.locator('.w-math')).toHaveCount(count);
 await placeCaret(page, '.w-paragraph'); await page.getByRole('button', { name: '수식 삽입', exact: true }).click();
 await dialog.getByRole('button', { name: '수식', exact: true }).click(); await input.fill('ζ'); await input.press('Enter'); await dialog.getByRole('button', { name: '적용', exact: true }).click();
 await expect(dialog).toBeHidden(); await expect(page.locator('.w-math')).toHaveCount(count + 1);
 await page.locator('.w-math').filter({ hasText: 'ζ' }).click();
 await page.getByRole('button', { name: '수식 편집', exact: true }).click();
 await dialog.locator('.me-preview-token').filter({ hasText: 'ζ' }).first().click(); await expect(input).toHaveValue('ζ'); await input.fill('η');
 await dialog.getByRole('button', { name: '적용', exact: true }).click(); await expect(dialog).toBeHidden();
 await expect(page.locator('.w-math').filter({ hasText: 'η' })).toHaveCount(1);
 await page.evaluate(() => (window as any).editor.executeCommand('undo'));
 await expect(page.locator('.w-math').filter({ hasText: 'ζ' })).toHaveCount(1);
 await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨'); await page.reload();
 await expect(page.locator('.w-math').filter({ hasText: 'ζ' })).toHaveCount(1);
});

test('fraction slots remain structured after applying and reopening', async ({ page }) => {
 await page.goto('/'); await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
 await page.getByRole('tablist', { name: '도구 모음 선택' }).getByRole('tab', { name: '삽입', exact: true }).click();
 await placeCaret(page, '.w-paragraph'); await page.getByRole('button', { name: '수식 삽입', exact: true }).click();
 const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: '분수', exact: true }).click();
 await dialog.locator('.me-input').fill('ζ');
 await dialog.getByRole('button', { name: '수식 / 분모', exact: true }).click(); await dialog.locator('.me-input').fill('η');
 await dialog.getByRole('button', { name: '적용', exact: true }).click(); await expect(dialog).toBeHidden();
 const math = page.locator('.w-math').filter({ hasText: 'ζη' }); await expect(math.locator('.w-math-frac')).toHaveCount(1);
 await math.click(); await page.getByRole('button', { name: '수식 편집', exact: true }).click();
 await expect(dialog.locator('[data-structure="fraction"]')).toHaveCount(1);
 await dialog.getByRole('button', { name: '취소', exact: true }).click();
});

test('LaTeX draft switches to visual editing, applies, reopens and persists', async ({ page }) => {
 await page.goto('/'); await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
 await placeCaret(page, '.w-paragraph');
 await page.getByRole('tab', { name: '삽입', exact: true }).click();
 await page.getByRole('button', { name: '수식 삽입', exact: true }).click();
 const dialog = page.getByRole('dialog');
 await dialog.getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
 const source = dialog.getByRole('textbox', { name: 'LaTeX 수식', exact: true });
 await source.fill(String.raw`\frac{x}{2}+y^2`);
 await expect(page.locator('#editor .w-math')).toHaveCount(0);
 await dialog.getByRole('tab', { name: '시각 편집', exact: true }).click();
 await expect(dialog.locator('.me-fraction')).toHaveCount(1);
 await dialog.getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
 await expect(source).toContainText('frac');
 await dialog.getByRole('button', { name: '적용', exact: true }).click();
 await expect(dialog).toBeHidden();
 await expect(page.locator('#editor .w-math-frac')).toHaveCount(1);
 await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨'); await page.reload();
 await page.locator('#editor .w-math').click();
 await page.getByRole('tab', { name: '삽입', exact: true }).click();
 await page.getByRole('button', { name: '수식 편집', exact: true }).click();
 await expect(dialog.locator('.me-fraction')).toHaveCount(1);
 await dialog.getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
 await source.fill('z+1');
 await dialog.getByRole('button', { name: '적용', exact: true }).click();
 await expect(page.locator('#editor .w-math')).toContainText('z+1');
 await page.evaluate(() => (window as any).editor.executeCommand('undo'));
 await expect(page.locator('#editor .w-math-frac')).toHaveCount(1);
});

test('invalid and unsupported LaTeX cannot change the Word document', async ({ page }) => {
 await page.goto('/'); await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
 await placeCaret(page, '.w-paragraph'); await page.getByRole('tab', { name: '삽입', exact: true }).click();
 const before = await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
 await page.getByRole('button', { name: '수식 삽입', exact: true }).click();
 const dialog = page.getByRole('dialog');
 await dialog.getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
 const source = dialog.getByRole('textbox', { name: 'LaTeX 수식', exact: true });
 for (const latex of [String.raw`\frac{`, String.raw`\begin{cases}x&y\end{cases}`]) {
  await source.fill(latex); await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible(); await expect(source).toHaveValue(latex);
  expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(before);
 }
 await source.press('Escape'); await expect(dialog).toBeHidden();
 expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(before);
});

test('suggestion keyboard input stays in the dialog and closes on mode switch', async ({ page }) => {
 await page.goto('/'); await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
 await placeCaret(page, '.w-paragraph'); await page.getByRole('tab', { name: '삽입', exact: true }).click();
 const before = await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
 await page.getByRole('button', { name: '수식 삽입', exact: true }).click();
 const dialog = page.getByRole('dialog');
 await dialog.getByRole('button', { name: '수식', exact: true }).click();
 const input = dialog.locator('.me-input:focus'); await input.fill('x/');
 const menu = page.locator('.me-suggestion-panel'); await expect(menu).toBeVisible();
 await input.press('ArrowDown'); await expect(menu.locator('[aria-selected="true"]')).toContainText('분수');
 await expect(input).toBeFocused(); await input.press('Enter');
 await expect(dialog.locator('.me-fraction')).toHaveCount(1);
 expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(before);
 await input.fill('sqrt'); await expect(menu).toBeVisible();
 await dialog.getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
 await expect(menu).toHaveCount(0);
 await page.screenshot({ path: '/tmp/word-math-source-dialog.png' });
 await dialog.getByRole('button', { name: '취소', exact: true }).click();
 expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(before);
});
