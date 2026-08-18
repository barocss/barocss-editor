import type { Page } from '@playwright/test';

/**
 * What every test here needs, and the mistakes it exists to stop.
 *
 * The rail draws each slide *again* — a thumbnail is that slide with that class
 * and that sid — and the stage draws every slide and hides all but one. So a
 * query for `.sl-slide`, or for a box by sid, has several answers and only one
 * of them is the thing on screen. Three bugs came from exactly that, and so did
 * four wrong measurements while writing these tests.
 *
 * Everything below asks about what is *visible on the stage*, which is the only
 * question a test about a reader's screen should be asking.
 */

/** The deck, loaded and drawn. */
export async function openDeck(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('.sl-overlay');
  // The first render places the boxes; the overlay measures the slide after it.
  await page.waitForFunction(() => {
    const ov = document.querySelector('.sl-overlay');
    return !!ov && ov.getBoundingClientRect().width > 100;
  });
}

/** The sid of the slide the rail says is current. */
export async function currentSlide(page: Page): Promise<string> {
  return await page.evaluate(
    () =>
      document
        .querySelector('.sl-filmstrip button[data-current="true"]')
        ?.getAttribute('data-slide') ?? ''
  );
}

export interface OnScreen {
  sid: string;
  /** The centre, for clicking. */
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The boxes a reader can actually see and point at.
 *
 * Filtered by the overlay's rectangle, which is the slide on the stage: a box
 * on a hidden slide has a zero rectangle and a thumbnail's box is somewhere
 * else entirely.
 */
export async function visibleBoxes(page: Page, selector = '.sl-text-frame, .sl-shape'): Promise<OnScreen[]> {
  return await page.evaluate((sel) => {
    const ov = document.querySelector('.sl-overlay')?.getBoundingClientRect();
    if (!ov) return [];
    return [...document.querySelectorAll(sel)]
      .map((node) => {
        const r = node.getBoundingClientRect();
        return {
          sid: node.getAttribute('data-bc-sid') ?? '',
          x: Math.round(r.x + r.width / 2),
          y: Math.round(r.y + r.height / 2),
          left: Math.round(r.x),
          top: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height)
        };
      })
      .filter(
        (b) =>
          b.width > 20 &&
          b.left >= ov.left - 2 &&
          b.left + b.width <= ov.right + 2 &&
          b.top >= ov.top - 2 &&
          b.top + b.height <= ov.bottom + 2
      );
  }, selector);
}

/** How many boxes each slide holds, which is what most edits change. */
export async function boxCounts(page: Page): Promise<number[]> {
  return await page.evaluate(() => {
    const store = (window as any).editor.dataStore;
    const root = store.getNode((window as any).editor.getRootId());
    return (root.content ?? [])
      .map((sid: string) => store.getNode(sid))
      .filter((node: any) => node?.stype === 'surface')
      .map((node: any) => (node.content ?? []).length);
  });
}

/** An attribute of a node, straight from the model. */
export async function attr(page: Page, sid: string, key: string): Promise<unknown> {
  return await page.evaluate(
    ([s, k]) => (window as any).editor.dataStore.getNode(s)?.attributes?.[k],
    [sid, key] as const
  );
}
