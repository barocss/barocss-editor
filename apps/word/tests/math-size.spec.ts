import { test, expect, type Page } from '@playwright/test';
import { placeCaret, settled } from './helpers';

const math = (page: Page) => page.locator('#editor .w-math').first();
const scale = (page: Page) => math(page).evaluate(el => (window as any).editor.dataStore.getNode(el.getAttribute('data-bc-sid')).attributes?.fontScale ?? 1);
const size = (page: Page) => math(page).locator('.katex').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
const source = (page: Page) => page.evaluate(() => JSON.stringify((window as any).editor.exportDocument(), (key, value) =>
  key === 'attributes' && value && !Object.keys(value).length ? undefined : value));

async function open(page: Page) {
  await page.goto('/');
  await placeCaret(page, '.w-paragraph');
  await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await page.getByRole('tab', { name: '삽입', exact: true }).click();
  await page.getByRole('button', { name: '본문 수식', exact: true }).click();
  await page.locator('.w-math-draft .me-input').fill('12345');
  await page.locator('.w-math-draft .me-input').press('Enter');
  await expect(math(page).locator('.katex')).toBeVisible();
}
async function setSize(page: Page, percent: number) {
  await math(page).click();
  const field = page.getByRole('spinbutton', { name: '수식 크기', exact: true });
  await field.fill(String(percent));
  await field.press('Enter');
  await expect.poll(() => scale(page)).toBe(percent / 100);
}

test('size changes layout, survives inline editing and reload, and resets independently', async ({ page }) => {
  await open(page);
  const initialSize = await size(page), initialBox = (await math(page).boundingBox())!;
  await setSize(page, 200);
  expect(await size(page)).toBeCloseTo(initialSize * 2);
  const box = (await math(page).boundingBox())!;
  expect(box.height).toBeGreaterThan(initialBox.height * 1.8);
  expect(box.width).toBeGreaterThan(initialBox.width * 1.8);
  const before = await source(page);
  await math(page).dblclick();
  const draft = page.locator('.w-math-draft');
  await expect(page.locator('[data-word-math-toolbar]')).toHaveCount(0);
  expect(await draft.locator('.me-input').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(initialSize * 2);
  const actionFont = await draft.getByRole('button', { name: '취소', exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(actionFont).toBeLessThan(initialSize);
  await draft.locator('.me-input').fill('frac');
  await expect(page.locator('.me-suggestion-panel')).toBeVisible();
  await expect(page.locator('.me-suggestion-panel')).toHaveCSS('font-size', '13px');
  await draft.getByRole('button', { name: '취소', exact: true }).click();
  expect(await source(page)).toBe(before);
  await math(page).dblclick();
  await draft.locator('.me-input').fill('67890');
  await draft.getByRole('button', { name: '적용', exact: true }).click();
  await expect.poll(() => scale(page)).toBe(2);
  expect(await size(page)).toBeCloseTo(initialSize * 2);
  await settled(page);
  await page.reload();
  await expect(math(page).locator('.katex')).toBeVisible();
  expect(await scale(page)).toBe(2);
  await math(page).click();
  await page.getByRole('button', { name: '기본 크기', exact: true }).click();
  await expect.poll(() => scale(page)).toBe(1);
  expect(await size(page)).toBeCloseTo(initialSize);
});

test('document zoom does not multiply stored size or inline editor font size', async ({ page }) => {
  await open(page);
  await setSize(page, 150);
  const font = await size(page), before = await source(page);
  await math(page).dblclick();
  await page.getByRole('tab', { name: '보기', exact: true }).click();
  await page.locator('[data-zoom-in]').click();
  await expect(page.locator('.w-zoom-frame')).toHaveAttribute('data-zoom', '1.25');
  await expect(page.locator('.w-math-draft .me-input')).toHaveCSS('font-size', `${font}px`);
  expect(await source(page)).toBe(before);
  await page.locator('.w-math-draft').getByRole('button', { name: '취소', exact: true }).click();
  expect(await scale(page)).toBe(1.5);
});

test('size change undoes as a single action', async ({ page }) => {
  await open(page);
  const before = await source(page);
  await setSize(page, 175);
  await page.evaluate(() => (window as any).editor.executeCommand('undo'));
  await expect.poll(() => source(page)).toBe(before);
  await page.evaluate(() => (window as any).editor.executeCommand('redo'));
  await expect.poll(() => scale(page)).toBe(1.75);
});

test('display equations keep size in print and native fallback rendering', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    (window as any).editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow' }, content: [
      { stype: 'oMathPara', content: [{ stype: 'oMath', content: [{ stype: 'mathRun', content: [{ stype: 'inline-text', text: '12345' }] }] }] },
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'After' }] }
    ] }] });
  });
  await settled(page);
  const original = await size(page);
  await setSize(page, 200);
  const before = await source(page);
  await page.emulateMedia({ media: 'print' });
  expect(await size(page)).toBeCloseTo(original * 2);
  expect(await source(page)).toBe(before);
  await page.emulateMedia({ media: 'screen' });
  // A construct unsupported by KaTeX still inherits the equation size in the
  // native Word renderer. Size does not depend on which renderer is active.
  await math(page).evaluate(el => {
    const editor = (window as any).editor, node = editor.dataStore.getNode(el.getAttribute('data-bc-sid'));
    editor.dataStore.updateNode(node.content[0], { attributes: { script: 'unsupported-font' } });
    editor.emit('editor:content.change');
  });
  await expect(math(page)).not.toHaveAttribute('data-word-math-rendered');
  await expect(math(page)).toHaveCSS('font-size', `${original * 2 / 1.25}px`);
});
