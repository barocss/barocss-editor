import { expect, test } from '@playwright/test';
import { openDeck, pickMenu } from './helpers';

for (const kind of ['layout', 'theme'] as const) {
  test(`${kind} preserves a failed draft, retries once and undoes in one step`, async ({ page }) => {
    await openDeck(page);
    const before = await page.evaluate(() => (window as any).editor.exportDocument());
    await pickMenu(page, kind === 'layout' ? 'slide.setup.1' : 'slide.setup.2');
    const dialog = page.getByRole('dialog', { name: kind === 'layout' ? '레이아웃' : '테마 색', exact: true });
    const choice = dialog.locator(kind === 'layout' ? '.sl-dialog-layout' : '.sl-dialog-theme');
    await choice.click();
    await page.locator(`[data-style="${kind === 'layout' ? 'layout-body' : 'Ember'}"]`).click();
    await page.evaluate(kind => {
      const editor = (window as any).editor, original = editor.executeCommand.bind(editor);
      (window as any).settingsCalls = 0;
      editor.executeCommand = async (command: string, payload: unknown) => {
        if (command === (kind === 'layout' ? 'setSlideLayout' : 'setDeckTheme') && ++(window as any).settingsCalls === 1) {
          await new Promise(resolve => { (window as any).releaseSettings = resolve; });
          throw new Error('Test command failure');
        }
        return original(command, payload);
      };
    }, kind);
    await dialog.getByRole('button', { name: '적용', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeDisabled();
    await expect(choice).toBeDisabled();
    await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
    await page.evaluate(() => (window as any).releaseSettings());
    await expect(dialog.getByRole('alert')).toContainText('입력한 값은 유지');
    expect(await page.evaluate(() => (window as any).editor.exportDocument())).toEqual(before);
    await dialog.getByRole('button', { name: '적용', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).settingsCalls)).toBe(2);
    expect(await page.evaluate(() => (window as any).editor.exportDocument())).not.toEqual(before);
    await page.getByRole('button', { name: '실행 취소', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).editor.exportDocument())).toEqual(before);
  });
}

test('unchanged layout binding skips commands but rearranging the same layout still runs', async ({ page }) => {
  await openDeck(page);
  await page.evaluate(() => {
    const editor = (window as any).editor, original = editor.executeCommand.bind(editor);
    (window as any).layoutCommands = [];
    editor.executeCommand = (name: string, payload: unknown) => {
      if (name === 'setSlideLayout' || name === 'applySlideLayout') (window as any).layoutCommands.push(name);
      return original(name, payload);
    };
  });
  await pickMenu(page, 'slide.setup.1'); await page.locator('[data-layout-apply]').click();
  await expect(page.getByRole('dialog', { name: '레이아웃', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).layoutCommands)).toEqual([]);
  await pickMenu(page, 'slide.setup.1'); await page.locator('[data-layout-arrange]').click();
  await expect.poll(() => page.evaluate(() => (window as any).layoutCommands)).toEqual(['applySlideLayout']);
});

test('template load failure keeps choice for retry and closes only after successful replacement', async ({ page }) => {
  await openDeck(page);
  const before = await page.evaluate(() => (window as any).editor.exportDocument());
  await pickMenu(page, 'file.library.1'); await page.locator('[data-template="report"]').click();
  await page.evaluate(() => {
    const editor = (window as any).editor, load = editor.loadDocument.bind(editor);
    (window as any).templateLoads = 0;
    editor.loadDocument = (...args: unknown[]) => {
      if (++(window as any).templateLoads === 1) throw new Error('Test load failure');
      return load(...args);
    };
  });
  await page.locator('[data-template-start]').click();
  const dialog = page.getByRole('dialog', { name: '템플릿', exact: true });
  await expect(dialog.getByRole('alert')).toContainText('새 자료를 열지 못했습니다');
  await expect(page.locator('[data-template="report"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as any).editor.exportDocument())).toEqual(before);
  await page.locator('[data-template-start]').click(); await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).templateLoads)).toBe(2);
  expect(await page.evaluate(() => (window as any).editor.exportDocument())).not.toEqual(before);
});
