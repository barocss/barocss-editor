import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, currentSlide, pickMenu } from './helpers';

/**
 * The definitions a deck **inherits from**, opened and changed.
 *
 * `applySlideLayout` and `setSlideLayout` have always said which layout a slide *follows*, and
 * nothing has ever said what a layout **is**: readable by everything, changeable by nobody. The
 * mechanism it needed was built for a component's definition — an editing surface, a focus rule,
 * a fit and a way back — and `canvas-model.md` §10c wrote down at the time that the same
 * mechanism is what a master and a layout need, and that building it for components alone would
 * be building it twice. This is the other two.
 *
 * Two things had to be measured before it could work at all: a **master had no renderer**, so
 * there was nothing on the page to point at (a node with no element has no place in the sid map),
 * and a layout has **no size of its own** — it is the shape of the slides that follow it.
 */
const openLayoutDialog = async (page: Page) => {
  await pickMenu(page, 'slide.setup.1');
  await expect(page.locator('[data-design-edit]').first()).toBeVisible();
};

test.describe('a layout a reader can change', () => {
  test('is listed in the dialog that applies it, and opens from there', async ({ page }) => {
    await openDeck(page);
    const was = await currentSlide(page);
    await openLayoutDialog(page);

    // The deck's designs: its master and its layouts, each somewhere to go.
    const rows = page.locator('[data-design-edit]');
    expect(await rows.count()).toBeGreaterThanOrEqual(2);

    await page.locator('[data-design-edit="layout-body"]').click();
    await page.waitForTimeout(600);

    // A layout is not a slide: the reader is standing in it, the banner says which and how many
    // slides a change reaches, and the deck's own count no longer claims a page.
    await expect(page.locator('[data-editing="layout"]')).toHaveCount(1);
    await expect(page.locator('[data-editing-reach]')).not.toHaveText('0장에 적용됩니다');
    await expect(page.locator('.sl-def-layout[data-bc-sid]:visible')).toHaveCount(1);

    // And the way back is the same one every definition has.
    await page.locator('[data-editing-close]').click();
    await page.waitForTimeout(400);
    expect(await currentSlide(page)).toBe(was);
  });

  test('is drawn at the shape of the slides that follow it', async ({ page }) => {
    await openDeck(page);
    await openLayoutDialog(page);
    await page.locator('[data-design-edit="layout-body"]').click();
    await page.waitForTimeout(600);

    const drawn = await page.evaluate(() => {
      // The one that is *shown*: the deck defines two layouts and both are drawn, hidden, which
      // is the whole reason a definition is drawn at all (the sid map).
      const layout = [...document.querySelectorAll<HTMLElement>('.sl-stage .sl-def-layout')].find(
        (one) => one.getBoundingClientRect().width > 20
      );
      const ruler = document.querySelector('[data-ruler="x"]') as HTMLElement | null;
      if (!layout || !ruler) return null;
      const box = layout.getBoundingClientRect();
      return {
        ratio: Math.round((box.width / box.height) * 100),
        ruler: Math.round(ruler.getBoundingClientRect().width),
        width: Math.round(box.width)
      };
    });

    /*
     * A layout carries no width and no height — it is the shape of the slides that follow it —
     * so the size arrives from the same `stageFit` a slide's does. Without that it drew as an
     * auto-sized div with absolutely positioned children in it: nothing, zero pixels high.
     */
    expect(drawn?.ratio).toBe(178);
    expect(drawn?.ruler).toBe(drawn?.width);
  });

  test('takes a new shape while it is open, and every slide that follows it changes', async ({
    page
  }) => {
    await openDeck(page);

    // What the slides that follow this layout resolve *before* the change.
    const before = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const following = ((root.content ?? []) as string[]).filter(
        (sid: string) => store.getNode(sid)?.attributes?.layoutId === 'layout-body'
      );
      return following.length;
    });
    expect(before).toBeGreaterThan(0);

    await openLayoutDialog(page);
    await page.locator('[data-design-edit="layout-body"]').click();
    await page.waitForTimeout(600);

    /*
     * Through the **ribbon**, which is the whole point of one editable-surface notion: a command
     * with no `slideId` means "put it on the deck", and the app is the only thing that knows the
     * reader is inside a layout. The same test the component's definition needed.
     */
    await page.locator('[data-control="insert-rectangle"]').click();
    await page.waitForTimeout(600);

    const where = await page.evaluate(() => {
      const editor = (window as any).editor;
      const sid = editor.selection?.nodeIds?.[0];
      const store = editor.dataStore;
      const parent = sid ? store.getNode(sid)?.parentId : undefined;
      return {
        parentType: parent ? store.getNode(parent)?.stype : null,
        parentId: parent ? store.getNode(parent)?.attributes?.id : null
      };
    });
    // In the layout, not on slide 1 — the fault the insert commands had before `editableSurface`.
    expect(where.parentType).toBe('slideLayout');
    expect(where.parentId).toBe('layout-body');
  });

  test('opens the master, which nothing could draw before', async ({ page }) => {
    await openDeck(page);
    await openLayoutDialog(page);

    const master = page.locator('[data-design-edit="master-1"]');
    await expect(master).toHaveCount(1);
    await master.click();
    await page.waitForTimeout(600);

    // Drawn at all, which is the measurement this closed: `slideMaster` had no renderer, so its
    // placeholders could be read by the formatting cascade and clicked by nobody.
    await expect(page.locator('[data-editing="master"]')).toHaveCount(1);
    const shown = page.locator('.sl-stage .sl-def-master');
    await expect(shown).toBeVisible();
    // And its own children are on the page, which is what makes them selectable.
    expect(await shown.locator('[data-bc-sid]').count()).toBeGreaterThan(0);
  });
});

/**
 * And what a reader can *change* about it, from the panel of the thing they are standing in.
 *
 * `setBoxStyle` refuses a node that is not a box — measured, and it was the whole of the old
 * state of this feature: a reader inside a layout could move its placeholders and could not
 * change the layout itself, not its name and not the colour every slide following it draws.
 */
test.describe('a layout’s own answers', () => {
  test('names it, colours it, and pushes its arrangement onto the slides that follow', async ({
    page
  }) => {
    await openDeck(page);
    await pickMenu(page, 'slide.setup.1');
    await page.locator('[data-design-edit="layout-body"]').click();
    await page.waitForTimeout(600);

    const panel = page.locator('.sl-properties');
    await expect(panel).toContainText('레이아웃 ·');
    // How many slides a change reaches, which is what makes this a decision rather than a poke.
    await expect(page.locator('[data-design-reach]')).not.toHaveText('0장');

    const name = panel.getByLabel('정의 이름');
    await name.fill('본문 배치');
    await name.press('Enter');
    await page.waitForTimeout(500);
    await expect(panel).toContainText('본문 배치');

    /*
     * And the arrangement, offered rather than automatic: a layout's graphics are copied, not
     * transcluded — a template cannot draw a foreign node — so a slide draws its layout's
     * formatting and background live and its boxes never.
     */
    const moved = await page.evaluate(async () => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const slides = ((root.content ?? []) as string[]).filter(
        (sid: string) => store.getNode(sid)?.attributes?.layoutId === 'layout-body'
      );
      const title = ((store.getNode(slides[0])?.content ?? []) as string[]).find((sid: string) => {
        const node = store.getNode(sid);
        return node?.stype === 'textFrame' && node.attributes?.role === 'title';
      });
      if (!title) return null;
      // Put it somewhere the layout does not say, so "applied" is visible.
      await editor.executeCommand('setBoxGeometry', { nodeIds: [title], x: 9000, y: 8000 });
      return { title, before: store.getNode(title).attributes.x };
    });
    test.skip(!moved, '이 레이아웃을 따르는 장에 제목이 없습니다');
    await page.waitForTimeout(400);

    await page.locator('[data-design-apply="layout-body"]').click();
    await page.waitForTimeout(700);

    const after = await page.evaluate(
      (sid) => (window as any).editor.dataStore.getNode(sid).attributes.x,
      moved!.title
    );
    expect(after).not.toBe(moved!.before);
  });
});
