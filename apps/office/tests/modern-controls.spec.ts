import { expect, test } from '@playwright/test';

// Touch input at a desktop viewport checks shared controls, not mobile layout.
test.use({ hasTouch: true, viewport: { width: 1280, height: 900 } });

test('touch activates actions once, changes selection and leaves disabled actions inert', async ({ page }) => {
  await page.goto('/design-system/index.html#buttons');
  const feedback = page.locator('[data-button-feedback]');
  await page.getByRole('button', { name: '기본 버튼 확인', exact: true }).tap();
  await expect(feedback).toContainText('실행 횟수: 1');
  const toggle = page.getByRole('button', { name: '아이콘 선택 버튼', exact: true });
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const disabled = page.getByRole('button', { name: '비활성 강조 버튼', exact: true });
  await disabled.scrollIntoViewIfNeeded();
  const box = (await disabled.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(feedback).toContainText('실행 횟수: 1');

  await page.goto('/design-system/index.html#fields');
  const choice = page.getByRole('combobox', { name: '긴 문서 형식', exact: true });
  await choice.tap();
  await page.getByRole('option', { name: '간단한 요약', exact: true }).tap();
  await expect(choice).toContainText('간단한 요약');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(choice).toBeFocused();
});
