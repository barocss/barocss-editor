import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * The shell, and the map down its left side.
 *
 * The whole page used to scroll, which took the ribbon and the ruler off the
 * screen with it — and a ruler the text is not beside is a ruler for nothing.
 * The window is the frame now: the chrome holds its place, and the one thing
 * that scrolls is the document.
 *
 * The outline needed no new reading of the document. `tocEntries` already
 * answers exactly this, headings and `outlineLevel` paragraphs alike, so the
 * contents page and this pane are two drawings of one answer.
 */

test('the window is the frame, and only the document scrolls', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(400);

  const before = await page.evaluate(() => {
    const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect().top;
    return {
      ruler: Math.round(rect('.w-ruler')),
      documentScroll: document.querySelector('.w-shell-document')!.scrollTop,
      windowScrollable:
        document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight
    };
  });
  // Nothing for the window itself to scroll: the shell is exactly the viewport
  expect(before.windowScrollable).toBeLessThanOrEqual(1);

  await page.locator('.w-shell-document').evaluate((pane) => pane.scrollBy(0, 1200));
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => ({
    ruler: Math.round(document.querySelector('.w-ruler')!.getBoundingClientRect().top),
    documentScroll: Math.round(document.querySelector('.w-shell-document')!.scrollTop)
  }));

  expect(after.documentScroll, 'the document did not scroll').toBeGreaterThan(500);
  expect(after.ruler, 'the ruler scrolled away with the page').toBe(before.ruler);
});

test('the outline lists every heading, indented by its level', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(400);

  const items = page.locator('.w-outline [data-outline-sid]');
  expect(await items.count()).toBeGreaterThan(3);

  // The levels the document actually has, and a deeper one indented further
  const levels = await items.evaluateAll((els) =>
    els.map((el) => Number(el.getAttribute('data-outline-level')))
  );
  expect(Math.min(...levels)).toBe(1);
  expect(Math.max(...levels)).toBeGreaterThan(1);

  const padding = await items.evaluateAll((els) =>
    els.map((el) => parseFloat(getComputedStyle(el).paddingLeft))
  );
  const deepest = levels.indexOf(Math.max(...levels));
  const shallowest = levels.indexOf(1);
  expect(padding[deepest]).toBeGreaterThan(padding[shallowest]);
});

test('the outline goes deeper than the contents page does', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(400);

  // A contents page lists 1–3 by default; a map that hid the rest would
  // disagree with the document it is a map of.
  const inOutline = await page
    .locator('.w-outline [data-outline-sid]')
    .evaluateAll((els) => els.map((el) => el.textContent?.trim()));
  const inContents = await page
    .locator('.w-toc-entry')
    .evaluateAll((els) => els.map((el) => el.textContent?.replace(/[\s.]*\d+$/, '').trim()));

  expect(inOutline.length).toBeGreaterThanOrEqual(inContents.length);
  for (const entry of inContents) {
    if (entry) expect(inOutline.some((one) => one?.startsWith(entry.slice(0, 12)))).toBe(true);
  }
});

test('clicking an entry takes the reader and the caret there', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(400);

  const items = page.locator('.w-outline [data-outline-sid]');
  const last = items.nth((await items.count()) - 1);
  const sid = await last.getAttribute('data-outline-sid');

  await last.click();

  // Waited for rather than slept through: the pane scrolls smoothly, and how
  // long seven thousand pixels take is not a number a test should be guessing.
  await expect
    .poll(
      () =>
        page.evaluate((target: string) => {
          const heading = document.querySelector(`#editor [data-bc-sid="${CSS.escape(target)}"]`);
          const box = heading?.getBoundingClientRect();
          return !!box && box.top > 0 && box.top < window.innerHeight;
        }, sid!),
      { timeout: 8000, message: 'the heading was not brought into view' }
    )
    .toBe(true);

  const landed = await page.evaluate((target: string) => {
    const heading = document.querySelector(`#editor [data-bc-sid="${CSS.escape(target)}"]`);
    const box = heading!.getBoundingClientRect();
    const selection = (window as any).editor.selection;
    return {
      onScreen: box.top > 0 && box.top < window.innerHeight,
      caretIn: selection?.startNodeId ?? null,
      inside: !!heading!.querySelector(`[data-bc-sid="${CSS.escape(selection?.startNodeId ?? '')}"]`)
    };
  }, sid!);

  expect(landed.onScreen).toBe(true);
  // The caret goes with the reader, so they can start typing where they asked
  expect(landed.inside).toBe(true);
  await expect(last).toHaveClass(/is-here/);
});

test('closes to a strip, and opens again', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(400);

  await page.locator('.w-outline-title button').click();
  await expect(page.locator('.w-outline')).toHaveCount(0);
  // A pane with no way back is a pane a reader closes once
  await page.locator('.w-outline-closed').click();
  await expect(page.locator('.w-outline')).toHaveCount(1);
});

/**
 * The comments pane, which used to hold a fifth of the window with nothing in
 * it. It collapses the way the outline does, and the strip that opens it says
 * how many comments there are — which is what a reader wants before deciding to
 * look.
 */
test('the comments pane collapses to a strip that counts', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(400);

  const openWidth = (await page.locator('.w-comments-pane').boundingBox())!.width;
  expect(openWidth).toBeGreaterThan(200);

  await page.locator('.w-comments-close').click();
  await expect(page.locator('.w-comments-pane')).toHaveCount(0);

  const strip = page.locator('.w-comments-closed');
  await expect(strip).toBeVisible();
  expect((await strip.boundingBox())!.width).toBeLessThan(48);

  // It counted the document's threads while closed, which it could not do while
  // it only read them when open
  const counted = Number(await strip.getAttribute('data-comment-count'));
  expect(Number.isFinite(counted)).toBe(true);

  await strip.click();
  await expect(page.locator('.w-comments-pane')).toHaveCount(1);
});

test('closing the pane puts the discussion away, not the sign of it', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(400);

  const marks = page.locator('.w-comment-anchor, [data-bc-decorator*="comment"]');
  const before = await marks.count();
  test.skip(before === 0, 'the sample has no commented text to mark');

  await page.locator('.w-comments-close').click();
  await page.waitForTimeout(300);
  // The text stays marked: a reader who closes the pane should not lose every
  // sign that there is a comment
  expect(await marks.count()).toBe(before);
});

/**
 * Which chrome is showing is the host's business, not the document's.
 *
 * These are the only ribbon controls that do not name a command — the editor has
 * no idea a pane exists, the same reason the find box is opened by the app. They
 * are in the ribbon anyway because that is where a reader looks for a switch.
 */
test('the ribbon turns each pane on and off, and says which is on', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(400);

  const outlineButton = page.locator('[data-control="view-outline"]');
  const commentsButton = page.locator('[data-control="view-comments"]');

  await expect(outlineButton).toHaveAttribute('data-state', 'on');
  await expect(commentsButton).toHaveAttribute('data-state', 'on');

  await outlineButton.click();
  await expect(page.locator('.w-outline')).toHaveCount(0);
  await expect(outlineButton).toHaveAttribute('data-state', 'off');

  await commentsButton.click();
  await expect(page.locator('.w-comments-pane')).toHaveCount(0);
  await expect(commentsButton).toHaveAttribute('data-state', 'off');

  // With both away the document has the window, which is the point of a switch
  const pane = (await page.locator('.w-shell-document').boundingBox())!;
  expect(pane.width).toBeGreaterThan(page.viewportSize()!.width - 100);

  await outlineButton.click();
  await commentsButton.click();
  await expect(page.locator('.w-outline')).toHaveCount(1);
  await expect(page.locator('.w-comments-pane')).toHaveCount(1);
});

test('the pane and its own close button say the same thing', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(400);

  // Closed from inside the pane, the ribbon has to agree — two switches for one
  // thing is two things a reader has to keep in their head
  await page.locator('.w-outline-title button').click();
  await expect(page.locator('[data-control="view-outline"]')).toHaveAttribute('data-state', 'off');

  await page.locator('.w-outline-closed').click();
  await expect(page.locator('[data-control="view-outline"]')).toHaveAttribute('data-state', 'on');
});

/**
 * **How the contents are set** — the three things the field says about itself that nothing read.
 *
 * A `tableOfContents` carries `leader`, `rightAlignPageNumbers` and `useHyperlinks`. The stylesheet
 * drew a dotted rule and said in a comment that *"the dotted leader is a viewer concern"*, which was
 * a rationalisation of an unread attribute: **which** leader is the document's and how it is painted
 * is the viewer's — two decisions, and only the second was being made. The numbers were always right
 * aligned, and an entry always took a reader to its heading, so turning either off did nothing.
 *
 * Loaded rather than commanded, because Word has no field-settings dialog yet — a field's own
 * settings are one of the four dialogs its conformance file lists as owed.
 */
test.describe('how a table of contents is set', () => {
  const reload = (page: import('@playwright/test').Page, attrs: Record<string, unknown>) =>
    page.evaluate((wanted) => {
      const editor = (window as any).editor;
      const tree = editor.exportDocument(editor.getRootId());
      const find = (node: any): any => {
        if (node?.stype === 'tableOfContents') return node;
        for (const child of node?.content ?? []) {
          if (typeof child === 'object') {
            const found = find(child);
            if (found) return found;
          }
        }
        return undefined;
      };
      Object.assign(find(tree).attributes, wanted);
      editor.loadDocument(tree, 'word');
    }, attrs);

  const leaderOf = (page: import('@playwright/test').Page) =>
    page.locator('.w-toc-entry').first().evaluate((el) => ({
      said: el.getAttribute('data-leader'),
      drawn: getComputedStyle(el.querySelector('.w-toc-text')!, '::after').borderBottomStyle,
      grows: getComputedStyle(el.querySelector('.w-toc-text')!).flexGrow
    }));

  test('draws the leader the field asks for', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await page.waitForSelector('.w-toc-entry');

    // Dots by default, which is Word's and the one a reader pictures.
    expect(await leaderOf(page)).toMatchObject({ said: 'dot', drawn: 'dotted' });

    await reload(page, { leader: 'hyphen' });
    await page.waitForTimeout(700);
    expect(await leaderOf(page)).toMatchObject({ said: 'hyphen', drawn: 'dashed' });

    await reload(page, { leader: 'underscore' });
    await page.waitForTimeout(700);
    expect(await leaderOf(page)).toMatchObject({ said: 'underscore', drawn: 'solid' });

    // And none, which has to remove the rule rather than draw a fainter one.
    await reload(page, { leader: 'none' });
    await page.waitForTimeout(700);
    const bare = await page
      .locator('.w-toc-entry')
      .first()
      .evaluate((el) => getComputedStyle(el.querySelector('.w-toc-text')!, '::after').content);
    expect(bare).toBe('none');
  });

  /*
   * Numbers that follow the text instead of lining up down the right edge — and no leader with them,
   * because there is no gap left to cross.
   */
  test('lets the page numbers follow the text', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await page.waitForSelector('.w-toc-entry');

    expect((await leaderOf(page)).grows).toBe('1');

    await reload(page, { rightAlignPageNumbers: false });
    await page.waitForTimeout(700);

    const drawn = await leaderOf(page);
    expect(drawn.said).toBe('none');
    expect(drawn.grows).toBe('0');
  });

  /**
   * And an entry that is not a link takes nobody anywhere.
   *
   * The switch existed and nothing read it: the click handler matched `.w-toc-entry` and went, every
   * time. Measured by where the reader ends up rather than by the attribute, because what
   * `useHyperlinks` means is what a press does.
   */
  test('goes nowhere when the field says its entries are not links', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await page.waitForSelector('.w-toc-entry');

    await reload(page, { useHyperlinks: false });
    await page.waitForTimeout(700);

    const entry = page.locator('.w-toc-entry').nth(1);
    await expect(entry).toHaveAttribute('data-linked', 'false');
    // Not offered as a link either: no pointer, and nothing for the keyboard to land on.
    expect(await entry.evaluate((el) => getComputedStyle(el).cursor)).not.toBe('pointer');
    expect(await entry.getAttribute('role')).toBeNull();

    const where = await page.evaluate(() => window.scrollY);
    await entry.click();
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => window.scrollY)).toBe(where);
  });
});

