import { test, expect } from '@playwright/test';
import { placeCaret } from './helpers';

test('indexed roots and combined scripts insert, reopen, edit, undo and persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await placeCaret(page, '.w-paragraph');
  await page.getByRole('tab', { name: '삽입', exact: true }).click();
  await page.getByRole('button', { name: '수식 삽입', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'LaTeX 수식', exact: true }).fill(String.raw`\sqrt[3]{x_i^2}+\left\Vert y\right\Vert+\left\langle z\right\rangle+\left\{a\right\}`);
  await dialog.getByRole('tab', { name: '시각 편집', exact: true }).click();
  await expect(dialog.locator('.me-indexedRoot')).toHaveCount(1);
  await expect(dialog.locator('.me-scripts')).toHaveCount(1);
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  const math = page.locator('#editor .w-math');
  await expect(math.locator('.katex')).toBeVisible();
  const source = () => page.evaluate(() => {
    const editor = (window as any).editor;
    const math = document.querySelector('#editor .w-math') as HTMLElement;
    const tree = (id: string): any => {
      const node = editor.dataStore.getNode(id);
      return { stype: node.stype, text: node.text, attributes: node.attributes ?? {}, content: node.content?.map((child: any) => tree(typeof child === 'string' ? child : child.sid)) };
    };
    return JSON.stringify(tree(math.dataset.bcSid!));
  });
  const before = await source();
  expect(before).toContain('"hideDegree":false');
  expect(before).toContain('mathSubSup');
  await math.dblclick();
  const draft = page.locator('.w-math-draft');
  await expect(draft.locator('.me-indexedRoot')).toHaveCount(1);
  await expect(draft.locator('.me-scripts')).toHaveCount(1);
  const indexSlot = draft.locator('.me-indexedRoot > .me-slot').first();
  await indexSlot.click();
  const index = indexSlot.locator('.me-input').first();
  await expect(index).toHaveValue('3');
  await index.fill('4');
  await draft.getByRole('button', { name: '적용', exact: true }).click();
  expect(await source()).not.toBe(before);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect.poll(source).toBe(before);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(math.locator('.katex')).toBeVisible();
  expect(await source()).toBe(before);
  await math.dblclick();
  await indexSlot.click();
  await expect(index).toHaveValue('3');
  await draft.getByRole('button', { name: '취소', exact: true }).click();
  expect(await source()).toBe(before);
});

test('text and font groups retain content through visual editing, undo and reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await placeCaret(page, '.w-paragraph');
  await page.getByRole('tab', { name: '삽입', exact: true }).click();
  await page.getByRole('button', { name: '수식 삽입', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'LaTeX 수식', exact: true }).fill(String.raw`\text{조건: x > 0} + \mathrm{sin} x + \mathbf{AB}`);
  await dialog.getByRole('tab', { name: '시각 편집', exact: true }).click();
  await expect(dialog.locator('.me-textGroup')).toHaveCount(1);
  await expect(dialog.locator('.me-roman')).toHaveCount(1);
  await expect(dialog.locator('.me-bold')).toHaveCount(1);
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  const math = page.locator('#editor .w-math');
  await expect(math.locator('.katex')).toBeVisible();
  const runs = () => page.evaluate(() => {
    const editor = (window as any).editor;
    const math = document.querySelector('#editor .w-math') as HTMLElement;
    const read = (id: string): any[] => {
      const node = editor.dataStore.getNode(id);
      if (node.stype === 'mathRun') return [{ attributes: node.attributes ?? {}, text: node.content.map((child: string) => editor.dataStore.getNode(child).text ?? '').join('') }];
      return (node.content ?? []).flatMap(read);
    };
    return read(math.dataset.bcSid!);
  });
  const before = await runs();
  expect(before).toEqual(expect.arrayContaining([
    { attributes: { literal: true }, text: '조건: x > 0' },
    { attributes: { style: 'p' }, text: 'sin' },
    { attributes: { style: 'b' }, text: 'AB' },
  ]));
  await expect(math.locator('.katex .mathbf')).toHaveText('AB');
  await expect(math.locator('.katex .mathbf')).toHaveCSS('font-weight', '700');
  await expect(math.locator('.katex annotation')).toContainText(String.raw`\text{조건: x > 0}`);
  await math.dblclick();
  const draft = page.locator('.w-math-draft');
  const slot = draft.locator('.me-textGroup > .me-slot').first();
  await slot.click();
  const input = slot.locator('.me-input').first();
  await expect(input).toHaveValue('조건: x > 0');
  await input.fill('조건: x > 10');
  await draft.getByRole('button', { name: '적용', exact: true }).click();
  await expect(math.locator('.katex .mathbf')).toHaveCSS('font-weight', '700');
  expect(await runs()).toEqual(before.map(run => run.attributes.literal === true ? { ...run, text: '조건: x > 10' } : run));
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect.poll(runs).toEqual(before);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(math.locator('.katex')).toBeVisible();
  expect(await runs()).toEqual(before);
  await math.dblclick();
  await slot.click();
  await expect(input).toHaveValue('조건: x > 0');
  await expect(draft.locator('.me-roman')).toHaveCount(1);
  await expect(draft.locator('.me-bold')).toHaveCount(1);
  await draft.getByRole('button', { name: '취소', exact: true }).click();
  expect(await runs()).toEqual(before);
});
