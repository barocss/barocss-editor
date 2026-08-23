import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, currentSlide } from './helpers';

/**
 * Putting a slide **into** a layout.
 *
 * A deck could already say which layout a slide *follows* — which decides what its
 * formatting inherits — and that moved nothing, which is right and is not what a reader
 * means by "make this page look like that one". This is the other half: the arrangement,
 * with the content they already have.
 *
 * The matching is `layoutMoves`, unit-tested: by **role**, never by position. What a browser
 * shows is that the gesture reaches it, that the boxes actually move, and — the thing that
 * matters most — that nothing is lost.
 */
const boxesOf = (page: Page) =>
  page.evaluate(() => {
    const editor = (window as any).editor;
    const store = editor.dataStore;
    const root = store.getNode(editor.getRootId());
    const slide = (root.content as string[]).find(
      (sid) => store.getNode(sid)?.stype === 'surface'
    )!;
    return (store.getNode(slide).content as string[]).map((sid) => {
      const node = store.getNode(sid);
      return {
        sid,
        role: node.attributes?.role ?? null,
        x: node.attributes?.x ?? null,
        y: node.attributes?.y ?? null
      };
    });
  });

/** The layouts this deck defines, by id. */
const layoutsOf = (page: Page) =>
  page.evaluate(() => {
    const editor = (window as any).editor;
    const store = editor.dataStore;
    const root = store.getNode(editor.getRootId());
    const out: { id: string; slots: { role: string | null; x: number; y: number }[] }[] = [];
    for (const child of root.content as string[]) {
      const node = store.getNode(child);
      if (node?.stype !== 'resources') continue;
      for (const one of node.content as string[]) {
        const layout = store.getNode(one);
        if (layout?.stype !== 'slideLayout') continue;
        out.push({
          id: layout.attributes.id,
          slots: (layout.content as string[]).map((sid) => {
            const slot = store.getNode(sid);
            return {
              role: slot?.attributes?.role ?? null,
              x: slot?.attributes?.x ?? 0,
              y: slot?.attributes?.y ?? 0
            };
          })
        });
      }
    }
    return out;
  });

const openLayoutDialog = async (page: Page) => {
  await page.locator('[data-slide-layout]').click();
  await expect(page.locator('[data-layout-arrange]')).toHaveCount(1);
};

/**
 * Choose a layout in the dialog.
 *
 * The trigger and then the item: `ChoiceSelect` is Radix's select, not a native one, so
 * `selectOption` finds nothing to select — measured, and the same route `theme.spec` takes.
 */
const chooseLayout = async (page: Page, id: string) => {
  await page.locator('.sl-dialog-layout').click();
  await page.locator(`[data-style="${id}"]`).click();
};

test.describe('putting a slide into a layout', () => {
  test('moves each box to the slot for what it is, and follows the layout after', async ({
    page
  }) => {
    await openDeck(page);
    const layouts = await layoutsOf(page);
    // A layout that is not the one the first slide already follows, so there is a move.
    const other = layouts.find((one) => one.id === 'layout-body') ?? layouts[1] ?? layouts[0];
    expect(other, '이 덱에 레이아웃이 없습니다').toBeTruthy();

    const before = await boxesOf(page);
    const title = before.find((box) => box.role === 'title');
    expect(title, '첫 슬라이드에 제목 자리가 없습니다').toBeTruthy();

    await openLayoutDialog(page);
    await chooseLayout(page, other.id);
    await page.locator('[data-layout-arrange]').click();
    await page.waitForTimeout(500);

    const after = await boxesOf(page);
    const moved = after.find((box) => box.sid === title!.sid)!;
    const slot = other.slots.find((one) => one.role === 'title')!;
    // Where the layout says a title goes — not where the layout's *first* box is.
    expect({ x: moved.x, y: moved.y }).toEqual({ x: slot.x, y: slot.y });

    // And the slide follows that layout now, so its formatting inherits from it too: one
    // gesture, one entry.
    const following = await page.evaluate(async (sid) => {
      const store = (window as any).editor.dataStore;
      return store.getNode(sid).attributes.layoutId;
    }, await currentSlide(page));
    expect(following).toBe(other.id);
  });

  test('loses nothing, and leaves alone what the layout says nothing about', async ({
    page
  }) => {
    await openDeck(page);
    // A shape with no role: the layout has no slot for it, so it must not move.
    const extra = await page.evaluate(async () => {
      const editor = (window as any).editor;
      await editor.executeCommand('insertRectangle', { x: 700, y: 8000, width: 1200, height: 800 });
      const sid = editor.selection?.nodeIds?.[0] as string;
      editor.setNode({ nodeIds: [] });
      return sid;
    });
    await page.waitForTimeout(300);
    const before = await boxesOf(page);

    const layouts = await layoutsOf(page);
    const other = layouts.find((one) => one.id === 'layout-body') ?? layouts[0];
    await openLayoutDialog(page);
    await chooseLayout(page, other.id);
    await page.locator('[data-layout-arrange]').click();
    await page.waitForTimeout(500);

    const after = await boxesOf(page);
    // Nothing added and nothing deleted: applying a layout must not be able to lose a
    // reader's work, and must not put a box on the slide that nobody typed.
    expect(after).toHaveLength(before.length);
    const same = after.find((box) => box.sid === extra)!;
    const was = before.find((box) => box.sid === extra)!;
    expect({ x: same.x, y: same.y }).toEqual({ x: was.x, y: was.y });
  });

  test('is one press of undo', async ({ page }) => {
    await openDeck(page);
    const before = await boxesOf(page);
    const layouts = await layoutsOf(page);
    const other = layouts.find((one) => one.id === 'layout-body') ?? layouts[0];

    await openLayoutDialog(page);
    await chooseLayout(page, other.id);
    await page.locator('[data-layout-arrange]').click();
    await page.waitForTimeout(500);
    expect(await boxesOf(page)).not.toEqual(before);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    // The moves *and* the layout it started following, together: it was one gesture.
    expect(await boxesOf(page)).toEqual(before);
  });
});
