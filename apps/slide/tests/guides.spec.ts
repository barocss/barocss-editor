import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, attr, visibleBoxes } from './helpers';

/**
 * The guides a reader places.
 *
 * Measured in the chrome audit and the one item on it that PowerPoint, Keynote and
 * Figma all have: the deck drew snap lines while a shape was dragged — two of
 * them — and there was **nothing to measure against and nothing a reader could
 * place**. Found guides answer "is this aligned with that"; a placed guide answers
 * "is this where I decided things go", which is the question asked across a whole
 * deck and cannot be asked of a found one.
 *
 * The list arithmetic is a model, tested in milliseconds
 * (`office-slides/test/guides.test.ts`): what may be in the list, what counts as a
 * duplicate, what counts as off the slide. What only a browser shows is the three
 * gestures — pulled out of a ruler, dragged along, thrown away — and that a shape
 * actually snaps to one.
 */
const guides = (page: Page) => page.locator('.sl-placed-guide:not([data-guide-draft])');

/** The ruler's own box, which is where a guide is pulled from. */
const rulerBox = async (page: Page, axis: 'x' | 'y') => {
  const box = await page.locator(`[data-ruler="${axis}"]`).boundingBox();
  if (!box) throw new Error('no ruler');
  return box;
};

/**
 * Where a point of the *slide* is on screen.
 *
 * Measured through the ruler rather than through the drawn slide, and this is the
 * correction a first attempt needed: the overlay is clipped to the stage's
 * viewport, so its box is the *visible* part of the slide and not the slide. A
 * fraction of it is a different place from a fraction of the slide whenever the
 * slide is wider than its pane.
 */
const alongRuler = async (page: Page, axis: 'x' | 'y', fraction: number) => {
  const ruler = await rulerBox(page, axis);
  return axis === 'x'
    ? { x: Math.round(ruler.x + ruler.width * fraction), along: ruler.width * fraction }
    : { y: Math.round(ruler.y + ruler.height * fraction), along: ruler.height * fraction };
};

/** Pull one out of a ruler and drop it at a fraction along the slide. */
const pullGuide = async (page: Page, axis: 'x' | 'y', fraction: number) => {
  const ruler = await rulerBox(page, axis);
  const overlay = (await page.locator('.sl-overlay').boundingBox())!;

  /**
   * Started a few pixels inside the ruler, on the axis it measures.
   *
   * Away from its inner edge on purpose: the two rulers and the slide share a
   * grid, and if the fit ever over-claims the room again the slide's overlay will
   * creep back over the ruler's inner edge — which is how this was found. A start
   * point in the middle of the strip is the one that does not depend on that.
   */
  const from =
    axis === 'x'
      ? { x: Math.round(ruler.x + 20), y: Math.round(ruler.y + ruler.height / 2) }
      : { x: Math.round(ruler.x + ruler.width / 2), y: Math.round(ruler.y + 20) };

  const spot = await alongRuler(page, axis, fraction);
  const to =
    axis === 'x'
      ? { x: spot.x!, y: Math.round(overlay.y + overlay.height / 2) }
      : { x: Math.round(overlay.x + overlay.width / 2), y: spot.y! };

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  return { to, letGo: async () => page.mouse.up() };
};

test.describe('a guide a reader places', () => {
  test('is pulled out of the ruler and kept on the slide', async ({ page }) => {
    await openDeck(page);
    const slide = await page.evaluate(
      () =>
        document.querySelector('.sl-filmstrip button[data-current="true"]')?.getAttribute('data-slide') ?? ''
    );

    expect(await guides(page).count(), '시작할 때 안내선이 있습니다').toBe(0);
    expect(await attr(page, slide, 'guides')).toBeUndefined();

    const drag = await pullGuide(page, 'x', 0.3);

    // While it is held it is drawn but not written: a guide the document learned
    // about on every pointer event would be forty entries of history for one
    // gesture.
    await expect(page.locator('[data-guide-draft]')).toHaveCount(1);
    expect(await attr(page, slide, 'guides'), '놓기 전에 문서에 써졌습니다').toBeUndefined();

    await drag.letGo();

    await expect(guides(page)).toHaveCount(1);
    await expect.poll(() => attr(page, slide, 'guides')).toHaveLength(1);
    const placed = (await attr(page, slide, 'guides')) as { axis: string; at: number }[];
    expect(placed[0].axis).toBe('x');
    expect(placed[0].at).toBeGreaterThan(0);
  });

  test('is pulled out of the side ruler as a horizontal one', async ({ page }) => {
    await openDeck(page);
    const drag = await pullGuide(page, 'y', 0.4);
    await drag.letGo();

    await expect(guides(page)).toHaveCount(1);
    // The axis is the ruler's, and a drag changes where a guide is and never what
    // it is.
    await expect(guides(page).first()).toHaveAttribute('data-guide-axis', 'y');
  });

  test('pulls a shape onto itself, and says which line it was', async ({ page }) => {
    await openDeck(page);
    const boxes = await visibleBoxes(page);
    const box = boxes[0];

    /**
     * A guide placed a little to the left of the shape's own left edge, so the
     * drag has somewhere to be pulled *to*.
     *
     * Placed through the command rather than through the ruler: what is being
     * tested here is the snapping, and the pulling has its own test above.
     */
    const target = await page.evaluate((sid) => {
      const editor = (window as any).editor;
      const node = editor.dataStore.getNode(sid);
      const at = Math.round(Number(node.attributes.x) - 400);
      const slide = document
        .querySelector('.sl-filmstrip button[data-current="true"]')
        ?.getAttribute('data-slide');
      void editor.executeCommand('setSlideGuides', {
        guides: [{ axis: 'x', at }],
        slideId: slide
      });
      return at;
    }, box.sid);
    await expect(guides(page)).toHaveCount(1);

    /**
     * Dragged far enough to be a drag, and to land near the guide.
     *
     * A first attempt nudged two pixels and back: below the threshold that makes
     * a press a drag, so nothing was written and the shape's `x` came back
     * unchanged — which reads exactly like a snap that did not happen. Fourteen
     * pixels at this zoom is about 400 twips, so the raw position lands the left
     * edge just past the guide 400 to its left, well inside the snap's reach.
     */
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x - 8, box.y, { steps: 4 });
    await page.mouse.move(box.x - 14, box.y, { steps: 4 });

    // The line it was pulled onto is drawn while the drag is held.
    await expect(page.locator('.sl-guide')).not.toHaveCount(0);
    await page.mouse.up();

    // And the shape landed on it, in the document.
    await expect.poll(() => attr(page, box.sid, 'x')).toBe(target);
  });

  test('is dragged along, and thrown away off the slide', async ({ page }) => {
    await openDeck(page);
    const slide = await page.evaluate(
      () =>
        document.querySelector('.sl-filmstrip button[data-current="true"]')?.getAttribute('data-slide') ?? ''
    );

    const first = await pullGuide(page, 'x', 0.3);
    await first.letGo();
    const placed = (await attr(page, slide, 'guides')) as { at: number }[];

    // Take hold of the line itself and move it.
    const line = (await guides(page).first().boundingBox())!;
    const overlay = (await page.locator('.sl-overlay').boundingBox())!;
    await page.mouse.move(Math.round(line.x + line.width / 2), Math.round(line.y + line.height / 2));
    await page.mouse.down();
    await page.mouse.move(Math.round(line.x + 120), Math.round(line.y + line.height / 2), { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(async () => ((await attr(page, slide, 'guides')) as { at: number }[])[0].at)
      .toBeGreaterThan(placed[0].at);
    // Still one guide: a move is not an add.
    await expect(guides(page)).toHaveCount(1);

    /**
     * And off the slide is how it goes away.
     *
     * Every tool with guides deletes them this way, because there is nowhere else
     * for the gesture to mean anything and the reader is already holding it.
     */
    const held = (await guides(page).first().boundingBox())!;
    await page.mouse.move(Math.round(held.x + held.width / 2), Math.round(held.y + held.height / 2));
    await page.mouse.down();
    await page.mouse.move(Math.round(overlay.x - 80), Math.round(held.y + held.height / 2), { steps: 8 });
    await page.mouse.up();

    await expect(guides(page)).toHaveCount(0);
    await expect.poll(() => attr(page, slide, 'guides')).toHaveLength(0);
  });

  test('is the slide’s own, not the deck’s', async ({ page }) => {
    await openDeck(page);
    const drag = await pullGuide(page, 'x', 0.3);
    await drag.letGo();
    await expect(guides(page)).toHaveCount(1);

    // A reader places a guide to line up the things on *this* slide. A deck-wide
    // one would follow them onto slides where it means nothing — and it is what
    // PowerPoint does. The cost is placing it again, which every tool that does
    // it this way pays.
    await page.locator('.sl-filmstrip button[data-slide]').nth(1).click();
    await expect(guides(page)).toHaveCount(0);

    await page.locator('.sl-filmstrip button[data-slide]').nth(0).click();
    await expect(guides(page)).toHaveCount(1);
  });

  test('is not drawn while presenting', async ({ page }) => {
    await openDeck(page);
    const drag = await pullGuide(page, 'x', 0.3);
    await drag.letGo();
    await expect(guides(page)).toHaveCount(1);

    // An audience is looking. The rulers go away in the show and so must the
    // lines a reader was measuring against.
    await page.locator('[data-present]').click();
    await expect(guides(page)).toHaveCount(0);
  });
});

/**
 * A guide placed **without a pointer**.
 *
 * The rulers are controls — `role="separator"` with a label — and until this there was no
 * key that placed a guide, so the reader who most needs to be told the ruler is there could
 * not use it. The arithmetic is `guidePlace`, unit-tested; what a browser shows is that a
 * chord and a menu item reach it, and that the guide is drawn where the shapes are.
 */
test.describe('placing a guide from the keyboard', () => {
  const guidesOf = (page: Page) =>
    page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const slide = (root.content as string[]).find(
        (sid) => store.getNode(sid)?.stype === 'surface'
      )!;
      return (store.getNode(slide).attributes?.guides ?? []) as { axis: string; at: number }[];
    });

  test('a chord puts one down the middle of what is selected', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page);
    await page.mouse.click(box.x, box.y);
    await expect
      .poll(() => page.evaluate(() => (window as any).editor.selection?.nodeIds?.length ?? 0))
      .toBeGreaterThan(0);

    const before = (await guidesOf(page)).length;
    await page.keyboard.press('Alt+Period');
    await page.waitForTimeout(400);

    const now = await guidesOf(page);
    expect(now).toHaveLength(before + 1);
    const placed = now[now.length - 1];
    expect(placed.axis).toBe('x');

    // Down the middle of the shape, which is what a reader placing a guide is doing.
    const middle = await page.evaluate((sid) => {
      const attrs = (window as any).editor.dataStore.getNode(sid).attributes;
      return Math.round(attrs.x + attrs.width / 2);
    }, box.sid);
    expect(Math.abs(placed.at - middle)).toBeLessThan(30);

    // And it is drawn: a guide in the document that nothing shows is not a guide. The
    // same locator the rest of this file uses — `.sl-placed-guide`, which is a reader's
    // guide as opposed to the lines a drag finds.
    await expect(guides(page)).not.toHaveCount(0);
  });

  test('the other chord puts one across, and a third clears them', async ({ page }) => {
    await openDeck(page);
    await page.keyboard.press('Alt+Comma');
    await page.waitForTimeout(400);
    expect((await guidesOf(page)).some((one) => one.axis === 'y')).toBe(true);

    await page.keyboard.press('Alt+Shift+Comma');
    await page.waitForTimeout(400);
    expect(await guidesOf(page)).toEqual([]);
  });

  test('is on the slide’s own menu, where a reader finds the chord', async ({ page }) => {
    await openDeck(page);
    /*
     * A corner of the **slide**, which the sample deck leaves bare — not a corner of the
     * stage, which is the grey around it and where a right-click finds no slide at all.
     * The same point the context-menu spec uses, for the same reason.
     */
    const empty = await page.evaluate(() => {
      const slide = document.querySelector('.sl-stage .sl-slide:not([style*="display: none"])')!;
      const rect = slide.getBoundingClientRect();
      return { x: Math.round(rect.right - 20), y: Math.round(rect.bottom - 20) };
    });
    await page.mouse.click(empty.x, empty.y, { button: 'right' });
    await expect(page.locator('[data-context-menu]')).toHaveCount(1);

    const row = page.locator('[data-menu-item="guide-x"]');
    await expect(row).toHaveCount(1);
    // The chord is drawn beside it, which is how a menu teaches one.
    await expect(row).toContainText('Alt');
    await row.click();
    await page.waitForTimeout(400);
    expect((await guidesOf(page)).some((one) => one.axis === 'x')).toBe(true);
  });

  test('refuses to write the same guide twice', async ({ page }) => {
    await openDeck(page);
    await page.keyboard.press('Alt+Period');
    await page.waitForTimeout(400);
    const once = await guidesOf(page);

    // The same place again: `withGuide` refuses a duplicate, and the command reports
    // "nothing happened" rather than writing an entry a reader would undo into itself.
    await page.keyboard.press('Alt+Period');
    await page.waitForTimeout(400);
    expect(await guidesOf(page)).toEqual(once);
  });
});
