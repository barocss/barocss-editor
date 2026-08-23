import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, visibleBoxes } from './helpers';

/**
 * The master, on screen.
 *
 * The cascade is unit-tested in `office-slides/test/master.test.ts` — the chain,
 * the roles, the background, and a layout with no master drawing exactly as it
 * did. What only a browser shows is that the *drawing* follows it: the sample
 * deck's layouts no longer say what face a title is set in, and the title is
 * still set in it.
 *
 * That is the whole argument for a master. Before it, the two layouts each
 * repeated the font and the background, and two layouts that disagree are a deck
 * with no design and no way to tell which of them was the mistake.
 */
const fontOf = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const box = document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!;
    const text = box.querySelector('p, span') ?? box;
    return getComputedStyle(text).fontFamily;
  }, sid);

test.describe('a deck with a master', () => {
  test('sets a title in the face the master names, which no layout repeats', async ({ page }) => {
    await openDeck(page);
    const [title] = await visibleBoxes(page, '.sl-text-frame');

    // Georgia is the master's, and the layouts say nothing about a face.
    expect(await fontOf(page, title.sid)).toContain('Georgia');

    const layoutsSayNothing = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const resources = (root.content ?? [])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'resources');

      const fonts: unknown[] = [];
      const walk = (sid: string) => {
        const node = store.getNode(sid);
        if (node?.attributes?.fontFamily !== undefined) fonts.push(node.attributes.fontFamily);
        for (const child of (node?.content ?? []) as string[]) walk(child);
      };
      for (const sid of (resources?.content ?? []) as string[]) {
        if (store.getNode(sid)?.stype === 'slideLayout') walk(sid);
      }
      return fonts;
    });

    expect(layoutsSayNothing).toEqual([]);
  });

  test('names the master in the panel, under the layout it follows', async ({ page }) => {
    await openDeck(page);
    await expect(page.locator('.sl-properties')).toContainText('마스터');
    await expect(page.locator('.sl-properties')).toContainText('Office');
  });

  /**
   * The background comes down the same chain. The sample master says white, and
   * a slide that says nothing shows it — measured as a computed colour, because
   * "the renderer wrote a fill" is not the same claim as "the slide is white".
   */
  test('paints the slide the colour the master names', async ({ page }) => {
    await openDeck(page);

    const painted = await page.evaluate(() => {
      const slide = document.querySelector('.sl-stage .sl-slide')!;
      return getComputedStyle(slide).backgroundColor;
    });
    expect(painted).toBe('rgb(255, 255, 255)');

    /**
     * From the master, and not from the slide: neither slide in the sample deck
     * carries a fill of its own, and one of them draws over a coloured canvas —
     * so "it happens to be white" is not what this is asking.
     */
    const saidBySlides = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      return (root.content ?? [])
        .map((sid: string) => store.getNode(sid))
        .filter((node: any) => node?.stype === 'surface')
        .map((node: any) => node.attributes?.fill ?? null);
    });
    expect(saidBySlides.every((fill: unknown) => fill === null)).toBe(true);
  });

});
