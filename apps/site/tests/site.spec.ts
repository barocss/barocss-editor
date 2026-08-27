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
    await page.locator('[data-control="width-tablet"]').click();
    await expect(page.locator('.st-frame')).toHaveCount(2);
    await expect(page.locator('[data-frame="tablet"]')).toHaveCount(0);

    await page.locator('[data-control="width-tablet"]').click();
    await expect(page.locator('.st-frame')).toHaveCount(3);
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
      '구분선',
      '버튼'
    ]);
    await expect(page.locator('[data-insert]:not([disabled])')).toHaveCount(11);
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
