import { test, expect, type Page } from '@playwright/test';
import { placeCaret, settled } from './helpers';
const manager = (page: Page) => page.getByRole('dialog', { name: '스타일 관리', exact: true });
async function open(page: Page, index = 0) {
  await placeCaret(page, '#editor .w-paragraph', index);
  await page.getByRole('button', { name: '스타일 상세 설정', exact: true }).click();
  await expect(manager(page)).toBeVisible();
}
async function size(page: Page, value: string) {
  await page.getByRole('spinbutton', { name: '스타일 글자 크기', exact: true }).fill(value);
  await page.getByRole('spinbutton', { name: '스타일 글자 크기', exact: true }).press('Tab');
}

test('updating a shared style changes both paragraphs, preserves other styles, and survives undo/reopen', async ({ page }) => {
  await page.goto('/?sample=styles'); await settled(page);
  const paragraphs = page.locator('#editor .w-paragraph');
  const before = await paragraphs.first().evaluate(el => getComputedStyle(el).fontSize);
  const untouched = await paragraphs.nth(2).evaluate(el => getComputedStyle(el).fontSize);
  await open(page); await expect(page.getByRole('textbox', { name: '스타일 이름', exact: true })).toHaveValue('보고서 본문');
  await size(page, '18');
  await page.getByRole('textbox', { name: '스타일 이름', exact: true }).fill('최종 보고서');
  await page.getByRole('button', { name: '변경 저장', exact: true }).click();
  await expect(manager(page)).toHaveCount(0);
  await expect(paragraphs.nth(0)).toHaveCSS('font-size', '24px');
  await expect(paragraphs.nth(1)).toHaveCSS('font-size', '24px');
  await expect(paragraphs.nth(2)).toHaveCSS('font-size', untouched);
  await page.locator('[data-control=undo]').click(); await expect(paragraphs.first()).toHaveCSS('font-size', before);
  await page.locator('[data-control=redo]').click(); await expect(paragraphs.first()).toHaveCSS('font-size', '24px');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨'); await page.reload(); await settled(page);
  await expect(paragraphs.nth(1)).toHaveCSS('font-size', '24px');
  await placeCaret(page, '#editor .w-paragraph', 0);
  await expect(page.getByRole('combobox', { name: 'Paragraph style', exact: true })).toHaveText('최종 보고서');
});

test('creates from a paragraph, applies from the ribbon, and validates duplicate names', async ({ page }) => {
  await page.goto('/?sample=styles'); await settled(page); await open(page);
  await page.getByRole('button', { name: '새 스타일', exact: true }).click();
  await page.getByRole('textbox', { name: '스타일 이름', exact: true }).fill('보고서 본문');
  await expect(page.getByRole('button', { name: '만들고 적용', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: '스타일 이름', exact: true }).fill('강조 문단');
  await page.getByRole('combobox', { name: '스타일 정렬', exact: true }).click();
  await page.getByRole('option', { name: '가운데', exact: true }).click();
  await page.getByRole('button', { name: '만들고 적용', exact: true }).click();
  await expect(manager(page)).toHaveCount(0);
  const paragraphs = page.locator('#editor .w-paragraph');
  await expect(paragraphs.first()).toHaveCSS('text-align', 'center');
  await placeCaret(page, '#editor .w-paragraph', 2);
  await page.getByRole('combobox', { name: 'Paragraph style', exact: true }).click();
  await page.getByRole('option', { name: '강조 문단', exact: true }).click();
  await expect(paragraphs.nth(2)).toHaveCSS('text-align', 'center');
  await expect(page.getByRole('combobox', { name: 'Paragraph style', exact: true })).toHaveText('강조 문단');
  await page.locator('[data-control=undo]').click(); await expect(paragraphs.nth(2)).not.toHaveCSS('text-align', 'center');
});

test('the format menu opens the manager and cancelling a draft leaves the document untouched', async ({ page }) => {
  await page.goto('/?sample=styles'); await settled(page); await placeCaret(page, '#editor .w-paragraph');
  const before = await page.locator('#editor').innerText();
  await page.getByRole('menuitem', { name: '서식', exact: true }).click();
  await page.getByRole('menuitem', { name: '스타일 관리…', exact: true }).click();
  await size(page, '25'); await page.keyboard.press('Escape');
  await expect(manager(page)).toHaveCount(0);
  expect(await page.locator('#editor').innerText()).toBe(before);
  await expect(page.locator('#editor .w-paragraph').first()).toHaveCSS('font-size', '17.3333px');
});

test('loads the current paragraph format into a style and updates other matching paragraphs', async ({ page }) => {
  await page.goto('/?sample=styles'); await settled(page); await placeCaret(page, '#editor .w-paragraph');
  await page.getByRole('button', { name: 'Centre', exact: true }).click();
  const paragraphs = page.locator('#editor .w-paragraph');
  await expect(paragraphs.first()).toHaveCSS('text-align', 'center');
  await expect(paragraphs.nth(1)).not.toHaveCSS('text-align', 'center');
  await open(page);
  await page.getByRole('button', { name: '현재 문단 서식 가져오기', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '스타일 정렬', exact: true })).toHaveText('가운데');
  await expect(page.getByRole('button', { name: '선택 문단에 적용', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '변경 저장', exact: true }).click();
  await expect(paragraphs.nth(1)).toHaveCSS('text-align', 'center');
  await expect(paragraphs.nth(2)).not.toHaveCSS('text-align', 'center');
});

test('custom style actions are unavailable while tracking changes', async ({ page }) => {
  await page.goto('/?sample=styles'); await settled(page); await placeCaret(page, '#editor .w-paragraph');
  await page.evaluate(() => (window as any).editor.run('toggleTrackChanges'));
  await page.getByRole('combobox', { name: 'Paragraph style', exact: true }).click();
  await expect(page.getByRole('option', { name: '보고서 본문', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await open(page);
  await expect(page.getByRole('button', { name: '변경 저장', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '선택 문단에 적용', exact: true })).toBeDisabled();
  await expect(manager(page)).toContainText('변경 추적을 끈 상태');
});
