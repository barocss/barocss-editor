import { test, expect } from '@playwright/test';

test('draft multiline preserves whitespace, IME and newlines; Escape cancels and failure retries', async ({ page }) => {
  await page.goto('/design-system/index.html#multiline');
  const panel = page.locator('#multiline'), input = panel.getByRole('textbox', { name: '확정형 여러 줄' });
  await input.fill('  검토  '); await input.press('End'); await input.press('Enter'); await input.press('x');
  await expect(input).toHaveValue('  검토  \nx');
  await expect(panel.locator('[data-multiline-count]')).toHaveText('적용 횟수: 0');
  await input.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true });
  await expect(panel.locator('[data-multiline-count]')).toHaveText('적용 횟수: 0');
  await input.press('ControlOrMeta+Enter');
  expect(await panel.locator('[data-multiline-saved]').textContent()).toBe('  검토  \nx');
  await input.fill('버릴 초안'); await input.press('Escape');
  await expect(input).toHaveValue('  검토  \nx');
  await panel.getByRole('checkbox', { name: '다중행 실패 예시' }).check();
  await input.fill('실패 후 유지'); await input.press('ControlOrMeta+Enter');
  await expect(panel.getByRole('alert')).toContainText('입력은 유지됩니다');
  await expect(input).toHaveValue('실패 후 유지');
  await panel.getByRole('checkbox', { name: '다중행 실패 예시' }).uncheck();
  await panel.getByRole('button', { name: '다시 시도' }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel.locator('[data-multiline-saved]')).toHaveText('실패 후 유지');
  await panel.getByRole('button', { name: '외부 값 변경' }).click();
  await expect(input).toHaveValue('외부에서 갱신한 값');
  await input.fill('blur 확정'); await panel.getByRole('textbox', { name: '실시간 여러 줄' }).click();
  await expect(panel.locator('[data-multiline-saved]')).toHaveText('blur 확정');
  await expect(panel.getByRole('textbox', { name: '읽기 전용 여러 줄' })).toHaveAttribute('readonly', '');
  await expect(panel.getByRole('textbox', { name: '비활성 여러 줄' })).toBeDisabled();
});

test('a pending commit is read-only and duplicate submissions do not call the host twice', async ({ page }) => {
  await page.goto('/design-system/index.html#multiline');
  const panel = page.locator('#multiline'), input = panel.getByRole('textbox', { name: '확정형 여러 줄' });
  await panel.getByRole('checkbox', { name: '다중행 대기 예시' }).check();
  await input.fill('적용할 값'); await input.press('ControlOrMeta+Enter');
  await expect(input).toHaveAttribute('readonly', '');
  await expect(input).toHaveAttribute('aria-busy', 'true');
  await input.press('ControlOrMeta+Enter');
  await panel.getByRole('button', { name: '대기 완료' }).click();
  await expect(input).not.toHaveAttribute('aria-busy', 'true');
  await expect(panel.locator('[data-multiline-count]')).toHaveText('적용 횟수: 1');
  await expect(panel.locator('[data-multiline-saved]')).toHaveText('적용할 값');
});
