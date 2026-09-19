import { test, expect } from '@playwright/test';
import { settled } from './helpers';

async function seed(page: import('@playwright/test').Page) {
  await page.goto('/'); await expect(page.locator('#editor')).toBeVisible();
  await page.evaluate(() => {
    const run = (text: string) => ({ stype: 'mathRun', content: [{ stype: 'inline-text', text }] });
    const math = { stype: 'oMath', content: [{ stype: 'mathFraction', content: [
      { stype: 'mathNum', content: [run('x+1')] }, { stype: 'mathDen', content: [run('2')] },
    ] }, run('=3')] };
    (window as any).editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow' }, content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Before ' }, math, { stype: 'inline-text', text: ' after.' }] },
      { stype: 'oMathPara', content: [math] },
      { stype: 'paragraph', content: [{ stype: 'oMath', content: [{ stype: 'mathRun', attributes: { script: 'fraktur', futureFormatting: true }, content: [{ stype: 'inline-text', text: 'F' }] }] }] },
    ] }] });
  });
  await settled(page);
}
const model = (page: import('@playwright/test').Page) => page.evaluate(() => JSON.stringify((window as any).editor.exportDocument(), (key, value) => key === 'metadata' || (key === 'marks' && Array.isArray(value) && value.length === 0) ? undefined : value));

test('KaTeX projects inline/display math without changing OMML and keeps unsupported formatting native', async ({ page }) => {
  await seed(page);
  const maths = page.locator('#editor .w-math');
  await expect(maths.nth(0).locator('.katex')).toBeVisible();
  await expect(maths.nth(0).locator('.katex-display')).toHaveCount(0);
  await expect(maths.nth(1).locator('.katex-display')).toBeVisible();
  const inlineSize = await maths.nth(0).locator('.katex').evaluate(root => {
    const denominator = [...root.querySelectorAll('.katex-html .mfrac .mord')].find(element => element.textContent === '2')!;
    return { base: parseFloat(getComputedStyle(root).fontSize), denominator: parseFloat(getComputedStyle(denominator).fontSize) };
  });
  expect(inlineSize.denominator).toBeCloseTo(inlineSize.base, 1);
  const beforeSelection = await maths.nth(0).boundingBox();
  await maths.nth(0).click();
  await expect(maths.nth(0)).toHaveClass(/w-math-selected/);
  const selectedBox = await maths.nth(0).boundingBox();
  const formulaBox = await maths.nth(0).locator('.w-math-display').boundingBox();
  expect(selectedBox).toEqual(beforeSelection);
  expect(selectedBox!.y).toBeLessThanOrEqual(formulaBox!.y + 1);
  expect(selectedBox!.y + selectedBox!.height).toBeGreaterThanOrEqual(formulaBox!.y + formulaBox!.height - 1);
  expect(selectedBox!.x).toBeLessThanOrEqual(formulaBox!.x + 1);
  expect(selectedBox!.x + selectedBox!.width).toBeGreaterThanOrEqual(formulaBox!.x + formulaBox!.width - 1);
  await expect(maths.nth(2).locator('.katex')).toHaveCount(0);
  await expect(maths.nth(2).locator('.w-math-run')).toBeVisible();
  const before = await model(page);
  await page.evaluate(() => (window as any).editorView.render()); await settled(page);
  expect(await model(page)).toBe(before);
  await expect(maths.nth(0).locator('.w-math-display')).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.w-print-page .katex').first()).toBeVisible();
  await page.screenshot({ path: '/tmp/word-katex-print.png' });
});

test('select, edit, apply, undo and reopen keep the Word source', async ({ page }) => {
  await seed(page);
  const math = page.locator('#editor .w-math').first();
  const before = await model(page);
  await math.click();
  await page.getByRole('button', { name: '수식 바로 편집', exact: true }).click();
  await expect(page.locator('.w-math-draft .me-input').first()).toBeFocused();
  await page.locator('.w-math-draft .me-input').first().fill('y');
  expect(await model(page)).toBe(before);
  await page.locator('.w-math-draft').getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.locator('.w-math-draft')).toHaveCount(0);
  await expect(math.locator('.katex')).toBeVisible();
  expect(await model(page)).not.toBe(before);
  await page.keyboard.insertText('NEXT');
  await expect(page.locator('#editor')).toContainText('NEXT after.');
  await page.evaluate(() => (window as any).editor.run('undo'));
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect.poll(() => model(page)).toBe(before);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload(); await expect(math.locator('.katex')).toBeVisible();
  await math.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.w-math-draft')).toBeVisible();
  await page.locator('.w-math-draft').getByRole('button', { name: '취소', exact: true }).click();
  await expect(math.locator('.katex')).toBeVisible();
});


test('equation keyboard selection exits to either paragraph side and deletes with undo', async ({ page }) => {
  await seed(page);
  const math = page.locator('#editor .w-math').first();
  await math.click(); await page.keyboard.press('ArrowLeft');
  await page.keyboard.insertText('LEFT');
  await expect(page.locator('#editor .w-paragraph').first()).toContainText('Before LEFT');
  await math.click(); await page.keyboard.press('ArrowRight');
  await page.keyboard.insertText('RIGHT');
  await expect(page.locator('#editor .w-paragraph').first()).toContainText('RIGHT after.');
  const before = await model(page);
  await math.click(); await page.keyboard.press('Delete');
  await expect(page.locator('#editor .w-paragraph').first().locator('.w-math')).toHaveCount(0);
  await page.evaluate(() => (window as any).editor.run('undo'));
  await expect.poll(() => model(page)).toBe(before);
  await expect(math.locator('.katex')).toBeVisible();
});


test('formatted source displays with KaTeX and falls back to native editing without losing its style', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const editor = (window as any).editor;
    const doc = editor.exportDocument();
    doc.content[0].content[2].content[0].content[0].attributes = { literal: true, style: 'b' };
    editor.loadDocument(doc);
  });
  const math = page.locator('#editor .w-math').last();
  await expect(math.locator('.katex')).toBeVisible();
  const before = await model(page);
  await math.click();
  await page.getByRole('button', { name: '수식 바로 편집', exact: true }).click();
  await expect(math.locator('.katex')).toHaveCount(0);
  await expect(math.locator('.w-math-run')).toBeVisible();
  await expect(page.locator('.w-math-draft')).toHaveCount(0);
  expect(await model(page)).toBe(before);
  await page.locator('#editor .w-math').first().click();
  await expect(math.locator('.katex')).toBeVisible();
  expect(await model(page)).toBe(before);
});
