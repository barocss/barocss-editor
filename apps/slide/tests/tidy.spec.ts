import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck } from './helpers';

/**
 * Tidying a diagram.
 *
 * The arithmetic is unit-tested twice over — `layoutGraph` in the canvas package, the
 * command in the deck's — so what is asked here is the part only a browser can answer:
 * that the button is on the toolbar and knows when it can be pressed, that the **lines
 * are redrawn** where the shapes ended up (a route is derived, and the whole reason the
 * layout pass exists), and that one press of undo puts the reader's own arrangement back.
 */

/** Three boxes and two lines, scattered on purpose. */
const scatter = async (page: Page) =>
  page.evaluate(async () => {
    const editor = (window as any).editor;
    const made: string[] = [];
    for (const place of [
      { x: 7000, y: 600 },
      { x: 600, y: 5000 },
      { x: 11000, y: 5200 }
    ]) {
      await editor.executeCommand('insertRectangle', { ...place, width: 2600, height: 1200 });
      made.push(editor.selection?.nodeIds?.[0] as string);
    }
    for (const to of [made[1], made[2]]) {
      await editor.executeCommand('insertConnector', { startNodeId: made[0], endNodeId: to });
    }
    editor.setNode({ nodeIds: [] });
    return made as [string, string, string];
  });

const placeOf = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const attrs = (window as any).editor.dataStore.getNode(id)?.attributes ?? {};
    return { x: attrs.x as number, y: attrs.y as number };
  }, sid);

test.describe('tidying a diagram', () => {
  test('is on the toolbar, and not offered until something is joined', async ({ page }) => {
    await openDeck(page);

    /*
     * **Not offered**, where it used to be offered and greyed.
     *
     * It lives in the arranging group, and that group is contextual now: measured with nothing
     * selected, of the deck's 60 controls forty-four could do nothing, in two rows. A button that
     * says so by being absent is the same sentence as a greyed one and costs no room.
     */
    const button = page.locator('[data-control="tidy-graph-down"]');
    await expect(button).toHaveCount(0);

    await scatter(page);
    await page.waitForTimeout(400);
    await expect(button).toBeEnabled();
  });

  test('puts the shapes in rows and redraws the lines to match', async ({ page }) => {
    await openDeck(page);
    const [parent, left, right] = await scatter(page);

    await page.locator('[data-control="tidy-graph-down"]').click();
    await page.waitForTimeout(600);

    const above = await placeOf(page, parent);
    const one = await placeOf(page, left);
    const two = await placeOf(page, right);

    expect(one.y).toBeGreaterThan(above.y);
    expect(two.y).toBe(one.y);
    // Over the middle of its children rather than over the first of them, which is the
    // pass that makes it look drawn instead of tabulated.
    expect(above.x + 1300).toBeCloseTo((one.x + two.x + 2600) / 2, -1);

    /*
     * And the lines are where the shapes now are. A route is derived and belongs to the
     * render (canvas-model §8.11) — nothing wrote a line's geometry here, and if the
     * layout pass did not run again the drawing would still join the old places.
     */
    const lines = page.locator('.sl-stage .sl-connector');
    await expect(lines).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      /*
       * The **visible stroke**, which is the second path: a connector draws a fat
       * transparent one first so the line can be grabbed, and an arrowhead after — and
       * an arrowhead starts at the *far* end, which is what made the first version of
       * this assertion fail about a drawing that was right.
       */
      const d = (await lines.nth(index).locator('path').nth(1).getAttribute('d'))!;
      const start = d.match(/^M (-?\d+) (-?\d+)/)!;
      // On the parent's own boundary, where the tidy put it. Nothing wrote this: the
      // route is derived, and if the layout pass had not run again the line would still
      // join the places the shapes were dragged from.
      const on = { x: Number(start[1]), y: Number(start[2]) };
      expect(on.x).toBeGreaterThanOrEqual(above.x - 30);
      expect(on.x).toBeLessThanOrEqual(above.x + 2600 + 30);
      expect(on.y).toBeGreaterThanOrEqual(above.y - 30);
      expect(on.y).toBeLessThanOrEqual(above.y + 1200 + 30);
    }
  });

  test('runs the ranks across when the other button is pressed', async ({ page }) => {
    await openDeck(page);
    const [parent, left] = await scatter(page);

    await page.locator('[data-control="tidy-graph-right"]').click();
    await page.waitForTimeout(600);

    const above = await placeOf(page, parent);
    const one = await placeOf(page, left);
    // A process runs across; a flow chart runs down. Two answers, no dialog.
    expect(one.x).toBeGreaterThan(above.x);
  });

  /**
   * The gap between two ranks is measured from what the lines draw, and this is the thing
   * it is measured *for*: a label pill sits on the middle of the line, and a gap that does
   * not hold it draws the reader's own word across the shape below.
   */
  test('leaves room for a label, between the rows rather than over a shape', async ({
    page
  }) => {
    await openDeck(page);
    const [parent, left] = await scatter(page);

    await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const slide = store
        .getNode(editor.getRootId())
        .content.find((sid: string) => store.getNode(sid)?.stype === 'surface');
      for (const sid of store.getNode(slide).content as string[]) {
        if (store.getNode(sid)?.stype !== 'connector') continue;
        void editor.executeCommand('setConnector', { nodeIds: [sid], label: '검토가 필요한 경우' });
      }
    });
    await page.locator('[data-control="tidy-graph-down"]').click();
    await page.waitForTimeout(700);

    const above = await placeOf(page, parent);
    const below = await placeOf(page, left);
    const pill = (await page
      .locator('.sl-stage .sl-connector [data-connector-label]')
      .first()
      .boundingBox())!;
    const shapes = await page
      .locator(`.sl-stage [data-bc-sid="${parent}"]`)
      .first()
      .boundingBox();

    expect(shapes).not.toBeNull();
    // Between the two rows in the document's own numbers: the pill's centre is drawn at
    // the middle of the run, so the room for it is the room between the ranks.
    expect(below.y - above.y).toBeGreaterThan(1200 + pill.height * 15);
  });

  /**
   * The reader's own placement, kept.
   *
   * The tidy is not a mode — it runs once and writes plain coordinates — so what has to
   * be answerable is the *second* press: a reader who moved one box deliberately and
   * locked it there gets the diagram arranged around it instead of over it.
   */
  test('arranges around a shape the reader locked, and leaves it alone', async ({ page }) => {
    await openDeck(page);
    const [parent, left, right] = await scatter(page);

    await page.evaluate(async (sid) => {
      const editor = (window as any).editor;
      // Named, not selected: `setBoxLocked` takes the boxes a payload names and has no
      // selection fallback — both of its callers in the product pass `nodeIds`.
      await editor.executeCommand('setBoxLocked', { nodeIds: [sid], locked: true });
      editor.setNode({ nodeIds: [] });
    }, parent);
    await page.waitForTimeout(300);

    await page.locator('[data-control="tidy-graph-down"]').click();
    await page.waitForTimeout(600);

    // Where the reader put it, to the twip.
    expect(await placeOf(page, parent)).toEqual({ x: 7000, y: 600 });
    const above = await placeOf(page, parent);
    const one = await placeOf(page, left);
    const two = await placeOf(page, right);
    expect(one.y).toBeGreaterThan(above.y);
    expect(one.y).toBe(two.y);
    // Hung from the pin: centred under it rather than under a corner of the slide.
    expect((one.x + two.x + 2600) / 2).toBeCloseTo(above.x + 1300, -1);
  });

  test('is one press of undo, however many shapes moved', async ({ page }) => {
    await openDeck(page);
    const [parent, left, right] = await scatter(page);
    const before = [
      await placeOf(page, parent),
      await placeOf(page, left),
      await placeOf(page, right)
    ];

    await page.locator('[data-control="tidy-graph-down"]').click();
    await page.waitForTimeout(600);
    expect(await placeOf(page, left)).not.toEqual(before[1]);

    // The reason a reader dares press a button that moves everything they drew.
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    expect([
      await placeOf(page, parent),
      await placeOf(page, left),
      await placeOf(page, right)
    ]).toEqual(before);
  });
});
