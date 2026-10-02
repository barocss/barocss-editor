import { expect, test, type Page } from '@playwright/test';
import { boxCounts, currentSlide, openDeck } from './helpers';

const trigger = (page: Page) => page.getByRole('toolbar', { name: 'Slides 삽입 도구', exact: true })
  .getByRole('button', { name: '추가 Slides 도구', exact: true });
const menu = (page: Page) => page.getByRole('menu', { name: 'Slides 삽입 및 슬라이드 메뉴', exact: true });
const native = (page: Page) => page.evaluate(() => {
  const editor = (window as any).editor;
  return { document: editor.exportDocument(), selection: editor.selection, history: editor.getHistoryStats() };
});

for (const [width, height] of [[1440, 900], [1280, 800]]) for (const theme of ['light', 'dark']) {
  test(`named insertion dropdown is compact, keyboard owned and native neutral ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height }); await openDeck(page);
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const before = await native(page), stage = await page.locator('.sl-stage').boundingBox();
    await trigger(page).click(); await expect(menu(page)).toBeVisible();
    await expect(menu(page)).toHaveAttribute('data-floating-ready', 'true');
    await menu(page).evaluate(async node => { await Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))); });
    const items = menu(page).locator('[role^="menuitem"]');
    await expect(items).toHaveCount(16);
    for (const name of ['텍스트 상자', '사각형', '타원', '선', '표 삽입', '프레임', '연결선', '그림 삽입', '동영상 삽입', '오디오 삽입', '새 슬라이드', '슬라이드 복제', '앞으로 이동', '뒤로 이동', '발표에서 숨기기', '슬라이드 삭제']) {
      await expect(menu(page).getByText(name, { exact: true })).toBeVisible();
    }
    const geometry = await menu(page).evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { rect: rect.toJSON(), scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
        items: [...node.querySelectorAll<HTMLElement>('[role^="menuitem"]')].map(item => {
          const box = item.getBoundingClientRect();
          return { label: item.textContent, disabled: item.matches(':disabled'), rect: box.toJSON(), icon: !!item.querySelector('svg'),
            hit: item.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
        }) };
    });
    expect(geometry.rect.width).toBe(224);
    expect(geometry.rect.height).toBeLessThanOrEqual(550);
    expect(geometry.rect.bottom).toBeLessThanOrEqual(height);
    expect(geometry.rect.x).toBeGreaterThanOrEqual(0);
    expect(geometry.scrollWidth).toBe(geometry.clientWidth);
    for (const item of geometry.items) {
      expect(item.rect.height, item.label ?? '').toBeGreaterThanOrEqual(32);
      expect(item.rect.width, item.label ?? '').toBeGreaterThanOrEqual(32);
      expect(item.icon, item.label ?? '').toBe(true);
      if (!item.disabled) expect(item.hit, item.label ?? '').toBe(true);
      // Disabled commands cannot receive pointer events; their readable label still stays in bounds.
      expect(item.rect.left).toBeGreaterThanOrEqual(geometry.rect.left + 4);
      expect(item.rect.right).toBeLessThanOrEqual(geometry.rect.right - 4);
    }
    await info.attach('dropdown-geometry.json', { body: JSON.stringify(geometry), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath('insertion-dropdown.png'), animations: 'disabled' });
    await expect(menu(page).getByRole('menuitem', { name: '텍스트 상자', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu(page).getByRole('menuitem', { name: '사각형', exact: true })).toBeFocused();
    await page.keyboard.press('End');
    await expect(menu(page).getByRole('menuitem', { name: '슬라이드 삭제', exact: true })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(menu(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    expect(await native(page)).toEqual(before);
    expect(await page.locator('.sl-stage').boundingBox()).toEqual(stage);
  });
}

test('dropdown inserts a native shape and real keyboard undo/redo preserves the full document', async ({ page }) => {
  await openDeck(page); const before = await native(page), counts = await boxCounts(page);
  await trigger(page).click();
  const ellipse = menu(page).getByRole('menuitem', { name: '타원', exact: true });
  await ellipse.focus(); await ellipse.press('Enter');
  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => boxCounts(page)).toEqual([counts[0] + 1, ...counts.slice(1)]);
  const inserted = (await native(page)).document;
  expect(inserted).not.toEqual(before.document);
  await page.locator('.sl-stage-viewport').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await native(page)).document).toEqual(before.document);
  await page.keyboard.press('Meta+Shift+z');
  await expect.poll(async () => (await native(page)).document).toEqual(inserted);
});

for (const change of ['none', 'slide', 'authority'] as const) {
  test(`asynchronous image insertion keeps its captured owner after ${change}`, async ({ page }) => {
    await openDeck(page); const initial = await native(page), counts = await boxCounts(page), slide = await currentSlide(page);
    // Pause only file I/O. The actual menu, native chooser and image placement still run.
    await page.evaluate(() => {
      const read = FileReader.prototype.readAsDataURL;
      FileReader.prototype.readAsDataURL = function (file) {
        (window as any).resumeInsertRead = () => { read.call(this, file); };
        this.addEventListener('loadend', () => { (window as any).insertReadComplete = true; }, { once: true });
      };
    });
    await trigger(page).click();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), menu(page).getByRole('menuitem', { name: '그림 삽입', exact: true }).click()]);
    await chooser.setFiles({ name: 'pixel.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4"><rect width="8" height="4" fill="red"/></svg>') });
    await expect.poll(() => page.evaluate(() => typeof (window as any).resumeInsertRead)).toBe('function');
    if (change === 'slide') {
      await page.locator('.sl-stage-viewport').click({ position: { x: 5, y: 5 } });
      await page.keyboard.press('PageDown'); await expect.poll(() => currentSlide(page)).not.toBe(slide);
    } else if (change === 'authority') await page.evaluate(() => (window as any).editor.setEditable(false));
    const beforeRead = await native(page);
    await page.evaluate(() => (window as any).resumeInsertRead());
    await expect.poll(() => page.evaluate(() => !!(window as any).insertReadComplete)).toBe(true);
    // Drain real image decoding, not just FileReader's completion event.
    await page.evaluate(async () => {
      const image = new Image(); image.src = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4"><rect width="8" height="4" fill="red"/></svg>');
      await image.decode(); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    if (change === 'none') {
      await expect.poll(() => boxCounts(page)).toEqual([counts[0] + 1, ...counts.slice(1)]);
      expect((await native(page)).document).not.toEqual(initial.document);
    } else {
      expect(await native(page)).toEqual(beforeRead);
      expect((await native(page)).document).toEqual(initial.document);
    }
  });
}
