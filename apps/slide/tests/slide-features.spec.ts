import { test, expect } from '@playwright/test';
import { openDeck, visibleBoxes, boxCounts, attr } from './helpers';

/**
 * The parts of the product that were built last and checked by hand.
 *
 * Named in the backlog as where the suite was thin: pictures, layouts,
 * snapping, going inside a container, and presenting. Each was verified in a
 * browser once, by a probe that no longer exists.
 */

test.describe('going inside a container', () => {
  /**
   * A frame's children were unreachable: the overlay's candidates were the
   * slide's *direct* children, so clicking a rectangle inside a frame selected
   * the frame and nothing could edit what was in one.
   */
  test('a double-click goes in and takes the shape under the pointer', async ({ page }) => {
    await openDeck(page);
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(500);

    const [shape] = await visibleBoxes(page, '.sl-rectangle');
    await page.mouse.click(shape.x, shape.y);
    const outer = await page.evaluate(() => (window as any).editor.selection?.nodeIds?.[0]);
    // One click selects the container, which is what a click on a group means.
    expect(outer).not.toBe(shape.sid);

    await page.mouse.dblclick(shape.x, shape.y);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as any).editor.selection?.nodeIds)).toEqual([shape.sid]);

    // And the reader is told where they are.
    const outlined = await page.evaluate(() =>
      [...document.querySelectorAll('.sl-overlay div')].some((n) =>
        ((n as HTMLElement).style.border || '').includes('dashed')
      )
    );
    expect(outlined).toBe(true);
  });

  test('Escape comes back out, one level, with the container selected', async ({ page }) => {
    await openDeck(page);
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(500);

    const [shape] = await visibleBoxes(page, '.sl-rectangle');
    await page.mouse.dblclick(shape.x, shape.y);
    await page.waitForTimeout(400);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    const selected = await page.evaluate(() => (window as any).editor.selection?.nodeIds?.[0]);
    expect(selected).not.toBe(shape.sid);
    const outlined = await page.evaluate(() =>
      [...document.querySelectorAll('.sl-overlay div')].some((n) =>
        ((n as HTMLElement).style.border || '').includes('dashed')
      )
    );
    expect(outlined).toBe(false);
  });

  /**
   * The arrange commands read the slide's children and matched the selection
   * against them, so inside a frame every one of them was disabled with nothing
   * said — the buttons were simply grey.
   */
  test('the arrange commands work on what is inside', async ({ page }) => {
    await openDeck(page);
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(500);

    const [shape] = await visibleBoxes(page, '.sl-rectangle');
    await page.mouse.dblclick(shape.x, shape.y);
    await page.waitForTimeout(400);

    const indexOf = async () =>
      await page.evaluate((sid) => {
        const store = (window as any).editor.dataStore;
        const parent = store.getNode(sid)?.parentId;
        return (store.getNode(parent)?.content ?? []).indexOf(sid);
      }, shape.sid);

    const before = await indexOf();
    await page.getByLabel('앞으로 가져오기').click();
    await page.waitForTimeout(400);
    expect(await indexOf()).toBe(before + 1);
  });
});

test.describe('arranging', () => {
  /**
   * A selection that spans a group and the slide.
   *
   * Aligning used to read one container's children and match the selection
   * against them, so half the selection was invisible to it and every align and
   * distribute button went grey — silently, for a selection the reader had
   * plainly made. What "align these left" means does not depend on whether the
   * shapes happen to share a parent.
   */
  test('lines up boxes that live in different containers', async ({ page }) => {
    await openDeck(page);
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(500);

    const pair = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const slide = (root.content ?? [])
        .map((s: string) => store.getNode(s))
        .filter((n: any) => n?.stype === 'surface')[2];
      const children = (slide.content ?? []).map((s: string) => store.getNode(s));
      const onSlide = children.find((n: any) => n?.stype === 'textFrame');
      const container = children.find((n: any) => n?.stype === 'group' || n?.stype === 'frame');
      const inside = store.getNode((container?.content ?? [])[0]);
      return onSlide && inside ? [onSlide.sid, inside.sid] : null;
    });
    test.skip(!pair, 'this slide has no container to reach into');

    const left = async () =>
      await page.evaluate(
        (sids) =>
          sids.map((s: string) =>
            Math.round(document.querySelector(`.sl-stage [data-bc-sid="${s}"]`)!.getBoundingClientRect().x)
          ),
        pair!
      );

    const before = await left();
    expect(before[0]).not.toBe(before[1]);

    await page.evaluate((sids) => (window as any).editor.executeCommand('setNode', { nodeIds: sids }), pair!);
    await page.waitForTimeout(300);
    await page.getByLabel('왼쪽 정렬').click();
    await page.waitForTimeout(600);

    const after = await left();
    expect(after[0]).toBe(after[1]);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    expect(await left()).toEqual(before);
  });
});

test.describe('snapping', () => {
  /**
   * A resize holds the opposite edge still, so only the lines the handle moves
   * are candidates — which is why it is a different function from the one a
   * move uses.
   */
  test('pulls a dragged edge onto a neighbour’s, and lets a modifier refuse', async ({ page }) => {
    await openDeck(page);
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(500);

    const boxes = await visibleBoxes(page, '.sl-text-frame, .sl-shape, .sl-frame');
    const me = boxes[0];
    const other = boxes.find((b) => b.sid !== me.sid && Math.abs(b.left + b.width - (me.left + me.width)) > 20);
    test.skip(!other, 'this slide has nothing to snap to');

    await page.mouse.click(me.x, me.y);
    await page.waitForTimeout(300);

    const rightEdge = async () =>
      await page.evaluate(
        (sid) => Math.round(document.querySelector(`.sl-stage [data-bc-sid="${sid}"]`)!.getBoundingClientRect().right),
        me.sid
      );

    const dragEastTo = async (target: number, modifiers: string[] = []) => {
      const handle = await page.evaluate(() => {
        const h = document.querySelector('[data-handle="e"]')!.getBoundingClientRect();
        return { x: Math.round(h.x + h.width / 2), y: Math.round(h.y + h.height / 2) };
      });
      for (const key of modifiers) await page.keyboard.down(key);
      await page.mouse.move(handle.x, handle.y);
      await page.mouse.down();
      await page.mouse.move(target, handle.y, { steps: 12 });
      await page.mouse.up();
      for (const key of modifiers) await page.keyboard.up(key);
      await page.waitForTimeout(400);
    };

    /**
     * Four pixels short of the guide: inside the threshold, so it is pulled on.
     *
     * To within a pixel, and deliberately. Everything here is measured in screen
     * pixels through a stage that scales the slide, so the model's twips land on
     * a half-pixel and round — and the assertion is "it snapped to the
     * neighbour's edge", not "it landed on a whole number at this particular
     * zoom". It read 602 against 603 the day the timeline pane made the stage
     * shorter and changed the fit; the snap was working perfectly.
     */
    const guide = other!.left + other!.width;
    await dragEastTo(guide - 4);
    expect(Math.abs((await rightEdge()) - guide)).toBeLessThanOrEqual(1);

    // The same drag with Shift held asks for proportions, and a snap would
    // break them — so it stays where it was put, four pixels short.
    await dragEastTo(guide - 4, ['Shift']);
    expect(Math.abs((await rightEdge()) - (guide - 4))).toBeLessThanOrEqual(1);
  });
});

test.describe('a frame that arranges what is in it', () => {
  /**
   * `layoutMode` was declared with the canvas nodes and read by nothing. What it
   * buys a deck is the half of presentation work that is not writing: three
   * boxes in a row with an even gap, which stays even.
   */
  const openFrame = async (page: import('@playwright/test').Page) => {
    await openDeck(page);
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(500);

    const frame = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const slide = (root.content ?? [])
        .map((s: string) => store.getNode(s))
        .filter((n: any) => n?.stype === 'surface')[2];
      const found = (slide.content ?? [])
        .map((s: string) => store.getNode(s))
        .find((n: any) => n?.stype === 'frame');
      return found ? { sid: found.sid, kids: found.content } : null;
    });
    return frame;
  };

  const positions = async (page: import('@playwright/test').Page, kids: string[]) =>
    await page.evaluate(
      (list) =>
        list.map((sid: string) => {
          const a = (window as any).editor.dataStore.getNode(sid).attributes;
          return `${a.x},${a.y}`;
        }),
      kids
    );

  test('puts them in a row the moment it is turned on', async ({ page }) => {
    const frame = await openFrame(page);
    test.skip(!frame, 'this slide has no frame');

    const before = await positions(page, frame!.kids);
    await page.evaluate((sid) => (window as any).editor.executeCommand('setNode', { nodeIds: [sid] }), frame!.sid);
    await page.waitForTimeout(300);

    await page.locator('.sl-properties').getByLabel('배치 방향').selectOption('row');
    await page.waitForTimeout(600);

    const after = await positions(page, frame!.kids);
    expect(after).not.toEqual(before);
    // A row: every one at the same y, each further along than the last.
    const ys = after.map((p) => Number(p.split(',')[1]));
    expect(new Set(ys).size).toBe(1);
    const xs = after.map((p) => Number(p.split(',')[0]));
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  test('follows the gap the reader types', async ({ page }) => {
    const frame = await openFrame(page);
    test.skip(!frame, 'this slide has no frame');

    await page.evaluate((sid) => (window as any).editor.executeCommand('setNode', { nodeIds: [sid] }), frame!.sid);
    await page.waitForTimeout(300);
    const panel = page.locator('.sl-properties');
    await panel.getByLabel('배치 방향').selectOption('row');
    await page.waitForTimeout(500);

    const tight = await positions(page, frame!.kids);
    // Exactly named: the panel also has a "간격 문서 변수" row now (§10h-2), and `getByLabel`
    // matches by substring.
    await panel.getByLabel('간격', { exact: true }).fill('1');
    await panel.getByLabel('간격', { exact: true }).press('Enter');
    await page.waitForTimeout(600);
    const loose = await positions(page, frame!.kids);

    // One centimetre is 567 twips, added between each pair.
    const second = (list: string[]) => Number(list[1].split(',')[0]);
    expect(second(loose) - second(tight)).toBe(567);
  });

  /**
   * A side of the padding, **stated and then taken back**.
   *
   * `setFrameLayout` had its own copy of the filter that dropped a removal — the one in
   * `slide-commands.ts` was the other — so this is the second command the gesture had to reach.
   * A stated side and an unstated side are different things: the first overrides the shorthand and
   * the second follows it, and the panel could only ever reach the first.
   */
  test('gives back a side of the padding when the field is emptied', async ({ page }) => {
    const frame = await openFrame(page);
    test.skip(!frame, 'this slide has no frame');

    await page.evaluate((sid) => (window as any).editor.executeCommand('setNode', { nodeIds: [sid] }), frame!.sid);
    await page.waitForTimeout(300);
    const panel = page.locator('.sl-properties');
    await panel.getByLabel('배치 방향').selectOption('row');
    await page.waitForTimeout(500);

    const held = (attr: string) =>
      page.evaluate(
        ([sid, key]) => (window as any).editor.dataStore.getNode(sid)?.attributes?.[key],
        [frame!.sid, attr] as const
      );

    await panel.getByLabel('안쪽 여백', { exact: true }).fill('1');
    await panel.getByLabel('안쪽 여백', { exact: true }).press('Enter');
    await panel.getByLabel('위쪽 여백').fill('0');
    await panel.getByLabel('위쪽 여백').press('Enter');
    await page.waitForTimeout(400);
    expect(await held('paddingTop')).toBe(0);

    await panel.getByLabel('위쪽 여백').fill('');
    await panel.getByLabel('위쪽 여백').press('Enter');
    await page.waitForTimeout(400);

    // Gone, not zero: the side follows the shorthand again, and the shorthand is untouched.
    expect(await held('paddingTop')).toBeUndefined();
    expect(await held('padding')).toBe(567);
  });

  /** The difference between a layout and a one-off tidy-up: it holds. */
  test('arranges a shape that arrives afterwards', async ({ page }) => {
    const frame = await openFrame(page);
    test.skip(!frame, 'this slide has no frame');

    await page.evaluate((sid) => (window as any).editor.executeCommand('setNode', { nodeIds: [sid] }), frame!.sid);
    await page.waitForTimeout(300);
    await page.locator('.sl-properties').getByLabel('배치 방향').selectOption('row');
    await page.waitForTimeout(600);

    const added = await page.evaluate(async (sid) => {
      await (window as any).editor
        .transaction([
          {
            type: 'addChild',
            payload: {
              parentId: sid,
              child: { stype: 'rectangle', attributes: { x: 9999, y: 9999, width: 600, height: 600 } }
            }
          }
        ])
        .commit();
      const store = (window as any).editor.dataStore;
      return (store.getNode(sid).content ?? []).slice(-1)[0];
    }, frame!.sid);
    await page.waitForTimeout(700);

    const [placed] = await positions(page, [added]);
    // Not where it was put: the frame owns its children's coordinates.
    expect(placed).not.toBe('9999,9999');
    expect(Number(placed.split(',')[1])).toBe(0);
  });

  /**
   * And a child that **fills** it, which is the half auto-layout was missing.
   *
   * Measured before it existed: widening a frame moved its children — they were re-centred on
   * the new width — and left every one of them its old size. So a card built out of a frame
   * could be made wider and its rows would sit in the middle of it, which is not what anybody
   * means by a wider card. The DOM does not do this for us: a slide *places*, and an absolutely
   * positioned child does not reflow when its parent's box changes.
   */
  test('gives a child the frame’s width when it is told to fill it', async ({ page }) => {
    const frame = await openFrame(page);
    test.skip(!frame, 'this slide has no frame');

    await page.evaluate((sid) => (window as any).editor.executeCommand('setNode', { nodeIds: [sid] }), frame!.sid);
    await page.waitForTimeout(300);
    await page.locator('.sl-properties').getByLabel('배치 방향').selectOption('column');
    await page.waitForTimeout(600);

    // The first child, told to fill its frame from its own panel.
    const child = frame!.kids[0];
    await page.evaluate((sid) => (window as any).editor.executeCommand('setNode', { nodeIds: [sid] }), child);
    await page.waitForTimeout(400);
    const panel = page.locator('.sl-properties');
    await expect(panel).toContainText('프레임 안에서');
    // Not `채우기`, which in this panel is the *paint* — 채우기 추가, 1번 채우기, and three more.
    await panel.getByLabel('프레임 가득 채우기').click();
    await page.waitForTimeout(700);

    const widths = await page.evaluate(
      (ids) =>
        ids.map((sid: string) => {
          const store = (window as any).editor.dataStore;
          return {
            width: store.getNode(sid).attributes.width,
            frame: store.getNode(store.getNode(sid).parentId).attributes.width,
            padding: store.getNode(store.getNode(sid).parentId).attributes.padding ?? 0
          };
        }),
      [child, frame!.kids[1]]
    );
    // The frame's room across the axis, less the padding either side.
    expect(widths[0].width).toBe(widths[0].frame - widths[0].padding * 2);
    // And the sibling that asked for nothing keeps its own — which is why filling is a child's
    // decision rather than the frame's.
    expect(widths[1].width).not.toBe(widths[0].width);
  });
});

test.describe('a layout', () => {
  /**
   * `slideLayout` was declared, drawn hidden, and read by one thing. A slide's
   * text now resolves through it, so applying one changes how the slide looks
   * without touching a word of what it says.
   */
  test('formats a paragraph that sets nothing of its own', async ({ page }) => {
    await openDeck(page);

    const title = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const slide = (root.content ?? []).map((s: string) => store.getNode(s)).find((n: any) => n?.stype === 'surface');
      const frame = (slide.content ?? []).map((s: string) => store.getNode(s)).find((n: any) => n?.attributes?.role === 'title');
      return { slide: slide.sid, paragraph: store.getNode(frame.content[0]).sid };
    });

    // Strip its direct formatting: only the layout can say what size it is.
    await page.evaluate(async (sid) => {
      await (window as any).editor
        .transaction([{ type: 'setAttrs', payload: { nodeId: sid, attrs: {}, replace: true } }])
        .commit();
    }, title.paragraph);
    await page.waitForTimeout(600);

    const drawn = async () =>
      await page.evaluate(
        (sid) => getComputedStyle(document.querySelector(`.sl-stage [data-bc-sid="${sid}"]`)!).fontSize,
        title.paragraph
      );

    // layout-title's title is 108 half-points: 54pt, which is 72 pixels.
    expect(await drawn()).toBe('72px');

    // And the same paragraph follows a different layout without being edited.
    await page.evaluate(
      (sid) => (window as any).editor.executeCommand('setSlideLayout', { slideId: sid, layoutId: 'layout-body' }),
      title.slide
    );
    await page.waitForTimeout(600);
    // layout-body's title is 66 half-points: 33pt, which is 44 pixels.
    expect(await drawn()).toBe('44px');
  });
});

test.describe('a picture', () => {
  /**
   * The button was permanently disabled and honestly so — the command refuses a
   * payload with no file, and nothing was opening a picker.
   */
  test('is chosen from a file and placed in its own proportions', async ({ page }) => {
    await openDeck(page);
    const before = (await boxCounts(page))[0];

    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-control="insert-image"]').click();
    (await chooser).setFiles({
      name: 'wide.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#0ea5e9"/></svg>'
      )
    });
    await page.waitForTimeout(900);

    expect((await boxCounts(page))[0]).toBe(before + 1);

    const sid = await page.evaluate(() => (window as any).editor.selection?.nodeIds?.[0]);
    // 400 by 200 pixels is 6000 by 3000 twips, and the shape is kept.
    expect(await attr(page, sid, 'width')).toBe(6000);
    expect(await attr(page, sid, 'height')).toBe(3000);
  });
});

test.describe('presenting', () => {
  test('fills the window and puts the chrome away', async ({ page }) => {
    await openDeck(page);
    await page.locator('[data-present]').click();
    await page.waitForTimeout(600);

    await expect(page.locator('.sl-filmstrip')).toBeHidden();
    await expect(page.locator('.sl-properties')).toBeHidden();
    await expect(page.locator('.sl-notes')).toBeHidden();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await expect(page.locator('.sl-filmstrip')).toBeVisible();
  });

  /**
   * `hidden` means "keep it, skip it" — the whole difference from deleting one.
   *
   * Walked from the first slide to the last rather than stepped once, because
   * the claim is about the whole way through: a hidden slide is never what a
   * presenter is looking at. The first version of this test stepped forward
   * from the slide before the hidden one and asserted that the slide changed,
   * which fails for a reason that is not a bug — the deck's hidden slide is its
   * last, so there is nowhere further to go.
   */
  test('never lands on a hidden slide', async ({ page }) => {
    await openDeck(page);

    const hidden = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      return (root.content ?? [])
        .map((s: string) => store.getNode(s))
        .filter((n: any) => n?.stype === 'surface')
        .filter((n: any) => n.attributes?.hidden === true)
        .map((n: any) => n.sid);
    });
    test.skip(hidden.length === 0, 'the sample deck hides no slide');

    await page.locator('[data-present]').click();
    await page.waitForTimeout(500);

    const at = async () =>
      await page.evaluate(
        () => document.querySelector('.sl-filmstrip button[data-current="true"]')?.getAttribute('data-slide')
      );

    const visited = [await at()];
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      visited.push(await at());
    }

    for (const sid of hidden) expect(visited).not.toContain(sid);
    // And it did go somewhere, or the test would pass by never moving.
    expect(new Set(visited).size).toBeGreaterThan(1);
  });
});
