import { expect, test, type Page } from '@playwright/test';
import type { Editor } from '@barocss/editor-core';
import { currentSlide, openDeck, openFilmstrip } from './helpers';

type SlidesTestWindow = Window & { editor: Editor; __staleFilmstripAdd: () => void };
const native = (page: Page) => page.evaluate(() => {
  const editor = (window as unknown as SlidesTestWindow).editor;
  return { document: JSON.stringify(editor.exportDocument()), selection: editor.selection, history: editor.getHistoryStats() };
});
const addSlide = (page: Page) => page.locator('[data-filmstrip-panel]').getByRole('button', { name: '새 슬라이드', exact: true });
const geometry = (page: Page) => page.evaluate(() => {
  const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON();
  return {
    main: rect('.sl-main'), viewport: rect('.sl-stage-viewport'), stage: rect('.sl-stage'), slide: rect('.sl-overlay'),
    zoom: (document.querySelector('[aria-label="확대/축소"]') as HTMLInputElement).value
  };
});

for (const [width, height] of [[1440, 900], [1280, 800]]) for (const theme of ['light', 'dark']) {
  test(`wide ${width} ${theme} thumbnail tray preserves canvas bounds, zoom and native history`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await openDeck(page);
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const before = await native(page);
    const sid = await currentSlide(page);
    for (const zoom of ['75%', '100%', '125%']) {
      const field = page.getByRole('textbox', { name: '확대/축소', exact: true });
      await field.fill(zoom); await field.press('Enter');
      await expect(field).toHaveValue(zoom);
      const folded = await geometry(page);
      await openFilmstrip(page);
      expect(await geometry(page)).toEqual(folded);
      expect(await native(page)).toEqual(before);
      expect(await currentSlide(page)).toBe(sid);
      const drawn = await page.locator('[data-filmstrip-panel]').evaluate(panel => {
        const rect = (node: Element) => node.getBoundingClientRect().toJSON();
        const strip = panel.querySelector('.sl-filmstrip')!;
        return { panel: rect(panel), main: rect(document.querySelector('.sl-main')!),
          strip: rect(strip), scrollWidth: strip.scrollWidth, clientWidth: strip.clientWidth,
          controls: Array.from(panel.querySelectorAll('.sl-slide-navigation-heading button')).map(button => {
            const box = rect(button), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
            return { name: button.getAttribute('aria-label'), box, hit: !!hit && button.contains(hit) };
          }),
          slides: Array.from(panel.querySelectorAll('button[data-slide]')).map(button => ({
            button: rect(button), thumb: rect(button.querySelector('.sl-thumb')!), number: rect(button.querySelector('.sl-filmstrip-number')!),
            numberText: button.querySelector('.sl-filmstrip-number')!.textContent,
            realSid: button.querySelector('.sl-thumb [data-bc-sid]')!.getAttribute('data-bc-sid'),
            outline: getComputedStyle(button).boxShadow, current: button.hasAttribute('data-current')
          })) };
      });
      expect(drawn.panel.width).toBeGreaterThan(drawn.main.width * 0.95);
      expect(drawn.panel.x).toBeGreaterThanOrEqual(drawn.main.x);
      expect(drawn.panel.right).toBeLessThanOrEqual(drawn.main.right);
      expect(drawn.panel.bottom).toBeLessThanOrEqual(height);
      expect(drawn.panel.height).toBeLessThanOrEqual(190);
      for (const control of drawn.controls) {
        expect(control.box.width, control.name ?? 'tray control').toBeGreaterThanOrEqual(32);
        expect(control.box.height, control.name ?? 'tray control').toBeGreaterThanOrEqual(32);
        expect(control.hit, control.name ?? 'tray control').toBe(true);
      }
      expect(drawn.slides).toHaveLength(6);
      for (const [index, slide] of drawn.slides.entries()) {
        expect(slide.realSid).toBeTruthy();
        expect(slide.thumb.width).toBeGreaterThanOrEqual(144);
        expect(slide.thumb.width).toBeLessThanOrEqual(176);
        expect(slide.numberText).toBe(String(index + 1));
        expect(slide.number.x).toBeGreaterThan(slide.thumb.x);
        expect(slide.number.bottom).toBeLessThan(slide.thumb.bottom);
        expect(slide.number.y).toBeGreaterThan(slide.thumb.y + slide.thumb.height / 2);
        if (slide.current) expect(slide.outline).toContain('inset');
      }
      await info.attach(`tray-${zoom}.json`, { body: JSON.stringify({ folded, expanded: await geometry(page), drawn }), contentType: 'application/json' });
      if (zoom === '100%') await page.screenshot({ path: info.outputPath('expanded.png'), animations: 'disabled' });
      await page.getByRole('button', { name: '슬라이드 탐색 접기', exact: true }).click();
      await expect(page.locator('[data-filmstrip-panel]')).toBeHidden();
      await expect(page.locator('[data-filmstrip-toggle]')).toBeFocused();
      expect(await geometry(page)).toEqual(folded);
      expect(await native(page)).toEqual(before);
    }
    await page.screenshot({ path: info.outputPath('folded.png'), animations: 'disabled' });
  });
}

test('thumbnail keyboard navigation scrolls horizontally and selects the native slide without a write', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDeck(page); await openFilmstrip(page);
  const add = addSlide(page);
  for (let index = 0; index < 3; index++) {
    await openFilmstrip(page);
    const count = await page.locator('.sl-filmstrip button[data-slide]').count();
    await add.click();
    await expect(page.locator('.sl-filmstrip button[data-slide]')).toHaveCount(count + 1);
  }
  await openFilmstrip(page);
  await expect(page.locator('.sl-filmstrip button[data-current="true"]')).toBeFocused();
  const before = await native(page), first = await currentSlide(page);
  const thumbs = page.locator('.sl-filmstrip button[data-slide]');
  await thumbs.first().focus();
  await page.keyboard.press('End'); await expect(thumbs.last()).toBeFocused();
  expect(await page.locator('.sl-filmstrip').evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  expect(await currentSlide(page)).toBe(first);
  expect(await native(page)).toEqual(before);
  const lastSid = await thumbs.last().getAttribute('data-slide');
  await page.keyboard.press('Enter');
  await expect.poll(() => currentSlide(page)).toBe(lastSid);
  expect((await native(page)).document).toBe(before.document);
  expect((await native(page)).history).toEqual(before.history);
  await page.keyboard.press('Home'); await expect(thumbs.first()).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(thumbs.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowLeft'); await expect(thumbs.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-filmstrip-panel]')).toBeHidden();
  await expect(page.locator('[data-filmstrip-toggle]')).toBeFocused();
});

test('new slide is one native undo step and stale or viewer controls cannot add', async ({ page }, info) => {
  await openDeck(page); await openFilmstrip(page);
  const before = await native(page), sid = await currentSlide(page);
  const original = await page.locator('.sl-filmstrip button[data-slide]').evaluateAll(buttons => buttons.map(button => button.getAttribute('data-slide')));
  await addSlide(page).click();
  await expect(page.locator('.sl-filmstrip button[data-slide]')).toHaveCount(original.length + 1);
  const added = await page.locator('.sl-filmstrip button[data-slide]').evaluateAll(buttons => buttons.map(button => button.getAttribute('data-slide')));
  expect(added.filter(id => original.includes(id))).toEqual(original);
  expect(added.indexOf(sid)).toBe(0);
  expect(original).not.toContain(added[1]);
  await expect.poll(() => currentSlide(page)).toBe(added[1]);
  const changed = (await native(page)).document;
  await info.attach('added-native.json', { body: JSON.stringify(await native(page)), contentType: 'application/json' });
  // The existing top history buttons refuse this freshly inserted selection on
  // the unchanged baseline too. Exercise the real canvas history shortcut.
  await page.locator('.sl-stage-viewport').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Meta+z');
  await info.attach('undo-native.json', { body: JSON.stringify(await native(page)), contentType: 'application/json' });
  await expect.poll(async () => (await native(page)).document).toBe(before.document);
  await page.keyboard.press('Meta+Shift+z');
  await expect.poll(async () => (await native(page)).document).toBe(changed);
  await openFilmstrip(page);
  await addSlide(page).evaluate(button => {
    const props = Object.keys(button).find(key => key.startsWith('__reactProps'))!;
    (window as unknown as SlidesTestWindow).__staleFilmstripAdd = (button as unknown as Record<string, { onClick: () => void }>)[props].onClick;
  });
  await page.evaluate(() => (window as unknown as SlidesTestWindow).editor.setEditable(false));
  await openFilmstrip(page);
  const viewer = await native(page);
  await expect(addSlide(page)).toBeDisabled();
  await page.evaluate(() => (window as unknown as SlidesTestWindow).__staleFilmstripAdd());
  expect(await native(page)).toEqual(viewer);
  await page.locator('.sl-filmstrip button[data-slide]').last().click();
  expect((await native(page)).document).toBe(viewer.document);
  expect((await native(page)).history).toEqual(viewer.history);
});

test('folded rename keeps its draft, Escape cancels it, and root replacement retires a captured add', async ({ page }) => {
  await openDeck(page); await openFilmstrip(page);
  const before = await native(page);
  const thumb = page.locator('.sl-filmstrip button[data-slide]').first();
  await thumb.dblclick();
  const name = page.getByRole('textbox', { name: '슬라이드 1 새 이름', exact: true });
  const originalName = await name.inputValue();
  await name.fill('Uncommitted title');
  await page.getByRole('button', { name: '슬라이드 탐색 접기', exact: true }).click();
  expect(await native(page)).toEqual(before);
  await openFilmstrip(page); await expect(name).toHaveValue('Uncommitted title');
  await name.press('Escape'); await expect(name).toHaveValue(originalName);
  await expect(page.locator('[data-filmstrip-panel]')).toBeVisible();
  expect(await native(page)).toEqual(before);
  await addSlide(page).evaluate(button => {
    const props = Object.keys(button).find(key => key.startsWith('__reactProps'))!;
    (window as unknown as SlidesTestWindow).__staleFilmstripAdd = (button as unknown as Record<string, { onClick: () => void }>)[props].onClick;
  });
  const replacement = await page.evaluate(() => {
    const editor = (window as unknown as SlidesTestWindow).editor;
    editor.setContent(editor.exportDocument());
    const document = JSON.stringify(editor.exportDocument());
    const history = editor.getHistoryStats();
    (window as unknown as SlidesTestWindow).__staleFilmstripAdd();
    return { document, history };
  });
  expect((await native(page)).document).toBe(replacement.document);
  expect((await native(page)).history).toEqual(replacement.history);
  await expect(page.locator('[data-filmstrip-panel]')).toBeHidden();
  await expect(page.locator('.sl-filmstrip-rename input')).toHaveCount(0);
});
