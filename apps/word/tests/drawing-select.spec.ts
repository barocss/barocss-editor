import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { placeCaret, settled } from './helpers';

/**
 * Pointing at what is **on** a drawing.
 *
 * The insert made a rectangle in a document; until this, a reader could not touch it — a picture of
 * a rectangle rather than one. Every claim here is about a *set*, because that is what a canvas
 * selection is: click replaces it, Shift adds to it, a marquee takes what it touches.
 *
 * The arithmetic (what a band catches) is unit-tested in the canvas layer. What only a browser
 * shows is that the press reaches the shape at all — the drawing is inside a `contenteditable`
 * page, so a click that was not stopped would put a caret in the paragraph behind it instead.
 */
const drawTwo = async (page: Page) => {
  await page.goto('/');
  await settled(page);
  await placeCaret(page, '.barocss-editor-content p:not(.w-frame p)', 3);

  await page.locator('[data-control="insert-rectangle"]').click();
  await settled(page);

  /*
   * The second shape is placed **beside** the first, through the command's own payload.
   *
   * Not a second toolbar press: every shape starts in the middle of what holds it, so two presses
   * put the ellipse exactly on top of the rectangle and nothing underneath can be clicked. That is
   * the product behaving as designed — a reader drags the new one off — and it is not what this
   * test is about, so the geometry is said out loud here.
   */
  await page.evaluate(() => {
    const editor = (window as any).editor;
    const store = editor.dataStore;
    const walk = (sid: string): string | undefined => {
      const node = store.getNode(sid);
      if (node?.stype === 'rectangle') return sid;
      for (const child of node?.content ?? []) {
        if (typeof child === 'string') {
          const found = walk(child);
          if (found) return found;
        }
      }
      return undefined;
    };
    const rect = walk(editor.getRootId())!;
    const canvas = store.getNode(rect).parentId;
    return editor.executeCommand('insertEllipse', {
      canvasId: canvas,
      x: 300,
      y: 300,
      width: 1200,
      height: 800
    });
  });
  await settled(page);
  await page.evaluate(() => (window as any).editor.setNode(null));
  await settled(page);
};

const selected = (page: Page) =>
  page.evaluate(() => {
    const { selectedNodeIds } = (window as any).barocss ?? {};
    const selection = (window as any).editor.selection;
    return selectedNodeIds ? selectedNodeIds(selection) : (selection?.nodeIds ?? []);
  });

test.describe('selecting what is on a drawing', () => {
  test('a press picks the shape under it, and says so', async ({ page }) => {
    await drawTwo(page);

    await page.locator('.w-canvas rect').click();
    await settled(page);

    expect(await selected(page)).toHaveLength(1);
    // The outline is drawn over the page, in screen pixels, where the shape is.
    await expect(page.locator('[data-drawing-selected]')).toHaveCount(1);

    const shape = await page.locator('.w-canvas rect').boundingBox();
    const outline = await page.locator('[data-drawing-selected]').boundingBox();
    expect(Math.abs(outline!.x - shape!.x)).toBeLessThan(4);
    expect(Math.abs(outline!.width - shape!.width)).toBeLessThan(4);

    /*
     * And the caret did **not** go into the page behind it. A drawing lives inside a
     * `contenteditable`, so a press that was not stopped would leave the next keystroke in the
     * paragraph under the rectangle.
     */
    expect(await page.evaluate(() => (window as any).editor.selection?.type)).toBe('node');
  });

  test('Shift adds a second shape and takes it away again', async ({ page }) => {
    await drawTwo(page);

    await page.locator('.w-canvas rect').click();
    await page.locator('.w-canvas ellipse').click({ modifiers: ['Shift'] });
    await settled(page);

    expect(await selected(page)).toHaveLength(2);
    await expect(page.locator('[data-drawing-selected]')).toHaveCount(2);

    // The same press again removes it: a modifier-click is a toggle, which is what it is everywhere.
    await page.locator('.w-canvas ellipse').click({ modifiers: ['Shift'] });
    await settled(page);
    expect(await selected(page)).toHaveLength(1);
  });

  test('a band across the drawing takes everything it touches', async ({ page }) => {
    await drawTwo(page);

    const canvas = (await page.locator('.w-canvas').boundingBox())!;
    // From one empty corner to the other, across both shapes in the middle.
    await page.mouse.move(canvas.x + 4, canvas.y + 4);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width - 4, canvas.y + canvas.height - 4, { steps: 8 });
    // While it is being dragged the band is drawn.
    await expect(page.locator('[data-drawing-band]')).toHaveCount(1);
    await page.mouse.up();
    await settled(page);

    expect(await selected(page)).toHaveLength(2);
    await expect(page.locator('[data-drawing-band]')).toHaveCount(0);
  });

  test('a press on the empty part of a drawing clears the selection', async ({ page }) => {
    await drawTwo(page);
    await page.locator('.w-canvas rect').click();
    await settled(page);
    expect(await selected(page)).toHaveLength(1);

    const canvas = (await page.locator('.w-canvas').boundingBox())!;
    await page.mouse.click(canvas.x + 4, canvas.y + 4);
    await settled(page);

    expect(await selected(page)).toHaveLength(0);
    await expect(page.locator('[data-drawing-selected]')).toHaveCount(0);
  });
});

/**
 * Dragging what is selected.
 *
 * The arithmetic — a box moved by a delta — is unit-tested in the canvas layer, and the command is
 * tested there too. What only a browser shows is the two things a drag has to get right: the
 * document is **not** touched while the pointer is down (thirty writes a second for one gesture),
 * and a set moves *together*.
 */
test.describe('dragging what is on a drawing', () => {
  const boxesOf = (page: Page) =>
    page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const found: Record<string, { x: number; y: number }> = {};
      const walk = (sid: string) => {
        const node = store.getNode(sid);
        if (node?.stype === 'rectangle' || node?.stype === 'ellipse') {
          found[node.stype] = { x: node.attributes.x, y: node.attributes.y };
        }
        for (const child of node?.content ?? []) if (typeof child === 'string') walk(child);
      };
      walk((window as any).editor.getRootId());
      return found;
    });

  test('moves the whole set together, in one entry of the history', async ({ page }) => {
    await drawTwo(page);
    const before = await boxesOf(page);

    // Both, by band — the selection this whole slice is about.
    const canvas = (await page.locator('.w-canvas').boundingBox())!;
    await page.mouse.move(canvas.x + 4, canvas.y + 4);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width - 4, canvas.y + canvas.height - 4, { steps: 6 });
    await page.mouse.up();
    await settled(page);
    expect(await selected(page)).toHaveLength(2);

    const rect = (await page.locator('.w-canvas rect').boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 60, rect.y + rect.height / 2 + 30, { steps: 8 });

    // Mid-drag: the document still says where they were. A drag that wrote every pointer event
    // would put thirty entries in the history for one gesture.
    expect(await boxesOf(page)).toEqual(before);

    await page.mouse.up();
    await settled(page);

    const after = await boxesOf(page);
    // Both moved, by the same amount, and by what the pointer actually travelled — 60 screen pixels
    // across a canvas 6.5in wide is a real number of twips, so this asserts they agree rather than
    // asserting the number twice.
    const moved = {
      rectangle: { dx: after.rectangle.x - before.rectangle.x, dy: after.rectangle.y - before.rectangle.y },
      ellipse: { dx: after.ellipse.x - before.ellipse.x, dy: after.ellipse.y - before.ellipse.y }
    };
    expect(moved.rectangle.dx).toBeGreaterThan(0);
    expect(moved.rectangle.dy).toBeGreaterThan(0);
    expect(moved.ellipse).toEqual(moved.rectangle);

    // One gesture, one undo — both shapes go back together.
    await page.keyboard.press('Control+z');
    await settled(page);
    expect(await boxesOf(page)).toEqual(before);
  });

  test('a click on a shape does not move it', async ({ page }) => {
    await drawTwo(page);
    const before = await boxesOf(page);

    await page.locator('.w-canvas rect').click();
    await settled(page);

    // A pointer moves a little while a finger presses; a shape that jumped on every click would be
    // unusable, and the two pixels of slack are why this passes.
    expect(await boxesOf(page)).toEqual(before);
    expect(await selected(page)).toHaveLength(1);
  });
});

/**
 * Resizing, deleting and nudging — the rest of what a selection is for.
 *
 * Each of these is the multiple-selection case as much as the single one, which is the point: a set
 * that can only be looked at is not a selection.
 */
test.describe('acting on what is selected', () => {
  const boxOf = (page: Page, stype: string) =>
    page.evaluate((kind) => {
      const store = (window as any).editor.dataStore;
      let found: any = null;
      const walk = (sid: string) => {
        const node = store.getNode(sid);
        if (node?.stype === kind) found = { ...node.attributes };
        for (const child of node?.content ?? []) if (typeof child === 'string') walk(child);
      };
      walk((window as any).editor.getRootId());
      return found;
    }, stype);

  test('a handle pulls the selected shape, and the frame follows the pointer', async ({ page }) => {
    await drawTwo(page);
    await page.locator('.w-canvas rect').click();
    await settled(page);

    const before = await boxOf(page, 'rectangle');
    const handle = (await page.locator('[data-drawing-handle="se"]').boundingBox())!;

    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 40, handle.y + 24, { steps: 6 });
    // Mid-pull the document still says the old size: a resize is written once, at the drop.
    expect((await boxOf(page, 'rectangle')).width).toBe(before.width);
    await page.mouse.up();
    await settled(page);

    const after = await boxOf(page, 'rectangle');
    expect(after.width).toBeGreaterThan(before.width);
    expect(after.height).toBeGreaterThan(before.height);
    // The south-east handle holds the north-west corner still, which is what makes it that handle.
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  test('one frame for the whole set, and Delete takes them all', async ({ page }) => {
    await drawTwo(page);

    const canvas = (await page.locator('.w-canvas').boundingBox())!;
    await page.mouse.move(canvas.x + 4, canvas.y + 4);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width - 4, canvas.y + canvas.height - 4, { steps: 6 });
    await page.mouse.up();
    await settled(page);

    // Two shapes, one frame: a set is one thing to act on.
    await expect(page.locator('[data-drawing-selected]')).toHaveCount(2);
    await expect(page.locator('[data-drawing-frame]')).toHaveCount(1);

    await page.keyboard.press('Delete');
    await settled(page);

    await expect(page.locator('.w-canvas rect')).toHaveCount(0);
    await expect(page.locator('.w-canvas ellipse')).toHaveCount(0);
    // The drawing itself stays: a reader put it there, and clearing it because the last shape went
    // would be the editor deciding they had changed their mind.
    await expect(page.locator('.w-canvas')).toHaveCount(1);

    // And one undo brings the set back, because one press was one transaction.
    await page.keyboard.press('Control+z');
    await settled(page);
    await expect(page.locator('.w-canvas rect')).toHaveCount(1);
    await expect(page.locator('.w-canvas ellipse')).toHaveCount(1);
  });

  test('an arrow key nudges what is selected, and Shift nudges further', async ({ page }) => {
    await drawTwo(page);
    await page.locator('.w-canvas rect').click();
    await settled(page);

    const before = await boxOf(page, 'rectangle');
    await page.keyboard.press('ArrowRight');
    await settled(page);
    // One pixel, in the model's own units — the deck's own step, because a reader who has learned
    // one has learned the other.
    expect((await boxOf(page, 'rectangle')).x).toBe(before.x + 15);

    await page.keyboard.press('Shift+ArrowDown');
    await settled(page);
    expect((await boxOf(page, 'rectangle')).y).toBe(before.y + 144);
  });

  test('Delete with a caret in the text is still a character', async ({ page }) => {
    await drawTwo(page);

    /*
     * The caret put at the **start of a known run**, through the editor, rather than by clicking a
     * paragraph.
     *
     * Measured while writing this: a click lands where the pointer is, and the tail of the sample's
     * paragraphs is a `fieldDateTime` — where typing is refused, correctly, because a field's text
     * is resolved rather than written. A test that clicked and typed was testing the field's
     * refusal and calling it a bug in the drawing.
     */
    const run = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const runs: string[] = [];
      const walk = (sid: string) => {
        const node = store.getNode(sid);
        if (node?.stype === 'inline-text' && store.getNode(node.parentId)?.stype === 'paragraph') {
          runs.push(sid);
        }
        for (const child of node?.content ?? []) if (typeof child === 'string') walk(child);
      };
      walk(editor.getRootId());
      editor.updateSelection({
        type: 'range',
        startNodeId: runs[0],
        startOffset: 0,
        endNodeId: runs[0],
        endOffset: 0,
        collapsed: true
      });
      return runs[0];
    });
    await settled(page);

    const textOf = async () =>
      await page.evaluate((sid) => (window as any).editor.dataStore.getNode(sid)?.text, run);
    const before = await textOf();

    // Nothing is selected on the drawing, so the destructive key has to be the ordinary one.
    await page.keyboard.press('Delete');
    await settled(page);

    expect(await textOf()).toBe(before.slice(1));
    // And the shapes are untouched, which is what `shapesSelected` exists for.
    await expect(page.locator('.w-canvas rect')).toHaveCount(1);
    await expect(page.locator('.w-canvas ellipse')).toHaveCount(1);
  });
});
