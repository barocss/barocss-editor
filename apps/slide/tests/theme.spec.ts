import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck } from './helpers';

/**
 * A theme, on screen.
 *
 * The resolution is unit-tested in `office-slides/test/theme.test.ts` — the
 * prefix, the slots, the fallbacks, and a deck with no theme drawing exactly as
 * it did. What only a browser shows is that a *slot reaches the paint*: the
 * sample deck's accent rectangle says `theme:accent1` and nothing else in the
 * document says `#2563eb` twice.
 *
 * That is the whole argument. A hex string copied onto forty shapes means
 * re-colouring a deck is forty edits, including the ones on the slide nobody
 * scrolled to.
 */
const colourOf = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(`.sl-stage ${sel}`);
    return el ? getComputedStyle(el).backgroundColor : null;
  }, selector);

test.describe('a deck designed in a theme', () => {
  test('paints a shape the colour its slot names', async ({ page }) => {
    await openDeck(page);
    // The rectangle on the shapes slide says `theme:accent1`.
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(500);

    expect(await colourOf(page, '.sl-rectangle')).toBe('rgb(37, 99, 235)');
  });

  test('keeps the slot in the document rather than the colour', async ({ page }) => {
    await openDeck(page);

    const written = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const fills: string[] = [];
      const walk = (sid: string) => {
        const node = store.getNode(sid);
        const fill = node?.attributes?.fill;
        if (typeof fill === 'string') fills.push(fill);
        for (const child of (node?.content ?? []) as string[]) walk(child);
      };
      walk((window as any).editor.getRootId());
      return fills;
    });

    // The two shapes that use the theme name it, and nothing repeats its hex.
    expect(written).toContain('theme:accent1');
    expect(written).toContain('theme:accent2');
    expect(written.filter((fill) => fill === '#2563eb')).toEqual([]);
  });

  /**
   * The font half. The master says which *kind* of face a title is and the theme
   * says what that face is, so changing a deck's heading face is one attribute.
   */
  test('sets a title in the face the theme names, through the master’s slot', async ({ page }) => {
    await openDeck(page);

    const usesSlots = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const resources = (root.content ?? [])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'resources');
      const master = (resources?.content ?? [])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'slideMaster');

      const faces: unknown[] = [];
      const walk = (sid: string) => {
        const node = store.getNode(sid);
        if (node?.attributes?.fontFamily !== undefined) faces.push(node.attributes.fontFamily);
        for (const child of (node?.content ?? []) as string[]) walk(child);
      };
      walk(master.sid);
      return faces;
    });

    expect(usesSlots).toEqual(['theme:major', 'theme:minor']);

    // And the drawn title is Georgia, which only the theme says.
    const drawn = await page.evaluate(() => {
      const frame = document.querySelector('.sl-stage .sl-text-frame')!;
      const text = frame.querySelector('p, span') ?? frame;
      return getComputedStyle(text).fontFamily;
    });
    expect(drawn).toContain('Georgia');
  });
});

/**
 * Applying a theme, which is what the whole thing was for.
 *
 * A shape that names `theme:accent1` follows the deck; a shape that names a hex
 * chose that colour and keeps it. "Keeping what a slide overrode" is therefore
 * not a rule anything here implements — it is what naming a slot already means,
 * and this is the test that says so.
 *
 * It also settles a question the master left open and that a badly-written test
 * had failed to ask: **does changing a resource redraw the slides that follow
 * it?** Measured here rather than assumed — it does.
 */
test.describe('applying a theme', () => {
  const rectangleColour = (page: Page) =>
    page.evaluate(() => {
      const el = document.querySelector('.sl-stage .sl-rectangle');
      return el ? getComputedStyle(el).backgroundColor : null;
    });

  const shapesSlide = async (page: Page) => {
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(500);
  };

  test('re-colours every shape that follows the deck', async ({ page }) => {
    await openDeck(page);
    await shapesSlide(page);
    expect(await rectangleColour(page)).toBe('rgb(37, 99, 235)');

    await page.locator('.sl-properties').getByLabel('테마').selectOption('Ember');

    // The shape is repainted without being touched: the document still says
    // `theme:accent1`, and the theme says what that is now.
    await expect.poll(() => rectangleColour(page)).toBe('rgb(234, 88, 12)');
    const stillASlot = await page.evaluate(() => {
      const el = document.querySelector('.sl-stage .sl-rectangle')!;
      const store = (window as any).editor.dataStore;
      return store.getNode(el.getAttribute('data-bc-sid'))?.attributes?.fill;
    });
    expect(stillASlot).toBe('theme:accent1');
  });

  test('leaves alone a shape that chose its own colour', async ({ page }) => {
    await openDeck(page);
    await shapesSlide(page);

    // Give one shape a colour of its own, through the panel a reader uses.
    const sid = await page.evaluate(() => {
      const el = document.querySelector('.sl-stage .sl-rectangle')!;
      const id = el.getAttribute('data-bc-sid') as string;
      (window as any).editor.executeCommand('setNode', { nodeIds: [id] });
      return id;
    });
    await page.waitForTimeout(300);
    // The fill is a list now, so the colour is chosen from the first paint's
    // swatch — which opens the picker rather than a grid.
    await page.locator('.sl-properties').getByLabel('1번 채우기', { exact: true }).click();
    await page.locator('.sl-properties').getByLabel('색상 코드').fill('111111');
    await page.waitForTimeout(400);
    await expect.poll(() => rectangleColour(page)).toBe('rgb(17, 17, 17)');

    /**
     * Twice: the first closes the colour editor, the second lets the box go.
     *
     * One press undoes one thing — the editor stops the key from reaching the
     * overlay — which is what makes a popover a place a reader can get out of
     * rather than a mode.
     */
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await expect(page.locator('.sl-properties')).toContainText('테마');
    await page.locator('.sl-properties').getByLabel('테마').selectOption('Forest');
    await page.waitForTimeout(600);

    // Untouched, because it never followed the deck.
    expect(await rectangleColour(page)).toBe('rgb(17, 17, 17)');

    /**
     * And the shape says it once. Writing the list clears the flat `fill` it
     * supersedes — they are the same fact, and a document holding both would
     * have two answers to one question with the newer one winning silently.
     */
    const attrs = await page.evaluate(
      (id) => (window as any).editor.dataStore.getNode(id)?.attributes,
      sid
    );
    expect(attrs.fills[0].color).toBe('#111111');
    expect(attrs.fill).toBeUndefined();
  });

  /**
   * The control that made a slot writable at all. The browser's colour dialog
   * can only produce a hex string, so before this a slot could be read from a
   * document and never chosen in the product.
   */
  test('lets a reader put a shape on a slot from the panel', async ({ page }) => {
    await openDeck(page);
    await page.getByRole('button', { name: '사각형' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).editor?.selection?.startNodeId ?? null))
      .not.toBeNull();
    const sid = await page.evaluate(() => (window as any).editor.selection.nodeIds[0] as string);

    await page.locator('.sl-properties').getByLabel('1번 채우기', { exact: true }).click();
    await page.locator('[data-theme-swatch="theme:accent3"]').click();
    await page.waitForTimeout(400);

    /**
     * The slot goes into the paint, which is where a colour lives now — and it
     * has to *resolve* there too: a `theme:accent1` inside a list is exactly as
     * much a reference as one in an attribute, and reading only the top level
     * meant a reader could pick a theme colour and watch the shape lose its
     * colour entirely.
     */
    const paint = await page.evaluate(
      (id) => (window as any).editor.dataStore.getNode(id)?.attributes?.fills?.[0],
      sid
    );
    expect(paint.color).toBe('theme:accent3');

    expect(
      await page.evaluate(
        (id) =>
          getComputedStyle(document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!)
            .backgroundColor,
        sid
      )
    ).toBe('rgb(34, 197, 94)');
  });
});

/**
 * Editing the theme's own slots.
 *
 * The one thing every real deck starts with — the company's own accent — was the
 * one thing that could not be typed in. The deck could be *given* a designed
 * theme and a shape could *reference* a slot, and the slots themselves were
 * whatever the preset said.
 *
 * The command was already able to do it: `setDeckTheme` takes any subset of the
 * twelve. What was missing was somewhere to type, and a truthful answer to "which
 * theme is this" once a reader has changed one.
 */
test.describe('the theme’s own colours', () => {
  const rectangle = (page: Page) =>
    page.evaluate(() => {
      const el = document.querySelector('.sl-stage .sl-rectangle');
      return el ? getComputedStyle(el).backgroundColor : null;
    });

  const shapesSlide = async (page: Page) => {
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(500);
  };

  const openDialog = async (page: Page) => {
    await page.locator('.sl-properties [data-theme-edit]').click();
    await expect(page.locator('[data-theme-slots]')).toHaveCount(1);
  };

  test('are typed in, and every shape on the slot follows', async ({ page }) => {
    await openDeck(page);
    await shapesSlide(page);
    expect(await rectangle(page)).toBe('rgb(37, 99, 235)');

    await openDialog(page);

    /**
     * The colour is typed into the field's notation box, which is how a reader
     * enters an exact one — a picker is for choosing and a number is for
     * matching a brand.
     */
    const field = page.locator('[data-theme-slots] [data-color-field="강조 1"]');
    await field.click();
    const notation = page.getByLabel('색상 코드');
    await notation.fill('#c0392b');
    await notation.press('Enter');
    /**
     * The picker is put away before the dialog is answered.
     *
     * It is a 232px layer over the dialog and 적용 is underneath it — measured,
     * the click was intercepted by the saturation square. By pressing the field
     * again rather than by Escape: Escape closes the *dialog* too, which is
     * correct for a dialog and takes the typed colour with it.
     */
    await field.click();
    await expect(field).toHaveAttribute('aria-expanded', 'false');

    // Nothing is applied until 적용: a theme re-colours the whole deck, so twelve
    // fields typed one at a time would be twelve re-colourings and twelve
    // entries of history.
    expect(await rectangle(page)).toBe('rgb(37, 99, 235)');

    await page.locator('[data-theme-apply]').click();

    // The shape is repainted without being touched — it still says
    // `theme:accent1`, and the theme says what that is now.
    await expect.poll(() => rectangle(page)).toBe('rgb(192, 57, 43)');
    expect(
      await page.evaluate(() => {
        const el = document.querySelector('.sl-stage .sl-rectangle')!;
        return (window as any).editor.dataStore.getNode(el.getAttribute('data-bc-sid'))?.attributes
          ?.fill;
      })
    ).toBe('theme:accent1');
  });

  /**
   * And the list stops claiming a preset it is no longer.
   *
   * It read the stored name, so a deck with a changed accent went on calling
   * itself "Office" — and a reader who cannot see that they have a theme of their
   * own cannot see why the list will not put the old one back.
   */
  test('stop claiming the preset they came from', async ({ page }) => {
    await openDeck(page);
    await shapesSlide(page);

    // Something to be a preset first, so the change is what makes the difference.
    await page.locator('.sl-properties').getByLabel('테마').selectOption('Ember');
    await expect
      .poll(() => page.locator('.sl-properties').getByLabel('테마').inputValue())
      .toBe('Ember');

    await openDialog(page);
    const field = page.locator('[data-theme-slots] [data-color-field="강조 1"]');
    await field.click();
    const notation = page.getByLabel('색상 코드');
    await notation.fill('#123456');
    await notation.press('Enter');
    /**
     * The picker is put away before the dialog is answered.
     *
     * It is a 232px layer over the dialog and 적용 is underneath it — measured,
     * the click was intercepted by the saturation square. By pressing the field
     * again rather than by Escape: Escape closes the *dialog* too, which is
     * correct for a dialog and takes the typed colour with it.
     */
    await field.click();
    await expect(field).toHaveAttribute('aria-expanded', 'false');
    await page.locator('[data-theme-apply]').click();

    /**
     * Named, not blank.
     *
     * A `<select>` whose value matches none of its options shows the *first* one,
     * so "nothing chosen" read as "Office" — the exact lie the matching exists to
     * stop, reintroduced by the control. `사용자 지정` is offered while it is the
     * answer and gone once a preset is picked.
     */
    await expect
      .poll(() => page.locator('.sl-properties').getByLabel('테마').inputValue())
      .toBe('사용자 지정');
  });

  test('are put back by choosing a preset in the dialog', async ({ page }) => {
    await openDeck(page);
    await shapesSlide(page);
    await openDialog(page);

    // A reader who has changed three things and wants to start again has one way
    // back: the preset list inside the dialog fills every field.
    const field = page.locator('[data-theme-slots] [data-color-field="강조 1"]');
    await field.click();
    const notation = page.getByLabel('색상 코드');
    await notation.fill('#123456');
    await notation.press('Enter');
    /**
     * The picker is put away before the dialog is answered.
     *
     * It is a 232px layer over the dialog and 적용 is underneath it — measured,
     * the click was intercepted by the saturation square. By pressing the field
     * again rather than by Escape: Escape closes the *dialog* too, which is
     * correct for a dialog and takes the typed colour with it.
     */
    await field.click();
    await expect(field).toHaveAttribute('aria-expanded', 'false');

    await page.locator('.sl-dialog-theme').click();
    await page.locator('[data-style="Ember"]').click();
    await page.locator('[data-theme-apply]').click();

    await expect.poll(() => rectangle(page)).toBe('rgb(234, 88, 12)');
  });

  test('are left alone by 취소', async ({ page }) => {
    await openDeck(page);
    await shapesSlide(page);
    await openDialog(page);

    const field = page.locator('[data-theme-slots] [data-color-field="강조 1"]');
    await field.click();
    const notation = page.getByLabel('색상 코드');
    await notation.fill('#00ff00');
    await notation.press('Enter');
    /**
     * The picker is put away before the dialog is answered.
     *
     * It is a 232px layer over the dialog and 적용 is underneath it — measured,
     * the click was intercepted by the saturation square. By pressing the field
     * again rather than by Escape: Escape closes the *dialog* too, which is
     * correct for a dialog and takes the typed colour with it.
     */
    await field.click();
    await expect(field).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('button', { name: '취소' }).click();
    await page.waitForTimeout(300);
    expect(await rectangle(page)).toBe('rgb(37, 99, 235)');

    // And reopening shows the deck rather than what was typed last time.
    await openDialog(page);
    await expect(page.locator('[data-theme-slots] [data-color-field="강조 1"]')).toHaveAttribute(
      'data-value',
      '#2563eb'
    );
  });
});
