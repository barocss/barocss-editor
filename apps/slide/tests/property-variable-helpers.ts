import { expect, type Page } from '@playwright/test';

/** Pick a native binding beside the actual property field. */
export async function bindPropertyVariable(page: Page, label: string, name: string) {
  const panel = page.locator('.sl-properties');
  await panel.getByRole('button', { name: `${label} 변수 연결`, exact: true }).click();
  const picker = panel.getByRole('dialog', { name: `${label} 변수 선택`, exact: true });
  // First-column fields and lower paint fields must remain inside the floating inspector.
  const bounds = await picker.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const owner = element.closest('[data-workspace-panel="inspector"]')!.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, owner: { left: owner.left, right: owner.right, top: owner.top, bottom: owner.bottom } };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(bounds.owner.left);
  expect(bounds.right).toBeLessThanOrEqual(bounds.owner.right);
  expect(bounds.top).toBeGreaterThanOrEqual(bounds.owner.top);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.owner.bottom);
  if (name) {
    await picker.getByRole('textbox', { name: `${label} 변수 검색`, exact: true }).fill(name);
    await picker.locator('.sl-variable-options button').filter({ hasText: name }).click();
  } else await picker.getByRole('button', { name: '연결 해제', exact: true }).click();
  await expect(picker).toHaveCount(0);
}
