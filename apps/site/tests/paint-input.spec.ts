import { expect, test } from '@playwright/test';

test('Site gradient and shadow use the shared colour focus and number commit rules', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-admin-open]').first().click();
  await page.locator('[data-frame="desktop"] img.st-picture[alt="문서와 덱과 페이지가 한 화면에 놓인 그림"]')
    .click({ force: true, modifiers: ['Meta'], position: { x: 8, y: 8 } });
  // The picture exposes its image controls; its container owns gradient backgrounds.
  await page.evaluate(async () => {
    const editor = (window as any).editor;
    const parent = editor.dataStore.getNode(editor.selection.nodeIds[0]).parentId;
    await editor.executeCommand('setNode', { nodeIds: [parent] });
  });
  const panel = page.locator('.office-properties');
  await panel.getByRole('tab', { name: '모양', exact: true }).click();
  const id = await page.evaluate(() => (window as any).editor.selection.nodeIds[0]);
  const attrs = () => page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes, id);
  const start = panel.getByRole('button', { name: '그라디언트 시작 색', exact: true });
  const background = panel.getByRole('button', { name: '바탕', exact: true });
  await expect(background).toBeVisible();
  if (await background.getAttribute('aria-expanded') !== 'true') await background.click();
  await start.press('Enter');
  let code = page.locator('[data-color-panel="그라디언트 시작 색"]').getByRole('textbox', { name: '색상 코드' });
  await expect(code).toBeFocused();
  await code.fill('2563eb');
  await expect.poll(async () => (await attrs()).gradientFrom).toBe('#2563eb');
  await code.press('Escape');
  await expect(start).toBeFocused();
  const kind = panel.getByRole('combobox', { name: '그라디언트 모양', exact: true });
  await expect(kind.getByRole('option', { name: '선형', exact: true })).toHaveCount(1);
  await kind.selectOption('radial');
  await expect.poll(async () => (await attrs()).gradientKind).toBe('radial');
  const shadow = panel.getByRole('button', { name: '그림자 색', exact: true });
  const shadowGroup = panel.getByRole('button', { name: '그림자', exact: true });
  await expect(shadowGroup).toBeVisible();
  if (await shadowGroup.getAttribute('aria-expanded') !== 'true') await shadowGroup.click();
  await shadow.press('Enter');
  code = page.locator('[data-color-panel="그림자 색"]').getByRole('textbox', { name: '색상 코드' });
  await expect(code).toBeFocused();
  await code.fill('334155'); await code.press('Escape');
  await expect.poll(async () => (await attrs()).shadowColor).toBe('#334155');
  const blur = panel.getByRole('spinbutton', { name: '그림자 번짐', exact: true });
  const before = (await attrs()).shadowBlur;
  await blur.fill('8'); await blur.press('Shift+ArrowUp');
  await expect(blur).toHaveValue('18');
  expect((await attrs()).shadowBlur).toBe(before);
  await blur.press('Enter');
  await expect(blur).toHaveValue('18');
  await expect.poll(async () => (await attrs()).shadowBlur).toBe(270); // 18px × 15 twips.
});
