import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, visibleBoxes } from './helpers';

/**
 * A right-click on a slide.
 *
 * It did nothing — measured before this existed: zero menus in the document, so
 * the browser's own appeared instead, offering "이미지를 다른 이름으로 저장" over a
 * shape. Every tool this product is measured against has this menu, and it is
 * where the reader who does not know the chords finds 맨 앞으로, 복제 and 삭제.
 *
 * The list itself is a model (`office-slides/test/context-menu.test.ts` — which
 * items for which selection, in milliseconds). What only a browser shows is the
 * three things around it: that the click *selects* what it found, that picking an
 * item runs the command, and that the menu stays inside the window.
 */
const menu = (page: Page) => page.locator('[data-context-menu]');

const rightClick = async (page: Page, at: { x: number; y: number }) => {
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(menu(page)).toHaveCount(1);
};

test.describe('the menu a right-click opens', () => {
  test('selects what it found, and acts on it', async ({ page }) => {
    await openDeck(page);
    const boxes = await visibleBoxes(page);
    const box = boxes[0];

    // Nothing selected yet: the right-click has to do the selecting, or a menu
    // cannot finish the sentence "delete *what*".
    expect(await page.evaluate(() => (window as any).editor.selection?.nodeIds?.length ?? 0)).toBe(
      0
    );

    await rightClick(page, { x: box.x, y: box.y });
    expect(await page.evaluate(() => (window as any).editor.selection?.nodeIds?.[0])).toBe(box.sid);

    // The chords are drawn from the keymap, which is what makes the menu teach.
    await expect(menu(page).locator('[data-menu-item="duplicate"]')).toContainText('복제');
    await expect(menu(page).locator('[data-menu-item="delete"]')).toContainText('삭제');
    // Nothing has been copied, so 붙여넣기 is offered and disabled rather than
    // missing: an item that is absent teaches a reader it does not exist.
    await expect(menu(page).locator('[data-menu-item="paste"]')).toBeDisabled();

    const count = () =>
      page.evaluate((sid) => {
        const store = (window as any).editor.dataStore;
        const node = store.getNode(sid);
        return ((store.getNode(node.parentId)?.content ?? []) as string[]).length;
      }, box.sid);
    const before = await count();

    await menu(page).locator('[data-menu-item="duplicate"]').click();
    await expect(menu(page)).toHaveCount(0);
    await expect.poll(count).toBe(before + 1);
  });

  test('offers the slide’s own things where there is no shape', async ({ page }) => {
    await openDeck(page);
    const empty = await page.evaluate(() => {
      const slide = document.querySelector('.sl-stage .sl-slide:not([style*="display: none"])')!;
      const rect = slide.getBoundingClientRect();
      // A corner of the slide, which the sample deck leaves bare.
      return { x: Math.round(rect.right - 20), y: Math.round(rect.bottom - 20) };
    });

    await rightClick(page, empty);
    await expect(menu(page).locator('[data-menu-item="slide-new"]')).toHaveCount(1);
    // Not a shape's menu: there is no shape.
    await expect(menu(page).locator('[data-menu-item="delete"]')).toHaveCount(0);

    const slides = () =>
      page.evaluate(() => document.querySelectorAll('.sl-filmstrip button[data-slide]').length);
    const before = await slides();
    await menu(page).locator('[data-menu-item="slide-new"]').click();
    await expect.poll(slides).toBe(before + 1);
  });

  /**
   * Kept inside the window, which is the one thing about a menu that is only ever
   * wrong near an edge — and the reader who right-clicks the last shape on a
   * slide is exactly the reader who wants 삭제.
   */
  test('stays inside the window near an edge', async ({ page }) => {
    await openDeck(page);
    const low = await page.evaluate(() => {
      const slide = document.querySelector('.sl-stage .sl-slide:not([style*="display: none"])')!;
      const rect = slide.getBoundingClientRect();
      return { x: Math.round(rect.right - 6), y: Math.round(rect.bottom - 6) };
    });

    await rightClick(page, low);
    expect(
      await page.evaluate(() => {
        const box = document.querySelector('[data-context-menu]')!.getBoundingClientRect();
        return {
          insideX: box.right <= window.innerWidth,
          insideY: box.bottom <= window.innerHeight
        };
      })
    ).toEqual({ insideX: true, insideY: true });

    // Escape closes it, like every other popover in this app.
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
  });

  /** A right-click inside a selection leaves it alone, so a menu can act on six. */
  test('keeps a selection of several', async ({ page }) => {
    await openDeck(page);
    const boxes = await visibleBoxes(page);
    await page.evaluate(
      (sids) => (window as any).editor.executeCommand('setNode', { nodeIds: sids }),
      boxes.slice(0, 2).map((box) => box.sid)
    );
    await page.waitForTimeout(300);

    await rightClick(page, { x: boxes[0].x, y: boxes[0].y });
    expect(await page.evaluate(() => (window as any).editor.selection?.nodeIds?.length)).toBe(2);
    // Which is what makes grouping mean something.
    await expect(menu(page).locator('[data-menu-item="group"]')).toHaveCount(1);
  });
});

/**
 * The grey around the slide.
 *
 * This overlay is the *slide's* box — every coordinate in it is the slide's — so a
 * right-click on the scratch space either side reached nothing and the **browser's** menu
 * answered, over the app. Measured before this: 48px of grey either side at the default
 * zoom and a menu count of zero there.
 *
 * It stayed that way for an honest reason: suppressing the browser's menu needs something
 * to offer instead, and until the slide's own menu had items that are not about a shape
 * (the guides) there was nothing.
 */
test('offers the slide’s menu on the grey around it, instead of the browser’s', async ({
  page
}) => {
  await openDeck(page);

  const grey = await page.evaluate(() => {
    const stage = document.querySelector('.sl-stage')!.getBoundingClientRect();
    const slide = document
      .querySelector('.sl-stage .sl-slide:not([style*="display: none"])')!
      .getBoundingClientRect();
    return {
      x: Math.round((stage.left + slide.left) / 2),
      y: Math.round(slide.top + slide.height / 2),
      room: Math.round(slide.left - stage.left)
    };
  });
  test.skip(grey.room < 20, '이 창 크기에서는 슬라이드 옆에 여백이 없습니다');

  await page.mouse.click(grey.x, grey.y, { button: 'right' });
  await expect(menu(page)).toHaveCount(1);

  // The slide's own menu: the guides and 새 슬라이드, and no shape items — nothing is
  // under the pointer out there.
  await expect(menu(page).locator('[data-menu-item="guide-x"]')).toHaveCount(1);
  await expect(menu(page).locator('[data-menu-item="slide-new"]')).toHaveCount(1);
  await expect(menu(page).locator('[data-menu-item="delete"]')).toHaveCount(0);

  // And it drops the selection, because a click out there is a click on nothing.
  expect(await page.evaluate(() => (window as any).editor.selection?.nodeIds?.length ?? 0)).toBe(0);
});
