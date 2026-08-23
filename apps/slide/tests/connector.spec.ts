import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, attr } from './helpers';

/**
 * A line that remembers what it joins.
 *
 * The arithmetic — where a line leaves a circle, which magnets are nearest, how far a
 * curve's handles reach — is fifty tests in `office-word`'s `canvas-connector.test.ts`,
 * in milliseconds, because every one of those draws a *plausible* wrong picture.
 *
 * Three things only a browser can say, and they are the three here: two shapes can be
 * joined at all, the line **follows** when one of them is dragged, and deleting a
 * shape leaves the line where it was instead of taking it away.
 */
const twoShapes = async (page: Page) => {
  return page.evaluate(async () => {
    const editor = (window as any).editor;
    await editor.executeCommand('insertRectangle', { x: 1500, y: 1500, width: 3000, height: 1500 });
    const a = editor.selection?.nodeIds?.[0] as string;
    await editor.executeCommand('insertEllipse', { x: 9000, y: 6000, width: 3000, height: 1500 });
    const b = editor.selection?.nodeIds?.[0] as string;
    return [a, b] as [string, string];
  });
};

const join = async (page: Page, pair: [string, string]) => {
  await page.evaluate(async ([a, b]) => {
    const editor = (window as any).editor;
    // Selected in order, because a connector has a direction: the arrowhead is on the
    // end, and the order a reader picks the shapes in is the answer.
    editor.setNode({ nodeIds: [a, b] });
    await editor.executeCommand('insertConnector', {});
  }, pair);
  await page.waitForTimeout(500);
  return page.evaluate(() => (window as any).editor.selection?.nodeIds?.[0] as string);
};

test.describe('joining two shapes', () => {
  test('draws a line between them, and the button waits for two', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);

    // One shape selected: nothing to join it to.
    await page.evaluate((sid) => (window as any).editor.setNode({ nodeIds: [sid] }), pair[0]);
    await page.waitForTimeout(200);
    await expect(page.locator('[data-control="insert-connector"]')).toBeDisabled();

    const sid = await join(page, pair);
    expect(sid).toBeTruthy();

    /*
     * By class rather than by sid, and scoped to the stage. Every element a node's
     * template makes carries that node's sid — the `<svg>`, the `<g>`, both strokes and
     * the arrowhead are five — and the filmstrip draws the slide again, so the sid
     * alone matches ten things.
     */
    const line = page.locator('.sl-stage .sl-connector');
    await expect(line).toHaveCount(1);
    await expect(line).toHaveAttribute('data-connector-kind', 'elbow');
    await expect(line).toHaveAttribute('data-bc-sid', sid);
    expect(await attr(page, sid, 'startNodeId')).toBe(pair[0]);
    expect(await attr(page, sid, 'endNodeId')).toBe(pair[1]);

    // And the reaction has written where the ends *are*, which is what makes the line
    // survive a deletion later.
    expect(Number(await attr(page, sid, 'startX'))).toBeGreaterThan(0);
    expect(Number(await attr(page, sid, 'endX'))).toBeGreaterThan(0);
  });

  /**
   * The whole feature, in one assertion.
   *
   * A `line` remembers a place and would stay exactly where it was drawn; a connector
   * remembers the pair. Moving a shape is what a reader does for an hour when they
   * rearrange a flowchart, and this is the work that disappears.
   */
  test('follows the shape when it moves', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);

    /*
     * Asserted on the **drawing**, and it used to be asserted on the document — the
     * stored `endX` — which passed for the wrong reason. A reaction was rewriting those
     * numbers on every change, and that write was what made the view redraw the line at
     * all: take it away and the line stayed put. The route is derived, so it belongs to
     * the render (`connector-pass.ts`) and not to the document; what a reader sees is the
     * path, so that is what this measures.
     */
    const drawn = () =>
      page.locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"] path`).nth(1).getAttribute('d');
    const before = await drawn();

    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setBoxGeometry', { nodeIds: [id], x: 16000 }),
      pair[1]
    );
    await page.waitForTimeout(500);

    const after = await drawn();
    expect(after).not.toBe(before);
    // Out to where the shape went: the line's own end followed it across the slide.
    const endX = (d: string) => Number([...d.matchAll(/(-?\d+) -?\d+/g)].pop()![1]);
    expect(endX(after!) - endX(before!)).toBeGreaterThan(3000);

    /*
     * And the document did **not** change: the line moved, and nothing was written.
     * Which is the point of the pass — on a board two people share, a drag used to send
     * four numbers per line and give two writers something to disagree about.
     */
    expect(Number(await attr(page, sid, 'endX'))).toBe(9000);
  });

  test('stays where it was when a shape it held is deleted', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    const where = Number(await attr(page, sid, 'endX'));

    await page.evaluate(async (id) => {
      const editor = (window as any).editor;
      editor.setNode({ nodeIds: [id] });
      await editor.executeCommand('deleteBoxes', {});
    }, pair[1]);
    await page.waitForTimeout(500);

    // The line is still there — a diagram that quietly dropped it would be one a
    // reader cannot see the hole in — and it has let go of the shape that went.
    await expect(page.locator('.sl-stage .sl-connector')).toHaveCount(1);
    expect(await attr(page, sid, 'endNodeId')).toBeFalsy();
    expect(Number(await attr(page, sid, 'endX'))).toBe(where);

    /*
     * And it is **one** undo.
     *
     * The freezing and the releasing happen inside the deleting transaction, which is
     * the only moment the live position can still be read — and is what makes them part
     * of the reader's own entry. A line frozen by a reaction afterwards would need its
     * own undo, and undoing the deletion would leave the line let go of a shape that had
     * come back.
     */
    await page.evaluate(() => (window as any).editor.executeCommand('historyUndo'));
    await page.waitForTimeout(500);
    expect(await attr(page, sid, 'endNodeId')).toBe(pair[1]);
  });

  test('takes its route and its ends from the panel', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);

    const panel = page.locator('.sl-properties');
    await panel.getByLabel('경로').selectOption('curve');
    await page.waitForTimeout(300);
    expect(await attr(page, sid, 'kind')).toBe('curve');
    await expect(page.locator('.sl-stage .sl-connector')).toHaveAttribute(
      'data-connector-kind',
      'curve'
    );

    // A vocabulary, not a preference: a hollow triangle is UML's inheritance.
    await panel.getByLabel('끝 모양').selectOption('hollow');
    await page.waitForTimeout(300);
    expect(await attr(page, sid, 'endCap')).toBe('hollow');
  });
});

/**
 * Pulling a line out of a shape, and moving an end to another one.
 *
 * The other gesture every diagram tool offers, and the one a reader reaches for first:
 * the dots on a selected shape are magnets, and a line comes out of them. Only a
 * browser can say whether a drag that starts on a dot *stops the shape from moving* —
 * the dots sit on the shape, so the press has to be taken by the magnet and not by the
 * box under it.
 */
test.describe('pulling a line out of a magnet', () => {
  const drag = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  };

  const centreOf = async (page: Page, sid: string) => {
    const box = (await page.locator(`.sl-stage [data-bc-sid="${sid}"]`).first().boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  test('joins the shape the line is dropped on, and leaves the shape where it was', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    await page.evaluate((sid) => (window as any).editor.setNode({ nodeIds: [sid] }), pair[0]);
    await page.waitForTimeout(300);

    const before = await attr(page, pair[0], 'x');
    const magnet = page.locator('[data-magnet="e"]');
    await expect(magnet).toBeVisible();
    const dot = (await magnet.boundingBox())!;

    await drag(
      page,
      { x: dot.x + dot.width / 2, y: dot.y + dot.height / 2 },
      await centreOf(page, pair[1])
    );

    // A line, holding both shapes.
    const line = page.locator('.sl-stage .sl-connector');
    await expect(line).toHaveCount(1);
    const sid = await line.getAttribute('data-bc-sid');
    expect(await attr(page, sid!, 'startNodeId')).toBe(pair[0]);
    expect(await attr(page, sid!, 'endNodeId')).toBe(pair[1]);
    // And leaving from the side the reader took hold of, rather than wherever.
    expect(await attr(page, sid!, 'startSide')).toBe('e');

    // The press was the magnet's, not the shape's: a drag that moved the rectangle
    // instead would be the gesture the dots are drawn on top of.
    expect(await attr(page, pair[0], 'x')).toBe(before);
  });

  /**
   * Let go on nothing, and the **next shape** is there, joined.
   *
   * The gesture a flow chart is made of: drag out, let go, type. What a reader does not
   * do is place it, size it, match its fill, or find the tool that joins — which is why
   * this is one command and one undo rather than a shape and then a line.
   *
   * A free end is still reachable and by the gesture that means it: dragging an existing
   * end **off** the shape it holds (the test below).
   */
  test('grows the next shape where the line is dropped on nothing', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const before = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const slide = (root.content ?? []).find(
        (sid: string) => store.getNode(sid)?.stype === 'surface'
      );
      return ((store.getNode(slide)?.content ?? []) as string[]).length;
    });
    await page.evaluate((sid) => (window as any).editor.setNode({ nodeIds: [sid] }), pair[0]);
    await page.waitForTimeout(300);

    const stage = (await page.locator('.sl-stage').boundingBox())!;
    const dot = (await page.locator('[data-magnet="s"]').boundingBox())!;
    // Into empty space near the bottom-left of the slide, away from both shapes.
    await drag(
      page,
      { x: dot.x + dot.width / 2, y: dot.y + dot.height / 2 },
      { x: stage.x + stage.width * 0.2, y: stage.y + stage.height * 0.8 }
    );

    const made = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const slide = (root.content ?? []).find(
        (sid: string) => store.getNode(sid)?.stype === 'surface'
      );
      const kids = (store.getNode(slide)?.content ?? []) as string[];
      const line = kids.find((sid) => store.getNode(sid)?.stype === 'connector')!;
      const held = store.getNode(line)?.attributes?.endNodeId as string;
      const shape = store.getNode(held);
      return {
        count: kids.length,
        endNodeId: held,
        stype: shape?.stype as string,
        attrs: shape?.attributes as Record<string, number>,
        selected: (editor.selection?.nodeIds ?? []) as string[]
      };
    });

    // Two more things on the slide — the shape and the line — from one drag.
    expect(made.count).toBe(before + 2);
    // Joined to a real shape, not a free end.
    expect(made.endNodeId).toBeTruthy();
    // The same kind and size as the one it grew out of: a flow chart is a page of boxes
    // that match, and re-choosing the size for every step is the tool's work.
    expect(made.stype).toBe('rectangle');
    expect(made.attrs.width).toBe(3000);
    expect(made.attrs.height).toBe(1500);
    expect(made.attrs.fill).toBeDefined();
    // And the *shape* is selected, because what a reader does next is type.
    expect(made.selected).toEqual([made.endNodeId]);
  });

  test('is one undo, because it was one drag', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    await page.evaluate((sid) => (window as any).editor.setNode({ nodeIds: [sid] }), pair[0]);
    await page.waitForTimeout(300);

    const count = () =>
      page.evaluate(() => {
        const editor = (window as any).editor;
        const store = editor.dataStore;
        const root = store.getNode(editor.getRootId());
        const slide = (root.content ?? []).find(
          (sid: string) => store.getNode(sid)?.stype === 'surface'
        );
        return ((store.getNode(slide)?.content ?? []) as string[]).length;
      });

    const before = await count();
    const stage = (await page.locator('.sl-stage').boundingBox())!;
    const dot = (await page.locator('[data-magnet="e"]').boundingBox())!;
    await drag(
      page,
      { x: dot.x + dot.width / 2, y: dot.y + dot.height / 2 },
      { x: stage.x + stage.width * 0.5, y: stage.y + stage.height * 0.85 }
    );
    expect(await count()).toBe(before + 2);

    // `historyUndo`, which is the command the ribbon runs — `editor.undo()` is not the
    // door a reader comes through.
    await page.evaluate(() => (window as any).editor.executeCommand('historyUndo'));
    await page.waitForTimeout(500);
    // Both back, on one press: a shape without its line would be half a gesture undone.
    expect(await count()).toBe(before);
  });

  test('moves an end onto another shape, and lets go of the old one', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const third = await page.evaluate(async () => {
      const editor = (window as any).editor;
      await editor.executeCommand('insertRectangle', { x: 1500, y: 7000, width: 2500, height: 1200 });
      return editor.selection?.nodeIds?.[0] as string;
    });
    const sid = await join(page, pair);

    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), sid);
    await page.waitForTimeout(300);

    const handle = page.locator('[data-conn-end="end"]');
    await expect(handle).toBeVisible();
    const grip = (await handle.boundingBox())!;
    await drag(
      page,
      { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 },
      await centreOf(page, third)
    );

    // Attached to the third shape now, and only to it.
    expect(await attr(page, sid, 'endNodeId')).toBe(third);
    expect(await attr(page, sid, 'startNodeId')).toBe(pair[0]);
  });
});

/**
 * Going around what is in the way.
 *
 * The candidate search and the "clean and shortest" rule are unit tests; what only a
 * browser shows is that the **drawing** uses them — that the route on screen is the one
 * that avoids the box, and that it changes when the box moves into the way.
 */
test.describe('a line that gets past what is between', () => {
  test('routes around a shape put in its path, and back when it leaves', async ({ page }) => {
    await openDeck(page);
    /*
     * On a **cleared** slide, and that is worth saying out loud: the sample slide's
     * title and body placeholders are shapes too, and they cover most of it. A route
     * between two boxes inside them cannot avoid everything, so the router keeps the
     * direct line — correctly, and the drawing does not change. Measured that way
     * first, with a probe on the renderer that counted the obstacles it saw: three, and
     * the line still straight.
     */
    const pair = await page.evaluate(async () => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const slide = (root.content ?? []).find(
        (sid: string) => store.getNode(sid)?.stype === 'surface'
      );
      const already = (store.getNode(slide)?.content ?? []) as string[];
      if (already.length > 0) {
        editor.setNode({ nodeIds: already });
        await editor.executeCommand('deleteBoxes', {});
      }
      await editor.executeCommand('insertRectangle', { x: 1000, y: 4000, width: 2000, height: 1200 });
      const a = editor.selection?.nodeIds?.[0] as string;
      await editor.executeCommand('insertRectangle', { x: 12000, y: 4000, width: 2000, height: 1200 });
      const b = editor.selection?.nodeIds?.[0] as string;
      return [a, b] as [string, string];
    });
    await join(page, pair);

    const pathOf = () =>
      page.locator('.sl-stage .sl-connector path').nth(1).getAttribute('d');
    const straightRun = (await pathOf())!;
    // Both shapes at the same height, so the line runs level between them.
    expect(straightRun.split('L').length).toBeLessThanOrEqual(4);

    // Now put something squarely in the way.
    const wall = await page.evaluate(async () => {
      const editor = (window as any).editor;
      await editor.executeCommand('insertRectangle', { x: 6000, y: 3000, width: 1200, height: 3200 });
      return editor.selection?.nodeIds?.[0] as string;
    });
    await page.waitForTimeout(600);

    const around = (await pathOf())!;
    expect(around).not.toBe(straightRun);
    /*
     * Above or below it: the route now has corners the level run did not, and every
     * one of them is outside the wall's own span. Asserted on the *drawing* rather
     * than on the model, because nothing about a route is stored — it is computed from
     * the shapes every time, which is what makes it follow them.
     */
    const ys = [...around.matchAll(/[ML] -?\d+ (-?\d+)/g)].map((match) => Number(match[1]));
    expect(Math.min(...ys) < 3000 || Math.max(...ys) > 6200).toBe(true);

    // And out of the way again: the route goes back to the level run.
    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setBoxGeometry', { nodeIds: [id], y: 15000 }),
      wall
    );
    await page.waitForTimeout(600);
    expect(await pathOf()).toBe(straightRun);
  });
});

/**
 * A line attached to a line.
 *
 * A flowchart's branch off the middle of a flow, which is the one attachment a magnet
 * cannot describe: a line has no sides. What only a browser shows is that dropping an
 * end **on** another line attaches it there — and that the end then *follows* that line
 * when the shapes underneath it move.
 */
test.describe('branching off a line', () => {
  test('attaches an end to another line, and follows it', async ({ page }) => {
    await openDeck(page);
    const shapes = await page.evaluate(async () => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const slide = (root.content ?? []).find(
        (sid: string) => store.getNode(sid)?.stype === 'surface'
      );
      const already = (store.getNode(slide)?.content ?? []) as string[];
      if (already.length > 0) {
        editor.setNode({ nodeIds: already });
        await editor.executeCommand('deleteBoxes', {});
      }
      const made: string[] = [];
      for (const at of [
        { x: 1000, y: 1000, width: 2500, height: 1200 },
        { x: 12000, y: 1000, width: 2500, height: 1200 },
        { x: 6000, y: 7000, width: 2500, height: 1200 }
      ]) {
        await editor.executeCommand('insertRectangle', at);
        made.push(editor.selection?.nodeIds?.[0] as string);
      }
      return made;
    });

    // The flow across the top, then a branch pulled out of the shape below it.
    const flow = await join(page, [shapes[0], shapes[1]]);
    await page.evaluate((sid) => (window as any).editor.setNode({ nodeIds: [sid] }), shapes[2]);
    await page.waitForTimeout(300);

    const dot = (await page.locator('[data-magnet="n"]').boundingBox())!;
    const line = (await page.locator(`.sl-stage [data-bc-sid="${flow}"]`).first().boundingBox())!;
    await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
    await page.mouse.down();
    // Onto the middle of the flow's own path, which for a level elbow is the middle of
    // its box — the box is mostly empty, so the drop has to be near the *line*.
    await page.mouse.move(line.x + line.width / 2, line.y + line.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const branch = await page.evaluate((flowSid) => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const slide = (root.content ?? []).find(
        (sid: string) => store.getNode(sid)?.stype === 'surface'
      );
      const lines = ((store.getNode(slide)?.content ?? []) as string[]).filter(
        (sid) => store.getNode(sid)?.stype === 'connector' && sid !== flowSid
      );
      const node = store.getNode(lines[0]);
      return { sid: lines[0], attrs: node?.attributes };
    }, flow);

    // Held by the *line*, at a fraction along it — the attachment a magnet cannot say.
    expect(branch.attrs.endNodeId).toBe(flow);
    expect(typeof branch.attrs.endT).toBe('number');
    expect(branch.attrs.endT).toBeGreaterThan(0.2);
    expect(branch.attrs.endT).toBeLessThan(0.8);

    /*
     * And it follows: moving a shape the *flow* holds moves the flow, and the branch's
     * end is a fraction along the flow — so the branch has to move too. Nothing about
     * this is stored, which is why it works.
     */
    const drawn = () =>
      page.locator(`.sl-stage [data-bc-sid="${branch.sid}"]`).first().getAttribute('d');
    const before = await page
      .locator(`.sl-stage .sl-connector[data-bc-sid="${branch.sid}"] path`)
      .nth(1)
      .getAttribute('d');
    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setBoxGeometry', { nodeIds: [id], y: 4000 }),
      shapes[1]
    );
    await page.waitForTimeout(600);
    const after = await page
      .locator(`.sl-stage .sl-connector[data-bc-sid="${branch.sid}"] path`)
      .nth(1)
      .getAttribute('d');
    expect(after).not.toBe(before);
    void drawn;

    /*
     * And taken **off** the line again.
     *
     * The case that found a hole in the model: a fraction is a number, `0` is a real
     * place on a line, and there was no value that meant "not set" — so the drag
     * returned false and did nothing at all. `setAttrs` removes an attribute given
     * `null` now, for every type.
     */
    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), branch.sid);
    await page.waitForTimeout(300);
    const grip = (await page.locator('[data-conn-end="end"]').boundingBox())!;
    const shape = (await page
      .locator(`.sl-stage [data-bc-sid="${shapes[0]}"]`)
      .first()
      .boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(shape.x + shape.width / 2, shape.y + shape.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    expect(await attr(page, branch.sid, 'endNodeId')).toBe(shapes[0]);
    // Gone, not left behind as a stale number under a shape attachment.
    expect(await attr(page, branch.sid, 'endT')).toBeFalsy();
  });
});

/**
 * The word on the line.
 *
 * A flowchart without them is a picture of boxes: "yes", "no", "1..n", "on failure".
 * The pill's size is estimated from the characters (SVG cannot measure text before it
 * draws it), which is unit-tested — what a browser shows is that the label is drawn on
 * the line, travels with it, and can be taken off again.
 */
test.describe('a label on a line', () => {
  /**
   * Typed on the line itself.
   *
   * The same gesture as everything else on this canvas — the first click says which
   * thing, the second says "work on what is in it" — and naming a relationship in a
   * side panel means looking away from the diagram to do it.
   */
  test('is typed where it will be, by double-clicking the line', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);

    const line = page.locator('.sl-stage .sl-connector');
    const box = (await line.boundingBox())!;
    // On the line, not in the middle of its box — most of that box is empty.
    const route = await page
      .locator('.sl-stage .sl-connector path')
      .nth(1)
      .getAttribute('d');
    const corner = route!.match(/L (-?\d+) (-?\d+)/)!;
    void corner;
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);

    const field = page.locator('[data-label-edit]');
    await expect(field).toBeVisible();
    await field.fill('아니오');
    await field.press('Enter');
    await page.waitForTimeout(400);

    expect(await attr(page, sid, 'label')).toBe('아니오');
    await expect(page.locator('[data-label-edit]')).toHaveCount(0);
    await expect(page.locator('.sl-stage .sl-connector [data-connector-label]')).toHaveText('아니오');
  });

  test('is typed in the panel, drawn on the line, and can be cleared', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), sid);
    await page.waitForTimeout(300);

    /*
     * `exact`, because 이름표 now names four controls: the word itself and the three that
     * set it (크기, 색, 굵게). An accessible name is matched by substring unless it is
     * not, and this test had been unique only for as long as the label had no type of its
     * own — the same trap the frame spec records for 프레임.
     */
    const field = page.locator('.sl-properties').getByLabel('이름표', { exact: true });
    await field.fill('예');
    await field.blur();
    await page.waitForTimeout(400);

    expect(await attr(page, sid, 'label')).toBe('예');
    const drawn = page.locator('.sl-stage .sl-connector [data-connector-label]');
    await expect(drawn).toHaveText('예');

    // On the line, not beside it: the label's box has to contain the route's middle.
    const line = (await page.locator('.sl-stage .sl-connector').boundingBox())!;
    const pill = (await drawn.boundingBox())!;
    expect(pill.x).toBeGreaterThanOrEqual(line.x - 1);
    expect(pill.x + pill.width).toBeLessThanOrEqual(line.x + line.width + 1);

    // And it travels: moving a shape moves the line, and the label with it.
    const before = pill.x;
    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setBoxGeometry', { nodeIds: [id], x: 20000 }),
      pair[1]
    );
    await page.waitForTimeout(500);
    expect((await drawn.boundingBox())!.x).toBeGreaterThan(before);

    // Emptied means no label, which is why an empty string is not "no change".
    await field.fill('');
    await field.blur();
    await page.waitForTimeout(400);
    expect(await attr(page, sid, 'label')).toBeFalsy();
    await expect(page.locator('.sl-stage .sl-connector [data-connector-label]')).toHaveCount(0);
  });
});

/**
 * Two lines between the same pair of shapes.
 *
 * Routed identically, they are drawn one on top of the other: the reader sees one line,
 * cannot tell there are two, and cannot select the one underneath. A broken state rather
 * than a styling choice — so the drawing fans them, and the document says nothing.
 */
test.describe('more than one line between two shapes', () => {
  test('fans them apart, and keeps a bow the reader set', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);

    const first = await join(page, pair);
    const pathOf = (sid: string) =>
      page.locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"] path`).nth(1).getAttribute('d');
    const alone = (await pathOf(first))!;

    // A second line between the same two shapes, the other way round — which is still
    // "between these two", and still one line on top of another if nothing fans them.
    const second = await page.evaluate(async ([a, b]) => {
      const editor = (window as any).editor;
      editor.setNode({ nodeIds: [b, a] });
      await editor.executeCommand('insertConnector', {});
      return editor.selection?.nodeIds?.[0] as string;
    }, pair);
    await page.waitForTimeout(600);

    const one = (await pathOf(first))!;
    const other = (await pathOf(second))!;
    expect(one).not.toBe(other);
    // And the first has moved: they fan either side of where a single line would run,
    // rather than one staying put and looking like the main one.
    expect(one).not.toBe(alone);

    // A bow the reader sets is not overruled — the same rule as a magnet they chose.
    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setConnector', { nodeIds: [id], bend: 3000 }),
      second
    );
    await page.waitForTimeout(500);
    const bowed = (await pathOf(second))!;
    expect(bowed).not.toBe(other);
    /*
     * Along the axis the bow actually moves. These two shapes are joined east-to-west,
     * so an elbow's bow slides its middle **sideways** — asserted on y first, which was
     * the wrong axis and a reminder that a bow is not a direction.
     */
    /*
     * The **corner's** x, not the largest in the path: this line runs right to left, so
     * its own start is the biggest number in it and a max hides the whole change.
     */
    const cornerX = (d: string) => Number(d.match(/L (-?\d+)/)![1]);
    expect(Math.abs(cornerX(bowed) - cornerX(other))).toBeGreaterThan(1000);

    // And the first line is where the fan put it: two bows are independent.
    expect(await pathOf(first)).toBe(one);
  });
});

/**
 * Bending a line by its middle.
 *
 * The `bend` field in the panel is a number a reader has to imagine; the grip is the
 * gesture. What only a browser shows is that the grip sits **on** the part of the route
 * a bow moves — a grip anywhere else runs away from the pointer the moment it is
 * dragged — and that the drag reads as a slide along the one axis that can change.
 */
test.describe('bending a line by its middle', () => {
  test('slides the route, and the grip follows it', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), sid);
    await page.waitForTimeout(300);

    const grip = page.locator('[data-conn-bend]');
    await expect(grip).toBeVisible();
    const at = (await grip.boundingBox())!;

    // On the line: the grip's centre has to be a point of the drawn route.
    const corner = (await page
      .locator('.sl-stage .sl-connector path')
      .nth(1)
      .getAttribute('d'))!.match(/L (-?\d+) (-?\d+)/)!;
    expect(Number(corner[1])).toBeGreaterThan(0);

    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2 + 120, at.y + at.height / 2 + 90, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // A bow was written, in the axis that moves — these shapes are joined east to west,
    // so the sideways part of the drag is the bow and the vertical part is dropped.
    const bend = Number(await attr(page, sid, 'bend'));
    expect(Math.abs(bend)).toBeGreaterThan(600);

    // And the grip moved with the line rather than staying where it was pressed.
    const after = (await grip.boundingBox())!;
    expect(Math.abs(after.x - at.x)).toBeGreaterThan(40);
  });

  test('has no grip where there is nothing to slide', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);

    /*
     * An elbow with a single corner — one end leaving sideways and the other up or down
     * — has its corner where its two sides meet. A drag there would mean nothing, so
     * there is no grip to start one.
     */
    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setConnector', {
          nodeIds: [id],
          startSide: 'e',
          endSide: 'n'
        }),
      sid
    );
    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), sid);
    await page.waitForTimeout(400);

    await expect(page.locator('[data-conn-bend]')).toHaveCount(0);
    // The ends are still there: it is the bow that has nowhere to go, not the line.
    await expect(page.locator('[data-conn-end="end"]')).toBeVisible();
  });
});

/**
 * The arc — the route with no magnets.
 *
 * A curve leaves along a side's normal; an arc places its control point first and clips
 * each end **towards** it, so the line points at the shape however the shape is turned.
 * The arithmetic is unit-tested; what a browser shows is that the drawing is one
 * quadratic, that the label and the grip sit **on** the curve rather than beside it, and
 * that a rotated shape still gets a line aimed at it.
 */
test.describe('an arc', () => {
  test('draws one quadratic, and keeps its label and grip on the curve', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);

    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setConnector', { nodeIds: [id], kind: 'arc', label: '활' }),
      sid
    );
    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), sid);
    await page.waitForTimeout(500);

    const d = (await page.locator('.sl-stage .sl-connector path').nth(1).getAttribute('d'))!;
    // One control point: `M … Q … …`, not a chain of `L`s and not a cubic.
    expect(d).toMatch(/^M -?\d+ -?\d+ Q -?\d+ -?\d+ -?\d+ -?\d+$/);

    /*
     * The label and the grip are both placed on the **track** — the flattened curve — so
     * they land on the same point: the quadratic's own midpoint. A control point is
     * twice as far out as the curve ever goes, so placing either on the *route* would
     * float it off the line by exactly that much, and they would not agree.
     */
    const numbers = [...d.matchAll(/(-?\d+) (-?\d+)/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2])
    }));
    const [start, control, finish] = numbers;
    const onCurve = {
      x: (start.x + 2 * control.x + finish.x) / 4,
      y: (start.y + 2 * control.y + finish.y) / 4
    };
    // The curve's middle is not its control point — which is the whole reason the two
    // are different words.
    expect(Math.hypot(control.x - onCurve.x, control.y - onCurve.y)).toBeGreaterThan(100);

    const line = (await page.locator('.sl-stage .sl-connector').boundingBox())!;
    // Scoped to the stage: the filmstrip draws the slide again, so an unscoped label
    // locator matches two.
    const pill = (await page.locator('.sl-stage [data-connector-label]').boundingBox())!;
    const grip = (await page.locator('[data-conn-bend]').boundingBox())!;
    const centre = (b: { x: number; y: number; width: number; height: number }) => ({
      x: b.x + b.width / 2,
      y: b.y + b.height / 2
    });
    // Same place, within a handle's width: both are the curve's midpoint.
    expect(Math.hypot(centre(pill).x - centre(grip).x, centre(pill).y - centre(grip).y)).toBeLessThan(20);
    // And on the line rather than beside it.
    expect(centre(pill).x).toBeGreaterThan(line.x);
    expect(centre(pill).x).toBeLessThan(line.x + line.width);
  });

  test('aims at a rotated shape, which is what it is for', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setConnector', { nodeIds: [id], kind: 'arc' }),
      sid
    );
    await page.waitForTimeout(400);
    const before = (await page.locator('.sl-stage .sl-connector path').nth(1).getAttribute('d'))!;

    // Turn the shape the line arrives at: the end has to move round its outline.
    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setBoxGeometry', { nodeIds: [id], rotation: 45 }),
      pair[1]
    );
    await page.waitForTimeout(500);
    const after = (await page.locator('.sl-stage .sl-connector path').nth(1).getAttribute('d'))!;
    expect(after).not.toBe(before);
  });
});

/**
 * A line that flows.
 *
 * The pattern and its period are unit-tested. What only a browser shows is the part that
 * matters: the **animation actually runs** — it is CSS, so it survives being cloned into
 * the presenting view — and the offset it travels is one period of the line's own
 * pattern, so the loop has no seam.
 */
test.describe('a flowing line', () => {
  test('runs a CSS animation, dashed even when the line is solid', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);

    const stroke = page.locator('.sl-stage .sl-connector path').nth(1);
    // Solid to begin with: no pattern at all.
    expect(await stroke.getAttribute('stroke-dasharray')).toBeFalsy();

    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setConnector', { nodeIds: [id], flow: true }),
      sid
    );
    await page.waitForTimeout(500);

    // Dashed now, because a flow is dashes travelling and a solid line has none.
    const pattern = await stroke.getAttribute('stroke-dasharray');
    expect(pattern).toBeTruthy();

    const state = await stroke.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        name: style.animationName,
        period: style.getPropertyValue('--sl-flow').trim(),
        running: style.animationPlayState
      };
    });
    expect(state.name).toBe('sl-conn-flow');
    expect(state.running).toBe('running');
    // One period of *this* line's pattern: a fixed distance would judder on a line of
    // another weight.
    const sum = pattern!
      .split(/\s+/)
      .map(Number)
      .reduce((total, piece) => total + piece, 0);
    expect(Number(state.period)).toBe(Math.round(sum));

    // And off again, back to a plain solid line.
    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setConnector', { nodeIds: [id], flow: false }),
      sid
    );
    await page.waitForTimeout(400);
    expect(await stroke.getAttribute('stroke-dasharray')).toBeFalsy();
    expect(await stroke.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });

  test('is switched on from the panel', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), sid);
    await page.waitForTimeout(300);

    await page.locator('.sl-properties').getByLabel('흐름').check();
    await page.waitForTimeout(400);
    expect(await attr(page, sid, 'flow')).toBeTruthy();
  });
});

/**
 * Two things a line has to survive: being **grouped** and being **copied**.
 *
 * Both were broken, and both are the same shape of fault — an identity or a coordinate
 * that means one thing where it was written and another where it is read.
 */
test.describe('a line through the rest of the editor', () => {
  const clearSlide = (page: Page) =>
    page.evaluate(async () => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const slide = (root.content ?? []).find(
        (sid: string) => store.getNode(sid)?.stype === 'surface'
      );
      const already = (store.getNode(slide)?.content ?? []) as string[];
      if (already.length > 0) {
        editor.setNode({ nodeIds: already });
        await editor.executeCommand('deleteBoxes', {});
      }
      return slide as string;
    });

  test('follows a shape that is put into a group', async ({ page }) => {
    await openDeck(page);
    await clearSlide(page);
    const shapes = await page.evaluate(async () => {
      const editor = (window as any).editor;
      const made: string[] = [];
      for (const at of [
        { x: 1000, y: 1000, width: 2000, height: 1000 },
        { x: 9000, y: 6000, width: 2000, height: 1000 },
        { x: 9000, y: 1000, width: 1500, height: 800 }
      ]) {
        await editor.executeCommand('insertRectangle', at);
        made.push(editor.selection?.nodeIds?.[0] as string);
      }
      return made;
    });
    const sid = await join(page, [shapes[0], shapes[1]]);
    const before = Number(await attr(page, sid, 'endX'));

    // Grouping rewrites the shape's coordinates into the group's space. A line that
    // read them as the slide's drew to a point a group's width away from the shape.
    await page.evaluate(async ([b, c]) => {
      const editor = (window as any).editor;
      editor.setNode({ nodeIds: [b, c] });
      await editor.executeCommand('groupBoxes', {});
    }, [shapes[1], shapes[2]]);
    await page.waitForTimeout(600);

    const after = Number(await attr(page, sid, 'endX'));
    // Still out at the shape rather than back at the top-left of the slide.
    expect(after).toBeGreaterThan(before - 1500);
    expect(after).toBeGreaterThan(5000);
  });

  test('is copied joined to the copies, not to the originals', async ({ page }) => {
    await openDeck(page);
    await clearSlide(page);
    const pair = await page.evaluate(async () => {
      const editor = (window as any).editor;
      await editor.executeCommand('insertRectangle', { x: 1000, y: 1000, width: 2000, height: 1000 });
      const a = editor.selection?.nodeIds?.[0] as string;
      await editor.executeCommand('insertRectangle', { x: 9000, y: 6000, width: 2000, height: 1000 });
      const b = editor.selection?.nodeIds?.[0] as string;
      return [a, b] as [string, string];
    });
    const sid = await join(page, pair);

    const pasted = await page.evaluate(async ([a, b, line]) => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      editor.setNode({ nodeIds: [a, b, line] });
      await editor.executeCommand('copyBoxes', {});
      await editor.executeCommand('pasteBoxes', {});
      await new Promise((r) => setTimeout(r, 400));
      const root = store.getNode(editor.getRootId());
      const slide = (root.content ?? []).find(
        (sid: string) => store.getNode(sid)?.stype === 'surface'
      );
      const kids = (store.getNode(slide)?.content ?? []) as string[];
      return kids.map((child) => {
        const node = store.getNode(child);
        return {
          sid: child,
          stype: node?.stype as string,
          start: node?.attributes?.startNodeId as string | undefined,
          end: node?.attributes?.endNodeId as string | undefined
        };
      });
    }, [pair[0], pair[1], sid]);

    const lines = pasted.filter((node) => node.stype === 'connector');
    expect(lines).toHaveLength(2);
    // The copy is joined to the copies: two sets of shapes, one line each. Before this,
    // both lines pointed at the first set.
    const copy = lines.find((line) => line.sid !== sid)!;
    expect(copy.start).not.toBe(pair[0]);
    expect(copy.end).not.toBe(pair[1]);
    const shapes = pasted.filter((node) => node.stype === 'rectangle').map((node) => node.sid);
    expect(shapes).toContain(copy.start);
    expect(shapes).toContain(copy.end);
  });

  test('is duplicated joined to the duplicates', async ({ page }) => {
    await openDeck(page);
    await clearSlide(page);
    const pair = await page.evaluate(async () => {
      const editor = (window as any).editor;
      await editor.executeCommand('insertRectangle', { x: 1000, y: 1000, width: 2000, height: 1000 });
      const a = editor.selection?.nodeIds?.[0] as string;
      await editor.executeCommand('insertRectangle', { x: 9000, y: 6000, width: 2000, height: 1000 });
      const b = editor.selection?.nodeIds?.[0] as string;
      return [a, b] as [string, string];
    });
    const sid = await join(page, pair);

    const copies = await page.evaluate(async ([a, b, line]) => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      editor.setNode({ nodeIds: [a, b, line] });
      await editor.executeCommand('duplicateBoxes', {});
      await new Promise((r) => setTimeout(r, 400));
      const made = (editor.selection?.nodeIds ?? []) as string[];
      return made.map((child) => {
        const node = store.getNode(child);
        return {
          sid: child,
          stype: node?.stype as string,
          start: node?.attributes?.startNodeId as string | undefined
        };
      });
    }, [pair[0], pair[1], sid]);

    const line = copies.find((node) => node.stype === 'connector')!;
    expect(line.start).not.toBe(pair[0]);
    expect(copies.map((node) => node.sid)).toContain(line.start);
  });
});

/**
 * Bends a reader places, and why they live in the document when the route does not.
 *
 * A route is derived — it follows from the shapes and what is in the way. A **waypoint**
 * is the opposite: there is nothing to work a hand-placed bend out from, and a reader who
 * has routed a line around a table they will move later means that route to stay.
 *
 * The gesture is draw.io's, which is the one readers know: a small mark in the middle of
 * each run, and dragging it bends the line there.
 */
test.describe('bends a reader places', () => {
  const gripDrag = async (
    page: Page,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  };

  test('adds one from the middle of a run, and the line goes through it', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), sid);
    await page.waitForTimeout(300);

    const grips = page.locator('[data-conn-seg]');
    await expect(await grips.count()).toBeGreaterThan(0);
    const grip = (await grips.first().boundingBox())!;
    const stage = (await page.locator('.sl-stage').boundingBox())!;

    await gripDrag(
      page,
      { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 },
      { x: stage.x + stage.width * 0.3, y: stage.y + stage.height * 0.8 }
    );

    const placed = await page.evaluate(
      (id) => (window as any).editor.dataStore.getNode(id)?.attributes?.waypoints,
      sid
    );
    expect(placed).toHaveLength(1);

    // And the drawn line turns there: a bend nobody can see is a bend that did nothing.
    const d = (await page
      .locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"] path`)
      .nth(1)
      .getAttribute('d'))!;
    const ys = [...d.matchAll(/-?\d+ (-?\d+)/g)].map((match) => Number(match[1]));
    expect(Math.max(...ys)).toBeGreaterThan(placed[0].y - 200);

    // A handle of its own now, so it can be moved or taken away.
    await expect(page.locator('[data-conn-wp="0"]')).toBeVisible();
  });

  test('moves one, and takes it away on a double press', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setConnector', {
          nodeIds: [id],
          waypoints: [{ x: 6000, y: 7000 }]
        }),
      sid
    );
    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), sid);
    await page.waitForTimeout(400);

    const handle = page.locator('[data-conn-wp="0"]');
    await expect(handle).toBeVisible();
    const at = (await handle.boundingBox())!;
    await gripDrag(
      page,
      { x: at.x + at.width / 2, y: at.y + at.height / 2 },
      { x: at.x + at.width / 2 + 90, y: at.y + at.height / 2 - 60 }
    );

    const moved = await page.evaluate(
      (id) => (window as any).editor.dataStore.getNode(id)?.attributes?.waypoints,
      sid
    );
    expect(moved).toHaveLength(1);
    expect(moved[0].x).not.toBe(6000);

    /*
     * Two presses take it away, which is the only way back from a bend a reader no longer
     * wants: dragging it onto the straight line would be a guess about what "straight
     * enough" means.
     */
    await page.locator('[data-conn-wp="0"]').dblclick();
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(
        (id) => (window as any).editor.dataStore.getNode(id)?.attributes?.waypoints,
        sid
      )
    ).toEqual([]);
  });

  test('stops routing around things, because the reader has said where it goes', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);

    // A wall across the middle, and a bend placed straight through it.
    await page.evaluate(async ([id]) => {
      const editor = (window as any).editor;
      await editor.executeCommand('insertRectangle', {
        x: 6000,
        y: 0,
        width: 1200,
        height: 8000
      });
      await editor.executeCommand('setConnector', {
        nodeIds: [id],
        waypoints: [{ x: 6600, y: 4000 }]
      });
    }, [sid]);
    await page.waitForTimeout(500);

    const d = (await page
      .locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"] path`)
      .nth(1)
      .getAttribute('d'))!;
    // Through the point they chose, wall or no wall: a router overruling a placed bend is
    // a control that does not work.
    expect(d).toContain('6600');
  });

  test('says how many there are, and gives them all back', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setConnector', {
          nodeIds: [id],
          waypoints: [
            { x: 5000, y: 7000 },
            { x: 8000, y: 7000 }
          ]
        }),
      sid
    );
    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), sid);
    await page.waitForTimeout(400);

    // A line with a bend hidden behind a shape looks like a line with none, so the panel
    // says the count.
    await expect(page.locator('.sl-properties .sl-wp-count')).toHaveText('2개');
    await page.locator('[data-wp-clear]').click();
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(
        (id) => (window as any).editor.dataStore.getNode(id)?.attributes?.waypoints,
        sid
      )
    ).toEqual([]);
  });
});

/**
 * Turning a line round.
 *
 * A connector is a relationship and a relationship has a direction — the arrowhead is on
 * the end. Drawn the wrong way round, which happens whenever a reader picks the two shapes
 * in the order they were thinking of them, the ways back were deleting the line and
 * drawing it again, or dragging both ends past each other.
 */
test.describe('turning a line round', () => {
  test('swaps the ends from the panel, and the drawing follows', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), sid);
    await page.waitForTimeout(300);

    const before = (await page
      .locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"] path`)
      .nth(1)
      .getAttribute('d'))!;

    await page.locator('[data-conn-reverse]').click();
    await page.waitForTimeout(500);

    expect(await attr(page, sid, 'startNodeId')).toBe(pair[1]);
    expect(await attr(page, sid, 'endNodeId')).toBe(pair[0]);

    // The line is drawn the other way: a swap the drawing did not follow would be a
    // relationship that says one thing in the document and another on the slide.
    const after = (await page
      .locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"] path`)
      .nth(1)
      .getAttribute('d'))!;
    expect(after).not.toBe(before);
    const startOf = (d: string) => d.match(/^M (-?\d+) (-?\d+)/)!.slice(1).join(',');
    expect(startOf(after)).not.toBe(startOf(before));
  });

  test('moves the arrowhead to the other shape', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), sid);
    await page.waitForTimeout(300);

    /*
     * The whole visible point of the command, and the assertion that caught me writing it
     * the wrong way: reversing must move the arrowhead **to the other shape**. Swapping the
     * cap attributes as well as the ends leaves every cap on the shape it was already on,
     * and a reader watching sees nothing happen.
     */
    const tip = async () => {
      const d = (await page
        .locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"] path`)
        .last()
        .getAttribute('d'))!;
      const at = d.match(/^M (-?\d+) (-?\d+)/)!;
      return { x: Number(at[1]), y: Number(at[2]) };
    };

    const before = await tip();
    await page.locator('[data-conn-reverse]').click();
    await page.waitForTimeout(500);
    const after = await tip();

    // Far apart: the two shapes are at opposite corners of the slide.
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(3000);
  });
});

/**
 * Two lines that cross.
 *
 * A crossing with no hop is ambiguous: a reader cannot tell whether one flow **branches**
 * into another or merely passes it. What only a browser shows is that exactly *one* of the
 * two carries the hop — a renderer asking "does anything cross me?" would draw two at one
 * crossing, which reads as a broken line — and that the hop is in the drawn path rather
 * than in the document.
 */
test.describe('where two lines cross', () => {
  /** Two lines across each other: left-to-right, and top-to-bottom through it. */
  const crossing = async (page: Page) =>
    page.evaluate(async () => {
      const editor = (window as any).editor;
      const made: Record<string, string> = {};
      const box = async (name: string, x: number, y: number) => {
        await editor.executeCommand('insertRectangle', { x, y, width: 1800, height: 1000 });
        made[name] = editor.selection?.nodeIds?.[0] as string;
      };
      await box('left', 600, 4500);
      await box('right', 14000, 4500);
      await box('top', 7000, 600);
      await box('bottom', 7000, 8600);

      const join = async (from: string, to: string) => {
        await editor.executeCommand('insertConnector', {
          startNodeId: made[from],
          endNodeId: made[to],
          kind: 'straight'
        });
        return editor.selection?.nodeIds?.[0] as string;
      };
      const first = await join('left', 'right');
      const second = await join('top', 'bottom');
      editor.setNode({ nodeIds: [] });
      return { first, second };
    });

  const drawn = async (page: Page, sid: string) =>
    (await page
      .locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"] path`)
      .nth(1)
      .getAttribute('d'))!;

  test('the later line hops over the earlier one, and only it', async ({ page }) => {
    await openDeck(page);
    const { first, second } = await crossing(page);
    await page.waitForTimeout(600);

    // `A` is the arc command: one hop, on the line drawn on top.
    expect(await drawn(page, second)).toContain('A ');
    expect(await drawn(page, first)).not.toContain('A ');
  });

  test('draws exactly one hop for one crossing', async ({ page }) => {
    await openDeck(page);
    const { second } = await crossing(page);
    await page.waitForTimeout(600);

    const d = await drawn(page, second);
    expect(d.match(/A /g)).toHaveLength(1);
  });

  test('keeps it out of the document, because a crossing is not a decision', async ({ page }) => {
    await openDeck(page);
    const { second } = await crossing(page);
    await page.waitForTimeout(600);

    /*
     * The route is derived and so is the hop (§8.11): nothing about the crossing is
     * written down. Which is what lets it *disappear* when a shape moves — the next
     * assertion.
     */
    const attrs = await page.evaluate(
      (sid) => (window as any).editor.dataStore.getNode(sid).attributes,
      second
    );
    expect(Object.keys(attrs)).not.toContain('jumps');
  });

  test('goes away when the lines no longer cross', async ({ page }) => {
    await openDeck(page);
    const { second } = await crossing(page);
    await page.waitForTimeout(600);
    expect(await drawn(page, second)).toContain('A ');

    // Move the vertical line's shapes clear of the horizontal one.
    await page.evaluate(async (sid) => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const line = store.getNode(sid);
      await editor.executeCommand('setBoxGeometry', {
        nodeId: line.attributes.startNodeId,
        x: 200,
        y: 200
      });
      await editor.executeCommand('setBoxGeometry', {
        nodeId: line.attributes.endNodeId,
        x: 200,
        y: 2400
      });
    }, second);
    await page.waitForTimeout(700);

    // Nothing crosses now, so there is nothing to hop over — and no document write had to
    // be undone for that to be true.
    expect(await drawn(page, second)).not.toContain('A ');
  });
});

/**
 * How the label is set.
 *
 * A diagram's words carry weight the line cannot: a red 실패 on the path nobody wants, a
 * bold 필수 on the one they must take. Three attributes where there was a constant, and
 * what only a browser shows is that the drawing follows — including the **pill**, which is
 * estimated from the size and would be drawn for a size the text is not.
 */
test.describe('the label’s own type', () => {
  const labelled = async (page: Page) => {
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setConnector', { nodeIds: [id], label: '검토 필요' }),
      sid
    );
    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), sid);
    await page.waitForTimeout(400);
    return sid;
  };

  const text = (page: Page, sid: string) =>
    page.locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"] [data-connector-label]`);

  test('is typed in the panel and drawn on the line', async ({ page }) => {
    await openDeck(page);
    const sid = await labelled(page);

    await page.locator('.sl-properties').getByLabel('이름표 크기').fill('16');
    await page.locator('.sl-properties').getByLabel('이름표 크기').press('Enter');
    await page.waitForTimeout(400);
    await page.locator('.sl-properties').getByLabel('이름표 굵게').click();
    await page.waitForTimeout(400);

    // Points in the panel, twips in the document: sixteen point is 320.
    expect(await attr(page, sid, 'labelSize')).toBe(320);
    expect(await attr(page, sid, 'labelBold')).toBe(true);

    const drawn = await text(page, sid).evaluate((el) => ({
      size: el.getAttribute('font-size'),
      weight: el.getAttribute('font-weight')
    }));
    expect(Number(drawn.size)).toBe(320);
    expect(Number(drawn.weight)).toBe(700);
  });

  test('takes the pill with it, so the word is not wider than its own background', async ({
    page
  }) => {
    await openDeck(page);
    const sid = await labelled(page);
    const pillOf = () =>
      page
        .locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"] rect`)
        .last()
        .evaluate((el) => Number(el.getAttribute('width')));

    const before = await pillOf();
    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setConnector', { nodeIds: [id], labelSize: 400 }),
      sid
    );
    await page.waitForTimeout(500);
    // The pill is estimated from the size (`labelBox`), so a bigger word needs a bigger
    // one — drawn for the old size, the letters hang out of it.
    expect(await pillOf()).toBeGreaterThan(before);
  });

  test('takes a colour, and a theme slot resolves to one', async ({ page }) => {
    await openDeck(page);
    const sid = await labelled(page);

    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setConnector', {
          nodeIds: [id],
          labelColor: 'theme:accent2'
        }),
      sid
    );
    await page.waitForTimeout(500);

    /*
     * A deck's colours are one edit, which is the whole point of a theme — and a line
     * could not use one at all before this: its `stroke` was read raw, so re-colouring a
     * deck re-coloured the shapes and left the lines between them behind.
     */
    const fill = await text(page, sid).getAttribute('fill');
    expect(fill).not.toBe('theme:accent2');
    expect(fill).toMatch(/^#|^rgb/);
  });

  test('lets a line take a theme colour for its stroke as well', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setConnector', {
          nodeIds: [id],
          stroke: 'theme:accent3'
        }),
      sid
    );
    await page.waitForTimeout(500);

    const stroke = await page
      .locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"] path`)
      .nth(1)
      .getAttribute('stroke');
    expect(stroke).not.toBe('theme:accent3');
    expect(stroke).toMatch(/^#|^rgb/);
  });
});

/**
 * A word for each end.
 *
 * UML's multiplicity — `1` here, `0..*` there — which is the difference between "an order
 * has items" and "an order has many items". The placement arithmetic is unit-tested next to
 * the connector geometry; what a browser shows is that the two words reach the drawing,
 * that each sits at **its own** end, and that they are clear of the line and of each other.
 */
test.describe('a word at each end', () => {
  const both = async (page: Page) => {
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setConnector', {
          nodeIds: [id],
          startLabel: '1',
          endLabel: '0..*'
        }),
      sid
    );
    await page.waitForTimeout(500);
    return sid;
  };

  const wordAt = (page: Page, sid: string, which: 'start' | 'end') =>
    page.locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"] [data-connector-${which}-label]`);

  test('is typed in the panel and drawn at its own end', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), sid);
    await page.waitForTimeout(300);

    await page.locator('.sl-properties').getByLabel('시작 이름표').fill('1');
    await page.locator('.sl-properties').getByLabel('시작 이름표').press('Enter');
    await page.locator('.sl-properties').getByLabel('끝 이름표').fill('0..*');
    await page.locator('.sl-properties').getByLabel('끝 이름표').press('Enter');
    await page.waitForTimeout(500);

    await expect(wordAt(page, sid, 'start')).toHaveText('1');
    await expect(wordAt(page, sid, 'end')).toHaveText('0..*');

    // Each near the shape it belongs to: the start's word by the first shape, the end's by
    // the second, and the two shapes are at opposite corners.
    const start = (await wordAt(page, sid, 'start').boundingBox())!;
    const end = (await wordAt(page, sid, 'end').boundingBox())!;
    const first = (await page.locator(`.sl-stage [data-bc-sid="${pair[0]}"]`).first().boundingBox())!;
    const second = (await page.locator(`.sl-stage [data-bc-sid="${pair[1]}"]`).first().boundingBox())!;
    const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    expect(near(start, first)).toBeLessThan(near(start, second));
    expect(near(end, second)).toBeLessThan(near(end, first));
  });

  test('is clear of the line, and of the label in the middle', async ({ page }) => {
    await openDeck(page);
    const sid = await both(page);
    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setConnector', { nodeIds: [id], label: '담다' }),
      sid
    );
    await page.waitForTimeout(500);

    const boxes = await Promise.all([
      wordAt(page, sid, 'start').boundingBox(),
      wordAt(page, sid, 'end').boundingBox(),
      page
        .locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"] [data-connector-label]`)
        .boundingBox()
    ]);
    const overlap = (a: any, b: any) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

    // Three words on one line and none of them on top of another: a pill over a pill is a
    // diagram a reader cannot read at all.
    expect(overlap(boxes[0], boxes[1])).toBe(false);
    expect(overlap(boxes[0], boxes[2])).toBe(false);
    expect(overlap(boxes[1], boxes[2])).toBe(false);
  });

  test('is set in the same type as the rest of the line’s words', async ({ page }) => {
    await openDeck(page);
    const sid = await both(page);
    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setConnector', {
          nodeIds: [id],
          labelSize: 320,
          labelBold: true
        }),
      sid
    );
    await page.waitForTimeout(500);

    // A diagram whose multiplicity is set in a different size from the name it belongs to
    // is a diagram with a typo in it.
    for (const which of ['start', 'end'] as const) {
      const drawn = await wordAt(page, sid, which).evaluate((el) => ({
        size: Number(el.getAttribute('font-size')),
        weight: Number(el.getAttribute('font-weight'))
      }));
      expect(drawn.size).toBe(320);
      expect(drawn.weight).toBe(700);
    }
  });

  test('goes when the field is cleared', async ({ page }) => {
    await openDeck(page);
    const sid = await both(page);
    await expect(wordAt(page, sid, 'start')).toHaveCount(1);

    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setConnector', { nodeIds: [id], startLabel: '' }),
      sid
    );
    await page.waitForTimeout(500);
    // An empty pill is a white smudge on a line, so an emptied field draws nothing.
    await expect(wordAt(page, sid, 'start')).toHaveCount(0);
    await expect(wordAt(page, sid, 'end')).toHaveCount(1);
  });
});

/**
 * A curve bent by hand.
 *
 * Waypoints were kept off curves because a curve's points are *control* points: the
 * reader's point became one, so the line leaned towards it and never reached it. Now it
 * goes **through** it (`splineThrough`), which means the grips belong there too.
 */
test.describe('a curve through a placed point', () => {
  test('passes through the point rather than leaning towards it', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setConnector', {
          nodeIds: [id],
          kind: 'curve',
          waypoints: [{ x: 4000, y: 8000 }]
        }),
      sid
    );
    await page.waitForTimeout(600);

    const d = (await page
      .locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"] path`)
      .nth(1)
      .getAttribute('d'))!;
    // Two cubics sharing the reader's point, and the point itself is *on* the path — a
    // control point would appear in the handles and never as a span's end.
    expect(d.match(/C /g)).toHaveLength(2);
    expect(d).toContain('4000 8000');
  });

  test('offers the grips a curve could not have before', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setConnector', { nodeIds: [id], kind: 'curve' }),
      sid
    );
    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), sid);
    await page.waitForTimeout(400);

    // A dot in the middle of the run, on a curve: it has to be on the *track*, because the
    // middle of two control points is not on the line at all.
    const dots = page.locator('[data-conn-seg]');
    expect(await dots.count()).toBeGreaterThan(0);
    const dot = (await dots.first().boundingBox())!;
    const line = (await page
      .locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"]`)
      .first()
      .boundingBox())!;
    expect(dot.x).toBeGreaterThanOrEqual(line.x - 20);
    expect(dot.x).toBeLessThanOrEqual(line.x + line.width + 20);
  });

  test('takes the bow grip away once a point is placed', async ({ page }) => {
    await openDeck(page);
    const pair = await twoShapes(page);
    const sid = await join(page, pair);
    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setConnector', { nodeIds: [id], kind: 'curve' }),
      sid
    );
    await page.evaluate((id) => (window as any).editor.setNode({ nodeIds: [id] }), sid);
    await page.waitForTimeout(400);
    await expect(page.locator('[data-conn-bend]')).toHaveCount(1);

    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setConnector', {
          nodeIds: [id],
          waypoints: [{ x: 4000, y: 8000 }]
        }),
      sid
    );
    await page.waitForTimeout(500);
    /*
     * `connectorPoints` ignores `bend` entirely once there are waypoints — the reader has
     * said where the line goes — so a bow grip there is a control wired to nothing.
     */
    await expect(page.locator('[data-conn-bend]')).toHaveCount(0);
  });
});
