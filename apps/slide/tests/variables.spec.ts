import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck } from './helpers';

/**
 * The document's own variables, pressed rather than called.
 *
 * The model is tested in milliseconds (`office-word/test/canvas-variable.test.ts`) and the commands
 * with it (`office-slides/test/variable-commands.test.ts`). What only a browser shows is the two
 * things this feature is *for*:
 *
 * - that a reader can **make** one and **use** one without typing `var:` anywhere, and
 * - that changing it re-colours everything that names it, in one write.
 *
 * The second is the whole claim. A deck where a colour has to be fixed on forty slides is the
 * problem a variable exists to solve, so the test changes one value and reads the slide.
 */
const panel = async (page: Page) => {
  await page.locator('.sl-components-closed').click();
  await expect(page.locator('.sl-components')).toHaveCount(1);
  // The list is drawn from the document, so it arrives with the next render rather than the click.
  await page.waitForTimeout(400);
};

/** The sample deck's cards slide, which is where its own variable is used twice. */
const cardsSlide = async (page: Page) => {
  const sid = await page.evaluate(() => {
    const editor = (window as any).editor;
    const store = editor.dataStore;
    const root = store.getNode(editor.getRootId());
    return ((root.content ?? []) as string[]).find(
      (one: string) => store.getNode(one)?.attributes?.id === 'cards'
    );
  });
  await page.locator(`.sl-filmstrip button[data-slide="${sid}"]`).click();
  await page.waitForTimeout(400);
  return sid as string;
};

/** Every colour drawn on the stage right now, as the browser resolved it. */
const painted = async (page: Page) =>
  await page.evaluate(() =>
    [...document.querySelectorAll('.sl-stage [data-bc-sid]')].map(
      (box) => getComputedStyle(box as Element).backgroundColor
    )
  );

test.describe('the deck’s own variables', () => {
  test('are listed with what they are worth and how many places use them', async ({ page }) => {
    await openDeck(page);
    await panel(page);

    /*
     * The sample declares two: 주의, used twice on the cards slide, and 분기, used by nothing — the
     * state a reader meets the moment they make one, which a sample with everything wired up would
     * hide.
     */
    await expect(page.locator('[data-doc-var-row="주의"]')).toHaveCount(1);
    await expect(page.locator('[data-doc-var-uses="주의"]')).toHaveText('2곳');
    await expect(page.locator('[data-doc-var-uses="분기"]')).toHaveText('0곳');
  });

  test('re-colour everything that names them, from one field', async ({ page }) => {
    await openDeck(page);
    await cardsSlide(page);
    await panel(page);

    // Two things on this slide are drawn in it: a card that answers with it and a button that
    // names it in an ordinary fill.
    const before = (await painted(page)).filter((colour) => colour === 'rgb(239, 68, 68)').length;
    expect(before).toBeGreaterThanOrEqual(2);

    const value = page.locator('[data-doc-var-value="주의"] input, input[data-doc-var-value="주의"]');
    await value.fill('#15803d');
    await value.press('Enter');
    await page.waitForTimeout(700);

    /*
     * One write — the declaration — and every use is drawn in the new colour. Which is the claim:
     * the alternative is finding forty shapes, including the ones on the slide nobody scrolled to.
     */
    const after = await painted(page);
    expect(after.filter((colour) => colour === 'rgb(21, 128, 61)').length).toBe(before);
    expect(after.filter((colour) => colour === 'rgb(239, 68, 68)')).toHaveLength(0);
  });

  test('are offered where a colour is chosen, so nobody types “var:”', async ({ page }) => {
    await openDeck(page);
    await cardsSlide(page);

    // A shape of the reader's own: the title on this slide, selected through the model so the test
    // is about the picker rather than about the hit test.
    await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const slide = ((store.getNode(editor.getRootId()).content ?? []) as string[]).find(
        (one: string) => store.getNode(one)?.attributes?.id === 'cards'
      );
      const shape = ((store.getNode(slide)?.content ?? []) as string[]).find(
        (one: string) => store.getNode(one)?.attributes?.name === 'to-cover'
      );
      void editor.executeCommand('setNode', { nodeIds: [shape] });
    });
    await page.waitForTimeout(400);

    // The fill's field, opened: the theme's twelve, and the document's own beside them. Found by
    // its name, the way the theme's own test finds it — a swatch grid has no other handle.
    await page.locator('.sl-properties').getByLabel('1번 채우기', { exact: true }).click();
    await page.waitForTimeout(400);
    const swatch = page.locator('[data-var-swatch="var:주의"]');
    await expect(swatch).toHaveCount(1);
    await swatch.click();
    await page.waitForTimeout(600);

    /*
     * What the document holds is the **name**, not the colour: that is the difference between
     * following a decision and copying a value, and it is why the field says 주의 색 rather than a
     * hex.
     */
    const held = await page.evaluate(() => {
      const editor = (window as any).editor;
      const sid = editor.selection?.nodeIds?.[0];
      const attrs = editor.dataStore.getNode(sid)?.attributes ?? {};
      const paints = Array.isArray(attrs.fills) ? attrs.fills : [];
      return paints.length > 0 ? paints[0].color : attrs.fill;
    });
    expect(held).toBe('var:주의');
  });
});
