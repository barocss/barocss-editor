import { test, expect, type Page } from '@playwright/test';

/**
 * The site builder, in a browser.
 *
 * Three claims, and each needs a browser to be worth anything:
 *
 * 1. **One document, several widths.** The same page is drawn at 1280, 834 and 390 at once, every
 *    one of them is a real editor, and typing in any of them types in the page.
 * 2. **A builder, not a document editor.** A click selects a block, a double-click goes in, the panel
 *    changes what is selected, and the layer list reaches what the canvas cannot.
 * 3. **A narrower width says only what differs.** Changing something while editing the mobile width
 *    changes mobile and leaves the page alone — and the panel marks that it did.
 */
const ready = async (page: Page) => {
  await page.goto('/');
  await page.waitForSelector('[data-frame="desktop"] .st-page');
  // The boards render on an effect; one settle is enough because a page places nothing.
  await page.waitForTimeout(400);
};

/**
 * The row of three cards.
 *
 * Named by **where it is on the page**, not by being a row: at 390 it is a column, because that is
 * the whole point of it — a selector that says `[data-layout="row"]` finds nothing on the mobile
 * board and the test reads as though the override had broken something.
 */
const cardRow = (page: Page, frame: string) =>
  page.locator(`[data-frame="${frame}"] .st-page > .st-stack`).nth(1);

/**
 * A click **through the overlay**, which is what a click on this product is.
 *
 * Playwright refuses an ordinary click when something covers the target — and something always
 * covers it here, on purpose: the layer that owns the pointer is the thing that decides what a click
 * means. `force` dispatches at the same point and lets that layer answer, which is exactly what a
 * reader's click does.
 */
const press = (page: Page, at: ReturnType<Page['locator']>, options?: { modifiers?: ['Shift'] }) =>
  at.click({ force: true, ...options });
const pressTwice = (page: Page, at: ReturnType<Page['locator']>) => at.dblclick({ force: true });

const selection = (page: Page) =>
  page.evaluate(() => {
    const editor = (window as any).editor;
    return ((editor?.selection?.nodeIds ?? []) as string[]).map(
      (sid: string) => editor.dataStore.getNode(sid)?.stype
    );
  });

test.describe('a site at several widths', () => {
  test('draws the page once per width, each at its own size', async ({ page }) => {
    await ready(page);

    const frames = page.locator('.st-frame');
    await expect(frames).toHaveCount(3);

    /*
     * `offsetWidth`, which is the board's **own** width — the canvas is scaled, so the rectangle on
     * the screen is the zoom's answer rather than the page's, and a board is 390 pixels wide whether
     * the reader is standing close to it or not.
     */
    const widths = await frames.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).offsetWidth));
    expect(widths).toEqual([1280, 834, 390]);

    for (const id of ['desktop', 'tablet', 'mobile']) {
      await expect(page.locator(`[data-frame="${id}"] h1`)).toHaveText(/한 엔진/);
    }
  });

  test('is one document: typing in the narrow frame is typing in the page', async ({ page }) => {
    await ready(page);
    const before = await page.locator('[data-frame="desktop"] h1').textContent();

    /*
     * Two double-clicks, because this is a builder: the first goes into the block, the second into
     * its words. A single click selects, which is the whole difference from a word processor and the
     * reason this test reads the way it does.
     */
    const hero = page.locator('[data-frame="mobile"] h1');
    await press(page, hero);
    await page.waitForTimeout(200);
    await pressTwice(page, hero);
    await page.waitForTimeout(200);
    await pressTwice(page, hero);
    await page.waitForTimeout(300);
    await expect(page.locator('[data-frame="mobile"] .st-overlay')).toHaveAttribute('data-mode', 'text');

    await page.keyboard.type('!');
    await page.waitForTimeout(500);

    // Every board shows it, because there is no second copy of the text.
    await expect(page.locator('[data-frame="desktop"] h1')).toContainText('!');
    await expect(page.locator('[data-frame="tablet"] h1')).toContainText('!');

    // And one undo takes it back everywhere, because it was one editor's transaction.
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    expect(await page.locator('[data-frame="desktop"] h1').textContent()).toBe(before);
  });

  test('a width can be turned off to make room, and comes back', async ({ page }) => {
    await ready(page);
    await page.locator('[data-control="width-tablet"]').click();
    await expect(page.locator('.st-frame')).toHaveCount(2);
    await expect(page.locator('[data-frame="tablet"]')).toHaveCount(0);

    await page.locator('[data-control="width-tablet"]').click();
    await expect(page.locator('.st-frame')).toHaveCount(3);
  });

  test('shows the pages of the site, and switches between them', async ({ page }) => {
    await ready(page);

    await expect(page.locator('[data-pages] button')).toHaveCount(2);
    await expect(page.locator('[data-frame="desktop"] .st-page')).toHaveAttribute('data-path', '/');

    await page.locator('[data-pages] button').nth(1).click();
    await page.waitForTimeout(500);

    await expect(page.locator('[data-frame="desktop"] .st-page')).toHaveAttribute('data-path', '/about');
    // The header is on both pages, from one definition placed twice — and it draws its **parts**,
    // which is what a snapshot taken around the proxy instead of through it silently lost.
    await expect(page.locator('[data-frame="desktop"] .st-placement')).toHaveCount(1);
    await expect(page.locator('[data-frame="desktop"] .st-placement h4')).toHaveText('Barocss');
  });
});

test.describe('a narrower width', () => {
  test('draws the same row as a row and as a column, at the same instant', async ({ page }) => {
    await ready(page);

    await expect(cardRow(page, 'desktop')).toHaveCSS('flex-direction', 'row');
    await expect(cardRow(page, 'mobile')).toHaveCSS('flex-direction', 'column');
    // 720 twips = 48px; the override says 360, which is 24.
    await expect(cardRow(page, 'desktop')).toHaveCSS('padding', '48px');
    await expect(cardRow(page, 'mobile')).toHaveCSS('padding', '24px');
    // The gap was never mentioned at 390, so the page's own answer reaches it.
    await expect(cardRow(page, 'mobile')).toHaveCSS('gap', '16px');
  });

  test('is still the same words, because there is no second copy', async ({ page }) => {
    await ready(page);
    const titles = async (frame: string) =>
      await page.locator(`[data-frame="${frame}"] .st-page > .st-stack h3`).allTextContents();
    expect(await titles('mobile')).toEqual(await titles('desktop'));
  });
});

test.describe('a list that comes from data', () => {
  test('draws one card per row, in the order the data was asked for', async ({ page }) => {
    await ready(page);

    const cards = page.locator('[data-frame="desktop"] .st-collection > .st-placement');
    await expect(cards).toHaveCount(3);
    await expect(cards.locator('h3')).toHaveText(['사이트', '문서', '덱']);
    await expect(cards.nth(0).locator('p')).toHaveText(['쌓이는 섹션, 브라우저가 배치.', '월 7,900원']);
  });

  test('is one placement in the document and a stack on the screen', async ({ page }) => {
    await ready(page);

    for (const id of ['desktop', 'tablet', 'mobile']) {
      await expect(page.locator(`[data-frame="${id}"] .st-collection > .st-placement`)).toHaveCount(3);
    }
    await expect(page.locator('[data-frame="desktop"] .st-collection')).toHaveCSS('flex-direction', 'row');
    await expect(page.locator('[data-frame="mobile"] .st-collection')).toHaveCSS('flex-direction', 'column');
  });
});

/** The half that makes it a builder rather than a page with three previews. */
test.describe('pointing at the page', () => {
  test('a click selects the outermost block, and outlines it at every width', async ({ page }) => {
    await ready(page);

    await press(page, cardRow(page, 'desktop').locator('h3').first());
    await page.waitForTimeout(300);

    expect(await selection(page)).toEqual(['frame']);
    // One selection, three drawings — which is the thing a reader most needs to see when they are
    // looking at three widths at once.
    await expect(page.locator('.st-mark-selected')).toHaveCount(3);
    await expect(page.locator('.st-mark-selected .st-mark-name').first()).toHaveText('가로 스택');
  });

  test('a double-click goes one level in, and a second reaches the words', async ({ page }) => {
    await ready(page);
    const heading = cardRow(page, 'desktop').locator('h3').first();

    await press(page, heading);
    await page.waitForTimeout(200);
    await pressTwice(page, heading);
    await page.waitForTimeout(250);
    // Into the card.
    expect(await selection(page)).toEqual(['frame']);

    await pressTwice(page, heading);
    await page.waitForTimeout(300);
    await expect(page.locator('[data-frame="desktop"] .st-overlay')).toHaveAttribute('data-mode', 'text');
    /*
     * And the node selection is **gone**, which is right rather than a defect: the reader is in the
     * words now, and where they are is a caret. A builder that kept the block selected as well would
     * be a builder where Delete means two different things at once.
     */
    expect(await selection(page)).toEqual([]);

    /*
     * And the caret is *there* — entering the text is a decision rather than a click, because the
     * layer over the board swallowed the double-click that would have placed it. Without asking for
     * the caret the mode changed and typing did nothing at all.
     */
    await page.keyboard.type('가');
    await page.waitForTimeout(400);
    await expect(heading).toContainText('가');

    // Escape comes back out to the block whose words were being typed, not to nothing.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(page.locator('[data-frame="desktop"] .st-overlay')).toHaveAttribute('data-mode', 'select');
    expect(await selection(page)).toEqual(['heading']);
  });

  test('shift adds to the selection, because a selection is a set', async ({ page }) => {
    await ready(page);
    const cards = cardRow(page, 'desktop').locator('.st-stack');

    await press(page, cards.nth(0).locator('h3'));
    await page.waitForTimeout(200);
    await pressTwice(page, cards.nth(0).locator('h3'));
    await page.waitForTimeout(250);
    await press(page, cards.nth(1).locator('h3'), { modifiers: ['Shift'] });
    await page.waitForTimeout(300);

    expect(await selection(page)).toEqual(['frame', 'frame']);
    await expect(page.locator('[data-frame="desktop"] .st-mark-selected')).toHaveCount(2);
  });

  test('the layer list reaches the same blocks, and shows the same selection', async ({ page }) => {
    await ready(page);

    const rows = page.locator('.st-layer');
    await expect(rows.first()).toHaveText(/블록/);

    await rows.nth(2).click();
    await page.waitForTimeout(300);
    await expect(page.locator('.st-layer[data-selected="true"]')).toHaveCount(1);
    await expect(page.locator('.st-mark-selected')).toHaveCount(3);
  });
});

test.describe('the panel', () => {
  test('changes the selected block, at the width being edited', async ({ page }) => {
    await ready(page);
    await press(page, cardRow(page, 'desktop').locator('h3').first());
    await page.waitForTimeout(300);

    const gap = page.locator('.office-properties').getByLabel('간격');
    await gap.fill('40');
    await gap.press('Enter');
    await page.waitForTimeout(400);

    // Every width, because the widest width *is* the node.
    await expect(cardRow(page, 'desktop')).toHaveCSS('gap', '40px');
    await expect(cardRow(page, 'mobile')).toHaveCSS('gap', '40px');
  });

  test('writes only a difference when a narrower width is being edited', async ({ page }) => {
    await ready(page);
    await press(page, cardRow(page, 'desktop').locator('h3').first());
    await page.waitForTimeout(300);

    await page.locator('.st-at button[data-at="mobile"]').click();
    await page.waitForTimeout(200);
    // Said out loud, because a reader who forgets which width they are editing writes a change
    // nobody else can see.
    await expect(page.locator('.st-at-note')).toContainText('모바일');

    const gap = page.locator('.office-properties').getByLabel('간격');
    await gap.fill('4');
    await gap.press('Enter');
    await page.waitForTimeout(400);

    await expect(cardRow(page, 'mobile')).toHaveCSS('gap', '4px');
    // The page is untouched: 240 twips of gap is 16px, and that is still what the desktop draws.
    await expect(cardRow(page, 'desktop')).toHaveCSS('gap', '16px');
    // And the panel marks the property, so the reader can tell this value from the page's own.
    await expect(page.locator('.office-properties')).toContainText('간격 ·');
  });
});

/**
 * Moving, copying and removing — in a browser, because a pointer and a keyboard are what these are.
 *
 * The *arithmetic* of all three is settled in `packages/office-site` unit tests: which place a drop
 * means, which index that is in the parent's content, what a copy contains, what a delete leaves.
 * What only a browser can answer is whether the gesture reaches the command at all.
 */
test.describe('moving a block', () => {
  const cards = (page: Page) => cardRow(page, 'desktop').locator('.st-stack');

  test('carries a card past its neighbours and drops it there', async ({ page }) => {
    // Room to see the whole row: a pointer past the edge of the board is a pointer over nothing, and
    // a drag that finds nothing does nothing — which is right, and would make this test lie.
    await page.setViewportSize({ width: 1600, height: 1000 });
    await ready(page);
    const titles = () => cardRow(page, 'desktop').locator('h3').allTextContents();
    expect(await titles()).toEqual(['문서', '덱', '사이트']);

    // Into the row first: a drag carries whatever a click would select, and at the top that is the
    // row rather than a card in it.
    await press(page, cards(page).nth(0).locator('h3'));
    await pressTwice(page, cards(page).nth(0).locator('h3'));
    await page.waitForTimeout(250);

    const from = (await cards(page).nth(0).boundingBox())!;
    const to = (await cards(page).nth(2).boundingBox())!;
    await page.mouse.move(from.x + 8, from.y + 8);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + 12, { steps: 4 });
    await page.mouse.move(to.x + to.width - 8, to.y + 12, { steps: 8 });
    await page.waitForTimeout(200);

    // The line a reader steers by: drawn where it would land, not guessed at — and it says which
    // place, so a drop that goes somewhere else is a fault with a number attached rather than a
    // rearranged page nobody can explain.
    await expect(page.locator('[data-frame="desktop"] .st-mark-landing')).toHaveCount(1);
    await expect(page.locator('[data-frame="desktop"] .st-overlay')).toHaveAttribute('data-landing', '2');
    await page.mouse.up();
    await page.waitForTimeout(500);

    expect(await titles()).toEqual(['덱', '사이트', '문서']);
  });

  test('copies and removes what is selected, from the keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await ready(page);
    const sections = page.locator('[data-frame="desktop"] .st-page > .st-stack');
    const before = await sections.count();

    await press(page, cardRow(page, 'desktop').locator('h3').first());
    await page.waitForTimeout(300);

    await page.keyboard.press('Control+d');
    await page.waitForTimeout(500);
    await expect(sections).toHaveCount(before + 1);

    await page.keyboard.press('Delete');
    await page.waitForTimeout(500);
    await expect(sections).toHaveCount(before);
  });
});
