import { test, expect } from '@playwright/test';
import { placeCaret, settled } from './helpers';

for (const kind of ['spacing', 'borders'] as const) {
  const title = kind === 'spacing' ? '문단 간격' : '테두리 및 음영';
  const command = kind === 'spacing' ? 'setParagraphSpacing' : 'setParagraphBorders';
  test(`${title}: 변경 없이 확인하면 명령을 실행하지 않는다`, async ({ page }) => {
    await page.goto('/?sample'); await settled(page); await placeCaret(page, '.w-surface p', 1);
    await page.getByRole('menuitem', { name: '서식', exact: true }).click();
    await page.getByRole('menuitem', { name: `${title}…` }).click();
    await page.evaluate(command => {
      const editor = (window as any).editor, original = editor.executeCommand.bind(editor);
      (window as any).formatInvocations = 0;
      editor.executeCommand = (name: string, payload: unknown) => {
        if (name === command) { (window as any).formatInvocations++; return Promise.resolve(false); }
        return original(name, payload);
      };
    }, command);
    await page.getByRole('dialog', { name: title, exact: true }).getByRole('button', { name: '확인', exact: true }).click();
    await expect(page.getByRole('dialog', { name: title, exact: true })).toBeHidden();
    expect(await page.evaluate(() => (window as any).formatInvocations)).toBe(0);
  });
  test(`${title}: 실패 후 초안·문단 선택 보존, 재시도 및 작은 화면`, async ({ page }) => {
    await page.goto('/?sample'); await settled(page); await placeCaret(page, '.w-surface p', 1);
    const selected = await page.evaluate(() => (window as any).editor.selection.startNodeId);
    await page.getByRole('menuitem', { name: '서식', exact: true }).click();
    await page.getByRole('menuitem', { name: `${title}…` }).click();
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    if (kind === 'spacing') {
      await dialog.getByRole('spinbutton', { name: '문단 뒤 간격' }).fill('18');
      await dialog.getByRole('spinbutton', { name: '문단 뒤 간격' }).press('Enter');
      await dialog.getByRole('checkbox').check();
    } else await dialog.locator('[data-border-preset=box]').click();
    await page.evaluate(({ command }) => {
      const editor = (window as any).editor, original = editor.executeCommand.bind(editor);
      editor.executeCommand = (name: string, payload: any) => {
        if (name !== command) return original(name, payload);
        (window as any).formatTarget = payload.selection.startNodeId;
        return new Promise(resolve => { (window as any).failFormatting = () => { editor.executeCommand = original; resolve(false); }; });
      };
    }, { command });
    await dialog.getByRole('button', { name: '확인', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '적용 중…' })).toBeDisabled();
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => (window as any).formatTarget)).toBe(selected);
    await page.evaluate(() => (window as any).failFormatting());
    await expect(dialog.getByRole('alert')).toContainText('입력한 값은 유지됩니다');
    if (kind === 'spacing') await expect(dialog.getByRole('spinbutton', { name: '문단 뒤 간격' })).toHaveValue('18');
    else await expect(dialog.locator('[data-border-preset=box]')).toHaveAttribute('aria-pressed', 'true');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `../../.dev/artifacts/design-system/word-${kind}-mobile.png`, animations: 'disabled' });
    await dialog.getByRole('button', { name: '확인', exact: true }).click();
    await expect(dialog).toBeHidden();
  });
}
