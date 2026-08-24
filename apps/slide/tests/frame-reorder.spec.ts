import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck } from './helpers';

/**
 * A drag inside a frame that arranges.
 *
 * A frame that arranges owns its children's coordinates (canvas-model §5), so a *move*
 * has nowhere to go. Measured before this existed: `setBoxGeometry` reported success, the
 * layout put the shape straight back, and undo did nothing — the reader's own entry
 * restored the number the layout had already restored. A gesture that reports success and
 * changes nothing is the worst of the three answers.
 *
 * So the drag means the one thing about an arranged child that is still the reader's: its
 * **place in the order**. Which is `reorderIndexAt` in the model with its own tests; what
 * only a browser shows is that the gesture reaches it, that the line drawn while dragging
 * says where it will land, and that the arrangement follows.
 */

/**
 * The sample deck's frame, arranged in a row — **and the slide it is on, shown**.
 *
 * The stage draws every slide and hides all but one, so a frame on the third slide is in
 * the DOM at zero size: every `boundingBox()` came back null and four tests failed about
 * a gesture that works. The frame is on the slide it is on; the test has to go there.
 */
const rowFrame = async (page: Page) => {
  const found = await page.evaluate(async () => {
    const editor = (window as any).editor;
    const store = editor.dataStore;
    let frame: string | undefined;
    let slide: string | undefined;
    const walk = (sid: string, surface?: string) => {
      const node = store.getNode(sid);
      if (!node) return;
      const here = node.stype === 'surface' ? sid : surface;
      if (node.stype === 'frame' && !frame) {
        frame = sid;
        slide = here;
      }
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child, here);
    };
    walk(editor.getRootId());
    await editor.executeCommand('setFrameLayout', { nodeId: frame, layoutMode: 'row', gap: 200 });
    await new Promise((resolve) => setTimeout(resolve, 80));
    return { frame: frame!, slide: slide!, children: [...(store.getNode(frame!).content as string[])] };
  });

  await page.locator(`.sl-filmstrip button[data-slide="${found.slide}"]`).click();
  await page.waitForTimeout(400);
  return found;
};

const orderOf = (page: Page, frame: string) =>
  page.evaluate((sid) => [...((window as any).editor.dataStore.getNode(sid).content as string[])], frame);

/** Go inside the frame, which is how a reader says they mean its children. */
const goInside = async (page: Page, frame: string, child: string) => {
  await page.evaluate(
    ([f, c]) => {
      const editor = (window as any).editor;
      editor.setNode({ nodeIds: [f] });
      editor.setNode({ nodeIds: [c] });
    },
    [frame, child]
  );
  const box = await page.locator(`.sl-stage [data-bc-sid="${child}"]`).first().boundingBox();
  expect(box).not.toBeNull();
  // A double press on a child is the gesture for going in; the selection alone leaves the
  // overlay looking at the slide's own children.
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(300);
};

test.describe('a drag inside a frame that arranges', () => {
  test('moves the shape in the order, not to where it was dropped', async ({ page }) => {
    await openDeck(page);
    const { frame, children } = await rowFrame(page);
    expect(children.length).toBeGreaterThanOrEqual(3);

    await goInside(page, frame, children[0]);
    const first = (await page.locator(`.sl-stage [data-bc-sid="${children[0]}"]`).first().boundingBox())!;
    const last = (await page
      .locator(`.sl-stage [data-bc-sid="${children[children.length - 1]}"]`)
      .first()
      .boundingBox())!;

    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width, last.y + last.height / 2, { steps: 12 });
    // The line says where it will land, before the reader lets go.
    await expect(page.locator('[data-reorder-line]')).toHaveCount(1);
    await page.mouse.up();
    await page.waitForTimeout(500);

    const after = await orderOf(page, frame);
    // Dragged past everything, so it is last now — and it is the *order* that changed.
    expect(after[after.length - 1]).toBe(children[0]);
    expect(after).toHaveLength(children.length);
  });

  test('leaves the shapes arranged, at the frame’s own places', async ({ page }) => {
    await openDeck(page);
    const { frame, children } = await rowFrame(page);
    const arranged = await page.evaluate(
      (sid) =>
        ((window as any).editor.dataStore.getNode(sid).content as string[])
          .map((child: string) => (window as any).editor.dataStore.getNode(child).attributes.x)
          .sort((a: number, b: number) => a - b),
      frame
    );

    await goInside(page, frame, children[0]);
    const first = (await page.locator(`.sl-stage [data-bc-sid="${children[0]}"]`).first().boundingBox())!;
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(first.x + first.width * 2.5, first.y + first.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // The same set of places, filled in the new order: a reorder must not leave a shape
    // where the pointer happened to be.
    const now = await page.evaluate(
      (sid) =>
        ((window as any).editor.dataStore.getNode(sid).content as string[])
          .map((child: string) => (window as any).editor.dataStore.getNode(child).attributes.x)
          .sort((a: number, b: number) => a - b),
      frame
    );
    expect(now).toEqual(arranged);
  });

  test('is one press of undo', async ({ page }) => {
    await openDeck(page);
    const { frame, children } = await rowFrame(page);
    const before = await orderOf(page, frame);

    await goInside(page, frame, children[0]);
    const first = (await page.locator(`.sl-stage [data-bc-sid="${children[0]}"]`).first().boundingBox())!;
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(first.x + first.width * 2.5, first.y + first.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    expect(await orderOf(page, frame)).not.toEqual(before);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    expect(await orderOf(page, frame)).toEqual(before);
  });

  /**
   * The panel's half of the same rule.
   *
   * A field a reader can type into that changes nothing is the fault the drag had, in a
   * place where there is no gesture to give another meaning to — so it is greyed, and the
   * command refuses those two keys whoever asks.
   */
  test('greys the position fields, and the command refuses them', async ({ page }) => {
    await openDeck(page);
    const { frame, children } = await rowFrame(page);

    await page.evaluate((sid) => (window as any).editor.setNode({ nodeIds: [sid] }), children[0]);
    await page.waitForTimeout(400);

    /*
     * Exactly named, because `getByLabel` matches by substring and the panel now has a second
     * control per bindable attribute ("… 문서 변수", §10h-2). Two labels containing one word is
     * ordinary in a panel; a test that asks for a substring is the loose half.
     */
    await expect(page.locator('.sl-properties').getByLabel('X', { exact: true })).toBeDisabled();
    await expect(page.locator('.sl-properties').getByLabel('Y', { exact: true })).toBeDisabled();
    // The size is still the reader's: an arrangement places children and does not resize
    // them.
    await expect(page.locator('.sl-properties').getByLabel('너비', { exact: true })).toBeEnabled();

    const refused = await page.evaluate(
      (sid) => (window as any).editor.executeCommand('setBoxGeometry', { nodeId: sid, x: 6000 }),
      children[0]
    );
    expect(refused).toBe(false);
    void frame;
  });

  test('still moves a shape in a frame that does not arrange', async ({ page }) => {
    await openDeck(page);
    const { frame, children } = await rowFrame(page);
    // The other half of the rule: a frame that arranges nothing gives a drag its plain
    // meaning, and taking that away would be a worse bug than the one being fixed.
    await page.evaluate(
      (sid) => (window as any).editor.executeCommand('setFrameLayout', { nodeId: sid, layoutMode: 'none' }),
      frame
    );
    await page.waitForTimeout(300);

    await goInside(page, frame, children[0]);
    const was = await page.evaluate(
      (sid) => ({ ...(window as any).editor.dataStore.getNode(sid).attributes }),
      children[0]
    );
    const first = (await page.locator(`.sl-stage [data-bc-sid="${children[0]}"]`).first().boundingBox())!;
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(first.x + first.width / 2 + 120, first.y + first.height / 2 + 60, { steps: 10 });
    await expect(page.locator('[data-reorder-line]')).toHaveCount(0);
    await page.mouse.up();
    await page.waitForTimeout(500);

    const now = await page.evaluate(
      (sid) => ({ ...(window as any).editor.dataStore.getNode(sid).attributes }),
      children[0]
    );
    expect(now.x).not.toBe(was.x);
  });
});
