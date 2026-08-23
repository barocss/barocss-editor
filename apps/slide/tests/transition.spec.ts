import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck } from './helpers';

/**
 * How a slide arrives.
 *
 * The first thing in this product that has a *duration*. Time lives beside the
 * document — decided in `docs/specs/canvas-model.md` §4 long before anything
 * needed it, so that it would not be decided by accident — and a slide names a
 * `motionTrack` that holds the timing, rather than every node type growing a
 * time field.
 *
 * The structure and the arithmetic are in `office-slides/test/motion.test.ts`.
 * What only a browser shows is the chain, and the two decisions that are only
 * visible on screen: the transition plays **while presenting and not while
 * editing**, and the slide is put back afterwards — a slide left mid-transition
 * would keep an inline transform for the rest of the session, and the next
 * reader to select a box on it would find the handles somewhere else entirely.
 */
const panel = (page: Page) => page.locator('.sl-properties');

/** The slide on the stage, and whatever the transition has written onto it. */
const drawn = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`.sl-stage .sl-slide[data-bc-sid="${CSS.escape(id)}"]`);
    if (!el) return null;
    return {
      inline: el.getAttribute('style') ?? '',
      opacity: getComputedStyle(el).opacity,
      transform: getComputedStyle(el).transform
    };
  }, sid);

const slideAt = (page: Page, index: number) =>
  page.evaluate((n) => {
    const store = (window as any).editor.dataStore;
    const root = store.getNode((window as any).editor.getRootId());
    return (root.content ?? [])
      .map((sid: string) => store.getNode(sid))
      .filter((node: any) => node?.stype === 'surface')
      .map((node: any) => node.sid)[n] as string;
  }, index);

const chooseTransition = async (page: Page, label: string) => {
  await panel(page).getByLabel('화면 전환').selectOption(label);
  await page.waitForTimeout(400);
};

test.describe('how a slide arrives', () => {
  test('is chosen in the panel and written beside the document', async ({ page }) => {
    await openDeck(page);
    const first = await slideAt(page, 0);

    await chooseTransition(page, 'fade');

    const written = await page.evaluate((sid) => {
      const store = (window as any).editor.dataStore;
      const trackId = store.getNode(sid)?.attributes?.trackId;
      const root = store.getNode((window as any).editor.getRootId());
      const resources = (root.content ?? [])
        .map((child: string) => store.getNode(child))
        .find((node: any) => node?.stype === 'resources');
      const track = (resources?.content ?? [])
        .map((child: string) => store.getNode(child))
        .find((node: any) => node?.stype === 'motionTrack' && node.attributes?.id === trackId);
      const step = track ? store.getNode(track.content[0]) : undefined;
      return {
        trackId: trackId ?? null,
        // The slide itself carries nothing about time beyond the name of a track.
        slideKeys: Object.keys(store.getNode(sid)?.attributes ?? {}).filter((key) =>
          key.startsWith('transition')
        ),
        step: step ? { stype: step.stype, ...step.attributes } : null
      };
    }, first);

    expect(written.trackId).toBeTruthy();
    expect(written.slideKeys).toEqual([]);
    expect(written.step).toMatchObject({ stype: 'motionStep', kind: 'transition', effect: 'fade' });
  });

  test('takes a length in seconds and keeps it in milliseconds', async ({ page }) => {
    await openDeck(page);
    const first = await slideAt(page, 0);

    await chooseTransition(page, 'zoom');
    await panel(page).getByLabel('화면 전환 시간').fill('1.2');
    await panel(page).getByLabel('화면 전환 시간').press('Enter');
    await page.waitForTimeout(400);

    const ms = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const resources = (root.content ?? [])
        .map((child: string) => store.getNode(child))
        .find((node: any) => node?.stype === 'resources');
      const track = (resources?.content ?? [])
        .map((child: string) => store.getNode(child))
        .find((node: any) => node?.stype === 'motionTrack');
      return store.getNode(track.content[0])?.attributes?.duration;
    }, first);

    expect(ms).toBe(1200);
  });

  /**
   * A deck is edited by clicking through it, and a slide that faded in every
   * time the rail was clicked would make the editor feel like it was buffering.
   * PowerPoint and Keynote both play transitions in the show and not in the
   * editor.
   */
  test('does not play while the deck is being edited', async ({ page }) => {
    await openDeck(page);
    await chooseTransition(page, 'fade');

    await page.locator('.sl-filmstrip button').nth(1).click();
    const second = await slideAt(page, 1);

    // Straight away: nothing written onto the element at all.
    const state = await drawn(page, second);
    expect(state?.inline ?? '').not.toContain('opacity');
  });

  test('plays while presenting, and puts the slide back afterwards', async ({ page }) => {
    await openDeck(page);

    // The *second* slide gets the transition: it is the one being arrived at.
    await page.locator('.sl-filmstrip button').nth(1).click();
    await page.waitForTimeout(300);
    await chooseTransition(page, 'fade');
    const second = await slideAt(page, 1);

    await page.locator('.sl-filmstrip button').nth(0).click();
    await page.waitForTimeout(300);
    await page.locator('[data-present]').click();
    await page.waitForTimeout(300);

    await page.keyboard.press('ArrowRight');
    // Mid-transition: the slide is on its way in from transparent.
    await expect
      .poll(async () => Number((await drawn(page, second))?.opacity ?? 1), { timeout: 2000 })
      .toBeLessThan(1);

    /**
     * And afterwards nothing is left on the element. This is the part that
     * matters beyond the effect: an inline transform left behind would move
     * every handle on that slide for the rest of the session.
     */
    await expect
      .poll(async () => (await drawn(page, second))?.inline ?? '', { timeout: 3000 })
      .not.toContain('transition');
    expect(Number((await drawn(page, second))?.opacity)).toBe(1);
  });
});
