import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
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
 * **A colour this document names**, asked of the document rather than written into the test.
 *
 * Several checks here held one of the sample's hex values, and a change of palette broke every one
 * of them — none of which is about a colour. What they claim is that a token *resolves*: the rule
 * carries whatever this document says 강조 is, and the day it says something else they should still
 * pass. `rgb(...)` because that is what `getComputedStyle` answers with.
 */
const tokenRgb = async (page: Page, name: string): Promise<string> =>
  await page.evaluate((want) => {
    const editor = (window as never as { editor: any }).editor;
    const store = editor.dataStore;
    let said = '';
    const walk = (sid: string) => {
      const node = store.getNode(sid);
      if (!node || said) return;
      if (node.stype === 'variable' && node.attributes?.name === want) said = String(node.attributes.value);
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId());
    const hex = said.replace('#', '');
    return `rgb(${[0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
  }, name);

/** The same, as the hex a published stylesheet is written in. */
const tokenHex = async (page: Page, name: string): Promise<string> =>
  await page.evaluate((want) => {
    const editor = (window as never as { editor: any }).editor;
    const store = editor.dataStore;
    let said = '';
    const walk = (sid: string) => {
      const node = store.getNode(sid);
      if (!node || said) return;
      if (node.stype === 'variable' && node.attributes?.name === want) said = String(node.attributes.value);
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId());
    return said;
  }, name);

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
      Five: the header, the footer, and the button **inside the header's own definition** — placed
      twice there, once in the wide navigation and once in the menu a phone opens — plus the one the
      page itself carries. A placement of a definition that itself places one is what makes the bar's
      call to action the same button as the hero's.
    */
    await expect(page.locator('[data-frame="desktop"] .st-placement')).toHaveCount(5);
    await expect(page.locator('[data-frame="desktop"] .st-placement h4')).toHaveText('Barocss');
  });
});

test.describe('a narrower width', () => {
  test('draws the same row as a row and as a column, at the same instant', async ({ page }) => {
    await ready(page);

    /*
     * A **grid** now, not a flex row — three columns with the first card across two of them, and one
     * column on a phone. The claim is the one it always was: one document, two arrangements, drawn
     * at the same instant. What changed is the sentence the document uses to say it.
     */
    await expect(cardRow(page, 'desktop')).toHaveCSS('grid-template-columns', /repeat|px/);
    await expect(cardRow(page, 'mobile')).toHaveCSS('display', 'grid');
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

  /**
   * And **`Escape` comes back out**, one level per press, from a selection made any way at all.
   *
   * The rail's own instruction tells a reader how to go in — "한 번 누르면 바깥쪽 블록, 두 번 누르면
   * 그 안쪽입니다" — and nothing told them how to come back, because nothing could. `Escape` was a
   * handler in the app that climbed only while the reader was inside a *drill*; a selection made by
   * a click, the layer list, ⌘A or a paste carried no scope and the key threw the whole thing away.
   *
   * In a browser rather than beside the command's own unit tests, because what is being checked here
   * is that the **key** reaches it — the fault was never in the walk up the tree, it was that the
   * only thing bound to the gesture was undeclared and knew about one case out of five.
   */
  test('Escape comes back out one level at a time, and lets go at the top', async ({ page }) => {
    await ready(page);
    const heading = cardRow(page, 'desktop').locator('h3').first();

    // Down to the card, by the gesture a reader actually uses — the drill the test above walks.
    await press(page, heading);
    await page.waitForTimeout(200);
    for (let step = 0; step < 3; step += 1) {
      await pressTwice(page, heading);
      await page.waitForTimeout(200);
    }
    expect(await selection(page)).toEqual(['frame']);

    const namedNow = async () =>
      await page.locator('.st-mark-selected .st-mark-name').first().textContent();
    const inside = await namedNow();

    /*
     * And back up. Asserted on the **name** rather than on the stype, because every rung of this
     * ladder is a `frame` — a check that only read the type would pass on a key that did nothing.
     */
    const climbed: (string | null)[] = [];
    for (let step = 0; step < 3; step += 1) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      climbed.push(await namedNow());
    }
    expect(climbed[climbed.length - 1]).toBe('카드 줄');
    expect(new Set([inside, ...climbed]).size).toBeGreaterThan(1);

    /*
     * At the top of the page the command refuses, the key is not swallowed, and the app's older
     * meaning takes over: let go of everything. Two behaviours on one key, and the seam between them
     * is `canExecute` rather than a second branch that could disagree with it.
     */
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    expect(await selection(page)).toEqual([]);
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

  /**
   * **담는 곳** — the panel says where a decision it cannot make is made, and gets you there.
   *
   * Measured before it existed, on the sample: select a paragraph and the whole 240px panel held one
   * row, `종류 · 본문`, restating what the reader had just clicked, over six hundred pixels of
   * nothing. That is not a fault in the panel — the schema keeps width off text blocks on purpose,
   * because the renderer that would read it is `office-text`'s and a site does not own it. What was
   * missing is the second half of that same reasoning, which the schema had already written down and
   * the panel had never said: "text sizing is the stack's question, asked one level up."
   *
   * Asserted as a **press** rather than as a row that exists, because the row is only worth anything
   * if it goes somewhere: a breadcrumb that names the parent and cannot reach it is decoration.
   */
  test('names what holds the selected block, and selects it when pressed', async ({ page }) => {
    await ready(page);

    /*
     * The heading named rather than drilled to, because the gesture is the test above's subject and
     * this one's is the panel. Four double-clicks reach it and the fourth enters the text, which is
     * a different state with a different panel.
     */
    await page.evaluate(() => {
      const ed = (window as any).editor;
      const store = ed.dataStore;
      let hit = '';
      const walk = (sid: string) => {
        const n = store.getNode(sid);
        if (!n) return;
        if (!hit && n.stype === 'heading') hit = sid;
        for (const k of n.content ?? []) if (typeof k === 'string') walk(k);
      };
      walk(ed.getRootId());
      ed.executeCommand('setNode', { nodeIds: [hit] });
    });
    await page.waitForTimeout(400);
    expect(await selection(page)).toEqual(['heading']);

    const holder = page.locator('[data-property-panel] [data-property-link]');
    await expect(holder).toBeVisible();
    const named = (await holder.textContent()) ?? '';

    await holder.click();
    await page.waitForTimeout(300);
    // The block the row named is the block that is selected now — the row is a way there, not a label.
    expect(await selection(page)).toEqual(['frame']);
    await expect(page.locator('.st-mark-selected .st-mark-name').first()).toHaveText(
      named.replace(/⎋|Escape/g, '').trim()
    );
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
    /*
     * And the panel marks the property, so the reader can tell this value from the page's own — and
     * the mark is a **control** now rather than a character: pressing it takes this width's value
     * back, which is what the dot had been saying and could not do.
     */
    await expect(
      page.locator('.office-properties').getByRole('button', { name: '간격 되돌리기' })
    ).toBeVisible();
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

  /**
   * **The four corners and the four sides are drawn, not spelled.**
   *
   * They were 상좌 상우 하우 하좌 over four number fields and 상 우 하 좌 over four more — honest,
   * and eight words where a reader is matching a shape rather than reading one. The version before
   * that was `↖ ↗ ↘ ↙`, four arrows standing in for four drawings, which is an icon made out of a
   * character and the one thing this repository has written down about icons.
   *
   * `lucide` has nothing that means *this corner of this box*, so these are the first pictures in
   * `office-icons` that are not a library's. Asserted here rather than in a unit test because what
   * is being claimed is that a reader **sees** a drawing and a screen reader still **hears** the
   * name: an icon with no accessible name is the fault this replaces, not a new one.
   */
  test('draws the corners and the padding sides rather than spelling them', async ({ page }) => {
    await ready(page);
    const hero = page.locator('[data-frame="desktop"] .st-stack[data-name="히어로"]');
    await press(page, hero);
    await page.waitForTimeout(300);
    await panel(page).getByRole('tab', { name: '모양' }).click();

    /*
     * Beside the field rather than in the label column: these four share **one** row and one label —
     * the shape every inspector draws a box's four sides in — so each carries its own short name
     * inside its field. That is where the drawing goes, in place of the word.
     */
    for (const name of ['왼쪽 위 둥글기', '오른쪽 위 둥글기', '오른쪽 아래 둥글기', '왼쪽 아래 둥글기']) {
      const field = panel(page).getByLabel(name);
      await expect(field, name).toHaveCount(1);

      const drawn = field.locator('xpath=preceding-sibling::span[1]');
      await expect(drawn.locator('svg'), name).toHaveCount(1);
      // A picture and no word: the four used to read 상좌 상우 하우 하좌.
      expect((await drawn.innerText()).trim(), name).toBe('');
      // …and the field still carries the words, which is the half a screen reader gets.
      await expect(field).toHaveAttribute('aria-label', name);
    }

    await panel(page).getByRole('tab', { name: '블록' }).click();
    for (const name of ['위쪽 여백', '오른쪽 여백', '아래쪽 여백', '왼쪽 여백']) {
      const field = panel(page).getByLabel(name);
      await expect(field, name).toHaveCount(1);
      await expect(field.locator('xpath=preceding-sibling::span[1]').locator('svg'), name).toHaveCount(1);
      await expect(field).toHaveAttribute('aria-label', name);
    }

    /*
     * And the four sides sit **two to a line**, which is the shape every inspector draws a box's four
     * sides in and the half of this that is not about pictures. The row's own 안쪽 여백 is above
     * them and is a fifth field, so the four are asked about by name rather than by the pattern.
     */
    const tops = await Promise.all(
      ['위쪽 여백', '오른쪽 여백', '아래쪽 여백', '왼쪽 여백'].map((name) =>
        panel(page)
          .getByLabel(name)
          .evaluate((el) => Math.round(el.getBoundingClientRect().top))
      )
    );
    expect(new Set(tops).size).toBe(2);
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
     * The hero's button, found by **where it is** rather than by which number it is.
     *
     * It was `.nth(2)`, because the header places the same definition and the hero's was the third
     * drawn. The day the header grew a second one — the menu a phone opens carries the same call to
     * action — the third placement became a block inside a closed menu, and the test failed by
     * clicking something a reader cannot see. A block is found by what it is, never by where it
     * currently sits.
     */
    const button = page.locator('[data-frame="desktop"] [data-name="히어로 줄"] .st-placement').first();
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
        return { columns: style.gridTemplateColumns.split(' ').length, padding: style.padding, gap: style.gap };
      });
    const wide = await editorSays('desktop');
    const narrow = await editorSays('mobile');
    // Three tracks at 1280 and one at 390 — the trio is a bento now, and it still says two things.
    expect(wide.columns).toBe(3);
    expect(narrow.columns).toBe(1);

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
          return { columns: style.gridTemplateColumns.split(' ').length, padding: style.padding, gap: style.gap };
        });
    };

    expect(await asks(1280)).toEqual(wide);
    expect(await asks(390)).toEqual(narrow);
    await visitor.close();
  });

  /**
   * **열림**, which is the one state a browser has to be asked about.
   *
   * `hover` and `focus` publish as a pseudo-class the browser already answers, and a unit test can
   * read the rule and be satisfied. Being open is a control this product **puts into the page** — a
   * checkbox, a label around whatever the designer drew, and a rule about two elements next to each
   * other — and none of that is true until a browser has laid it out and something has been pressed.
   *
   * At 390 with nothing but the file, which is the whole claim: no script, no framework, a page a
   * visitor could have saved to disk.
   */
  test('opens the phone’s menu, with nothing in the page but the page', async ({ page }) => {
    await ready(page);
    const html = await exported(page, '/');

    const visitor = await page.context().newPage();
    await visitor.setViewportSize({ width: 390, height: 900 });
    await visitor.setContent(html);
    await visitor.waitForTimeout(150);

    const menu = visitor.locator('.st-stack[data-name="모바일 메뉴"]');
    /*
     * Scoped to the header, because the page has **seven** openers now: the hamburger and the six
     * questions of the FAQ. That is the sample wearing what it tests rather than the test being
     * fragile — an unscoped selector was right while the accordion existed only in a unit test.
     */
    const opener = visitor.locator(
      '.st-placement[data-component-id="site-header"] label[for^="st-open-"]'
    );

    // The wide navigation is not on a phone, and the thing that opens the other one is.
    await expect(visitor.locator('.st-stack[data-name="내비게이션"]')).toBeHidden();
    await expect(opener).toBeVisible();
    // Closed: shipped, in the markup, and not drawn — which is the difference between a menu and a
    // draft, and the export cannot tell them apart from `visible: false` alone.
    await expect(menu).toBeHidden();

    await opener.click();
    await visitor.waitForTimeout(150);
    await expect(menu).toBeVisible();
    // And it is a column of the same four pages, as links a visitor can follow.
    await expect(menu.locator('a')).toHaveCount(4);
    await expect(menu.locator('a').first()).toHaveAttribute('href', '/제품');

    // Pressing again closes it: a checkbox remembers, which is why this needs no script at all.
    await opener.click();
    await visitor.waitForTimeout(150);
    await expect(menu).toBeHidden();

    await visitor.close();
  });

  /**
   * And the same gesture from a keyboard, which is the reason the switch sits outside the menu.
   *
   * A checkbox inside the block it opens is inside that block's `display: none`, and an unrendered
   * control is not in the focus order — the menu would open for a pointer and be unreachable by a
   * key. Tabbed to rather than focused by script, because `.focus()` does not raise
   * `:focus-visible` and the ring is half of what is being claimed.
   */
  test('opens from the keyboard, and says what pressing it does', async ({ page }) => {
    await ready(page);
    const html = await exported(page, '/');

    const visitor = await page.context().newPage();
    await visitor.setViewportSize({ width: 390, height: 900 });
    await visitor.setContent(html);
    await visitor.waitForTimeout(150);

    const menu = visitor.locator('.st-stack[data-name="모바일 메뉴"]');
    await expect(menu).toBeHidden();

    /*
     * Tabbed to **the hamburger's** switch by its name, not to the first switch on the page: the FAQ
     * below it has six of its own now, and "the first one a Tab reaches" stopped being a question
     * about the menu the day the sample grew an accordion.
     */
    const focused = async () =>
      await visitor.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return { name: el?.className ?? '', said: el?.getAttribute('aria-label') ?? '' };
      });

    for (let press = 0; press < 60; press += 1) {
      const at = await focused();
      if (at.name.includes('st-open-switch') && at.said === '메뉴 열기') break;
      await visitor.keyboard.press('Tab');
    }
    // A hamburger is three lines and has no words, so the name comes from what the reader called the
    // block. Without it a screen reader announces "checkbox" and nothing else.
    expect(await focused()).toEqual({
      name: expect.stringContaining('st-open-switch'),
      said: '메뉴 열기'
    });

    await visitor.keyboard.press('Space');
    await visitor.waitForTimeout(150);
    await expect(menu).toBeVisible();

    // And the ring is drawn on the block being looked at, because the switch itself is off the page.
    const ring = await visitor
      .locator('.st-placement[data-component-id="site-header"] label[for^="st-open-"]')
      .evaluate((node) => getComputedStyle(node).outlineWidth);
    expect(Number.parseFloat(ring)).toBeGreaterThan(0);

    await visitor.close();
  });

  /**
   * **탭** — the one thing here a unit test cannot settle.
   *
   * Everything about an accordion can be read off the document and the stylesheet. A tab strip's
   * whole claim is that pressing the second tab **closes the first**, and nothing writes that down:
   * it is what a radio group does, and the only way to know a browser is doing it is to press two
   * tabs in a browser and look.
   *
   * At 390 as well, because a tab strip that stops being one on a phone is the commonest way this
   * kind of thing is half-built.
   */
  test('shows one tab at a time, and says which one', async ({ page }) => {
    await ready(page);
    // Made through the rail, which is where a reader finds it — a test that built the tree by hand
    // would be testing the test.
    await page.locator('[data-panel="add"]').click();
    await page.locator('[data-insert="insertTabs"]').click();
    await page.waitForTimeout(600);

    const html = await exported(page, '/');
    const visitor = await page.context().newPage();
    await visitor.setContent(html);
    await visitor.waitForTimeout(150);

    const panel = (n: number) => visitor.locator(`.st-stack[data-name="탭 ${n} 내용"]`);
    const tab = (n: number) => visitor.locator(`label:has(> .st-stack[data-name="탭 ${n}"])`);

    // One already chosen: a tab strip showing nothing is the one state it must never be in.
    await expect(panel(1)).toBeVisible();
    await expect(panel(2)).toBeHidden();
    await expect(panel(3)).toBeHidden();

    // And the chosen one *looks* chosen — the rule that cannot be written as `switch:checked + block`,
    // because the tab is not beside its switch.
    const edge = async (n: number) =>
      await tab(n)
        .locator('> *')
        .evaluate((node) => getComputedStyle(node).borderTopColor);
    expect(await edge(1)).toBe('rgb(15, 122, 90)');
    expect(await edge(2)).not.toBe('rgb(15, 122, 90)');

    await tab(2).click();
    await visitor.waitForTimeout(150);

    // The whole claim: choosing the second closed the first, and nothing wrote that down.
    await expect(panel(2)).toBeVisible();
    await expect(panel(1)).toBeHidden();
    expect(await edge(2)).toBe('rgb(15, 122, 90)');
    expect(await edge(1)).not.toBe('rgb(15, 122, 90)');

    // And on a phone, where this kind of thing is most often half-built.
    await visitor.setViewportSize({ width: 390, height: 900 });
    await visitor.waitForTimeout(150);
    await tab(3).click();
    await visitor.waitForTimeout(150);
    await expect(panel(3)).toBeVisible();
    await expect(panel(2)).toBeHidden();

    await visitor.close();
  });

  /**
   * **아코디언** — the same two blocks with the switch left alone.
   *
   * The claim is the opposite one and just as unwriteable: three answers open **independently**, so
   * a visitor can have all three at once. A checkbox does that by being a checkbox.
   */
  test('opens as many answers as a visitor asks for', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="add"]').click();
    await page.locator('[data-insert="insertAccordion"]').click();
    await page.waitForTimeout(600);

    const html = await exported(page, '/');
    const visitor = await page.context().newPage();
    await visitor.setContent(html);
    await visitor.waitForTimeout(150);

    const item = (n: number) => visitor.locator('.st-stack[data-name="항목"]').nth(n);
    const answer = (n: number) => item(n).locator('.st-stack[data-name="답"]');
    const question = (n: number) => item(n).locator('label');

    for (const n of [0, 1, 2]) await expect(answer(n)).toBeHidden();

    await question(0).click();
    await question(2).click();
    await visitor.waitForTimeout(150);

    // Two open at once, which is the difference from a tab strip and the whole of it.
    await expect(answer(0)).toBeVisible();
    await expect(answer(1)).toBeHidden();
    await expect(answer(2)).toBeVisible();

    // And each closes on its own — a checkbox can be unpressed where a radio cannot.
    await question(0).click();
    await visitor.waitForTimeout(150);
    await expect(answer(0)).toBeHidden();
    await expect(answer(2)).toBeVisible();

    await visitor.close();
  });

  /**
   * **A header that follows the page**, which is the first thing anybody tries on a site builder and
   * the thing this product could not do at all until `position.ts`.
   *
   * Only a browser can settle it. `position: sticky` is the property most often written correctly
   * and defeated by something else on the page — an ancestor that clips, a stacking context from an
   * opacity nobody set, a parent with no height — and every one of those failures leaves a valid
   * stylesheet. So this scrolls the page and asks where the header actually is.
   */
  test('keeps the header at the top while the page moves under it', async ({ page }) => {
    await ready(page);
    const html = await exported(page, '/');

    const visitor = await page.context().newPage();
    await visitor.setViewportSize({ width: 1280, height: 800 });
    await visitor.setContent(html);
    await visitor.waitForTimeout(150);

    /*
     * The **placement**, not the stack inside it — see `renderers.ts`. A block inside a definition
     * has the placement's box as its parent, and that box is exactly that block's height, so sticky
     * there has nowhere to travel. Written the other way round first, and it failed by scrolling
     * away with the page while the stylesheet said `position: sticky`.
     */
    const head = visitor.locator('.st-placement[data-component-id="site-header"]').first();
    const topOf = async () => ((await head.boundingBox())?.y ?? -1);

    expect(await topOf()).toBeCloseTo(0, 0);

    await visitor.evaluate(() => window.scrollTo(0, 1200));
    await visitor.waitForTimeout(200);

    // Still at the top — and the page really did move, or this would pass on a page that cannot
    // scroll at all.
    expect(await visitor.evaluate(() => window.scrollY)).toBeGreaterThan(600);
    expect(await topOf()).toBeCloseTo(0, 0);

    /*
     * And **over** what it passes, which is the second half and a separate failure: a sticky header
     * that scrolls under the hero picture is a header nobody can read. One number.
     */
    expect(
      await head.evaluate((node) => getComputedStyle(node).zIndex)
    ).toBe('10');

    await visitor.close();
  });

  /**
   * **A form**, on the board and in the page — the one place the two drawings are allowed to differ.
   *
   * Every other difference between what a designer sees and what a visitor gets is a *removal* the
   * export makes afterwards. This one is deliberate and goes the other way: a designer arranging a
   * form must not be able to send a stranger a message, so the board's `<form>` has no address, its
   * fields are read-only and its button is disabled. A browser is the only thing that can be asked
   * whether that is actually true, because "read-only" is a fact about typing.
   */
  test('is arrangeable on a board and sendable on the page, and not the other way round', async ({
    page
  }) => {
    await ready(page);
    await page.locator('[data-panel="add"]').click();
    await page.locator('[data-insert="insertForm"]').click();
    await page.waitForTimeout(600);

    // On the board: a real form, and nothing about it can be used.
    const board = page.locator('[data-frame="desktop"] .st-form').first();
    await expect(board).toBeVisible();
    expect(await board.evaluate((node) => node.getAttribute('action'))).toBeNull();
    expect(
      await board.locator('input').first().evaluate((node) => (node as HTMLInputElement).readOnly)
    ).toBe(true);
    expect(
      await board.locator('button').first().evaluate((node) => (node as HTMLButtonElement).disabled)
    ).toBe(true);

    /*
     * The address is on a **connection**, not on the form — so five forms on a site are five
     * references to one place rather than five copies of an address. Changed through the panel, from
     * the form, because that is where a reader is when the question comes up.
     *
     * The form is already selected: an insert selects what it made.
     */
    const properties = page.locator('.office-properties');
    await properties.locator('[role="tab"]', { hasText: '블록' }).click();
    await page.waitForTimeout(250);
    /*
     * Located by its **name** rather than by `getByLabel`, which finds form controls: this one is a
     * listbox trigger, not a `<select>`. Two kinds of picker in one panel is worth knowing and is
     * written down in `BACKLOG.md` — the panel's own "every control writes something" sweep reaches
     * only the `<select>` half.
     */
    await expect(properties.locator('[aria-label="보낼 곳 연결"]')).toContainText('문의 받는 곳');

    await properties.getByLabel('연결 주소').fill('https://example.com/f');
    await properties.getByLabel('연결 주소').press('Enter');
    await page.waitForTimeout(400);

    /*
     * And the sample's own contact form goes with it, because it names the same connection. That is
     * the whole point of the name and it is worth measuring rather than asserting in prose: one edit
     * reached a form on a different page.
     */
    await expect(properties.locator('.st-uses')).toContainText('폼 2개');

    const html = await exported(page, '/');
    const visitor = await page.context().newPage();
    await visitor.setContent(html);
    await visitor.waitForTimeout(150);

    const live = visitor.locator('.st-form').first();
    await expect(live).toHaveAttribute('action', 'https://example.com/f');
    await expect(live).toHaveAttribute('method', 'post');

    // Typable, and the browser knows what kind of answer each one is.
    await live.locator('input[name="name"]').fill('박진호');
    expect(await live.locator('input[name="name"]').inputValue()).toBe('박진호');
    await expect(live.locator('input[name="email"]')).toHaveAttribute('type', 'email');

    /*
     * And the browser's **own** validation, which is most of what making it a real `<form>` buys: an
     * empty required field and a malformed address are both refused before anything is sent, with no
     * code of ours anywhere.
     */
    await live.locator('input[name="email"]').fill('notanemail');
    expect(
      await live.locator('input[name="email"]').evaluate((node) => (node as HTMLInputElement).checkValidity())
    ).toBe(false);
    expect(await live.evaluate((node) => (node as HTMLFormElement).checkValidity())).toBe(false);

    await visitor.close();
  });

  /**
   * **The sample wearing what the product can now do**, measured in a browser.
   *
   * Three things it could not draw a day ago and now does, and each one is checked as a *visitor*
   * would meet it rather than as a document: an answer that is not on the page until it is asked
   * for, a form a browser will actually send, and a label that is over the box it belongs to.
   *
   * This is the fixture argument stated once more. The FAQ was four cards in a grid because a page
   * with no 열림 has no other drawing for it; the contact section was a button that opened a mail
   * client; and nothing anywhere overlapped anything. All three were *designs forced by a missing
   * schema*, and a sample that keeps them is a sample that cannot find the next gap either.
   */
  test('takes a value back at one width, and says nothing at another', async ({ page }) => {
    /*
     * Two gestures that were one, and only a browser can tell them apart — because the difference is
     * not in what is drawn, it is in **what happens next**: a width that says *the same as the page*
     * follows the page when it changes, and one that has been given the same number by hand does not.
     */
    await ready(page);
    await pressDeepAt(page, cardRow(page, 'desktop').locator('.st-stack').first());
    await page.waitForTimeout(300);

    const attrs = () =>
      page.evaluate(() => {
        const editor = (window as never as { editor: any }).editor;
        const node = editor.dataStore.getNode(editor.selection?.nodeIds?.[0]);
        return JSON.stringify(node?.attributes ?? {});
      });

    const properties = page.locator('.office-properties');
    await properties.locator('[role="tab"]', { hasText: '블록' }).click();
    await page.waitForTimeout(200);

    // A value on the page itself, so there is something for a narrower width to disagree with.
    await properties.getByLabel('최대 폭').fill('600');
    await properties.getByLabel('최대 폭').press('Enter');
    await page.waitForTimeout(300);
    expect(JSON.parse(await attrs()).maxWidth).toBe(600 * 15);

    // Now at 390, and emptied: **nothing at this width**.
    await page.locator('.st-at [data-at="mobile"]').click();
    await page.waitForTimeout(300);
    await properties.getByLabel('최대 폭').fill('');
    await properties.getByLabel('최대 폭').press('Enter');
    await page.waitForTimeout(400);

    /*
     * `null`, not a number chosen to mean nothing — which is what the sample itself had been writing
     * (`minWidth: 0` in three places) for want of a way to say this.
     */
    expect(JSON.parse(await attrs()).overrides?.mobile).toMatchObject({ maxWidth: null });

    // Drawn as no cap at all on the phone, and still 600 on the page.
    const capOf = async (frame: string) =>
      await page
        .locator(`[data-frame="${frame}"] .st-stack[data-name="제품 셋"] .st-stack`)
        .first()
        .evaluate((node) => getComputedStyle(node).maxWidth);
    expect(await capOf('mobile')).toBe('none');
    expect(await capOf('desktop')).toBe('600px');

    /*
     * And the other gesture: the mark beside the label, which takes this **width's** statement back
     * rather than saying there is nothing here. The row is marked because the width owns a value —
     * which is exactly what the mark was drawn to say and could not undo.
     */
    await properties.getByRole('button', { name: '최대 폭 되돌리기' }).click();
    await page.waitForTimeout(400);
    expect(JSON.parse(await attrs()).overrides?.mobile?.maxWidth).toBeUndefined();
    expect(await capOf('mobile')).toBe('600px');
  });

  /**
   * **What a value is, and how it reads** — two things that were one string.
   *
   * The best-shaped fault this package has found: a card's question was answered with a string and
   * drawn exactly as stored, so the only way to make a price read as `월 9,900원` was to *store*
   * those words. The pricing page sorts by that column, so it had been showing the wrong three plans
   * in the wrong order in a real browser for as long as it existed — and looking completely fine.
   *
   * Held here as well as in the unit suite because the claim is about what a **visitor** sees: the
   * order on the page and the words in the card, which is where the two halves have to meet.
   */
  test('shows the plans in the order they cost, and reads them the way a person says them', async ({
    page
  }) => {
    await ready(page);
    const html = await exported(page, '/가격');

    const visitor = await page.context().newPage();
    await visitor.setViewportSize({ width: 1280, height: 900 });
    await visitor.setContent(html);
    await visitor.waitForTimeout(200);

    const cards = visitor.locator('.st-collection > .st-placement');
    await expect(cards).toHaveCount(3);
    // The three most expensive, descending — which is what `sortBy: 가격, desc, limit: 3` says and
    // what the page was not doing.
    await expect(cards.locator('h3')).toHaveText(['스위트', '덱', '문서']);

    /*
     * And the number reads as a price, from `9900` in the data plus `월 #,##0원` on the card. The
     * data can be sorted and the reader gets words: before, one of those had to be given up.
     */
    await expect(cards.first()).toContainText('월 19,900원');
    await expect(cards.first()).not.toContainText('19900');

    await visitor.close();
  });

  test('reads a date the way a person writes it, and lets the card say which way', async ({ page }) => {
    await ready(page);

    const blog = await exported(page, '/블로그');
    const visitor = await page.context().newPage();
    await visitor.setContent(blog);
    await visitor.waitForTimeout(200);

    // The column stays ISO — the one date format that sorts as text, which is what makes the feed a
    // feed — and the reader is shown what somebody would say out loud.
    await expect(visitor.locator('.st-collection').first()).toContainText('2026년 8월 2일');
    await expect(visitor.locator('.st-collection').first()).not.toContainText('2026-08-02');
    await visitor.close();

    /*
     * And the card's **default** is a real date now, where it was the empty string.
     *
     * A card's default is what it draws when nobody has answered — which is exactly what a designer
     * sees when they open the definition — and a date slot showing nothing reads as a card that is
     * broken rather than as one waiting for data.
     *
     * That a reader can *change* the format is held in `panel-model.test.ts` and
     * `component-vars.test.ts`: the two rows and the command. What only a browser can settle is what
     * is above — that the order on the page and the words in the card are both right at once, which
     * is the pair that could not be had before.
     */
    await page.locator('[data-panel="components"]').click();
    await page.locator('[data-component="post-row"]').click();
    await page.waitForTimeout(700);
    await expect(page.locator('[data-frame="desktop"]')).toContainText('2026년 1월 1일');
  });

  /**
   * **Putting a file in the document** — the gesture a site builder could not make at all.
   *
   * A `picture` carried a `src` string and nothing anywhere could put bytes in one; the sample got
   * away with it by drawing its art as SVG data URIs, which is a thing a product's author can do and
   * a reader cannot. Adding a photograph was impossible, which is the second most common thing
   * anybody does on a page after writing on it.
   *
   * Only a browser can settle this one: the file is read by a `FileReader`, its size by decoding it,
   * and the claim is that a **board draws the bytes** while a **published page points at a file** —
   * the two halves of one drawing, and neither is visible from the model alone.
   */
  /**
   * **The links in a published site point at files that are there.**
   *
   * Measured and they did not. A link resolves to a page's address — `/제품` — and publishing wrote
   * `제품.html`, so every link on the site was broken on every host that does not quietly try `.html`
   * for you. It looked completely fine in the editor, because the editor follows the *reference*
   * rather than the file: the one thing an editor structurally cannot see about a published page.
   *
   * `제품/index.html` is the answer, which is a folder, which is why a site is one archive now.
   */
  test('names every page so the links it publishes actually resolve', async ({ page }) => {
    await ready(page);

    const published = await page.evaluate(async () => {
      const editor = (window as never as { editor: any }).editor;
      let got: any;
      await editor.executeCommand('exportSite', { write: (one: unknown) => (got = one) });
      return got.pages.map((one: any) => ({ path: one.path, file: one.file, html: one.html }));
    });

    // The home page is the root; everything else is a folder with an `index.html` in it.
    expect(published.find((one: any) => one.path === '/').file).toBe('index.html');
    expect(published.find((one: any) => one.path === '/제품').file).toBe('제품/index.html');

    /*
     * And the check that matters: **every address the site links to is a page the publish wrote.**
     * A relative `href` is resolved against the page's own address, which is exactly what a browser
     * does — and what makes `/제품` either a file or a 404.
     */
    const addresses = new Set(published.map((one: any) => one.path));
    const links = [
      ...published[0].html.matchAll(/<a[^>]*href="([^"]*)"/g)
    ].map((one: any) => one[1] as string);

    const inside = links.filter((one) => one.startsWith('/'));
    expect(inside.length).toBeGreaterThan(3);
    for (const one of inside) expect([...addresses]).toContain(one);
  });

  /**
   * **A table**, which was deliberately left out and should not have been.
   *
   * The kit's own note said *"a table on a page is a layout decision a stack usually makes better"*.
   * Half of that is right and the half that was wrong cost more: a **comparison** is tabular —
   * features down the side, plans across the top, a header row a screen reader announces per cell —
   * and a stack faking one is exactly the fault the argument was trying to avoid, built by hand and
   * wrong on a phone.
   *
   * The drawing was never the missing part: `bTable` renders a real `<table>` everywhere in this
   * suite. What was missing was the commands and the surfaces.
   */
  test('makes a table a screen reader can read, and grows it from the menu', async ({ page }) => {
    await ready(page);

    await page.locator('[data-panel="add"]').click();
    await page.locator('[data-insert="insertTableBlock"]').click();
    await page.waitForTimeout(600);

    const table = page.locator('[data-frame="desktop"] table').first();
    await expect(table).toBeVisible();
    const rows = () => table.locator('tr');
    const before = await rows().count();

    /*
     * Grown from the **menu**, because a row that goes above *this cell* is not a value a panel row
     * could write — which is where every word processor puts these and why.
     */
    /*
     * The caret into a cell, which is what the eight commands ask of a selection — and `force`,
     * because the layer that owns the pointer is always over the page here, on purpose.
     */
    await pressTwice(page, table.locator('td, th').first());
    await page.waitForTimeout(400);
    await page.locator('[data-menu="table"]').click({ force: true });
    await page.locator('[data-menu-item="table.rows.1"]').click();
    await page.waitForTimeout(500);
    await expect(rows()).toHaveCount(before + 1);

    /*
     * And it publishes as a **table**: a real `<table>` with `<th>` in it, which is the whole reason
     * this is not a stack of rows. A screen reader reads a cell with the name of its column; a grid
     * of divs reads as a wall of words.
     */
    const html = await exported(page, '/');
    expect(html).toContain('<table');
    expect(html).toContain('<th');
  });

  test('takes a file, draws it on the board, and publishes it as its own file', async ({ page }) => {
    await ready(page);

    // A one-pixel PNG, which is the smallest thing that is honestly a file.
    const DOT =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    /*
     * The hero's picture, and **not** the first `img` on the page: the first is the wordmark inside
     * the header's placement, and ⌘-click on a part of a placement selects the placement — a
     * placement's parts are not selectable, which is the whole reason a component is one thing.
     */
    const picture = page.locator(
      '[data-frame="desktop"] img.st-picture[alt="문서와 덱과 페이지가 한 화면에 놓인 그림"]'
    );
    await pressDeepAt(page, picture);
    await page.waitForTimeout(300);

    const properties = page.locator('.office-properties');
    await properties.locator('[role="tab"]', { hasText: '모양' }).click();
    await page.waitForTimeout(250);

    /*
     * Through the file input a reader would use, with the bytes handed to it the way a browser hands
     * a chosen file over. `setInputFiles` is the closest a test gets to a person choosing one.
     */
    await properties.locator('input[type="file"]').setInputFiles({
      name: '로고.png',
      mimeType: 'image/png',
      buffer: Buffer.from(DOT, 'base64')
    });
    await page.waitForTimeout(700);

    // On the board: the bytes, because a board has no server to ask.
    await expect(picture).toHaveAttribute('src', /^data:image\/png;base64,/);
    /*
     * And the file's own size on the element, which is what stops every word under an image jumping
     * down as it arrives — a builder that stores only a URL cannot know it.
     */
    await expect(picture).toHaveAttribute('width', '1');

    /*
     * And in the published site: a **path**, and the bytes written once beside the pages. Inlining a
     * logo used on five pages would be its bytes five times, and a photograph in the middle of the
     * HTML delays the first paint by exactly as long as it takes to download.
     */
    const published = await page.evaluate(async () => {
      const editor = (window as never as { editor: any }).editor;
      let got: any;
      await editor.executeCommand('exportSite', { write: (one: unknown) => (got = one) });
      return {
        html: got.pages[0].html as string,
        files: got.files.map((one: any) => ({ file: one.file, bytes: !!one.bytes }))
      };
    });

    expect(published.files).toContainEqual({ file: 'assets/로고.png', bytes: true });
    expect(published.html).toContain('assets/로고.png');
    expect(published.html).not.toContain(DOT);
  });

  /**
   * **The same picture, smaller** — made when the file arrives, and only a browser can make them.
   *
   * The single largest cost of a page built with a tool like this is a photograph taken at 4000 pixels
   * and sent, whole, to a phone that is 390 wide. Resizing needs a canvas, so this is the app's — the
   * same line it draws about reading the file at all — and what it produces cannot be seen from the
   * model.
   */
  test('makes smaller copies of a large picture, and lets the browser choose', async ({ page }) => {
    await ready(page);

    // A 2000×1000 PNG, drawn here rather than checked in: a fixture that is a real photograph is a
    // megabyte in the repository for a fact that one gradient states just as well.
    const wide = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 2000;
      canvas.height = 1000;
      const context = canvas.getContext('2d')!;
      const fill = context.createLinearGradient(0, 0, 2000, 0);
      fill.addColorStop(0, '#0F7A5A');
      fill.addColorStop(1, '#FFFFFF');
      context.fillStyle = fill;
      context.fillRect(0, 0, 2000, 1000);
      return canvas.toDataURL('image/png').split(',')[1];
    });

    const picture = page.locator(
      '[data-frame="desktop"] img.st-picture[alt="문서와 덱과 페이지가 한 화면에 놓인 그림"]'
    );
    await pressDeepAt(page, picture);
    await page.waitForTimeout(300);

    const properties = page.locator('.office-properties');
    await properties.locator('[role="tab"]', { hasText: '모양' }).click();
    await page.waitForTimeout(250);
    await properties.locator('input[type="file"]').setInputFiles({
      name: '사진.png',
      mimeType: 'image/png',
      buffer: Buffer.from(wide, 'base64')
    });
    await page.waitForTimeout(1500);

    const made = await page.evaluate(() => {
      const editor = (window as never as { editor: any }).editor;
      const root = editor.dataStore.getNode(editor.getRootId());
      for (const child of root.content ?? []) {
        const box = editor.dataStore.getNode(child);
        if (box?.stype !== 'resources') continue;
        for (const one of box.content ?? []) {
          const node = editor.dataStore.getNode(one);
          if (node?.stype === 'asset' && node.attributes?.name === '사진') {
            return {
              width: node.attributes.width,
              sizes: (node.attributes.sizes ?? []).map((s: any) => s.width)
            };
          }
        }
      }
      return undefined;
    });

    expect(made?.width).toBe(2000);
    /*
     * 640 and 1280 — and **not 1920**, because the file is 2000 wide and making a picture bigger is a
     * larger download of a blurrier image, which is the one thing worse than sending the original.
     */
    expect(made?.sizes).toEqual([640, 1280]);

    // And the published page hands the browser the list, each rendition its own file.
    const published = await page.evaluate(async () => {
      const editor = (window as never as { editor: any }).editor;
      let got: any;
      await editor.executeCommand('exportSite', { write: (one: unknown) => (got = one) });
      return { html: got.pages[0].html as string, files: got.files.map((one: any) => one.file) };
    });

    expect(published.html).toContain('assets/사진-640.png 640w');
    expect(published.files).toContain('assets/사진-1280.png');
  });

  test('draws the sample’s own accordion, form and overlap the way a visitor meets them', async ({
    page
  }) => {
    await ready(page);
    const html = await exported(page, '/');

    const visitor = await page.context().newPage();
    await visitor.setViewportSize({ width: 1280, height: 900 });
    await visitor.setContent(html);
    await visitor.waitForTimeout(200);

    /*
     * **The FAQ.** Six questions where four fitted, because the answers are folded away — which is
     * what let the two people actually ask about (the price, the lock-in) onto the list.
     */
    const questions = visitor.locator('.st-stack[data-name$=" 묻기"]');
    await expect(questions).toHaveCount(6);

    const answer = visitor.locator('.st-stack[data-name="무료로 어디까지 되나요 답"]');
    await expect(answer).toBeHidden();
    await visitor.locator('label:has(> [data-name="무료로 어디까지 되나요 묻기"])').click();
    await visitor.waitForTimeout(150);
    await expect(answer).toBeVisible();

    // No 하나만 on this one, deliberately: a reader comparing two answers can have both open.
    const second = visitor.locator('.st-stack[data-name="만든 사이트는 제 것인가요 답"]');
    await visitor.locator('label:has(> [data-name="만든 사이트는 제 것인가요 묻기"])').click();
    await visitor.waitForTimeout(150);
    await expect(second).toBeVisible();
    await expect(answer).toBeVisible();

    await visitor.close();
  });

  test('sends the sample’s contact form, and draws its badge over the box', async ({ page }) => {
    await ready(page);

    const about = await exported(page, '/소개');
    const visitor = await page.context().newPage();
    await visitor.setViewportSize({ width: 1280, height: 900 });
    await visitor.setContent(about);
    await visitor.waitForTimeout(200);

    /*
     * **The form.** It was a heading and a button that opened a mail client, which loses everybody on
     * a phone with none set up. A real `<form>` means the browser checks the answers and the Enter
     * key sends it, with nothing of ours in between — and *that* is the claim, so it is measured by
     * filling the thing in and asking the browser whether it would send.
     */
    const form = visitor.locator('.st-form[data-name="연락 폼"]');
    await expect(form).toHaveAttribute('method', 'post');
    await expect(form.locator('textarea')).toHaveCount(1);

    const valid = async () =>
      await form.evaluate((node) => (node as HTMLFormElement).checkValidity());

    await form.locator('input[name="email"]').fill('그냥글자');
    expect(await valid()).toBe(false);
    await form.locator('input[name="name"]').fill('박진호');
    await form.locator('input[name="email"]').fill('jinho@example.com');
    await form.locator('textarea[name="message"]').fill('문서 모델이 궁금합니다.');

    /*
     * Still refused: a **list nobody has chosen from** and a **consent nobody has ticked**. Both are
     * `required` and both are the browser's own check — no code of ours, in the visitor's language,
     * with scripts off.
     */
    expect(await valid()).toBe(false);
    await form.locator('select[name="topic"]').selectOption('버그 제보');
    expect(await valid()).toBe(false);
    await form.locator('input[name="consent"]').check();
    expect(await valid()).toBe(true);

    /*
     * And the tick's **words** are the target, not the 14-pixel square: clicking the sentence toggles
     * it, which is what wrapping the label buys and pointing at it does not.
     */
    await form.locator('.st-tick .st-label').click();
    expect(await form.locator('input[name="consent"]').isChecked()).toBe(false);

    await visitor.close();

    /*
     * **The overlap.** The first thing on this site that leaves its box: a label lifted out of the
     * corner it belongs to, which every pricing page has and this one could not draw.
     *
     * Measured as a *position* rather than as a stylesheet: the badge's top edge has to be above the
     * box's, which is the whole claim and the one a `position: absolute` that silently resolved
     * against the page would also satisfy — so the horizontal offset is checked too.
     */
    const pricing = await exported(page, '/가격');
    const two = await page.context().newPage();
    await two.setViewportSize({ width: 1280, height: 900 });
    await two.setContent(pricing);
    await two.waitForTimeout(200);

    const box = two.locator('.st-stack[data-name="추천"]');
    const badge = two.locator('.st-stack[data-name="추천 배지"]');
    const outer = await box.boundingBox();
    const inner = await badge.boundingBox();

    expect(inner!.y).toBeLessThan(outer!.y);
    /*
     * Against **the box**, not the page — 24px in, plus the box's own 2px border.
     *
     * An inset is measured from the **padding box**, which is inside the border, so a badge asked for
     * 24 sits 26 from the outer edge. Written as 24 first and measured as 26: worth keeping as the
     * number rather than loosening the assertion, because it is the difference between a placement
     * that resolved against this box and one that resolved against the page.
     */
    expect(inner!.x - outer!.x).toBeCloseTo(26, 0);
    // And over the box's own border, which is drawn on the same pixels.
    expect(await badge.evaluate((node) => getComputedStyle(node).zIndex)).toBe('1');

    await two.close();
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
    /*
     * The **browser's** tooltip here, and only here. A disabled button receives no pointer events, so
     * the suite's tooltip never opens on one — and this is exactly the case where a control most
     * needs to say something. A native `title` still shows on a disabled control everywhere.
     */
    /*
     * The **browser's** tooltip here, and only here. A disabled button receives no pointer events, so
     * the suite's own tooltip never opens on one — and this is exactly the case where a control most
     * needs to say something. A native `title` still shows on a disabled control everywhere.
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

/**
 * **Selecting text on a page**, which the model never knew about.
 *
 * `editor._viewDOM` is one slot and holds whichever view was created last. A page is drawn at three
 * widths and the app mounts a fourth view of the whole document, so the selection handler compared
 * the reader's caret against a content layer it was never in, decided the selection was *outside the
 * editor*, and returned.
 *
 * What that cost: **`editor.selection` never moved.** Wherever a reader clicked or dragged, the model
 * held the collapsed caret that entering text had put there — so every command needing a range was
 * unavailable. 굵게, 기울임, 복사, 잘라내기 and the link picker were all permanently grey, each of
 * them correct at its own end, and nothing reported it because every `canExecute` was answering
 * honestly about a selection that was genuinely collapsed.
 *
 * The handler already carried the view it belongs to, with a comment about this exact hazard. One
 * place had not been changed to use it.
 */
test.describe('selecting text on a page', () => {
  const model = (page: Page) =>
    page.evaluate(() => {
      const one = (window as any).editor.selection;
      return one ? { start: one.startOffset, end: one.endOffset, collapsed: one.collapsed } : null;
    });

  const intoText = async (page: Page) => {
    const heading = page.locator('[data-frame="desktop"] .st-page h1').first();
    await heading.click({ force: true, modifiers: ['Meta'] });
    await page.waitForTimeout(300);
    await heading.dblclick({ force: true });
    await page.waitForTimeout(400);
    return heading;
  };

  test('puts the caret where the reader pressed, not at the start', async ({ page }) => {
    await ready(page);
    const heading = await intoText(page);

    const box = (await heading.boundingBox())!;
    await page.mouse.click(box.x + 180, box.y + box.height / 2);
    await page.waitForTimeout(400);

    // Well into the words. It was 0 wherever a reader pressed, which is a caret the model invented.
    expect((await model(page))!.start).toBeGreaterThan(2);
  });

  test('extends with the keyboard and with a drag', async ({ page }) => {
    await ready(page);
    const heading = await intoText(page);
    const box = (await heading.boundingBox())!;

    await page.mouse.click(box.x + 60, box.y + box.height / 2);
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(300);
    expect((await model(page))!.collapsed).toBe(false);

    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = (await model(page))!;
    expect(after.collapsed).toBe(false);
    expect(after.end - after.start).toBeGreaterThan(3);
  });

  /**
   * **What a word looks like** — the group a page builder had none of.
   *
   * The site registers `toggleBold`, `toggleItalic`, `toggleUnderline` and `toggleStrikeThrough` and
   * offered **not one of them**, on the toolbar or in the panel. A page builder where a word cannot
   * be made bold is not one, and the gap was invisible for as long as text could not be selected at
   * all: every one of them was correctly refusing a collapsed caret, and nothing counts a *shared
   * kit's* command as something this product owes a control.
   */
  test('offers the four a reader reaches for mid-sentence, once there are words', async ({ page }) => {
    await ready(page);
    // Nothing selected: these mean nothing to a reader holding a block, which is most of the time.
    await expect(page.locator('[data-group="text"]')).toHaveCount(0);

    const heading = await intoText(page);
    const box = (await heading.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    await expect(page.locator('[data-group="text"]')).toHaveCount(1);
    await expect(page.locator('[data-control="toggleBold"]')).toBeEnabled();
  });

  test('makes a word bold, and says so on the button afterwards', async ({ page }) => {
    await ready(page);
    const heading = await intoText(page);
    const box = (await heading.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const bold = page.locator('[data-control="toggleBold"]');
    await expect(bold).toHaveAttribute('data-state', 'off');
    await bold.click();
    await page.waitForTimeout(600);

    /*
     * On the page and on the button. A pressed toggle that does not follow the document is a button
     * that lies after an undo, which is why the state is re-read from the selection rather than
     * remembered.
     */
    // `mark-bold`, which is what `office-text` draws a mark as — the same span in all three products.
    await expect(page.locator('[data-frame="desktop"] .st-page .mark-bold')).not.toHaveCount(0);
    await expect(bold).toHaveAttribute('data-state', 'on');
  });

  test('makes the commands that need a range available at last', async ({ page }) => {
    await ready(page);
    const heading = await intoText(page);
    const box = (await heading.boundingBox())!;

    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    /*
     * The whole point of the fix, and the shape of the fault: three unrelated features were each
     * refusing correctly, and the thing they had in common was a selection nobody was updating.
     */
    for (const command of ['toggleBold', 'copy', 'cut']) {
      expect(
        await page.evaluate((one) => (window as any).editor.canExecuteCommand(one), command),
        command
      ).toBe(true);
    }
    expect(
      await page.evaluate(() => (window as any).editor.canExecuteCommand('linkToPage'))
    ).toBe(true);
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
      // Two containers a visitor **opens**, which is what they are — a reader puts things inside
      // them, and the only difference between the pair is whether more than one may be open.
      '아코디언',
      '탭',
      // The one block on an ordinary site that had no node behind it until now.
      '폼',
      '제목',
      '본문',
      '이미지',
      '목록',
      '번호 목록',
      '인용',
      // Back on the rail: a code block can be typed into now that Enter inside one is a newline.
      '코드',
      '구분선',
      /*
       * A **table**, and a block rather than a container — a comparison is tabular and a section is
       * not, and offering a table where the arrangements are is the fastest way to teach a reader
       * the wrong one. Beside the rule, which is where it is declared.
       */
      '표',
      '버튼'
    ]);
    await expect(page.locator('[data-insert]:not([disabled])')).toHaveCount(16);
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
    // Seven: twice on the home page, twice in the header's own definition — the wide navigation and
    // the menu a phone opens — and once on each of three others.
    await expect(page.locator('[data-component="cta"]')).toContainText('7곳');

    const placements = page.locator('[data-frame="desktop"] .st-placement');
    const before = await placements.count();
    await page.locator('[data-component="cta"]').click();
    await page.waitForTimeout(600);
    await expect(placements).toHaveCount(before + 1);
    // And the count follows, because it is read from the document rather than remembered.
    await expect(page.locator('[data-component="cta"]')).toContainText('8곳');
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
     * Sixteen stacks, not one: the head, the bar inside it, the mark beside the wordmark, the row of
     * links, the button the row ends with — a navigation bar once its ends are pushed apart rather
     * than left to a spacer — and **each of the four links**, which became boxes rather than words
     * when they were given a hover to hold. That turned out to be the same fix as giving a thumb
     * something to hit: a 14-pixel-tall target where a guideline asks for 44, and nowhere for paint
     * to live, were one fault about structure rather than two about styling.
     *
     * And then the phone's half of the same navigation: the hamburger, **the three rules it is drawn
     * with**, the menu it opens, and the four links again. A designer opening the definition can edit
     * both — which is why the header is one root with two rows in it rather than two roots
     * (`sample-site.ts`).
     *
     * The three rules are the payoff for `minHeight`: the mark used to be an SVG, because a box with
     * nothing in it was a box of no height and three of them were three nothings.
     */
    await expect(page.locator('.st-frame-label').first()).toContainText('머리말');
    await expect(page.locator('[data-frame="desktop"] .st-stack')).toHaveCount(20);

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
    await expect(page.locator('[data-frame="desktop"] .st-placement')).toHaveCount(4);
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
    await expect(dialog).toContainText('링크 3개가 끊어집니다');

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
    await expect(links).toHaveCount(11);
    await expect(links.first()).not.toHaveAttribute('href', /./);
    await expect(links.nth(1)).toHaveAttribute('href', '/가격');
    // And the menu's and the footer's links to the same page are gone too, because all three named
    // it. Three drawings of one broken link, which is why the dialog counts the *links* rather than
    // the places they are drawn.
    await expect(links.nth(4)).not.toHaveAttribute('href', /./);
    await expect(links.nth(8)).not.toHaveAttribute('href', /./);

    /*
     * …and this is where the fault list earns its place. Everything above is correct and **invisible**
     * — see the block below.
     */
    await expect(page.locator('[data-faults]')).toContainText('문제 3개');
  });
});

/**
 * **What a picture is called, and the key that reaches it.**
 *
 * Counted across the suite: **one** control had a real tooltip — a ribbon's toggle — and every other
 * icon in every product used the browser's `title`. Sixty-odd of them, including the eye and the lock
 * in a layer row and every `IconButton` in three apps. A native `title` appears after about a second
 * with no way to change that, is drawn by the operating system, cannot hold a chord legibly, and
 * **never appears for a reader using the keyboard**.
 */
test.describe('what a picture says when you point at it', () => {
  test('names an icon in the rail, which had only the browser’s', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-layer]').first().hover();
    await page.locator('.st-layer button').first().hover();
    await page.waitForTimeout(800);

    const tip = page.locator('[role="tooltip"]');
    await expect(tip).toHaveCount(1);
    await expect(tip).toContainText('숨기기');
    // And no second one from the browser underneath it.
    await expect(page.locator('.st-layer button[title]').first()).toHaveCount(0);
  });

  test('writes the chord the way a reader reads it, never as `Mod`', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-layer]').nth(3).click();
    await page.waitForTimeout(400);

    /*
     * The button is asked for **by name**, not by where it sits. It was `nth(2)`, and the day the
     * ribbon grew a control to the left of it this test started reading a different tooltip — which
     * is a check that measures the layout rather than the thing it is about.
     */
    await page.getByRole('button', { name: /복제/ }).hover();
    await page.waitForTimeout(800);
    const said = await page.locator('[role="tooltip"]').innerText();

    /*
     * It was `Mod+D` on screen. `Mod` is how a chord is **written down** so that one line can mean ⌘
     * on a Mac and Ctrl everywhere else; it is not a key anybody has. And the chord is asked of the
     * key map now rather than typed beside the label — the same second-statement the menubar had.
     */
    expect(said).toContain('복제');
    expect(said).not.toContain('Mod');
    expect(said).toMatch(/⌘D|Ctrl\+D/);
  });
});

/**
 * **What part of the page a block is**, which the published page could not say.
 *
 * Measured on the sample's own export: `lang`, a `<title>`, a viewport, **no script at all** and
 * **not one inline style** — and every structural element a `<div>`. Nothing said which of forty of
 * them was the header, the navigation, the body or the footer, and the document knew: the sample
 * places a `site-header` and a `site-footer` on every page.
 */
test.describe('what a block is on the page', () => {
  test('is drawn as that element, on a placement, which is where the header is', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-layer]').nth(0).click();
    await page.waitForTimeout(400);

    /*
     * A **placement**, and that is the case that matters: the header is a placement of a definition,
     * so a panel offering this only on a plain stack would offer it everywhere except where a reader
     * needs it. Caught by a browser and not by the harness, which counts rows against a schema.
     */
    await page.locator('.office-properties').getByLabel('페이지에서의 역할').selectOption('header');
    await page.waitForTimeout(600);

    const drawn = await page.evaluate(() => {
      const editor = (window as never as { editor: any }).editor;
      const sid = editor.selection?.nodeIds?.[0];
      return document
        .querySelector(`[data-frame="desktop"] [data-bc-sid="${sid}"]`)
        ?.tagName.toLowerCase();
    });
    expect(drawn).toBe('header');
  });

  test('says so when a page has two of something it has one of', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(300);
    for (const at of [0, 1]) {
      await page.locator('[data-layer]').nth(at).click();
      await page.waitForTimeout(400);
      await page.locator('.office-properties').getByLabel('페이지에서의 역할').selectOption('header');
      await page.waitForTimeout(500);
    }

    /*
     * The fault the field creates the moment it exists, and the reader-facing half of what makes a
     * landmark worth having: a screen reader offers a list of them to jump between, and two things
     * both calling themselves the page's header is a list nobody can use. `nav` and `aside` are not
     * counted — several navigations is ordinary — which is the difference between a rule and a habit.
     */
    await expect(page.locator('[data-faults]')).toContainText('문제 2개');
    await page.locator('[data-faults-open]').click();
    await page.waitForTimeout(300);
    const rows = page.locator('[data-fault][data-fault-kind="landmark"]');
    // Both offenders, so a reader can go to each and decide which is the real one.
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('머리말이 2개');
  });
});

/**
 * **차례로** — a row of cards arriving one after another.
 *
 * Three cards appearing at the same instant is the tell of a template, and every landing page
 * staggers them. The fix cannot be an animation on the row: a scroll animation on a parent moves the
 * whole thing. So a container carrying `revealStagger` gives its arrival to its **children** and
 * takes none itself, and each child starts a little further along the **scroll** — a scroll-driven
 * animation has no clock, so a delay in milliseconds would mean nothing at all.
 */
test.describe('what arrives, and in what order', () => {
  test('hands the arrival to the cards inside, and keeps none', async ({ page }) => {
    await ready(page);
    const holder = await page.evaluate(() => {
      const el = document.querySelector('[data-frame="desktop"] .st-stack[data-name="제품 셋"]');
      const sid = el?.getAttribute('data-bc-sid');
      (window as never as { editor: any }).editor.executeCommand('setNode', { nodeIds: [sid] });
      return sid;
    });
    await page.waitForTimeout(500);
    await page.locator('.office-properties').getByText('모양', { exact: true }).click();
    await page.waitForTimeout(300);

    // Greyed until there is an arrival to stagger: a switch with nothing to order is a switch that
    // does nothing, and it says what it wants first rather than hiding.
    const order = page.locator('.office-properties').getByLabel('안에 있는 것들이 차례로');
    await expect(order).toBeDisabled();
    await page.locator('.office-properties').getByLabel('등장 방식').selectOption('rise');
    await page.waitForTimeout(400);
    await expect(order).toBeEnabled();
    await order.click();
    await page.waitForTimeout(500);

    /*
     * The rules exist **in preview only**, and that is deliberate: every arrival starts at
     * `opacity: 0`, and a builder that hid half a page from the person building it would be unusable.
     */
    await page.locator('.st-menubar [data-menu="view"]').click();
    await page.waitForTimeout(250);
    await page.locator('[data-menu-item]').filter({ hasText: '미리보기' }).first().click();
    await page.waitForTimeout(800);

    const said = await page.evaluate(() =>
      Array.from(document.querySelectorAll('style'))
        .map((one) => one.textContent ?? '')
        .join('\n')
    );
    const ranges = said.match(/animation-range: entry [\d.]+%/g) ?? [];
    expect(ranges.length).toBe(3);
    // Each starts further along the scroll — 0, 10, 20 for three of them.
    expect(new Set(ranges).size).toBe(3);
    // And the row itself does not arrive: it either arrives, or what is in it does.
    expect(said).not.toContain(`[data-bc-sid="${holder}"] { animation`);
  });
});

/**
 * **How much of a block comes through**, which the whole product could not say.
 *
 * `opacity` was exempt from `every-attribute-is-read` with the reason *"a canvas idea; a page has no
 * z-order to see through"* — and z-order is not what opacity is. Z-order decides *which* of two
 * overlapping things you see; opacity decides how much of one you see, and a flow page uses it
 * constantly. What the wrong reason cost is `backgroundOpacity`: a special case built for the one
 * place the need could not be argued away.
 */
test.describe('a block that is partly there', () => {
  test('is set in the panel and drawn on the page', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-layer]').nth(3).click();
    await page.waitForTimeout(400);
    await page.locator('.office-properties').getByText('모양', { exact: true }).click();
    await page.waitForTimeout(300);

    const field = page.locator('.office-properties').getByLabel('투명도');
    await expect(field).toHaveValue('1');

    /*
     * A hundredth, and both halves of that matter. `<input type="number">` sanitises what is typed
     * against `step`, so at the default of 1 a typed `0.4` came out of the field as `0`; and the
     * panel's commit rounded anything without a `px` unit to a whole number, which was right while
     * every such row was a count or a degree. Two roundings, one value, and the block vanished.
     */
    await expect(field).toHaveAttribute('step', '0.01');
    await field.fill('0.4');
    await field.press('Enter');
    await page.waitForTimeout(500);

    const said = await page.evaluate(() => {
      const editor = (window as never as { editor: any }).editor;
      const sid = editor.selection?.nodeIds?.[0];
      const el = document.querySelector(`[data-frame="desktop"] [data-bc-sid="${sid}"]`);
      return {
        stored: editor.dataStore.getNode(sid)?.attributes?.opacity,
        drawn: el ? getComputedStyle(el as Element).opacity : null
      };
    });
    expect(said.stored).toBe(0.4);
    expect(said.drawn).toBe('0.4');
  });

  test('can be promised under the pointer, because it moves nothing', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-layer]').nth(3).click();
    await page.waitForTimeout(400);
    await page.locator('.office-properties').getByText('모양', { exact: true }).click();
    await page.waitForTimeout(300);

    /*
     * A card that lifts to full and a picture that brightens under the pointer are both this one
     * number, and it is safe in a state for the reason `strokeWidth` is not: opacity moves nothing,
     * so a block cannot fade itself out from under the pointer.
     */
    await page.locator('.office-properties').getByText('포인터', { exact: true }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('.office-properties').getByLabel('투명도')).toHaveCount(1);
  });
});

/**
 * **One chrome row**, which is what every design tool's top is.
 *
 * It was two — a title bar and a toolbar under it — and the toolbar was counted: six buttons across
 * 1600 pixels, four of them greyed with nothing selected. A full-width strip is what a *ribbon* is;
 * Word's carries 69 controls and needs the width. This is a mode switch and four things a reader can
 * do to what they are holding, which is Figma's toolbar and fits beside the menu with room over.
 */
test.describe('the top of the window', () => {
  const bar = (page: Page) => page.locator('.st-titlebar');

  const fits = async (page: Page) =>
    bar(page).evaluate((el) => (el as HTMLElement).scrollWidth <= (el as HTMLElement).clientWidth + 1);

  test('holds the menu, the tools, the page and the zoom on one line', async ({ page }) => {
    await ready(page);
    // One row of chrome, not two: 42 pixels of canvas back on every screen.
    await expect(page.locator('.st-chrome')).toHaveCount(1);
    // A child of the row rather than a second row under it — `>` is the whole assertion.
    await expect(page.locator('.st-chrome > .st-ribbon')).toHaveCount(0);
    await expect(page.locator('.st-titlebar > .st-ribbon')).toHaveCount(1);
    expect(await fits(page)).toBe(true);
  });

  test('still fits when the tools grow, and at a narrow window', async ({ page }) => {
    await ready(page);

    /*
     * The toolbar grows by about 360 pixels the moment a reader selects words — the character
     * controls and the link picker appear — and the row has to absorb that without overflowing.
     */
    const h1 = page.locator('[data-frame="desktop"] .st-page h1').first();
    for (let at = 0; at < 5; at += 1) {
      if ((await page.locator('.st-overlay').first().getAttribute('data-mode')) === 'text') break;
      await h1.dblclick({ force: true });
      await page.waitForTimeout(350);
    }
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(300);
    expect(await fits(page)).toBe(true);

    for (const width of [1280, 1100, 960]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(350);
      expect(await fits(page), `${width}px`).toBe(true);
    }
  });

  test('keeps the page’s name beside the zoom, where it does not move', async ({ page }) => {
    await ready(page);
    const where = () => page.locator('[data-where]').boundingBox();
    const before = await where();

    /*
     * `margin-left: auto` on the name collapses the free space *before* it, so a toolbar that grows
     * grows into that space instead of dragging the name across the row. A row that moves while
     * somebody is working is the one thing a single chrome row must not do.
     */
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-layer]').nth(3).click();
    await page.waitForTimeout(400);
    expect((await where())?.x).toBe(before?.x);
  });
});

/**
 * **Finding a block in a hundred-row list**, and a menu that was dead on a fresh page.
 *
 * Both found the same way: opening each of the four chrome surfaces in each of its states and writing
 * down what it offers. A list of what a reader can press is a thing this repository can only get from
 * a browser, and it is where the two faults below were sitting in plain sight.
 */
test.describe('the rail and the menubar, counted', () => {
  test('finds a block by name, keeping the branch it hangs off', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(400);
    const all = await page.locator('[data-layer]').count();
    expect(all).toBeGreaterThan(8);

    await page.getByLabel('블록 찾기').fill('요금');
    await page.waitForTimeout(400);

    /*
     * A row is kept if it matches **or holds something that does**, which is the whole of what makes
     * a filtered tree readable: a list of bare matches has lost the one thing a layer list is for —
     * where the block lives. And the two kinds are told apart, or a list of one match reads as ten.
     */
    const rows = page.locator('[data-layer]');
    expect(await rows.count()).toBeLessThan(all);
    await expect(rows.first()).toContainText('요금');
    expect(await page.locator('[data-layer][data-hit="true"]').count()).toBeGreaterThan(0);

    await page.getByLabel('블록 찾기').fill('있을리없는이름');
    await page.waitForTimeout(400);
    await expect(page.locator('[data-layer]')).toHaveCount(0);
    // The field stays: a search that disappears when it finds nothing cannot be corrected.
    await expect(page.getByLabel('블록 찾기')).toHaveCount(1);

    await page.getByLabel('블록 찾기').fill('');
    await page.waitForTimeout(400);
    await expect(page.locator('[data-layer]')).toHaveCount(all);
  });

  test('offers every insert on a page with nothing selected', async ({ page }) => {
    await ready(page);
    await page.locator('.st-menubar [data-menu="insert"]').click();
    await page.waitForTimeout(300);

    /*
     * Measured before this: **twelve entries in 삽입, twelve greyed**, on a freshly opened site. An
     * insert lands after what is selected and, with nothing selected, at the end of the page a reader
     * is looking at — which the model has no notion of, so the app says it with `needs: 'page'`. The
     * rail's 추가 had been passing it since the day it was written; this menu was not.
     */
    const entries = page.locator('[data-menu-item]');
    expect(await entries.count()).toBeGreaterThan(10);
    for (const one of await entries.all()) {
      await expect(one, (await one.innerText()).trim()).toBeEnabled();
    }
  });
});

/**
 * **The space inside a block**, which is what a reader asked for a ruler to see.
 *
 * A ruler is the wrong instrument for a page. Word's measures margins and indents and a slide's
 * measures x and y, and in both the number under it is a number the reader **sets**. A page is a
 * flow: nothing here has a coordinate, so a ruler along the top would be measuring numbers nobody
 * can type anywhere.
 *
 * The two numbers they *can* type are the padding and the gap, and neither was visible: a section is
 * 112 above and 48 below and nothing on the page said so, and the 64 between two cards looked exactly
 * like the 40 between two others.
 */
test.describe('what a block holds its content at', () => {
  const bands = (page: Page) => page.locator('[data-frame="desktop"] .st-inset');

  test('draws a stack’s padding, with the number on it', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-layer]').nth(3).click();
    await page.waitForTimeout(600);

    /*
     * Read from `getComputedStyle` rather than from the attribute, because that is what the reader is
     * looking at: an override at this width, a fallback the renderer chose, a gap the grid resolved
     * — all of them are in the number the browser used and none is in what the node says.
     */
    await expect(bands(page)).toHaveCount(4);
    const said = await bands(page).evaluateAll((els) =>
      els.map((el) => `${el.getAttribute('data-inset')}=${(el.textContent ?? '').trim()}`)
    );
    expect(said).toEqual(['top=112', 'right=72', 'bottom=48', 'left=72']);
  });

  test('draws the gap between what a stack holds, and agrees with the panel', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      const el = document.querySelector('[data-frame="desktop"] .st-stack[data-name="제품 셋"]');
      const editor = (window as never as { editor: any }).editor;
      editor.executeCommand('setNode', { nodeIds: [el?.getAttribute('data-bc-sid')] });
    });
    await page.waitForTimeout(700);

    /*
     * Two gaps for three cards, measured **between the drawn children** rather than read off `gap` —
     * a grid's wrap and an absolutely placed child both make that number a poor description.
     *
     * Filtered to the gaps, because the four sides are drawn now whether or not they measure
     * anything: a side with no padding is a hairline a reader can still pull, and it comes before
     * the gaps in the same list.
     */
    const said = await bands(page).evaluateAll((els) =>
      els
        .filter((el) => el.getAttribute('data-inset') === 'gap')
        .map((el) => `${el.getAttribute('data-inset')}=${(el.textContent ?? '').trim()}`)
    );
    expect(said).toEqual(['gap=24', 'gap=24']);
    // And the panel says the same thing, which is the whole point of drawing it.
    await expect(page.locator('.office-properties').getByLabel('간격')).toHaveValue('24');
  });

  test('says nothing when several blocks are held', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-layer]').nth(3).click();
    await page.waitForTimeout(400);
    await page.locator('[data-layer]').nth(5).click({ modifiers: ['Shift'] });
    await page.waitForTimeout(400);
    // Four bands and six gaps on each of three sections is not a measurement, it is a pattern.
    await expect(page.locator('.st-inset')).toHaveCount(0);
  });
});

/**
 * **Copying a block**, which a builder had no answer for.
 *
 * `cut`, `copy` and `paste` are the shared kit's and they take a caret's **range**, so a reader
 * holding a card had all three greyed — correctly, and uselessly. Measured from the other end: ⌘D was
 * the only way to get a second copy of anything, and there was no way at all to move a block from one
 * page to another.
 */
test.describe('a block on the clipboard', () => {
  const sections = (page: Page) => page.locator('[data-frame="desktop"] .st-page > .st-stack');

  const hold = async (page: Page, at: number) => {
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-layer]').nth(at).click();
    await page.waitForTimeout(400);
  };

  test('copies, pastes after itself, and comes back in one undo', async ({ page, context }) => {
    // The system clipboard is what carries a block to another tab; the extension keeps its own copy
    // as well, because reading the system's needs a permission the browser may refuse.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await ready(page);
    const before = await sections(page).count();
    await hold(page, 3);

    await page.keyboard.press('Meta+c');
    await page.waitForTimeout(300);
    await page.keyboard.press('Meta+v');
    await page.waitForTimeout(600);
    await expect(sections(page)).toHaveCount(before + 1);
    // What was pasted is what is selected, so the next gesture acts on it rather than on the original.
    await expect(page.locator('.st-mark-selected')).toHaveCount(3);

    /*
     * **One** undo. A paste is one gesture, so it is one entry in the history — which is why the
     * blocks are added in a single transaction rather than one command per block.
     */
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(700);
    await expect(sections(page)).toHaveCount(before);
  });

  test('moves a block from one page to another, which was impossible', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await ready(page);
    await hold(page, 3);
    const before = await sections(page).count();

    // Cut is copy and then remove, in one command: undo after a cut gives the block back, once.
    await page.keyboard.press('Meta+x');
    await page.waitForTimeout(600);
    await expect(sections(page)).toHaveCount(before - 1);

    await page.locator('[data-panel="pages"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-pages] [data-page]').nth(2).click();
    await page.waitForTimeout(700);
    const there = await sections(page).count();

    // Nothing selected on the new page, so it lands at the end of it — which only the app knows.
    await page.keyboard.press('Meta+v');
    await page.waitForTimeout(700);
    await expect(sections(page)).toHaveCount(there + 1);
  });

  test('is on the menubar too, with the chord it is actually bound to', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await ready(page);
    await hold(page, 3);
    await page.locator('.st-menubar [data-menu="edit"]').click();
    await page.waitForTimeout(250);

    await expect(page.locator('[data-menu-item="edit.clipboard.0"]')).toContainText('⌘X');
    await expect(page.locator('[data-menu-item="edit.clipboard.1"]')).toContainText('⌘C');
    /*
     * **Enabled**, and it used to say greyed — which was the bug the cross-document test found.
     *
     * Reading the system clipboard is asynchronous and may prompt, so nothing can ask *now* whether
     * it holds a block. The tight answer — enabled only when this window is the one that copied —
     * made pasting a block from one site into another impossible, because a second window has its
     * own extension and its own empty hand. So it answers whether there is anywhere to paste, and a
     * paste that finds prose does nothing, which is what every editor's Paste does.
     */
    await expect(page.locator('[data-menu-item="edit.clipboard.2"]')).toBeEnabled();
  });
});

/**
 * **The panel is an inspector.**
 *
 * 240 pixels, 24-pixel rows, 11-pixel type — what a design tool's inspector is, rather than the
 * 288/28/12 form it grew into. What only a browser can say is whether the density cost anything:
 * whether a control still writes, whether a reader can see where they are typing, and whether the
 * rows that were made denser are still readable.
 */
test.describe('the panel', () => {
  const panel = (page: Page) => page.locator('.office-properties');

  const holding = async (page: Page) => {
    await ready(page);
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-layer]').nth(3).click();
    await page.waitForTimeout(500);
  };

  test('is 240 wide, and every row fits inside it', async ({ page }) => {
    await holding(page);
    expect(await panel(page).evaluate((el) => (el as HTMLElement).offsetWidth)).toBe(240);

    /*
     * Nothing clipped, on either tab. Measured before this: 그라디언트 needed 296 pixels in 263 and
     * its angle and shape were **not on screen at all** — not clipped in a way a reader could scroll
     * to, gone. A row that does not fit wraps now, which is why the panel could get narrower rather
     * than wider.
     */
    for (const tab of ['블록', '모양']) {
      await panel(page).getByText(tab, { exact: true }).click();
      await page.waitForTimeout(300);
      const over = await panel(page)
        .locator('label')
        .evaluateAll((els) =>
          els
            .filter((el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 2)
            .map((el) => (el.textContent ?? '').trim().slice(0, 20))
        );
      expect(over, tab).toEqual([]);
    }
  });

  test('says which field the caret is in', async ({ page }) => {
    await holding(page);
    const field = panel(page).locator('input[type="number"]').first();
    const edge = () => field.evaluate((el) => getComputedStyle(el).borderColor);
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ou-accent').trim()
    );

    // At rest a panel's field has no edge — twenty edges down a column is a fence.
    expect(await edge()).toBe('rgba(0, 0, 0, 0)');
    await field.hover();
    await page.waitForTimeout(200);
    const hovered = await edge();
    expect(hovered).not.toBe('rgba(0, 0, 0, 0)');

    /*
     * And the accent while the caret is in it, **after the pointer has gone**. Measured before this:
     * a field focused by clicking drew the hover edge, and the moment the pointer moved away it drew
     * nothing at all — caret inside, nothing on screen saying where a reader was typing.
     */
    await field.click();
    await page.mouse.move(1200, 900);
    await page.waitForTimeout(250);
    expect(await edge()).not.toBe(hovered);
    expect(await edge()).toBe(
      await page.evaluate((hex) => {
        const probe = document.createElement('span');
        probe.style.color = hex;
        document.body.append(probe);
        const said = getComputedStyle(probe).color;
        probe.remove();
        return said;
      }, accent)
    );
  });

  test('picks a stack’s direction with pictures, not a dropdown', async ({ page }) => {
    await holding(page);
    const group = page.locator('[data-segmented="방향"]');
    await expect(group.locator('button')).toHaveCount(3);
    // A name the icon table does not know draws as the name itself, in a 24-pixel button.
    await expect(group.locator('[data-icon-missing]')).toHaveCount(0);

    const said = () =>
      page.evaluate(() => {
        const editor = (window as never as { editor: any }).editor;
        return editor.dataStore.getNode(editor.selection?.nodeIds?.[0])?.attributes?.layoutMode;
      });
    expect(await said()).toBe('column');
    await expect(group.locator('[data-state="on"]')).toHaveAttribute('data-segment', 'column');

    /*
     * The row that earns three buttons: a stack's direction is what a reader changes while they are
     * arranging, over and over, and a `<select>` costs a gesture to open before it costs one to
     * choose. Six choices stay a list — `분배` is six, and six unlabelled glyphs is a puzzle.
     */
    await group.locator('[data-segment="row"]').click();
    await page.waitForTimeout(400);
    expect(await said()).toBe('row');
    await expect(group.locator('[data-state="on"]')).toHaveAttribute('data-segment', 'row');
  });

  /**
   * **Each of the four sides can be told from the others**, which is what this has always been about.
   *
   * It was five identical boxes: a companion cannot borrow the row's one label — it is one of five
   * things on the line — and that label was drawn nowhere at all. Then it was `상 우 하 좌` inside
   * the fields, which is what this test used to assert.
   *
   * It is a **picture** now, one per field, which is what every design tool puts there. So the
   * assertion moves with it: not *which word is in the row* but *is each field marked, and is the
   * mark different for each* — which is the thing a reader needs and the thing all three versions
   * were trying to give them.
   */
  /**
   * **The band can be pulled**, which is the gesture Figma has here and this had a readout of.
   *
   * The number in the panel was where a padding was changed, so a reader looking at the band had to
   * look away to change the thing they were looking at. The whole argument for drawing the band is
   * that *how much* is the question, and answering it and then sending them elsewhere to act is half
   * a tool.
   *
   * Two things are asserted that a screenshot would not say: the document holds the new number
   * afterwards, and it holds it **once** — Word learned on its ruler that writing on every pointer
   * move makes one drag into ten entries of the history, and a reader's undo then walks back through
   * positions the box was never meant to be in.
   */
  test('pulls a padding band, and writes it once', async ({ page }) => {
    await holding(page);

    const band = page.locator('.st-inset[data-inset="bottom"]').first();
    await expect(band).toHaveCount(1);
    /*
     * It takes the pointer, which it did not — the bands were `pointer-events: none`. On the strip
     * rather than on the band: only the outer edge is pressable, so the cursor lives on the `::after`
     * that is the strip.
     */
    const strip = await band.evaluate((el) => {
      const drawn = getComputedStyle(el, '::after');
      return { cursor: drawn.cursor, events: drawn.pointerEvents };
    });
    expect(strip.cursor).toBe('ns-resize');
    expect(strip.events).toBe('auto');

    const padOf = () =>
      page.evaluate(() => {
        const editor = (window as never as { editor: any }).editor;
        const node = editor.dataStore.getNode(editor.selection?.nodeIds?.[0]);
        return Number(node?.attributes?.paddingBottom ?? 0);
      });
    /*
     * `getStats().totalEntries`, which is what the history actually offers — `undoStack` is not a
     * thing it has, and asking for one gave `0` both times, so the count *looked* like one entry per
     * drag whatever the drag wrote.
     */
    const historyOf = () =>
      page.evaluate(
        () => (window as never as { editor: any }).editor.historyManager?.getStats?.().totalEntries ?? -1
      );

    const before = await padOf();
    const entries = await historyOf();

    /*
     * The **edge** of the band, not its middle: only the outer strip takes the pointer, because a
     * section's padding is often 96 deep and a band that deep swallows every press in the top
     * quarter of the block — which is what stopped a card being dragged out of its row the first
     * time these took the pointer at all.
     */
    const box = (await band.boundingBox())!;
    const grip = box.y + box.height - 3;
    await page.mouse.move(box.x + box.width / 2, grip);
    await page.mouse.down();
    /*
     * **Up**, in four steps — a real drag rather than a jump, and the direction that makes a bottom
     * padding bigger: the band is drawn inside the block, so its far edge is the one that moves.
     * Dragged down first, and the document took a 0, because less than none is none.
     */
    for (let step = 1; step <= 4; step++) {
      await page.mouse.move(box.x + box.width / 2, grip - step * 10);
    }
    await page.mouse.up();
    await page.waitForTimeout(500);

    const after = await page.evaluate(() => {
      const editor = (window as never as { editor: any }).editor;
      const ids = editor.selection?.nodeIds ?? [];
      const node = editor.dataStore.getNode(ids[0]);
      return JSON.stringify({ ids, pad: node?.attributes?.paddingBottom, stype: node?.stype });
    });
    expect(await padOf(), after).toBeGreaterThan(before);
    // One drag, one entry — not one per pointer move.
    expect(await historyOf()).toBe(entries + 1);

    // And one undo puts it back, which is what a reader means by taking a drag back.
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    expect(await padOf()).toBe(before);
  });

  test('marks each of the four sides, which had been five identical boxes', async ({ page }) => {
    await holding(page);
    const row = panel(page).locator('label').filter({ hasText: '안쪽 여백' }).first();

    const drawn = await Promise.all(
      ['위쪽 여백', '오른쪽 여백', '아래쪽 여백', '왼쪽 여백'].map(async (name) => {
        const mark = row.getByLabel(name).locator('xpath=preceding-sibling::span[1]');
        await expect(mark.locator('svg'), name).toHaveCount(1);
        return mark.locator('svg path').first().getAttribute('d');
      })
    );

    // Four marks, and four *different* marks — one picture repeated would be the five identical boxes
    // again with a drawing on them.
    expect(new Set(drawn).size).toBe(4);

    // The long form stays where a screen reader reads it, which has the room and no adjacency.
    await expect(row.getByLabel('위쪽 여백')).toHaveCount(1);
  });

  /**
   * **Press every control the panel offers and check the document moved.**
   *
   * A control that is offered and writes nothing is the fault this repository keeps finding, and a
   * panel of sixty rows is where it hides.
   *
   * ## What this used to miss, and it was most of it
   *
   * Two things, both found by asking what the sweep actually reaches:
   *
   * - **One selection.** It swept a stack, so every row that belongs to a picture, a form, a field or
   *   a list — the ones added most recently and therefore least looked at — was never pressed. Nine
   *   of them.
   * - **One kind of picker.** The panel had two: the sheet's own declared `choice` rows are a native
   *   `<select>` and the app's custom rows were a Radix listbox with a `<button>` trigger, which this
   *   collects `select` and never saw. They also looked different from each other in the same column,
   *   which is the half a reader notices. One picker now, and the sweep reaches all of it.
   */
  test('writes from every control it offers, on everything it offers them for', async ({ page }) => {
    // Five selections, two panes each, sixty-odd controls — a sweep rather than a check.
    test.setTimeout(180_000);
    await ready(page);

    /**
     * The **whole document**, not the selected node.
     *
     * Two rows in the panel deliberately write somewhere else: a form's 주소 and 방식 write the
     * *connection* it names, because an address said once is the whole reason a connection has a
     * name. Compared against one node they looked like controls that do nothing — the check being
     * narrower than the panel it is checking.
     */
    const shape = () =>
      page.evaluate(() => {
        const editor = (window as never as { editor: any }).editor;
        return JSON.stringify(editor.exportDocument?.(editor.getRootId()) ?? '');
      });

    /** Press everything on both panes of the panel, and say what moved nothing. */
    const sweep = async (): Promise<string[]> => {
      const dead: string[] = [];
      for (const tab of ['블록', '모양']) {
        const chosen = panel(page).locator('[role="tab"]', { hasText: tab });
        if ((await chosen.count()) === 0) continue;
        await chosen.click();
        await page.waitForTimeout(250);

        const fields = panel(page).locator('input[type="number"], input[type="text"], select');
        for (let at = 0; at < (await fields.count()); at++) {
          const one = fields.nth(at);
          if (await one.isDisabled()) continue;
          const name = (await one.getAttribute('aria-label')) ?? String(at);
          const before = await shape();
          const kind = await one.evaluate((el) => el.tagName.toLowerCase());
          if (kind === 'select') {
            const options = await one.locator('option').evaluateAll((els) =>
              els.map((el) => (el as HTMLOptionElement).value)
            );
            const now = await one.inputValue();
            const next = options.find((option) => option !== now && option !== '');
            if (!next) continue;
            await one.selectOption(next);
          } else {
            /*
             * A value the control does not already hold. 37 is out of range for 투명도, whose bounds
             * are 0 and 1, so the clamp produced 1 — which is what it already said, so nothing moved
             * and the row looked dead. A sweep that writes the value already there is measuring
             * itself.
             */
            const low = Number((await one.getAttribute('min')) ?? '-99999');
            const high = Number((await one.getAttribute('max')) ?? '99999');
            const now = await one.inputValue();
            const wanted = Math.min(high, Math.max(low, 37));
            const said =
              kind !== 'input'
                ? '시험'
                : String(wanted) === now
                  ? String(Math.min(high, Math.max(low, wanted === low ? high : low)))
                  : String(wanted);
            if (kind === 'input' && said === now) continue;
            await one.fill(said);
            await one.press('Enter');
          }
          await page.waitForTimeout(150);
          if ((await shape()) === before) dead.push(`${tab} › ${name}`);
        }
      }
      return dead;
    };

    /*
     * A stack, and then **each of the node types whose rows nothing had ever pressed**: a picture, a
     * list, a form and one of its questions. Selected by walking the document rather than by clicking
     * the page, because two of them are not on it until this test puts them there.
     */
    const select = async (stype: string) => {
      await page.evaluate((want) => {
        const editor = (window as never as { editor: any }).editor;
        const found: string[] = [];
        const walk = (sid: string, depth = 0) => {
          if (depth > 40 || found.length > 0) return;
          for (const child of (editor.dataStore.getNode(sid)?.content ?? []) as unknown[]) {
            if (typeof child !== 'string') continue;
            if (editor.dataStore.getNode(child)?.stype === want) {
              found.push(child);
              return;
            }
            walk(child, depth + 1);
          }
        };
        walk(editor.getRootId());
        if (found[0]) editor.executeCommand('setNode', { nodeIds: [found[0]] });
      }, stype);
      await page.waitForTimeout(400);
    };

    // A form and a field, which the sample has on 소개 — and a list and a picture, which it has here.
    const dead: string[] = [];
    for (const stype of ['frame', 'picture', 'collection', 'form', 'field']) {
      await select(stype);
      dead.push(...(await sweep()));
    }

    expect(dead).toEqual([]);
  });
});

/**
 * **The viewport is a scale, and a scale is not a redraw.**
 *
 * Reported by a reader in four parts, and they turned out to be two faults: *the rendering keeps
 * breaking when I only change the scale*, *only the transform should change*, *the caret stops the
 * selection changing*, and *on the mobile board the cursor keeps landing in the wrong place*.
 */
test.describe('standing back from the page', () => {
  const scale = (page: Page) => page.locator('.st-canvas').first().getAttribute('data-zoom');

  test('goes back where it came from, in as many steps as it took', async ({ page }) => {
    await ready(page);
    const opened = await scale(page);

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Meta+Equal');
      await page.waitForTimeout(120);
    }
    expect(Number(await scale(page))).toBeGreaterThan(Number(opened));
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Meta+Minus');
      await page.waitForTimeout(120);
    }

    /*
     * Exactly, and it used to be 69% having started at 70%. The steps were `round(z * 110) / 100`
     * and `round(z * 90) / 100`: not inverses — 1.1 × 0.9 is 0.99 — with a round-to-two-decimals
     * inside each compounding it. A reader who zooms in to look at something and back out is making
     * round trips all day. One multiplier now, shared with the zoom control's own buttons.
     */
    expect(await scale(page)).toBe(opened);
  });

  test('redraws nothing at all', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      (window as never as { seen: Record<string, number> }).seen = { desktop: 0, tablet: 0, mobile: 0 };
      for (const at of ['desktop', 'tablet', 'mobile']) {
        const host = document.querySelector(`[data-frame="${at}"] .st-frame-host`);
        if (!host) continue;
        new MutationObserver((records) => {
          (window as never as { seen: Record<string, number> }).seen[at] += records.length;
        }).observe(host, { childList: true, subtree: true, characterData: true, attributes: true });
      }
    });

    const pane = (await page.locator('.st-canvas').boundingBox())!;
    for (let i = 0; i < 8; i++) {
      await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
      await page.keyboard.down('Meta');
      await page.mouse.wheel(0, -100);
      await page.keyboard.up('Meta');
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(400);
    expect(Number(await scale(page))).toBeGreaterThan(1);

    /*
     * **Not one mutation**, on any of the three boards. The overlay used to take the zoom as a prop,
     * so every wheel tick re-rendered three boards' worth of markers and recomputed every box with
     * `getBoundingClientRect` — for an answer that cannot change: a box measured in the board's own
     * pixels is scale-invariant by construction, which is exactly why the measurement divides by the
     * scale. It reads the scale off the board now, and `--st-zoom` is set on the plane beside the
     * transform it describes.
     */
    expect(await page.evaluate(() => (window as never as { seen: Record<string, number> }).seen)).toEqual({
      desktop: 0,
      tablet: 0,
      mobile: 0
    });
  });
});

/**
 * **Editing text is a state you are in, not a mode you are stuck in.**
 *
 * The mode is the app's — one reader, one caret — but the layer that owns the pointer switched itself
 * off on **all three boards at once**. So the moment a reader double-clicked into a heading, every
 * board became a plain `contenteditable`: a press anywhere could only put a caret, the block
 * selection could not be changed at all, and the way out was Escape.
 */
test.describe('a caret, and everything outside it', () => {
  const mode = (page: Page) => page.locator('.st-overlay').first().getAttribute('data-mode');

  /** Double-click goes one level in, so reaching the words is a gesture repeated, not a special one. */
  const intoText = async (page: Page, selector: string) => {
    for (let i = 0; i < 5; i++) {
      if ((await mode(page)) === 'text') return;
      await page.locator(selector).first().dblclick({ force: true });
      await page.waitForTimeout(400);
    }
  };

  test('lets a press inside move the caret and nothing else', async ({ page }) => {
    await ready(page);
    await intoText(page, '[data-frame="desktop"] .st-page h1');
    await expect(page.locator('.st-overlay').first()).toHaveAttribute('data-mode', 'text');

    await page.locator('[data-frame="desktop"] .st-page h1').first().click({ force: true, position: { x: 40, y: 10 } });
    await page.waitForTimeout(400);
    // Still editing, and still a caret: this is the whole of what text mode is for.
    expect(await mode(page)).toBe('text');
    expect(await page.evaluate(() => window.getSelection()?.type)).toBe('Caret');
  });

  test('leaves the text when the press is somewhere else, and selects what was pressed', async ({ page }) => {
    await ready(page);
    await intoText(page, '[data-frame="desktop"] .st-page h1');

    await page.locator('[data-frame="desktop"] .st-page h2').first().click({ force: true });
    await page.waitForTimeout(600);
    expect(await mode(page)).toBe('select');
    // The outermost block, which is what a plain press means everywhere else in this product.
    await expect(page.locator('.st-mark-selected')).toHaveCount(3);
  });

  test('answers a press on another board, which is where a reader met this', async ({ page }) => {
    await ready(page);
    await intoText(page, '[data-frame="desktop"] .st-page h1');

    /*
     * The report was *on mobile I cannot click the element I want — a text cursor keeps landing
     * somewhere wrong*, and this is why: the caret was on the desktop board and the mobile board was
     * an ordinary editor, so a press on it placed a second caret rather than selecting anything.
     */
    await page.locator('[data-frame="mobile"] .st-page h2').first().click({ force: true });
    await page.waitForTimeout(600);
    expect(await mode(page)).toBe('select');
    await expect(page.locator('.st-mark-selected')).toHaveCount(3);
  });

  test('lets go of everything on the grey around the boards', async ({ page }) => {
    await ready(page);
    await intoText(page, '[data-frame="desktop"] .st-page h1');
    await page.locator('.st-canvas').click({ position: { x: 20, y: 400 } });
    await page.waitForTimeout(500);
    expect(await mode(page)).toBe('select');
    // Pressing nothing has always meant selecting nothing.
    await expect(page.locator('.st-mark-selected')).toHaveCount(0);
  });

  test('and in select mode too, which it did not for two rounds', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-layer]').nth(3).click();
    await page.waitForTimeout(400);
    await expect(page.locator('.st-mark-selected')).toHaveCount(3);

    /*
     * The overlay owns every press on a board and already decides what one means there; what it does
     * not cover is the plane *around* the boards. So a reader who wanted to let go of a selection had
     * to press Escape — a key they have no reason to know, for the gesture every tool of this kind
     * answers with a click on nothing. Measured, written down, and left for two rounds while it was
     * one condition away.
     */
    await page.locator('.st-canvas').click({ position: { x: 20, y: 400 } });
    await page.waitForTimeout(400);
    await expect(page.locator('.st-mark-selected')).toHaveCount(0);
  });
});

/**
 * **The keys the menubar teaches.**
 *
 * Written after a browser was used to press every chord the menu printed, one at a time, with a
 * block selected: fourteen were printed and three were answered. ⌘Z, ⇧⌘Z, ⌘X, ⌘C, ⌘V, ⌘A, ⌘F and
 * the four zoom keys all did nothing at all, because the hints were typed beside the labels and the
 * app had its own `keydown` that remembered two bindings out of a key map nobody read.
 *
 * These are here rather than only in `keymap.test.ts` because the unit test can hold the two
 * declarations to each other and cannot tell you whether a press does anything. That was the whole
 * of the fault.
 */
test.describe('the keys', () => {
  const zoom = (page: Page) => page.locator('.st-canvas').first().getAttribute('data-zoom');

  const hold = async (page: Page) => {
    await ready(page);
    await page.locator('[data-panel="layers"]').click();
    await page.locator('[data-layer]').nth(3).click();
    await page.waitForTimeout(300);
  };

  test('undoes what no keystroke could reach before', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="pages"]').click();
    await page.locator('[data-page-remove]').nth(1).click();
    await page.locator('[data-page-remove-confirm]').click();
    await page.waitForTimeout(700);
    await expect(page.locator('[data-pages] [data-page]')).toHaveCount(4);

    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(800);
    await expect(page.locator('[data-pages] [data-page]')).toHaveCount(5);
    // And the footer heard it, which is the other half: a fault list that lags undo is a list lying.
    await expect(page.locator('[data-faults]')).toHaveAttribute('data-clear', 'true');
  });

  test('selects the blocks on the page, where it used to clear the selection', async ({ page }) => {
    await hold(page);
    // One block, drawn at three widths.
    await expect(page.locator('.st-mark-selected')).toHaveCount(3);

    await page.keyboard.press('Meta+a');
    await page.waitForTimeout(400);

    /*
     * Every block **on** the page, not every block inside every one of them — one level, which is
     * what every design tool means by it and what stops the next nudge pulling the page apart.
     *
     * It ran the shared kit's `selectAll` before, and this is the measurement that found it: with a
     * card held, ⌘A left the reader with **nothing** selected. Not an error and not a refusal.
     */
    const layers = await page.locator('[data-layer]').count();
    await expect(page.locator('.st-mark-selected')).toHaveCount(layers * 3);
  });

  test('zooms about the plane on the four keys the menu prints', async ({ page }) => {
    await hold(page);
    const opened = Number(await zoom(page));

    await page.keyboard.press('Meta+Equal');
    await page.waitForTimeout(300);
    expect(Number(await zoom(page))).toBeGreaterThan(opened);

    await page.keyboard.press('Meta+0');
    await page.waitForTimeout(300);
    expect(Number(await zoom(page))).toBe(1);

    await page.keyboard.press('Meta+Minus');
    await page.waitForTimeout(300);
    expect(Number(await zoom(page))).toBeLessThan(1);

    /*
     * ⇧1, and it is the one chord that could not be matched on `event.key`: shift and `1` types `!`
     * on a US layout and something else on several others. Matched on `event.code`, so this passes on
     * a keyboard that is not the one it was written on.
     */
    await page.keyboard.press('Shift+Digit1');
    await page.waitForTimeout(400);
    expect(Number(await zoom(page))).not.toBe(1);
  });

  test('prints no chord for a key it does not answer', async ({ page }) => {
    await ready(page);
    await page.locator('.st-menubar [data-menu="edit"]').click();
    await page.waitForTimeout(200);

    // Derived from the key map, so what is printed is what is bound.
    await expect(page.locator('[data-menu-item="edit.history.0"]')).toContainText('⌘Z');
    await expect(page.locator('[data-menu-item="edit.blocks.0"]')).toContainText('⌘D');

    /*
     * And 찾기 is **gone**. `editor-core` registers `find` as `execute: () => true` — a stub — so the
     * entry lit up, ran, and drew nothing, every time. A menu entry that always works and never does
     * anything is worse than a missing one.
     */
    await expect(page.locator('[data-menu-item^="edit.find"]')).toHaveCount(0);
    await expect(page.locator('[data-menu-item]').filter({ hasText: '찾기' })).toHaveCount(0);
  });
});

/**
 * What is wrong with the site, and the one gesture that makes something wrong.
 *
 * The removal test above ends with seven links, two of which now go nowhere and are drawn as
 * ordinary words — the honest drawing, and the reason the canvas can never show this. So the rail
 * has a footer, and these are the two states it has.
 */
test.describe('what is wrong with the site', () => {
  const footer = (page: Page) => page.locator('[data-faults]');

  test('says so when nothing is, which is what makes it worth reading', async ({ page }) => {
    await ready(page);

    /*
     * Three checks existed here for weeks with unit tests beside them and nothing ran any of them
     * over a real document. A footer that vanished when it was happy would reproduce exactly that at
     * the surface: a check nobody runs reads like a check that passes.
     */
    await expect(footer(page)).toHaveAttribute('data-clear', 'true');
    await expect(footer(page)).toContainText('문제 없음');
    // Nothing to open, so it is not a button — a disabled one would read as *you may not look*.
    await expect(footer(page).locator('[data-faults-open]')).toHaveCount(0);
  });

  test('counts what a removed page broke, and says where each one is', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="pages"]').click();
    await page.locator('[data-page-remove]').nth(1).click();
    await page.locator('[data-page-remove-confirm]').click();
    await page.waitForTimeout(700);

    await expect(footer(page)).toContainText('문제 3개');
    await expect(footer(page)).not.toHaveAttribute('data-clear', 'true');

    // Shut until asked. A drawer that opened itself would cover the panel a reader is working in.
    await expect(page.locator('[data-faults-list]')).toHaveCount(0);
    await footer(page).locator('[data-faults-open]').click();

    const list = page.locator('[data-faults-list]');
    await expect(list).toContainText('끊어진 링크');
    // The *reason*, once per group: a list that only says what is wrong teaches a reader to dismiss it.
    await expect(list).toContainText('화면만 봐서는 찾을 수 없습니다');

    const found = list.locator('[data-fault]');
    await expect(found).toHaveCount(3);

    /*
     * And **where**, which is the half that makes a row somewhere to go rather than a complaint. All
     * three of these links live in the 머리말 and 꼬리말 *definitions* — twice in the header, since
     * the bar and the menu a phone opens each carry one — which is why the dialog said three and the
     * page draws eleven. A reader told only 링크 would look through five pages and find it on none of
     * them, because a definition is not a page.
     */
    await expect(found.first()).toContainText('컴포넌트');
  });

  test('goes to the block, which for a definition means opening it', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="pages"]').click();
    await page.locator('[data-page-remove]').nth(1).click();
    await page.locator('[data-page-remove-confirm]').click();
    await page.waitForTimeout(700);

    await footer(page).locator('[data-faults-open]').click();
    await page.locator('[data-faults-list] [data-fault]').first().click();
    await page.waitForTimeout(700);

    /*
     * Two moves in one press, because the two places a fault can live are reached differently: a page
     * is what the boards already draw, and a definition is a thing they have to be *aimed* at. The
     * board's label says which — it carries the definition's name while one is open.
     */
    await expect(page.locator('[data-frame="desktop"]')).toContainText('머리말');
    /*
     * And the block itself is selected — the *block*, not the run of text the check named. A broken
     * link is reported against the run carrying the mark, which is where the fault is and is not a
     * thing anybody can select; a row that selected it would land the reader on nothing.
     */
    // Three, because there is one selection and three boards drawing it — the product's first claim.
    await expect(page.locator('.st-mark-selected')).toHaveCount(3);
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
    /*
     * 39, not 44 — and the number moved on purpose. The four heading sizes were hand-picked constants
     * in `page-css.ts` and are a **computed scale** now, so a reader can change the rhythm of a whole
     * site at once (`type-scale.ts`). What this is measuring is unchanged: a heading is a heading and
     * not the chrome's 12px.
     */
    expect(type.h1).toBeGreaterThanOrEqual(38);
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
    // Four in the bar, four again in the menu a phone opens, and three in the footer — the three
    // places this site puts them. The menu is not drawn until it is asked for and its links are
    // still in the page, which is the whole difference between a closed menu and a draft.
    await expect(links).toHaveCount(11);
    await expect(links).toHaveText([
      '제품', '가격', '소개', '블로그',
      '제품', '가격', '소개', '블로그',
      '제품', '가격', '소개'
    ]);

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

  /**
   * And a link **out** of the site, which had no control at all.
   *
   * ## What was measured
   *
   * The link group offered a picker of this document's pages and a button that takes a link away.
   * Between them there was no way to type an address — so a landing page built with this product
   * could not carry a link to a shop, a repository or a mail address. The *drawing* end had been
   * finished the whole time: `hrefFor` passes a non-`page:` href straight through and the export
   * writes it, so the gap was one field wide and invisible to every check, because a command nothing
   * offers is not a command a surface got wrong.
   *
   * ## Why the typed value is not the written one
   *
   * A reader types `barocss.com`, because that is what the address *is* to them. Written into an
   * `href` unchanged it is **relative**: followed from `/제품` it goes to `/제품/barocss.com`. The
   * link is drawn, it is clickable, it looks right, and it is wrong only once somebody follows it —
   * which is why this asserts the `https://` that `addressFor` puts on rather than the letters.
   */
  /**
   * **What the words look like**, which the panel said nothing about at the moment it mattered most.
   *
   * ## Measured before it existed
   *
   * Select some words and the panel showed the **page's** background and shadow, under a sentence
   * asking the reader to select a block — at the moment they had selected the most specific thing in
   * the document. And there was nowhere else to go: `setFontSize` and `setFontColor` are registered
   * by this product's kit and have been since it existed, and **no surface anywhere offered either**.
   * The sample uses both, twenty times, through helpers written by hand — a reader of this product
   * could not make the page it ships as its own example.
   *
   * ## Why the size is asserted on the drawing rather than on the mark
   *
   * Because the one thing that could go wrong here is a unit. `unit: 'px'` in this panel has always
   * meant two things at once — print px, and *the document stores twips* — and every length in this
   * schema is twips, so the two never came apart. A mark's size is a CSS length. Sent through the
   * twips arithmetic a reader typing 44 would have written `660px`, and the only place that shows is
   * the page.
   */
  /**
   * **A toolbar that follows the chosen words**, which needed four layers and had three.
   *
   * There have been two floating surfaces in `packages/extensions` for as long as it has existed and
   * no product installed either: they drew their own DOM into `document.body`, which a product
   * cannot theme, place or style. Taking the drawing out left one layer unreachable — *where the
   * selection is on screen* — which lived inside the decorator system and nothing published.
   *
   * Asserted as a **position** rather than as an element that exists, because existing is the easy
   * half: a toolbar in the corner of the window is a toolbar that appeared and did not follow.
   */
  /**
   * **The `/` menu — the second floating surface, and it is a list.**
   *
   * That is the test of the split. The first cost four layers: a declaration, a command and its
   * state, a themed component, and *where the selection is on screen*. With all four in place this
   * is rows and a keydown handler, and its rows are **the toolbar's insert group, read** — two lists
   * is how a slash menu and an insert toolbar come apart.
   */
  test('a slash menu opens at the caret, offers what the page can insert, and runs a row', async ({ page }) => {
    await ready(page);

    const hero = page.locator('[data-frame="mobile"] h1');
    await pressDeep(page, hero);
    await page.waitForTimeout(200);
    await pressTwice(page, hero);
    await page.waitForTimeout(400);
    await page.keyboard.press('End');
    await page.keyboard.type(' /');
    await page.waitForTimeout(500);

    const rows = page.locator('[data-slash-item]');
    await expect(rows).toHaveCount(10);
    // This product's own inserts, not the shared kit's: a page's blocks have a page's names.
    await expect(page.locator('[data-slash-item="insertQuote"]')).toHaveText(/인용/);

    /*
     * Below the caret, because a caret at the top of a heading has no room above it — the surface
     * flips rather than sitting off the window, which is the case a constant offset gets wrong.
     */
    const menu = (await page.locator('[data-floating-surface]').boundingBox())!;
    const caret = await page.evaluate(() => {
      const dom = window.getSelection();
      const at = dom && dom.rangeCount ? dom.getRangeAt(0).getBoundingClientRect() : null;
      return at ? { top: at.top, bottom: at.bottom } : null;
    });
    expect(menu.y).toBeGreaterThanOrEqual(caret!.top - 1);

    // Typing narrows it, and the arrow moves the highlight.
    await page.keyboard.type('인');
    await page.waitForTimeout(400);
    await expect(rows).toHaveCount(1);

    // And Enter runs the row, which puts a block on the page.
    const before = await page.locator('[data-frame="desktop"] blockquote').count();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    await expect(page.locator('[data-floating-surface]')).toHaveCount(0);
    expect(await page.locator('[data-frame="desktop"] blockquote').count()).toBe(before + 1);
  });

  test('a toolbar follows the words a reader has chosen, and goes when they let go', async ({ page }) => {
    await ready(page);
    await expect(page.locator('[data-floating-surface]')).toHaveCount(0);

    const hero = page.locator('[data-frame="mobile"] h1');
    await pressDeep(page, hero);
    await page.waitForTimeout(200);
    await pressTwice(page, hero);
    await page.waitForTimeout(300);
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(400);

    const bar = page.locator('[data-floating-surface]');
    await expect(bar).toHaveCount(1);

    const box = (await bar.boundingBox())!;
    const words = await page.evaluate(() => {
      const dom = window.getSelection();
      const at = dom && dom.rangeCount ? dom.getRangeAt(0).getClientRects()[0] : null;
      return at ? { top: at.top, left: at.left, width: at.width } : null;
    });

    // Above the words, and centred on them — the two things a reader reads as "this is about these".
    expect(box.y + box.height).toBeLessThanOrEqual(words!.top + 1);
    expect(Math.abs(box.x + box.width / 2 - (words!.left + words!.width / 2))).toBeLessThan(24);

    // And gone when the selection is. A surface that outlives what it describes is a surface a
    // reader presses by accident.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    await expect(bar).toHaveCount(0);
  });

  test('sets the size and the colour of the words a reader has chosen', async ({ page }) => {
    await ready(page);

    const hero = page.locator('[data-frame="mobile"] h1');
    await pressDeep(page, hero);
    await page.waitForTimeout(200);
    await pressTwice(page, hero);
    await page.waitForTimeout(300);
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(300);

    const size = page.getByLabel('글자 크기', { exact: true });
    await expect(size).toBeVisible();
    await size.fill('48');
    await size.press('Enter');
    await page.waitForTimeout(600);

    const drawn = await page.evaluate(() =>
      [...document.querySelectorAll('[data-frame="desktop"] .st-page h1 span')].map(
        (one) => getComputedStyle(one as HTMLElement).fontSize
      )
    );
    // The chosen run at the size that was typed, and the rest of the heading left alone.
    expect(drawn).toContain('48px');
    expect(drawn.filter((one) => one === '48px').length).toBeLessThan(drawn.length);

    // And the field reads it back, so a reader can see what the words already say.
    await expect(size).toHaveValue('48');
  });

  test('links the words a reader has chosen to an address they type', async ({ page }) => {
    await ready(page);

    const field = page.locator('.st-link-address');
    // Nothing selected: not offered, for the picker's reason — a link is a fact about words.
    await expect(field).toHaveCount(0);

    const hero = page.locator('[data-frame="mobile"] h1');
    await pressDeep(page, hero);
    await page.waitForTimeout(200);
    await pressTwice(page, hero);
    await page.waitForTimeout(300);
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(300);
    await expect(field).toBeEnabled();

    await field.fill('barocss.com');
    await field.press('Enter');
    await page.waitForTimeout(600);

    const made = page.locator('[data-frame="desktop"] .st-page h1 a.mark-link');
    await expect(made).toHaveAttribute('href', 'https://barocss.com');
    // One document, three boards — the same link on each, drawn from the same mark.
    await expect(page.locator('[data-frame="tablet"] .st-page h1 a.mark-link')).toHaveAttribute(
      'href',
      'https://barocss.com'
    );

    // The field reads the link back, so a reader can see where the words already go.
    await expect(field).toHaveValue('https://barocss.com');

    /*
     * And 링크 없음 works over it. It used to ask `pageLinkOf`, which answers only about page links —
     * so this button would have been grey over the one kind of link it had just become possible to
     * make, which is a control disabling itself out of the job it exists for.
     */
    const remove = page.getByRole('button', { name: '선택한 글자의 링크를 없앱니다' });
    await expect(remove).toBeEnabled();
    await remove.click();
    await page.waitForTimeout(500);
    await expect(made).toHaveCount(0);
  });

  test('links the words a reader has chosen to a page they pick', async ({ page }) => {
    await ready(page);

    const picker = page.locator('.st-link-page');
    /*
     * Nothing selected: **not offered**, where it used to be a 144-pixel dropdown reading 링크 없음
     * that sat there at all times. What a block links to is a fact about *words*, and a reader who
     * has selected a card is not being asked about it. A mark covers a range, and linking a caret
     * would write a zero-length link — the shape of failure that draws nothing and reports success.
     */
    await expect(picker).toHaveCount(0);

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
    expect(await border()).toBe(await tokenRgb(page, '강조'));
    expect(await border()).not.toBe(resting);

    // Closing it puts the page back, so a reader is never left looking at a state nobody is in.
    await page.locator('.st-state-row button', { hasText: '기본' }).click();
    await page.waitForTimeout(300);
    expect(await border()).toBe(resting);
  });

  test('gives the navigation a target a thumb can hit', async ({ page }) => {
    await ready(page);

    const zoom = await page.evaluate(
      () => Number((document.querySelector('.st-canvas') as HTMLElement).dataset.zoom) || 1
    );
    // Measured back through the zoom: the plane is drawn at whatever the reader is standing at.
    const tall = async (at: ReturnType<Page['locator']>) =>
      ((await at.boundingBox())?.height ?? 0) / zoom;

    // On the wide board it is the link itself: a box rather than a word, which is what gave the
    // hover somewhere to live and the thumb something to land on at the same time.
    expect(
      await tall(
        page.locator('[data-frame="desktop"] [data-name="내비게이션"] .st-stack[data-name="제품"]').first()
      )
    ).toBeGreaterThan(28);

    /*
     * And on a phone it is the **hamburger**, because the wide navigation is not there at 390. Which
     * is the shape of the finding rather than a change of subject: the target a thumb hits on a phone
     * is the one that opens the menu, and until 열림 existed this page had no such block — the four
     * links were being measured in a bar that, at 390, was four words and a button crushed against
     * the wordmark.
     */
    expect(
      await tall(page.locator('[data-frame="mobile"] [data-name="메뉴 열기"]').first())
    ).toBeGreaterThan(40);
  });

  test('publishes the promise as a rule the browser already knows', async ({ page }) => {
    await ready(page);

    const html = await page.evaluate(
      () => (window as never as { exportSite: () => { path: string; html: string }[] }).exportSite()[0].html
    );

    expect(html).toContain(':hover');
    // The pressed-in accent, **through the token** — a hover colour written three times is three
    // colours that drift, and the value is asked of the document so a repaint does not break this.
    expect(html).toContain(await tokenHex(page, '강조진함'));
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
    /*
     * A real `<select>` now, like every other picker in this panel. It was a listbox with a `<button>`
     * trigger, which looked different from the rows above it and — the half that mattered — was
     * outside the sweep that presses every control and checks the document moved.
     */
    await panel(page).getByLabel('설명 변수에 넣을 컬럼').selectOption('분류');
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

    await expect(panel(page).getByLabel('연결된 변수')).toHaveValue('이름');
    await panel(page).getByLabel('연결된 변수').selectOption('');
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

  test('publishes the whole site as one archive, folders and all', async ({ page }) => {
    await ready(page);

    /*
     * **One file, not one per page**, and that changed the day two things did: a picture is written
     * to `assets/로고.png`, and a browser cannot be handed a folder; and a link resolves to a page's
     * address, so `/제품` has to be `제품/index.html` or every link on the published site is broken.
     * Both need a tree, and a zip is the only shape a browser will take one in.
     */
    const wait = page.waitForEvent('download');
    await bar(page).locator('[data-menu="file"]').click();
    await page.locator('[data-menu-item="file.publish.1"]').click();
    const file = await wait;

    // Named after the site's own home page, so two publishes are not two `download.zip`.
    expect(file.suggestedFilename()).toBe('홈.zip');

    /*
     * And it is a real archive with the tree in it — read back with **somebody else's**
     * implementation, because a hand-written zip either is the format or silently is not.
     */
    const at = await file.path();
    const names = await new Promise<string[]>((resolve, reject) => {
      execFile(
        'python3',
        ['-c', 'import zipfile,sys;[print(n) for n in zipfile.ZipFile(sys.argv[1]).namelist()]', at],
        (error, out) => (error ? reject(error) : resolve(out.trim().split('\n')))
      );
    });

    expect(names).toContain('index.html');
    expect(names).toContain('제품/index.html');
    /*
     * **No sitemap**, and that is right rather than missing: every `<loc>` in one is absolute, and
     * this document has not said where the site lives. A sitemap of relative addresses is a file a
     * crawler reads and cannot use.
     */
    expect(names).not.toContain('sitemap.xml');
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
    // The band's own ground, asked of the document — this check is about a hover reaching the page,
    // not about which colour the site is painted in this month.
    expect(await fill()).toBe(await tokenRgb(page, '바탕'));

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

/**
 * **The rows that write the document rather than the block.**
 *
 * `of` says which node a row writes — the *document*, for the site's address, its faces, its tab
 * picture and what a crawler is told. Nothing ever read it, so all of those rows took their value
 * from the selected node, which does not have the attribute and never will: they were **write
 * only**. A reader who set the site's address, went away and came back was shown an empty box; the
 * 검색 제외 switch flicked straight back up, because React redraws a controlled checkbox from a
 * value that was always `undefined`.
 *
 * Invisible from every direction it had been looked at. The commands worked, the document held the
 * values, the published page used them, and every unit test called the commands rather than the
 * panel. It took opening a browser and clicking the switch.
 *
 * So this is a browser test and could not be anything else: what it is about is a control drawing
 * what the document says.
 */
test.describe('a site-wide row shows what the document holds', () => {
  test('reads its own value back, having written it', async ({ page }) => {
    await ready(page);

    const address = page.getByLabel('사이트 주소');
    await address.click();
    await address.fill('https://barocss.test');
    await address.press('Enter');
    await page.waitForTimeout(500);
    await expect(address).toHaveValue('https://barocss.test');

    // A toggle is the one that showed the fault loudest: it came back up on its own.
    const noIndex = page.getByLabel('검색 엔진에서 제외');
    await noIndex.click({ force: true });
    await page.waitForTimeout(500);
    await expect(noIndex).toBeChecked();

    await page.getByLabel('본문 글꼴').selectOption('serif');
    await page.getByLabel('제목 크기 단계').selectOption('loud');
    await page.waitForTimeout(500);
    await expect(page.getByLabel('본문 글꼴')).toHaveValue('serif');
    await expect(page.getByLabel('제목 크기 단계')).toHaveValue('loud');
  });

  /**
   * And the same question one level out: **the site's type on the boards**.
   *
   * The rule was built from `root`, which on this screen is the page being drawn — so `typeRule` was
   * handed attributes that never held a `scale`, emitted the defaults for ever, and changing the
   * face changed the *published* page and nothing a designer could see.
   */
  test('changes what the boards are drawn in, not only what is published', async ({ page }) => {
    await ready(page);

    const sizeOfHeading = () =>
      page
        .locator('[data-frame="desktop"] h1')
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

    /*
     * **Both directions**, because the sample now states a scale of its own: comparing against
     * *bigger* passed only while the document said nothing, and the day it said 크게 the check
     * compared 크게 with 크게 and reported the feature broken. A step down and a step up says what
     * it means at any starting point.
     */
    const was = await sizeOfHeading();
    await page.getByLabel('제목 크기 단계').selectOption('calm');
    await page.waitForTimeout(600);
    expect(await sizeOfHeading()).toBeLessThan(was);

    await page.getByLabel('제목 크기 단계').selectOption('loud');
    await page.waitForTimeout(600);
    expect(await sizeOfHeading()).toBe(was);

    // And the body size, which the panel writes in twips and the rule reads in twips.
    const base = () =>
      page
        .locator('[data-frame="desktop"] .w-paragraph')
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

    // Whatever the document states now — the sample sets its own, and this is about the field
    // reaching the boards rather than about which number the site happens to be set at.
    const started = await base();
    /*
     * **Cleared first.** The field holds what the document states, so focusing and typing appended:
     * 17 became 1722, which is 114px, which is outside the bounds the row offers — so the site went
     * on being drawn at its own size and the check read as a broken feature. A reader replacing a
     * number selects it first; so does this.
     */
    const size = page.getByLabel('본문 글자 크기');
    await size.click();
    await size.fill('22');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    /*
     * 22, not 330. `unit: 'px'` on a row means *stored in twips*, and `baseSize` was the one length
     * here that was read as pixels — so a reader typing 22 wrote 330, which is outside the bounds,
     * and the site went on being drawn at 16 with nothing saying anything.
     */
    expect(await base()).toBe(22);
    expect(started).not.toBe(22);
    await expect(size).toHaveValue('22');
  });
});

/**
 * **A table a reader can insert, type in, and see.**
 *
 * Three separate things, and the model tests only ever covered the first. The gesture matters: a
 * click selects the outermost block and a double-click goes in — a table is a picture of one until
 * the caret can reach a cell.
 */
test.describe('a table on a page', () => {
  test('takes words in a cell and lets the menu add a row', async ({ page }) => {
    await ready(page);

    await press(page, page.locator('[data-frame="desktop"] h2').first());
    await page.waitForTimeout(300);
    await page.locator('[data-insert="insertTableBlock"]').click();
    await page.waitForTimeout(700);

    const table = page.locator('[data-frame="desktop"] table').first();
    await expect(table).toHaveCount(1);
    await expect(table.locator('td, th')).toHaveCount(9);

    // Drawn as a table: full width, a rule under the head, and room inside the cells.
    const drawn = await table.evaluate((el) => {
      const th = el.querySelector('th') as HTMLElement;
      return {
        width: parseFloat(getComputedStyle(el).width),
        border: parseFloat(getComputedStyle(th).borderBottomWidth),
        padding: parseFloat(getComputedStyle(th).paddingLeft)
      };
    });
    expect(drawn.width).toBeGreaterThan(400);
    expect(drawn.border).toBeGreaterThan(0);
    expect(drawn.padding).toBeGreaterThan(0);

    /*
     * **Two gestures to reach a cell**, which is the canvas's own rule and not a table's: a click
     * takes the outermost block and each step in goes one level, so a table selects as a table and
     * the cell is one further. ⌘-click is the shortcut every other nested block here uses — it takes
     * the innermost thing under the pointer — and the double-click after it goes into the words.
     *
     * The table has to be **on screen** first: a caret aimed at a cell the board has scrolled past
     * lands where the click did, which is somewhere else.
     */
    await table.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const cell = table.locator('th').first();
    await pressDeep(page, cell);
    await page.waitForTimeout(400);
    await cell.dblclick({ force: true });
    await page.waitForTimeout(600);
    await page.keyboard.type('요금제');
    await page.waitForTimeout(500);
    await expect(cell).toContainText('요금제');

    const rows = await table.locator('tr').count();
    await page.locator('.st-menubar [data-menu="table"]').click({ force: true });
    await page.waitForTimeout(250);
    const add = page.locator('[data-menu-item="table.rows.1"]');
    await expect(add).toBeEnabled();
    await add.click({ force: true });
    await page.waitForTimeout(600);
    expect(await table.locator('tr').count()).toBe(rows + 1);
  });
});

/**
 * **Every word on every published page can be read.**
 *
 * A contrast check needs three things a unit test cannot have: the composited colour (a token at a
 * weight is `color-mix(... transparent)`, whose readability depends on what is behind it), the
 * *inherited* colour (body text is the band's own ink held back, which resolves differently on every
 * ground), and a real layout to say which ground that is. So it belongs here and nowhere else.
 *
 * It has already earned its place twice. The site's accent was `#E03A1F` and the paper on it came out
 * at **4.24:1** — under AA for text at body size, on every button, badge and price on the site,
 * looking perfectly fine the whole time. And a footer that stated what it was painted and not what it
 * was written in went black on black, which is the same class of fault from the other end.
 *
 * The rule that came out of the first: **an accent that carries words has to be measured against
 * them.** A plate the words sit beside can be any weight; a plate they sit *on* cannot.
 */
test.describe('what a visitor can read', () => {
  test('meets AA on every page, at the widest and the narrowest', async ({ page, context }) => {
    await ready(page);
    const pages = await page.evaluate(() =>
      (window as never as { exportSite: () => { file: string; html: string }[] }).exportSite()
    );

    const visitor = await context.newPage();
    const failures: string[] = [];

    for (const width of [1280, 390]) {
      await visitor.setViewportSize({ width, height: 900 });
      for (const one of pages) {
        await visitor.setContent(one.html);
        await visitor.waitForTimeout(120);

        const said = await visitor.evaluate(() => {
          /** A CSS colour as numbers, whichever of the three notations a browser answers with. */
          const rgba = (value: string): number[] => {
            const said = value.match(/-?\d*\.?\d+/g)?.map(Number) ?? [0, 0, 0];
            const srgb = value.startsWith('color(');
            const [r, g, b] = srgb ? said.slice(0, 3).map((one) => one * 255) : said.slice(0, 3);
            return [r, g, b, said.length > 3 ? said[3] : 1];
          };
          const lum = ([r, g, b]: number[]): number => {
            const f = [r, g, b].map((one) => {
              const c = one / 255;
              return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
          };
          /*
           * The nearest ancestor that actually paints. A page of nested transparent boxes is the
           * ordinary case, and comparing against `rgba(0,0,0,0)` is how a contrast check reports a
           * readable page as unreadable.
           */
          const ground = (el: Element): number[] => {
            let at: Element | null = el;
            while (at) {
              const said = rgba(getComputedStyle(at).backgroundColor);
              if (said[3] > 0.5) return said;
              at = at.parentElement;
            }
            return [255, 255, 255, 1];
          };

          const bad: string[] = [];
          for (const el of document.querySelectorAll('p, h1, h2, h3, h4, a, li, label, button')) {
            if (!el.textContent?.trim() || el.children.length > 0) continue;
            const fg = rgba(getComputedStyle(el).color);
            const bg = ground(el);
            // Composited, because a colour at a weight is an alpha and its readability is the
            // readability of what it becomes over the ground — not of the colour it is a weight of.
            const over = [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
            const one = lum(over);
            const two = lum(bg);
            const ratio = (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
            const large = parseFloat(getComputedStyle(el).fontSize) >= 24;
            if (ratio < (large ? 3 : 4.5)) {
              bad.push(`${ratio.toFixed(2)}:1 ${el.tagName} "${el.textContent.trim().slice(0, 20)}"`);
            }
          }
          return bad;
        });

        for (const one of said) failures.push(`${width}px · ${one}`);
      }
    }

    await visitor.close();
    expect(failures).toEqual([]);
  });
});

/**
 * **The two handles a flow block has**, and the rule that keeps them out of the padding's way.
 *
 * A page has no coordinates — where a block sits is a parent and a place in that parent's content —
 * so seven of the eight handles a canvas offers would be lying about what they can do. What is
 * genuinely draggable is how wide a block may be and how tall it must be.
 *
 * The rule underneath is one sentence: **inside the edge is the space in it, outside the edge is how
 * big it is.** The first version shared six pixels with the padding band and won them, so a gesture
 * that had worked for weeks silently stopped writing — which is why the padding drag is checked here
 * too, in the same file, one test above.
 */
test.describe('pulling a block bigger', () => {
  test('drags the right edge into the document, once, in twips', async ({ page }) => {
    await ready(page);

    const held = await page.evaluate(() => {
      const editor = (window as never as { editor: any }).editor;
      const store = editor.dataStore;
      let found = '';
      const walk = (sid: string, depth = 0) => {
        const node = store.getNode(sid);
        if (!node || found || depth > 40) return;
        if (node.stype === 'picture' && node.attributes?.sizing === 'fixed') found = sid;
        for (const child of node.content ?? []) if (typeof child === 'string') walk(child, depth + 1);
      };
      walk(editor.getRootId());
      editor.executeCommand('setNode', { nodeIds: [found] });
      return found;
    });
    await page.waitForTimeout(500);

    const widthOf = async () =>
      await page.evaluate(
        (sid) => (window as never as { editor: any }).editor.dataStore.getNode(sid).attributes.maxWidth,
        held
      );
    const entriesOf = async () =>
      await page.evaluate(
        () => (window as never as { editor: any }).editor.historyManager?.getStats?.().totalEntries ?? -1
      );

    const before = await widthOf();
    const entries = await entriesOf();

    const grip = page.locator('.st-grip[data-grip-edge="right"]').first();
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 90, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const after = await widthOf();
    expect(after).toBeLessThan(before);
    /*
     * Twips, which is what the document keeps: a drag reading a rectangle in CSS pixels and writing
     * the number straight in would put a 400px picture in the document as a quarter of an inch.
     */
    expect(after % 15).toBe(0);
    // One drag, one entry — the padding band's rule, and the ruler's before it.
    expect(await entriesOf()).toBe(entries + 1);
  });

  test('leaves the padding band its own ten pixels', async ({ page }) => {
    await ready(page);
    await press(page, cardRow(page, 'desktop'));
    await page.waitForTimeout(400);

    /*
     * The claim in one measurement: the resize handle is **entirely outside** the block, so the strip
     * the padding band takes the pointer on is untouched. Shared, the handle won and a padding drag
     * silently stopped writing.
     */
    const overlap = await page.evaluate(() => {
      const mark = document.querySelector('.st-mark-selected');
      if (!mark) return 'no selection';
      const box = mark.getBoundingClientRect();
      const grip = mark.querySelector('.st-grip[data-grip-edge="bottom"]');
      if (!grip) return 'no grip';
      return grip.getBoundingClientRect().top >= box.bottom - 0.5 ? 'outside' : 'overlapping';
    });
    expect(overlap).toBe('outside');
  });
});

/**
 * **A door onto what can be added**, beside the tool the reader is holding.
 *
 * Everything it opens is reachable three other ways — the 추가 rail, the 삽입 menu, the slash menu at
 * the caret. What none of those is, is *here*, where the pointer already is on a screen whose rail
 * may be showing pages or data or nothing.
 *
 * What is checked is that it is a **doorway and not a fourth list**: it draws the same declaration
 * the rail draws, plus the document's own definitions, and a control in it runs the command and
 * leaves. A list written out again in this file is the mistake `toolbar-model.ts` exists to have
 * already made once, when five working inserts had no button.
 */
test.describe('the + beside the tool', () => {
  /** The blocks of the home page, which is what an insert with nothing selected adds one to. */
  const blocks = (page: Page) => page.locator('[data-frame="desktop"] .st-page > .st-stack');

  test('offers the rail’s own list and the document’s components, and inserts from it', async ({ page }) => {
    await ready(page);

    const before = await blocks(page).count();
    await page.getByLabel('넣을 것 고르기').click();
    await page.waitForTimeout(400);

    await expect(page.locator('.st-add-sheet h3')).toHaveText(['담는 것', '넣는 것', '컴포넌트']);

    /*
     * The same commands the rail draws — read from the same declaration, so this compares the two
     * surfaces rather than comparing one of them with a list typed here.
     */
    const inTheSheet = await page.locator('[data-add]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-add'))
    );
    const inTheRail = await page.locator('[data-insert]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-insert'))
    );
    for (const command of inTheRail) expect(inTheSheet).toContain(command);
    // And the definitions, which the rail keeps in a different panel and a reader does not.
    expect(inTheSheet).toContain('insertPlacement');

    await page.locator('[data-add="insertSection"]').click();
    await page.waitForTimeout(700);

    // It inserted, and it closed: a dialog a reader dismisses after it has done the errand asks twice.
    await expect(blocks(page)).toHaveCount(before + 1);
    await expect(page.locator('.st-add-sheet')).toHaveCount(0);
  });

  /**
   * And every picture in it is a **picture**.
   *
   * Three of them were the words `accordion`, `tabs` and `form` — an icon name with no glyph draws as
   * its own name — in the rail as well, since the day those blocks were added. The check that exists
   * to catch exactly that was green, because an exemption written about the favicon attribute is
   * keyed `icon` and so is the family of every missing-icon finding.
   */
  test('draws a picture for every one of them, never a name', async ({ page }) => {
    await ready(page);
    await page.getByLabel('넣을 것 고르기').click();
    await page.waitForTimeout(400);

    const wordy = await page.locator('[data-add]').evaluateAll((els) =>
      els
        .filter((el) => !el.querySelector('svg'))
        .map((el) => el.textContent?.trim() ?? '')
    );
    expect(wordy).toEqual([]);
  });
});

/**
 * **The data grid, made to feel like a spreadsheet.**
 *
 * The reason a dataset exists is that the data is somewhere else, and typing forty cells back in one
 * at a time is the work the feature was supposed to remove. Two gestures make the difference: a
 * block of cells pasted, and moving between cells by direction rather than by tab order.
 */
test.describe('the data grid', () => {
  const openGrid = async (page: Page) => {
    await ready(page);
    await page.locator('[data-panel="data"]').click();
    await page.waitForTimeout(300);
    await page.getByLabel('상품 목록 데이터 고치기').click();
    await page.waitForTimeout(500);
  };

  /** A spreadsheet's clipboard: tabs across, newlines down. */
  const pasteInto = async (page: Page, cell: string, text: string) => {
    const at = page.locator(`input[data-cell="${cell}"]`);
    await at.click();
    await at.evaluate((el, said) => {
      const data = new DataTransfer();
      data.setData('text/plain', said);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, text);
    await page.waitForTimeout(500);
  };

  const rowsOf = (page: Page) =>
    page.evaluate(() => {
      const editor = (window as never as { editor: any }).editor;
      const store = editor.dataStore;
      let said: any = null;
      const walk = (sid: string) => {
        const node = store.getNode(sid);
        if (!node || said) return;
        if (node.stype === 'dataset' && node.attributes?.name === '상품') said = node.attributes;
        for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
      };
      walk(editor.getRootId());
      return said.records as Record<string, unknown>[];
    });

  test('takes a block of cells, in one thing to undo', async ({ page }) => {
    await openGrid(page);
    const entries = () =>
      page.evaluate(
        () => (window as never as { editor: any }).editor.historyManager?.getStats?.().totalEntries ?? -1
      );

    const before = await entries();
    await pasteInto(page, '1:이름', '붙인 하나\t붙인 설명\n붙인 둘\t둘째 설명\n');

    const rows = await rowsOf(page);
    expect(rows[1]['이름']).toBe('붙인 하나');
    expect(rows[2]['설명']).toBe('둘째 설명');
    /*
     * Forty writes would be forty presses of undo with a half-pasted table in between. The padding
     * drag's rule, and the ruler's before it.
     */
    expect(await entries()).toBe(before + 1);
  });

  test('grows the table for a paste taller than it, and trims one wider', async ({ page }) => {
    await openGrid(page);
    const before = (await rowsOf(page)).length;

    await pasteInto(page, `${before - 1}:이름`, '가\n나\n다\n라');
    expect((await rowsOf(page)).length).toBe(before + 3);

    // A column has a name a reference resolves through, so a wider paste is trimmed rather than
    // inventing one — five columns and a trimmed paste beats a document carrying `엑셀 열 6`.
    const columns = await page.locator('thead input[aria-label$="열 이름"]').count();
    await pasteInto(page, '0:분류', '끝\t넘침 하나\t넘침 둘');
    expect(await page.locator('thead input[aria-label$="열 이름"]').count()).toBe(columns);
    expect((await rowsOf(page))[0]['분류']).toBe('끝');
  });

  /**
   * And **moving by direction**, which Tab cannot do: tab order walks along a row and into the
   * delete button at the end of it, which is where a reader pressing it to reach the next column
   * arrives.
   */
  test('moves by direction, and leaves the caret alone inside a word', async ({ page }) => {
    await openGrid(page);
    const where = () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-cell') ?? document.activeElement?.tagName);

    await page.locator('input[data-cell="1:설명"]').click();
    await page.keyboard.press('ArrowDown');
    expect(await where()).toBe('2:설명');
    await page.keyboard.press('Enter');
    expect(await where()).toBe('3:설명');
    await page.keyboard.press('ArrowUp');
    expect(await where()).toBe('2:설명');

    // Sideways only from an end, because those keys are the caret's while there is a word to move in.
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowRight');
    expect(await where()).toBe('2:가격');

    await page.locator('input[data-cell="0:설명"]').click();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    expect(await where()).toBe('0:설명');
    expect(await page.evaluate(() => (document.activeElement as HTMLInputElement).selectionStart)).toBe(1);
  });
});

/**
 * **Putting a section of the panel away.**
 *
 * Measured before it existed: the properties panel drew **759 pixels** of controls in five open
 * sections, so a reader who wanted a shadow scrolled past a whole arrangement and a whole size to
 * reach it. Every inspector in this class folds and this one had no way to.
 *
 * The fold is held by the app and not by the document, which is the row preview's argument exactly:
 * which sections a person has put away is a fact about *this reader, this minute*, and a document
 * carrying it would hand the next person a panel with three sections mysteriously shut.
 */
test.describe('a panel section that folds', () => {
  const contentHeight = (page: Page) =>
    page.evaluate(() => {
      const sections = [...document.querySelectorAll('.office-properties section')];
      if (!sections.length) return 0;
      return Math.round(
        sections[sections.length - 1].getBoundingClientRect().bottom -
          sections[0].getBoundingClientRect().top
      );
    });

  test('shortens the panel, and keeps the controls it is hiding', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-layer]').nth(2).click();
    await page.waitForTimeout(500);

    const open = await contentHeight(page);
    const heads = page.locator('.office-properties [aria-expanded]');
    expect(await heads.count()).toBeGreaterThan(2);

    await heads.nth(1).click();
    await page.waitForTimeout(200);
    await expect(heads.nth(1)).toHaveAttribute('aria-expanded', 'false');
    expect(await contentHeight(page)).toBeLessThan(open);

    /*
     * `hidden`, not unrendered: a folded section's controls keep their state — a half-typed number,
     * an open colour popover — and a reader who folds and unfolds expects to find what they left.
     */
    expect(await page.locator('.office-properties [hidden]').count()).toBeGreaterThan(0);
  });

  /**
   * And it **survives the selection moving**, which is the whole point: a reader who put 그림자 away
   * is not asking to be shown it again the moment they click the next block.
   */
  test('stays folded as the selection moves', async ({ page }) => {
    await ready(page);
    await page.locator('[data-panel="layers"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-layer]').nth(2).click();
    await page.waitForTimeout(500);

    const named = async (at: number) =>
      await page.locator('.office-properties [aria-expanded] h3').nth(at).innerText();
    const label = await named(1);
    await page.locator('.office-properties [aria-expanded]').nth(1).click();
    await page.waitForTimeout(200);

    await page.locator('[data-layer]').nth(3).click();
    await page.waitForTimeout(500);

    const head = page.locator('.office-properties [aria-expanded]', { hasText: label }).first();
    await expect(head).toHaveAttribute('aria-expanded', 'false');
  });
});
