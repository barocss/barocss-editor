import { test, expect } from '@playwright/test';
import { openDeck, pickMenu } from './helpers';

test('prints one physical page per visible slide and leaves the model unchanged', async ({ page }, info) => {
  await openDeck(page);
  const before = await page.evaluate(() => JSON.stringify((window as any).editor.getDocumentProxy()));
  const count = await page.locator('.sl-stage .sl-slide:not([data-hidden="true"])').count();
  const pdf = await page.pdf({ path: '/tmp/wonffice-slides-output.pdf', printBackground: true, preferCSSPageSize: true });
  await info.attach('slides.pdf', { body: pdf, contentType: 'application/pdf' });
  expect([...pdf.toString('latin1').matchAll(/\/Count\s+(\d+)/g)].map(m => Number(m[1]))).toContain(count);
  expect(pdf.toString('latin1')).toMatch(/\/MediaBox\s*\[0 0 960 540\]/);
  expect(await page.locator('.sl-print-pages').count()).toBe(0);
  expect(await page.evaluate(() => JSON.stringify((window as any).editor.getDocumentProxy()))).toBe(before);
});

test('ignores canvas coordinates, camera and playback styles, and excludes hidden slides', async ({ page }) => {
  await openDeck(page);
  const expected = await page.evaluate(() => {
    const editor = (window as any).editor;
    const slides = [...document.querySelectorAll<HTMLElement>('.sl-stage .sl-slide')];
    const visible = slides.filter(slide => slide.dataset.hidden !== 'true');
    const hidden = visible.at(-1)!.dataset.bcSid!;
    editor.executeCommand('toggleSlideHidden', { slideId: hidden });
    // View-only state must not leak into the print renderer.
    slides[0].style.transform = 'scale(0.15) translate(900px, 200px)';
    const shape = slides[0].querySelector<HTMLElement>('.sl-text-frame')!;
    shape.style.visibility = 'hidden';
    return { hidden, sid: shape.dataset.bcSid, count: visible.length - 1 };
  });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  expect(await page.locator('.sl-print-page').count()).toBe(expected.count);
  expect(await page.locator(`.sl-print-page[data-print-slide="${expected.hidden}"]`).count()).toBe(0);
  const metrics = await page.locator('.sl-print-page').first().evaluate(page => {
    const slide = page.querySelector('.sl-slide')!;
    const box = slide.getBoundingClientRect();
    const frame = page.querySelector('.sl-text-frame')!;
    return { width: box.width, height: box.height, transform: getComputedStyle(slide).transform,
      visibility: getComputedStyle(frame).visibility, tools: page.querySelectorAll('.sl-overlay, [contenteditable]').length };
  });
  expect(metrics).toEqual({ width: 1280, height: 720, transform: 'none', visibility: 'visible', tools: 0 });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  expect(await page.locator('.sl-print-page').count()).toBe(0);
});

test('opens the output preview from File and preserves the editing selection on close', async ({ page }) => {
  await openDeck(page);
  await pickMenu(page, 'file.document.3');
  const dialog = page.getByRole('dialog', { name: '인쇄 / PDF 저장' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('PDF 파일은 인쇄 창의 저장 대상으로 선택하세요.', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '인쇄 / PDF 저장…' })).toBeEnabled();
  expect(await dialog.locator('.sl-slide').count()).toBeGreaterThan(1);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.sl-overlay')).toBeVisible();
});
