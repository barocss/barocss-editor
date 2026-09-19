import { test, expect } from '@playwright/test';
import { settled } from './helpers';

const snapshot = (page: import('@playwright/test').Page) => page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
async function seed(page: import('@playwright/test').Page, long: boolean) {
  await page.goto('/');
  await page.evaluate(long => {
    const run = (text: string) => ({ stype: 'mathRun', content: [{ stype: 'inline-text', text }] });
    const equation = { stype: 'oMath', content: long ? [{ stype: 'mathFraction', content: [
      { stype: 'mathNum', content: [run('a+b+c+d+e+f+g+h+i+j+k+l+m+n+o+p+q+r+s+t+u+v+w+x+y+z=100'.repeat(2))] },
      { stype: 'mathDen', content: [run('2')] },
    ] }] : [run('x+y=30')] };
    (window as any).editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow', pageWidth: 12240, pageHeight: 15840, marginTop: 1440, marginBottom: 1440, marginLeft: 1440, marginRight: 1440 }, content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Equation' }] },
      { stype: 'paragraph', content: [equation] },
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'After the equation.' }] },
    ] }] });
  }, long);
  await settled(page);
}

test('inline editing uses the displayed math font size and cancel leaves source and geometry intact', async ({ page }) => {
  await seed(page, false);
  const math = page.locator('#editor .w-math');
  const before = await snapshot(page);
  const box = await math.boundingBox();
  const fontSize = await math.locator('.katex').evaluate(el => getComputedStyle(el).fontSize);
  await math.dblclick();
  const draft = page.locator('.w-math-draft');
  await expect(draft.locator('.me-input').first()).toHaveCSS('font-size', fontSize);
  await draft.getByRole('button', { name: '취소', exact: true }).click();
  await expect(math.locator('.katex')).toBeVisible();
  expect(await snapshot(page)).toBe(before);
  expect(await math.boundingBox()).toEqual(box);
});

test('long math scrolls inside the paragraph and fits the print page without changing the source', async ({ page }) => {
  await seed(page, true);
  const math = page.locator('#editor .w-math');
  const before = await snapshot(page);
  await expect(math).toHaveAttribute('data-word-math-overflow', 'true');
  const dims = () => math.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, parent: el.parentElement!.clientWidth }));
  const vertical = await math.evaluate(el => ({ height: el.clientHeight, scroll: el.scrollHeight }));
  expect(vertical.scroll).toBeLessThanOrEqual(vertical.height + 1);
  const initial = await dims();
  expect(initial.scroll).toBeGreaterThan(initial.width);
  expect(initial.width).toBeLessThanOrEqual(initial.parent);
  await math.hover();
  await page.mouse.wheel(400, 0);
  await expect.poll(() => math.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  // A narrower container must refit without a model mutation or another edit.
  await math.evaluate(el => { el.parentElement!.style.width = '300px'; });
  await expect.poll(async () => (await dims()).width).toBeLessThanOrEqual(300);
  await math.dblclick();
  const draft = page.locator('.w-math-draft');
  const surface = draft.locator('.me-surface');
  await expect(surface).toBeVisible();
  const editing = await surface.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, right: el.getBoundingClientRect().right, parentRight: el.closest('.w-paragraph')!.getBoundingClientRect().right }));
  expect(editing.scroll).toBeGreaterThan(editing.width);
  expect(editing.right).toBeLessThanOrEqual(editing.parentRight + 1);
  await draft.getByRole('button', { name: '취소', exact: true }).click();
  expect(await snapshot(page)).toBe(before);
  await math.evaluate(el => { el.parentElement!.style.width = '2000px'; });
  await expect(math).not.toHaveAttribute('data-word-math-overflow');
  await math.evaluate(el => { el.parentElement!.style.width = '300px'; });
  await expect(math).toHaveAttribute('data-word-math-overflow', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const printed = page.locator('.w-print-page .w-math').first();
  await expect(printed.locator('.katex')).toBeVisible();
  const printBox = await printed.evaluate(el => {
    const rect = el.querySelector('.w-math-display')!.getBoundingClientRect();
    const parent = el.parentElement!.getBoundingClientRect();
    return { right: rect.right, parentRight: parent.right, width: rect.width, parentWidth: parent.width };
  });
  expect(printBox.right).toBeLessThanOrEqual(printBox.parentRight + 2);
  expect(printBox.width).toBeLessThanOrEqual(printBox.parentWidth + 2);
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(math).toHaveAttribute('data-word-math-overflow', 'true');
  expect(await snapshot(page)).toBe(before);
});
