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

  /**
   * A **number** from a variable, which a reference could not do.
   *
   * Measured with a transaction: a reference commits into a string attribute and is refused in a
   * number or a boolean, so this is the half that needed a declaration on the shape. What only a
   * browser shows is that the declaration reaches the **drawing** — the resolution runs where the
   * view reads children, and nothing in the renderers had to learn about variables.
   */
  test('drive a number on an ordinary shape, through the panel', async ({ page }) => {
    await openDeck(page);
    await panel(page);

    // A number variable of the deck's own.
    await page.locator('[data-doc-var-new] input, input[data-doc-var-new]').fill('둥글기');
    await page.locator('[data-doc-var-add]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-doc-var-row="둥글기"] select').first().selectOption('number');
    await page.waitForTimeout(400);
    const value = page.locator('[data-doc-var-value="둥글기"] input, input[data-doc-var-value="둥글기"]');
    await value.fill('600');
    await value.press('Enter');
    await page.waitForTimeout(500);

    // A rectangle of the reader's own.
    await page.getByRole('button', { name: '사각형' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).editor?.selection?.nodeIds?.[0] ?? null))
      .not.toBeNull();

    /*
     * The row is in the properties panel beside the card's own, and it offers only the variables
     * whose kind fits: a colour in a 둥근 정도 row would be a swatch with nothing to draw.
     */
    const row = page.locator('.sl-properties').getByLabel('둥근 정도 문서 변수');
    await expect(row).toHaveCount(1);
    await row.selectOption('둥글기');
    await page.waitForTimeout(700);

    // Drawn: 600 twips is 40px at 1:1, scaled by the stage, so the assertion is that the corner is
    // rounded by more than a hairline.
    const rounded = await page.evaluate(() => {
      const sid = (window as any).editor.selection?.nodeIds?.[0];
      const box = document.querySelector(`.sl-stage [data-bc-sid="${sid}"]`) as HTMLElement | null;
      return box ? parseFloat(getComputedStyle(box).borderTopLeftRadius) : 0;
    });
    expect(rounded).toBeGreaterThan(2);

    /*
     * And the document says what it *takes*, not what it took: one declaration, no `cornerRadius` on
     * the shape at all. Which is the whole point — changing the variable is one write and every
     * shape bound to it is drawn again.
     */
    const held = await page.evaluate(() => {
      const editor = (window as any).editor;
      const attrs = editor.dataStore.getNode(editor.selection?.nodeIds?.[0])?.attributes ?? {};
      return { binds: attrs.varBinds, own: attrs.cornerRadius };
    });
    expect(held.binds).toEqual([{ attr: 'cornerRadius', var: '둥글기' }]);
    expect(held.own).toBeUndefined();

    /*
     * A **position** is not offered, which is the refusal that stayed: a box that snaps back when you
     * drag it is a worse thing to meet than a size you cannot type. A size *is* offered, and takes a
     * different road — written into the document rather than drawn (the test below).
     */
    await expect(page.locator('.sl-properties').getByLabel('X 문서 변수')).toHaveCount(0);
  });

  /**
   * A **size** a variable owns, which is the one thing the resolver could not carry.
   *
   * Counted rather than argued: the geometry is read by `boxOf` in 31 places across 14 files — the
   * outline, the handles, the guides, the snapping, alignment, group bounds, the audit's "off the
   * edge" check — so a size that was only drawn would be answered differently by every one of them.
   * It is written into the document instead, by the pass that already settles derived geometry.
   *
   * What only a browser shows is the refusal that has to come with it: the handles and the fields.
   */
  test('own a shape’s size, and take the resize away while they do', async ({ page }) => {
    await openDeck(page);
    await panel(page);

    await page.locator('[data-doc-var-new] input, input[data-doc-var-new]').fill('카드폭');
    await page.locator('[data-doc-var-add]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-doc-var-row="카드폭"] select').first().selectOption('number');
    await page.waitForTimeout(400);
    const value = page.locator('[data-doc-var-value="카드폭"] input, input[data-doc-var-value="카드폭"]');
    await value.fill('2400');
    await value.press('Enter');
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: '사각형' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).editor?.selection?.nodeIds?.[0] ?? null))
      .not.toBeNull();

    const width = () =>
      page.evaluate(() => {
        const editor = (window as any).editor;
        return editor.dataStore.getNode(editor.selection?.nodeIds?.[0])?.attributes?.width;
      });

    await page.locator('.sl-properties').getByLabel('너비 문서 변수').selectOption('카드폭');
    await page.waitForTimeout(700);

    // Written into the document, which is what keeps all 31 readers of the geometry working.
    expect(await width()).toBe(2400);

    /*
     * And the reader's own size is refused while a variable owns it: a width typed here would be put
     * straight back by the next pass, which is a field that changes nothing — the fault the
     * placement's refused handles were measured for.
     */
    await expect(page.locator('.sl-properties').getByLabel('너비', { exact: true })).toBeDisabled();
    await expect(page.locator('[data-handle="se"]')).toHaveCount(0);
    await expect(page.locator('.sl-properties')).toContainText('크기를 문서 변수가 정합니다');

    // The position is still theirs: only what the variable owns is taken away.
    await expect(page.locator('.sl-properties').getByLabel('X', { exact: true })).toBeEnabled();

    // And changing the variable moves the shape — one field, every shape bound to it.
    await value.fill('3600');
    await value.press('Enter');
    await expect.poll(() => width()).toBe(3600);
  });

  /**
   * A value **this page** says instead.
   *
   * The scope a deck actually wants beside the document's: "every card is our accent, except on the
   * summary page" is one declaration on that page rather than an override on each of nine shapes. The
   * model is tested in milliseconds; what a browser adds is that the two lists are two lists, and
   * that the page's answer is what reaches the slide.
   */
  test('a page can say something else, and its shapes follow it', async ({ page }) => {
    await openDeck(page);
    await cardsSlide(page);
    await panel(page);

    // The deck's 주의 is #ef4444 and two things on this slide are drawn in it.
    const red = async () =>
      (await painted(page)).filter((colour) => colour === 'rgb(239, 68, 68)').length;
    expect(await red()).toBeGreaterThanOrEqual(2);

    /*
     * The same name, declared on this page. Two lists in one pane, widest scope first, so a reader
     * can see which they are setting.
     */
    await page.locator('[data-slide-var-new] input, input[data-slide-var-new]').fill('주의');
    await page.locator('[data-slide-var-add]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-slide-var-row="주의"] select').first().selectOption('color');
    await page.waitForTimeout(400);
    const value = page.locator(
      '[data-slide-var-value="주의"] input, input[data-slide-var-value="주의"]'
    );
    await value.fill('#15803d');
    await value.press('Enter');
    await page.waitForTimeout(700);

    // Everything on this page that names it follows the page — including the card, which never
    // declared the name and takes it through the placement's page.
    const after = await painted(page);
    expect(after.filter((colour) => colour === 'rgb(21, 128, 61)').length).toBeGreaterThanOrEqual(2);
    expect(after.filter((colour) => colour === 'rgb(239, 68, 68)')).toHaveLength(0);

    // The document's own value is untouched: this was a page saying something for itself.
    await expect(page.locator('[data-doc-var-value="주의"] input, input[data-doc-var-value="주의"]')).toHaveValue(
      '#ef4444'
    );
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
