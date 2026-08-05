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

test.describe('pages follow the text', () => {
  test('repaginates as content grows past the last page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const before = await page.locator('.w-sheet').count();

    // Add enough blocks to need another sheet. Nothing in the app asks for a
    // relayout: the view runs the pass after each render, which is the wiring
    // this checks.
    await placeCaret(page, '.w-paragraph', 1);
    for (let i = 0; i < 60; i++) await page.keyboard.press('Enter');

    await expect
      .poll(async () => page.locator('.w-sheet').count(), { timeout: 15000 })
      .toBeGreaterThan(before);
  });

  test('gives back the pages when the content shrinks again', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const before = await page.locator('.w-sheet').count();

    await placeCaret(page, '.w-paragraph', 1);
    for (let i = 0; i < 20; i++) await page.keyboard.press('Enter');
    await expect
      .poll(async () => page.locator('.w-sheet').count(), { timeout: 15000 })
      .toBeGreaterThan(before);

    // Undone rather than deleted: Backspace at the start of a block does not
    // merge it into the one before yet, so it cannot shrink the document.
    for (let i = 0; i < 25; i++) await page.keyboard.press('Control+z');
    await expect
      .poll(async () => page.locator('.w-sheet').count(), { timeout: 15000 })
      .toBe(before);
  });
});

test.describe('what leaves the editor', () => {
  test('does not copy the page sheets', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    // The sheets sit in the content tree because that is where the geometry they
    // align to lives. Someone pasting into another document has no use for them.
    const copied = await page.evaluate(async () => {
      const surface = document.querySelector('.w-surface')!;
      const range = document.createRange();
      range.selectNodeContents(surface);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);

      let html = '';
      const onCopy = (event: ClipboardEvent) => {
        html = event.clipboardData?.getData('text/html') ?? '';
      };
      // Bubble phase, so the editor's own handler has already rewritten the
      // payload by the time this reads it.
      document.addEventListener('copy', onCopy);
      document.execCommand('copy');
      document.removeEventListener('copy', onCopy);
      return html;
    });

    expect(copied).not.toContain('w-sheet');
    // ...and the document itself still came along
    expect(copied).toContain('Styles cascade');
  });

  test('still draws the sheets it refused to copy', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.w-sheet').first()).toBeVisible();
    expect(await page.locator('.w-sheet').count()).toBeGreaterThan(1);
  });
});

test.describe('Backspace at a block boundary', () => {
  test('merges a block into the one before it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const paragraphs = () => page.locator('.w-paragraph').count();
    const before = await paragraphs();

    // Split a paragraph, then undo the split with Backspace
    await placeCaret(page, '.w-paragraph', 1);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect.poll(paragraphs).toBe(before + 1);

    await page.keyboard.press('Backspace');
    await expect.poll(paragraphs).toBe(before);
  });

  test('shrinks the document, so the pages come back', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const sheets = () => page.locator('.w-sheet').count();
    const before = await sheets();

    await placeCaret(page, '.w-paragraph', 1);
    for (let i = 0; i < 20; i++) await page.keyboard.press('Enter');
    await expect.poll(sheets, { timeout: 15000 }).toBeGreaterThan(before);

    for (let i = 0; i < 20; i++) await page.keyboard.press('Backspace');
    await expect.poll(sheets, { timeout: 15000 }).toBe(before);
  });

  test('keeps the engine keys a product map does not restate', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    // Bindings are gated on editorFocus, so the caret has to be in the document
    // before asking what a key resolves to.
    await placeCaret(page, '.w-paragraph', 1);

    // Word's map says nothing about Backspace or the arrow keys; they are engine
    // defaults, and a product replacing the map must not lose them.
    const resolved = await page.evaluate(() => {
      const editor = (window as any).editor;
      return ['Backspace', 'Enter', 'Delete', 'ArrowLeft', 'ArrowRight'].map(
        (key) => editor.keybindings.resolve(key).length
      );
    });
    expect(resolved.every((count) => count > 0)).toBe(true);
  });
});

test.describe('diagnostics', () => {
  test('says nothing while typing', async ({ page }) => {
    let logs = 0;
    page.on('console', (message) => {
      if (message.type() === 'log') logs++;
    });

    await page.goto('/');
    await page.waitForSelector('.w-sheet');
    await placeCaret(page, '.w-paragraph', 1);

    logs = 0;
    await page.keyboard.type('hello world');
    await page.waitForTimeout(300);

    // This used to be ~50 lines per keystroke, each building an object, in
    // production. Typing is the hottest path there is.
    expect(logs).toBe(0);
  });

  test('but says plenty when asked to', async ({ page }) => {
    // Gated, not deleted: the same tracing that found the Backspace bug is still
    // there, one localStorage key away.
    await page.addInitScript(() => {
      localStorage.setItem('barocss:debug', '*');
    });

    let logs = 0;
    page.on('console', (message) => {
      if (message.type() === 'log') logs++;
    });

    await page.goto('/');
    await page.waitForSelector('.w-sheet');
    await placeCaret(page, '.w-paragraph', 1);
    await page.keyboard.type('hello');
    await page.waitForTimeout(300);

    expect(logs).toBeGreaterThan(0);
  });
});

test.describe('page furniture', () => {
  test('repeats the header on every page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const sheets = await page.locator('.w-sheet').count();
    expect(await page.locator('.w-header').count()).toBe(sheets);
    expect(await page.locator('.w-footer').count()).toBe(sheets);
  });

  test('gives the first page its own header', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-header');

    // firstPageHeaderId exists precisely so a title page can differ
    await expect(page.locator('.w-header').first()).toContainText('Draft');
    await expect(page.locator('.w-header').nth(1)).toContainText('Barocss Word');
  });

  test('numbers each page, and counts them', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-footer');

    const footers = await page.locator('.w-footer').allInnerTexts();
    const total = footers.length;
    footers.forEach((text, index) => {
      expect(text).toContain(`${index + 1} / ${total}`);
    });
  });

  test('splits a tabbed line to the page edges', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-header');

    // A tab in a header means "to the next tab stop", which is what puts a title
    // left and a date right.
    const parts = page.locator('.w-header').nth(1).locator('.w-furniture-part');
    expect(await parts.count()).toBe(2);

    const [left, right] = await parts.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect())
    );
    expect(left.left).toBeLessThan(right.left);
  });

  test('sits inside the page margins, not the text', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-header');

    const gap = await page.evaluate(() => {
      const header = document.querySelector('.w-header')!.getBoundingClientRect();
      const sheet = document.querySelector('.w-sheet')!.getBoundingClientRect();
      const firstBlock = document
        .querySelector('.w-surface > [data-bc-sid]:not(.w-sheets)')!
        .getBoundingClientRect();
      return { fromTop: header.top - sheet.top, aboveText: firstBlock.top - header.bottom };
    });

    // Half an inch from the page edge by default, and above the body
    expect(Math.round(gap.fromTop)).toBe(48);
    expect(gap.aboveText).toBeGreaterThan(0);
  });

  test('is not copied with the document', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-header');

    const copied = await page.evaluate(() => {
      const surface = document.querySelector('.w-surface')!;
      const range = document.createRange();
      range.selectNodeContents(surface);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);

      let html = '';
      const onCopy = (event: ClipboardEvent) => {
        html = event.clipboardData?.getData('text/html') ?? '';
      };
      document.addEventListener('copy', onCopy);
      document.execCommand('copy');
      document.removeEventListener('copy', onCopy);
      return html;
    });

    expect(copied).not.toContain('w-header');
    expect(copied).not.toContain('Draft');
  });
});

test.describe('footnotes', () => {
  test('draws the body at the foot of the page holding the reference', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-footnote');

    // The body lives in resources, which is not rendered as flow content
    await expect(page.locator('.w-footnote')).toContainText('A footnote body');
    await expect(page.locator('.w-resources')).toHaveCSS('display', 'none');
  });

  test('numbers it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-footnote');
    await expect(page.locator('.w-footnote-number').first()).toHaveText('1');
  });

  test('keeps the body text clear of it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-footnote');

    // This is what the reservation is for: without it the note would be drawn
    // over the paragraph that referenced it.
    const overlapping = await page.evaluate(() => {
      const note = document.querySelector('.w-footnotes')!.getBoundingClientRect();
      return Array.from(document.querySelectorAll('.w-surface > [data-bc-sid]'))
        .filter((el) => !el.classList.contains('w-sheets'))
        .map((el) => el.getBoundingClientRect())
        .filter((rect) => rect.top < note.bottom && rect.bottom > note.top).length;
    });

    expect(overlapping).toBe(0);
  });

  test('takes the room it needs out of that page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-footnote');

    const reserved = await page.evaluate(() => {
      const layout = (window as any).wordLayout?.values().next().value;
      return layout.pages.map((p: any) => p.reserved);
    });

    // Only the page with the reference pays for it
    expect(reserved[0]).toBeGreaterThan(0);
    expect(reserved.slice(1).every((value: number) => value === 0)).toBe(true);
  });

  test('sits inside the bottom margin', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-footnote');

    const gap = await page.evaluate(() => {
      const note = document.querySelector('.w-footnotes')!.getBoundingClientRect();
      const sheet = document.querySelector('.w-sheet')!.getBoundingClientRect();
      return sheet.bottom - note.bottom;
    });

    // One inch of bottom margin, as the section asks for
    expect(Math.round(gap)).toBe(96);
  });

  test('is not copied with the document', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-footnote');

    const copied = await page.evaluate(() => {
      const surface = document.querySelector('.w-surface')!;
      const range = document.createRange();
      range.selectNodeContents(surface);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);

      let html = '';
      const onCopy = (event: ClipboardEvent) => {
        html = event.clipboardData?.getData('text/html') ?? '';
      };
      document.addEventListener('copy', onCopy);
      document.execCommand('copy');
      document.removeEventListener('copy', onCopy);
      return html;
    });

    expect(copied).not.toContain('w-footnote');
  });
});
