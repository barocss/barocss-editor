import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, currentSlide, visibleBoxes, pickMenu } from './helpers';

/**
 * Showing a deck by scrolling it.
 *
 * A presenter clicks; a reader sent a link scrolls. The arithmetic is `scroll-show.ts`,
 * unit-tested — where every slide sits in one long scroll, and what offset means which
 * build. What only a browser can answer is the part that matters: **what a scroll does to
 * the motion.**
 *
 * A build is an animation with a duration and a scroll is a position, and there are three
 * ways to join them. Play a build when its slide arrives, and a reader who scrolls fast sees
 * them all at once and one who scrolls back sees them replay. Ignore the builds, and an
 * author's timing is thrown away. **Make the scroll the clock**, and scrolling forward plays
 * a build, scrolling back un-plays it, and stopping half way holds it half way — which is
 * what these tests measure, on a real animation.
 */
const hint = (page: Page) => page.locator('.sl-present-hint span').first().textContent();

/** A shape with a build on it, on the slide the deck opens at. */
const withBuild = async (page: Page) => {
  const box = (await visibleBoxes(page))[0];
  await page.evaluate(
    (nodeId) =>
      (window as any).editor.executeCommand('addBoxBuild', {
        nodeId,
        effect: 'fly',
        direction: 'left',
        amount: 0.6,
        duration: 1600
      }),
    box.sid
  );
  await page.evaluate(() => (window as any).editor.executeCommand('setNode', { nodeIds: [] }));
  await page.waitForTimeout(400);
  return box.sid;
};

/** What the shape's own animation is doing, as the browser has it. */
const animationOf = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const element = document.querySelector(
      `.sl-stage .sl-slide:not([style*="display: none"]) [data-bc-sid="${id}"]`
    );
    const found = (element?.getAnimations?.() ?? [])[0] as Animation | undefined;
    if (!found) return null;
    const timing = found.effect?.getComputedTiming?.();
    return {
      current: typeof found.currentTime === 'number' ? Math.round(found.currentTime) : null,
      duration: typeof timing?.duration === 'number' ? Math.round(timing.duration) : null,
      state: found.playState
    };
  }, sid);

const scrollBy = async (page: Page, delta: number, times = 1) => {
  const stage = (await page.locator('.sl-stage').boundingBox())!;
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
  for (let n = 0; n < times; n += 1) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
};

test.describe('scrolling through a deck', () => {
  test('walks the deck with the wheel, and comes back the same way', async ({ page }) => {
    await openDeck(page);
    await pickMenu(page, 'view.present.1');
    await page.waitForTimeout(400);

    const start = await currentSlide(page);
    // Five stops: the deck's visible slides — the hidden one is skipped, as in any show.
    expect(await hint(page)).toBe('1 / 5');

    await scrollBy(page, 300, 6);
    const on = await currentSlide(page);
    expect(on).not.toBe(start);

    /*
     * The same offset means the same picture whichever way the reader arrived at it, which
     * is the property that makes a scroll a *playhead* rather than a trigger.
     */
    await scrollBy(page, -300, 6);
    expect(await currentSlide(page)).toBe(start);
    expect(await hint(page)).toBe('1 / 5');
  });

  test('a key press changes the picture, every time', async ({ page }) => {
    await openDeck(page);
    await pickMenu(page, 'view.present.1');
    await page.waitForTimeout(400);

    /*
     * Measured before the stops existed: a key moved the offset by one build's worth, which
     * is less than a slide's reading room — so on a slide with no builds the first press
     * changed nothing on screen. A key that appears to do nothing is the worst control there
     * is.
     */
    const seen: string[] = [];
    for (let press = 0; press < 3; press += 1) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      seen.push((await hint(page)) ?? '');
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  test('holds a build **part way** where the scroll stopped', async ({ page }) => {
    await openDeck(page);
    const sid = await withBuild(page);
    await pickMenu(page, 'view.present.1');
    await page.waitForTimeout(500);

    // Into the build, but not through it: one wheel notch of its share.
    await scrollBy(page, 120, 1);
    const part = await animationOf(page, sid);
    expect(part, '빌드가 애니메이션으로 만들어지지 않았습니다').not.toBeNull();
    expect(part!.duration).toBeGreaterThan(0);
    // Held, not running: the scroll is the clock, so nothing advances on its own.
    expect(part!.state).not.toBe('running');
    expect(part!.current).toBeGreaterThan(0);
    expect(part!.current!).toBeLessThan(part!.duration!);

    // Further in: the same animation, further along. This is the whole feature in one
    // assertion — the scroll *is* the playhead.
    await scrollBy(page, 120, 1);
    const later = await animationOf(page, sid);
    expect(later!.current!).toBeGreaterThan(part!.current!);

    // And back out again: un-played rather than replayed.
    await scrollBy(page, -120, 1);
    const earlier = await animationOf(page, sid);
    expect(earlier!.current!).toBeLessThan(later!.current!);
  });

  test('says where the reader is, in the show’s own numbers', async ({ page }) => {
    await openDeck(page);
    await pickMenu(page, 'view.present.1');
    await page.waitForTimeout(400);

    /*
     * Two numbers rather than a fraction: a reader who has scrolled to the end and a deck
     * with no room to scroll are different things, and one number hides the difference. On
     * the shell because it is the show's *position*, the way `presenting` is its mode.
     */
    const read = () =>
      page.evaluate(() => {
        const shell = document.querySelector('.sl-shell') as HTMLElement;
        return { at: Number(shell.dataset.scrolled), span: Number(shell.dataset.scrollSpan) };
      });

    const start = await read();
    expect(start.at).toBe(0);
    expect(start.span).toBeGreaterThan(0);

    await scrollBy(page, 300, 3);
    expect((await read()).at).toBeGreaterThan(0);

    // Never past the end, and never before the beginning: a deck does not wrap.
    await scrollBy(page, 4000, 6);
    expect((await read()).at).toBeLessThanOrEqual(start.span);
    await scrollBy(page, -4000, 6);
    expect((await read()).at).toBe(0);
  });

  /**
   * A **card's own motion** in a scrolling show.
   *
   * Never measured until it was asked for, and the answer follows this file's own principle: a scroll
   * is *scrubbing with a different input device*, and scrubbing holds a build at the moment it has
   * reached rather than replaying it. A card's motion is an **arrival** — it costs no presses (§10l),
   * so the scroll's clock has nothing to say about it — and what a reader must never see is a card
   * that is *missing* because its animation never ran.
   */
  test('holds a card’s own motion at its end state rather than losing it', async ({ page }) => {
    await openDeck(page);

    // A card whose badge fades in, placed twice on a slide that also has a build of its own.
    await page.evaluate(() => {
      (window as any).editor.loadDocument(
        {
          stype: 'document',
          attributes: {},
          content: [
            {
              stype: 'surface',
              attributes: { kind: 'slide', name: '카드 두 장', trackId: 'slide-t' },
              content: [
                {
                  stype: 'rectangle',
                  attributes: { name: 'own-1', x: 600, y: 600, width: 1200, height: 800, fill: '#94a3b8' }
                },
                {
                  stype: 'instance',
                  attributes: { componentId: 'card', x: 3000, y: 600, width: 3000, height: 2000 },
                  content: []
                },
                {
                  stype: 'instance',
                  attributes: { componentId: 'card', x: 7000, y: 600, width: 3000, height: 2000 },
                  content: []
                }
              ]
            },
            { stype: 'surface', attributes: { kind: 'slide', name: '다음' }, content: [] },
            {
              stype: 'resources',
              attributes: {},
              content: [
                {
                  stype: 'motionTrack',
                  attributes: { id: 'slide-t' },
                  content: [
                    {
                      stype: 'motionStep',
                      attributes: { kind: 'build', target: 'own-1', effect: 'fadeIn', duration: 400 }
                    }
                  ]
                },
                {
                  stype: 'motionTrack',
                  attributes: { id: 'card-t' },
                  content: [
                    {
                      stype: 'motionStep',
                      attributes: { kind: 'build', target: 'card-badge', effect: 'fadeIn', duration: 300 }
                    }
                  ]
                }
              ]
            },
            {
              stype: 'components',
              content: [
                {
                  stype: 'component',
                  attributes: { id: 'card', name: '카드', width: 3000, height: 2000, trackId: 'card-t' },
                  content: [
                    {
                      stype: 'rectangle',
                      attributes: { partId: 'back', x: 0, y: 0, width: 3000, height: 2000, fill: '#e2e8f0' }
                    },
                    {
                      stype: 'ellipse',
                      attributes: {
                        partId: 'badge',
                        name: 'card-badge',
                        x: 200,
                        y: 200,
                        width: 500,
                        height: 500,
                        fill: '#2563eb'
                      }
                    }
                  ]
                }
              ]
            }
          ]
        },
        'slides'
      );
    });
    await page.waitForTimeout(700);

    await pickMenu(page, 'view.present.1');
    await page.waitForTimeout(600);

    /** Every badge a placement draws, as the reader sees it. */
    const badges = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.sl-stage .sl-instance .sl-ellipse')].map((one) => ({
          visibility: getComputedStyle(one as Element).visibility,
          opacity: Number(getComputedStyle(one as Element).opacity)
        }))
      );

    const before = await badges();
    expect(before.length).toBeGreaterThanOrEqual(2);
    /*
     * Held at the end state, in both placements: nothing hidden and nothing at zero. The fault this
     * pins is a card that vanishes in a scrolling deck because its arrival was never run — which is
     * exactly what an *exit* used to do, before the arrival group stopped being read as "already
     * played" (`hiddenUntilPlayed`).
     */
    for (const badge of before) {
      expect(badge.visibility).toBe('visible');
      expect(badge.opacity).toBeGreaterThan(0);
    }

    // And scrolling through the slide's own build leaves them exactly as they were: the scroll's
    // clock is about the presses, and a card's motion is not one.
    await scrollBy(page, 240, 3);
    for (const badge of await badges()) {
      expect(badge.visibility).toBe('visible');
      expect(badge.opacity).toBeGreaterThan(0);
    }
  });

  test('counts a build’s room only where there is a build', async ({ page }) => {
    await openDeck(page);
    const span = async () =>
      page.evaluate(() => {
        const shell = document.querySelector('.sl-shell') as HTMLElement;
        return Number(shell.dataset.scrollSpan);
      });

    await pickMenu(page, 'view.present.1');
    await page.waitForTimeout(400);
    const plain = await span();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await withBuild(page);
    await pickMenu(page, 'view.present.1');
    await page.waitForTimeout(400);

    /*
     * A slide with a build needs more scrolling than one without, and the layout has to
     * follow the *document*. Measured before it did: the stretches were computed once with
     * every slide at zero presses and kept, so a build added afterwards changed nothing —
     * a memo that reads the document has to name the document.
     */
    expect(await span()).toBeGreaterThan(plain);
  });

  test('plays no slide transition, because the scroll is the transition', async ({ page }) => {
    await openDeck(page);
    // A transition on the slide the deck opens at, so there is one to *not* play.
    await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const slide = (root.content as string[]).find(
        (sid) => store.getNode(sid)?.stype === 'surface'
      );
      return editor.executeCommand('setSlideTransition', {
        slideId: slide,
        transition: 'fade',
        transitionMs: 1200
      });
    });
    await page.waitForTimeout(300);

    await pickMenu(page, 'view.present.1');
    await page.waitForTimeout(400);
    await scrollBy(page, 300, 4);

    /*
     * A slide that faded in on top of the scroll would be two answers to "how do we get
     * from this slide to the next" — and a reader moving back through the same offset would
     * watch the fade play forwards again.
     */
    const arriving = await page.evaluate(() => {
      const slide = document.querySelector(
        '.sl-stage .sl-slide:not([style*="display: none"])'
      ) as HTMLElement | null;
      return (slide?.getAnimations?.() ?? []).length;
    });
    expect(arriving).toBe(0);
  });

  test('leaves the wheel to the editor when the show ends', async ({ page }) => {
    await openDeck(page);
    await pickMenu(page, 'view.present.1');
    await page.waitForTimeout(400);
    await scrollBy(page, 300, 4);
    const moved = await currentSlide(page);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await expect(page.locator('.sl-present-hint')).toHaveCount(0);

    /*
     * Scrolling is a way of *showing*, so it ends with the show: a reader who scrolled once
     * and then went back to editing would otherwise find the deck moving under the wheel.
     */
    await scrollBy(page, 300, 4);
    expect(await currentSlide(page)).toBe(moved);
  });
});
