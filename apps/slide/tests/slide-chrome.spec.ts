import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, currentSlide } from './helpers';

/**
 * The chrome around the deck, and what it says about the deck.
 *
 * Every test here is a bug that shipped. The rail draws each slide again and
 * the stage draws every slide and hides all but one, so a query for `.sl-slide`
 * has three answers — a thumbnail's, a hidden slide's, and the right one's — and
 * the chrome asked it twice without saying which it meant.
 */
test.describe('the deck around the slide', () => {
  /**
   * The zoom control read 10%: it measured the first `.sl-slide` in the page,
   * which is a thumbnail, 128 pixels over 1280. Then, scoped to the stage but
   * still unnamed, it read 0% — the stage's first slide is hidden whenever the
   * reader is on any other one.
   */
  test('says the zoom the stage is actually drawing', async ({ page }) => {
    await openDeck(page);

    const check = async () => {
      const shown = await page.locator('input[aria-label], .sl-zoom input').first().inputValue();
      const actual = await page.evaluate((sid) => {
        const el = document.querySelector(`.sl-stage .sl-slide[data-bc-sid="${sid}"]`);
        return el ? Math.round((el.getBoundingClientRect().width / 1280) * 100) : -1;
      }, await currentSlide(page));

      expect(actual).toBeGreaterThan(20);
      expect(Number.parseInt(shown, 10)).toBe(actual);
    };

    await check();
    // And after a change of slide, which is where the second reading went wrong.
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(600);
    await check();
  });

  /**
   * The rail is read for the names. With a picture in the same row they had
   * fifty pixels and every slide was called "T…".
   */
  test('shows each slide’s name in full beside its picture', async ({ page }) => {
    await openDeck(page);

    const names = await page.locator('.sl-filmstrip-name').allTextContents();
    expect(names.length).toBeGreaterThan(1);
    for (const name of names) expect(name).not.toContain('…');

    // And the picture is the slide drawn again, not a grey box.
    const drawn = await page.evaluate(
      () => document.querySelectorAll('.sl-thumb [data-bc-sid]').length
    );
    expect(drawn).toBeGreaterThan(5);
  });

  test('draws a thumbnail at the slide’s own shape', async ({ page }) => {
    await openDeck(page);
    const box = await page.locator('.sl-thumb').first().boundingBox();
    // 16:9, whatever the width the rail gives it.
    expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1);
  });

  test('follows the slide the reader picks', async ({ page }) => {
    await openDeck(page);
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(500);

    await expect(page.locator('.sl-filmstrip button[data-current="true"] .sl-filmstrip-number')).toHaveText('3');
    // Six slides in the sample deck: the sixth is the one that places a component three times.
    await expect(page.locator('.sl-count')).toHaveText('3 / 6');
  });
});

/**
 * Every control draws an icon, not its name.
 *
 * The model says which **act** a control performs — `icon: 'duplicate'` — and the
 * shared table turns that into a drawing. A name the table does not know draws as
 * the name in text, which is the right fallback and a poor default: one control
 * added without an entry reads as `duplicate` beside twenty icons, and nothing
 * else would fail.
 *
 * Asked of the DOM rather than of the table, because that is the question — not
 * "is there an entry" but "does this button draw an icon". And the deck gets most
 * of them free: the table is keyed by the act, so a slide's delete and a shape's
 * are the same entry.
 */
test('every toolbar control draws an icon', async ({ page }) => {
  await openDeck(page);

  const withoutIcon = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-control]'))
      .filter((control) => !control.querySelector('svg'))
      .map((control) => control.getAttribute('data-control'))
  );
  expect(withoutIcon, '아이콘 없이 이름이 글자로 그려진 컨트롤이 있습니다').toEqual([]);

  // And nothing anywhere in the chrome fell back, which the fallback marks.
  expect(await page.locator('[data-icon-missing]').count()).toBe(0);
});

/**
 * The deck this product ships is a document its own schema accepts.
 *
 * Checked in a unit test too, against the fixture — this is the same question
 * asked of the *loaded* document, which is the one a reader actually has. It
 * would have caught the sample table whose rows sat directly under `bTable`,
 * where the schema says `bTableBody+`: it drew perfectly and every table
 * operation refused it, four levels from the fault.
 */
test('the deck loads with no complaint from the schema', async ({ page }) => {
  await openDeck(page);

  const faults = await page.evaluate(() => (window as any).editor?.documentFaults ?? []);
  expect(
    faults,
    `\n${faults.map((f: any) => `${f.path}: ${f.message}`).join('\n')}\n`
  ).toEqual([]);
});

/**
 * The rulers along the slide.
 *
 * There were none — measured, zero of them — so a reader had nothing to place a
 * shape against and nothing to drag a guide from. The arithmetic is
 * `axisTicks`, tested in `office-ui` (46 labels across a slide in
 * centimetres, and the third one says 3 rather than 2.99, which is the whole
 * point of counting in the reader's unit).
 *
 * What only a browser shows is the alignment: a ruler that is off by the slack
 * above a centred slide is a ruler that lies, and it was — by 46 pixels, until
 * it was centred the same way the slide is.
 */
test.describe('the rulers along a slide', () => {
  const box = (page: Page, selector: string) =>
    page.evaluate((sel: string) => {
      const found = document.querySelector(sel);
      if (!found) return null;
      const rect = found.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    }, selector);

  test('line up with the slide, in the unit the panel is showing', async ({ page }) => {
    await openDeck(page);

    const slide = (await box(page, '.sl-stage .sl-slide:not([style*="display: none"])'))!;
    const across = (await box(page, '[data-ruler="x"]'))!;
    const down = (await box(page, '[data-ruler="y"]'))!;

    // By construction rather than by measurement: the same grid column is the
    // same width, and the same row is the same height.
    expect(across.left).toBe(slide.left);
    expect(across.width).toBe(slide.width);
    expect(down.top).toBe(slide.top);
    expect(down.height).toBe(slide.height);

    // Centimetres, counted in centimetres: 0, 1, 2 …
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('[data-ruler="x"] .sl-ruler-tick[data-major="true"] i')]
        .slice(0, 4)
        .map((tick) => tick.textContent)
    );
    expect(labels).toEqual(['0', '1', '2', '3']);
  });

  /**
   * And they measure **this** slide, not the shape a deck usually has.
   *
   * Measured before the fix: the stage fitted the constant 16:9, so a 4:3 deck drew at the
   * scale for a wider one — 497px of slide with 662px of ruler beside it, a ruler measuring a
   * slide that is not there. The fit is `stageFit` in the model now, asked of the surface the
   * reader is on.
   */
  test('measure the slide the deck actually has, not a 16:9 one', async ({ page }) => {
    await openDeck(page);
    await page.evaluate(() =>
      (window as any).editor.executeCommand('setDeckSize', { width: 14400, height: 10800 })
    );
    await page.waitForTimeout(500);

    const slide = (await box(page, '.sl-stage .sl-slide:not([style*="display: none"])'))!;
    const across = (await box(page, '[data-ruler="x"]'))!;
    const down = (await box(page, '[data-ruler="y"]'))!;

    expect(across.width).toBe(slide.width);
    expect(down.height).toBe(slide.height);
    // And 4:3 is what is drawn: 960×720 CSS pixels at whatever scale it fitted at.
    expect(Math.round((slide.width / slide.height) * 100)).toBe(133);
  });

  /** And they follow the reader's unit, because the panel's numbers do. */
  test('are marked in millimetres when the panel is', async ({ page }) => {
    await openDeck(page);
    await page.locator('.sl-properties').getByLabel('단위').selectOption('mm');

    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.querySelectorAll('[data-ruler="x"] .sl-ruler-tick[data-major="true"] i')]
            .slice(0, 3)
            .map((tick) => tick.textContent)
        )
      )
      .toEqual(['0', '10', '20']);
  });

  /**
   * Where the pointer is, which is the question a ruler is asked most — and the
   * one thing here that could not be listened for on the pane: the selection
   * overlay is a fixed layer over the slide, so a pointer over the slide never
   * reaches the stage at all.
   */
  test('mark where the pointer is', async ({ page }) => {
    await openDeck(page);
    const slide = (await box(page, '.sl-stage .sl-slide:not([style*="display: none"])'))!;
    const at = {
      x: Math.round(slide.left + slide.width / 3),
      y: Math.round(slide.top + slide.height / 2)
    };
    await page.mouse.move(at.x, at.y);

    await expect
      .poll(async () => {
        const marks = await page.evaluate(() => {
          const across = document.querySelector('[data-ruler="x"] [data-ruler-pointer]');
          const down = document.querySelector('[data-ruler="y"] [data-ruler-pointer]');
          return {
            x: across ? Math.round(across.getBoundingClientRect().x) : null,
            y: down ? Math.round(down.getBoundingClientRect().y) : null
          };
        });
        return marks;
      })
      .toEqual(at);
  });

  /** Not while presenting: an audience is not measuring anything. */
  test('are gone in the show', async ({ page }) => {
    await openDeck(page);
    await expect(page.locator('[data-ruler="x"]')).toHaveCount(1);

    await page.locator('[data-present]').click();
    await expect(page.locator('[data-ruler="x"]')).toHaveCount(0);
  });
});

/**
 * Ctrl (or ⌘) with the wheel, zooming about the point under the pointer.
 *
 * Neither product had a test for this gesture, in either app, and both had an
 * implementation — the deck's with three measured corrections in it and Word's
 * with none. Extracting the good one into `useWheelZoom` is exactly the change
 * that could have put the drift back without anything failing, so the drift is
 * what this measures.
 *
 * The claim being pinned is the one that took the corrections: **the thing under
 * the pointer stays under the pointer.** Measured as a fraction of the drawn
 * slide, because that is the description that survives the slide being redrawn
 * at another size — predicting the new scroll from the old one drifted 12% of the
 * slide's width over four notches, and correcting in `requestAnimationFrame`
 * instead of a layout effect left 0.8% a notch.
 */
test.describe('zooming with the wheel', () => {
  /** Where the pointer sits on the drawn slide, as a fraction of it. */
  const fractionAt = (page: import('@playwright/test').Page, at: { x: number; y: number }) =>
    page.evaluate((pointer) => {
      const slide = document.querySelector('.sl-stage .sl-slide:not([style*="display: none"])');
      if (!slide) return null;
      const box = slide.getBoundingClientRect();
      return {
        x: (pointer.x - box.left) / box.width,
        y: (pointer.y - box.top) / box.height,
        width: Math.round(box.width),
        zoom: Number(document.querySelector('[data-zoom]')?.getAttribute('data-zoom') ?? 0)
      };
    }, at);

  test('keeps the point under the pointer, notch after notch', async ({ page }) => {
    await openDeck(page);

    // Off centre on purpose: anchoring at the middle is the one case that works
    // however wrongly the correction is computed.
    const aim = await page.evaluate(() => {
      const slide = document.querySelector('.sl-stage .sl-slide:not([style*="display: none"])')!;
      const box = slide.getBoundingClientRect();
      return { x: Math.round(box.left + box.width * 0.72), y: Math.round(box.top + box.height * 0.3) };
    });

    /*
     * **Zoomed in once first**, so the correction has scroll to give.
     *
     * The anchoring gives way at the edges by design — a point cannot be held while the pane is
     * already at `scrollTop: 0` — and a fitted deck has no scroll at all. Which stayed invisible
     * until the toolbar became contextual and the pane grew 32 pixels: the same four notches then
     * left the point 1.8% out, and the correction had done nothing wrong. A test aimed where the
     * clamp is doing the work measures the clamp.
     */
    await page.keyboard.down('Control');
    for (let notch = 0; notch < 3; notch += 1) {
      await page.mouse.move(aim.x, aim.y);
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(120);
    }
    await page.keyboard.up('Control');
    await page.waitForTimeout(200);

    await page.mouse.move(aim.x, aim.y);
    const before = (await fractionAt(page, aim))!;

    await page.keyboard.down('Control');
    for (let notch = 0; notch < 4; notch += 1) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(120);
    }
    await page.keyboard.up('Control');

    const after = (await fractionAt(page, aim))!;

    // It zoomed at all — four notches of 1.1 is about 1.46×.
    expect(after.zoom, '휠이 확대를 하지 못했습니다').toBeGreaterThan(before.zoom * 1.3);
    expect(after.width).toBeGreaterThan(before.width * 1.3);

    /**
     * And the same point of the slide is under the pointer.
     *
     * One per cent of the slide's width, which is twenty times the 0.03% the
     * correction measured and a tenth of what the two rejected approaches left.
     * A tolerance rather than an equality because the correction gives way at the
     * edges by design: a point near the left of the slide cannot be held while
     * the pane is already at `scrollLeft: 0`.
     */
    expect(Math.abs(after.x - before.x), 'X 가 포인터 아래에서 밀렸습니다').toBeLessThan(0.01);
    expect(Math.abs(after.y - before.y), 'Y 가 포인터 아래에서 밀렸습니다').toBeLessThan(0.01);
  });

  test('ignores a wheel with no modifier, and one outside the pane', async ({ page }) => {
    await openDeck(page);
    const zoom = () =>
      page.evaluate(() => Number(document.querySelector('[data-zoom]')?.getAttribute('data-zoom') ?? 0));
    const before = await zoom();

    // A plain wheel scrolls; it does not zoom.
    const middle = await page.evaluate(() => {
      const slide = document.querySelector('.sl-stage .sl-slide:not([style*="display: none"])')!;
      const box = slide.getBoundingClientRect();
      return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
    });
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(250);
    expect(await zoom()).toBe(before);

    // And the gesture belongs to the pane: over the ribbon it is the browser's.
    // Asked by where the pointer is rather than by what the event hit, which is
    // the correction that made it work over a canvas at all — the overlay is a
    // fixed layer above the pane, so `closest()` never saw it.
    await page.mouse.move(20, 8);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -240);
    await page.keyboard.up('Control');
    await page.waitForTimeout(250);
    expect(await zoom(), '창 밖의 휠이 확대를 했습니다').toBe(before);
  });
});
