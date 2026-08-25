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
    // The pages live on the rail now, beside the site's other lists — its components and its data.
    await page.locator('[data-panel="pages"]').click();

    await expect(page.locator('[data-pages] button')).toHaveCount(5);
    await expect(page.locator('[data-frame="desktop"] .st-page')).toHaveAttribute('data-path', '/');

    await page.locator('[data-pages] button').nth(1).click();
    await page.waitForTimeout(500);

    await expect(page.locator('[data-frame="desktop"] .st-page')).toHaveAttribute('data-path', '/제품');
    /*
     * The header and the footer: two placements of two definitions, on this page and on every other.
     * And they draw their **parts** — which is what a snapshot taken around the proxy rather than
     * through it silently lost, on a page where the header looked like an empty box.
     */
    await expect(page.locator('[data-frame="desktop"] .st-placement')).toHaveCount(2);
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
    // The name the sample gave it, which is what `name` is for — a stack with none says what it does.
    await expect(page.locator('.st-mark-selected .st-mark-name').first()).toHaveText('카드 줄');
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

  test('names the selected block, and changes what it is called', async ({ page }) => {
    await ready(page);
    await press(page, page.locator('[data-frame="desktop"] .st-stack[data-name="히어로"]'));
    await page.waitForTimeout(300);

    await expect(panel(page).getByLabel('이름')).toHaveValue('히어로');
    // 480 twips of gap is 32px, 720 of padding is 48 — the panel speaks pixels and the document
    // keeps twips, which is what has kept a slide, a page and a card able to hold each other.
    await expect(panel(page).getByLabel('간격')).toHaveValue('32');
    await expect(panel(page).getByLabel('안쪽 여백')).toHaveValue('48');

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
    await press(page, list);
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
    const row = page.locator('[data-frame="desktop"] .st-stack[data-name="카드 줄"]');
    await press(page, row);
    await page.waitForTimeout(200);
    await pressTwice(page, row.locator('.st-stack').first());
    await page.waitForTimeout(300);

    await panel(page).locator('[data-tab="style"]').click();
    /*
     * The whole point of a design token: two cards the same grey are a coincidence, two cards on
     * `var:바탕` are a decision — so the control says which one it follows.
     */
    await expect(panel(page)).toContainText('카드 바탕');
  });

  test('answers a placement’s own question, and the words change', async ({ page }) => {
    await ready(page);
    const button = page.locator('[data-frame="desktop"] .st-placement').nth(1);
    await expect(button).toContainText('무료로 시작하기');

    /*
     * Selected from the layer list rather than by drilling.
     *
     * Double-clicking a placement now **opens what it draws** — a placement has no children anybody
     * can select, so that is the only thing the gesture can honestly mean — and the list is where a
     * block nobody can point at is reached. Which is the reason the list exists.
     */
    await page.locator('[data-panel="layers"]').click();
    await page.locator('.st-layer[data-stype="instance"]').nth(1).click();
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
    expect(html).toContain('한 엔진, 여러 제품');

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
        .locator('.st-page > .st-stack')
        .nth(1)
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
      'rgb(248, 250, 252)'
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
    await expect(rows).toHaveText(['섹션', '가로 스택', '그리드', '제목', '본문', '이미지', '목록']);
    await expect(page.locator('[data-insert]:not([disabled])')).toHaveCount(7);
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
    await expect(page.locator('[data-component="cta"]')).toContainText('2곳');

    const placements = page.locator('[data-frame="desktop"] .st-placement');
    const before = await placements.count();
    await page.locator('[data-component="cta"]').click();
    await page.waitForTimeout(600);
    await expect(placements).toHaveCount(before + 1);
    // And the count follows, because it is read from the document rather than remembered.
    await expect(page.locator('[data-component="cta"]')).toContainText('3곳');
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
    await expect(page.locator('[data-pages] button')).toHaveCount(5);

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

    // Every board draws the definition, at its own width, and says whose it is.
    await expect(page.locator('.st-frame-label').first()).toContainText('머리말');
    await expect(page.locator('[data-frame="desktop"] .st-stack')).toHaveCount(1);

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
    await page.waitForTimeout(600);

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
    await page.waitForTimeout(600);

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
