import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck } from './helpers';

/**
 * A shape dropped **into** a line.
 *
 * The gesture a flow chart is edited with, after the one that draws it: `수집 → 저장` needs
 * a check in between, so the shape is dropped on the line and the line becomes two. What
 * the model tests cannot show is the part that makes it a gesture — that the line answers
 * while the shape is held, and that the drop and the split are one press of undo.
 */
const chain = async (page: Page) =>
  page.evaluate(async () => {
    const editor = (window as any).editor;
    await editor.executeCommand('insertRectangle', { x: 1500, y: 1500, width: 2600, height: 1200 });
    const a = editor.selection?.nodeIds?.[0] as string;
    await editor.executeCommand('insertRectangle', { x: 13000, y: 1500, width: 2600, height: 1200 });
    const b = editor.selection?.nodeIds?.[0] as string;
    await editor.executeCommand('insertConnector', { startNodeId: a, endNodeId: b, kind: 'straight' });
    const line = editor.selection?.nodeIds?.[0] as string;
    // The shape to drop in, well clear of the line.
    await editor.executeCommand('insertEllipse', { x: 6000, y: 6500, width: 2600, height: 1200 });
    const c = editor.selection?.nodeIds?.[0] as string;
    editor.setNode({ nodeIds: [] });
    return { a, b, c, line };
  });

const linesOf = (page: Page) =>
  page.evaluate(() => {
    const editor = (window as any).editor;
    const store = editor.dataStore;
    const root = store.getNode(editor.getRootId());
    const slide = (root.content as string[]).find((sid) => store.getNode(sid)?.stype === 'surface')!;
    return (store.getNode(slide).content as string[])
      .filter((sid) => store.getNode(sid)?.stype === 'connector')
      .map((sid) => ({
        sid,
        from: store.getNode(sid).attributes.startNodeId,
        to: store.getNode(sid).attributes.endNodeId
      }));
  });

/** Drag a shape by its middle to a point on the stage. */
const dragOnto = async (page: Page, sid: string, to: { x: number; y: number }, hold?: () => Promise<void>) => {
  const box = (await page.locator(`.sl-stage [data-bc-sid="${sid}"]`).first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 14 });
  if (hold) await hold();
  await page.mouse.up();
  await page.waitForTimeout(600);
};

/** The middle of the drawn line, on screen. */
const middleOfLine = async (page: Page, sid: string) => {
  const box = (await page.locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"]`).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test.describe('a shape dropped into a line', () => {
  test('splits it, and says so while the shape is held', async ({ page }) => {
    await openDeck(page);
    const { a, b, c, line } = await chain(page);
    expect(await linesOf(page)).toHaveLength(1);

    const at = await middleOfLine(page, line);
    await dragOnto(page, c, at, async () => {
      // The line answers before the reader lets go, or the gesture is not discoverable.
      await expect(page.locator(`[data-splice-line="${line}"]`)).toHaveCount(1);
    });

    const now = await linesOf(page);
    expect(now).toHaveLength(2);
    expect(now.map((one) => [one.from, one.to])).toEqual([
      [a, c],
      [c, b]
    ]);
  });

  test('leaves the shape where it was dropped', async ({ page }) => {
    await openDeck(page);
    const { c, line } = await chain(page);
    const was = await page.evaluate(
      (sid) => ({ ...(window as any).editor.dataStore.getNode(sid).attributes }),
      c
    );

    await dragOnto(page, c, await middleOfLine(page, line));
    const now = await page.evaluate(
      (sid) => ({ ...(window as any).editor.dataStore.getNode(sid).attributes }),
      c
    );
    // A splice that also teleported the shape would be the tool moving something the
    // reader was holding.
    expect(now.y).not.toBe(was.y);
    expect(Math.abs(now.y - 1500)).toBeLessThan(3000);
  });

  test('is one press of undo, drop and split together', async ({ page }) => {
    await openDeck(page);
    const { c, line } = await chain(page);
    const was = await page.evaluate(
      (sid) => ({ ...(window as any).editor.dataStore.getNode(sid).attributes }),
      c
    );

    await dragOnto(page, c, await middleOfLine(page, line));
    expect(await linesOf(page)).toHaveLength(2);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(600);
    const back = await linesOf(page);
    expect(back).toHaveLength(1);
    expect(back[0].sid).toBe(line);
    expect(
      await page.evaluate((sid) => (window as any).editor.dataStore.getNode(sid).attributes.y, c)
    ).toBe(was.y);
  });

  test('is a plain move when the drop is not on a line', async ({ page }) => {
    await openDeck(page);
    const { c, line } = await chain(page);
    const at = await middleOfLine(page, line);

    // Well below it: the tolerance is a handle's width, not "somewhere near".
    await dragOnto(page, c, { x: at.x, y: at.y + 160 });
    expect(await linesOf(page)).toHaveLength(1);
    await expect(page.locator('[data-splice-line]')).toHaveCount(0);
  });

  test('does not offer a line the shape is already an end of', async ({ page }) => {
    await openDeck(page);
    const { a, b, c } = await chain(page);
    void b;
    // Join the third shape on, then drag it onto that same line: `a → c` with `c` dropped
    // on it would become `a → c` and `c → c`.
    await page.evaluate(
      async ([from, to]) => {
        const editor = (window as any).editor;
        await editor.executeCommand('insertConnector', { startNodeId: from, endNodeId: to });
        editor.setNode({ nodeIds: [] });
      },
      [a, c]
    );
    await page.waitForTimeout(400);
    const own = (await linesOf(page)).find((one) => one.to === c)!;

    const at = await middleOfLine(page, own.sid);
    await dragOnto(page, c, at, async () => {
      await expect(page.locator(`[data-splice-line="${own.sid}"]`)).toHaveCount(0);
    });
    // Still two lines: the one it was already part of, and the original chain.
    expect(await linesOf(page)).toHaveLength(2);
  });
});
