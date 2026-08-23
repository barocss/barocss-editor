import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { drawnFill, openDeck, pinZoom, visibleBoxes } from './helpers';

/**
 * Builds: what happens *on* a slide, in the order a presenter clicks through.
 *
 * This is where the question a transition let us postpone had to be answered —
 * **how a step names a shape.** A sid is `session:counter`, handed out at load
 * in document order, so a step that stored one would point at a different shape
 * the moment a slide above it gained a box, and at nothing at all in another
 * session. So a shape being animated is given a name it keeps, written into the
 * file, assigned in the same transaction as the step that needs it.
 *
 * The structure, the grouping and the arithmetic are in
 * `office-slides/test/motion.test.ts` — 24 cases, milliseconds. What only a
 * browser shows is the three things a build *is* on screen: the shape is not
 * there yet, a press brings it on, and the show gives it back when it ends.
 */
const panel = (page: Page) => page.locator('.sl-properties');

const shownState = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`);
    if (!el) return null;
    const style = getComputedStyle(el);
    return { visibility: style.visibility, opacity: Number(style.opacity), inline: el.getAttribute('style') ?? '' };
  }, sid);

const selectFirstBox = async (page: Page) => {
  const [box] = await visibleBoxes(page);
  await page.mouse.click(box.x, box.y);
  await expect
    .poll(() => page.evaluate(() => (window as any).editor.selection?.nodeIds?.[0] ?? null))
    .toBe(box.sid);
  return box;
};

/**
 * Giving the selected shape an effect, the way a reader now does it.
 *
 * The panel has two tabs — what a shape *is* and what it *does* — so this opens
 * the motion one, adds a step if the shape has none, and sets its effect. The
 * single "애니메이션 효과" dropdown it used to use was the whole of what a shape
 * could say about motion; there is a list now.
 */
const giveBuild = async (page: Page, effect: string) => {
  const props = page.locator('.sl-properties');
  await props.locator('[data-tab="motion"]').click();
  await page.waitForTimeout(200);

  if ((await props.getByLabel('1번 효과').count()) === 0) {
    // Adding is the *gallery* now: a tile is a whole motion — effect, length,
    // curve, side and amount — so a step is made by picking one, and the
    // dropdown below stays what it always was, the effect of a motion that
    // already exists.
    await props.getByLabel('모션 추가').click();
    await page.waitForTimeout(200);
    await props.locator('[data-preset="rise"]').click();
    await page.waitForTimeout(400);
  }
  await props.getByLabel('1번 효과').selectOption(effect);
  await page.waitForTimeout(400);
};

test.describe('a build on a shape', () => {
  test('names the shape, and the name is what the step holds', async ({ page }) => {
    await openDeck(page);
    const box = await selectFirstBox(page);
    await giveBuild(page, 'fade');

    const written = await page.evaluate((sid) => {
      const store = (window as any).editor.dataStore;
      const name = store.getNode(sid)?.attributes?.name;
      const root = store.getNode((window as any).editor.getRootId());
      const resources = (root.content ?? [])
        .map((child: string) => store.getNode(child))
        .find((node: any) => node?.stype === 'resources');
      const track = (resources?.content ?? [])
        .map((child: string) => store.getNode(child))
        .find((node: any) => node?.stype === 'motionTrack');
      const step = track ? store.getNode(track.content[0]) : undefined;
      return { name: name ?? null, step: step ? { ...step.attributes } : null };
    }, box.sid);

    expect(written.name).toBe('shape-1');
    expect(written.step).toMatchObject({ kind: 'build', effect: 'fade', target: 'shape-1' });
    // The step holds the name and not the sid, which is the whole point.
    expect(JSON.stringify(written.step)).not.toContain(box.sid);
  });

  /**
   * The panel's motion tab lists what this shape does, in order — the press it
   * runs on is the *timeline's* question, since two shapes' steps share the
   * presses and only the slide's list can say whose is whose.
   */
  test('lists the shape’s effects in the motion tab', async ({ page }) => {
    await openDeck(page);
    await selectFirstBox(page);
    await giveBuild(page, 'grow');

    await expect(panel(page).getByLabel('1번 효과')).toHaveValue('grow');
    await expect(panel(page)).toContainText('타임라인에서 조절');
  });

  /**
   * The three things a build is on screen. A slide's builds hold the presenter
   * where they are until every one has played — which is what a build is for.
   */
  test('is not on the slide until a press brings it on', async ({ page }) => {
    await openDeck(page);
    const box = await selectFirstBox(page);
    await giveBuild(page, 'fade');

    // In the editor it is simply there: builds play in the show.
    expect((await shownState(page, box.sid))?.visibility).toBe('visible');

    await page.locator('[data-present]').click();
    await page.waitForTimeout(400);

    // Arrived at the slide: the shape is waiting, and the hint says so.
    await expect.poll(async () => (await shownState(page, box.sid))?.visibility).toBe('hidden');
    await expect(page.locator('.sl-present-hint [data-builds]')).toHaveText('0 / 1');

    await page.keyboard.press('ArrowRight');

    await expect.poll(async () => (await shownState(page, box.sid))?.visibility).toBe('visible');
    await expect(page.locator('.sl-present-hint [data-builds]')).toHaveText('1 / 1');
  });

  /** The press that plays the last build is not the press that leaves. */
  test('holds the presenter on the slide until its builds have played', async ({ page }) => {
    await openDeck(page);
    await selectFirstBox(page);
    await giveBuild(page, 'fade');

    const first = await page.evaluate(() => (window as any).editor.selection.nodeIds[0] as string);
    const slideOf = (sid: string) =>
      page.evaluate((id) => {
        const store = (window as any).editor.dataStore;
        let node = store.getNode(id);
        while (node && node.stype !== 'surface') node = store.getNode(node.parentId);
        return node?.sid as string;
      }, sid);
    const slide = await slideOf(first);

    await page.locator('[data-present]').click();
    await page.waitForTimeout(400);

    const showing = () =>
      page.evaluate(() => document.querySelector('.sl-stage')?.getAttribute('data-focus') ?? '');

    expect(await showing()).toBe(slide);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    // Still here: that press played the build.
    expect(await showing()).toBe(slide);

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    expect(await showing()).not.toBe(slide);
  });

  /**
   * The worst bug this arrangement can produce: a shape left `visibility:
   * hidden` by a build nobody finished would be invisible in the editor
   * afterwards, present in the document and impossible to find.
   */
  test('gives every shape back when the show ends', async ({ page }) => {
    await openDeck(page);
    const box = await selectFirstBox(page);
    await giveBuild(page, 'wipe');

    await page.locator('[data-present]').click();
    await expect.poll(async () => (await shownState(page, box.sid))?.visibility).toBe('hidden');

    await page.keyboard.press('Escape');
    /*
     * Waited for rather than slept through: leaving the show puts every shape
     * back, and "is it back yet" is readable. The fixed 500ms is why this failed
     * once in a full run and passed on its own three times out of three.
     */
    await expect.poll(async () => (await shownState(page, box.sid))?.visibility).toBe('visible');

    /*
     * And its own style attribute is clean — polled too, because "back on the
     * slide" and "the styles the show wrote are gone" are two writes and nothing
     * promises they land in one frame. The plain assertion below then says which
     * value was wrong if this ever stops holding.
     */
    await expect
      .poll(async () => ((await shownState(page, box.sid))?.inline ?? '').includes('clip-path'))
      .toBe(false);

    const after = await shownState(page, box.sid);
    expect(after?.inline ?? '').not.toContain('clip-path');
  });

  test('is taken off again with the row’s delete', async ({ page }) => {
    await openDeck(page);
    const box = await selectFirstBox(page);
    await giveBuild(page, 'fade');
    await panel(page).getByLabel('1번 삭제').click();
    await page.waitForTimeout(400);

    const steps = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const resources = (root.content ?? [])
        .map((child: string) => store.getNode(child))
        .find((node: any) => node?.stype === 'resources');
      const track = (resources?.content ?? [])
        .map((child: string) => store.getNode(child))
        .find((node: any) => node?.stype === 'motionTrack');
      return (track?.content ?? []).length;
    });

    expect(steps).toBe(0);
    // The name stays: it is the shape's, not the build's.
    expect(await page.evaluate((sid) => (window as any).editor.dataStore.getNode(sid)?.attributes?.name, box.sid)).toBe(
      'shape-1'
    );
  });
});

/**
 * A build on a shape the reader has turned.
 *
 * The measured fault that changed how every effect is written: a shape's own
 * rotation *is* its `transform`, put there by the renderer, and an animation of
 * the `transform` shorthand **replaces** it. A rotated rectangle given a fly-in
 * animated as `matrix(1, 0, 0, 1, -208, 0)` — no rotation at all — and was left
 * at `none` afterwards, straight on the screen and turned in the document.
 *
 * The effects animate `translate`, `rotate` and `scale` now, which compose with
 * `transform` rather than replacing it.
 */
test.describe('a build on a turned shape', () => {
  test('keeps the turn, while it animates and after it', async ({ page }) => {
    await openDeck(page);
    await page.getByRole('button', { name: '사각형' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).editor?.selection?.startNodeId ?? null))
      .not.toBeNull();
    const sid = await page.evaluate(() => (window as any).editor.selection.nodeIds[0] as string);

    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setBoxGeometry', { nodeId: id, rotation: 30 }),
      sid
    );
    await page.waitForTimeout(300);

    const turned = () =>
      page.evaluate(
        (id) =>
          getComputedStyle(document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!)
            .transform,
        sid
      );

    const before = await turned();
    expect(before).toContain('matrix');

    await giveBuild(page, 'fly');
    await page.locator('[data-timeline] [data-timeline-preview]').click();
    await page.waitForTimeout(250);

    // Mid-animation: the turn is still the shape's `transform`, and the movement
    // is a separate property composed with it.
    expect(await turned()).toBe(before);

    await page.waitForTimeout(1400);
    expect(await turned()).toBe(before);
  });
});

/**
 * The preset gallery: a whole motion under a name.
 *
 * What the reader gets from a tile is five values — the effect, the length, the
 * curve, the side it comes from and how far — and what makes it worth having is
 * that they arrive *together*: one click, one entry in the history, and a shape
 * that appears the way the tile showed it would.
 *
 * Nothing stores the name. The panel and the timeline say which preset a step is
 * by comparing its values, so a step a reader has nudged reports 직접 설정 —
 * which is the honest answer and the reason a preset is not an attribute.
 */
test.describe('the preset gallery', () => {
  const attrsOf = (page: Page, sid: string) =>
    page.evaluate((id) => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const resources = (root.content ?? [])
        .map((child: string) => store.getNode(child))
        .find((node: any) => node?.stype === 'resources');
      const track = (resources?.content ?? [])
        .map((child: string) => store.getNode(child))
        .find((node: any) => node?.stype === 'motionTrack');
      const steps = (track?.content ?? []).map((child: string) => store.getNode(child));
      const name = store.getNode(id)?.attributes?.name;
      return steps
        .filter((step: any) => step?.attributes?.target === name)
        .map((step: any) => ({ ...step.attributes }));
    }, sid);

  test('writes every value the tile promised, in one command', async ({ page }) => {
    await openDeck(page);
    const box = await selectFirstBox(page);

    await panel(page).locator('[data-tab="motion"]').click();
    await panel(page).getByLabel('모션 추가').click();
    await page.waitForTimeout(200);
    await panel(page).locator('[data-preset="pop"]').click();
    await page.waitForTimeout(400);

    // 톡 튀어나오기: a grow, quick, overshooting, three quarters of the way in.
    expect(await attrsOf(page, box.sid)).toMatchObject([
      { kind: 'build', effect: 'grow', duration: 420, easing: 'backOut', amount: 0.75 }
    ]);

    // One gesture, one undo.
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    expect(await attrsOf(page, box.sid)).toEqual([]);
  });

  /**
   * And the timeline says which one it is — until the reader changes something,
   * at which point it says 직접 설정 rather than going on claiming the name.
   */
  test('reports which preset a step is, and stops when it is not', async ({ page }) => {
    await openDeck(page);
    await selectFirstBox(page);

    await panel(page).locator('[data-tab="motion"]').click();
    await panel(page).getByLabel('모션 추가').click();
    await page.waitForTimeout(200);
    await panel(page).locator('[data-preset="heartbeat"]').click();
    await page.waitForTimeout(400);

    const pane = page.locator('[data-timeline]');
    await pane.locator('.sl-timeline-bar').first().click();
    await expect(pane.locator('[data-step-preset]')).toHaveAttribute(
      'data-step-preset',
      'heartbeat'
    );

    // Two beats, which is what 두 번 두근거리기 says and what the bar shows.
    await expect(pane.locator('.sl-timeline-bar').first()).toHaveAttribute('data-repeat', '2');

    // Nudge the length: the values are no longer anybody's preset.
    await pane.getByLabel('재생 시간').fill('1.0');
    await pane.getByLabel('재생 시간').blur();
    await page.waitForTimeout(400);
    await expect(pane.locator('[data-step-preset]')).toHaveAttribute('data-step-preset', 'custom');
  });

  /** And choosing a preset for a step that exists replaces all five values. */
  test('retimes a step that already exists', async ({ page }) => {
    await openDeck(page);
    const box = await selectFirstBox(page);
    await giveBuild(page, 'fade');

    const pane = page.locator('[data-timeline]');
    await pane.locator('.sl-timeline-bar').first().click();
    await pane.getByLabel('프리셋').selectOption('flyAway');
    await page.waitForTimeout(400);

    expect(await attrsOf(page, box.sid)).toMatchObject([
      { effect: 'flyOut', duration: 500, easing: 'easeIn', direction: 'right', amount: 0.5 }
    ]);
  });
});

/**
 * Text by the piece: a title arriving a letter at a time.
 *
 * The one animation that needs the *view* to do something the model does not
 * describe. A document holds `inline-text` runs — one node however many
 * characters it holds — so the letters are spans the renderer's output is split
 * into at play time and put back afterwards, like the caret filler is an element
 * no node describes.
 *
 * What only a browser can show is the three things that made it hard: that a
 * transform is ignored on an inline box, that `inline-block` letters would
 * re-break the line, and that the split has to leave *no trace*.
 */
test.describe('a build on the letters of a title', () => {
  const titleOf = (page: Page, sid: string) =>
    page.evaluate((id) => {
      const el = document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!;
      return {
        html: el.innerHTML,
        text: el.textContent,
        lines: el.getClientRects().length,
        width: Math.round(el.getBoundingClientRect().width)
      };
    }, sid);

  test('splits into letters, staggers them, and leaves no trace', async ({ page }) => {
    await openDeck(page);
    /*
     * The scale pinned, because this measures the same line twice.
     *
     * The timeline pane opens itself when the slide gains its first motion — it
     * is a strip until then — and the stage re-fits when it does, so the two
     * measurements would be taken at two scales. See `pinZoom`.
     */
    await pinZoom(page);
    const box = await selectFirstBox(page);
    const before = await titleOf(page, box.sid);

    await panel(page).locator('[data-tab="motion"]').click();
    await panel(page).getByLabel('모션 추가').click();
    await page.waitForTimeout(200);
    await panel(page).locator('[data-preset="letterByLetter"]').click();
    await page.waitForTimeout(400);

    // The caret must not be in the box being split — see `splitInto`.
    await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));
    await page.locator('[data-timeline] [data-timeline-preview]').click();

    // Wait for the split to exist rather than for the text to be unchanged: the
    // text is unchanged the whole time, so polling on it proves nothing and
    // returns before the animation has started.
    await expect
      .poll(
        () =>
          page.evaluate(
            (id) =>
              document.querySelectorAll(
                `.sl-stage [data-bc-sid="${CSS.escape(id)}"] [data-motion-unit="letter"]`
              ).length,
            box.sid
          ),
        { timeout: 3000 }
      )
      .toBeGreaterThan(0);

    const state = await page.evaluate((id) => {
      const el = document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!;
      const animated = el.getAnimations({ subtree: true });
      return {
        letters: el.querySelectorAll('[data-motion-unit="letter"]').length,
        words: el.querySelectorAll('[data-motion-unit="word"]').length,
        animations: animated.length,
        delays: [...new Set(animated.map((a) => Number(a.effect!.getTiming().delay)))].sort(
          (a, b) => a - b
        ),
        lines: el.getClientRects().length,
        width: Math.round(el.getBoundingClientRect().width)
      };
    }, box.sid);

    // "One engine, two products": 24 graphemes, 21 of them not spaces.
    expect(state.letters).toBe(24);
    expect(state.words).toBe(4);
    expect(state.animations).toBe(21);
    // A beat of 45ms between pieces, and every one of them distinct.
    expect(state.delays.slice(0, 4)).toEqual([0, 45, 90, 135]);

    // The line did not re-break and the box did not change width: the words are
    // wrapped in `white-space: pre` holders, so the break opportunities are still
    // only at the spaces.
    expect(state.lines).toBe(before.lines);
    expect(state.width).toBe(before.width);

    // And afterwards the DOM is exactly what it was — not merely the same text.
    await page.waitForTimeout(2500);
    expect(await titleOf(page, box.sid)).toEqual(before);
  });

  /**
   * The caret's block is the one region the editor's MutationObserver speaks
   * for, so a box being typed in is animated whole rather than split — a motion
   * the reader can see instead of a document they have to undo.
   */
  test('animates the box whole while the caret is inside it', async ({ page }) => {
    await openDeck(page);
    // Pinned: this compares the drawn box before and after, and the pane opening
    // for the new motion re-fits the slide. See `pinZoom`.
    await pinZoom(page);
    const box = await selectFirstBox(page);

    await panel(page).locator('[data-tab="motion"]').click();
    await panel(page).getByLabel('모션 추가').click();
    await page.waitForTimeout(200);
    await panel(page).locator('[data-preset="letterByLetter"]').click();
    await page.waitForTimeout(400);

    // Enter the box: a double click puts a caret in its text.
    await page.mouse.dblclick(box.x, box.y);
    await page.waitForTimeout(300);

    await page.locator('[data-timeline] [data-timeline-preview]').click();
    await page.waitForTimeout(250);

    const state = await page.evaluate((id) => {
      const el = document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!;
      return {
        pieces: el.querySelectorAll('[data-motion-unit]').length,
        animations: el.getAnimations({ subtree: true }).length
      };
    }, box.sid);

    expect(state.pieces).toBe(0);
    expect(state.animations).toBe(1);
  });
});

/**
 * A path a shape travels.
 *
 * The first step that is not an effect: it needs a *style* written before the
 * animation (`offset-path`) and animates one property (`offset-distance`), which
 * is why it is a kind of step rather than a thirteenth effect.
 *
 * Measured before it was built, and it corrected the spec: a path does **not**
 * collide with `translate`. The offset transform is its own slot, so a shape can
 * travel a path and fade, pulse or grow at the same time — and keep the rotation
 * the document gave it.
 *
 * What only a browser shows is the two halves of authoring it: the path drawn on
 * the shape with points a reader drags, and the shape actually travelling.
 */
test.describe('a motion path', () => {
  test('is chosen from the gallery, drawn on the shape, and dragged by its points', async ({
    page
  }) => {
    await openDeck(page);
    await selectFirstBox(page);

    await panel(page).locator('[data-tab="motion"]').click();
    await panel(page).getByLabel('모션 추가').click();
    await page.waitForTimeout(200);

    // The paths are in the same panel as the motions, after them: a path is one
    // more thing a shape does, and it runs *beside* the others rather than
    // instead of one.
    expect(await panel(page).locator('[data-path-preset]').count()).toBeGreaterThan(4);
    await panel(page).locator('[data-path-preset="arc"]').click();
    await page.waitForTimeout(400);

    const step = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const resources = (root.content ?? [])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'resources');
      const track = (resources?.content ?? [])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'motionTrack');
      const node = store.getNode((track?.content ?? [])[0]);
      return { sid: node.sid, attrs: { ...node.attributes } };
    });

    expect(step.attrs).toMatchObject({ kind: 'path', facing: 'fixed', target: 'shape-1' });
    expect(step.attrs.path).toHaveLength(3);
    // Every preset starts where the shape already is, so choosing one never
    // makes the shape jump before it moves.
    expect(step.attrs.path[0]).toEqual({ x: 0, y: 0 });

    // Selecting the bar draws the path on the shape — the only place a route
    // across a slide can be edited.
    await page.locator('[data-timeline] .sl-timeline-bar').first().click();
    await expect(page.locator('[data-motion-path]')).toHaveCount(1);
    await expect(page.locator('[data-path-point]')).toHaveCount(3);
    // And a dot between each pair, which adds a bend where the reader points.
    await expect(page.locator('[data-path-add]')).toHaveCount(2);
    await expect(page.locator('[data-timeline] .sl-timeline-bar').first()).toContainText('경로');

    // Drag the middle point upwards; the document follows.
    const middle = (await page.locator('[data-path-point="1"]').boundingBox())!;
    await page.mouse.move(middle.x + 6, middle.y + 6);
    await page.mouse.down();
    await page.mouse.move(middle.x + 6, middle.y - 90, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const moved = await page.evaluate(
      (sid) => (window as any).editor.dataStore.getNode(sid).attributes.path,
      step.sid
    );
    expect(moved[1].y).toBeLessThan(step.attrs.path[1].y);
    // The ends stayed where they were: a drag moves one point.
    expect(moved[0]).toEqual(step.attrs.path[0]);
    expect(moved[2]).toEqual(step.attrs.path[2]);

    // Adding a bend, and taking one away again.
    await page.locator('[data-path-add="0"]').click();
    await expect.poll(() => page.locator('[data-path-point]').count()).toBe(4);
    await page.locator('[data-path-point="1"]').dblclick();
    await expect.poll(() => page.locator('[data-path-point]').count()).toBe(3);
  });

  test('travels, and leaves nothing behind when it is over', async ({ page }) => {
    await openDeck(page);
    // Pinned: the shape's resting position is compared against where it lands,
    // and the pane opening for the path would re-fit the slide between the two.
    await pinZoom(page);
    const box = await selectFirstBox(page);
    const rest = await page.evaluate((sid) => {
      const r = document
        .querySelector(`.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`)!
        .getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y) };
    }, box.sid);

    await panel(page).locator('[data-tab="motion"]').click();
    await panel(page).getByLabel('모션 추가').click();
    await page.waitForTimeout(200);
    await panel(page).locator('[data-path-preset="arc"]').click();
    await page.waitForTimeout(400);

    await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));
    await page.locator('[data-timeline] [data-timeline-preview]').click();

    // Mid-flight: off its rest position, with the style the stage wrote.
    const flying = await expect
      .poll(
        () =>
          page.evaluate((sid) => {
            const el = document.querySelector(
              `.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`
            ) as HTMLElement;
            const r = el.getBoundingClientRect();
            return {
              x: Math.round(r.x),
              y: Math.round(r.y),
              hasPath: el.style.offsetPath.startsWith('path('),
              distance: getComputedStyle(el).offsetDistance
            };
          }, box.sid),
        { timeout: 3000 }
      )
      .toMatchObject({ hasPath: true });
    void flying;

    const during = await page.evaluate((sid) => {
      const r = document
        .querySelector(`.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`)!
        .getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y) };
    }, box.sid);
    expect(during.x === rest.x && during.y === rest.y).toBe(false);

    // And afterwards: back where it rests, with the style taken back. A shape
    // left with an `offset-path` sits wherever the last frame put it, in the
    // editor, with nothing on screen to say why.
    await page.waitForTimeout(2200);
    const after = await page.evaluate((sid) => {
      const el = document.querySelector(
        `.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`
      ) as HTMLElement;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), path: el.style.offsetPath };
    }, box.sid);
    expect(after).toEqual({ ...rest, path: '' });
  });
});

/**
 * One motion on several shapes, a beat apart.
 *
 * What every tool calls "apply to all", and what a reader means by animating a
 * group: three shapes that rise one after another. It writes a step *per shape*
 * rather than one step naming three, because the model already says it — three
 * steps, `withPrevious`, delays 0, 120, 240 — and each shape then has its own bar
 * to drag, rather than a group to dissolve to get at the third one.
 */
test.describe('a motion on several shapes', () => {
  test('gives each one its own bar, a beat apart', async ({ page }) => {
    await openDeck(page);
    // The slide of shapes: three rectangles, which is what a group gesture is for.
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(500);

    const shapes = await visibleBoxes(page, '.sl-shape, .sl-text-frame');
    expect(shapes.length).toBeGreaterThan(2);

    /**
     * Selected through the model, not by shift-clicking.
     *
     * Shift-click is a gesture with its own tests, and using it here would make
     * this one depend on which shapes happen to overlap on the sample slide: two
     * of them do, so a shift-click on the second landed on the first and *removed*
     * it from the selection. What this test is about is what a tile does with a
     * selection of three.
     */
    const wanted = shapes.slice(0, 3).map((shape) => shape.sid);
    await page.evaluate(
      (nodeIds) => (window as any).editor.executeCommand('setNode', { nodeIds }),
      wanted
    );
    await page.waitForTimeout(300);

    const chosen = await page.evaluate(
      () => ((window as any).editor.selection?.nodeIds ?? []).length
    );
    expect(chosen).toBe(3);

    await panel(page).locator('[data-tab="motion"]').click();
    await panel(page).getByLabel('모션 추가').click();
    await page.waitForTimeout(200);

    // The panel says what a tile will do, and how far apart.
    await expect(panel(page)).toContainText(`선택한 ${chosen}개에 적용`);
    await panel(page).getByLabel('상자 간격').fill('200');
    await panel(page).locator('[data-preset="rise"]').click();
    await page.waitForTimeout(500);

    const bars = await page.evaluate(() =>
      [...document.querySelectorAll('[data-timeline] .sl-timeline-bar')].map((bar) => ({
        start: Number(bar.getAttribute('data-start')),
        track: bar.closest('.sl-timeline-track')?.getAttribute('data-track') ?? ''
      }))
    );

    // A bar per shape, each in its own track, two hundred milliseconds apart.
    expect(bars).toHaveLength(chosen);
    expect(new Set(bars.map((bar) => bar.track)).size).toBe(chosen);
    expect(bars.map((bar) => bar.start)).toEqual(
      Array.from({ length: chosen }, (_, index) => index * 200)
    );

    // One gesture, so one undo.
    await page.evaluate(() => (window as any).editor.undo());
    await expect
      .poll(() => page.locator('[data-timeline] .sl-timeline-bar').count())
      .toBe(0);
  });
});

/**
 * A combination: two motions at once, from one tile.
 *
 * The presets this model could not hold until the timeline learned to composite —
 * a second motion on one shape used to lose silently. What only a browser shows
 * is that one click writes both steps, that they run at the same moment, and that
 * one undo takes the whole combination back.
 */
test.describe('a combination of motions', () => {
  test('writes both steps at one moment, and undoes as one', async ({ page }) => {
    await openDeck(page);
    const box = await selectFirstBox(page);

    await panel(page).locator('[data-tab="motion"]').click();
    await panel(page).getByLabel('모션 추가').click();
    await page.waitForTimeout(200);
    // A lower bound and the tile this test is about, rather than the table's
    // length: pinning the count made adding a preset a failing test, which is a
    // test of the table rather than of the gallery.
    expect(await panel(page).locator('[data-combo]').count()).toBeGreaterThan(4);
    await panel(page).locator('[data-combo="riseAndGrow"]').click();
    await page.waitForTimeout(500);

    const bars = await page.evaluate(() =>
      [...document.querySelectorAll('[data-timeline] .sl-timeline-bar')].map((bar) => ({
        effect: bar.getAttribute('data-effect'),
        start: Number(bar.getAttribute('data-start')),
        lane: bar.getAttribute('data-lane'),
        composite: bar.getAttribute('data-composite')
      }))
    );

    // 올라오며 커지기: a fly and a grow, both starting at zero, the second added
    // to the first — which is the whole reason the combination exists.
    expect(bars).toHaveLength(2);
    expect(bars.map((bar) => bar.effect)).toEqual(['fly', 'grow']);
    expect(bars.map((bar) => bar.start)).toEqual([0, 0]);
    expect(bars.map((bar) => bar.lane)).toEqual(['0', '1']);
    expect(bars[1].composite).toBe('add');

    // On the slide, both are on the shape at once.
    await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));
    await page.locator('[data-timeline] [data-timeline-preview]').click();
    await expect
      .poll(
        () =>
          page.evaluate(
            (sid) =>
              document
                .querySelector(`.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`)!
                .getAnimations().length,
            box.sid
          ),
        { timeout: 3000 }
      )
      .toBe(2);

    // One click, one undo.
    await page.waitForTimeout(1200);
    await page.evaluate(() => (window as any).editor.undo());
    await expect.poll(() => page.locator('[data-timeline] .sl-timeline-bar').count()).toBe(0);
  });
});

/**
 * Drawing a path by hand, and a path that turns sharply.
 *
 * Six presets and a drag cover "something like this"; a reader who wants a
 * *particular* route has to be able to put it there. And every path was smoothed
 * through its points, which drew the zigzag preset as a wave — the one shape of
 * travel that is entirely about its corners.
 */
test.describe('authoring a path', () => {
  const pathOf = (page: Page, step: string) =>
    page.evaluate(
      (sid) => (window as any).editor.dataStore.getNode(sid).attributes,
      step
    );

  test('places points where the reader clicks, and ends on Escape', async ({ page }) => {
    await openDeck(page);
    await selectFirstBox(page);

    await panel(page).locator('[data-tab="motion"]').click();
    await panel(page).getByLabel('모션 추가').click();
    await page.waitForTimeout(200);
    await panel(page).locator('[data-path-preset="right"]').click();
    await page.waitForTimeout(400);

    await page.locator('[data-timeline] .sl-timeline-bar').first().click();
    const step = (await page.locator('[data-timeline] .sl-timeline-bar').first().getAttribute(
      'data-step'
    ))!;
    expect((await pathOf(page, step)).path).toHaveLength(2);

    // The mode is a mode, and it says so.
    const draw = page.locator('[data-path-draw]');
    await expect(draw).toHaveAttribute('aria-pressed', 'false');
    await draw.click();
    await expect(draw).toHaveAttribute('aria-pressed', 'true');

    // Three clicks on the slide, three more points — and no shape got selected
    // on the way, which is what would happen without the mode.
    const overlay = (await page.locator('.sl-overlay').boundingBox())!;
    for (const [dx, dy] of [
      [0.3, 0.7],
      [0.5, 0.35],
      [0.7, 0.75]
    ]) {
      await page.mouse.click(overlay.x + overlay.width * dx, overlay.y + overlay.height * dy);
      await page.waitForTimeout(250);
    }

    expect((await pathOf(page, step)).path).toHaveLength(5);
    await expect(page.locator('[data-path-point]')).toHaveCount(5);

    // Escape ends the drawing — the innermost thing the reader is doing — and the
    // selection it would otherwise have cleared is untouched.
    await page.keyboard.press('Escape');
    await expect(draw).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-motion-path]')).toHaveCount(1);
  });

  test('turns sharply when the reader says so', async ({ page }) => {
    await openDeck(page);
    await selectFirstBox(page);

    await panel(page).locator('[data-tab="motion"]').click();
    await panel(page).getByLabel('모션 추가').click();
    await page.waitForTimeout(200);
    // 지그재그 is the preset that ships sharp, because smoothed it is a wave.
    await panel(page).locator('[data-path-preset="zigzag"]').click();
    await page.waitForTimeout(400);

    await page.locator('[data-timeline] .sl-timeline-bar').first().click();
    const step = (await page.locator('[data-timeline] .sl-timeline-bar').first().getAttribute(
      'data-step'
    ))!;
    expect((await pathOf(page, step)).smooth).toBe(false);
    await expect(page.locator('[data-timeline]').getByLabel('모서리')).toHaveValue('sharp');

    // The route drawn on the shape is a polyline, not a curve.
    const drawn = await page.locator('[data-motion-path] path').last().getAttribute('d');
    expect(drawn).not.toContain('C');
    expect(drawn).toContain('L');

    // Rounded off, it becomes a curve — in the drawing and in what the slide runs.
    await page.locator('[data-timeline]').getByLabel('모서리').selectOption('smooth');
    await page.waitForTimeout(400);
    expect((await pathOf(page, step)).smooth).toBe(true);
    expect(await page.locator('[data-motion-path] path').last().getAttribute('d')).toContain('C');

    const target = (await pathOf(page, step)).target as string;
    await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));
    await page.locator('[data-timeline] [data-timeline-preview]').click();

    // And what the slide runs is the curve too: the drawing and the CSS are the
    // same `pathData`, so they cannot disagree about the route.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const moving = [...document.querySelectorAll<HTMLElement>('.sl-stage [data-bc-sid]')]
              .map((element) => element.style.offsetPath)
              .filter(Boolean);
            return moving[0] ?? '';
          }),
        { timeout: 3000 }
      )
      .toContain('C');
    expect(target).toBeTruthy();
  });
});

/**
 * A group's own motion, or its contents'.
 *
 * "Animate this group" means the group half the time and *the eight cards in it*
 * the other half, and they are different animations: one shape moving, or eight
 * moving a beat apart. Measured (`motion-model.md` §7a): a parent's motion already
 * carries its children, so what was missing was never the animation but the list
 * of children — and the gesture that says which the reader meant.
 */
test.describe('animating what is inside a box', () => {
  test('offers the contents, and gives each one its own bar', async ({ page }) => {
    await openDeck(page);
    // The slide with a frame that holds boxes.
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(500);

    // A container: the panel offers its contents only where there are some.
    const container = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const walk = (sid: string): string | null => {
        const node = store.getNode(sid);
        const kids = (node?.content ?? []).filter((child: unknown) => typeof child === 'string');
        const boxes = kids.filter((child: string) =>
          ['frame', 'group'].includes(store.getNode(child)?.stype)
        );
        if (boxes.length > 0) return boxes[0];
        for (const child of kids) {
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      return walk((window as any).editor.getRootId());
    });

    if (!container) {
      // The sample deck has no container on this slide; the gesture is unit-tested
      // (`boxesInside`) and the rest of this test would be about the fixture.
      test.skip();
      return;
    }

    await page.evaluate(
      (sid) => (window as any).editor.executeCommand('setNode', { nodeIds: [sid] }),
      container
    );
    await page.waitForTimeout(300);

    await panel(page).locator('[data-tab="motion"]').click();
    await panel(page).getByLabel('모션 추가').click();
    await page.waitForTimeout(200);

    const inside = panel(page).getByLabel('안의 상자에 적용');
    await expect(inside).toHaveCount(1);
    await inside.check();
    await panel(page).locator('[data-preset="rise"]').click();
    await page.waitForTimeout(500);

    const bars = await page.evaluate(() =>
      [...document.querySelectorAll('[data-timeline] .sl-timeline-bar')].map((bar) => ({
        start: Number(bar.getAttribute('data-start')),
        track: bar.closest('.sl-timeline-track')?.getAttribute('data-track') ?? ''
      }))
    );

    // A bar per child, each in its own track, a beat apart — and the container
    // itself is not one of them.
    expect(bars.length).toBeGreaterThan(1);
    expect(new Set(bars.map((bar) => bar.track)).size).toBe(bars.length);
    expect(bars.map((bar) => bar.start)).toEqual(
      Array.from({ length: bars.length }, (_, index) => index * 120)
    );
  });
});

/**
 * The filters: a colour on a step, an SVG look, and a reader who asked for less
 * motion.
 *
 * Measured before any of it was written (`motion-model.md` §7d): a `url()`
 * anywhere in a `filter` list stops the whole list interpolating, so an SVG
 * filter's animation has to run *inside* the filter — and `flood-opacity` is a
 * presentation attribute, which makes it a CSS property the Web Animations API
 * already knows how to interpolate.
 */
test.describe('filters as motion', () => {
  test('takes a colour, and animates an SVG filter it makes itself', async ({ page }) => {
    await openDeck(page);
    const box = await selectFirstBox(page);

    await panel(page).locator('[data-tab="motion"]').click();
    await panel(page).getByLabel('모션 추가').click();
    await page.waitForTimeout(200);
    await panel(page).locator('[data-preset="bloomOn"]').click();
    await page.waitForTimeout(400);

    await page.locator('[data-timeline] .sl-timeline-bar').first().click();
    await page.waitForTimeout(200);

    // The colour control is offered because the effect declares it — the same
    // rule the direction and the amount follow.
    // `exact`, because the field's own clear button is called "모션 색 지우기" and
    // an accessible name is matched by substring unless it is not.
    const colour = page.locator('[data-timeline]').getByLabel('모션 색', { exact: true });
    await expect(colour).toHaveCount(1);
    await colour.click();
    await page.locator('[data-color-panel="모션 색"] [aria-label="색상 코드"]').fill('ffcc00');
    await page.waitForTimeout(400);

    const step = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const bar = document.querySelector('[data-timeline] .sl-timeline-bar')!;
      return store.getNode(bar.getAttribute('data-step')).attributes;
    });
    expect(step.color).toContain('ffcc00');
    expect(step.effect).toBe('bloom');

    /**
     * The colour panel is closed before anything else is clicked.
     *
     * It dismisses itself on a pointer outside, in the capture phase — so the
     * click that closes it is the click that does not reach whatever it was aimed
     * at. Measured: the preview never started while the panel was open. A reader
     * presses Escape or clicks away for the same reason, and the wart is in the
     * backlog.
     */
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Playing it: the stage makes a filter, points the shape at it, and animates
    // a primitive inside it.
    await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));
    await page.locator('[data-timeline] [data-timeline-preview]').click();

    const lit = await expect
      .poll(
        () =>
          page.evaluate((sid) => {
            const el = document.querySelector(
              `.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`
            ) as HTMLElement;
            const primitive = document.querySelector('[data-motion-primitive]');
            return {
              filter: el.style.filter.startsWith('url(') ,
              opacity: primitive ? Number(getComputedStyle(primitive).floodOpacity) : -1
            };
          }, box.sid),
        { timeout: 3000 }
      )
      .toMatchObject({ filter: true });
    void lit;

    // The flood is lit part-way through, which is the animation running inside
    // the filter rather than on the shape.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const primitive = document.querySelector('[data-motion-primitive]');
          return primitive ? Number(getComputedStyle(primitive).floodOpacity) : 0;
        })
      )
      .toBeGreaterThan(0.05);

    // And nothing is left behind: no filter on the shape, no definition in the
    // document.
    await page.waitForTimeout(1800);
    expect(
      await page.evaluate((sid) => {
        const el = document.querySelector(
          `.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`
        ) as HTMLElement;
        return { filter: el.style.filter, defs: document.querySelectorAll('[data-motion-filter]').length };
      }, box.sid)
    ).toEqual({ filter: '', defs: 0 });
  });
});

/**
 * A reader who has asked for less motion.
 *
 * A duty rather than a feature: `prefers-reduced-motion` is set by people who are
 * made ill by movement, and a presentation tool that ignores it is one they cannot
 * sit through. What it does *not* mean is "show nothing" — a build's whole job is
 * to bring a shape on, so the shape still arrives; it arrives at the end of its
 * animation immediately instead of travelling there.
 */
test.describe('a deck for a reader who asked for less motion', () => {
  test('brings the shape on without moving it', async ({ page }) => {
    /**
     * Emulated on the page rather than declared with `test.use`.
     *
     * The project's `use` spreads a device descriptor, and the describe-level
     * option did not survive it — measured: `matchMedia('(prefers-reduced-motion:
     * reduce)')` was `false` inside the test. Asking the page directly is the
     * version-proof way and says what it means.
     */
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDeck(page);
    const box = await selectFirstBox(page);
    expect(
      await page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
    ).toBe(true);

    await page.evaluate(
      (nodeId) =>
        (window as any).editor.executeCommand('addBoxBuild', {
          nodeId,
          effect: 'fly',
          direction: 'left',
          amount: 0.6,
          duration: 900,
          echo: 3
        }),
      box.sid
    );
    await page.waitForTimeout(400);
    await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));
    await page.waitForTimeout(300);

    /**
     * Where the shape rests, measured *after* the motion exists.
     *
     * Because giving a slide its first motion opens the timeline, which takes
     * room from the stage, which re-fits the slide — so a position measured
     * before is a position on a differently-sized slide. The same trap the zoom
     * box fell into when the pane first appeared.
     */
    const rest = await page.evaluate(
      (sid) =>
        Math.round(
          document
            .querySelector(`.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`)!
            .getBoundingClientRect().x
        ),
      box.sid
    );
    await page.locator('[data-timeline] [data-timeline-preview]').click();

    const shown = await expect
      .poll(
        () =>
          page.evaluate((sid) => {
            const el = document.querySelector(
              `.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`
            ) as HTMLElement;
            const style = getComputedStyle(el);
            return {
              x: Math.round(el.getBoundingClientRect().x),
              visible: style.visibility === 'visible',
              opacity: style.opacity,
              // And no trail: the copies are made of the same numbers.
              echoes: document.querySelectorAll('[data-motion-echo]').length
            };
          }, box.sid),
        { timeout: 3000 }
      )
      .toMatchObject({ visible: true });
    void shown;

    const state = await page.evaluate((sid) => {
      const el = document.querySelector(
        `.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`
      ) as HTMLElement;
      return {
        x: Math.round(el.getBoundingClientRect().x),
        opacity: getComputedStyle(el).opacity,
        echoes: document.querySelectorAll('[data-motion-echo]').length
      };
    }, box.sid);

    // Arrived, not travelling: where it rests, fully opaque, with no trail.
    expect(state).toEqual({ x: rest, opacity: '1', echoes: 0 });
  });
});

/**
 * The filters CSS cannot reach, and the clock that drives them.
 *
 * `feDisplacementMap`'s `scale` and `feOffset`'s `dx` are XML attributes, not CSS
 * properties, so no Web Animation can touch them. SMIL can — and measured, its
 * clock is *scrubbable*: `pauseAnimations()` and `setCurrentTime` give the same
 * value for the same moment every time, `begin` counts from the element being
 * inserted, and two filters keep two independent clocks.
 *
 * Which is what makes it usable here: each step already gets its own `<svg>`, so
 * each step already has its own clock, and the transport can stop it with
 * everything else.
 */
test.describe('a filter that animates itself', () => {
  const filterState = (page: Page, sid: string) =>
    page.evaluate((id) => {
      const element = document.querySelector(
        `.sl-stage [data-bc-sid="${CSS.escape(id)}"]`
      ) as HTMLElement;
      const host = document.querySelector('[data-motion-filter]') as SVGSVGElement | null;
      const displaced = host?.querySelector('feDisplacementMap');
      return {
        pointsAtFilter: element.style.filter.startsWith('url('),
        clock: host ? Number(host.getCurrentTime().toFixed(2)) : null,
        paused: host ? host.animationsPaused() : null,
        scale: displaced ? Number(displaced.scale.animVal.toFixed(1)) : null
      };
    }, sid);

  test('melts, freezes with the transport, and leaves nothing behind', async ({ page }) => {
    await openDeck(page);
    const box = await selectFirstBox(page);

    await page.evaluate(
      (nodeId) =>
        (window as any).editor.executeCommand('addBoxBuild', {
          nodeId,
          effect: 'melt',
          amount: 0.6,
          duration: 1600
        }),
      box.sid
    );
    await page.waitForTimeout(400);
    await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));

    await page.locator('[data-timeline-preview]').click();

    // Running: the shape points at a filter, and the filter's own clock is going.
    await expect
      .poll(() => filterState(page, box.sid), { timeout: 3000 })
      .toMatchObject({ pointsAtFilter: true, paused: false });

    await expect.poll(() => filterState(page, box.sid).then((s) => s.scale ?? 0)).toBeGreaterThan(2);

    // Paused: the *filter's* clock stops too, which is a second kind of clock the
    // Web Animations API knows nothing about.
    await page.locator('[data-timeline-preview]').click();
    await expect
      .poll(() => filterState(page, box.sid), { timeout: 3000 })
      .toMatchObject({ paused: true });

    const held = await filterState(page, box.sid);
    expect(held.clock).toBeGreaterThan(0.1);
    await page.waitForTimeout(500);
    const still = await filterState(page, box.sid);
    // Frozen: half a second later, the same moment and the same displacement.
    expect(still.clock).toBe(held.clock);
    expect(still.scale).toBe(held.scale);

    /**
     * And the moment came from the *filter's* clock.
     *
     * A melt has no Web Animation at all, so a moment read only from those is
     * zero — measured: pausing a melt sent the playhead to the beginning and the
     * filter disappeared.
     */
    const moment = await page.evaluate(() =>
      Number((document.querySelector('[data-timeline-moment]')?.textContent ?? '0').replace('s', ''))
    );
    expect(moment).toBeGreaterThan(0.1);

    // A frame step re-seeks the filter, because the playhead is what it follows.
    await page.locator('[data-timeline-step="1"]').click();
    await page.waitForTimeout(300);
    expect((await filterState(page, box.sid)).clock!).toBeGreaterThan(held.clock!);

    // And nothing is left: no filter on the shape, no definition in the document.
    await page.locator('[data-timeline-rewind]').click();
    await page.waitForTimeout(400);
    expect(await page.locator('[data-motion-filter]').count()).toBe(0);
    expect(
      await page.evaluate(
        (sid) =>
          (document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`) as HTMLElement)
            .style.filter,
        box.sid
      )
    ).toBe('');
  });

  /** The other one: a channel split, which is `feOffset` on two colour matrices. */
  test('splits the colour channels', async ({ page }) => {
    await openDeck(page);
    const box = await selectFirstBox(page);

    await page.evaluate(
      (nodeId) =>
        (window as any).editor.executeCommand('addBoxBuild', {
          nodeId,
          effect: 'chromatic',
          amount: 0.8,
          duration: 800
        }),
      box.sid
    );
    await page.waitForTimeout(400);
    await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));
    await page.locator('[data-timeline-preview]').click();

    // The two offsets pull opposite ways, which is what a split is.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const offsets = [...document.querySelectorAll('[data-motion-filter] feOffset')];
            return offsets.map((offset) =>
              Math.round(((offset as SVGFEOffsetElement).dx.animVal ?? 0) * 10) / 10
            );
          }),
        { timeout: 3000 }
      )
      .toHaveLength(2);

    const offsets = await page.evaluate(() =>
      [...document.querySelectorAll('[data-motion-filter] feOffset')].map(
        (offset) => (offset as SVGFEOffsetElement).dx.animVal
      )
    );
    expect(offsets[0]).toBeGreaterThan(0);
    expect(offsets[1]).toBeLessThan(0);
  });
});

/**
 * A trigger: a shape that is a button.
 *
 * The third kind of start condition. `startsWith` places a step among the
 * presses, and every press is anonymous — a click anywhere advances. A trigger
 * says *that shape*, out of order, as many times as it is clicked, or never:
 * which is what makes a quiz, a menu, or an explanation revealed on demand
 * possible at all.
 *
 * The behavioural question it asks is the one only a browser can answer: a click
 * on a slide has meant "next" since the first slide projector, and now one shape
 * means something else. If the click did both, a quiz answer would advance past
 * its own tick.
 */
test.describe('a shape that is a button', () => {
  const shown = (page: Page, sid: string) =>
    page.evaluate((id) => {
      const element = document.querySelector(
        `.sl-stage [data-bc-sid="${CSS.escape(id)}"]`
      ) as HTMLElement;
      return {
        visible: getComputedStyle(element).visibility === 'visible',
        animations: element.getAnimations().length
      };
    }, sid);

  const slideNumber = (page: Page) =>
    page.evaluate(() => document.querySelector('.sl-present-hint span')?.textContent ?? '');

  test('fires what watches it, and does not advance the deck', async ({ page }) => {
    await openDeck(page);
    const boxes = await visibleBoxes(page, '.sl-text-frame');
    expect(boxes.length).toBeGreaterThan(1);

    /**
     * One command at a time, awaited.
     *
     * Two `addBoxBuild`s in one tick used to name both shapes `shape-1`, because
     * each read the document before the other committed; the name is remembered
     * as well as read now (see `_freeShapeName`). What is *still* true in one tick
     * is that both would create the slide's motion track and one step would be
     * lost — logged, and the reason this stays awaited.
     */
    await page.evaluate(
      (nodeId) => (window as any).editor.executeCommand('addBoxBuild', { nodeId, effect: 'fade' }),
      boxes[0].sid
    );
    await page.waitForTimeout(400);
    await page.evaluate(
      (nodeId) =>
        (window as any).editor.executeCommand('addBoxBuild', {
          nodeId,
          effect: 'fly',
          direction: 'down',
          duration: 500
        }),
      boxes[1].sid
    );
    await page.waitForTimeout(400);

    // The second step waits for a click on the first shape.
    const step = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const resources = (root.content ?? [])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'resources');
      const track = (resources?.content ?? [])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'motionTrack');
      return { sid: track.content[1], watch: store.getNode(track.content[0]).attributes.target };
    });
    await page.evaluate(
      ([stepId, on]) => (window as any).editor.executeCommand('setMotionStep', { stepId, on }),
      [step.sid, step.watch] as [string, string]
    );
    await page.waitForTimeout(400);

    // The pane gives it a tab of its own, because it is not a press.
    await expect(page.locator('[data-timeline] [data-press="0"]')).toHaveText('클릭');

    await page.locator('[data-present]').click();
    await page.waitForTimeout(800);

    // Waiting: the panel is not on the slide, and no press will bring it on.
    expect(await shown(page, boxes[1].sid)).toMatchObject({ visible: false });
    const at = await slideNumber(page);

    /**
     * The button has an entrance of its own, so it is hidden until the first
     * press — and a hidden element is not hit-testable. Which is a true thing
     * about the product: a button has to be *there* to be clicked.
     */
    await page.mouse.click(200, 60);
    await page.waitForTimeout(600);
    expect(await shown(page, boxes[0].sid)).toMatchObject({ visible: true });

    const button = await page.evaluate((sid) => {
      const rect = document
        .querySelector(`.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`)!
        .getBoundingClientRect();
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    }, boxes[0].sid);

    await page.mouse.click(button.x, button.y);
    await page.waitForTimeout(300);

    // Fired: the panel is on the slide, animating — and the deck stayed put.
    expect(await shown(page, boxes[1].sid)).toMatchObject({ visible: true, animations: 1 });
    expect(await slideNumber(page)).toBe(at);

    // And a click anywhere else still means what it always meant.
    await page.mouse.click(button.x, button.y + 260);
    await page.waitForTimeout(400);
    expect(await slideNumber(page)).not.toBe(at);
  });

  /**
   * And the pane says when the button can be pressed.
   *
   * The test above proves the true and invisible thing: a button with an entrance
   * of its own is hidden until its press, a hidden box is not hit-testable, so the
   * trigger does nothing for the first clicks. Correct — and a reader who built
   * that has no way to know. Both halves were already in the pane (what is on the
   * slide after N presses, and how many presses there are); what was missing was
   * the sentence. See `triggerWindow`, unit-tested in `office-slides`.
   */
  test('says when the shape a trigger waits for can be clicked', async ({ page }) => {
    await openDeck(page);
    const boxes = await visibleBoxes(page, '.sl-text-frame');

    const build = async (sid: string) => {
      await page.evaluate(
        (nodeId) =>
          (window as any).editor.executeCommand('addBoxBuild', { nodeId, effect: 'fade', duration: 300 }),
        sid
      );
      await page.waitForTimeout(400);
    };
    await build(boxes[0].sid);
    await build(boxes[1].sid);

    const track = () =>
      page.evaluate(() => {
        const store = (window as any).editor.dataStore;
        const root = store.getNode((window as any).editor.getRootId());
        const resources = (root.content ?? [])
          .map((sid: string) => store.getNode(sid))
          .find((node: any) => node?.stype === 'resources');
        const found = (resources?.content ?? [])
          .map((sid: string) => store.getNode(sid))
          .find((node: any) => node?.stype === 'motionTrack');
        return (found?.content ?? []) as string[];
      });

    const [first, second] = await track();
    const watched = await page.evaluate(
      (sid) => (window as any).editor.dataStore.getNode(sid).attributes.target as string,
      first
    );
    await page.evaluate(
      ([stepId, on]) => (window as any).editor.executeCommand('setMotionStep', { stepId, on }),
      [second, watched] as [string, string]
    );
    await page.waitForTimeout(400);

    /**
     * The step left the numbered presses for the 클릭 tab — it is not a press —
     * so that is where its bar is now, and selecting it is what opens the
     * inspector.
     */
    const pick = async () => {
      await page.locator('[data-timeline] [data-press="0"]').click();
      await page.waitForTimeout(250);
      await page.evaluate((sid) => {
        const bar = [...document.querySelectorAll('[data-timeline] .sl-timeline-bar')].find(
          (node) => node.getAttribute('data-step') === sid
        );
        (bar as HTMLElement | undefined)?.click();
      }, second);
      await page.waitForTimeout(300);
    };
    await pick();

    // The button has an entrance of its own, so it arrives on the first press.
    await expect(page.locator('[data-step-editor] [data-trigger-note]')).toHaveText(
      '1번째 프레스 뒤부터 누를 수 있습니다'
    );

    // Take that entrance away and the button is on the slide from the start —
    // nothing to say, and nothing said. A note a reader learns to ignore costs
    // the next one its meaning.
    await page.evaluate(
      (stepId) => (window as any).editor.executeCommand('removeMotionStep', { stepIds: [stepId] }),
      first
    );
    await page.waitForTimeout(500);
    await pick();
    await expect(page.locator('[data-step-editor] [data-trigger-note]')).toHaveCount(0);
  });
});

/**
 * A motion must not erase what the shape already looks like.
 *
 * Measured on 2026-08-20, and it was live in two ways at once. A shape with a
 * 흐림 effect carries `filter: blur(3px)` from `effectsCss`; one glow step over it
 * is the first of its press, so it ran `replace`, and `filter` holds a **list** —
 * the computed value came out as the glow alone. The blur was gone while the
 * motion ran, and gone *for good* afterwards, because the stage cleared the
 * property that the renderer had been the one to write.
 *
 * Only a browser shows either half: both are about the computed value of a
 * property nobody wrote a keyframe for.
 */
test.describe('a motion over a shape that is already styled', () => {
  test('keeps the shape’s own filter while it runs, and gives it back after', async ({ page }) => {
    await openDeck(page);
    const boxes = await visibleBoxes(page, '.sl-text-frame');
    const sid = boxes[0].sid;

    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setBoxStyle', {
          nodeId: id,
          effects: [{ kind: 'blur', blur: 45, visible: true }]
        }),
      sid
    );
    await page.waitForTimeout(400);

    const drawn = () =>
      page.evaluate((id) => {
        const element = document.querySelector<HTMLElement>(
          `.sl-stage [data-bc-sid="${CSS.escape(id)}"]`
        )!;
        return {
          computed: getComputedStyle(element).filter,
          inline: element.style.filter,
          // `composite` is a `KeyframeEffect`'s, and `AnimationEffect` is the base the
          // DOM types hand back — the cast says which one this is rather than widening
          // the whole expression to `any`.
          composites: element
            .getAnimations()
            .map((animation) => (animation.effect as KeyframeEffect).composite)
        };
      }, sid);

    expect((await drawn()).computed).toBe('blur(3px)');

    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('addBoxBuild', {
          nodeId: id,
          effect: 'glow',
          duration: 1400
        }),
      sid
    );
    await page.waitForTimeout(500);

    await page.locator('[data-timeline-preview]').click();
    await page.waitForTimeout(700);

    const during = await drawn();
    // The blur is still first in the list, and the glow is on top of it.
    expect(during.computed).toContain('blur(3px)');
    expect(during.computed).toContain('drop-shadow(');
    // Which is what `composite: 'add'` buys: the step's own frames add to the
    // list rather than becoming it.
    expect(during.composites).toContain('add');

    /*
     * And afterwards the shape is as the document drew it.
     *
     * The *computed* value, polled: the inline one is `blur(3px)` throughout —
     * an animation is a layer above it — so asserting on the inline string would
     * have passed against the bug this test is for. What was broken is what the
     * shape looks like once the press is over, and the press has to be over: a
     * 1.4-second glow with `fill: 'both'` holds its last frame until it is
     * cancelled.
     */
    await expect.poll(async () => (await drawn()).computed, { timeout: 8000 }).toBe('blur(3px)');
    expect((await drawn()).inline).toBe('blur(3px)');
  });

  /**
   * The gradient that turns — the one motion that needs a registered custom
   * property, because `background-image` is discrete: measured, a gradient from
   * 0deg to 180deg has no midpoint at all.
   */
  test('turns a gradient through its track, which a keyframe could not', async ({ page }) => {
    await openDeck(page);
    const boxes = await visibleBoxes(page, '.sl-text-frame');
    const sid = boxes[0].sid;

    // The registration is what makes the variable a number rather than a string —
    // one per fill, because a shape's fills are a list.
    expect(await page.evaluate(() => document.querySelector('[data-sl-tracks]')?.textContent)).toContain(
      '@property --sl-f0-angle'
    );

    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setBoxStyle', {
          nodeId: id,
          fills: [
            {
              kind: 'linear',
              angle: 90,
              opacity: 1,
              visible: true,
              stops: [
                { offset: 0, color: '#ffffff' },
                { offset: 1, color: '#2563eb' }
              ]
            }
          ]
        }),
      sid
    );
    await page.waitForTimeout(400);

    const angleNow = () =>
      page.evaluate((id) => {
        const element = document.querySelector<HTMLElement>(
          `.sl-stage [data-bc-sid="${CSS.escape(id)}"]`
        )!;
        const style = getComputedStyle(element);
        return {
          sweep: style.getPropertyValue('--sl-f0-angle').trim(),
          // The gradient itself is a layer element now; the track stays on the
          // shape, which is where the animation writes it.
          drawn:
            /(-?[\d.]+)deg/.exec(
              getComputedStyle(element.querySelector('.sl-fill[data-fill="0"]')!).backgroundImage
            )?.[1] ?? null
        };
      }, sid);

    // At rest the track is neutral and the gradient is exactly what was written.
    expect(await angleNow()).toEqual({ sweep: '0deg', drawn: '90' });

    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('addBoxBuild', {
          nodeId: id,
          effect: 'sweep',
          amount: 1,
          duration: 1600
        }),
      sid
    );
    await page.waitForTimeout(500);
    await page.locator('[data-timeline-preview]').click();
    await page.waitForTimeout(800);

    const turning = await angleNow();
    /**
     * A midpoint at all is the whole result: the track interpolates where the
     * gradient itself cannot.
     *
     * Bounded against the effect's **own end** rather than against 350°, which is
     * what this said and which was the old amount range written into the test.
     * `sweep` counts turns now — `amount: 1` is three of them — so a mid-run value
     * of 722° is correct and the old bound reported it as broken.
     */
    const at = Number(turning.sweep.replace('deg', ''));
    expect(at).toBeGreaterThan(10);
    expect(at).toBeLessThan(3 * 360);
    // And the shape's own 90deg is still in there — the track adds to it.
    expect(Number(turning.drawn)).toBeGreaterThan(90);
  });
});

/**
 * A shape's fills are a **list**, and so are its effects.
 *
 * Which is the fault this whole mechanism was rewritten for. The first version
 * had one variable per property — `--sl-sweep`, "the gradient's angle" — and
 * measured on a two-fill shape, one 그라디언트 돌기 step turned **both** of them.
 * A motion that says `background-image` is naming a list rather than a thing in
 * it, so a track's identity has to include *which item*.
 *
 * Only a browser shows it: the assertion is about two computed values that have
 * to differ, on one element, from one animation.
 */
test.describe('a motion aimed at one item of a list', () => {
  const stackUp = (page: Page, sid: string) =>
    page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setBoxStyle', {
          nodeId: id,
          fills: [
            {
              kind: 'linear',
              angle: 0,
              opacity: 0.5,
              visible: true,
              stops: [
                { offset: 0, color: '#ffffff' },
                { offset: 1, color: '#000000' }
              ]
            },
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
          ],
          effects: [
            { kind: 'drop', x: 0, y: 60, blur: 120, spread: 0, color: '#000000', visible: true },
            { kind: 'drop', x: 0, y: 15, blur: 0, spread: 15, color: '#22d3ee', visible: true }
          ]
        }),
      sid
    );

  const drawn = (page: Page, sid: string) =>
    page.evaluate((id) => {
      const element = document.querySelector<HTMLElement>(
        `.sl-stage [data-bc-sid="${CSS.escape(id)}"]`
      )!;
      const style = getComputedStyle(element);
      /**
       * The angles come off the fills' own elements, in the **model's** order —
       * the layers are drawn bottom-first, so `data-fill` is what to ask by
       * rather than a position among siblings. The tracks are still read from the
       * shape, which is where they are animated. See `fill-layers.ts`.
       */
      const angleOf = (at: number) => {
        const layer = element.querySelector(`.sl-fill[data-fill="${at}"]`);
        return layer
          ? /(-?[\d.]+)deg/.exec(getComputedStyle(layer).backgroundImage)?.[0] ?? null
          : null;
      };
      return {
        angles: [angleOf(0), angleOf(1)].filter((angle): angle is string => !!angle),
        firstFill: style.getPropertyValue('--sl-f0-angle').trim(),
        secondFill: style.getPropertyValue('--sl-f1-angle').trim(),
        firstShadow: style.getPropertyValue('--sl-s0-lift').trim(),
        secondShadow: style.getPropertyValue('--sl-s1-lift').trim(),
        shadow: style.boxShadow
      };
    }, sid);

  test('turns the second gradient and leaves the first alone', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page, '.sl-text-frame');
    await stackUp(page, box.sid);
    await page.waitForTimeout(400);

    // At rest both fills are exactly as written, and every track is neutral.
    const rest = await drawn(page, box.sid);
    expect(rest.angles).toEqual(['0deg', '90deg']);
    expect([rest.firstFill, rest.secondFill]).toEqual(['0deg', '0deg']);

    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('addBoxBuild', {
          nodeId: id,
          effect: 'sweep',
          amount: 1,
          duration: 1600,
          partAt: 1
        }),
      box.sid
    );
    await page.waitForTimeout(500);
    await page.locator('[data-timeline-preview]').click();
    await page.waitForTimeout(800);

    const turning = await drawn(page, box.sid);
    // The one the step named is turning…
    expect(Number(turning.secondFill.replace('deg', ''))).toBeGreaterThan(10);
    // …and the one it did not is not. This is the assertion the shared variable
    // failed: both used to move together.
    expect(turning.firstFill).toBe('0deg');
    expect(turning.angles[0]).toBe('0deg');
    // Nor did it touch the shadows, which are a different list entirely.
    expect([turning.firstShadow, turning.secondShadow]).toEqual(['1', '1']);
  });

  test('grows the second shadow and leaves the first alone', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page, '.sl-text-frame');
    await stackUp(page, box.sid);
    await page.waitForTimeout(400);

    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('addBoxBuild', {
          nodeId: id,
          effect: 'deepen',
          amount: 1,
          duration: 1600,
          partAt: 1
        }),
      box.sid
    );
    await page.waitForTimeout(500);
    await page.locator('[data-timeline-preview]').click();
    await page.waitForTimeout(800);

    const growing = await drawn(page, box.sid);
    expect(Number(growing.secondShadow)).toBeGreaterThan(1);
    expect(growing.firstShadow).toBe('1');
    /*
     * And in the drawn value: the first shadow is still `0px 4px 8px 0px` and the
     * second one is bigger than the `0px 1px 0px 1px` it was written as. Which is
     * what neither composite could do — an additive `box-shadow` animation
     * concatenates a second shadow onto the list rather than scaling one of them,
     * and a replacing one erases both.
     */
    expect(growing.shadow).toContain('0px 4px 8px 0px');
    expect(growing.shadow).not.toContain('0px 1px 0px 1px');
  });

  /** And the reader can say which, which is the row that makes it reachable. */
  test('offers the target’s fills by name, and only where it means something', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page, '.sl-text-frame');
    await stackUp(page, box.sid);
    await page.waitForTimeout(400);

    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('addBoxBuild', {
          nodeId: id,
          effect: 'sweep',
          duration: 900
        }),
      box.sid
    );
    await page.waitForTimeout(500);
    await page.locator('[data-timeline] .sl-timeline-bar').first().click();
    await page.waitForTimeout(300);

    const target = page.locator('[data-step-editor]').getByLabel('모션 대상');
    await expect(target).toHaveCount(1);
    // Numbered as the paint panel draws them, and named for what they are.
    await expect(target.locator('option')).toHaveCount(2);
    await expect(target.locator('option').nth(1)).toHaveText('2. 그라디언트');

    await target.selectOption('1');
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => {
        const store = (window as any).editor.dataStore;
        const bar = document.querySelector('[data-timeline] .sl-timeline-bar')!;
        return store.getNode(bar.getAttribute('data-step')).attributes.partAt;
      })
    ).toBe(1);

    // A fade animates the shape, so there is nothing to choose and no row.
    await page.locator('[data-step-editor]').getByLabel('효과').selectOption('fade');
    await page.waitForTimeout(400);
    await expect(page.locator('[data-step-editor]').getByLabel('모션 대상')).toHaveCount(0);
  });
});

/**
 * A motion that moves a **fill** rather than the shape.
 *
 * Three of these were impossible until a shape's fills were drawn as elements
 * instead of as one `background`, and the walls were specific: `cover` cannot be
 * multiplied, `background-image` has no alpha, and two pictures in one property
 * cannot cross-fade. The arithmetic is unit-tested in
 * `office-slides/test/fill-layers.test.ts`; what only a browser shows is that the
 * variable animated on the *shape* reaches a picture two elements down, which is
 * the thing that was quietly wrong first (`inherits: false`).
 */
test.describe('a motion that moves the fill', () => {
  const picture = (colour: string) =>
    `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect width='200' height='120' fill='%23${colour}'/%3E%3C/svg%3E`;

  const twoPictures = (page: Page, sid: string) =>
    page.evaluate(
      ([id, top, under]) =>
        (window as any).editor.executeCommand('setBoxStyle', {
          nodeId: id,
          fills: [
            { kind: 'image', src: top, fit: 'cover', visible: true },
            { kind: 'image', src: under, fit: 'cover', visible: true }
          ]
        }),
      [sid, picture('ff0000'), picture('00cc44')]
    );

  /**
   * The Ken Burns zoom. `background-size: calc(100% * 1.4)` is a different *fit*
   * rather than a closer view of the same one — so this is a `scale` on an image
   * element, which is also composited and therefore cheaper than the pan was.
   */
  test('brings one picture closer and leaves the other where it is', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page, '.sl-text-frame');
    await twoPictures(page, box.sid);
    await page.waitForTimeout(400);

    // At rest both pictures are exactly as drawn.
    expect((await drawnFill(page, box.sid, 0))?.image?.scale).toBe('1');
    expect((await drawnFill(page, box.sid, 1))?.image?.scale).toBe('1');

    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('addBoxBuild', {
          nodeId: id,
          effect: 'bgZoom',
          amount: 1,
          duration: 1600,
          partAt: 1
        }),
      box.sid
    );
    await page.waitForTimeout(500);
    await page.locator('[data-timeline-preview]').click();
    await page.waitForTimeout(800);

    /**
     * The picture the step named is growing — and this is the assertion that
     * caught `inherits: false`: the variable animated on the shape while the
     * image's own computed value stayed at the registration's initial value.
     */
    const zooming = Number((await drawnFill(page, box.sid, 1))?.image?.scale);
    expect(zooming).toBeGreaterThan(1.05);
    // …and the one it did not name is not, which is what naming the fill buys.
    expect((await drawnFill(page, box.sid, 0))?.image?.scale).toBe('1');
  });

  /**
   * A cross-fade, which `background` could not do in any form: an image in one
   * has no alpha, and the wash that stood in for a fill's opacity was fully
   * transparent — a control that did nothing.
   */
  test('fades the top picture and reveals the one under it', async ({ page }) => {
    await openDeck(page);
    const [box] = await visibleBoxes(page, '.sl-text-frame');
    await twoPictures(page, box.sid);
    await page.waitForTimeout(400);

    expect((await drawnFill(page, box.sid, 0))?.opacity).toBe('1');

    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('addBoxBuild', {
          nodeId: id,
          effect: 'fillOut',
          duration: 1600,
          partAt: 0
        }),
      box.sid
    );
    await page.waitForTimeout(500);
    await page.locator('[data-timeline-preview]').click();
    await page.waitForTimeout(800);

    const crossing = await drawnFill(page, box.sid, 0);
    expect(Number(crossing?.opacity)).toBeLessThan(0.9);
    // The one underneath does not move: that is what makes it a cross-fade
    // rather than the shape fading.
    expect((await drawnFill(page, box.sid, 1))?.opacity).toBe('1');
  });
});

/**
 * Going **backwards** through a show, which is the half a presenter uses when
 * something has gone wrong.
 *
 * Three faults were measured here before any of it worked, and each one is
 * invisible in the code of either half:
 *
 * - stepping back left the slide entirely and arrived at the previous one with
 *   `played` at zero — a *blank* slide, so a presenter who had lost their place
 *   lost the slide too and had to click the whole build again;
 * - a shape that had flown out **came back** on the next press, because an exit
 *   was only holding its end state through its own animation and the next press
 *   does not run it;
 * - and a shape whose one motion was 날아가기 was invisible from the moment the
 *   slide arrived, because every build's target was hidden until it played and
 *   only `fadeOut` was excused by name.
 *
 * The arithmetic is in `office-slides/test/timeline.test.ts`
 * (`hiddenUntilPlayed`). What only a browser shows is that the press a presenter
 * comes back to is *settled* rather than replayed.
 */
test.describe('stepping back through a show', () => {
  /** A shape that comes in, a shape that goes out, and a shape that follows. */
  const story = async (page: Page) => {
    const boxes = await visibleBoxes(page);
    const [first, second] = boxes;
    const build = (sid: string, effect: string) =>
      page.evaluate(
        ([id, name]) =>
          (window as any).editor.executeCommand('addBoxBuild', {
            nodeId: id,
            effect: name,
            duration: 300
          }),
        [sid, effect]
      );
    // press 1: the first shape arrives and then leaves (a second motion on one
    // shape follows the first, which is PowerPoint's rule and this product's).
    await build(first.sid, 'fade');
    await build(first.sid, 'flyOut');
    // press 2: the second shape arrives.
    await build(second.sid, 'fade');
    await page.waitForTimeout(500);
    return { first, second };
  };

  test('un-plays one press at a time, and settles rather than replaying', async ({ page }) => {
    await openDeck(page);
    const { first, second } = await story(page);

    await page.locator('[data-present]').click();
    await page.waitForTimeout(400);
    await expect(page.locator('.sl-present-hint [data-builds]')).toHaveText('0 / 2');

    await page.keyboard.press('ArrowRight');
    // Press 1 ran both of the first shape's steps: it arrived and left.
    await expect(page.locator('.sl-present-hint [data-builds]')).toHaveText('1 / 2');

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.sl-present-hint [data-builds]')).toHaveText('2 / 2');
    /*
     * Polled rather than slept on, which is the difference between a test that
     * passes and one that passes *under load*: what is being waited for is a
     * press being drawn, and how long that takes is not this test's business.
     */
    await expect
      .poll(async () => (await shownState(page, first.sid))?.visibility)
      // The exit stays played: this is the shape that used to come back.
      .toBe('hidden');
    await expect
      .poll(async () => (await shownState(page, second.sid))?.visibility)
      .toBe('visible');

    // Back one press: the second shape is waiting again, and the first is still
    // gone — because at press 1 it had already left.
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.sl-present-hint [data-builds]')).toHaveText('1 / 2');
    await expect
      .poll(async () => (await shownState(page, second.sid))?.visibility)
      .toBe('hidden');

    // Back to the beginning of the slide, not out of it.
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.sl-present-hint [data-builds]')).toHaveText('0 / 2');
    await expect
      .poll(async () => (await shownState(page, first.sid))?.visibility)
      .toBe('hidden');
  });

  test('comes back into a slide with everything on it', async ({ page }) => {
    await openDeck(page);
    const { first, second } = await story(page);

    await page.locator('[data-present]').click();
    await page.waitForTimeout(400);

    // Through the slide's two presses and on to the next slide.
    for (let press = 0; press < 3; press += 1) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(800);
    }
    const showing = () =>
      page.evaluate(() => document.querySelector('.sl-stage')?.getAttribute('data-focus') ?? '');
    const left = await showing();

    await page.keyboard.press('ArrowLeft');

    // The slide it came back to is the one before, at its **end** — which is what
    // a presenter who pressed Back is looking for. It used to be blank.
    await expect.poll(showing).not.toBe(left);
    await expect(page.locator('.sl-present-hint [data-builds]')).toHaveText('2 / 2');
    await expect
      .poll(async () => (await shownState(page, second.sid))?.visibility)
      .toBe('visible');
    await expect
      .poll(async () => (await shownState(page, first.sid))?.visibility)
      .toBe('hidden');
  });
});

/**
 * A fill turning a colour and coming back.
 *
 * The colour track is the last of the family, and the one with no constant neutral:
 * a shape's fill is whatever the document says, and a registered custom property
 * always carries its initial value, so there is no fallback to return to. The shape
 * declares *its own colour* as the variable's value and the effect uses a **single
 * keyframe**, whose implicit start and end take that underlying value.
 *
 * Measured in a browser because none of that is visible from a unit test: what a
 * unit test can say is which string the renderer wrote, and the whole question here
 * is what the cascade and the Web Animations API do with it.
 */
test.describe('a motion that recolours a fill', () => {
  test('turns the shape a colour and leaves it as the document drew it', async ({ page }) => {
    await openDeck(page);
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(500);

    const sid = await page.evaluate(() => {
      const el = document.querySelector('.sl-stage .sl-rectangle');
      return el?.getAttribute('data-bc-sid') ?? null;
    });
    test.skip(!sid, '이 슬라이드에 사각형이 없습니다');

    const colour = () =>
      page.evaluate((id) => {
        const el = document.querySelector(`.sl-stage [data-bc-sid="${id}"]`) as HTMLElement;
        return getComputedStyle(el).backgroundColor;
      }, sid);

    // The document's own colour, drawn through the track — a variable the shape
    // declares beside it, so what is on screen is unchanged.
    const atRest = await colour();
    expect(atRest).not.toBe('rgba(0, 0, 0, 0)');

    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('addBoxBuild', {
          nodeId: id,
          effect: 'recolor',
          color: '#c0392b',
          duration: 1600
        }),
      sid
    );
    await page.waitForTimeout(400);
    await page.locator('[data-timeline-preview]').click();
    await page.waitForTimeout(800);

    // Mid-run it is on its way to the colour asked for.
    const during = await colour();
    expect(during, '색이 전혀 바뀌지 않았습니다').not.toBe(atRest);

    // And afterwards it is exactly what the document says again — which is the
    // half `inherit` got wrong: that version started from transparent.
    await expect.poll(colour, { timeout: 6000 }).toBe(atRest);
  });
});
