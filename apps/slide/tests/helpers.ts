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

/** One fill of a shape, as the element it is drawn as. */
export interface DrawnFill {
  /** The layer's own `background-image`: a gradient, or nothing for a picture. */
  background: string;
  /** Real now, and applied to the element rather than baked into the colours. */
  opacity: string;
  blend: string;
  /** The picture inside the layer, for an image fill that is not tiled. */
  image: { src: string | null; fit: string; scale: string } | null;
}

/**
 * What a shape's fill is **drawn** as — the layer element, not the box.
 *
 * A stack of fills used to be one `background` on the shape, and every test that
 * asked about a gradient read `backgroundImage` there. It is elements now, for
 * the three reasons in `office-slides/src/fill-layers.ts`, so the box reports
 * `none` and the paint is in here. The index is the **model's** — the row the
 * panel draws and a reader clicks — which is why it is on the element as
 * `data-fill` rather than left to a position among siblings (they are reversed:
 * a later sibling paints on top).
 */
export async function drawnFill(page: Page, sid: string, index = 0): Promise<DrawnFill | null> {
  return await page.evaluate(
    ([id, at]) => {
      const layer = document.querySelector(
        `.sl-stage [data-bc-sid="${CSS.escape(id as string)}"] .sl-fill[data-fill="${at}"]`
      );
      if (!layer) return null;
      const style = getComputedStyle(layer);
      const image = layer.querySelector('img');
      return {
        background: style.backgroundImage,
        opacity: style.opacity,
        blend: style.mixBlendMode,
        image: image
          ? {
              src: image.getAttribute('src'),
              fit: getComputedStyle(image).objectFit,
              scale: getComputedStyle(image).scale
            }
          : null
      };
    },
    [sid, String(index)]
  );
}

/** How many fills a shape draws as elements — nothing for one flat colour. */
export async function drawnFills(page: Page, sid: string): Promise<number> {
  return await page.evaluate(
    (id) =>
      document.querySelectorAll(`.sl-stage [data-bc-sid="${CSS.escape(id)}"] .sl-fill`).length,
    sid
  );
}

/**
 * Pin the zoom, so the stage stops re-fitting under the test.
 *
 * A test that measures the same thing twice — a line's width before and after a
 * motion, a handle's position before and after a drag — is comparing pixels, and
 * pixels are only comparable at one scale. The stage re-fits whenever the room it
 * has changes, and the timeline pane opening is exactly that: the slide is drawn
 * smaller and every measurement moves with it.
 *
 * Typed into the zoom box, which is a reader's own gesture and the thing that
 * turns *fitting* off: an explicit zoom is kept until it is cleared, so nothing
 * the chrome does afterwards changes the scale. Cheaper and more honest than
 * asserting in twips, because what these tests are about is what is drawn.
 */
export async function pinZoom(page: Page, percent = 60): Promise<void> {
  const box = page.getByLabel('확대/축소');
  await box.fill(`${percent}%`);
  await box.press('Enter');
  await page.waitForFunction(
    (want) => document.querySelector('[data-zoom]')?.getAttribute('data-zoom') === want,
    (percent / 100).toFixed(2)
  );
}
