import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, visibleBoxes } from './helpers';

/**
 * The slide's timeline.
 *
 * The first version of this pane was a list of rows in order, with numbers for
 * the timing — PowerPoint's animation pane, and not what anybody means by a
 * timeline. Measured against the tools this product is aimed at, four things
 * were missing, and every one is the same thing: **time has to be a dimension
 * you can see and drag.**
 *
 * A track per shape (so a shape's entrance, emphasis and exit read as one
 * shape's animation), bars whose left edge is *when* and whose width is *how
 * long*, a playhead to look at a moment, and a curve — every step in the product
 * ran `ease`, because the word was in a template string in the renderer.
 *
 * The arithmetic is unit-tested in `office-slides/test/timeline.test.ts`. What
 * only a browser shows is the gesture: drag a bar and the document's delay
 * changes, drag its edge and the duration does, drag the playhead and the slide
 * shows that instant.
 */
const pane = (page: Page) => page.locator('[data-timeline]');

const bars = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-timeline] .sl-timeline-bar')].map((bar) => ({
      step: bar.getAttribute('data-step'),
      effect: bar.getAttribute('data-effect'),
      kind: bar.getAttribute('data-kind'),
      start: Number(bar.getAttribute('data-start')),
      duration: Number(bar.getAttribute('data-duration')),
      track: bar.closest('.sl-timeline-track')?.getAttribute('data-track') ?? ''
    }))
  );

const stepAttrs = (page: Page, index = 0) =>
  page.evaluate((at) => {
    const store = (window as any).editor.dataStore;
    const root = store.getNode((window as any).editor.getRootId());
    const resources = (root.content ?? [])
      .map((sid: string) => store.getNode(sid))
      .find((node: any) => node?.stype === 'resources');
    const track = (resources?.content ?? [])
      .map((sid: string) => store.getNode(sid))
      .find((node: any) => node?.stype === 'motionTrack');
    return store.getNode((track?.content ?? [])[at])?.attributes ?? null;
  }, index);

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

/**
 * Selecting a box, low enough in it to be *its* box.
 *
 * The sample deck's title and body overlap on screen once the timeline pane has
 * taken its room from the stage — the fit shrinks, the boxes come closer, and
 * the second one's centre lands inside the first one's rectangle. A click there
 * selects the topmost, which is the title, which is correct behaviour and a
 * useless test. Near the bottom edge is inside one box and one box only.
 */
const selectBox = async (page: Page, index: number) => {
  const boxes = await visibleBoxes(page);
  const box = boxes[index];
  await page.mouse.click(box.x, box.top + box.height - 6);
  await expect
    .poll(() => page.evaluate(() => (window as any).editor.selection?.nodeIds?.[0] ?? null))
    .toBe(box.sid);
  return box;
};

/** A bar's rectangle on screen, which is what a drag is measured against. */
const barBox = async (page: Page, index = 0) => {
  const box = await page.locator('[data-timeline] .sl-timeline-bar').nth(index).boundingBox();
  if (!box) throw new Error('no bar');
  return box;
};

test.describe('the timeline', () => {
  test('draws a shape’s effect as a bar on an axis', async ({ page }) => {
    await openDeck(page);
    /**
     * A slide with nothing on it gets a **strip**, not a pane.
     *
     * Measured before this: an open-by-default pane held 240 pixels — 27% of a
     * 1440×900 window — for one sentence saying there was nothing to draw, and
     * the slide was drawn at 57% instead of 69% to pay for it. So the default
     * follows the slide, and the sentence belongs to a reader who unfolded it
     * deliberately.
     */
    await expect(pane(page)).toHaveAttribute('data-open', 'false');
    await expect(pane(page).locator('[data-timeline-total]')).toHaveText('—');

    const box = await selectBox(page, 0);
    await giveBuild(page, 'fade');

    // …and it opens itself the moment the slide has something to draw, which is
    // also the moment the reader asked a question about time.
    await expect(pane(page)).toHaveAttribute('data-open', 'true');

    const list = await bars(page);
    expect(list).toHaveLength(1);
    // 600, not the schema's 400: a first motion is picked from the preset
    // gallery, so it arrives with 부드럽게 올라오기's length and keeps it when the
    // effect underneath is changed. The bar's width is the step's duration,
    // whatever wrote it.
    expect(list[0]).toMatchObject({ effect: 'fade', start: 0, duration: 600 });
    // The lane is the shape's: the row is named for it, and the bar is in it.
    await expect(pane(page).locator('.sl-timeline-target').first()).toHaveText('제목');
    expect(await page.evaluate(() => (window as any).editor.dataStore.getNode(
      document.querySelector('[data-timeline] .sl-timeline-target')!.getAttribute('data-step-target')
    )?.sid)).toBe(box.sid);
  });

  /**
   * And a reader's own fold wins from then on.
   *
   * The pane follows the slide only while nobody has said otherwise: one that
   * reopened itself after being folded would be arguing with the person using it.
   * The empty sentence lives in here too, because *unfolded and empty* is the one
   * state it belongs to — a reader who went looking.
   */
  test('opens itself for a slide with motion, and stays as the reader leaves it', async ({
    page
  }) => {
    await openDeck(page);

    // Unfolded by hand with nothing on the slide: this is where the sentence is.
    await pane(page).locator('[data-timeline-fold]').click();
    await expect(pane(page)).toHaveAttribute('data-open', 'true');
    await expect(pane(page)).toContainText('애니메이션이 없습니다');

    // Folded by hand, and it stays folded even when the slide gains a motion.
    await pane(page).locator('[data-timeline-fold]').click();
    await expect(pane(page)).toHaveAttribute('data-open', 'false');

    await selectBox(page, 0);
    await giveBuild(page, 'fade');
    await expect(pane(page)).toHaveAttribute('data-open', 'false');
    // The strip still says how long the slide runs, which is what it is for.
    await expect(pane(page).locator('[data-timeline-total]')).not.toHaveText('—');
  });

  /**
   * The gesture the whole pane exists for: a bar's left edge is a moment, so
   * dragging it is setting a delay. Two number fields could say the same thing
   * and never make it *visible*.
   */
  test('sets a step’s delay by dragging its bar', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'fade');

    expect((await stepAttrs(page))?.delay ?? 0).toBe(0);

    const bar = await barBox(page);
    const lane = await page.locator('[data-timeline] .sl-timeline-lane').first().boundingBox();
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width / 2 + lane!.width * 0.25, bar.y + bar.height / 2, {
      steps: 10
    });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // A quarter of the axis, which is a quarter of its span in milliseconds.
    const delay = Number((await stepAttrs(page))?.delay ?? 0);
    expect(delay).toBeGreaterThan(300);
    // And the bar moved with it rather than snapping back.
    expect((await bars(page))[0].start).toBe(delay);
  });

  test('sets a step’s length by dragging its right edge', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'fade');

    const bar = await barBox(page);
    const grip = await page.locator('[data-timeline] .sl-timeline-grip').first().boundingBox();
    await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip!.x + bar.width, grip!.y + grip!.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    expect(Number((await stepAttrs(page))?.duration)).toBeGreaterThan(600);
  });

  /**
   * The hierarchy a flat list could not express: one shape, several motions.
   * A shape that appears, is emphasised while it is talked about and then leaves
   * is one row of three bars — which is Canva's shape, Figma's and CapCut's.
   */
  test('stacks several motions on one shape’s track', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'fade');

    await pane(page).locator('.sl-timeline-add').first().click();
    await page.waitForTimeout(500);

    const list = await bars(page);
    expect(list).toHaveLength(2);
    // Both in the same lane, which is what "the shape's animation" means.
    expect(list[0].track).toBe(list[1].track);
    // And an emphasis, which the old vocabulary could not express at all: a
    // transition has two ends and a pulse needs three.
    expect(list[1].effect).toBe('pulse');
  });

  /**
   * The direction is an *option*, not a different effect.
   *
   * `flyInLeft`, `flyInRight`, `flyInUp` were three effects — eight directions
   * and six entrances would have been forty-eight names for six ideas, and
   * changing which side a shape comes from would have meant changing which
   * effect it uses, losing its timing and its curve with it.
   */
  test('turns a shape’s effect around without changing which effect it is', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'fly');

    /*
     * Blurred, because a number a reader is *typing* is not a value yet.
     *
     * This test passed without it while the field wrote on every keystroke —
     * which was the fault `NumberField` replaced: typing `1.8` a character at a
     * time put 10.68 seconds in the document. A test that says when the reader is
     * done is a test that describes the product.
     */
    await pane(page).getByLabel('재생 시간').fill('1.2');
    await pane(page).getByLabel('재생 시간').blur();
    await page.waitForTimeout(300);
    await pane(page).getByLabel('방향').selectOption('right');
    await page.waitForTimeout(400);

    const step = await stepAttrs(page);
    expect(step).toMatchObject({ effect: 'fly', direction: 'right' });
    // And the timing survived, which is the whole reason this is an option.
    expect(step?.duration).toBe(1200);
  });

  test('offers a direction only where a direction means something', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'fly');
    await expect(pane(page).getByLabel('방향')).toHaveCount(1);
    await expect(pane(page).getByLabel('정도')).toHaveCount(1);

    // A flash has no way to go, so it is not asked which way.
    await pane(page).getByLabel('효과', { exact: true }).selectOption('flash');
    await page.waitForTimeout(400);
    await expect(pane(page).getByLabel('방향')).toHaveCount(0);
    await expect(pane(page).getByLabel('정도')).toHaveCount(0);
  });

  test('gives a step a curve, and writes what a reader drew', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'fade');

    /*
     * A preset first, which is the answer nine times out of ten.
     *
     * Polled rather than slept at: this reads a write on its way to the document, and a fixed wait
     * before an assertion about something still in flight is a race with whatever else the machine
     * is running — the sentence five flaky tests in this suite already taught us (BACKLOG).
     */
    await pane(page).getByLabel('가속', { exact: true }).selectOption('backOut');
    await expect.poll(async () => (await stepAttrs(page))?.easing).toBe('backOut');

    // And the tenth: the curve, dragged by its handle.
    await pane(page).locator('[data-curve-open]').click();
    const handle = await pane(page).locator('[data-handle="1"]').boundingBox();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle!.x + 30, handle!.y - 20, { steps: 8 });
    await page.mouse.up();

    // Failed once in a full parallel run and passed alone every time — the same race, one line down.
    await expect.poll(async () => String((await stepAttrs(page))?.easing)).toContain('cubic-bezier(');
  });

  /**
   * A spring, which is the one timing the curve editor cannot draw.
   *
   * A bezier overshoots once; a spring passes its destination, comes back past
   * it and settles over several diminishing swings. The document holds
   * `spring(180, 9)` — two numbers a reader can adjust — and what reaches the
   * browser is a `linear()` of sampled progress values, which is CSS's own way
   * of giving a curve as samples. Measured before any of it was written: a
   * `linear()` with a 1.4 point moved a box 140px at its halfway mark, so the
   * overshoot is real rather than clamped.
   */
  test('gives a step a spring, and plays it as a sampled easing', async ({ page }) => {
    await openDeck(page);
    const box = await selectBox(page, 0);
    await giveBuild(page, 'fly');

    await pane(page).getByLabel('가속', { exact: true }).selectOption('springBouncy');
    await page.waitForTimeout(400);

    // What the document holds is the spring, not the samples and not a name.
    expect((await stepAttrs(page))?.easing).toBe('spring(180, 9)');

    // The panel draws the samples the browser is given, so the picture and the
    // motion are the same list of numbers.
    const curve = pane(page).locator('[data-spring-curve]');
    await expect(curve).toBeVisible();
    expect((await curve.getAttribute('points'))!.split(' ').length).toBeGreaterThan(20);

    // And the two numbers are adjustable, which is what a spring has instead of
    // two handles to drag.
    await pane(page).getByLabel('감쇠').fill('20');
    await page.waitForTimeout(400);
    expect((await stepAttrs(page))?.easing).toBe('spring(180, 20)');

    // What reaches the browser: a `linear()`, sampled from those two numbers.
    // The panel is closed first — it sits over the preview button.
    await pane(page).locator('[data-curve-open]').click();
    await page.waitForTimeout(200);
    await pane(page).locator('[data-timeline-preview]').click();

    await expect
      .poll(
        () =>
          page.evaluate((sid) => {
            const el = document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`);
            return (el?.getAnimations() ?? []).map((animation) =>
              String(animation.effect!.getTiming().easing).slice(0, 7)
            );
          }, box.sid),
        { timeout: 3000 }
      )
      .toContain('linear(');
  });

  /**
   * The spring's own length, offered rather than imposed.
   *
   * Stiffness and damping *do* say how long a motion takes, and letting them set
   * the duration would take the bar's width away from the reader — the whole
   * gesture of this pane. So the panel says what the spring settles in and lets
   * them ask for it.
   */
  test('offers the spring’s natural length without taking the bar away', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'fly');

    const before = (await stepAttrs(page))?.duration;
    await pane(page).getByLabel('가속', { exact: true }).selectOption('springStiff');
    await page.waitForTimeout(400);
    // Choosing the spring changes the curve and *not* the length.
    expect((await stepAttrs(page))?.duration).toBe(before);

    const settling = Number(
      await pane(page).locator('[data-spring-settling]').getAttribute('data-spring-settling')
    );
    expect(settling).toBeGreaterThan(100);

    await pane(page).locator('.sl-curve-fit').click();
    await page.waitForTimeout(400);
    expect((await stepAttrs(page))?.duration).toBe(settling);
  });

  /**
   * The playhead: a preview that only plays from the start is a video player
   * with no scrubber, and the point of a timeline is to look at a *moment*.
   */
  test('shows the moment the playhead is dragged to', async ({ page }) => {
    await openDeck(page);
    const box = await selectBox(page, 0);
    await giveBuild(page, 'fade');
    await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));

    const opacity = () =>
      page.evaluate(
        (sid) =>
          Number(
            getComputedStyle(
              document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`)!
            ).opacity
          ),
        box.sid
      );

    expect(await opacity()).toBe(1);

    const ruler = await pane(page).locator('[data-timeline-ruler]').boundingBox();
    // A tenth of the way in: the fade is 400ms of a 2000ms axis, so this is
    // right inside it.
    await page.mouse.click(ruler!.x + ruler!.width * 0.05, ruler!.y + ruler!.height / 2);

    /*
     * Polled for the *state* rather than sampled after a fixed wait.
     *
     * "Neither gone nor arrived" is a state the scrub holds indefinitely — it is a
     * paused animation — so there is nothing to sample at a moment and nothing to
     * race. The fixed 400ms was the reason this failed once in a full run and
     * never on its own.
     */
    await expect
      .poll(async () => {
        const value = await opacity();
        return value > 0 && value < 1;
      }, { timeout: 4000 })
      .toBe(true);

    // …and once it is holding, the same numbers plainly, so a failure says which.
    const held = await opacity();
    expect(held).toBeGreaterThan(0);
    expect(held).toBeLessThan(1);
  });

  /**
   * The pane is the reader's: it opens as tall as they drag it and folds away.
   *
   * A timeline is looked at *while* the slide is, so how much of the window each
   * gets changes with what is being done — one bar wants a strip, eight tracks
   * want half the screen, and writing text wants it gone.
   */
  test('folds away and comes back the size it was', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'fade');

    const height = async () => (await pane(page).boundingBox())!.height;
    const before = await height();

    // Dragged taller from its top edge, which is where a pane grows from.
    const edge = await pane(page).locator('[data-timeline-resize]').boundingBox();
    await page.mouse.move(edge!.x + edge!.width / 2, edge!.y + 2);
    await page.mouse.down();
    await page.mouse.move(edge!.x + edge!.width / 2, edge!.y - 120, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const taller = await height();
    expect(taller).toBeGreaterThan(before + 60);

    await pane(page).locator('[data-timeline-fold]').click();
    await page.waitForTimeout(300);
    expect(await height()).toBeLessThan(80);
    // Folded, it is still there and still says what it is.
    await expect(pane(page)).toContainText('타임라인');

    await pane(page).locator('[data-timeline-fold]').click();
    await page.waitForTimeout(300);
    expect(Math.abs((await height()) - taller)).toBeLessThan(6);
  });

  /**
   * `repeat` was declared in the schema and read by nothing for a day — this
   * repository's own favourite fault, made fresh. `0` is "until the slide moves
   * on", because a count of zero is not a thing anybody can mean.
   */
  test('repeats a step, and says so on its bar', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'pulse');

    await pane(page).getByLabel('반복').selectOption('3');
    await page.waitForTimeout(400);

    expect((await stepAttrs(page))?.repeat).toBe(3);
    await expect(pane(page).locator('.sl-timeline-bar')).toHaveAttribute('data-repeat', '3');
    await expect(pane(page).locator('.sl-timeline-bar-repeat')).toHaveText('×3');

    await pane(page).getByLabel('반복').selectOption('0');
    await page.waitForTimeout(400);
    await expect(pane(page).locator('.sl-timeline-bar-repeat')).toHaveText('∞');
  });

  test('gives each press its own axis', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'fade');

    /**
     * The second box is selected through the model rather than by clicking.
     *
     * On this slide the title's *placement* covers the box below it — the two
     * are drawn without overlapping and their model rectangles do overlap — so a
     * click there selects the title, correctly. Hit-testing has its own tests;
     * this one is about presses, and pointing at the wrong box would only make
     * it a worse test of hit-testing.
     */
    const second = (await visibleBoxes(page))[1];
    await page.evaluate(
      (sid) => (window as any).editor.executeCommand('setNode', { nodeIds: [sid] }),
      second.sid
    );
    await page.waitForTimeout(300);
    await giveBuild(page, 'grow');

    // Two presses, so two tabs — and the axis shows one press at a time,
    // because a slide's clock stops at every click.
    await expect(pane(page).locator('[data-press]')).toHaveCount(2);
    expect(await bars(page)).toHaveLength(1);

    await pane(page).locator('[data-press="2"]').click();
    await page.waitForTimeout(300);
    expect((await bars(page))[0].effect).toBe('grow');
  });

  test('plays the slide’s animation in the editor', async ({ page }) => {
    await openDeck(page);
    const box = await selectBox(page, 0);
    await giveBuild(page, 'fade');
    await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));

    const visibility = () =>
      page.evaluate(
        (sid) =>
          getComputedStyle(
            document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`)!
          ).visibility,
        box.sid
      );

    expect(await visibility()).toBe('visible');
    await pane(page).locator('[data-timeline-preview]').click();
    await expect.poll(visibility, { timeout: 2000 }).toBe('hidden');
    await expect.poll(visibility, { timeout: 4000 }).toBe('visible');
  });
});

test.describe('a film in the sequence', () => {
  const VIDEO = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';

  const placeFilm = async (page: Page) => {
    const sid = await page.evaluate(async (src) => {
      const editor = (window as any).editor;
      await editor.executeCommand('insertVideo', { src, width: 6000, height: 3375 });
      return editor.selection?.nodeIds?.[0] as string;
    }, VIDEO);
    await page.waitForTimeout(400);
    return sid;
  };

  test('is a bar in the same axis as the builds', async ({ page }) => {
    await openDeck(page);
    await placeFilm(page);

    // The film's place in the sequence is a motion, so it is in the motion tab.
    await page.locator('.sl-properties [data-tab="motion"]').click();
    await page.waitForTimeout(200);
    await page.locator('.sl-properties').getByLabel('재생 시작').selectOption('onClick');
    await page.waitForTimeout(400);

    const list = await bars(page);
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe('play');
    expect((await stepAttrs(page))).toMatchObject({ kind: 'play', startsWith: 'onClick' });
  });

  /**
   * And the press starts it. Asked of `play()` rather than of `paused`: a data
   * URI with no frames in it never leaves the paused state however hard it is
   * asked, so `paused` would measure the fixture's codec.
   */
  test('starts on its press in the show, not when the slide arrives', async ({ page }) => {
    await openDeck(page);
    const sid = await placeFilm(page);
    // The film's place in the sequence is a motion, so it is in the motion tab.
    await page.locator('.sl-properties [data-tab="motion"]').click();
    await page.waitForTimeout(200);
    await page.locator('.sl-properties').getByLabel('재생 시작').selectOption('onClick');
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      const calls: string[] = [];
      (window as any).__media = calls;
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function patched(this: HTMLMediaElement) {
        calls.push(`play:${this.getAttribute('data-bc-sid')}`);
        return play.call(this).catch(() => undefined) as Promise<void>;
      };
    });

    await page.locator('[data-present]').click();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => (window as any).__media as string[])).toEqual([]);

    await page.keyboard.press('ArrowRight');
    await expect
      .poll(() => page.evaluate(() => (window as any).__media as string[]))
      .toContain(`play:${sid}`);
  });
});

/**
 * Two motions at once on one shape.
 *
 * The thing a professional timeline is *for*, and until it was measured the
 * second motion silently won: two animations of one property are `replace` by
 * default, so a fly and a grow on one shape at one moment produced only the
 * grow. `composite: 'add'` fixes it, and *which* step adds is the timeline's
 * answer because only it knows what overlaps what.
 *
 * The arithmetic — which steps add, which lane each bar is in, which clash — is
 * unit-tested. What only a browser shows is that both motions are actually on
 * the shape at the same moment, and that the lanes are two rows a reader can
 * point at rather than two bars on top of each other.
 */
test.describe('two motions at once', () => {
  const givePreset = async (page: Page, preset: string) => {
    const props = page.locator('.sl-properties');
    await props.locator('[data-tab="motion"]').click();
    await props.getByLabel('모션 추가').click();
    await page.waitForTimeout(200);
    await props.locator(`[data-preset="${preset}"]`).click();
    await page.waitForTimeout(400);
  };

  const lanes = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-timeline] .sl-timeline-bar')].map((bar) => ({
        effect: bar.getAttribute('data-effect'),
        lane: bar.getAttribute('data-lane'),
        composite: bar.getAttribute('data-composite'),
        clash: bar.getAttribute('data-clash'),
        top: Math.round(bar.getBoundingClientRect().top),
        visible: bar.getBoundingClientRect().height > 4
      }))
    );

  test('draws them in two lanes and puts both on the shape', async ({ page }) => {
    await openDeck(page);
    const box = await selectBox(page, 0);

    await givePreset(page, 'slideIn');
    await givePreset(page, 'pop');

    // The second starts *with* the first, which is what makes them simultaneous.
    const second = (await bars(page))[1].step;
    await pane(page).locator(`[data-step="${second}"]`).click();
    await pane(page).getByLabel('시작').selectOption('withPrevious');
    await page.waitForTimeout(400);

    const drawn = await lanes(page);
    expect(drawn.map((bar) => bar.lane)).toEqual(['0', '1']);
    // Two rows, and both of them on screen: a fixed-height track drew the second
    // outside the row, where a reader could neither see it nor grab it.
    expect(drawn[1].top).toBeGreaterThan(drawn[0].top);
    expect(drawn.every((bar) => bar.visible)).toBe(true);
    // The second adds, because both effects write `opacity`.
    expect(drawn[1].composite).toBe('add');

    // And on the slide, mid-flight, both are applied at once.
    await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));
    await pane(page).locator('[data-timeline-preview]').click();

    const both = await expect
      .poll(
        () =>
          page.evaluate((sid) => {
            const el = document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`)!;
            const style = getComputedStyle(el);
            return {
              moved: style.translate !== 'none' && !style.translate.startsWith('0'),
              scaled: style.scale !== 'none' && style.scale !== '1',
              count: el.getAnimations().length
            };
          }, box.sid),
        { timeout: 3000 }
      )
      .toMatchObject({ moved: true, scaled: true });
    void both;

    expect(
      await page.evaluate(
        (sid) =>
          document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`)!.getAnimations()
            .length,
        box.sid
      )
    ).toBe(2);
  });

  /**
   * Rotation is the exception, and a browser fault rather than a rule: two
   * additive `rotate` animations in Chromium end at *zero*, so a shape turns and
   * then untwists itself. The second stays `replace` and the bar says so, because
   * two bars that quietly cancel each other is the worst version of this.
   */
  test('says so when two turns cannot be combined', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);

    await givePreset(page, 'turnOnce');
    await givePreset(page, 'whirlIn');

    const second = (await bars(page))[1].step;
    await pane(page).locator(`[data-step="${second}"]`).click();
    await pane(page).getByLabel('시작').selectOption('withPrevious');
    await page.waitForTimeout(400);

    const drawn = await lanes(page);
    expect(drawn[1].clash).toBe('rotate');
    expect(drawn[1].composite).toBeNull();
    await expect(pane(page).locator('[data-clash]')).toHaveAttribute(
      'title',
      /회전 모션은 한 번에 하나만/
    );
  });
});

/**
 * The three things that separate a timeline from a chart of a slide.
 *
 * **Magnifying**, so a 300ms step is 120 pixels of bar rather than 30 and a
 * two-frame delay is something a reader can see. **Snapping**, so "at the same
 * time as that one" is a gesture rather than a number typed into a field and
 * checked by eye. **The arrows**, because a drag is for "about here" and a
 * keystroke is for "exactly there".
 *
 * The arithmetic is unit-tested — `axisSpan`, `snapPoints`, `snapTo`. What only a
 * browser shows is that the axis draws wider without the clock changing, that a
 * dragged bar catches on another bar's edge, and that a focused bar takes the
 * arrows at all.
 */
test.describe('the axis a reader works on', () => {
  const axis = (page: Page) =>
    page.evaluate(() => {
      const ruler = document.querySelector('[data-timeline] .sl-timeline-ruler');
      const scroll = document.querySelector('[data-timeline-scroll]');
      return {
        magnified: document.querySelector('[data-timeline-magnified]')?.textContent ?? '',
        ruler: Math.round(ruler?.getBoundingClientRect().width ?? 0),
        scrolls: (scroll?.scrollWidth ?? 0) > (scroll?.clientWidth ?? 0),
        ticks: [...document.querySelectorAll('[data-timeline] .sl-timeline-ruler span')]
          .map((tick) => tick.textContent)
          .filter(Boolean),
        bar: Math.round(
          document.querySelector('[data-timeline] .sl-timeline-bar')?.getBoundingClientRect()
            .width ?? 0
        )
      };
    });

  test('magnifies the drawing without changing the clock', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'fade');

    const fitted = await axis(page);
    expect(fitted.magnified).toBe('맞춤');
    expect(fitted.scrolls).toBe(false);

    await pane(page).locator('[data-timeline-magnify="in"]').click();
    await pane(page).locator('[data-timeline-magnify="in"]').click();
    await page.waitForTimeout(300);

    const magnified = await axis(page);
    expect(magnified.magnified).toBe('4×');
    // Four times the pixels, and the *same* seconds: the first version divided
    // the span instead, so a long bar ran off the end of the ruler into a region
    // with no ticks.
    expect(magnified.ruler).toBeGreaterThan(fitted.ruler * 3.5);
    expect(magnified.bar).toBeGreaterThan(fitted.bar * 3.5);
    expect(magnified.scrolls).toBe(true);

    /**
     * The same clock, in finer divisions.
     *
     * This used to assert the tick *labels* were identical, which was a proxy for
     * "the same seconds" and stopped being one: the step is a budget of labels per
     * pixel now, so four times the room gets more numbers on the same axis. The
     * intent is checked directly instead — the axis still ends where it ended —
     * and the new behaviour is checked beside it, because an axis magnified to
     * four times the width with the same six labels on it is the opposite of what
     * a reader magnifies for.
     */
    const lastOf = (labels: (string | null)[]) => labels.filter(Boolean).at(-1);
    expect(lastOf(magnified.ticks)).toBe(lastOf(fitted.ticks));
    expect(magnified.ticks.length).toBeGreaterThan(fitted.ticks.length);

    // And back again.
    await pane(page).locator('[data-timeline-magnify="out"]').click();
    await pane(page).locator('[data-timeline-magnify="out"]').click();
    await page.waitForTimeout(300);
    expect((await axis(page)).magnified).toBe('맞춤');
  });

  test('catches a dragged bar on another bar’s edge', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'fade');
    await selectBox(page, 1);
    await giveBuild(page, 'grow');

    // Both on the first press, so there are two lanes to line up.
    await pane(page).locator('[data-press="2"]').click();
    const second = await page.evaluate(
      () =>
        document.querySelector('[data-timeline] .sl-timeline-bar')?.getAttribute('data-step') ?? ''
    );
    await pane(page).locator(`[data-step="${second}"]`).click();
    await pane(page).getByLabel('시작').selectOption('withPrevious');
    await page.waitForTimeout(400);

    const first = await page.evaluate(() => {
      const bar = document.querySelector('[data-timeline] .sl-timeline-bar')!;
      return {
        right: Math.round(bar.getBoundingClientRect().right),
        end: Number(bar.getAttribute('data-start')) + Number(bar.getAttribute('data-duration'))
      };
    });

    const bar = (await pane(page).locator(`[data-step="${second}"]`).boundingBox())!;
    await page.mouse.move(bar.x + 20, bar.y + bar.height / 2);
    await page.mouse.down();
    // Five pixels short of the other bar's end: near enough to be caught.
    await page.mouse.move(first.right - 5 + 20, bar.y + bar.height / 2, { steps: 12 });

    // The guide is drawn while it is caught, because feeling a bar stop is not
    // the same as knowing what it lined up with.
    await expect(pane(page).locator('.sl-timeline-lane[data-snapped="true"]')).toHaveCount(1);
    await page.mouse.up();
    await page.waitForTimeout(400);

    // Exactly the other bar's end, not five pixels short of it.
    const delay = await page.evaluate(
      (sid) => (window as any).editor.dataStore.getNode(sid).attributes.delay,
      second
    );
    expect(delay).toBe(first.end);
  });

  /**
   * And the arrows nudge the focused bar — which needed the *overlay's* key
   * handler taught whose keys these are. It listens in the capture phase and
   * stops propagation so it beats the editor's own key map, and it swallowed
   * every arrow before the bar's handler ran: the bar had focus, the keystroke
   * fired, and the delay never changed.
   */
  test('nudges the focused bar by the arrows', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'fade');

    const bar = pane(page).locator('.sl-timeline-bar').first();
    await bar.click();
    const step = (await bar.getAttribute('data-step'))!;
    const delayOf = () =>
      page.evaluate(
        (sid) => (window as any).editor.dataStore.getNode(sid).attributes.delay ?? 0,
        step
      );

    // A click focuses it, which needed doing by hand: the drag's
    // `preventDefault()` is what stops the browser focusing it.
    await expect(bar).toBeFocused();

    await page.keyboard.press('ArrowRight');
    await expect.poll(delayOf).toBe(10);
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(delayOf).toBe(110);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(delayOf).toBe(100);

    // Alt resizes instead of moving, which is the other half of a bar.
    const before = await page.evaluate(
      (sid) => (window as any).editor.dataStore.getNode(sid).attributes.duration,
      step
    );
    await page.keyboard.press('Alt+ArrowRight');
    await expect
      .poll(() =>
        page.evaluate(
          (sid) => (window as any).editor.dataStore.getNode(sid).attributes.duration,
          step
        )
      )
      .toBe(before + 10);
  });
});

/**
 * Several bars at once, and a motion carried from one shape to another.
 *
 * Lining six motions up used to be six drags, and giving six shapes the same
 * motion was done by remembering numbers. Both are the same gap: the pane could
 * only ever be about *one* step.
 */
test.describe('working on more than one bar', () => {
  const giveTo = async (page: Page, index: number, preset: string) => {
    await selectBox(page, index);
    const props = page.locator('.sl-properties');
    await props.locator('[data-tab="motion"]').click();
    await props.getByLabel('모션 추가').click();
    await page.waitForTimeout(200);
    await props.locator(`[data-preset="${preset}"]`).click();
    await page.waitForTimeout(400);
  };

  const barsIn = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-timeline] .sl-timeline-bar')].map((bar) => ({
        step: bar.getAttribute('data-step'),
        selected: bar.getAttribute('data-selected'),
        start: Number(bar.getAttribute('data-start')),
        duration: Number(bar.getAttribute('data-duration')),
        effect: bar.getAttribute('data-effect')
      }))
    );

  /** Two shapes on one press, so there are two bars on one axis to work on. */
  const twoOnOnePress = async (page: Page) => {
    await giveTo(page, 0, 'rise');
    await giveTo(page, 1, 'appearSlowly');

    await pane(page).locator('[data-press="2"]').click();
    const second = (await barsIn(page))[0].step!;
    await pane(page).locator(`[data-step="${second}"]`).click();
    await pane(page).getByLabel('시작').selectOption('withPrevious');
    await page.waitForTimeout(400);
    return second;
  };

  test('selects with Shift, and moves them together', async ({ page }) => {
    await openDeck(page);
    await twoOnOnePress(page);

    const before = await barsIn(page);
    expect(before).toHaveLength(2);

    await pane(page).locator(`[data-step="${before[0].step}"]`).click();
    await pane(page)
      .locator(`[data-step="${before[1].step}"]`)
      .click({ modifiers: ['Shift'] });
    await page.waitForTimeout(300);

    expect((await barsIn(page)).map((bar) => bar.selected)).toEqual(['true', 'true']);
    // And the row says how many an edit will reach, because the controls beside
    // it write to all of them.
    await expect(pane(page).locator('[data-editing-count]')).toHaveText('2개 선택');

    // The arrows shift the whole selection, each bar keeping its own offset.
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(400);
    const after = await barsIn(page);
    expect(after.map((bar) => bar.start)).toEqual(before.map((bar) => bar.start + 100));

    // One gesture, one undo.
    await page.evaluate(() => (window as any).editor.undo());
    await expect.poll(async () => (await barsIn(page)).map((bar) => bar.start)).toEqual(
      before.map((bar) => bar.start)
    );
  });

  test('gives them all one length, and throws them all away', async ({ page }) => {
    await openDeck(page);
    await twoOnOnePress(page);

    const bars = await barsIn(page);
    await pane(page).locator(`[data-step="${bars[0].step}"]`).click();
    await pane(page)
      .locator(`[data-step="${bars[1].step}"]`)
      .click({ modifiers: ['Shift'] });
    await page.waitForTimeout(300);

    // One length typed with two bars selected changes two.
    await pane(page).getByLabel('재생 시간').fill('0.8');
    await pane(page).getByLabel('재생 시간').blur();
    await page.waitForTimeout(400);
    expect((await barsIn(page)).map((bar) => bar.duration)).toEqual([800, 800]);

    /**
     * And Delete on a focused bar throws the selection away, in one transaction.
     *
     * Selected again from scratch — a plain click replaces the set and Shift adds
     * to it, so shift-clicking two bars that are *already* selected takes them
     * both back out, which is what a toggle is for.
     */
    await pane(page).locator(`[data-step="${bars[0].step}"]`).click();
    await pane(page).locator(`[data-step="${bars[1].step}"]`).click({ modifiers: ['Shift'] });
    await page.waitForTimeout(200);
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await barsIn(page)).length).toBe(0);

    await page.evaluate(() => (window as any).editor.undo());
    await expect.poll(async () => (await barsIn(page)).length).toBe(2);
  });

  /**
   * And a motion carried from one shape to another — which is how a deck gets a
   * house style, and what a reader was otherwise doing by remembering numbers.
   */
  test('copies a motion onto another shape', async ({ page }) => {
    await openDeck(page);
    await twoOnOnePress(page);

    const bars = await barsIn(page);
    expect(bars.map((bar) => bar.effect)).toEqual(['fly', 'fade']);

    // Copy the first, select the second, paste.
    await pane(page).locator(`[data-step="${bars[0].step}"]`).click();
    await expect(pane(page).locator('[data-motion-paste]')).toBeDisabled();
    await pane(page).locator('[data-motion-copy]').click();
    await pane(page).locator(`[data-step="${bars[1].step}"]`).click();
    await expect(pane(page).locator('[data-motion-paste]')).toBeEnabled();
    await pane(page).locator('[data-motion-paste]').click();
    await page.waitForTimeout(400);

    const after = await barsIn(page);
    // The second is now the first's motion — effect, length and all.
    expect(after.map((bar) => bar.effect)).toEqual(['fly', 'fly']);
    expect(after[1].duration).toBe(bars[0].duration);

    // But *not* its place: what it names and when it starts are facts about a
    // step's place, not about the motion, so they stayed.
    const written = await page.evaluate(
      (sid) => (window as any).editor.dataStore.getNode(sid).attributes,
      after[1].step
    );
    expect(written.target).not.toBe(
      await page.evaluate(
        (sid) => (window as any).editor.dataStore.getNode(sid).attributes.target,
        after[0].step
      )
    );
    expect(written.startsWith).toBe('withPrevious');
  });
});

/**
 * A rubber band across the tracks, and a trail behind a shape.
 *
 * The band is how a video editor picks a run of clips: shift-clicking six bars is
 * six clicks, dragging a box over them is one. The arithmetic is *screen
 * rectangles* rather than model time, because what a reader means is "the bars
 * under this box" — and the bars' own rectangles answer that for every track at
 * once, at any magnification, including the lanes a shape has stacked.
 */
test.describe('picking bars with a rubber band', () => {
  test('catches every bar the band touches, and clears on an empty click', async ({ page }) => {
    await openDeck(page);

    // Three shapes with a motion each, on one press: three tracks to sweep.
    const shapes = (await visibleBoxes(page, '.sl-shape, .sl-text-frame')).slice(0, 3);
    expect(shapes.length).toBeGreaterThan(1);
    await page.evaluate(
      (nodeIds) =>
        (window as any).editor.executeCommand('addBoxesMotion', {
          nodeIds,
          effect: 'fade',
          apart: 100
        }),
      shapes.map((shape) => shape.sid)
    );
    await page.waitForTimeout(500);

    const bars = pane(page).locator('.sl-timeline-bar');
    await expect(bars).toHaveCount(shapes.length);

    // Sweep the whole track area: every bar is caught, in one gesture.
    const tracks = (await pane(page).locator('[data-timeline-tracks]').boundingBox())!;
    // Started clear of the ＋ at the far right of each track: a pointerdown on a
    // button is that button's, which is what the guard in `startBand` says.
    await page.mouse.move(tracks.x + tracks.width - 60, tracks.y + 4);
    await page.mouse.down();
    await page.mouse.move(tracks.x + 130, tracks.y + tracks.height - 4, { steps: 10 });

    // Drawn while dragging, and the outlines follow it rather than appearing at
    // the end — which is what makes it feel like selecting.
    await expect(pane(page).locator('[data-timeline-band]')).toHaveCount(1);
    await page.mouse.up();
    await page.waitForTimeout(200);

    await expect(pane(page).locator('.sl-timeline-bar[data-selected="true"]')).toHaveCount(
      shapes.length
    );
    await expect(pane(page).locator('[data-editing-count]')).toHaveText(`${shapes.length}개 선택`);
    // And the band is gone once it is let go.
    await expect(pane(page).locator('[data-timeline-band]')).toHaveCount(0);

    // A press that never travelled is a click on the background: it clears.
    await page.mouse.click(tracks.x + tracks.width - 60, tracks.y + tracks.height - 6);
    await page.waitForTimeout(200);
    await expect(pane(page).locator('.sl-timeline-bar[data-selected="true"]')).toHaveCount(0);
  });
});

/**
 * A trail: the shape's afterimage.
 *
 * Measured before it was built — a `cloneNode(true)` in the shape's own parent
 * matches its box and every inherited style — and what only a browser shows is
 * that the copies are *behind* the shape, dimmer, and gone afterwards.
 */
test.describe('a trail behind a shape', () => {
  test('draws dimmer copies behind it, and leaves none', async ({ page }) => {
    await openDeck(page);
    const box = await selectBox(page, 0);
    await giveBuild(page, 'fly');

    await pane(page).locator('.sl-timeline-bar').first().click();
    await pane(page).getByLabel('잔상').selectOption('3');

    // A trail does not change *when* anything happens: the copies are behind the
    // shape, not after it. Polled so the read happens after the write rather than
    // 400ms after the click and hopefully after the write.
    await expect.poll(() => bars(page).then((list) => list[0].duration)).toBe(600);

    await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));
    await pane(page).locator('[data-timeline-preview]').click();

    const trail = await expect
      .poll(
        () =>
          page.evaluate(() => {
            const echoes = [...document.querySelectorAll<HTMLElement>('[data-motion-echo]')];
            return {
              count: echoes.length,
              opacities: echoes.map((echo) => echo.style.opacity),
              // No copy may answer to the shape's sid, or a second pass would
              // animate the copy instead of the original.
              sids: echoes.reduce(
                (total, echo) => total + echo.querySelectorAll('[data-bc-sid]').length,
                0
              )
            };
          }),
        // A ceiling rather than a delay: it only has to outlast the worst
        // start-up under load, and nothing waits for it when the copies are there.
        { timeout: 8000 }
      )
      .toMatchObject({ count: 3, sids: 0 });
    void trail;

    /**
     * Polled rather than sampled once: at the moment the copies appear they are
     * all still at the start of the motion, because each one's delay has yet to
     * elapse. What the trail *is* only exists a beat later.
     */
    const spread = await expect
      .poll(
        () =>
          page.evaluate((sid) => {
            const original = document
              .querySelector(`.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`)!
              .getBoundingClientRect();
            /**
             * Measured as *distance* from the shape, not along one axis.
             *
             * The first version compared `x`, and this motion happens to fly
             * upwards — every copy had the same x and the test waited three
             * seconds for a spread it was looking for in the wrong direction.
             */
            const behind = [...document.querySelectorAll('[data-motion-echo] > *')].map((copy) => {
              const rect = copy.getBoundingClientRect();
              return Math.round(Math.abs(rect.x - original.x) + Math.abs(rect.y - original.y));
            });
            return (
              behind.length === 3 && behind[0] > 0 && behind[1] > behind[0] && behind[2] > behind[1]
            );
          }, box.sid),
        { timeout: 8000 }
      )
      .toBe(true);
    void spread;

    // And nothing is left behind when it is over.
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-motion-echo]')).toHaveCount(0);
  });
});

/**
 * The transport: play, pause, a frame at a time, and back to the start.
 *
 * A timeline that can only play from the beginning is a video player with no
 * scrubber, and one that cannot be stopped is one a reader cannot *look* at. The
 * model is that **pausing is scrubbing**: the moment becomes the playhead, so a
 * paused deck is a state the pane already knew how to draw, frame-stepping is
 * already scrubbing, and play resumes from wherever the playhead is.
 */
test.describe('the transport', () => {
  const moment = (page: Page) =>
    page.evaluate(() =>
      Number((document.querySelector('[data-timeline-moment]')?.textContent ?? '0').replace('s', ''))
    );

  const running = (page: Page, sid: string) =>
    page.evaluate(
      (id) =>
        document
          .querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!
          .getAnimations()
          .map((animation) => ({
            state: animation.playState,
            at: Math.round(Number(animation.currentTime ?? 0))
          })),
      sid
    );

  test('pauses where it is, steps a frame, and resumes from there', async ({ page }) => {
    await openDeck(page);
    const box = await selectBox(page, 0);
    // Long enough that pausing lands in the middle of it rather than after it.
    await page.evaluate(
      (nodeId) =>
        (window as any).editor.executeCommand('addBoxBuild', {
          nodeId,
          effect: 'fly',
          direction: 'left',
          amount: 0.7,
          duration: 2000
        }),
      box.sid
    );
    await page.waitForTimeout(400);
    await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));

    expect(await moment(page)).toBe(0);
    await pane(page).locator('[data-timeline-preview]').click();
    await expect(pane(page).locator('[data-timeline-preview]')).toHaveAttribute(
      'data-playing',
      'true'
    );

    await expect.poll(() => running(page, box.sid).then((list) => list[0]?.state)).toBe('running');
    await page.waitForTimeout(500);

    // Pause: the animation holds, and the moment it held at is the playhead.
    await pane(page).locator('[data-timeline-preview]').click();
    await expect.poll(() => running(page, box.sid).then((list) => list[0]?.state)).toBe('paused');

    const held = await moment(page);
    expect(held).toBeGreaterThan(0.2);
    const at = (await running(page, box.sid))[0].at;
    // The playhead and the animation agree to within a frame, because they are
    // the same number read twice.
    expect(Math.abs(at - held * 1000)).toBeLessThan(40);

    // A frame back is a frame back: 1/60 of a second, and the shape moves with it.
    await pane(page).locator('[data-timeline-step="-1"]').click();
    await page.waitForTimeout(250);
    const back = await moment(page);
    expect(held - back).toBeGreaterThan(0.01);
    expect(held - back).toBeLessThan(0.03);

    await pane(page).locator('[data-timeline-step="1"]').click();
    await page.waitForTimeout(250);
    expect(await moment(page)).toBeCloseTo(held, 1);

    // Resume: running again, from where it was left rather than from the start.
    await pane(page).locator('[data-timeline-preview]').click();
    const resumed = await expect
      .poll(() => running(page, box.sid).then((list) => list[0] ?? null), { timeout: 3000 })
      .toMatchObject({ state: 'running' });
    void resumed;
    expect((await running(page, box.sid))[0].at).toBeGreaterThan(held * 1000 - 60);
  });

  test('goes back to the start, and stops', async ({ page }) => {
    await openDeck(page);
    const box = await selectBox(page, 0);
    await giveBuild(page, 'fly');
    await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));

    /*
     * Waited for rather than slept through, all three times.
     *
     * This test failed once in a full run and passed on its own every time —
     * which is the signature of a fixed wait racing a real animation under load,
     * not of a product that pauses wrongly. What it is actually waiting for is
     * *the animation to have started*, then *the pause to have landed*, and both
     * are readable.
     */
    await pane(page).locator('[data-timeline-preview]').click();
    await expect.poll(() => running(page, box.sid).then((list) => list[0]?.state)).toBe('running');

    await pane(page).locator('[data-timeline-preview]').click();
    await expect.poll(() => running(page, box.sid).then((list) => list[0]?.state)).toBe('paused');
    await expect.poll(() => moment(page)).toBeGreaterThan(0);

    await pane(page).locator('[data-timeline-rewind]').click();

    // Nothing running, the playhead at zero, and the shape back where it rests.
    await expect.poll(() => moment(page)).toBe(0);
    await expect.poll(() => running(page, box.sid)).toEqual([]);
    await expect(pane(page).locator('[data-timeline-preview]')).not.toHaveAttribute(
      'data-playing',
      'true'
    );
  });
});

/**
 * And a preview runs for as long as what it is previewing.
 *
 * It did not: the end was a flat 600ms after the final press began, so a
 * two-second build was previewed for eight hundred milliseconds and then snapped
 * back — the preview cut off the animation it exists to show. Found while
 * building the transport, because pausing a second in restarted it: there was no
 * longer a preview running to pause.
 */
test('a preview lasts as long as the motion it shows', async ({ page }) => {
  await openDeck(page);
  const box = await selectBox(page, 0);
  await page.evaluate(
    (nodeId) =>
      (window as any).editor.executeCommand('addBoxBuild', {
        nodeId,
        effect: 'fly',
        direction: 'left',
        amount: 0.7,
        duration: 1800
      }),
    box.sid
  );
  await page.waitForTimeout(400);
  await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));

  await page.locator('[data-timeline-preview]').click();
  await page.waitForTimeout(1400);

  // Still running, a second and a half in — and still marked as playing.
  const state = await page.evaluate(
    (sid) =>
      document
        .querySelector(`.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`)!
        .getAnimations()
        .map((animation) => animation.playState),
    box.sid
  );
  expect(state).toEqual(['running']);
  await expect(page.locator('[data-timeline-preview]')).toHaveAttribute('data-playing', 'true');
});

/**
 * What a press costs to draw, said where a reader can see it.
 *
 * §7b of the motion spec sorts every animatable property into tiers, and this
 * pane said nothing about them: a reader could put a `filter` emphasis on the
 * letters of a title and find out what that costs *in front of an audience*.
 *
 * The arithmetic is unit-tested. What only a browser shows is that one dropdown —
 * 상자 전체 to 글자마다 — turns one repaint into forty.
 */
test.describe('what a press costs', () => {
  const said = (page: Page) =>
    page.evaluate(() => {
      const note = document.querySelector('[data-timeline-cost]');
      return {
        text: note?.textContent ?? null,
        verdict: note?.getAttribute('data-timeline-cost') ?? null,
        marked: [...document.querySelectorAll('[data-timeline] .sl-timeline-bar')].map((bar) =>
          bar.getAttribute('data-cost')
        )
      };
    });

  test('says nothing for cheap motion, marks a filter, and warns about forty', async ({ page }) => {
    await openDeck(page);
    const boxes = await visibleBoxes(page, '.sl-text-frame');
    expect(boxes.length).toBeGreaterThan(1);

    // Composited: a slide can run dozens of these and nothing is said.
    await page.evaluate(
      (nodeId) => (window as any).editor.executeCommand('addBoxBuild', { nodeId, effect: 'fly' }),
      boxes[0].sid
    );
    await page.waitForTimeout(400);
    expect(await said(page)).toMatchObject({ text: null, marked: [null] });

    // One filter: the bar is marked, and one repainting shape is exactly what a
    // filter is for, so the header stays quiet.
    await page.evaluate(
      (nodeId) =>
        (window as any).editor.executeCommand('addBoxBuild', {
          nodeId,
          effect: 'glow',
          startsWith: 'withPrevious'
        }),
      boxes[0].sid
    );
    await page.waitForTimeout(400);
    expect(await said(page)).toMatchObject({ text: null, marked: [null, '1'] });

    // The same filter on the letters of a line: one step, forty repaints.
    await page.evaluate(
      (nodeId) =>
        (window as any).editor.executeCommand('addBoxBuild', {
          nodeId,
          effect: 'glow',
          unit: 'letter',
          startsWith: 'withPrevious'
        }),
      boxes[1].sid
    );
    await page.waitForTimeout(500);

    const heavy = await said(page);
    expect(heavy.verdict).toBe('heavy');
    expect(heavy.text).toContain('끊길 수 있습니다');
    // And the bar says how many it is on its own.
    expect(Number(heavy.marked[2])).toBeGreaterThan(10);
  });

  /** And it counts what overlaps: the same three motions in turn cost one. */
  test('counts what runs at once rather than what exists', async ({ page }) => {
    await openDeck(page);
    const boxes = await visibleBoxes(page, '.sl-text-frame');

    for (const [index, box] of boxes.slice(0, 2).entries()) {
      await page.evaluate(
        ([nodeId, first]) =>
          (window as any).editor.executeCommand('addBoxBuild', {
            nodeId,
            effect: 'bloom',
            startsWith: first ? 'onClick' : 'withPrevious'
          }),
        [box.sid, index === 0] as [string, boolean]
      );
      await page.waitForTimeout(300);
    }
    expect((await said(page)).marked.filter(Boolean)).toHaveLength(2);

    // Together they are two at once; one after the other they are one at a time.
    const bars = await bars2(page);
    await pane(page).locator(`[data-step="${bars[1]}"]`).click();
    await pane(page).getByLabel('시작').selectOption('afterPrevious');
    await page.waitForTimeout(400);

    // Still two expensive bars, and still nothing to warn about.
    expect((await said(page)).marked.filter(Boolean)).toHaveLength(2);
    expect((await said(page)).verdict).toBeNull();
  });
});

/** The steps' sids, in the order the bars are drawn. */
const bars2 = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-timeline] .sl-timeline-bar')].map(
      (bar) => bar.getAttribute('data-step') ?? ''
    )
  );

/**
 * The step's controls, and the two things a column has to get right.
 *
 * This was a row, and the row ran off the screen: measured on 2026-08-20 at a
 * 1280 window, eighteen controls came to 1340px inside an 1100px box, so 삭제 sat
 * 76px past the edge of the window and the whole page grew a sideways scrollbar
 * to reach it. Both halves of that are asserted here — nothing past the window,
 * and no page-level horizontal scroll — because both were true of a layout that
 * looked fine in a screenshot at 1512.
 */
test.describe('the step inspector', () => {
  test('keeps every control inside the window, and lines them up', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openDeck(page);
    const box = await selectBox(page, 0);
    // A glow takes an amount *and* a colour, which is the busiest a step gets.
    await giveBuild(page, 'glow');
    await pane(page).locator('.sl-timeline-bar').first().click();
    await page.waitForTimeout(200);

    const measured = await page.evaluate(() => {
      const column = document.querySelector('[data-step-editor]')!;
      const controls = [...column.querySelectorAll('select, input, button')];
      return {
        controls: controls.length,
        /** The furthest right any control reaches, against the window's edge. */
        pastWindow: Math.max(...controls.map((c) => c.getBoundingClientRect().right)) - window.innerWidth,
        pageScroll: document.documentElement.scrollWidth - window.innerWidth,
        /**
         * One left edge for every control, which is what a label column is for.
         *
         * The rows are `office-ui`'s `Field` now, so the control cell is the
         * second child of the row's grid rather than a class of this app's — which
         * is the point: the label column is a *token*, so this panel and the
         * properties panel line up their controls at the same x by construction.
         */
        controlEdges: new Set(
          [...column.querySelectorAll('.sl-step-row')].map((row) =>
            Math.round((row.children[1] as HTMLElement).getBoundingClientRect().left)
          )
        ).size,
        groups: [...column.querySelectorAll('summary')].map((s) => s.textContent)
      };
    });

    expect(measured.controls).toBeGreaterThan(12);
    expect(measured.pastWindow).toBeLessThan(0);
    expect(measured.pageScroll).toBe(0);
    expect(measured.controlEdges).toBe(1);
    // Named by the question each group answers, which is the other half of why a
    // column reads: sixteen controls in one list is a list nobody reads.
    expect(measured.groups).toEqual(['모션', '타이밍', '모양', '대상']);
    expect(box.sid).toBeTruthy();
  });

  /**
   * The two popovers, which a scrolling column would clip.
   *
   * Measured before the column existed: the colour picker opened *downward* from
   * a control at the bottom of the window and 260 of its 360 pixels were below
   * the window's edge, so its notation field could not be reached at all. Both
   * are placed in the window now and both are asserted, because the failure is
   * invisible — the panel is there, has a position, and is off the screen.
   */
  test('opens its colour and its curve where the window has room', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'glow');
    await pane(page).locator('.sl-timeline-bar').first().click();
    await page.waitForTimeout(200);

    await pane(page).getByLabel('모션 색', { exact: true }).click();
    await page.waitForTimeout(250);
    const colour = await page.evaluate(() => {
      const panel = document.querySelector('[data-color-panel="모션 색"]')!;
      const box = panel.getBoundingClientRect();
      return {
        fits: box.top >= 0 && box.bottom <= window.innerHeight && box.right <= window.innerWidth,
        visible: getComputedStyle(panel).visibility === 'visible',
        height: Math.round(box.height)
      };
    });
    expect(colour.height).toBeGreaterThan(200);
    expect(colour.fits).toBe(true);
    expect(colour.visible).toBe(true);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    await pane(page).locator('[data-curve-open]').click();
    await page.waitForTimeout(250);
    const curve = await page.evaluate(() => {
      const panel = document.querySelector('[data-curve-panel]')!;
      const box = panel.getBoundingClientRect();
      return {
        fits: box.top >= 0 && box.bottom <= window.innerHeight,
        visible: getComputedStyle(panel).visibility === 'visible'
      };
    });
    expect(curve.fits).toBe(true);
    expect(curve.visible).toBe(true);
  });

  /**
   * The click that closes a popover still does what it was aimed at.
   *
   * This was a real fault and it is what the popover machinery is *for*: the
   * panels close on a pointer outside in the capture phase — before the pointer
   * reaches whatever is underneath, which is what stops a stray press landing on
   * the slide — and the version of that written three separate times took the
   * reader's click with it. Measured while writing the filter test: with the
   * colour picker open, pressing 미리 보기 closed the picker and **did not start
   * the preview**, so every such press cost two.
   *
   * It went away when the three copies became one (`useDismiss`), which is the
   * kind of fix nobody notices and nothing was holding. This is what holds it.
   */
  test('gives the click that closes a popover to what it was aimed at', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'glow');
    await pane(page).locator('.sl-timeline-bar').first().click();
    await page.waitForTimeout(200);

    await pane(page).getByLabel('모션 색', { exact: true }).click();
    await expect(page.locator('[data-color-panel="모션 색"]')).toHaveCount(1);

    // One press, two results: the picker is gone *and* the preview is running.
    await pane(page).locator('[data-timeline-preview]').click();
    await expect(page.locator('[data-color-panel="모션 색"]')).toHaveCount(0);
    await expect(pane(page).locator('[data-timeline-preview]')).toHaveAttribute(
      'data-playing',
      'true'
    );
  });

  /**
   * The delay, typed rather than dragged.
   *
   * It has always been in the document and only ever been *dragged* — a bar's
   * position is its delay — which is exact to the pixel a reader can hit. The
   * column has room for the number the drag was approximating.
   */
  test('types a delay the bar could only be dragged to', async ({ page }) => {
    await openDeck(page);
    await selectBox(page, 0);
    await giveBuild(page, 'fade');
    await pane(page).locator('.sl-timeline-bar').first().click();
    await page.waitForTimeout(200);

    await pane(page).getByLabel('지연').fill('0.4');
    await pane(page).getByLabel('지연').blur();
    await page.waitForTimeout(400);
    expect((await stepAttrs(page))?.delay).toBe(400);

    // And the bar moved with it, which is the same fact drawn.
    const bar = await page.evaluate(() => {
      const one = document.querySelector('[data-timeline] .sl-timeline-bar')!;
      return { left: one.getBoundingClientRect().left };
    });
    const lane = await pane(page).locator('.sl-timeline-lane').first().boundingBox();
    expect(bar.left).toBeGreaterThan(lane!.x + 4);
  });
});

/**
 * The playhead, while the preview runs.
 *
 * It used to show only where a *pause* landed, which is what the transport needs
 * and not what a reader needs: a playhead that does not move during playback
 * cannot tell them where in the animation they are, which is the one thing a
 * timeline exists to say.
 *
 * The moment is read from the stage's own animations rather than from a timer, so
 * this is also the assertion that the two clocks agree: pausing leaves the
 * playhead where the running one had drawn it.
 */
test('runs the playhead while the preview plays, and leaves it where it stopped', async ({
  page
}) => {
  await openDeck(page);
  await selectBox(page, 0);
  await giveBuild(page, 'fly');

  // Long enough to sample twice inside one press.
  await pane(page).locator('.sl-timeline-bar').first().click();
  await pane(page).getByLabel('재생 시간').fill('2.0');
  await pane(page).getByLabel('재생 시간').blur();
  await expect.poll(() => bars(page).then((list) => list[0].duration)).toBe(2000);

  const drawn = () =>
    page.evaluate(() => ({
      at: Number(document.querySelector('[data-timeline-playhead]')?.getAttribute('data-at') ?? -1),
      left: document.querySelector('[data-timeline-playhead]')?.getAttribute('style') ?? '',
      said: document.querySelector('[data-timeline-moment]')?.textContent ?? ''
    }));

  expect((await drawn()).at).toBe(0);

  await pane(page).locator('[data-timeline-preview]').click();

  /*
   * Two samples of a *running* clock, each waited for rather than slept to.
   *
   * The clock only goes up while it runs, so "a moment inside the press" and "a
   * moment further into it" are both conditions — and polling for them is exactly
   * what a fixed 500ms was pretending to be. This test failed once in a full run
   * with two suites competing for the machine, and never on its own.
   */
  await expect.poll(() => drawn().then((now) => now.at), { timeout: 4000 }).toBeGreaterThan(100);
  const early = await drawn();
  await expect
    .poll(() => drawn().then((now) => now.at), { timeout: 4000 })
    .toBeGreaterThan(early.at + 200);
  const later = await drawn();

  // Drawn where it says it is, and said in the header too.
  expect(later.left).toContain('%');
  expect(later.said).not.toBe('0.00s');

  /*
   * Pausing reads the same clock the running playhead does, so it carries on
   * from where it was rather than jumping — which is a moment *later* than the
   * last sample, because clicking pause takes time. What is asserted is the two
   * facts that can be: it did not go backwards (a second clock would have, and a
   * SMIL-only press used to report zero), and it has stopped.
   */
  await pane(page).locator('[data-timeline-preview]').click();
  // Waited for the transport to *say* it stopped; after that, two reads of a
  // stopped clock a beat apart is not a race — a stopped clock stays stopped.
  await expect(pane(page).locator('[data-timeline-preview]')).not.toHaveAttribute(
    'data-playing',
    'true'
  );
  const paused = await drawn();
  await page.waitForTimeout(300);
  const stillPaused = await drawn();
  expect(paused.at).toBeGreaterThanOrEqual(later.at);
  expect(stillPaused.at).toBe(paused.at);

  // And back to the start puts it back, which is where React thinks it is.
  await pane(page).locator('[data-timeline-rewind]').click();
  await page.waitForTimeout(300);
  expect((await drawn()).at).toBe(0);
});
