import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { drawnFill, drawnFills, openDeck, visibleBoxes } from './helpers';

/**
 * A shape's fills and effects, as stacks.
 *
 * The panel had one fill row and one shadow group — which is what a shape could
 * *have*. A photograph tinted by a colour over it is two fills; a card with a
 * soft shadow and a hard key line is two effects; and neither can be said with
 * one value per idea. The model is unit-tested in
 * `office-slides/test/paint.test.ts`, including the half that matters most:
 * every deck already written keeps meaning what it meant.
 *
 * What only a browser shows is that the stack reaches the paint — one element per
 * fill, in the order the list draws them. It *was* two layers in one
 * `background`, and the change is why several of these read `drawnFill` rather
 * than the box's own style: see `office-slides/src/fill-layers.ts`.
 */
const panel = (page: Page) => page.locator('.sl-properties');

/**
 * What the **box** carries: its shadow, its one flat colour, and — for a stack —
 * nothing at all, because the fills are elements. See `drawnFill` for those.
 */
const cssOf = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const style = getComputedStyle(
      document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!
    );
    return { background: style.backgroundImage, colour: style.backgroundColor, shadow: style.boxShadow };
  }, sid);

const newRectangle = async (page: Page) => {
  await page.getByRole('button', { name: '사각형' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).editor?.selection?.startNodeId ?? null))
    .not.toBeNull();
  return page.evaluate(() => (window as any).editor.selection.nodeIds[0] as string);
};

const fills = (page: Page, sid: string) =>
  page.evaluate((id) => (window as any).editor.dataStore.getNode(id)?.attributes?.fills, sid);

test.describe('a stack of fills', () => {
  test('starts as the one fill the shape already had', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);

    // A new rectangle has a flat fill and no list; the panel shows it as the
    // list it is equivalent to, which is what keeps old decks working.
    await expect(panel(page).getByLabel('1번 채우기 종류')).toHaveValue('solid');
    expect(await fills(page, sid)).toBeUndefined();
  });

  test('takes a second fill, and paints both', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);

    await panel(page).getByLabel('채우기 추가').click();
    await page.waitForTimeout(400);

    const written = await fills(page, sid);
    expect(written).toHaveLength(2);

    // Two elements, which is what a stack *is* to a browser now — and the box
    // itself paints nothing, so there is one answer rather than two.
    expect(await drawnFills(page, sid)).toBe(2);
    expect((await cssOf(page, sid)).background).toBe('none');
    // A solid is a colour again in a layer: `linear-gradient(#fff, #fff)` was
    // the price of a stack being one property, and it went with it.
    expect((await drawnFill(page, sid, 0))!.background).toBe('none');
    expect((await drawnFill(page, sid, 1))!.background).toBe('none');
  });

  test('switches one off without losing it', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);
    await panel(page).getByLabel('채우기 추가').click();
    await page.waitForTimeout(400);

    await panel(page).getByLabel('1번 표시').click();
    await page.waitForTimeout(400);

    // Still two in the document — an eye is not a delete, which is how two
    // fills are compared.
    expect(await fills(page, sid)).toHaveLength(2);
    expect((await fills(page, sid))[0].visible).toBe(false);
  });

  /**
   * A gradient of five stops, where the model had two ends. The bar is the
   * gesture: a stop is a thing you drag, because a gradient is a shape you see.
   */
  test('becomes a gradient, keeping the colour it had', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);

    await panel(page).getByLabel('1번 채우기 종류').selectOption('linear');
    await page.waitForTimeout(400);

    const written = await fills(page, sid);
    expect(written[0].kind).toBe('linear');
    expect(written[0].stops).toHaveLength(2);
    expect((await drawnFill(page, sid, 0))!.background).toContain('linear-gradient');

    // And a third stop, added on the bar where the pointer is.
    await panel(page).getByLabel('1번 채우기', { exact: true }).click();
    const bar = await panel(page).locator('[data-gradient-bar="0"]').boundingBox();
    await page.mouse.dblclick(bar!.x + bar!.width * 0.5, bar!.y + bar!.height / 2);
    await page.waitForTimeout(400);

    expect((await fills(page, sid))[0].stops).toHaveLength(3);
  });
});

test.describe('a stack of effects', () => {
  test('takes a shadow and then a second one', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);

    await panel(page).getByLabel('효과 추가').click();
    await page.waitForTimeout(400);
    await expect.poll(async () => (await cssOf(page, sid)).shadow).not.toBe('none');

    await panel(page).getByLabel('효과 추가').click();
    await page.waitForTimeout(400);

    const written = await page.evaluate(
      (id) => (window as any).editor.dataStore.getNode(id)?.attributes?.effects,
      sid
    );
    expect(written).toHaveLength(2);
    // Both in one `box-shadow`, which is how a browser takes a list of them:
    // the computed value is two shadows separated by a comma at the top level,
    // and each one names an `rgba(...)`.
    expect((await cssOf(page, sid)).shadow.match(/rgba?\(/g)?.length).toBe(2);
  });

  test('turns one into an inner shadow, and a blur into a filter', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);
    await panel(page).getByLabel('효과 추가').click();
    await page.waitForTimeout(400);

    await panel(page).getByLabel('1번 효과 종류').selectOption('inner');
    await page.waitForTimeout(400);
    expect((await cssOf(page, sid)).shadow).toContain('inset');

    await panel(page).getByLabel('1번 효과 종류').selectOption('blur');
    await page.waitForTimeout(400);

    // A shadow is drawn *around* a box and a blur is applied *to* it: two
    // properties, because they are two different things to a browser.
    expect((await cssOf(page, sid)).shadow).toBe('none');
    expect(
      await page.evaluate(
        (id) =>
          getComputedStyle(document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!)
            .filter,
        sid
      )
    ).toContain('blur');
  });
});

/**
 * The two things a stack has to offer before it is one: an order you can change,
 * and room for the kinds of paint a design actually uses.
 */
test.describe('arranging a stack', () => {
  test('reorders by dragging a row', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);

    // Two fills, told apart by their kind rather than by their colour.
    await panel(page).getByLabel('채우기 추가').click();
    await page.waitForTimeout(400);
    await panel(page).getByLabel('1번 채우기 종류').selectOption('linear');
    await page.waitForTimeout(400);

    expect((await fills(page, sid)).map((paint: { kind: string }) => paint.kind)).toEqual([
      'linear',
      'solid'
    ]);

    /*
     * `data-stack-grip`, not `data-paint-grip`: the row is `office-ui`'s
     * `StackRow` now, and the grip belongs to it. Which is the point — the fills,
     * the effects and the layer panel to come are one list control, so the drag
     * that reorders them is one piece of code and one hook to ask about.
     */
    const grip = await panel(page).locator('[data-stack-grip="0"]').boundingBox();
    await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + 60, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // The order is what a stack *is*: this is the fill that is now on top.
    expect((await fills(page, sid)).map((paint: { kind: string }) => paint.kind)).toEqual([
      'solid',
      'linear'
    ]);
  });

  test('takes a picture as a fill, sized the way it says', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);

    await panel(page).getByLabel('1번 채우기 종류').selectOption('image');
    await page.waitForTimeout(400);

    // A fill with no picture draws nothing until one is chosen, rather than a
    // grey box where a reader put a photograph.
    expect(await drawnFills(page, sid)).toBe(0);

    await page.evaluate((id) => {
      const store = (window as any).editor.dataStore;
      const attrs = store.getNode(id).attributes;
      return (window as any).editor.executeCommand('setBoxStyle', {
        nodeId: id,
        fills: [{ ...attrs.fills[0], src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }]
      });
    }, sid);
    await page.waitForTimeout(400);

    /**
     * An `<img>` rather than a `background-image`, and `object-fit` rather than
     * `background-size` — which is the change that made the Ken Burns zoom
     * possible at all: `cover` cannot be multiplied, but an image element can be
     * scaled. See `office-slides/src/fill-layers.ts`.
     */
    const drawn = (await drawnFill(page, sid, 0))!;
    expect(drawn.image?.src).toContain('data:image/gif');
    expect(drawn.image?.fit).toBe('cover');
  });

  test('mixes a fill with what is under it', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);
    await panel(page).getByLabel('채우기 추가').click();
    await page.waitForTimeout(400);

    await panel(page).getByLabel('1번 채우기', { exact: true }).click();
    await panel(page).getByLabel('1번 혼합 모드').selectOption('multiply');
    await page.waitForTimeout(400);

    // The layer's own `mix-blend-mode` now, where it was one entry of a parallel
    // comma list — and it is the *first* fill's, which is what a reader clicked.
    expect((await drawnFill(page, sid, 0))!.blend).toBe('multiply');
  });
});

/**
 * Aiming a gradient on the shape itself.
 *
 * The angle was a number in a box, and nobody aims a gradient by typing 135 —
 * they point at the corner they want it to come from. The arithmetic is in
 * `office-slides/test/gradient-axis.test.ts`, including the part that cannot be
 * checked by looking: the drawn line is the line CSS *paints* along, so a stop
 * dragged to the end of it is a colour that stops there.
 */
test.describe('a gradient aimed on the canvas', () => {
  const openGradient = async (page: Page) => {
    const sid = await newRectangle(page);
    await panel(page).getByLabel('1번 채우기 종류').selectOption('linear');
    await page.waitForTimeout(400);
    await panel(page).getByLabel('1번 채우기', { exact: true }).click();
    await page.waitForTimeout(400);
    return sid;
  };

  test('draws its axis on the shape while its editor is open', async ({ page }) => {
    await openDeck(page);
    await openGradient(page);

    // Two stops, and the far end that points it.
    await expect(page.locator('[data-gradient-axis]')).toBeVisible();
    await expect(page.locator('[data-gradient-stop]')).toHaveCount(2);
    await expect(page.locator('[data-gradient-aim]')).toBeVisible();

    // Closed again, and the shape is a shape.
    await panel(page).getByLabel('1번 채우기', { exact: true }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-gradient-axis]')).toHaveCount(0);
  });

  /**
   * Dragging the far end still turns the gradient — it just says so differently.
   *
   * The handle used to write an `angle`; it writes the *end point* now, because
   * an angle cannot say where a gradient begins (see "a gradient placed by its
   * ends"). So what this asserts is the drawn direction rather than the stored
   * number: the picture is the promise, and the attribute is an implementation of
   * it that has already changed once.
   */
  test('turns the gradient towards where the handle is dragged', async ({ page }) => {
    await openDeck(page);
    const sid = await openGradient(page);

    const drawnAngle = async () => {
      // The computed value has the `calc()` already resolved: what the browser
      // reports is a plain angle, whatever the declaration said.
      const found = /linear-gradient\((-?[\d.]+)deg/.exec(
        (await drawnFill(page, sid, 0))?.background ?? ''
      );
      return found ? Number(found[1]) : null;
    };

    const before = await drawnAngle();
    const shape = (await visibleBoxes(page)).find((entry) => entry.sid === sid)!;
    const aim = (await page.locator('[data-gradient-aim]').boundingBox())!;

    /*
     * Dragged to the shape's right edge, level with where the gradient *starts*.
     *
     * Level, because the end is a point now and the angle is the line between the
     * two: a default gradient starts at the top centre, so dragging the far end
     * across at that height is the drag that means 90°. Under the old semantics
     * this was "the direction from the centre to the pointer" and the start did
     * not come into it — which is exactly the change.
     */
    const start = (await page.locator('[data-gradient-origin]').boundingBox())!;
    await page.mouse.move(aim.x + aim.width / 2, aim.y + aim.height / 2);
    await page.mouse.down();
    await page.mouse.move(shape.left + shape.width - 4, start.y + start.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const after = await drawnAngle();
    expect(after).not.toBe(before);
    expect(Math.abs(after! - 90)).toBeLessThan(20);
    // And the end is a point now, which is the thing the angle could not hold.
    expect((await fills(page, sid))[0].to).toBeTruthy();
  });

  test('moves a stop along the axis, and the colour stops there', async ({ page }) => {
    await openDeck(page);
    const sid = await openGradient(page);

    const first = await page.locator('[data-gradient-stop="0"]').boundingBox();
    const last = await page.locator('[data-gradient-stop="1"]').boundingBox();

    // Halfway along the line the two stops define.
    await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      (first!.x + last!.x) / 2 + first!.width / 2,
      (first!.y + last!.y) / 2 + first!.height / 2,
      { steps: 10 }
    );
    await page.mouse.up();
    await page.waitForTimeout(500);

    const offset = (await fills(page, sid))[0].stops[0].offset;
    expect(offset).toBeGreaterThan(0.3);
    expect(offset).toBeLessThan(0.7);
    /*
     * And the colour stops where the dot is: the drawn line is CSS's line.
     *
     * Rounded the way the renderer rounds — two decimals of a per cent — rather
     * than to a whole one. The whole-number version passed only while a drag
     * happened to land on an exact percentage: 0.509 is written `50.9%` and the
     * test was looking for `51%`.
     */
    const drawn = Math.round(offset * 10000) / 100;
    expect((await drawnFill(page, sid, 0))!.background).toContain(`${drawn}%`);
  });
});

/**
 * A stop added and taken away **on the shape**.
 *
 * The panel's bar could already do both; the canvas is where a reader is looking
 * while they decide where a colour should turn. Two things only a browser shows:
 *
 * - the double-click has to *reach* the axis. Measured before it worked: without
 *   stopping the press, the first click of the two bubbled to the overlay, which
 *   read a pointer on the slide as "select nothing", cleared the selection and
 *   unmounted the axis — so the second click landed on nothing at all.
 * - a refused Delete must not fall through to the shape. Two stops is the least a
 *   gradient can be, and a keystroke that cannot do what it plainly means must not
 *   quietly do something else — least of all delete what the reader was editing.
 */
test.describe('a gradient’s stops, on the canvas', () => {
  const opened = async (page: Page) => {
    const sid = await page.evaluate(async () => {
      await (window as any).editor.executeCommand('insertRectangle', {
        x: 3000,
        y: 3000,
        width: 8000,
        height: 5000
      });
      const id = (window as any).editor.selection?.nodeIds?.[0];
      await (window as any).editor.executeCommand('setBoxStyle', {
        nodeId: id,
        fills: [
          {
            kind: 'linear',
            angle: 90,
            opacity: 1,
            visible: true,
            stops: [
              { offset: 0, color: '#ff0000' },
              { offset: 1, color: '#0000ff' }
            ]
          }
        ]
      });
      return id as string;
    });
    await page.waitForTimeout(450);
    await page.locator('.sl-properties [data-paint-swatch="0"]').click();
    await page.waitForTimeout(400);
    return sid;
  };

  const stopsOf = (page: Page, sid: string) =>
    page.evaluate(
      (id) =>
        ((window as any).editor.dataStore.getNode(id)?.attributes?.fills?.[0]?.stops ?? []).map(
          (stop: { offset: number; color: string }) => ({
            at: Math.round(stop.offset * 100),
            color: stop.color
          })
        ),
      sid
    );

  test('adds one where the axis is double-clicked, and deletes the one it picked', async ({
    page
  }) => {
    await openDeck(page);
    const sid = await opened(page);
    expect(await stopsOf(page, sid)).toHaveLength(2);

    const line = await page.locator('[data-gradient-line]').boundingBox();
    await page.mouse.dblclick(line!.x + line!.width / 2, line!.y + line!.height / 2);
    await page.waitForTimeout(500);

    // Halfway along, in the colour of its nearest neighbour — so it is a stop a
    // reader can then move or recolour rather than a change they did not ask for.
    const added = await stopsOf(page, sid);
    expect(added).toHaveLength(3);
    expect(added[1]).toMatchObject({ at: 50, color: '#ff0000' });
    await expect(page.locator('[data-gradient-stop]')).toHaveCount(3);
    // The new one is the picked one, because Delete is about to be about it.
    await expect(page.locator('[data-gradient-stop][data-picked="true"]')).toHaveCount(1);

    await page.keyboard.press('Delete');
    await page.waitForTimeout(500);
    expect(await stopsOf(page, sid)).toHaveLength(2);
    // And the shape is still there: Delete meant the dot.
    expect(await page.evaluate((id) => !!(window as any).editor.dataStore.getNode(id), sid)).toBe(
      true
    );
  });

  test('refuses to go below two stops without deleting the shape instead', async ({ page }) => {
    await openDeck(page);
    const sid = await opened(page);

    await page.locator('[data-gradient-stop]').first().click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(500);

    expect(await stopsOf(page, sid)).toHaveLength(2);
    expect(await page.evaluate((id) => !!(window as any).editor.dataStore.getNode(id), sid)).toBe(
      true
    );
  });
});

/**
 * A gradient that runs between two points.
 *
 * The one thing an angle could never say — "it starts a quarter of the way in and
 * ends past the edge" — and the reason the model changed rather than the UI. CSS
 * has no syntax for it: its axis is centred on the box with a length derived from
 * the angle, so the segment is projected onto that axis and the stops are squeezed
 * into the part it covers. Which is exactly what a browser has to confirm.
 */
test.describe('a gradient placed by its ends', () => {
  test('drags its start, writes points, and remaps the stops into them', async ({ page }) => {
    await openDeck(page);
    const sid = await page.evaluate(async () => {
      await (window as any).editor.executeCommand('insertRectangle', {
        x: 3000,
        y: 3000,
        width: 8000,
        height: 4000
      });
      const id = (window as any).editor.selection?.nodeIds?.[0];
      await (window as any).editor.executeCommand('setBoxStyle', {
        nodeId: id,
        fills: [
          {
            kind: 'linear',
            angle: 90,
            opacity: 1,
            visible: true,
            stops: [
              { offset: 0, color: '#ff0000' },
              { offset: 1, color: '#0000ff' }
            ]
          }
        ]
      });
      return id as string;
    });
    await page.waitForTimeout(450);
    await page.locator('.sl-properties [data-paint-swatch="0"]').click();
    await page.waitForTimeout(400);

    const state = () =>
      page.evaluate((id) => {
        const paint = (window as any).editor.dataStore.getNode(id)?.attributes?.fills?.[0] ?? {};
        const element = document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!;
        return {
          angle: paint.angle,
          hasPoints: !!paint.from && !!paint.to,
          // The percentages CSS was given, which is where the remap shows — read
          // from the layer the fill is drawn as, not from the box.
          offsets: [
            ...(getComputedStyle(element.querySelector('.sl-fill[data-fill="0"]')!)
              .backgroundImage.matchAll(/([\d.]+)%/g) ?? [])
          ].map((m) => Number(m[1]))
        };
      }, sid);

    // It starts as an angle, edge to edge.
    const before = await state();
    expect(before.angle).toBe(90);
    expect(before.hasPoints).toBe(false);
    expect(before.offsets).toEqual([0, 100]);

    // The handle the model could not hold until it held two points.
    await expect(page.locator('[data-gradient-origin]')).toBeVisible();
    const origin = (await page.locator('[data-gradient-origin]').boundingBox())!;
    await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
    await page.mouse.down();
    await page.mouse.move(origin.x + origin.width / 2 + 120, origin.y + origin.height / 2 + 40, {
      steps: 10
    });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const after = await state();
    // Points now, and the angle is gone: two answers to one question is the fault
    // this repository keeps finding, and the reader has just said which they mean.
    expect(after.hasPoints).toBe(true);
    expect(after.angle).toBeUndefined();
    /*
     * And the stops are inside the axis rather than at its ends — which is the
     * whole mechanism: the gradient begins where the reader put the handle, and
     * CSS holds the first colour everywhere before it.
     */
    expect(after.offsets[0]).toBeGreaterThan(5);
    expect(after.offsets[after.offsets.length - 1]).toBeLessThanOrEqual(100);
  });
});

/**
 * The rest of the canvas gradient editor: sliding the whole thing, one selected
 * stop, and a radial's ellipse.
 *
 * Each of these is a browser question. The first two are about *events* — a drag
 * and a double-click on one element, and two surfaces agreeing about a selection —
 * and the third is about which of three overlapping handles takes the press.
 */
test.describe('the canvas gradient editor', () => {
  const openLinear = async (page: Page, extra: Record<string, unknown> = {}) => {
    const sid = await page.evaluate(async (more) => {
      await (window as any).editor.executeCommand('insertRectangle', {
        x: 3000,
        y: 3000,
        width: 8000,
        height: 4000
      });
      const id = (window as any).editor.selection?.nodeIds?.[0];
      await (window as any).editor.executeCommand('setBoxStyle', {
        nodeId: id,
        fills: [
          {
            kind: 'linear',
            from: { x: 0.2, y: 0.5 },
            to: { x: 0.6, y: 0.5 },
            opacity: 1,
            visible: true,
            stops: [
              { offset: 0, color: '#ff0000' },
              { offset: 0.5, color: '#00ff00' },
              { offset: 1, color: '#0000ff' }
            ],
            ...(more as Record<string, unknown>)
          }
        ]
      });
      return id as string;
    }, extra);
    await page.waitForTimeout(450);
    await page.locator('.sl-properties [data-paint-swatch="0"]').click();
    await page.waitForTimeout(400);
    return sid;
  };

  const paintOf = (page: Page, sid: string) =>
    page.evaluate(
      (id) => (window as any).editor.dataStore.getNode(id)?.attributes?.fills?.[0] ?? {},
      sid
    );

  /**
   * One element serving a drag *and* a double-click, which only works because the
   * drag is a delta with a threshold: two quick clicks travel nothing, so they
   * write nothing and the `dblclick` adds a stop.
   */
  test('slides the whole gradient by its line, and still adds a stop on a double-click', async ({
    page
  }) => {
    await openDeck(page);
    const sid = await openLinear(page);

    /*
     * Grabbed a quarter along rather than at the middle.
     *
     * The middle stop of a three-stop gradient sits exactly on the line's
     * midpoint — measured, the press hit the dot and dragged a colour instead of
     * the gradient. Which is correct behaviour and a bad place to grab.
     */
    const line = (await page.locator('[data-gradient-line]').boundingBox())!;
    const grab = { x: line.x + line.width * 0.25, y: line.y + line.height / 2 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 60, grab.y + 40, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const slid = await paintOf(page, sid);
    // Both ends moved by the same amount: the segment kept its length and its
    // direction, which is what "move the gradient" means.
    expect(slid.from.x).toBeGreaterThan(0.2);
    expect(Math.round((slid.to.x - slid.from.x) * 100) / 100).toBe(0.4);
    expect(Math.round((slid.to.y - slid.from.y) * 100) / 100).toBe(0);

    // The line went with it, so where to click has to be asked again — and again
    // away from the dots.
    const moved = (await page.locator('[data-gradient-line]').boundingBox())!;
    await page.mouse.dblclick(moved.x + moved.width * 0.25, moved.y + moved.height / 2);
    await page.waitForTimeout(500);
    expect((await paintOf(page, sid)).stops).toHaveLength(4);
    // And the double-click did not slide anything.
    expect((await paintOf(page, sid)).from.x).toBeCloseTo(slid.from.x, 5);
  });

  /**
   * A gradient has **one** selected stop and two places that show it. They were
   * two pieces of state for a day, and a reader clicking a dot on the shape left
   * the panel's picker editing a different one.
   */
  test('shares which stop is selected with the panel', async ({ page }) => {
    await openDeck(page);
    const sid = await openLinear(page);

    // The middle dot, on the shape.
    await page.locator('[data-gradient-stop="1"]').click();
    await page.waitForTimeout(400);

    // The panel followed: its position field is the middle stop's.
    await expect(
      page.locator('.sl-properties').getByLabel('1번 지점 위치')
    ).toHaveValue('50');

    // And the panel's picker edits that stop rather than another.
    await page.locator('.sl-properties').getByLabel('색상 코드').fill('ffcc00');
    await page.waitForTimeout(500);
    const colours = (await paintOf(page, sid)).stops.map((stop: { color: string }) => stop.color);
    expect(colours[1]).toContain('ffcc00');
    expect(colours[0]).toBe('#ff0000');
  });

  /**
   * A radial's two radii, independently — and the handle has to *win the press*.
   * Measured before it did: the last stop, the linear's aim handle and this one all
   * wanted the same pixel, and `elementFromPoint` there answered "stop 1", so
   * dragging the radius moved a colour instead.
   */
  test('gives a radial two radius handles that do not fight the stops', async ({ page }) => {
    await openDeck(page);
    const sid = await openLinear(page, { kind: 'radial', from: { x: 0.5, y: 0.5 }, to: { x: 0.8, y: 0.75 } });

    await expect(page.locator('[data-radial-handle="rx"]')).toBeVisible();
    await expect(page.locator('[data-radial-handle="ry"]')).toBeVisible();
    // A radial has no direction, so it has no aim handle either.
    await expect(page.locator('[data-gradient-aim]')).toHaveCount(0);
    // The ellipse is drawn, which is what makes the two handles mean something.
    await expect(page.locator('[data-radial-guide] ellipse').first()).toBeVisible();

    const before = await paintOf(page, sid);
    const rx = (await page.locator('[data-radial-handle="rx"]').boundingBox())!;
    await page.mouse.move(rx.x + rx.width / 2, rx.y + rx.height / 2);
    await page.mouse.down();
    await page.mouse.move(rx.x + rx.width / 2 + 70, rx.y + rx.height / 2 + 50, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const after = await paintOf(page, sid);
    // The horizontal radius grew and the vertical one did not: `to` is the corner
    // of the two, and each handle moves one coordinate of it.
    expect(after.to.x).toBeGreaterThan(before.to.x);
    expect(after.to.y).toBeCloseTo(before.to.y, 5);
    // And the stops were not touched, which was the failure this handle had.
    expect(after.stops.map((stop: { offset: number }) => stop.offset)).toEqual(
      before.stops.map((stop: { offset: number }) => stop.offset)
    );
  });
});

/**
 * A fill drawn as an element, in a box that also holds editable text.
 *
 * Which is the risk the whole arrangement had to be measured against: the layers
 * are children of the shape, and for a text frame that means children beside the
 * paragraphs Word's renderers draw. They are `z-index: -1` and come *after* the
 * content for exactly this reason — a container whose first child is not one of
 * the model's would shift every index a reader of that DOM counts.
 */
test.describe('a fill under the words', () => {
  test('paints behind the text, and the text still takes typing', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page, '.sl-text-frame');

    const before = await page.evaluate((id) => {
      const store = (window as any).editor.dataStore;
      return store.getNode(id).content?.length ?? 0;
    }, box.sid);

    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setBoxStyle', {
          nodeId: id,
          fills: [
            {
              kind: 'linear',
              angle: 90,
              opacity: 0.5,
              visible: true,
              stops: [
                { offset: 0, color: '#ff0000' },
                { offset: 1, color: '#0000ff' }
              ]
            },
            { kind: 'solid', color: '#ffffff', visible: true }
          ]
        }),
      box.sid
    );
    await page.waitForTimeout(400);

    expect(await drawnFills(page, box.sid)).toBe(2);
    // The isolation is not decoration: without it a negative-`z` layer is painted
    // in the slide's stacking context and covered by the slide's own background.
    expect(
      await page.evaluate(
        (id) =>
          getComputedStyle(document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!)
            .isolation,
        box.sid
      )
    ).toBe('isolate');

    // The words are on top of it: the paragraph is drawn after the layers and
    // they are behind the content.
    expect(
      await page.evaluate((id) => {
        const frame = document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!;
        return [...frame.children].map((child) =>
          child.classList.contains('sl-fill') ? 'fill' : 'content'
        );
      }, box.sid)
    ).toEqual(['content', 'fill', 'fill']);

    // And typing into it does what it did before there were any layers.
    const at = await page.evaluate((id) => {
      const paragraph = document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"] p`)!;
      const rect = paragraph.getBoundingClientRect();
      return { x: rect.x + 10, y: rect.y + rect.height / 2 };
    }, box.sid);
    await page.mouse.dblclick(at.x, at.y);
    await page.keyboard.press('Home');
    await page.keyboard.type('Zz');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const after = await page.evaluate((id) => {
      const store = (window as any).editor.dataStore;
      const node = store.getNode(id);
      return {
        blocks: node.content?.length ?? 0,
        first: (store.getNode(node.content[0])?.content ?? [])
          .map((child: string) => store.getNode(child)?.text ?? '')
          .join('')
      };
    }, box.sid);
    expect(after.blocks).toBe(before + 1);
    expect(after.first).toBe('Zz');
    // The layers survived the redraw the typing caused.
    expect(await drawnFills(page, box.sid)).toBe(2);
  });
});
