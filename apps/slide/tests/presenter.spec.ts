import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { openDeck } from './helpers';

/**
 * The presenter's screen.
 *
 * Presenting already showed *the audience's* screen — the half a projector needs
 * and the half a presenter cannot use. Everything this adds is already in the
 * document: the next slide, the note the author wrote, and how far through the
 * deck they are. The clock is the only thing here that is a fact about this
 * showing rather than about the deck.
 *
 * The reading of a note is unit-tested in `office-slides` — a line per
 * paragraph, runs joined, trailing blanks dropped. What only a browser shows is
 * that the presenter's half does not disturb the audience's: the slide on show
 * is still the one the editor is drawing, made smaller, and turning the panel
 * off gives the whole window back.
 */
const present = async (page: Page) => {
  await page.locator('[data-present]').click();
  await expect(page.locator('.sl-present-hint')).toBeVisible();
};

const stageWidth = (page: Page) =>
  page.evaluate(() => Math.round(document.querySelector('.sl-stage')!.getBoundingClientRect().width));

const slideWidth = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('.sl-stage .sl-slide:not([style*="display: none"])');
    return el ? Math.round(el.getBoundingClientRect().width) : 0;
  });

test.describe('the presenter’s screen', () => {
  test('is not shown until it is asked for, and S asks for it', async ({ page }) => {
    await openDeck(page);
    await present(page);

    await expect(page.locator('[data-presenter-view]')).toHaveCount(0);

    await page.keyboard.press('s');
    await expect(page.locator('[data-presenter-view]')).toBeVisible();

    await page.keyboard.press('s');
    await expect(page.locator('[data-presenter-view]')).toHaveCount(0);
  });

  test('shows the next slide, the notes and a clock', async ({ page }) => {
    await openDeck(page);

    // The second slide is the one the sample deck gives a note, and it is typed
    // into the way a reader types into it — the pane — rather than written into
    // the store, so this test exercises the same document a presenter would have.
    await page.locator('.sl-filmstrip button').nth(1).click();
    await page.waitForTimeout(600);
    await page.locator('.sl-notes-host p').first().click();
    await page.keyboard.type('여기서 잠깐 멈춘다', { delay: 30 });
    await page.waitForTimeout(500);

    await present(page);
    await page.keyboard.press('s');

    const panel = page.locator('[data-presenter-view]');
    await expect(panel).toContainText('다음 슬라이드');
    await expect(panel).toContainText('여기서 잠깐 멈춘다');
    await expect(panel.locator('[data-presenter-clock]')).toHaveText(/^\d\d:\d\d$/);
    await expect(panel.locator('[data-presenter-position]')).toContainText('2 /');
  });

  /**
   * The audience's screen is still the editor's own drawing — the presenter's
   * half takes room from it rather than replacing it with a second render.
   */
  test('makes the slide smaller rather than drawing a second one', async ({ page }) => {
    await openDeck(page);
    await present(page);

    const before = { stage: await stageWidth(page), slide: await slideWidth(page) };
    const drawings = await page.evaluate(
      () => document.querySelectorAll('.sl-stage .sl-slide').length
    );

    await page.keyboard.press('s');
    await page.waitForTimeout(500);

    expect(await stageWidth(page)).toBeLessThan(before.stage);
    expect(await slideWidth(page)).toBeLessThan(before.slide);
    // The stage still draws exactly the slides it drew before: the next-slide
    // picture is the *panel's*, and is not on the stage at all.
    expect(await page.evaluate(() => document.querySelectorAll('.sl-stage .sl-slide').length)).toBe(
      drawings
    );
  });

  test('gives the window back when the show ends', async ({ page }) => {
    await openDeck(page);
    await present(page);
    await page.keyboard.press('s');
    await expect(page.locator('[data-presenter-view]')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.locator('[data-presenter-view]')).toHaveCount(0);
    await expect(page.locator('.sl-topbar')).toBeVisible();
  });

  /** The last slide has no next one, and says so rather than showing nothing. */
  test('says when there is no next slide', async ({ page }) => {
    await openDeck(page);
    await present(page);
    await page.keyboard.press('s');
    await page.keyboard.press('End');
    await page.waitForTimeout(500);

    await expect(page.locator('[data-presenter-view]')).toContainText('마지막 슬라이드');
  });
});

/**
 * The presenter's screen in a **window of its own**.
 *
 * A real showing has two screens: the projector shows the slide and the laptop shows the
 * next slide, the notes and the clock. One window could only ever *split*, which is what a
 * presenter with a single display needs and exactly what a presenter with two cannot use —
 * the audience would be reading the notes.
 *
 * Everything drawn in there was already built and already read out of the document. What is
 * new is a second place to draw it, and the three things that only a browser can answer:
 * whether it opens styled, whether a press in it moves the show, and whether it goes away.
 */
test.describe('the presenter’s own window', () => {
  const open = async (page: Page, context: BrowserContext) => {
    await openDeck(page);
    await page.locator('[data-present]').click();
    await page.waitForTimeout(400);

    const opening = context.waitForEvent('page');
    await page.locator('[data-presenter-window]').click();
    const popup = await opening;
    await popup.waitForTimeout(700);
    return popup;
  };

  const shownIn = (page: Page) =>
    page.evaluate(() => document.querySelector('.sl-present-hint span')?.textContent ?? '');

  test('opens with the presenter’s screen in it, and with the styles', async ({
    page,
    context
  }) => {
    const popup = await open(page, context);

    expect(await popup.title()).toBe('발표자 화면');
    await expect(popup.locator('[data-presenter-view]')).toHaveCount(1);
    await expect(popup.locator('[data-presenter-clock]')).toHaveCount(1);

    /*
     * A new window's document has none of the opener's styles — in dev they are `<style>`
     * elements and in a build a `<link>` — and a window with neither draws the presenter
     * view as unstyled text, which looks like a broken feature rather than a missing link.
     * So: the dark ground, and the view filling the window rather than sitting in a 340px
     * strip meant for the pane beside a slide.
     */
    const drawn = await popup.evaluate(() => {
      const view = document.querySelector('[data-presenter-view]') as HTMLElement;
      const box = view.getBoundingClientRect();
      return {
        ground: getComputedStyle(view).backgroundColor,
        width: Math.round(box.width),
        window: window.innerWidth
      };
    });
    expect(drawn.ground).not.toBe('rgba(0, 0, 0, 0)');
    expect(drawn.width).toBe(drawn.window);
  });

  test('moves the show from a press in that window', async ({ page, context }) => {
    const popup = await open(page, context);
    const before = await shownIn(page);

    // A pointer first: a remote is a pointer as often as it is a keyboard.
    await popup.locator('[data-presenter-next]').click();
    await popup.waitForTimeout(500);
    const clicked = await shownIn(page);
    expect(clicked).not.toBe(before);

    /*
     * And a key. The audience screen's handler is on the *opener's* window, so with a
     * second window open the arrow keys go wherever focus is — which is here. A presenter
     * pressing → at their own screen and watching nothing happen is the whole feature
     * failing.
     */
    await popup.keyboard.press('ArrowRight');
    await popup.waitForTimeout(500);
    expect(await shownIn(page)).not.toBe(clicked);

    // Back the same way, so the two directions are one gesture in one place.
    await popup.locator('[data-presenter-back]').click();
    await popup.waitForTimeout(500);
    expect(await shownIn(page)).toBe(clicked);
  });

  test('draws the next slide and the notes of the slide being shown', async ({
    page,
    context
  }) => {
    const popup = await open(page, context);

    // The next slide is the one *not* on screen, so it is drawn small rather than reused.
    await expect(popup.locator('.sl-presenter-next')).toHaveCount(1);
    const first = await popup.locator('[data-presenter-position]').textContent();

    await popup.locator('[data-presenter-next]').click();
    await popup.waitForTimeout(600);
    // It followed the show: a presenter screen that lags is a presenter reading the wrong
    // note.
    expect(await popup.locator('[data-presenter-position]').textContent()).not.toBe(first);
  });

  test('closes when the show ends, and gives the window back', async ({ page, context }) => {
    const popup = await open(page, context);
    expect(popup.isClosed()).toBe(false);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    // A window left behind draws a deck that is no longer being shown.
    expect(popup.isClosed()).toBe(true);
  });

  test('ends the show from its own button', async ({ page, context }) => {
    const popup = await open(page, context);
    await popup.locator('[data-presenter-exit]').click();
    await page.waitForTimeout(700);

    // The presenter's hands are on this screen, so 끝내기 has to be here too.
    await expect(page.locator('.sl-present-hint')).toHaveCount(0);
    expect(popup.isClosed()).toBe(true);
  });
});
