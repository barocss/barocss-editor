import { test, expect, type Page } from '@playwright/test';
import { settled } from './helpers';

async function geometry(page: Page) {
  return page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('#editor .w-surface')!;
    const sheet = surface.querySelector<HTMLElement>('.w-sheet')!;
    const paragraph = surface.querySelector<HTMLElement>('.w-paragraph')!;
    const box = surface.getBoundingClientRect();
    const paper = sheet.getBoundingClientRect();
    const text = paragraph.getBoundingClientRect();
    const css = getComputedStyle(surface);
    const scale = box.width / surface.offsetWidth;
    const ruler = document.querySelector('.w-ruler-text')?.getBoundingClientRect();
    return { width: box.width / scale, paperWidth: paper.width / scale,
      left: (text.left - paper.left) / scale, right: (paper.right - text.right) / scale,
      paddingLeft: parseFloat(css.paddingLeft), paddingRight: parseFloat(css.paddingRight),
      rulerLeft: ruler ? (ruler.left - text.left) / scale : null,
      rulerWidth: ruler ? (ruler.width - text.width) / scale : null };
  });
}

async function load(page: Page, attributes: Record<string, unknown>) {
  await page.goto('/'); await settled(page);
  await page.evaluate(attributes => (window as any).editor.loadDocument({ stype: 'document', content: [
    { stype: 'surface', attributes: { kind: 'flow', ...attributes }, content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Page margins must match the ruler and printed page.' }] }
    ] }
  ] }), attributes);
  await settled(page);
}

for (const entry of [
  { name: 'omitted page settings', attrs: {}, width: 816, left: 96, right: 96 },
  { name: 'partial landscape settings and binding', attrs: { orientation: 'landscape', pageWidth: 9000, marginLeft: 0, marginGutter: 360 }, width: 1056, left: 24, right: 96 },
  { name: 'explicit zero margins and top binding', attrs: { pageWidth: 9000, pageHeight: 12000, marginLeft: 0, marginRight: 0, marginGutter: 360, gutterAtTop: true }, width: 600, left: 0, right: 0 },
]) {
  test(`page geometry uses the same defaults as pagination: ${entry.name}`, async ({ page }) => {
    await load(page, entry.attrs);
    await expect.poll(async () => (await geometry(page)).width).toBeCloseTo(entry.width, 0);
    const result = await geometry(page);
    expect(result.paperWidth).toBeCloseTo(entry.width, 0);
    expect(result.left).toBeCloseTo(entry.left, 0);
    expect(result.right).toBeCloseTo(entry.right, 0);
    expect(result.paddingLeft).toBeCloseTo(entry.left, 0);
    expect(result.paddingRight).toBeCloseTo(entry.right, 0);
    await expect.poll(async () => (await geometry(page)).rulerLeft).toBeCloseTo(0, 0);
    await expect.poll(async () => (await geometry(page)).rulerWidth).toBeCloseTo(0, 0);
  });
}

test('the format painter document keeps its margins after zoom and reopening', async ({ page }) => {
  await page.goto('/?sample=format-painter'); await settled(page);
  const check = async () => {
    const result = await geometry(page);
    expect(result.width).toBeCloseTo(816, 0);
    expect(result.left).toBeCloseTo(96, 0);
    expect(result.right).toBeCloseTo(96, 0);
    await expect.poll(async () => (await geometry(page)).rulerLeft).toBeCloseTo(0, 0);
    await expect.poll(async () => (await geometry(page)).rulerWidth).toBeCloseTo(0, 0);
  };
  await check();
  await page.getByRole('tab', { name: '보기', exact: true }).click();
  await page.locator('[data-zoom-out]').click(); await settled(page); await check();
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await page.reload(); await settled(page); await check();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const print = page.locator('.w-print-copy .w-surface').first();
  await expect(print).toHaveCSS('padding-left', '96px');
  await expect(print).toHaveCSS('padding-right', '96px');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
});
