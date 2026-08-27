import { test, expect, type Page } from '@playwright/test';
import { siteControlsIn } from '@barocss/office-site';

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
  page.locator(`[data-frame="${frame}"] .st-stack[data-name="제품 셋"]`);

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

/**
 * A press that reaches **all the way in**, which is what ⌘ means on a canvas.
 *
 * A click selects the outermost block and a double-click goes one level further — right, and the
 * reason a reader dragging a section does not get a word inside it. A real section is a band with a
 * column inside it, so the thing a test wants to hold is three or four gestures down; this is the
 * one gesture every design tool offers instead, and it is what these use.
 */
const pressDeep = (page: Page, at: ReturnType<Page['locator']>) =>
  at.click({ force: true, modifiers: ['Meta'] });

/**
 * The same gesture, **at a corner** rather than at the middle.
 *
 * "Innermost" is measured under the pointer, and the middle of a card is its heading — so a ⌘-click
 * aimed at a card selects the words in it. Eight pixels in from the corner is the card's own padding,
 * which is the card and nothing else. A reader does this without thinking about it; a test has to
 * say where it pressed.
 */
const pressDeepAt = (page: Page, at: ReturnType<Page['locator']>, x = 8, y = 8) =>
  at.click({ force: true, modifiers: ['Meta'], position: { x, y } });

/**
 * Pan the plane until something is in the middle of the studio.
 *
 * The canvas has no scrollbars — it is an infinite plane the reader moves under a window — so a
 * block below the fold has to be **brought to the reader**, and a click computed from a bounding box
 * that is off-screen lands wherever that point happens to be on the window. Which is what a reader
 * does too: wheel until you can see it, then press.
 *
 * A plain wheel pans, and the hook moves the plane by the negated delta, so the delta to send is the
 * distance from the middle of the pane to the thing.
 */
const bring = async (page: Page, at: ReturnType<Page['locator']>) => {
  const box = await at.boundingBox();
  const pane = await page.locator('.st-canvas').boundingBox();
  if (!box || !pane) return;
  const middle = { x: pane.x + pane.width / 2, y: pane.y + pane.height / 2 };
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.wheel(box.x + box.width / 2 - middle.x, box.y + box.height / 2 - middle.y);
  await page.waitForTimeout(250);
};
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
      await expect(page.locator(`[data-frame="${id}"] h1`)).toHaveText(/세 가지/);
    }
  });

  test('is one document: typing in the narrow frame is typing in the page', async ({ page }) => {
    await ready(page);
    const before = await page.locator('[data-frame="desktop"] h1').textContent();

    /*
     * ⌘ to reach the heading, then one double-click for the caret.
     *
     * It was a click and two double-clicks, which was the whole depth of the sample at the time. A
     * page laid out the way a page actually is — a band, a column, a row, the words — is four levels,
     * and walking it a gesture at a time is what ⌘ exists to skip. The rule underneath is unchanged
     * and is what the next test still holds: a click selects, a double-click goes one further.
     */
    const hero = page.locator('[data-frame="mobile"] h1');
    await pressDeep(page, hero);
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

    /*
     * In **보기**, not on the toolbar, and the move is the point: which boards are on screen is a
     * view setting a reader changes rarely, and a toolbar holds what acts on the selection. It was
     * three accent-bordered toggles beside 선택/텍스트 — *one of these* drawn identically to *any of
     * these*, so nothing said that turning all three boards off is allowed and turning both modes
     * off is not.
     */
    const width = async (nth: number) => {
      await page.locator('.st-menubar [data-menu="view"]').click();
      await page.locator(`[data-menu-item="view.frames.${nth}"]`).click();
      await page.waitForTimeout(300);
    };

    await width(1);
    await expect(page.locator('.st-frame')).toHaveCount(2);
    await expect(page.locator('[data-frame="tablet"]')).toHaveCount(0);

    await width(1);
    await expect(page.locator('.st-frame')).toHaveCount(3);
  });

  test('says which boards are on, because a toggle a reader cannot read is a button', async ({ page }) => {
    await ready(page);
    await page.locator('.st-menubar [data-menu="view"]').click();

    // A menu of settings drawn as a menu of actions makes a reader press one to find out what it
    // was. All three are on when a site opens.
    await expect(page.locator('[data-menu-item="view.frames.0"]')).toHaveAttribute('data-checked', 'true');
    await expect(page.locator('[data-menu-item="view.preview.0"]')).not.toHaveAttribute('data-checked', 'true');
  });

  test('refuses to turn off the last board, which would show nothing', async ({ page }) => {
    await ready(page);
    const off = async (nth: number) => {
      await page.locator('.st-menubar [data-menu="view"]').click();
      await page.locator(`[data-menu-item="view.frames.${nth}"]`).click();
      await page.waitForTimeout(250);
    };

    await off(1);
    await off(2);
    await expect(page.locator('.st-frame')).toHaveCount(1);

    // And the last one stays: a reader with no boards has no board left to press.
    await off(0);
    await expect(page.locator('.st-frame')).toHaveCount(1);
  });

  test('shows the pages of the site, and switches between them', async ({ page }) => {
    await ready(page);
    // The pages live on the rail now, beside the site's other lists — its components and its data.
    await page.locator('[data-panel="pages"]').click();

    // `[data-page]` rather than any button in the list: a row is a page **and** what can be done to
    // it — copy it, move it, take it away — so counting buttons counts the acts as well.
    await expect(page.locator('[data-pages] [data-page]')).toHaveCount(5);
    await expect(page.locator('[data-frame="desktop"] .st-page')).toHaveAttribute('data-path', '/');

    await page.locator('[data-pages] [data-page]').nth(1).click();
    await page.waitForTimeout(500);

    await expect(page.locator('[data-frame="desktop"] .st-page')).toHaveAttribute('data-path', '/제품');
    /*
     * The header and the footer: two placements of two definitions, on this page and on every other.
     * And they draw their **parts** — which is what a snapshot taken around the proxy rather than
     * through it silently lost, on a page where the header looked like an empty box.
     */
    /*
      Three: the header, the footer, and the button **inside the header's own definition** — a
      placement of a definition that itself places one, which is what makes the bar's call to action
      the same button as the hero's.
    */
    await expect(page.locator('[data-frame="desktop"] .st-placement')).toHaveCount(4);
    await expect(page.locator('[data-frame="desktop"] .st-placement h4')).toHaveText('Barocss');
  });
});

test.describe('a narrower width', () => {
  test('draws the same row as a row and as a column, at the same instant', async ({ page }) => {
    await ready(page);

    await expect(cardRow(page, 'desktop')).toHaveCSS('flex-direction', 'row');
    await expect(cardRow(page, 'mobile')).toHaveCSS('flex-direction', 'column');
    // 360 twips = 24px; the override says 240, which is 16.
    await expect(cardRow(page, 'desktop')).toHaveCSS('gap', '24px');
    await expect(cardRow(page, 'mobile')).toHaveCSS('gap', '16px');
    // The padding is the section's and is never mentioned at either width, so the two agree.
    await expect(cardRow(page, 'mobile')).toHaveCSS('padding', '0px');
  });

  test('is still the same words, because there is no second copy', async ({ page }) => {
    await ready(page);
    const titles = async (frame: string) =>
      await page.locator(`[data-frame="${frame}"] .st-page h3`).allTextContents();
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
    // The name the sample gave it, which is what `name` is for — a stack with none says what it does.
    // The band, because a plain click selects the outermost block — the row is inside it.
    await expect(page.locator('.st-mark-selected .st-mark-name').first()).toHaveText('카드 줄');
  });

  test('a double-click goes one level in, and a second reaches the words', async ({ page }) => {
    await ready(page);
    const heading = cardRow(page, 'desktop').locator('h3').first();

    // Into the band, then into the column inside it, then the row, then the card: one level per
    // gesture, which is the rule. ⌘ is the shortcut past it and the next test uses that.
    await press(page, heading);
    await page.waitForTimeout(200);
    for (let step = 0; step < 3; step += 1) {
      await pressTwice(page, heading);
      await page.waitForTimeout(200);
    }
    // In the card.
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
    await bring(page, cardRow(page, 'desktop'));

    /*
      ⌘ into the first card, then shift for the second.
      Shift adds *at the scope the reader is in*, and ⌘ moved that scope to the row — so the second
      press adds the card beside it rather than the band both of them are in.
     */
    await pressDeepAt(page, cards.nth(0));
    await page.waitForTimeout(250);
    await press(page, cards.nth(1).locator('h3'), { modifiers: ['Shift'] });
    await page.waitForTimeout(300);

    expect(await selection(page)).toEqual(['frame', 'frame']);
    await expect(page.locator('[data-frame="desktop"] .st-mark-selected')).toHaveCount(2);
  });

  test('the layer list reaches the same blocks, and shows the same selection', async ({ page }) => {
    await ready(page);
    // 구성, which is one panel of the rail now rather than the whole left side.
    await page.locator('[data-panel="layers"]').click();

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
    // A card, reached at its corner so the press is the card rather than the words in it.
    const card = (frame: string) => cardRow(page, frame).locator('.st-stack').first();
    await bring(page, cardRow(page, 'desktop'));
    await pressDeepAt(page, card('desktop'));
    await page.waitForTimeout(300);

    const gap = page.locator('.office-properties').getByLabel('간격');
    await gap.fill('40');
    await gap.press('Enter');
    await page.waitForTimeout(400);

    // Every width, because the widest width *is* the node.
    await expect(card('desktop')).toHaveCSS('gap', '40px');
    await expect(card('mobile')).toHaveCSS('gap', '40px');
  });

  test('writes only a difference when a narrower width is being edited', async ({ page }) => {
    await ready(page);
    const card = (frame: string) => cardRow(page, frame).locator('.st-stack').first();
    await bring(page, cardRow(page, 'desktop'));
    await pressDeepAt(page, card('desktop'));
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

    await expect(card('mobile')).toHaveCSS('gap', '4px');
    // The page is untouched: 180 twips of gap is 12px, and that is still what the desktop draws.
    await expect(card('desktop')).toHaveCSS('gap', '12px');
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
    // The widest card first, because it is the product the page is about — see `sample-site.ts`.
    expect(await titles()).toEqual(['사이트', '문서', '덱']);

    /*
     * Into a card first: a drag carries whatever a click would select, and at the top of the page
     * that is the band the section paints rather than a card in it. ⌘ at a corner is the one gesture
     * that reaches the card, and a reader dragging one has already done it.
     */
    await bring(page, cardRow(page, 'desktop'));
    await pressDeepAt(page, cards(page).nth(0));
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

    expect(await titles()).toEqual(['문서', '덱', '사이트']);
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

/**
 * The property panel.
 *
 * Written against a sample dense enough to use the schema — five pages, a grid, a fixed sidebar, two
 * data lists, design tokens, a bound button — because a panel can only be judged against a document
 * that uses the properties. Each test is one thing a reader could see and not change before.
 */
test.describe('the panel', () => {
  const panel = (page: Page) => page.locator('.office-properties');

  test('says what the page is called and where it answers, with nothing selected', async ({ page }) => {
    await ready(page);
    await expect(panel(page).getByLabel('페이지 이름')).toHaveValue('홈');
    await expect(panel(page).getByLabel('페이지 주소')).toHaveValue('/');

    await panel(page).getByLabel('페이지 주소').fill('/처음');
    await panel(page).getByLabel('페이지 주소').press('Enter');
    await page.waitForTimeout(400);
    // The drawing says it, which is why `surface` draws its own `path` at all.
    await expect(page.locator('[data-frame="desktop"] .st-page')).toHaveAttribute('data-path', '/처음');
  });

  test('rounds a box and decides whether it is a window', async ({ page }) => {
    /*
     * The two things a page's frame says that a canvas's frame does not, and both were found by the
     * same sweep — for each node type, which of its declared attributes the panel offers.
     *
     * A **radius** because a card is a frame, and only `rectangle` had one: the shape that could be
     * rounded arranges nothing, so the most ordinary box on a web page was undrawable except as a
     * rectangle behind a frame, which is two nodes for one box and neither of them the one a reader
     * would select.
     *
     * And **clipping**, which was worse for being invisible: `frameCss` writes `overflow: hidden`
     * unless told otherwise — right on a canvas, where a frame is a stated size and a window onto
     * what it holds — and a page's box has no stated size, so it showed up only when something
     * deliberately left the box, by deleting it. Nine stacks on this very sample were clipping with
     * no control anywhere to stop one, which is every overlapping design there could have been.
     */
    await ready(page);
    const hero = page.locator('[data-frame="desktop"] .st-stack[data-name="히어로"]');
    await press(page, hero);
    await page.waitForTimeout(300);
    await panel(page).getByRole('tab', { name: '모양' }).click();

    // Silence means visible on a page, which is the default this product disagrees with a canvas about.
    await expect(hero).toHaveCSS('overflow', 'visible');
    await expect(hero).toHaveCSS('border-radius', '0px');

    await panel(page).getByLabel('모서리 둥글기').fill('24');
    await panel(page).getByLabel('모서리 둥글기').press('Enter');
    await page.waitForTimeout(400);
    // 360 twips is 24px; the panel speaks pixels and the document keeps twips, as everywhere else.
    await expect(hero).toHaveCSS('border-radius', '24px');

    await panel(page).getByLabel('넘치는 것 자르기').check({ force: true });
    await page.waitForTimeout(400);
    await expect(hero).toHaveCSS('overflow', 'hidden');
  });

  test('names the selected block, and changes what it is called', async ({ page }) => {
    await ready(page);
    await press(page, page.locator('[data-frame="desktop"] .st-stack[data-name="히어로"]'));
    await page.waitForTimeout(300);

    await expect(panel(page).getByLabel('이름')).toHaveValue('히어로');

    /*
     * The padding shows **nothing**, and that is the answer rather than a gap in it: the hero states
     * 96 above and 104 below, so there is no single padding to show. A field that printed the
     * shorthand's own value would be telling a reader their section has none while they are looking
     * at the air over the heading — which is what it did until the panel learned to say "mixed".
     */
    await expect(panel(page).getByLabel('안쪽 여백')).toHaveValue('');

    // And typing one answers for all four sides, which is what typing into a shorthand means.
    await panel(page).getByLabel('안쪽 여백').fill('24');
    await panel(page).getByLabel('안쪽 여백').press('Enter');
    await page.waitForTimeout(400);
    await expect(page.locator('[data-frame="desktop"] .st-stack[data-name="히어로"]')).toHaveCSS('padding', '24px');

    await panel(page).getByLabel('이름').fill('첫 화면');
    await panel(page).getByLabel('이름').press('Enter');
    await page.waitForTimeout(400);

    // The drawing says it, and so does the layer list — which is a panel of the rail now.
    await expect(page.locator('[data-frame="desktop"] .st-stack[data-name="첫 화면"]')).toHaveCount(1);
    await page.locator('[data-panel="layers"]').click();
    await expect(page.locator('.st-layer[data-selected="true"]')).toHaveText('첫 화면');
  });

  test('shows what a list draws, and changes how many of them', async ({ page }) => {
    await ready(page);
    const list = page.locator('[data-frame="desktop"] .st-collection');
    // The list itself: a plain click would select the band the section paints.
    await pressDeep(page, list);
    await page.waitForTimeout(300);

    await panel(page).locator('[data-tab="data"]').click();
    /*
     * The dataset by its label and its size, and the columns it declares — a reader **picks** a
     * column rather than typing one, which is why `dataset.fields` is declared rather than inferred
     * from the first row.
     *
     * Read as text rather than as a value: `ChoiceSelect` is Radix's, so its trigger is a button
     * showing the chosen option's label, not an `<input>` holding its id.
     */
    await expect(panel(page).getByLabel('데이터 목록')).toContainText('상품 목록 (4)');
    await expect(panel(page).getByLabel('정렬 기준')).toContainText('순서');
    await expect(panel(page).getByLabel('거를 칸')).toContainText('분류');
    await expect(panel(page).getByLabel('거를 값')).toHaveValue('제품');

    await expect(list.locator('> .st-placement')).toHaveCount(3);
    await panel(page).getByLabel('개수').fill('2');
    await panel(page).getByLabel('개수').press('Enter');
    await page.waitForTimeout(500);
    await expect(list.locator('> .st-placement')).toHaveCount(2);
  });

  test('shows a colour that follows a token by its name, not as a hex', async ({ page }) => {
    await ready(page);
    // A card, reached in one gesture — it is four levels under the page.
    await bring(page, cardRow(page, 'desktop'));
    await pressDeepAt(page, cardRow(page, 'desktop').locator('.st-stack').first());
    await page.waitForTimeout(300);

    await panel(page).locator('[data-tab="style"]').click();
    /*
     * The whole point of a design token: two cards the same grey are a coincidence, two cards on
     * `var:바탕` are a decision — so the control says which one it follows.
     */
    await expect(panel(page)).toContainText('카드 면');
  });

  test('answers a placement’s own question, and the words change', async ({ page }) => {
    await ready(page);
    /*
     * The hero's button. The header places one too — the bar's call to action is the same
     * definition — so this is the *third* placement drawn on the page rather than the second.
     */
    const button = page.locator('[data-frame="desktop"] .st-placement').nth(2);
    await expect(button).toContainText('무료로 시작하기');

    /*
     * ⌘ selects it where it is drawn.
     *
     * It was reached from the layer list, because a double-click on a placement **opens what it
     * draws** — a placement has no children anybody can select, so that is the only thing the
     * gesture can honestly mean — and the list was the only other way in. ⌘ is the other way now,
     * and the list is still there for a block nobody can point at.
     */
    await pressDeep(page, button);
    await page.waitForTimeout(300);

    await panel(page).locator('[data-tab="values"]').click();
    await panel(page).getByLabel('문구').fill('지금 시작하기');
    await panel(page).getByLabel('문구').press('Enter');
    await page.waitForTimeout(500);

    // One answer, and every drawing of that placement says it.
    await expect(button).toContainText('지금 시작하기');
  });
});

/**
 * The page a visitor gets, opened in a real browser.
 *
 * The unit suite compares the export's media queries with the editor's own drawing, property by
 * property. This is the other half and the one only a browser can do: **put the exported page in a
 * browser at 390 pixels and ask the layout engine what it did.** A media query that says the right
 * thing and a browser that does something else is a difference nothing else here would see.
 */
test.describe('the exported page', () => {
  const exported = async (page: Page, path: string) =>
    await page.evaluate(
      (want) => (window as any).exportSite().find((one: any) => one.path === want)?.html ?? '',
      path
    );

  test('lays out the same way the editor drew it, at every width', async ({ page }) => {
    await ready(page);
    const html = await exported(page, '/');
    expect(html).toContain('문서 한 벌로 세 가지를 만듭니다');

    // What the editor's own boards decided, read off the screen.
    const editorSays = async (frame: string) =>
      await cardRow(page, frame).evaluate((node) => {
        const style = getComputedStyle(node);
        return { direction: style.flexDirection, padding: style.padding, gap: style.gap };
      });
    const wide = await editorSays('desktop');
    const narrow = await editorSays('mobile');
    expect(wide.direction).toBe('row');
    expect(narrow.direction).toBe('column');

    // And what the **published** page does, in the same browser, with nothing but the file.
    const visitor = await page.context().newPage();
    const asks = async (width: number) => {
      await visitor.setViewportSize({ width, height: 900 });
      await visitor.setContent(html);
      await visitor.waitForTimeout(120);
      return await visitor
        .locator('.st-stack[data-name="제품 셋"]')
        .evaluate((node) => {
          const style = getComputedStyle(node);
          return { direction: style.flexDirection, padding: style.padding, gap: style.gap };
        });
    };

    expect(await asks(1280)).toEqual(wide);
    expect(await asks(390)).toEqual(narrow);
    await visitor.close();
  });

  test('draws the data, and the same rows in the same order', async ({ page }) => {
    await ready(page);
    const html = await exported(page, '/');

    const visitor = await page.context().newPage();
    await visitor.setContent(html);
    await visitor.waitForTimeout(120);

    // A list is resolved rather than stored, so an exporter that walked the document would publish
    // one card. These are the three the editor shows, in the order the data was asked for.
    const cards = visitor.locator('.st-collection > .st-placement');
    await expect(cards).toHaveCount(3);
    await expect(cards.locator('h3')).toHaveText(['사이트', '문서', '덱']);

    // And they are the same three the editor is drawing at this moment.
    await expect(page.locator('[data-frame="desktop"] .st-collection > .st-placement h3')).toHaveText([
      '사이트',
      '문서',
      '덱'
    ]);
    await visitor.close();
  });

  test('publishes what a design token resolved to, not the reference', async ({ page }) => {
    await ready(page);
    const html = await exported(page, '/');

    const visitor = await page.context().newPage();
    await visitor.setContent(html);
    await visitor.waitForTimeout(120);

    /*
     * `var:강조` is a fact about the *document*. A visitor's browser has never heard of it, so the
     * export has to publish what it resolved to — and the editor has to keep the reference, so that
     * changing the token still changes the site.
     */
    expect(html).not.toContain('var:강조');
    await expect(visitor.locator('.st-collection > .st-placement .st-stack').first()).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)'
    );
    await visitor.close();
  });
});

/**
 * The rail: one column, several panels.
 *
 * The question that found the gap was the plainest a reader can ask — *where do I add a heading?* —
 * and the answer was nowhere. These are that answer, and each is one thing a reader could not do.
 */
/**
 * The **구성** list, which is a tree rather than a wall.
 *
 * Measured on the sample's home page before it was one: **110 rows, 2,923 pixels of them, in a
 * 928-pixel pane** — three screens of list, every row expanded because there was nothing to close.
 * A reader looking for the footer scrolled past a hundred rows of things they were not looking for.
 *
 * Closed by default is what every tool of this kind does — Figma's frames, Sketch's groups,
 * Photoshop's layer sets — and here the reason is that number rather than the convention: a page is
 * a tree four deep and the top of it is the only part a reader can hold in their head.
 */
test.describe('the layer list', () => {
  const layers = async (page: Page) => {
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(300);
  };

  test('opens closed, so the page is its bands rather than everything it holds', async ({ page }) => {
    await ready(page);
    await layers(page);

    const rows = await page.locator('[data-layer]').count();
    const blocks = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const home = (root.content ?? [])
        .map((one: string) => store.getNode(one))
        .find((one: any) => one?.stype === 'surface');
      let n = 0;
      const walk = (sid: string) => {
        const node = store.getNode(sid);
        if (!node) return;
        n += 1;
        for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
      };
      for (const child of home.content ?? []) walk(child);
      return n;
    });

    // A number rather than a shrug: the page holds around a hundred blocks and the list shows a dozen.
    expect(blocks).toBeGreaterThan(60);
    expect(rows).toBeLessThan(20);
  });

  test('opens and closes what a triangle is on, and nothing else', async ({ page }) => {
    await ready(page);
    await layers(page);

    const before = await page.locator('[data-layer]').count();
    const twist = page.locator('[data-twist]').first();
    await expect(twist).toHaveAttribute('data-twist', 'closed');

    await twist.click();
    await page.waitForTimeout(300);
    expect(await page.locator('[data-layer]').count()).toBeGreaterThan(before);
    await expect(page.locator('[data-twist]').first()).toHaveAttribute('data-twist', 'open');

    await page.locator('[data-twist]').first().click();
    await page.waitForTimeout(300);
    expect(await page.locator('[data-layer]').count()).toBe(before);
  });

  test('a triangle shows what is inside; the row beside it selects', async ({ page }) => {
    await ready(page);
    await layers(page);

    /*
     * Two gestures on one row, and they must not be the same one. Opening a band to look for
     * something inside it is not choosing the band — a reader who had their selection replaced every
     * time they went looking would lose it constantly.
     */
    await page.locator('[data-twist]').first().click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as any).editor.selection?.nodeIds?.length ?? 0)).toBe(0);

    await page.locator('[data-layer]').first().click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as any).editor.selection?.nodeIds?.length ?? 0)).toBe(1);
  });

  test('is simply open when the whole tree fits on a screen', async ({ page }) => {
    await ready(page);

    /*
     * Closed-by-default is an answer to 110 rows; it is not an answer to two. A reader who opens the
     * button definition — a stack with a word in it — and is shown one closed row has been made to
     * press a triangle to see something they could have been shown. The board's root changes when a
     * definition is being edited, so this is the ordinary case rather than an edge one.
     */
    await page.locator('[data-panel="components"]').click();
    await page.locator('[data-edit-component="cta"]').click();
    await page.waitForTimeout(500);
    await layers(page);

    await expect(page.locator('.st-layer')).toHaveText(['가로 스택', '본문']);
    await expect(page.locator('[data-twist="open"]')).toHaveCount(1);
  });

  /**
   * **Hiding a block**, which is the commonest reason anybody opens a layer list.
   *
   * A reader drafting a section wants it off the page for a week, and without this the only move
   * available is *delete it and undo later* — which is not a move, it is a thing they will get wrong
   * once and never try again.
   */
  test('takes a block off the page and keeps it in the list', async ({ page }) => {
    await ready(page);
    await layers(page);

    const row = page.locator('[data-layer]').nth(1);
    const sid = await row.getAttribute('data-layer');
    const drawn = page.locator(`[data-frame="desktop"] [data-bc-sid="${sid}"]`).first();
    expect(await drawn.evaluate((one) => getComputedStyle(one as HTMLElement).display)).not.toBe('none');

    await row.hover();
    await row.locator('button').first().click();
    await page.waitForTimeout(500);

    expect(await drawn.evaluate((one) => getComputedStyle(one as HTMLElement).display)).toBe('none');
    /*
     * And still listed. Gone from the canvas and present in the list is what Figma, Sketch and
     * Photoshop all do, for the reason that decides it: a block a reader cannot get back to is a
     * block they have lost.
     */
    await expect(page.locator(`[data-layer="${sid}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-layer="${sid}"]`)).toHaveAttribute('data-hidden', 'true');
  });

  test('does not publish what a reader hid — not the words, not a rule naming it', async ({ page }) => {
    await ready(page);
    await layers(page);

    const row = page.locator('[data-layer]').nth(1);
    const sid = await row.getAttribute('data-layer');
    await row.hover();
    await row.locator('button').first().click();
    await page.waitForTimeout(500);

    const html = await page.evaluate(() => (window as any).exportSite()[0].html);
    const body = html.slice(html.indexOf('<body'));
    const head = html.slice(0, html.indexOf('<body'));

    /*
     * The editor draws it `display: none` and the export **removes** it, which is the one place a
     * visitor is told less than the reader and is told it on purpose: `display: none` still ships
     * the words — to a crawler, to a reader with styles off, to anybody who opens the source.
     */
    expect(body).not.toContain(`data-b="${sid}"`);
    // And no orphan rule naming it, which is the one remaining trace that the section exists.
    expect(head).not.toContain(`data-b="${sid}"`);
  });

  /**
   * **Locking**, which is the cheaper half of the same pair.
   *
   * Nothing about the drawing changes — only what the overlay hands back when a reader presses. It
   * is what makes a full-width background picture editable at all, because the only way past one
   * today is to find something on top of it and walk up.
   */
  test('a locked block is not what a press finds', async ({ page }) => {
    await ready(page);
    await layers(page);

    const row = page.locator('[data-layer]').first();
    const sid = await row.getAttribute('data-layer');
    await row.click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as any).editor.selection?.nodeIds?.[0])).toBe(sid);

    await row.hover();
    await row.locator('button').nth(1).click();
    await page.waitForTimeout(400);
    await expect(page.locator(`[data-layer="${sid}"]`)).toHaveAttribute('data-locked', 'true');

    /*
     * Left out of the chain entirely rather than "selectable but refused": a press on a locked band
     * finds what is behind it rather than stopping there, which is the point of locking one.
     */
    await page.evaluate(() => (window as any).editor.executeCommand('clearSelection'));
    await page.waitForTimeout(200);
    const band = page.locator(`[data-frame="desktop"] [data-bc-sid="${sid}"]`).first();
    await band.click({ force: true, modifiers: ['Meta'], position: { x: 8, y: 8 } });
    await page.waitForTimeout(400);

    expect(await page.evaluate(() => (window as any).editor.selection?.nodeIds?.[0] ?? null)).not.toBe(sid);
  });

  /**
   * **Dragging a row**, which is the only way to reach some blocks at all.
   *
   * An empty stack and a block behind another block cannot be grabbed on the canvas — there is
   * nothing to aim at — and the list is where they have a row. `office-ui`'s `useStackOrder` is not
   * the tool: it assumes what the deck's list is, a flat row of shapes in one container all the same
   * height, so a drop is `(pointerY - top) / rowHeight`. A page's list is a **tree**, and index
   * arithmetic cannot say which parent.
   *
   * The thirds are what it uses instead — top is *before*, bottom is *after*, middle is *inside*,
   * and the middle is offered only by a row that can hold something. Reparenting by indent is the
   * other convention and it is the one that needs a tutorial; a line between two rows is a place and
   * a filled row is a container, which a reader can see.
   */
  const dragRow = async (page: Page, from: number, to: number, where: 'before' | 'after' | 'into') => {
    const rows = page.locator('[data-layer]');
    const a = (await rows.nth(from).boundingBox())!;
    const b = (await rows.nth(to).boundingBox())!;
    const y = where === 'into' ? b.y + b.height / 2 : where === 'before' ? b.y + 2 : b.y + b.height - 2;
    await page.mouse.move(a.x + 60, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 60, y, { steps: 10 });
    await page.waitForTimeout(200);
  };

  test('moves a block to a new place in its list', async ({ page }) => {
    await ready(page);
    await layers(page);

    const order = async () =>
      await page.locator('[data-layer]').evaluateAll((all) =>
        all.map((one) => one.getAttribute('data-layer'))
      );
    const before = await order();

    await dragRow(page, 1, 4, 'after');
    await expect(page.locator('[data-drop="after"]')).toHaveCount(1);
    await expect(page.locator('[data-dragging="true"]')).toHaveCount(1);
    await page.mouse.up();
    await page.waitForTimeout(700);

    const after = await order();
    expect(after).not.toEqual(before);
    // The same blocks, in a different order — a move rather than a copy or a loss.
    expect([...after].sort()).toEqual([...before].sort());
    expect(after.indexOf(before[1])).toBeGreaterThan(1);
  });

  test('puts a block inside a container when the drop is on its middle', async ({ page }) => {
    await ready(page);
    await layers(page);

    const rows = page.locator('[data-layer]');
    const moving = await rows.nth(1).getAttribute('data-layer');
    const target = await rows.nth(4).getAttribute('data-layer');

    await dragRow(page, 1, 4, 'into');
    /*
     * A different mark for a different meaning: a line between two rows is a place in a list and a
     * filled row is a container to go inside. One highlight for both would make "after the card row"
     * and "into the card row" the same picture.
     */
    await expect(page.locator('[data-drop="into"]')).toHaveCount(1);
    await page.mouse.up();
    await page.waitForTimeout(700);

    expect(
      await page.evaluate((sid) => (window as any).editor.dataStore.getNode(sid)?.parentId, moving)
    ).toBe(target);
  });

  test('will not drop a container into itself', async ({ page }) => {
    await ready(page);
    await layers(page);

    const rows = page.locator('[data-layer]');
    const sid = await rows.nth(1).getAttribute('data-layer');
    const parent = await page.evaluate(
      (one) => (window as any).editor.dataStore.getNode(one)?.parentId,
      sid
    );

    // Onto itself: no mark, and nothing to commit — the row a reader is holding is not a place.
    await dragRow(page, 1, 1, 'into');
    await expect(page.locator('[data-drop]')).toHaveCount(0);
    await page.mouse.up();
    await page.waitForTimeout(500);

    expect(
      await page.evaluate((one) => (window as any).editor.dataStore.getNode(one)?.parentId, sid)
    ).toBe(parent);
  });

  test('a press that does not move is still a selection', async ({ page }) => {
    await ready(page);
    await layers(page);

    /*
     * The whole row is the grip, which is what a list of names wants — a separate handle would be a
     * sixth thing in a 27-pixel row. So the two gestures share a starting point, and a press that
     * goes nowhere has to stay a click.
     */
    const row = page.locator('[data-layer]').nth(2);
    const sid = await row.getAttribute('data-layer');
    await row.click();
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => (window as any).editor.selection?.nodeIds?.[0])).toBe(sid);
  });

  test('renames a row where the name is read', async ({ page }) => {
    await ready(page);
    await layers(page);

    /*
     * Every other list in this rail renames in place, and this one sent a reader to the panel for it
     * — a different pane, a different tab and a scroll, for the one edit they are most likely to be
     * making *while looking at a list of names*. Double-click, because that is what a list of names
     * has meant since before any of this existed.
     */
    const row = page.locator('[data-layer]').nth(1);
    const sid = await row.getAttribute('data-layer');
    await row.dblclick();
    await page.waitForTimeout(300);

    const field = page.locator('.st-layers-list input').first();
    await expect(field).toHaveCount(1);
    await field.fill('새 이름');
    await field.press('Enter');
    await page.waitForTimeout(500);

    await expect(page.locator(`[data-layer="${sid}"] .st-layer-name`)).toHaveText('새 이름');
    expect(
      await page.evaluate((one) => (window as any).editor.dataStore.getNode(one)?.attributes?.name, sid)
    ).toBe('새 이름');
  });

  test('reveals where a block lives when it is selected on the canvas', async ({ page }) => {
    await ready(page);
    await layers(page);

    /*
     * The half that is easy to leave out, and the one that makes a closed list still usable: a reader
     * clicks a card and the list opens the path to it, rather than showing a closed band and leaving
     * them to guess which one.
     */
    const deep = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      let found = '';
      let best = -1;
      const walk = (sid: string, depth: number) => {
        const node = store.getNode(sid);
        if (!node) return;
        if (node.stype === 'heading' && depth > best) {
          best = depth;
          found = sid;
        }
        for (const child of node.content ?? []) if (typeof child === 'string') walk(child, depth + 1);
      };
      walk(editor.getRootId(), 0);
      return found;
    });
    expect(await page.locator(`[data-layer="${deep}"]`).count()).toBe(0);

    await page.evaluate((one) => (window as any).editor.executeCommand('setNode', { nodeIds: [one] }), deep);
    await page.waitForTimeout(500);

    await expect(page.locator(`[data-layer="${deep}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-layer="${deep}"]`)).toHaveAttribute('data-selected', 'true');
  });
});

/**
 * The component library, which could be **added to and never cleaned out**.
 *
 * Measured against the other two lists this rail draws: a page can be made, renamed, duplicated and
 * removed; a dataset can be made, renamed and removed; a component could only be made. One shape,
 * three answers — the kind of gap nothing reports, because every part of it works.
 *
 * `component-library.test.ts` holds what the commands do. What only a browser shows is the row: a
 * field that replaces it rather than a dialog, and a delete that says why it is refused.
 */
test.describe('the component library', () => {
  const components = async (page: Page) => {
    await page.locator('[data-panel="components"]').click();
    await page.waitForTimeout(300);
  };

  test('renames a definition in place, without a dialog for it', async ({ page }) => {
    await ready(page);
    await components(page);

    const row = page.locator('[data-component-row="cta"]');
    await expect(row.locator('.st-rail-name')).toHaveText('버튼');

    await row.getByLabel('버튼 이름 바꾸기').click();
    const field = row.getByLabel('버튼 새 이름');
    await field.fill('주 버튼');
    await field.press('Enter');
    await page.waitForTimeout(500);

    /*
     * Renaming is the smallest edit there is and a modal for it is three gestures where one would do.
     * The field commits on Enter and on blur and puts the old value back on Escape, which is the rule
     * every field in this suite already follows.
     */
    await expect(row.locator('.st-rail-name')).toHaveText('주 버튼');
  });

  test('says why a definition cannot be removed, rather than greying in silence', async ({ page }) => {
    await ready(page);
    await components(page);

    const row = page.locator('[data-component-row="cta"]');
    const remove = row.getByLabel('버튼 삭제');
    await expect(remove).toBeDisabled();
    /*
     * A placement whose definition has gone draws **nothing**, and nothing is what a reader would be
     * looking at while wondering what they broke. So it is refused while anything places it — and a
     * disabled control that says nothing is the commonest small cruelty in a tool.
     */
    await expect(remove).toHaveAttribute('title', /곳에서 쓰는 중/);
  });

  test('copies a dataset, columns rows and all', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="data"]').click();
    await page.waitForTimeout(300);

    const before = await page.locator('[data-dataset]').count();
    await page.locator('[data-dataset-duplicate]').first().click();
    await page.waitForTimeout(600);

    // The fourth act, and the one no list offered for a dataset.
    expect(await page.locator('[data-dataset]').count()).toBe(before + 1);
  });

  test('removes one nothing places any more', async ({ page }) => {
    await ready(page);

    // Take the last placement of a definition away, which is the situation this exists for.
    await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const found: string[] = [];
      const walk = (sid: string) => {
        const node = store.getNode(sid);
        if (!node) return;
        if (node.stype === 'instance' && node.attributes?.componentId === 'ghost') found.push(sid);
        for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
      };
      walk(editor.getRootId());
      return editor.executeCommand('removeBlocks', { nodeIds: found });
    });
    await page.waitForTimeout(700);
    await components(page);

    const row = page.locator('[data-component-row="ghost"]');
    await expect(row).toHaveCount(1);
    await row.getByLabel(/삭제$/).click();
    await page.waitForTimeout(600);

    await expect(page.locator('[data-component-row="ghost"]')).toHaveCount(0);
    // And the rest of the library is untouched.
    await expect(page.locator('[data-component-row="cta"]')).toHaveCount(1);
  });
});

test.describe('the rail', () => {
  test('offers what a page is made of, and every one of them on a page nobody has touched', async ({ page }) => {
    await ready(page);
    await expect(page.locator('[data-rail] button')).toHaveText(['추가', '구성', '페이지', '컴포넌트', '데이터']);

    /*
     * With **nothing selected**, which is the state a reader opening a site is actually in. Every row
     * was greyed out before a new block could land at the end of the page: a panel of things a reader
     * may not have.
     */
    const rows = page.locator('[data-insert]');
    await expect(rows).toHaveText([
      '섹션',
      '가로 스택',
      '그리드',
      '제목',
      '본문',
      '이미지',
      '목록',
      '번호 목록',
      '인용',
      // Back on the rail: a code block can be typed into now that Enter inside one is a newline.
      '코드',
      '구분선',
      '버튼'
    ]);
    await expect(page.locator('[data-insert]:not([disabled])')).toHaveCount(12);
  });

  test('adds a block, puts it where a reader can predict, and selects it', async ({ page }) => {
    await ready(page);
    const board = page.locator('[data-frame="desktop"] .st-page');
    const before = await board.locator('> *').count();

    await page.locator('[data-insert="insertHeading"]').click();
    await page.waitForTimeout(500);
    await expect(board.locator('> *')).toHaveCount(before + 1);

    // Selected, because a reader who has just added a block is about to say something about it.
    await expect(page.locator('.office-properties')).toContainText('제목');
    await expect(page.locator('.st-mark-selected')).toHaveCount(3);
  });

  test('puts it inside the stack that is selected', async ({ page }) => {
    await ready(page);
    const hero = page.locator('[data-frame="desktop"] .st-stack[data-name="히어로"]');
    await press(page, hero);
    await page.waitForTimeout(300);

    const before = await hero.locator('> *').count();
    await page.locator('[data-panel="add"]').click();
    await page.locator('[data-insert="insertBodyText"]').click();
    await page.waitForTimeout(500);

    // In the section, not beside it — which is what a reader means and what a stack is for.
    await expect(hero.locator('> *')).toHaveCount(before + 1);
  });

  test('lists the definitions and how many places use each, and places one', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="components"]').click();

    // The count is what makes a component list worth having: a definition used in five places is a
    // decision, and one used nowhere is a thing to delete.
    await expect(page.locator('[data-component="site-header"]')).toContainText('5곳');
    // Six: twice on the home page, once in the header's own definition, and once on each of three others.
    await expect(page.locator('[data-component="cta"]')).toContainText('6곳');

    const placements = page.locator('[data-frame="desktop"] .st-placement');
    const before = await placements.count();
    await page.locator('[data-component="cta"]').click();
    await page.waitForTimeout(600);
    await expect(placements).toHaveCount(before + 1);
    // And the count follows, because it is read from the document rather than remembered.
    await expect(page.locator('[data-component="cta"]')).toContainText('7곳');
  });

  test('makes a data list from a dataset and a design, and refuses half of one', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="data"]').click();

    await expect(page.locator('[data-dataset="상품"]')).toContainText('4행');
    await expect(page.locator('[data-dataset="글"]')).toContainText('3행');

    // A list needs both halves: a dataset *and* something to draw for each row.
    await page.locator('[data-design="product-card"]').click();
    const lists = page.locator('[data-frame="desktop"] .st-collection');
    const before = await lists.count();
    await page.locator('[data-dataset="상품"]').click();
    await page.waitForTimeout(700);

    await expect(lists).toHaveCount(before + 1);
    // Four rows this time: the new list says nothing about filtering, so it draws all of them.
    await expect(lists.last().locator('> .st-placement')).toHaveCount(4);
  });

  test('shows the pages, with the address that makes each one a page of a site', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="pages"]').click();
    await expect(page.locator('[data-pages] [data-page]')).toHaveCount(5);

    await page.locator('[data-page][title="/블로그"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-frame="desktop"] .st-page')).toHaveAttribute('data-path', '/블로그');
    // And the title bar says where the reader is, which is what it kept when the list moved here.
    await expect(page.locator('[data-where]')).toContainText('블로그');
  });
});

/**
 * Editing a definition.
 *
 * A board takes a `rootId` and draws whatever node it names — the same mechanism that draws one page
 * at three widths — so editing a definition is pointing the boards at its part instead of at a page.
 * Nothing else in the window changes, which is the claim these hold.
 */
test.describe('the data', () => {
  const rail = (page: Page) => page.locator('.st-rail');
  const grid = (page: Page) => page.locator('[role="dialog"]');

  const openData = async (page: Page) => {
    await ready(page);
    await rail(page).getByRole('button', { name: '데이터' }).first().click();
  };

  test('opens over the page, because a table needs width the rail has not got', async ({ page }) => {
    await openData(page);
    // One list, two acts: the name makes a list from the dataset, the pencil opens its rows.
    await expect(page.locator('[data-dataset]')).toHaveCount(2);
    await page.locator('[data-dataset-edit="상품"]').click();

    await expect(grid(page)).toBeVisible();
    await expect(grid(page).locator('[data-column]')).toHaveCount(5);
    await expect(grid(page).locator('tbody tr')).toHaveCount(4);
  });

  test('writes a cell, and the list on the page says it', async ({ page }) => {
    /*
     * The whole point of the feature, in one assertion: the collection draws one placement per row
     * and binds `field:이름` into it, so a cell typed here is a card redrawn out there. It went the
     * other way round for months — the view was finished and the data was TypeScript.
     */
    await openData(page);
    await page.locator('[data-dataset-edit="상품"]').click();
    await grid(page).locator('[data-cell="0:가격"]').fill('월 1원');
    await grid(page).locator('[data-cell="0:가격"]').press('Enter');

    await expect(page.locator('[data-frame="desktop"] .st-collection')).toContainText('월 1원');
  });

  test('renames a column, and the rows come with it', async ({ page }) => {
    /*
     * The one gesture in this grid whose consequence is not visible where it is made: `fields` and
     * every key in `records` have to move together, or the dataset looks right in the panel and
     * draws nothing on the page. The model holds that (`data-commands.test.ts`); this holds that
     * the column heading is wired to it.
     */
    await openData(page);
    await page.locator('[data-dataset-edit="상품"]').click();
    const cell = grid(page).locator('[data-cell="0:가격"]');
    const was = await cell.inputValue();

    await grid(page).locator('[data-column="가격"]').fill('값');
    await grid(page).locator('[data-column="가격"]').press('Enter');

    await expect(grid(page).locator('[data-column="값"]')).toHaveCount(1);
    await expect(grid(page).locator('[data-cell="0:값"]')).toHaveValue(was);
  });

  test('makes a dataset and lands in its grid, with something to type into', async ({ page }) => {
    await openData(page);
    await page.locator('[data-dataset-add]').click();

    // Straight into the grid: making one and then having to find it is two gestures for one act.
    await expect(grid(page)).toBeVisible();
    // One column and one row, not an empty pair — an empty dataset is a panel with nowhere to type.
    await expect(grid(page).locator('[data-column]')).toHaveCount(1);
    await expect(grid(page).locator('tbody tr')).toHaveCount(1);

    await grid(page).getByRole('button', { name: '행 추가' }).click();
    await expect(grid(page).locator('tbody tr')).toHaveCount(2);
  });

  test('refuses to delete a dataset a list is drawing, and says why', async ({ page }) => {
    await openData(page);
    await page.locator('[data-dataset-edit="상품"]').click();
    const remove = grid(page).getByRole('button', { name: '데이터 삭제' });
    await expect(remove).toBeDisabled();
    // Disabled with a reason. A control that refuses and does not say why is a bug report.
    await expect(remove).toHaveAttribute('title', '이 데이터를 쓰는 목록이 있습니다');
  });
});

test.describe('a definition', () => {
  test('opens from the rail, and says how many places it changes', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="components"]').click();
    await page.locator('[data-edit-component="site-header"]').click();
    await page.waitForTimeout(600);

    // The sentence that has to be said before anybody edits one.
    const where = page.locator('[data-where]');
    await expect(where).toHaveAttribute('data-editing-component', 'site-header');
    await expect(where).toContainText('머리말');
    await expect(where).toContainText('5곳에서 사용 중');

    /*
     * Every board draws the definition, at its own width, and says whose it is.
     *
     * Eight stacks, not one: the bar, the mark beside the wordmark, the row of links, the button the
     * row ends with — a navigation bar once its ends are pushed apart rather than left to a spacer —
     * and **each of the four links**, which became boxes rather than words when they were given a
     * hover to hold. That turned out to be the same fix as giving a thumb something to hit: a
     * 14-pixel-tall target where a guideline asks for 44, and nowhere for paint to live, were one
     * fault about structure rather than two about styling.
     */
    await expect(page.locator('.st-frame-label').first()).toContainText('머리말');
    await expect(page.locator('[data-frame="desktop"] .st-stack')).toHaveCount(8);

    // And the way back is a control rather than a gesture: a reader who does not know they are
    // inside a definition is a reader about to change five pages by accident.
    await page.locator('.st-back').click();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-frame="desktop"] .st-page')).toHaveAttribute('data-path', '/');
  });

  test('is the same editor inside it: the rail, the panel and the selection all work', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="components"]').click();
    await page.locator('[data-edit-component="cta"]').click();
    await expect(page.locator('.st-frame-label').first()).toContainText('버튼');

    /*
     * The definition's parts rather than a page's blocks — and **the part itself is in the list**,
     * which it was not until the pointer was told to walk from the `component` rather than from the
     * part. A board's root is never selectable, so the definition's own padding, direction and
     * colour were unreachable: the one stack a reader most wants to edit inside a definition.
     */
    await page.locator('[data-panel="layers"]').click();
    await expect(page.locator('.st-layer')).toHaveText(['가로 스택', '본문']);

    // And a new block lands inside the definition, because the boards' root is the definition.
    await page.locator('[data-panel="add"]').click();
    await page.locator('[data-insert="insertBodyText"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-panel="layers"]').click();
    await expect(page.locator('.st-layer')).toHaveCount(3);
  });

  test('changes every place that uses it, at once', async ({ page }) => {
    await ready(page);
    const buttons = page.locator('[data-frame="desktop"] .st-placement');
    const before = await buttons.count();

    await page.locator('[data-panel="components"]').click();
    await page.locator('[data-edit-component="cta"]').click();
    /*
     * Waited for **the board to say whose it is**, rather than for a number of milliseconds. The
     * definition opens by pointing three boards at another node and redrawing them, and a sample
     * with ten sections on a page takes longer to redraw than one with three — so a fixed 600ms
     * passed while the boards still held the page, and the click below landed on the header.
     */
    await expect(page.locator('.st-frame-label').first()).toContainText('버튼');

    // Selecting the definition's own stack, and reading its panel: the same panel, inside a
    // definition, because the thing being edited is a stack either way.
    await press(page, page.locator('[data-frame="desktop"] .st-stack').first());
    await page.waitForTimeout(300);
    await expect(page.locator('.office-properties')).toContainText('스택');

    await page.locator('.st-back').click();
    await page.waitForTimeout(600);
    // The page is drawing again, and the placements are still there — a definition edited is a
    // definition every placement follows, because a placement draws it rather than a copy of it.
    await expect(buttons).toHaveCount(before);
  });

  test('is made out of what a reader has already built', async ({ page }) => {
    await ready(page);
    await press(page, page.locator('[data-frame="desktop"] .st-stack[data-name="카드 줄"]'));
    await page.waitForTimeout(300);

    await page.locator('[data-panel="components"]').click();
    const before = await page.locator('[data-component-row]').count();

    await page.locator('[data-control="createComponentFrom"]').click();
    await page.waitForTimeout(700);

    // One more definition, used in one place — and the page looks the same, because a placement of
    // it took the block's seat.
    await expect(page.locator('[data-component-row]')).toHaveCount(before + 1);
    await expect(page.locator('[data-frame="desktop"] .st-page > .st-placement')).toHaveCount(3);
  });
});

/**
 * Links between the pages of one site.
 *
 * The three claims a unit test cannot make on its own: the sample's navigation is **elements** a
 * browser will follow, a link follows its page when the address changes underneath it, and a reader
 * can make one out of words they have chosen.
 */
/**
 * The four things a reader can do to a page.
 *
 * They live in the rail's list because a page is **not a selection** — nothing on the canvas is one
 * — and the browser is where that claim can be checked at all: the list, the acts on a row, and the
 * one dialog in this product that asks before it happens.
 */
test.describe('the pages of a site', () => {
  const rows = (page: Page) => page.locator('[data-pages] [data-page]');

  const pages = async (page: Page) => {
    await ready(page);
    await page.locator('[data-panel="pages"]').click();
  };

  test('makes a page that arrives wearing the site’s navigation', async ({ page }) => {
    await pages(page);
    await rows(page).nth(1).click();
    await page.waitForTimeout(400);

    await page.locator('[data-page-add]').click();
    await page.waitForTimeout(700);

    // After the page it follows, not at the end — a reader adding a page is adding it *here*.
    await expect(rows(page)).toHaveCount(6);
    await expect(rows(page).nth(2)).toContainText('페이지 6');

    await rows(page).nth(2).click();
    await page.waitForTimeout(600);
    await expect(page.locator('[data-frame="desktop"] .st-page')).toHaveAttribute('data-path', '/page-6');
    /*
      The header and footer of the page it followed, as placements — so editing the header still
      changes this one too. Three drawn, because the header places the button.
     */
    await expect(page.locator('[data-frame="desktop"] .st-placement')).toHaveCount(3);
    await expect(page.locator('[data-frame="desktop"] .st-page h1')).toHaveText('페이지 6');
  });

  test('copies a page, with an address of its own', async ({ page }) => {
    await pages(page);
    await page.locator('[data-page-duplicate]').nth(1).click();
    await page.waitForTimeout(700);

    await expect(rows(page)).toHaveCount(6);
    await expect(rows(page).nth(2)).toContainText('제품 사본');
    await expect(rows(page).nth(2)).toContainText('/제품-2');
  });

  test('moves a page up the list', async ({ page }) => {
    await pages(page);
    await expect(rows(page).nth(0)).toContainText('홈');

    await page.locator('[data-page-up]').nth(1).click();
    await page.waitForTimeout(700);
    await expect(rows(page).nth(0)).toContainText('제품');

    // The first page has nowhere to go, and the button says so rather than failing when pressed.
    await expect(page.locator('[data-page-up]').nth(0)).toBeDisabled();
  });

  test('asks before removing one, and says how many links it breaks', async ({ page }) => {
    await pages(page);
    await page.locator('[data-page-remove]').nth(1).click();

    /*
     * The number is the whole reason this asks, and it is **two** — which is worth pausing on,
     * because five pages draw those links. The bar and the footer both name 제품, and both live in a
     * definition every page places: two links in the document, drawn ten times. Counting marks is
     * the number that can be checked; counting the places they are drawn would be counting
     * placements, and this dialog would then disagree with `linkFaults`, which reports the marks.
     *
     * That a single link can be the whole site's navigation is a fact worth telling a reader too —
     * see `BACKLOG.md`.
     */
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('제품 삭제');
    // Two: the bar and the footer both name it, and both live in a definition every page places.
    await expect(dialog).toContainText('링크 2개가 끊어집니다');

    await dialog.getByRole('button', { name: '취소' }).click();
    await page.waitForTimeout(300);
    await expect(rows(page)).toHaveCount(5);

    await page.locator('[data-page-remove]').nth(1).click();
    await page.locator('[data-page-remove-confirm]').click();
    await page.waitForTimeout(700);

    await expect(rows(page)).toHaveCount(4);
    await expect(page.locator('[data-pages]')).not.toContainText('/제품');

    /*
     * And the link that pointed at it goes nowhere now — an `<a>` with **no href**, which is the one
     * shape a browser draws as *not a link*: no underline, no pointer, no announcement. That is the
     * honest drawing of a link with nowhere to go, and the reason the dialog counted it beforehand:
     * afterwards it looks like ordinary words, which is exactly what it now is.
     */
    const links = page.locator('[data-frame="desktop"] .st-page a.mark-link');
    await expect(links).toHaveCount(7);
    await expect(links.first()).not.toHaveAttribute('href', /./);
    await expect(links.nth(1)).toHaveAttribute('href', '/가격');
    // And the footer's link to the same page is gone too, because it named the same page.
    await expect(links.nth(4)).not.toHaveAttribute('href', /./);
  });
});

/**
 * The studio: how far away the reader is standing, and what stays still while that changes.
 *
 * Every claim here was a **report** first — *the zoom does not work, the selection is in the wrong
 * place, the text is too small to read* — and every one of them turned out to be measurable in a
 * line or two. They are kept because the causes were nowhere near the symptoms:
 *
 * - the pane was **3280px tall inside a 1000px window**, because the three elements above the shell
 *   had no height, so the *window* scrolled and the pane never did;
 * - a `transform` does not change layout, so the scroll area stayed the size the plane was at 100%
 *   however far in a reader zoomed;
 * - and a heading on the page was **12px**, because Tailwind's preflight resets headings to
 *   `inherit` and the app's body is the chrome's 12px — so the page wore the tool's type.
 */
test.describe('the studio', () => {
  test('scrolls the pane rather than the window', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await ready(page);

    const fits = await page.evaluate(() => {
      const pane = document.querySelector('.st-canvas') as HTMLElement;
      return { pane: pane.clientHeight, window: window.innerHeight, body: document.body.scrollHeight };
    });
    // The pane is a window onto the plane, not a column the page grows.
    expect(fits.pane).toBeLessThanOrEqual(fits.window);
    expect(fits.body).toBeLessThanOrEqual(fits.window);
  });

  test('keeps the point under the pointer while zooming, and can reach what it draws', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await ready(page);

    const at = { x: 700, y: 500 };
    /** Which node is under the pointer, and where in it — the fraction is what a zoom must preserve. */
    const anchor = () =>
      page.evaluate((q) => {
        const deep = (document.elementsFromPoint(q.x, q.y) as HTMLElement[]).find((el) =>
          el.hasAttribute('data-bc-sid')
        );
        if (!deep) return null;
        const box = deep.getBoundingClientRect();
        return {
          sid: deep.getAttribute('data-bc-sid'),
          fx: Math.round(((q.x - box.left) / box.width) * 100) / 100,
          fy: Math.round(((q.y - box.top) / box.height) * 100) / 100
        };
      }, at);

    const room = () =>
      page.evaluate(() => {
        const pane = document.querySelector('.st-canvas') as HTMLElement;
        const boards = document.querySelector('.st-boards') as HTMLElement;
        return { scroll: pane.scrollWidth, drawn: Math.round(boards.getBoundingClientRect().width) };
      });

    const before = await anchor();
    const roomBefore = await room();
    expect(before).not.toBeNull();

    await page.mouse.move(at.x, at.y);
    await page.keyboard.down('Meta');
    for (let notch = 0; notch < 6; notch += 1) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(70);
    }
    await page.keyboard.up('Meta');
    await page.waitForTimeout(300);

    // The same node, at the same point in it: an infinite canvas holds the pointer still.
    const after = await anchor();
    expect(after?.sid).toBe(before?.sid);
    expect(Math.abs((after?.fx ?? 0) - (before?.fx ?? 0))).toBeLessThan(0.03);
    expect(Math.abs((after?.fy ?? 0) - (before?.fy ?? 0))).toBeLessThan(0.03);

    /*
     * And the scroll area grew with the drawing. A transform does not change layout, so this was the
     * same number at every zoom: the boards drew wider than anything a reader could scroll to.
     */
    const roomAfter = await room();
    expect(roomAfter.drawn).toBeGreaterThan(roomBefore.drawn * 1.4);
    expect(roomAfter.scroll).toBeGreaterThan(roomBefore.scroll * 1.4);
  });

  test('draws the selection exactly on the block, however far in the reader is', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await ready(page);

    await page.mouse.move(700, 500);
    await page.keyboard.down('Meta');
    for (let notch = 0; notch < 6; notch += 1) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(70);
    }
    await page.keyboard.up('Meta');
    await page.waitForTimeout(300);

    /*
     * Zoomed in, the row is wider than the window: a canvas is panned to what you want to press, and
     * what this wants is the card rather than the row it is in.
     */
    const card = cardRow(page, 'desktop').locator('.st-stack').first();
    await bring(page, card);
    await pressDeepAt(page, card);
    await page.waitForTimeout(400);

    const gap = await page.evaluate(() => {
      const mark = document.querySelector('[data-frame="desktop"] .st-mark-selected') as HTMLElement;
      const sid = (window as never as { editor: { selection: { nodeIds: string[] } } }).editor.selection.nodeIds[0];
      const el = document.querySelector(
        `[data-frame="desktop"] [data-bc-sid="${CSS.escape(sid)}"]`
      ) as HTMLElement;
      const m = mark.getBoundingClientRect();
      const e = el.getBoundingClientRect();
      return Math.max(Math.abs(m.left - e.left), Math.abs(m.top - e.top), Math.abs(m.width - e.width));
    });
    // One pixel of rounding, and no more: the overlay lives inside the scaled plane and has to
    // divide what the screen tells it by the zoom.
    expect(gap).toBeLessThanOrEqual(1);
  });

  test('gives the page its own type, not the tool’s', async ({ page }) => {
    await ready(page);

    const type = await page.evaluate(() => {
      const h1 = document.querySelector('[data-frame="desktop"] h1') as HTMLElement;
      const p = document.querySelector('[data-frame="desktop"] p') as HTMLElement;
      const narrow = document.querySelector('[data-frame="mobile"] h1') as HTMLElement;
      return {
        h1: parseFloat(getComputedStyle(h1).fontSize),
        p: parseFloat(getComputedStyle(p).fontSize),
        narrow: parseFloat(getComputedStyle(narrow).fontSize)
      };
    });

    /*
     * A heading is a heading. It was 12px — the chrome's size, inherited through a preflight that
     * resets `h1` to `inherit` — so every board was a page set in panel-label type.
     */
    expect(type.h1).toBeGreaterThanOrEqual(40);
    expect(type.p).toBeGreaterThanOrEqual(15);

    /*
     * And the 390 board gets the *narrow* size, which only a container query can do: a media query
     * asks the window, and the window is 1600 wide while that board is 390.
     */
    expect(type.narrow).toBeLessThan(type.h1);
  });

  test('puts the caret in the board the reader clicked', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await ready(page);

    const title = cardRow(page, 'desktop').locator('h3').first();
    await bring(page, cardRow(page, 'desktop'));
    await pressDeepAt(page, cardRow(page, 'desktop').locator('.st-stack').first());
    await page.waitForTimeout(250);
    await pressTwice(page, title);
    await page.waitForTimeout(400);

    /*
     * **One document, three views, and one `document.getSelection()`.**
     *
     * Every view heard `editor:selection.model` and wrote the browser's single selection in turn, so
     * the **last one mounted** won it: a reader who double-clicked the desktop board got a caret on
     * the mobile one, and typed into a board they were not looking at. Everything downstream
     * followed — the board they were in had no caret, its renders re-anchored a selection that was
     * not in it, and an IME commit came back having replaced the rest of the paragraph.
     *
     * Focus is the arbiter now, because focus is what a caret follows.
     */
    const board = await page.evaluate(() => {
      const node = document.getSelection()?.anchorNode;
      const el = (node?.nodeType === 3 ? node.parentElement : (node as HTMLElement)) ?? null;
      return el?.closest('[data-frame]')?.getAttribute('data-frame') ?? 'none';
    });
    expect(board).toBe('desktop');

    // And what is typed still reaches all three, because there is still only one document.
    await page.keyboard.type('가나');
    await page.waitForTimeout(400);
    for (const frame of ['desktop', 'tablet', 'mobile']) {
      await expect(cardRow(page, frame).locator('h3').first()).toContainText('가나');
    }
  });

  test('says which block is being typed in', async ({ page }) => {
    await ready(page);

    const hero = page.locator('[data-frame="mobile"] h1');
    await pressDeep(page, hero);
    await page.waitForTimeout(200);
    await pressTwice(page, hero);
    await page.waitForTimeout(300);

    await expect(page.locator('[data-frame="mobile"] .st-overlay')).toHaveAttribute('data-mode', 'text');
    /*
     * And the board says so. Entering the words clears the node selection — rightly — and the marks
     * draw from that selection, so a reader in text mode was shown **nothing at all**: no outline,
     * no name, no way to tell an editable page from a preview.
     */
    const editing = page.locator('[data-frame="mobile"] .st-mark-editing');
    await expect(editing).toHaveCount(1);
    await expect(editing).toContainText('텍스트 편집');
  });
});

test.describe('a link to another page', () => {
  test('draws the navigation as real links, at the page’s address', async ({ page }) => {
    await ready(page);

    /*
     * Measured before this existed and worth keeping as the shape of the test: the sample drew five
     * pages with addresses, a row reading 제품 · 가격 · 소개 · 블로그, and **not one `<a>`**. Two
     * separate faults produced that — a `link` mark that drew nothing anywhere in the suite, and
     * nothing that could point at a page — so the assertion is deliberately about the element rather
     * than about the mark: an `<a>` is what a link *is* to a reader and to a browser.
     */
    const links = page.locator('[data-frame="desktop"] .st-page a.mark-link');
    // Four in the bar and three in the footer, which are the two places a site puts them.
    await expect(links).toHaveCount(7);
    await expect(links).toHaveText(['제품', '가격', '소개', '블로그', '제품', '가격', '소개']);

    // The document stores `page:products`; what reaches the browser is the address it resolves to.
    await expect(links.first()).toHaveAttribute('href', '/제품');
    await expect(links.nth(3)).toHaveAttribute('href', '/블로그');
  });

  test('follows a page whose address a reader changes', async ({ page }) => {
    await ready(page);

    // Onto 제품, whose address the header on every page — including its own — points at.
    await page.locator('[data-panel="pages"]').click();
    await page.locator('[data-page]').nth(1).click();
    await page.waitForTimeout(600);

    /*
     * Nothing is selected, which is when the panel describes **the page** — the only place an
     * address can be edited at all, because a page is the board rather than a block and is never in
     * a selection.
     */
    const address = page.getByLabel('페이지 주소', { exact: true });
    await expect(address).toHaveValue('/제품');
    await address.fill('/products');
    await address.press('Enter');
    await page.waitForTimeout(600);

    /*
     * Nothing rewrote a link, and every link into that page now goes somewhere else. This is the
     * claim the whole reference pattern exists for, and it is the one a unit test cannot make on its
     * own: the panel writes, the store notifies, and the mark is resolved again where it is drawn.
     */
    await expect(page.locator('[data-frame="desktop"] .st-page a.mark-link').first()).toHaveAttribute(
      'href',
      '/products'
    );
  });

  test('links the words a reader has chosen to a page they pick', async ({ page }) => {
    await ready(page);

    const picker = page.locator('.st-link-page');
    // Nothing selected: a mark covers a range, and linking a caret writes a zero-length link — the
    // shape of failure that draws nothing and reports success.
    await expect(picker).toBeDisabled();

    // Into the words: ⌘ reaches the heading, and one double-click asks for the caret.
    const hero = page.locator('[data-frame="mobile"] h1');
    await pressDeep(page, hero);
    await page.waitForTimeout(200);
    await pressTwice(page, hero);
    await page.waitForTimeout(300);
    await expect(page.locator('[data-frame="mobile"] .st-overlay')).toHaveAttribute('data-mode', 'text');

    /*
     * `Shift+ArrowRight` rather than `Home` then `Shift+End`: on macOS those two do not move a caret
     * in text at all, so the first version of this test selected nothing and read as though the
     * picker were broken.
     */
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(300);
    await expect(picker).toBeEnabled();

    await picker.click();
    await page.locator('[data-style="pricing"]').click();
    await page.waitForTimeout(600);

    // A real `<a>`, at the page's address, in **every** board — one document, drawn three times.
    const made = page.locator('[data-frame="desktop"] .st-page h1 a.mark-link');
    await expect(made).toHaveAttribute('href', '/가격');
    await expect(page.locator('[data-frame="tablet"] .st-page h1 a.mark-link')).toHaveAttribute('href', '/가격');

    // And taking it away is its own gesture, offered only when there is one to take.
    const remove = page.getByRole('button', { name: '선택한 글자의 링크를 없앱니다' });
    await expect(remove).toBeEnabled();
    await remove.click();
    await page.waitForTimeout(500);
    await expect(made).toHaveCount(0);
  });
});

/**
 * What the page promises a visitor, which is the first value on it that is not a value.
 *
 * Everything else a block says is resolved before it is drawn — a width is known, a token is known,
 * a dataset is known. A pointer is known to nobody at render time, because the hovering happens
 * after the drawing has finished. So a state leaves the model as a **rule**, and the two things
 * worth holding are that the boards obey the rule (a designer who has to publish to see a hover is a
 * designer guessing) and that the published page carries the same one.
 */
test.describe('what a block promises under the pointer', () => {
  test('shows the state the panel has opened, because the pointer cannot get there', async ({ page }) => {
    await ready(page);

    const item = page
      .locator('[data-frame="desktop"] [data-name="내비게이션"] .st-stack[data-name="제품"]')
      .first();
    const fill = async () =>
      await item.evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);

    // At rest a navigation item is a box with nothing in it — the page's own ground shows through.
    expect(await fill()).toBe('rgba(0, 0, 0, 0)');

    /*
     * And hovering it changes nothing, which is not a bug and is the reason this feature is drawn
     * rather than hovered: the tool's own layer covers the board — that layer is what decides what a
     * click means here — so the page underneath is never the topmost thing under the pointer.
     */
    await item.hover({ force: true });
    await page.waitForTimeout(150);
    expect(await fill()).toBe('rgba(0, 0, 0, 0)');

    /*
     * So the panel opens the state and the block is drawn in it — shown here on a **card**, because
     * a navigation item is a part of a placed component and a click on one selects the placement.
     * That is the component model working: a reader edits a part by opening its definition, and the
     * boards then draw the definition, where the part is an ordinary selectable block.
     */
    const card = cardRow(page, 'desktop').locator('.st-stack').first();
    const border = async () =>
      await card.evaluate((el) => getComputedStyle(el as HTMLElement).borderColor);

    await bring(page, cardRow(page, 'desktop'));
    const resting = await border();
    await pressDeepAt(page, card);
    await page.waitForTimeout(300);
    await page.locator('.office-properties').getByRole('tab', { name: '모양' }).click();
    await page.locator('.st-state-row button[data-state="hover"]').click();
    await page.waitForTimeout(400);

    /*
     * `var:강조`, resolved — and it beats the inline style, which is why the board's copy of the rule
     * carries `!important` where the published page's does not. Without that every rule would be
     * written correctly and do nothing, which looks exactly like not having the feature.
     */
    expect(await border()).toBe('rgb(15, 122, 90)');
    expect(await border()).not.toBe(resting);

    // Closing it puts the page back, so a reader is never left looking at a state nobody is in.
    await page.locator('.st-state-row button', { hasText: '기본' }).click();
    await page.waitForTimeout(300);
    expect(await border()).toBe(resting);
  });

  test('gives the navigation a target a thumb can hit', async ({ page }) => {
    await ready(page);

    const item = page
      .locator('[data-frame="mobile"] [data-name="내비게이션"] .st-stack[data-name="제품"]')
      .first();
    const box = await item.boundingBox();
    const zoom = await page.evaluate(
      () => Number((document.querySelector('.st-canvas') as HTMLElement).dataset.zoom) || 1
    );
    // Measured back through the zoom: the plane is drawn at whatever the reader is standing at.
    expect((box?.height ?? 0) / zoom).toBeGreaterThan(28);
  });

  test('publishes the promise as a rule the browser already knows', async ({ page }) => {
    await ready(page);

    const html = await page.evaluate(
      () => (window as never as { exportSite: () => { path: string; html: string }[] }).exportSite()[0].html
    );

    expect(html).toContain(':hover');
    // The pressed-in green, through the token — a hover colour written three times is three colours.
    expect(html).toContain('#0B5C44');
    /*
     * And no `!important` in the page a visitor gets. Its styles were lifted into classes, so a
     * selector wins on its own; a page a reader cannot restyle with their own CSS is not theirs.
     */
    expect(html).not.toContain('!important');
  });

  test('offers the state in the panel, and only what a state may hold', async ({ page }) => {
    await ready(page);

    await pressDeepAt(page, cardRow(page, 'desktop').locator('.st-stack').first());
    await page.waitForTimeout(300);
    await page.locator('.office-properties').getByRole('tab', { name: '모양' }).click();
    await page.waitForTimeout(200);

    // At rest the panel offers the arrangement as well as the paint.
    await expect(page.locator('.st-state')).toBeVisible();
    const rows = () => page.locator('.office-properties label');
    const before = await rows().count();

    await page.locator('.st-state-row button[data-state="hover"]').click();
    await page.waitForTimeout(250);

    /*
     * In a state the arrangement rows are gone rather than disabled. A block that resized under the
     * pointer would move out from under it and flicker for as long as a visitor held still, so the
     * gesture is not offered rather than offered and refused.
     */
    expect(await rows().count()).toBeLessThan(before);
    await expect(page.locator('.st-state-said')).toContainText('모든 너비');
  });

  /**
   * And **how long it takes to get there**, which is the first thing on a page that is about time.
   *
   * A hover that arrives instantly reads as a bug on anything larger than a link: the eye sees a
   * replacement rather than a change, and cannot tell what caused it. What only a browser can show
   * is that the rule the export writes is one the browser accepts and computes — a `transition`
   * naming a property nothing changes, or a curve with a typo in it, is dropped in silence and looks
   * exactly like the declaration working.
   */
  test('fades between the two, for as long as the reader says', async ({ page }) => {
    await ready(page);

    const card = cardRow(page, 'desktop').locator('.st-stack').first();
    await bring(page, cardRow(page, 'desktop'));
    await pressDeepAt(page, card);
    await page.waitForTimeout(300);
    await page.locator('.office-properties').getByRole('tab', { name: '모양' }).click();
    await page.waitForTimeout(200);

    // A block nobody has told about time carries no rule about it.
    const transition = async () =>
      await card.evaluate((el) => getComputedStyle(el as HTMLElement).transitionDuration);
    expect(await transition()).toBe('0s');

    const field = page.locator('.office-properties').getByLabel('전환 시간');
    await field.fill('160');
    await field.press('Enter');
    await page.waitForTimeout(400);

    /*
     * Computed, not merely written: a property the browser refused would read `0s` here. One
     * duration per property named, which is what a browser answers with — this card's hover changes
     * more than one thing, and each of them is told the same time.
     */
    const each = (await transition()).split(', ');
    expect(each.length).toBeGreaterThan(0);
    expect(each.every((one) => one === '0.16s')).toBe(true);
    const named = await card.evaluate(
      (el) => getComputedStyle(el as HTMLElement).transitionProperty
    );
    /*
     * Exactly what its states change — this card's hover names its border and its shadow — and
     * nothing that would move it. `all` is what a hand-written page says, and it is what drags
     * something unrelated along with the hover.
     */
    expect(named).toContain('border');
    expect(named).toContain('box-shadow');
    expect(named).not.toContain('all');
    expect(named).not.toMatch(/\b(width|height|padding|gap|margin)\b/);

    // And the visitor gets the same one.
    const html = await page.evaluate(() => (window as any).exportSite?.()?.[0]?.html ?? '');
    expect(html).toMatch(/transition: border 160ms/);

    // Emptied takes it back, which is a different document from 0 and the same drawing.
    await field.fill('');
    await field.press('Enter');
    await page.waitForTimeout(400);
    expect(await transition()).toBe('0s');
  });
});

/**
 * The card of a list, edited against the data it draws.
 *
 * A list draws one card per row and the rows are resolved at draw time, so the chain of document
 * nodes stops at the list itself — which meant a double-click on a product had nowhere further to go
 * and **did nothing at all**. That is the whole of the report: *더블클릭 해도 편집모드가 되지 않아.*
 *
 * The other half is why the card is opened against a row rather than on its own. A card designed
 * against `상품`, `설명` and `0원` is a card designed against nothing: every real title is longer,
 * every real price has a comma in it, and the two-line description that breaks the layout is in the
 * data rather than in the placeholder.
 */
test.describe('the card a list draws', () => {
  /** The product list on the home page, brought under the reader. */
  const productList = (page: Page) =>
    page.locator('[data-frame="desktop"] .st-collection').first();

  const open = async (page: Page, which: number) => {
    await bring(page, productList(page));
    const row = productList(page).locator('> *').nth(which);
    // ⌘ selects the innermost thing, which inside a list is the list — a row is not a document node.
    await row.click({ force: true, modifiers: ['Meta'], position: { x: 6, y: 6 } });
    await page.waitForTimeout(250);
    await row.dblclick({ force: true, position: { x: 6, y: 6 } });
    await page.waitForTimeout(600);
    /*
     * And bring the card under the reader. The boards keep their place on the plane when what they
     * draw changes — which is right, a definition opens where the page was — but a card is one small
     * box where a page was five screens, so it can be left off the edge of the window.
     */
    await bring(page, page.locator('[data-frame="desktop"] .st-frame-host'));
  };

  test('opens from a row, and draws the card with that row in it', async ({ page }) => {
    await ready(page);
    await open(page, 1);

    // The definition, not the page.
    await expect(page.locator('[data-editing-component]')).toHaveAttribute(
      'data-editing-component',
      'product-card'
    );

    /*
     * And the **second** product, because that is the one that was pointed at. The row number lives
     * in the drawn sid and `sidAtElement` collapses it away on purpose — a part of a placement is
     * not a thing a reader edits — so asking the drawing rather than the document is what keeps it.
     */
    // The board draws the **definition's part**, which is an ordinary frame — there is no page here.
    const board = page.locator('[data-frame="desktop"] .st-frame-host');
    await expect(board).toContainText('문서');
    await expect(board).toContainText('월 9,900원');
    // Never the placeholder the definition holds, which is what a card designed against nothing
    // looks like: `상품`, `설명`, `0원`.
    await expect(board).not.toContainText('상품');
  });

  test('steps through the rows without going back to the page', async ({ page }) => {
    await ready(page);
    await open(page, 0);

    const picker = page.locator('.st-where-row select');
    await expect(picker).toBeVisible();
    await expect(page.locator('[data-frame="desktop"] .st-frame-host')).toContainText('사이트');

    /*
     * The row that breaks a card is rarely the first one, so a designer has to be able to flip to it
     * — going back to the page and double-clicking a different product to see a long title is the
     * editor's bookkeeping handed to the reader.
     */
    await picker.selectOption({ index: 2 });
    await page.waitForTimeout(500);
    await expect(page.locator('[data-frame="desktop"] .st-frame-host')).not.toContainText('사이트');
  });

  test('says where a bound part’s words come from instead of taking the caret', async ({ page }) => {
    await ready(page);
    await open(page, 0);

    // The card's title draws the row's name. Asking for the caret there asks for something the data
    // would overwrite a frame later, so the tool answers rather than accepting.
    const title = page.locator('[data-frame="desktop"] .st-frame-host h3').first();
    await pressDeep(page, title);
    await page.waitForTimeout(200);
    await title.dblclick({ force: true });
    await page.waitForTimeout(400);

    const said = page.locator('[data-frame="desktop"] .st-mark-bound');
    await expect(said).toHaveCount(1);
    await expect(said).toContainText('데이터에서 옴');
    await expect(said).toContainText('이름');
    // And the board was not put into text mode, which is the change that would have been discarded.
    await expect(page.locator('[data-frame="desktop"] .st-overlay')).not.toHaveAttribute(
      'data-mode',
      'text'
    );
  });

  test('goes back to the page, and the list draws its own rows again', async ({ page }) => {
    await ready(page);
    await open(page, 1);
    await page.locator('.st-back').click();
    await page.waitForTimeout(600);

    // Every row again, each with its own words — the preview was never in the document.
    const list = productList(page);
    await expect(list).toContainText('사이트');
    await expect(list).toContainText('문서');
    await expect(page.locator('.st-where-row')).toHaveCount(0);
  });
});

/**
 * The three things a list is, and the one that had no way in.
 *
 * A list is a **dataset**, a **card**, and *which column of the data goes into which slot of the
 * card*. The first two were reachable — the data panel and, now, a double-click on a row — and the
 * third was not: the answers live on the list's template placement, and nothing selects a template.
 * So a reader who added a column to the data had no way to make the card show it, which is the point
 * at which a template stops being editable and becomes whatever the sample's author wrote.
 */
test.describe('what the card is given', () => {
  const panel = (page: Page) => page.locator('.office-properties');

  test('lists the card’s questions, and where each answer comes from', async ({ page }) => {
    await ready(page);
    const list = page.locator('[data-frame="desktop"] .st-collection').first();
    await bring(page, list);
    await pressDeepAt(page, list.locator('> *').first());
    await page.waitForTimeout(400);

    await panel(page).locator('[data-tab="data"]').click();
    await page.waitForTimeout(250);

    // One row per question the card asks — a fact about the definition, so it is read and not declared.
    const asks = panel(page).locator('.st-card-value');
    await expect(asks).toHaveCount(3);
    await expect(panel(page).getByLabel('이름 변수에 넣을 컬럼')).toContainText('이름');
    await expect(panel(page).getByLabel('가격 변수에 넣을 컬럼')).toContainText('가격');
  });

  test('changes which column a slot draws, on every row at once', async ({ page }) => {
    await ready(page);
    const list = page.locator('[data-frame="desktop"] .st-collection').first();
    await bring(page, list);
    await expect(list).toContainText('쌓이는 섹션, 브라우저가 배치.');

    await pressDeepAt(page, list.locator('> *').first());
    await page.waitForTimeout(400);
    await panel(page).locator('[data-tab="data"]').click();
    await page.waitForTimeout(250);

    /*
     * The card's 설명 slot, told to take a different column. One gesture, forty cards — which is the
     * whole reason a list draws a component rather than forty copies of one.
     */
    await panel(page).getByLabel('설명 변수에 넣을 컬럼').click();
    await page.locator('[role="option"]', { hasText: '분류' }).first().click();
    await page.waitForTimeout(600);

    await expect(list).not.toContainText('쌓이는 섹션, 브라우저가 배치.');
    await expect(list).toContainText('제품');
  });
});

/**
 * What a reader can put on a page, and whether it is the thing they asked for.
 *
 * Two of these were already in the schema and unreachable, one was reachable and drew as something
 * else, and the last is a composition rather than a node. Each is checked for what it *is* in the
 * markup rather than for what it looks like: a list that is not a `<ul>` is a column of sentences to
 * a screen reader and to a search engine however neatly it is indented.
 */
test.describe('the things a page can hold', () => {
  const board = (page: Page) => page.locator('[data-frame="desktop"] .st-page');

  test('draws a list as a list, with the markers a browser gives one', async ({ page }) => {
    await ready(page);

    /*
     * It drew `<div class="w-list">` holding `<div class="w-list-item" data-marker="">`. The marker
     * is Word's — it comes from a numbering definition through the env, which a site has none of —
     * so 목록 put an indistinguishable pile of sentences on the page, and `PAGE_CSS` carried rules
     * for `ul`, `ol` and `li` that could never match anything.
     */
    await page.locator('[data-insert="insertBulletList"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-insert="insertNumberList"]').click();
    await page.waitForTimeout(400);

    const bullets = board(page).locator('ul.st-list');
    const numbers = board(page).locator('ol.st-list');
    await expect(bullets).toHaveCount(1);
    await expect(numbers).toHaveCount(1);
    // And the marker, which is the one thing a list cannot be read without. Tailwind's preflight
    // takes it off every ul and ol in the window the boards are drawn in.
    await expect(bullets.first()).toHaveCSS('list-style-type', 'disc');
    await expect(numbers.first()).toHaveCSS('list-style-type', 'decimal');
    await expect(bullets.locator('li')).toHaveCount(1);
  });

  test('draws a quotation as a blockquote, and a rule as a rule', async ({ page }) => {
    await ready(page);
    await page.locator('[data-insert="insertQuote"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-insert="insertRule"]').click();
    await page.waitForTimeout(400);

    await expect(board(page).locator('blockquote').last()).toContainText('인용할 문장');
    // One: the sample's own rule is on 블로그, between the featured post and the rest.
    await expect(board(page).locator('hr')).toHaveCount(1);
  });

  test('makes a button that answers the pointer, out of a frame', async ({ page }) => {
    await ready(page);
    await page.locator('[data-insert="insertButton"]').click();
    await page.waitForTimeout(500);

    const made = board(page).locator('.st-stack[data-name="버튼"]').first();
    await expect(made).toContainText('버튼');
    /*
     * There is no `button` node in this schema and there should not be: a button is a box with a
     * word in it, a colour, a radius, a hit area and an answer to the pointer, and every one of
     * those is something a frame already says. What the command carries is the arrangement — which
     * is where a product's taste lives rather than in its vocabulary.
     */
    await expect(made).toHaveCSS('border-radius', '40px');
    const box = await made.boundingBox();
    const zoom = await page.evaluate(
      () => Number((document.querySelector('.st-canvas') as HTMLElement).dataset.zoom) || 1
    );
    // A target a thumb can hit, measured back through the zoom the plane is drawn at.
    expect((box?.height ?? 0) / zoom).toBeGreaterThan(40);
  });

  test('offers every insert the model declares, without the app restating them', async ({ page }) => {
    await ready(page);
    /*
     * These two groups were two arrays of command names written out in the app, and five inserts
     * were registered, working and reachable by no button. A control now says whether it makes a
     * thing that holds other things or a thing that goes in one, so the next one appears where it
     * belongs by saying what it is.
     */
    const declared = siteControlsIn('insert')
      .filter((one) => one.puts)
      .map((one) => one.command);
    expect(declared.length).toBeGreaterThan(8);
    const drawn = await page.locator('[data-insert]').evaluateAll((nodes) =>
      nodes.map((one) => one.getAttribute('data-insert'))
    );
    for (const command of declared) expect(drawn).toContain(command);
  });
});

/**
 * A card that can grow a slot, which is where a template stops being a drawing.
 *
 * A list is a dataset, a card, and a wiring between them. The wiring became editable and the card's
 * questions did not: `componentVar` and `componentBind` could be written by hand and by nothing
 * else, so a reader who added a 할인 column to the data had nowhere on the card to put it. A
 * template that cannot grow is a drawing somebody made once.
 */
test.describe('a card can be asked something new', () => {
  const panel = (page: Page) => page.locator('.office-properties');

  /** What the document holds, as the two node types a binding is made of. */
  const wiring = (page: Page, id: string) =>
    page.evaluate((componentId) => {
      const editor = (window as never as { editor: any }).editor;
      const store = editor.dataStore;
      let found: any;
      const walk = (sid: string) => {
        const one = store.getNode(sid);
        if (!one) return;
        if (one.stype === 'component' && one.attributes?.id === componentId) found = one;
        for (const child of one.content ?? []) if (typeof child === 'string') walk(child);
      };
      walk(editor.getRootId());
      const kids = (found?.content ?? [])
        .filter((sid: unknown) => typeof sid === 'string')
        .map((sid: string) => store.getNode(sid));
      return {
        asks: kids.filter((one: any) => one?.stype === 'componentVar').map((one: any) => one.attributes?.name),
        binds: kids
          .filter((one: any) => one?.stype === 'componentBind')
          .map((one: any) => `${one.attributes?.part}->${one.attributes?.var}`)
      };
    }, id);

  const openCard = async (page: Page) => {
    await page.locator('[data-panel="components"]').click();
    await page.locator('[data-edit-component="product-card"]').click();
    await page.waitForTimeout(600);
  };

  test('declares the question and binds the part, in one gesture', async ({ page }) => {
    await ready(page);
    await openCard(page);

    await page.locator('[data-panel="add"]').click();
    await page.locator('[data-insert="insertBodyText"]').click();
    await page.waitForTimeout(500);

    await panel(page).locator('[data-tab="block"]').click();
    await panel(page).getByLabel('새 변수 이름').fill('할인');
    await panel(page).getByLabel('새 변수 이름').press('Enter');
    await page.waitForTimeout(600);

    const said = await wiring(page, 'product-card');
    expect(said.asks).toContain('할인');
    /*
     * And the part is named after the **question** rather than after its words. The words are a
     * placeholder at the moment of binding — `본문을 입력하세요` — and a `partId` outlives them: it is
     * the durable name a binding uses, and a saved document would carry a sentence nobody wrote as
     * the name of a slot.
     */
    expect(said.binds).toContain('할인->할인');
  });

  test('and the list is then asked for a column to put in it', async ({ page }) => {
    await ready(page);
    await openCard(page);
    await page.locator('[data-panel="add"]').click();
    await page.locator('[data-insert="insertBodyText"]').click();
    await page.waitForTimeout(500);
    await panel(page).locator('[data-tab="block"]').click();
    await panel(page).getByLabel('새 변수 이름').fill('할인');
    await panel(page).getByLabel('새 변수 이름').press('Enter');
    await page.waitForTimeout(600);

    // Back to the page, where the loop closes: a new question is a new row in 카드에 넣을 값.
    await page.locator('.st-back').click();
    await page.waitForTimeout(600);
    const list = page.locator('[data-frame="desktop"] .st-collection').first();
    await bring(page, list);
    await pressDeepAt(page, list.locator('> *').first());
    await page.waitForTimeout(400);
    await panel(page).locator('[data-tab="data"]').click();
    await page.waitForTimeout(300);

    await expect(panel(page).locator('.st-card-value')).toHaveCount(4);
    await expect(panel(page).getByLabel('할인 변수에 넣을 컬럼')).toBeVisible();
  });

  test('unbinds without taking the question away', async ({ page }) => {
    await ready(page);
    await openCard(page);

    const title = page.locator('[data-frame="desktop"] .st-frame-host h3').first();
    await bring(page, page.locator('[data-frame="desktop"] .st-frame-host'));
    await pressDeep(page, title);
    await page.waitForTimeout(400);
    await panel(page).locator('[data-tab="block"]').click();
    await page.waitForTimeout(200);

    await expect(panel(page).getByLabel('연결된 변수')).toContainText('이름');
    await panel(page).getByLabel('연결된 변수').click();
    await page.locator('[role="option"]', { hasText: '연결 안 함' }).first().click();
    await page.waitForTimeout(600);

    const said = await wiring(page, 'product-card');
    expect(said.binds).not.toContain('p-name->이름');
    /*
     * And 이름 is still a question. Taking it away would change every placement of this card at
     * once, which is not what a reader unhooking one slot means — and another part may be answering
     * the same question.
     */
    expect(said.asks).toContain('이름');
  });

  /**
   * And the other half: a variable can be **renamed and taken away**.
   *
   * Without these the two above are a one-way door. A typo in a variable's name was permanent, and a
   * variable added by mistake could only be *unbound* — so a card accumulated questions nobody
   * answers and every placement grew a field with nothing behind it.
   *
   * `component-vars.test.ts` holds the arithmetic — that the declaration, every binding and every
   * answer move together, that a clash is refused, that one undo puts it all back. What only a
   * browser shows is the chain: a reader standing on a part of a card, typing in the panel, and the
   * page they go back to still drawing its products.
   */
  test('renames the variable a part is bound to, and the page still draws', async ({ page }) => {
    await ready(page);
    await openCard(page);

    const title = page.locator('[data-frame="desktop"] .st-frame-host h3').first();
    await bring(page, page.locator('[data-frame="desktop"] .st-frame-host'));
    await pressDeep(page, title);
    await page.waitForTimeout(400);
    await panel(page).locator('[data-tab="block"]').click();
    await page.waitForTimeout(200);

    const field = panel(page).getByLabel('변수 이름 바꾸기');
    await expect(field).toHaveValue('이름');
    await field.fill('상품명');
    await field.press('Enter');
    await page.waitForTimeout(600);

    const said = await wiring(page, 'product-card');
    expect(said.asks).toContain('상품명');
    expect(said.asks).not.toContain('이름');
    expect(said.binds).toContain('p-name->상품명');

    /*
     * And back on the page, the list still draws its products — which is the whole point of moving
     * the answers with the declaration. A rename that touched only the definition would leave every
     * card drawing the fallback word 상품 in place of what its row says.
     */
    await page.locator('.st-back').click();
    await page.waitForTimeout(700);
    const cards = page.locator('[data-frame="desktop"] .st-collection').first();
    // The 이름 column's own words, still on the cards under a variable that is now called 상품명.
    await expect(cards).toContainText('사이트');
    await expect(cards).toContainText('덱');
  });

  test('takes a variable away, from the card and from every placement of it', async ({ page }) => {
    await ready(page);
    await openCard(page);

    const price = page.locator('[data-frame="desktop"] .st-frame-host p').last();
    await bring(page, page.locator('[data-frame="desktop"] .st-frame-host'));
    await pressDeep(page, price);
    await page.waitForTimeout(400);
    await panel(page).locator('[data-tab="block"]').click();
    await page.waitForTimeout(200);

    const bound = await panel(page).getByLabel('변수 이름 바꾸기').inputValue();
    expect(bound).toBeTruthy();

    // The button says what it is about to do, because it reaches every placement at once.
    const remove = panel(page).getByLabel('변수 삭제');
    await expect(remove).toHaveAttribute('title', new RegExp(`${bound}.*곳`));
    await remove.click();
    await page.waitForTimeout(700);

    const said = await wiring(page, 'product-card');
    expect(said.asks).not.toContain(bound);
    expect(said.binds.join(' ')).not.toContain(`->${bound}`);

    // The part is still there, drawing its own words: removing a variable is not removing a block.
    await expect(page.locator('[data-frame="desktop"] .st-frame-host p')).not.toHaveCount(0);
  });

  test('is not offered for a block that is nobody’s part', async ({ page }) => {
    await ready(page);
    const hero = page.locator('[data-frame="desktop"] .st-page h1').first();
    await pressDeep(page, hero);
    await page.waitForTimeout(300);
    await panel(page).locator('[data-tab="block"]').click();
    await page.waitForTimeout(200);

    // A heading on a page is nobody's part: a row offering to bind it would write a binding into a
    // document with nothing to resolve it.
    await expect(panel(page)).not.toContainText('새 변수');
    await expect(panel(page).getByLabel('연결된 변수')).toHaveCount(0);
  });
});

/**
 * The way back out of a component, without which making one is a decision rather than a door.
 *
 * `createComponentFrom` was one-way: a reader who turned a card into a component and then found one
 * page wanted it different had no move left. Readers who cannot get back out stop going in, which is
 * how a component library ends up with two entries and a repository full of copied cards.
 */
test.describe('a component can be let go', () => {
  const detach = (page: Page) =>
    page.getByRole('button', { name: /일반 블록으로 되돌립니다/ });

  const nodeAt = (page: Page, sid: string) =>
    page.evaluate((one) => {
      const store = (window as never as { editor: any }).editor.dataStore;
      const node = store.getNode(one);
      return node ? { stype: node.stype, componentId: node.attributes?.componentId ?? null } : null;
    }, sid);

  test('turns an instance into ordinary blocks, keeping what it drew', async ({ page }) => {
    await ready(page);

    const header = page.locator('[data-frame="desktop"] .st-placement').first();
    await press(page, header);
    await page.waitForTimeout(400);
    const was = await page.evaluate(() => (window as never as { editor: any }).editor.selection.nodeIds[0]);
    expect((await nodeAt(page, was))?.stype).toBe('instance');

    await expect(detach(page)).toBeEnabled();
    await detach(page).click();
    await page.waitForTimeout(700);

    /*
     * The **same node**, changed where it stands: same sid, same place, same width, every override
     * still on it. It was a replace-and-reinsert for one round, because a node that changed type
     * disappeared off the page — two faults in the reconciler, now fixed and held by
     * `renderer-dom/test/replaced-root.test.ts`.
     */
    const now = await page.evaluate(() => (window as never as { editor: any }).editor.selection.nodeIds[0]);
    expect(now).toBe(was);
    const made = await nodeAt(page, now);
    expect(made?.stype).toBe('frame');
    expect(made?.componentId).toBeNull();
    // And it is drawn, which is the half the document could not tell us about.
    await expect(page.locator(`[data-frame="desktop"] [data-bc-sid="${now}"]`)).toHaveCount(1);

    /*
     * And it still draws what it drew one press ago, values and all — including the button's
     * 무료로 시작하기, which is a value the *header* supplies to a component nested inside it. A
     * detached tree that copied the nested placement as it was **drawn** would have stored a
     * placement with no values in it, and the resolver would have drawn 시작하기 instead.
     */
    const board = page.locator('[data-frame="desktop"] .st-page');
    await expect(board).toContainText('무료로 시작하기');
    await expect(board.locator('[data-name="내비게이션"]')).toHaveCount(1);
  });

  test('leaves the component alone, and every other page with it', async ({ page }) => {
    await ready(page);
    const uses = async () => {
      await page.locator('[data-panel="components"]').click();
      await page.waitForTimeout(300);
      return await page.locator('[data-component="site-header"]').innerText();
    };
    expect(await uses()).toContain('5곳');

    await page.locator('[data-panel="add"]').click();
    await press(page, page.locator('[data-frame="desktop"] .st-placement').first());
    await page.waitForTimeout(300);
    await detach(page).click();
    await page.waitForTimeout(700);

    // One fewer place uses it, and the component is still there for the four that do.
    expect(await uses()).toContain('4곳');
  });

  test('refuses a data list’s card, which is not a block on the page', async ({ page }) => {
    await ready(page);
    const list = page.locator('[data-frame="desktop"] .st-collection').first();
    await bring(page, list);
    await pressDeepAt(page, list.locator('> *').first());
    await page.waitForTimeout(400);

    /*
     * The selection here is the **list**, because a drawn row is not a document node — and even
     * reaching the card underneath, detaching it would leave a list with nothing to draw and a stray
     * card beside it. Which is a reader asking for something else: to stop the list being a list.
     */
    await expect(detach(page)).toBeDisabled();
  });
});

/**
 * A code block: **drawn** by Prism, **edited** in a layer of its own.
 *
 * Two decisions behind everything below, and each removes a whole class of question:
 *
 * - **Prism tokenizes in the renderer.** The spans are in the markup the editor draws and the export
 *   writes — the same bytes in both, with no script for a visitor to run. It replaced painting
 *   ranges at runtime, which coloured things and could not say what a code block *is*, and which
 *   left a published page depending on our function.
 * - **The caret never enters one.** `contenteditable="false"`, so the token spans are the renderer's
 *   and nothing maps a caret through them. Every question the text stack would have had to answer —
 *   offsets through spans nothing owns, IME, marks, what Enter and Tab mean — stops being asked.
 *
 * Which is also what makes a real code editor safe here: the objection to embedding one was about
 * the *always-embedded* shape, and a layer that opens on a gesture is a different proposition.
 */
test.describe('a code block', () => {
  const panel = (page: Page) => page.locator('.office-properties');
  const block = (page: Page) => page.locator('[data-frame="desktop"] pre.st-code').first();

  const add = async (page: Page) => {
    await page.locator('[data-insert="insertCode"]').click();
    await page.waitForTimeout(600);
    return block(page);
  };

  const setLanguage = async (page: Page, language: string) => {
    await bring(page, block(page));
    await pressDeep(page, block(page));
    await page.waitForTimeout(300);
    await panel(page).locator('[data-tab="block"]').click();
    await panel(page).getByLabel('코드 언어').fill(language);
    await panel(page).getByLabel('코드 언어').press('Enter');
    await page.waitForTimeout(600);
  };

  test('is drawn as code, and the caret cannot get into it', async ({ page }) => {
    await ready(page);
    const pre = await add(page);

    await expect(pre).toHaveAttribute('contenteditable', 'false');
    await expect(pre).toHaveAttribute('spellcheck', 'false');
    await expect(pre).toHaveCSS('white-space', 'pre');
    // The newlines it arrived with are characters, drawn literally by the element.
    await expect(pre).toContainText('return 1;');
  });

  test('says nothing about a language it has not been told', async ({ page }) => {
    await ready(page);
    const pre = await add(page);
    /*
     * One span and no tokens. A block that has not been told its language is a block nobody has told
     * yet rather than one in the wrong language, so the characters are left the text's colour.
     */
    await expect(pre.locator('.token')).toHaveCount(0);
  });

  test('tokenizes with a grammar once it is told, not with a word list', async ({ page }) => {
    await ready(page);
    await add(page);
    await setLanguage(page, 'js');

    const pre = block(page);
    await expect(pre.locator('.token.keyword')).toHaveCount(2);
    /*
     * `안녕` as a **function**, which is the difference a grammar makes: it is not in any word list,
     * and it is a call because of the parenthesis after it. A scanner cannot know that.
     */
    await expect(pre.locator('.token.function')).toHaveCount(1);
    await expect(pre.locator('.token.punctuation').first()).toBeVisible();
  });

  test('publishes the same spans, and no script at all', async ({ page }) => {
    await ready(page);
    await add(page);
    await setLanguage(page, 'js');

    const html = await page.evaluate(
      () => (window as never as { exportSite: () => { html: string }[] }).exportSite()[0].html
    );
    expect(html).toContain('class="token keyword"');
    expect(html).toContain('.token.keyword');
    /*
     * Nothing to run. The colour arrives with the drawing, which is what a page rendered by the same
     * renderers as the editor means — the version before this had to execute our tokenizer in the
     * visitor's browser to be coloured at all.
     */
    expect(html).not.toContain('<script');
  });

  test('opens an editor of its own, and takes one change when it closes', async ({ page }) => {
    await ready(page);
    await add(page);
    await bring(page, block(page));
    await block(page).dblclick({ force: true });
    await page.waitForTimeout(600);

    // A real editor, mounted over the block rather than inside the board's editable region.
    await expect(page.locator('.st-code-layer .cm-editor')).toHaveCount(1);

    await page.keyboard.type('// 안녕\n');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    await expect(page.locator('.st-code-layer')).toHaveCount(0);
    await expect(block(page)).toContainText('// 안녕');

    /*
     * **One** undo for the whole session. CodeMirror keeps its own history while it is open and the
     * document never hears about it, so a reader who typed forty characters and pressed Escape has
     * made one change — not forty.
     */
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(600);
    await expect(block(page)).not.toContainText('// 안녕');
    await expect(block(page)).toContainText('return 1;');
  });
});

/** The properties panel, for the describes that reach it. */
const panelOf = (page: Page) => page.locator('.office-properties');
void panelOf;


/**
 * The **menubar** — what acts on the document and the application.
 *
 * Counted across the three products before this existed: Word carried 71 toolbar controls in one
 * flat strip and 72 keyboard shortcuts with nowhere to read them, the deck had grown twelve
 * application-level commands as title-bar buttons because there was nowhere else for them, and this
 * product **could not export**. `exportSite` rendered every page of a site and was reachable from
 * `window.exportSite` and from tests and from nothing a reader could press.
 *
 * `menu-model.test.ts` holds what the model claims — that every command it names is registered, that
 * a view entry is not a command, that publishing comes first. What only a browser shows is the
 * chain: a reader opens 파일, presses 내보내기, and a file arrives.
 */
test.describe('the menubar', () => {
  const bar = (page: Page) => page.locator('.st-menubar');

  test('opens a menu, and the next one by pointing at it', async ({ page }) => {
    await ready(page);

    await expect(bar(page).getByRole('menuitem', { name: '파일' })).toBeVisible();
    await bar(page).locator('[data-menu="file"]').click();
    await expect(page.locator('[role="menu"]')).toBeVisible();
    await expect(page.locator('[data-menu-item="file.publish.0"]')).toHaveText(/내보내기/);

    /*
     * Pointing at the next trigger opens it without a click — a menubar behaviour a reader notices
     * only by its absence, when they have to click twice to look in the next menu.
     */
    await bar(page).locator('[data-menu="edit"]').hover();
    await page.waitForTimeout(200);
    await expect(page.locator('[data-menu-item="edit.history.0"]')).toBeVisible();
  });

  test('teaches the shortcuts, which had nowhere to be read', async ({ page }) => {
    await ready(page);
    await bar(page).locator('[data-menu="edit"]').click();

    // A tooltip teaches a shortcut to a reader who has already found the button, which is the reader
    // who needs it least. 99 bindings across three products had only that.
    await expect(page.locator('[data-menu-item="edit.history.0"]')).toContainText('⌘Z');
    await expect(page.locator('[data-menu-item="edit.blocks.0"]')).toContainText('⌘D');
  });

  test('greys what the document cannot do right now', async ({ page }) => {
    await ready(page);
    await bar(page).locator('[data-menu="edit"]').click();

    // Nothing is selected, so there is nothing to duplicate. An entry a reader can press that then
    // does nothing is worse than one that is greyed.
    await expect(page.locator('[data-menu-item="edit.blocks.0"]')).toBeDisabled();

    await page.keyboard.press('Escape');
    await pressDeep(page, page.locator('[data-frame="desktop"] .st-page h1').first());
    await page.waitForTimeout(300);
    await bar(page).locator('[data-menu="edit"]').click();
    await expect(page.locator('[data-menu-item="edit.blocks.0"]')).toBeEnabled();
  });

  test('offers the page commands as things a reader can actually press', async ({ page }) => {
    await ready(page);
    await bar(page).locator('[data-menu="file"]').click();

    /*
     * The first shape of this was a dead menu: `duplicatePage` and `removePage` answer `canExecute`
     * against a `nodeId` and return false without one, so from a menubar with no payload they were
     * greyed forever. The model says `needs: 'page'` now and the app fills in the page a reader is
     * on — which is genuinely the app's to know, since the document has no notion of one being open.
     */
    await expect(page.locator('[data-menu-item="file.pages.1"]')).toBeEnabled();
    await expect(page.locator('[data-menu-item="file.pages.2"]')).toBeEnabled();
  });

  test('publishes the page, which is the gesture this product is for', async ({ page }) => {
    await ready(page);

    const wait = page.waitForEvent('download');
    await bar(page).locator('[data-menu="file"]').click();
    await page.locator('[data-menu-item="file.publish.0"]').click();
    const file = await wait;

    // The address becomes the filename the way a host would serve it.
    expect(file.suggestedFilename()).toBe('index.html');
  });

  test('publishes every page of the site, one file each', async ({ page }) => {
    await ready(page);

    const files: string[] = [];
    page.on('download', (one) => files.push(one.suggestedFilename()));

    await bar(page).locator('[data-menu="file"]').click();
    await page.locator('[data-menu-item="file.publish.1"]').click();
    await expect.poll(() => files.length, { timeout: 15000 }).toBeGreaterThan(1);

    expect(files).toContain('index.html');
  });

  /**
   * The entries that could **never** have been enabled — found by pressing all 33 of them.
   *
   * Three faults, all the same shape and all invisible until something ran the whole bar:
   *
   * - `moveBlockUp` and `moveBlockDown` answer `canExecute` against a **ModelSelection** in the
   *   payload, not a node id, so from a menubar sending a `nodeId` they were greyed forever.
   * - `insertPlacement` needs a `componentId` and `insertDataList` needs a dataset *and* a
   *   definition — a menu has none of those to give, so those two point at the rail instead, which
   *   is where the choice can be made.
   *
   * A sweep like this is worth more than any one of the tests it produced: an entry that can never
   * be enabled looks exactly like an entry that is merely unavailable right now.
   */
  test('offers every entry that acts on what is selected, once something is', async ({ page }) => {
    await ready(page);
    await pressDeepAt(page, cardRow(page, 'desktop'));
    await page.waitForTimeout(400);

    /*
     * The **last** band: up is possible and down is not, which is the pair being honest rather than
     * the feature being half-built. A command that reports success and changes nothing is the fault
     * these two were built out of.
     */
    await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const home = (root.content ?? [])
        .map((one: string) => store.getNode(one))
        .find((one: any) => one?.stype === 'surface');
      const kids = (home.content ?? []) as string[];
      editor.executeCommand('setNode', { nodeIds: [kids[kids.length - 1]] });
    });
    await page.waitForTimeout(400);

    await bar(page).locator('[data-menu="edit"]').click();
    await expect(page.locator('[data-menu-item="edit.blocks.2"]')).toBeEnabled();
    await expect(page.locator('[data-menu-item="edit.blocks.3"]')).toBeDisabled();
    await page.keyboard.press('Escape');

    await bar(page).locator('[data-menu="insert"]').click();
    await expect(page.locator('[data-menu-item="insert.data.0"]')).toBeEnabled();
    await expect(page.locator('[data-menu-item="insert.data.1"]')).toBeEnabled();
  });

  test('moves a block up the page, which was registered and on nothing', async ({ page }) => {
    await ready(page);

    /*
     * The order **inside whatever holds the selected block**, not the page's — a block moves within
     * its own parent, and reading the page's top-level list would report no change for a card that
     * moved perfectly well inside its row.
     */
    const order = async () =>
      await page.evaluate(() => {
        const editor = (window as any).editor;
        const store = editor.dataStore;
        const chosen = editor.selection?.nodeIds?.[0];
        const parent = chosen ? store.getNode(chosen)?.parentId : undefined;
        return ((parent ? store.getNode(parent)?.content : []) ?? []).join(',');
      });

    /*
     * The **last** band of the page, because moving the first one up is correctly a no-op and a test
     * that selected it would be asserting the feature is broken.
     */
    await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const home = (root.content ?? [])
        .map((one: string) => store.getNode(one))
        .find((one: any) => one?.stype === 'surface');
      const kids = (home.content ?? []) as string[];
      editor.executeCommand('setNode', { nodeIds: [kids[kids.length - 1]] });
    });
    await page.waitForTimeout(400);
    const before = (await order()).split(',');

    await bar(page).locator('[data-menu="edit"]').click();
    await page.locator('[data-menu-item="edit.blocks.2"]').click();
    await page.waitForTimeout(600);

    const after = (await order()).split(',');
    expect(after).not.toEqual(before);
    expect([...after].sort()).toEqual([...before].sort());
  });

  test('points at the rail for the two inserts a menu cannot make', async ({ page }) => {
    await ready(page);

    /*
     * A placement needs a definition and a data list needs a dataset, and a menu has neither to
     * name — so the entry opens the list that can offer one, which is what 삽입 › 표 does in every
     * word processor. The ellipsis is the convention that says so.
     */
    await bar(page).locator('[data-menu="insert"]').click();
    await page.locator('[data-menu-item="insert.data.0"]').click();
    await page.waitForTimeout(400);

    await expect(page.locator('[data-panel="components"][data-current="true"]')).toHaveCount(1);
  });

  test('changes how the reader is looking, which is not a command', async ({ page }) => {
    await ready(page);
    await expect(page.locator('[data-frame="tablet"]')).toHaveCount(1);

    /*
     * How many boards are open is not a fact about the reader's site, so it is not a command and the
     * model declares it as a `view`. The app answers those in one `switch`, which is the same
     * contract `PropertySheet` has with a product's own control kinds.
     */
    await bar(page).locator('[data-menu="view"]').click();
    await page.locator('[data-menu-item="view.frames.1"]').click();
    await page.waitForTimeout(400);

    await expect(page.locator('[data-frame="tablet"]')).toHaveCount(0);
    await expect(page.locator('[data-frame="desktop"]')).toHaveCount(1);

    // And back, from the entry that says "all three" — a set rather than a toggle, which is why it
    // is its own block and carries no check mark.
    await bar(page).locator('[data-menu="view"]').click();
    await page.locator('[data-menu-item="view.frameSets.0"]').click();
    await page.waitForTimeout(400);
    await expect(page.locator('.st-frame')).toHaveCount(3);
  });
});

/**
 * Looking at the site instead of building it.
 *
 * A page has **no height of its own** — it is as tall as its content — so what a visitor sees is
 * decided by the window they open it in. While a reader is building, drawing the whole page at full
 * height is right: three boards side by side is a comparison of *pages*. It is also why a sticky
 * header, a scroll reveal and a real `:hover` could never be judged here. None of those is a property
 * of a page; they are answers to *what the page does*, and there was nowhere for it to do anything.
 *
 * In preview each board becomes a **window** of a typical height for its width, and the page scrolls
 * inside it.
 */
test.describe('preview', () => {
  const toggle = (page: Page) => page.locator('.st-preview-toggle');
  const board = (page: Page) => page.locator('[data-frame="desktop"] .st-frame-body');

  test('turns the board into a window the page scrolls inside', async ({ page }) => {
    await ready(page);
    const before = await board(page).evaluate((el) => ({
      height: (el as HTMLElement).getBoundingClientRect().height,
      overflow: getComputedStyle(el as HTMLElement).overflowY
    }));
    expect(before.overflow).toBe('visible');

    await toggle(page).click();
    await page.waitForTimeout(500);

    const after = await board(page).evaluate((el) => ({
      height: getComputedStyle(el as HTMLElement).height,
      overflow: getComputedStyle(el as HTMLElement).overflowY,
      scrolls: el.scrollHeight > el.clientHeight
    }));
    // A laptop's worth of window, and the page taller than it.
    expect(after.height).toBe('800px');
    expect(after.overflow).toBe('auto');
    expect(after.scrolls).toBe(true);
    expect(before.height).toBeGreaterThan(1000);
  });

  test('hands the pointer back to the page, so a hover is a hover', async ({ page }) => {
    await ready(page);
    const item = page
      .locator('[data-frame="desktop"] [data-name="내비게이션"] .st-stack[data-name="제품"]')
      .first();
    const fill = () => item.evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);

    await toggle(page).click();
    await page.waitForTimeout(500);

    /*
     * The tool's own layer is what makes a click mean something while building, and it is what stood
     * between the page and the pointer: a hover written two rounds ago could be *drawn* on request
     * and never actually **hovered**. Here it is, by pointing at it.
     */
    expect(await fill()).toBe('rgba(0, 0, 0, 0)');
    await item.hover();
    await page.waitForTimeout(250);
    expect(await fill()).toBe('rgb(238, 241, 238)');

    // And nothing is selected by pointing: the overlay is not there to select with.
    await expect(page.locator('[data-frame="desktop"] .st-overlay')).toHaveCount(0);
  });

  /**
   * And the thing preview mode was built to make judgeable: a block **arriving as the page scrolls**.
   *
   * `reveal.test.ts` holds everything about the rule that can be read — that it names `view()`, that
   * it is wrapped in both guards, that the export carries no script. What only a browser can answer
   * is whether the browser *runs* it, and that question has a specific trap in it: a scroll-driven
   * animation that a browser silently declines looks identical to one that has already finished,
   * because both leave the element at `opacity: 1`. So this scrolls to it and watches it change.
   */
  test('a block arrives as the page is scrolled to it', async ({ page }) => {
    await ready(page);

    /*
     * The **last** band of the page, which is the one guaranteed to be below an 800px window. A band
     * that starts above the fold has already arrived when the page opens, and a test that scrolled to
     * it would be asserting `1` before and `1` after.
     */
    const sid = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const home = (root.content ?? [])
        .map((one: string) => store.getNode(one))
        .find((one: any) => one?.stype === 'surface');
      const kids = (home.content ?? []) as string[];
      return kids[kids.length - 1];
    });
    await page.evaluate((one) => (window as any).editor.executeCommand('setNode', { nodeIds: [one] }), sid);
    await page.waitForTimeout(200);
    await page.evaluate(() => (window as any).editor.executeCommand('setBlockFormat', { reveal: 'rise' }));
    await page.waitForTimeout(400);

    /*
     * While **building**, it is simply there. A builder that hid half a page from the person building
     * it would be unusable, so this is the one place the product deliberately shows a reader
     * something a visitor will not see.
     */
    const block = page.locator(`[data-frame="desktop"] [data-bc-sid="${sid}"]`).first();
    expect(await block.evaluate((el) => getComputedStyle(el as HTMLElement).opacity)).toBe('1');

    await toggle(page).click();
    await page.waitForTimeout(600);

    const opacityOf = () => block.evaluate((el) => Number(getComputedStyle(el as HTMLElement).opacity));

    await board(page).evaluate((el) => el.scrollTo({ top: 0 }));
    await page.waitForTimeout(300);
    // Below the window and not yet arrived. This is the assertion the `@supports` guard exists for:
    // a browser that could not run the animation would read 1 here and the page would be fine —
    // and the same 1 is what a broken rule reads, which is why the next step matters.
    const away = await opacityOf();
    expect(away).toBeLessThan(1);

    await block.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(400);
    // Arrived — driven by the scroll and by nothing else. No observer, no class, no script.
    expect(await opacityOf()).toBe(1);
    expect(await opacityOf()).toBeGreaterThan(away);
  });

  test('follows a link to this site’s page rather than out of the app', async ({ page }) => {
    await ready(page);
    await toggle(page).click();
    await page.waitForTimeout(500);

    await expect(page.locator('[data-where]').first()).toContainText('홈');
    await page
      .locator('[data-frame="desktop"] [data-name="내비게이션"] .st-stack[data-name="제품"]')
      .first()
      .click();
    await page.waitForTimeout(700);

    /*
     * A builder whose preview navigated the browser away from itself is a builder a reader previews
     * once. The address is what the link mark resolved to at draw time and the app knows which page
     * answers it — the same `page:<id>` reference the export publishes as a real `href`.
     */
    await expect(page.locator('[data-where]').first()).toContainText('제품');
  });

  test('is not typable, and Escape is the way out', async ({ page }) => {
    await ready(page);
    await toggle(page).click();
    await page.waitForTimeout(500);

    // Not typable is what makes the links work: a contenteditable element swallows a click on an
    // `<a>` and puts a caret in it instead.
    expect(
      await board(page).evaluate((el) => el.querySelector('[contenteditable]')?.getAttribute('contenteditable'))
    ).toBe('false');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await expect(page.locator('[data-frame="desktop"] .st-overlay')).toHaveCount(1);
    expect(
      await board(page).evaluate((el) => el.querySelector('[contenteditable]')?.getAttribute('contenteditable'))
    ).toBe('true');
  });
});
