import { test, expect } from '@playwright/test';
import { placeCaret } from './helpers';

test('new documents open as a blank page without sample furniture', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await expect(page.getByLabel('문서 제목', { exact: true })).toHaveValue('');
  await expect(page.locator('.w-paragraph')).toHaveCount(1);
  await expect(page.locator('#editor')).not.toContainText('Draft');
  await expect(page.locator('#editor')).not.toContainText('Bibliography');
  await expect(page.locator('.w-file-picker')).toBeHidden();
  await placeCaret(page, '.w-paragraph');
  await page.keyboard.type('A new document');
  await expect(page.locator('.w-paragraph')).toContainText('A new document');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('.w-paragraph')).toContainText('A new document');
});

test('ribbon groups stay focused and switching preserves the insertion target', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  const ribbon = page.getByRole('tablist', { name: '도구 모음 선택' });
  await placeCaret(page, '.w-paragraph');
  await page.keyboard.type('Hello');
  await expect(page.locator('[data-group="character"]')).toBeVisible();
  await expect(page.getByRole('group', { name: '변경 내용 추적', exact: true })).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: '기본 문서 도구' })).toBeVisible();
  await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await ribbon.getByRole('tab', { name: '삽입', exact: true }).click();
  await expect(page.getByRole('button', { name: '수식 삽입', exact: true })).toBeEnabled();
  await expect(page.locator('[data-group="character"]')).toHaveCount(0);
  await ribbon.getByRole('tab', { name: '검토', exact: true }).click();
  await expect(page.getByRole('group', { name: '변경 내용 추적', exact: true })).toBeVisible();
  await ribbon.getByRole('tab', { name: '보기', exact: true }).click();
  await expect(ribbon.getByRole('tab', { name: '보기', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: '확대/축소', exact: true })).toBeVisible();
  await ribbon.getByRole('tab', { name: '홈', exact: true }).click();
  await expect(page.locator('[data-group="character"]')).toBeVisible();
  await expect(page.locator('.w-paragraph')).toContainText('Hello');
  await page.keyboard.type(' world');
  await expect(page.locator('.w-paragraph')).toHaveCount(1);
  await expect(page.locator('.w-paragraph')).toHaveText('Hello world');
});

test('file actions remain reachable through the grouped document dialog', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.getByRole('button', { name: '문서 작업', exact: true }).click();
  const actions = page.getByRole('dialog', { name: '문서 작업', exact: true });
  await expect(actions.getByRole('button', { name: 'DOCX 가져오기', exact: true })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'DOCX 내보내기', exact: true })).toBeVisible();
  await actions.getByRole('button', { name: '보관함에 사본 저장', exact: true }).click();
  await expect(actions.getByRole('status')).toContainText('보관함에 저장됨');
  await actions.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '문서 보관함', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '문서 보관함', exact: true })).toBeVisible();
});

test('sample content stays available explicitly and metadata remains editable', async ({ page }) => {
  await page.goto('/?sample');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await expect(page.getByLabel('문서 제목', { exact: true })).toHaveValue('Barocss Word');
  await expect(page.locator('#editor')).toContainText('Bibliography');
  await expect(page.getByLabel('작성자', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '문서 정보', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('작성자', { exact: true })).toBeVisible();
});
