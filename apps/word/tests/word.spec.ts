import { test, expect } from '@playwright/test';

/**
 * Word in a browser.
 *
 * The schema, kit and resolvers are covered by unit tests; what those cannot
 * cover is whether they meet correctly in a real DOM with a real caret. Every
 * assertion here failed at some point during development for a reason no unit
 * test saw.
 */

/**
 * Click, then wait for the editor to actually have the caret there.
 *
 * Selection reaches the model through selectionchange, which is asynchronous —
 * acting on the next line would run against an editor that has no selection yet
 * and silently do nothing.
 */
async function placeCaret(page: import('@playwright/test').Page, selector: string, index = 0) {
  await page.locator(selector).nth(index).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const sel = (window as any).editor?.selection;
        return sel?.type === 'range' ? sel.startNodeId : null;
      })
    )
    .not.toBeNull();
}

test.describe('Word document rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.w-surface')).toBeVisible();
  });

  test('renders the document metadata outside the flow', async ({ page }) => {
    // The title lives in docMeta, not on the page
    await expect(page.locator('.w-doc-title')).toHaveText('Barocss Word');
    await expect(page.locator('.w-surface .w-doc-title')).toHaveCount(0);
    // Definitions are content but not laid out
    await expect(page.locator('.w-resources')).toHaveCSS('display', 'none');
  });

  test('lays the section out at the width it describes', async ({ page }) => {
    // US Letter with one-inch side margins, in the document's own units. The
    // height belongs to the sheets now: how tall a section is depends on how far
    // its text reached, which is not something the section can state.
    const style = await page.locator('.w-surface').first().getAttribute('style');
    expect(style).toContain('width: 612pt');
    expect(style).toContain('padding-left: 72pt');
    expect(style).toContain('padding-right: 72pt');
  });

  test('applies the style cascade, with direct formatting winning', async ({ page }) => {
    // Heading1 → Normal → docDefaults
    const heading = page.locator('h1.w-heading').first();
    await expect(heading).toHaveCSS('font-weight', '700');
    await expect(heading).toHaveCSS('font-family', /Georgia/);

    // A paragraph that overrides its style's alignment
    const centred = page.locator('.w-paragraph').filter({ hasText: 'Direct formatting wins' });
    await expect(centred).toHaveCSS('text-align', 'center');
  });

  test('computes list numbers rather than storing them', async ({ page }) => {
    const markers = await page
      .locator('[data-marker]:not([data-marker=""])')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-marker')?.trim()));

    // Deeper counters restart when a shallower one advances
    expect(markers).toEqual(['1.', 'a.', 'i.', 'b.', '2.']);
  });

  test('renders a merged cell as a span, not as extra cells', async ({ page }) => {
    await expect(page.locator('th[colspan="2"]')).toHaveText('Merged header');
    // 2 header cells + 6 body cells; the swallowed cell is not in the model
    await expect(page.locator('.w-cell')).toHaveCount(8);
  });
});

test.describe('Word editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.w-surface')).toBeVisible();
  });

  test('types into a paragraph and undoes the whole burst at once', async ({ page }) => {
    const paragraph = page.locator('.w-paragraph').first();
    const before = await paragraph.textContent();

    await placeCaret(page, '.w-paragraph');
    await page.keyboard.type('XYZ', { delay: 80 });
    await expect(paragraph).not.toHaveText(before!);

    // One undo, not three
    await page.keyboard.press('Control+z');
    await expect(paragraph).toHaveText(before!);
  });

  test('Enter adds a block', async ({ page }) => {
    const paragraphs = page.locator('.w-paragraph');
    const before = await paragraphs.count();

    await placeCaret(page, '.w-paragraph');
    await page.keyboard.press('Enter');

    await expect(paragraphs).toHaveCount(before + 1);
  });

  test('Tab moves between cells, and only inside a table', async ({ page }) => {
    await placeCaret(page, '.w-cell', 2);
    await expect
      .poll(() => page.evaluate(() => (window as any).editor.getContext('inTable')))
      .toBe(true);

    await page.keyboard.press('Tab');
    const cell = await page.evaluate(() => {
      const s = window.getSelection();
      const el = s?.anchorNode?.nodeType === 3 ? s.anchorNode.parentElement : (s?.anchorNode as Element | null);
      return el?.closest('.w-cell')?.textContent;
    });
    expect(cell).toBe('B1');

    await placeCaret(page, '.w-paragraph');
    await expect
      .poll(() => page.evaluate(() => (window as any).editor.getContext('inTable')))
      .toBe(false);
  });

  test('inserts a table row with a full set of cells', async ({ page }) => {
    await placeCaret(page, '.w-cell', 2);
    await page.evaluate(() => (window as any).editor.executeCommand('insertRowBelow', {}));

    // three more cells, matching the grid width rather than the row's child count
    await expect(page.locator('.w-cell')).toHaveCount(11);
  });
});

/**
 * Pagination is measured, not asserted from the model, so these checks read the
 * browser back: where a sheet is, and where the first block of a page actually
 * landed. A unit test cannot answer either question.
 */
test.describe('pages', () => {
  test('draws a sheet per computed page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    // The sample document is deliberately longer than a page, so that the
    // interesting case — a break — is the one being measured.
    const sheets = page.locator('.w-sheet');
    expect(await sheets.count()).toBeGreaterThan(1);

    const first = await sheets.first().boundingBox();
    // US Letter at 96dpi: 8.5in x 11in
    expect(Math.round(first!.width)).toBe(816);
    expect(Math.round(first!.height)).toBe(1056);
  });

  test('stacks sheets without overlapping', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const boxes = await page.locator('.w-sheet').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().top)
    );
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]).toBeGreaterThan(boxes[i - 1] + 1000);
    }
  });

  test('keeps the sheets out of the way of the text', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    // A page sheet must not be selectable, focusable, or editable
    const editable = await page.locator('.w-sheets').getAttribute('contenteditable');
    expect(editable).toBe('false');
    expect(await page.locator('.w-sheets').getAttribute('aria-hidden')).toBe('true');
  });

  test('starts each page at the top of its own sheet', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const result = await page.evaluate(() => {
      const sheets = Array.from(document.querySelectorAll('.w-sheet'));
      if (sheets.length < 2) return { pages: sheets.length, offsets: [] as number[] };

      const surface = document.querySelector('.w-surface')!;
      const blocks = Array.from(surface.children).filter((el) => el.hasAttribute('data-bc-sid'));

      // For every sheet after the first, find the block that starts on it and
      // report how far below the sheet's top margin it landed.
      const offsets: number[] = [];
      for (let i = 1; i < sheets.length; i++) {
        const sheetTop = sheets[i].getBoundingClientRect().top;
        const contentTop = sheetTop + 96; // 1in margin
        const opener = blocks.find((b) => b.getBoundingClientRect().top >= sheetTop);
        if (opener) offsets.push(opener.getBoundingClientRect().top - contentTop);
      }
      return { pages: sheets.length, offsets };
    });

    expect(result.pages).toBeGreaterThan(1);
    expect(result.offsets.length).toBeGreaterThan(0);
    for (const offset of result.offsets) {
      // Within a pixel of the sheet's content top
      expect(Math.abs(offset)).toBeLessThan(1.5);
    }
  });
});
