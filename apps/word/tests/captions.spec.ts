import { test, expect, type Page } from '@playwright/test';
import { placeCaret } from './helpers';

async function setup(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.evaluate(() => (window as any).editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow' }, content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'First object' }] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Second object' }] }
  ] }] }));
}
async function open(page: Page, target: 'First' | 'Second') {
  await placeCaret(page, '#editor .w-paragraph', await page.locator('#editor .w-paragraph').evaluateAll((els, target) => els.findIndex(el => el.textContent === `${target} object`), target));
  await page.getByRole('tab', { name: '참조', exact: true }).click();
  await page.getByRole('button', { name: '캡션 삽입', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '캡션 삽입', exact: true })).toBeVisible();
}
async function add(page: Page, target: 'First' | 'Second', text: string, label?: string, position?: string) {
  await open(page, target);
  if (label) {
    await page.getByRole('combobox', { name: '캡션 종류' }).click();
    await page.getByRole('option', { name: label, exact: true }).click();
  }
  if (position) {
    await page.getByRole('combobox', { name: '캡션 위치' }).click();
    await page.getByRole('option', { name: position, exact: true }).click();
  }
  await page.getByRole('textbox', { name: '캡션 설명' }).fill(text);
  await page.getByRole('button', { name: '캡션 넣기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '캡션 삽입', exact: true })).toBeHidden();
}

test('captions number by document order, keep editable descriptions and survive undo and reload', async ({ page }) => {
  await setup(page);
  await add(page, 'Second', '두 번째 그림');
  const numbers = page.locator('.w-field-seq[data-sequence="Figure"]');
  await expect(numbers).toHaveText(['1']);
  await add(page, 'First', '첫 번째 그림', undefined, '현재 블록 위');
  await expect(numbers).toHaveText(['1', '2']);
  await expect(page.locator('#editor .w-paragraph').first()).toHaveText('그림 1: 첫 번째 그림');
  await expect(numbers.first()).toHaveAttribute('contenteditable', 'false');
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect(numbers).toHaveText(['1']);
  await page.evaluate(() => (window as any).editor.run('redo'));
  await expect(numbers).toHaveText(['1', '2']);
  await add(page, 'First', '계산식', '수식');
  await expect(page.locator('.w-field-seq[data-sequence="Equation"]')).toHaveText('1');
  await placeCaret(page, '#editor .w-paragraph', 0);
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  await expect(page.locator('#editor .w-paragraph').first()).toContainText('edited');
  await expect(numbers).toHaveText(['1', '2']);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(numbers).toHaveText(['1', '2']);
  await expect(page.locator('.w-field-seq[data-sequence="Equation"]')).toHaveText('1');
  await expect(page.locator('#editor .w-paragraph').first()).toContainText('edited');
});

test('cancel preserves the body and tracking disables insertion', async ({ page }) => {
  await setup(page);
  await open(page, 'First');
  await page.getByRole('textbox', { name: '캡션 설명' }).fill('취소할 설명');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.locator('.w-field-seq')).toHaveCount(0);
  await expect(page.locator('#editor .w-paragraph')).toHaveText(['First object', 'Second object']);
  await page.getByRole('tab', { name: '검토', exact: true }).click();
  await page.getByRole('button', { name: '변경 내용 추적', exact: true }).click();
  await page.getByRole('tab', { name: '참조', exact: true }).click();
  await expect(page.getByRole('button', { name: '캡션 삽입', exact: true })).toBeDisabled();
});

test('a selected inline picture receives a caption outside its paragraph', async ({ page }) => {
  await page.goto('/?sample=captions');
  await page.getByRole('img', { name: '두 번째 그림', exact: true }).click();
  await page.getByRole('tab', { name: '참조', exact: true }).click();
  await page.getByRole('button', { name: '캡션 삽입', exact: true }).click();
  await page.getByRole('textbox', { name: '캡션 설명' }).fill('제품별 비교');
  await page.getByRole('button', { name: '캡션 넣기', exact: true }).click();
  await expect(page.locator('.w-field-seq')).toHaveText(['1', '2']);
  await expect(page.getByRole('img', { name: '두 번째 그림', exact: true })).toBeVisible();
  await expect.poll(() => page.getByRole('img', { name: '두 번째 그림', exact: true }).evaluate(el =>
    el.closest('.w-paragraph')?.nextElementSibling?.textContent)).toBe('그림 2: 제품별 비교');
});
