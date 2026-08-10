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
    await expect(page.locator('.w-surface').first()).toBeVisible();
  });

  test('renders the document metadata outside the flow', async ({ page }) => {
    // The title lives in docMeta, not on the page
    await expect(page.locator('.w-doc-title')).toHaveText('Barocss Word');
    await expect(page.locator('.w-surface .w-doc-title')).toHaveCount(0);
    // Definitions are content but not laid out. The container is not hidden —
    // back matter lives there and belongs at the end of the document — so each
    // definition hides itself.
    const definitions = await page.locator('.w-def').evaluateAll((els) =>
      els.every((el) => (el as HTMLElement).offsetHeight === 0)
    );
    expect(definitions).toBe(true);
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
    await expect(page.locator('.w-surface').first()).toBeVisible();
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

    // A page sheet must not be selectable, focusable, or editable. Every
    // section draws its own, so this checks all of them rather than the first.
    const attributes = await page.locator('.w-sheets').evaluateAll((els) =>
      els.map((el) => [el.getAttribute('contenteditable'), el.getAttribute('aria-hidden')])
    );
    expect(attributes.length).toBeGreaterThan(0);
    for (const [editable, hidden] of attributes) {
      expect(editable).toBe('false');
      expect(hidden).toBe('true');
    }
  });

  test('draws the sheets behind the text rather than over it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    // The sheets are the paper, so nothing of the document may be painted under
    // them. This went wrong for real and nothing caught it: the sheets are
    // positioned and the text is not, and CSS paints positioned boxes after
    // in-flow ones regardless of document order, so an opaque white rectangle
    // covered every word. The page looked blank while the DOM, the geometry and
    // the text content were all exactly right — which is why the checks above
    // passed throughout.
    //
    // Hit testing follows paint order, so asking what is on top answers the
    // question. The sheets set `pointer-events: none` to let clicks through, and
    // that also hides them from `elementsFromPoint` — so it is lifted for the
    // duration of the question, and put back.
    const covered = await page.evaluate(() => {
      const sheets = [...document.querySelectorAll('.w-sheets')] as HTMLElement[];
      sheets.forEach((el) => (el.style.pointerEvents = 'auto'));
      try {
        const blocks = [...document.querySelectorAll('.w-heading, .w-paragraph')].slice(0, 30);
        return blocks
          .filter((block) => {
            const box = block.getBoundingClientRect();
            if (box.height === 0 || box.bottom < 0 || box.top > window.innerHeight) return false;
            const above = document.elementsFromPoint(box.left + 4, box.top + box.height / 2);
            // Anything from the chrome layer sitting above this block in the
            // stack is painted over it.
            return above.slice(0, above.indexOf(block)).some((el) => el.closest('.w-sheets'));
          })
          .map((block) => block.textContent?.trim().slice(0, 30));
      } finally {
        sheets.forEach((el) => (el.style.pointerEvents = 'none'));
      }
    });

    expect(covered).toEqual([]);
  });

  test('starts each page at the top of its own sheet', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    // The first thing on a page, measured as text rather than as a block.
    //
    // An earlier version of this looked for the first block-level child
    // beginning inside the sheet and called it the page's opener, which was
    // wrong: a page whose text continues a paragraph from overleaf has no block
    // beginning at its top, and the first block that does begin there is
    // rightly further down. It read that gap as a 61px misalignment and this was
    // recorded as a defect for some time. The layout was correct throughout.
    const gaps = await page.evaluate(() => {
      const surface = document.querySelector('.w-surface')!;
      const sheets = [...surface.querySelectorAll('.w-sheet')];

      const firstLineOn = (top: number, bottom: number): number | null => {
        const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
        let earliest: number | null = null;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.parentElement?.closest('.w-sheets')) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of [...range.getClientRects()]) {
            if (rect.height <= 0 || rect.top < top - 2 || rect.top >= bottom) continue;
            if (earliest === null || rect.top < earliest) earliest = rect.top;
          }
        }
        return earliest;
      };

      const out: number[] = [];
      for (let i = 1; i < sheets.length; i++) {
        const rect = sheets[i].getBoundingClientRect();
        const contentTop = rect.top + 96;
        const first = firstLineOn(contentTop, rect.bottom - 96);
        if (first !== null) out.push(first - contentTop);
      }
      return out;
    });

    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      // A line box sits a little below the top of the area it is in — that is
      // leading, not misplacement. Less than a line means the page starts where
      // it should; a page actually misaligned would be out by tens of pixels.
      expect(gap).toBeGreaterThanOrEqual(-2);
      expect(gap).toBeLessThan(24);
    }
  });

  // This failed for a long time and the paginator was never at fault. It decided
  // to break the long paragraph after its thirty-second line and said so; the
  // widget that draws the break was rendered at the head of the paragraph
  // instead, and everything after it sat a page too high. The cause was in the
  // renderer — a position widget inserted before one already drawn landed on the
  // wrong side of the text it was cut from — and is pinned there, in
  // position-widget-placement.test.ts.
  test('keeps every line inside a page, however the block was split', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const outside = await page.evaluate(() => {
      const areas = Array.from(document.querySelectorAll('.w-sheet')).map((sheet) => {
        const rect = sheet.getBoundingClientRect();
        return { top: rect.top + 96, bottom: rect.bottom - 96 };
      });

      const surface = document.querySelector('.w-surface')!;
      const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
      let strays = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest('.w-sheets')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.height <= 0) continue;
          const inside = areas.some((a) => rect.top >= a.top - 2 && rect.bottom <= a.bottom + 2);
          if (!inside) strays++;
        }
      }
      return strays;
    });

    expect(outside).toBe(0);
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

    // Undone until the pages come back, rather than a fixed number of times.
    // Edits coalesce, so the number of history entries is not the number of
    // keystrokes, and undoing a fixed count either stops short or walks back
    // past loading the document — which empties it, a different thing entirely.
    for (let i = 0; i < 30; i++) {
      if ((await page.locator('.w-sheet').count()) === before) break;
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(60);
    }

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
    // One category rather than every one. The point is that the tracing can be
    // turned back on; turning all of it on at once produces enough output to
    // slow the page past this test's patience, which proves nothing extra.
    await page.addInitScript(() => {
      localStorage.setItem('barocss:debug', 'TextInput');
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

    // Scoped to the section that defines them: another section with no header
    // of its own draws none, which is correct and would otherwise fail here.
    const section = page.locator('.w-surface').first();
    const sheets = await section.locator('.w-sheet').count();
    expect(await section.locator('.w-header').count()).toBe(sheets);
    expect(await section.locator('.w-footer').count()).toBe(sheets);
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

    // The body lives in resources and is *shown* at the foot of a page, so it
    // has no place of its own in the flow — unlike back matter, which does.
    await expect(page.locator('.w-footnote')).toContainText('A footnote body');
    const definitions = await page.locator('.w-def').evaluateAll((els) =>
      els.every((el) => (el as HTMLElement).offsetHeight === 0)
    );
    expect(definitions).toBe(true);
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

    // Exactly one page pays for it — the one holding the reference — rather
    // than every page losing room to a note that is not on it.
    expect(reserved.filter((value: number) => value > 0)).toHaveLength(1);
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

test.describe('table of contents', () => {
  test('lists the headings with the page each is on', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toc-entry');

    const entries = await page.locator('.w-toc-entry').allInnerTexts();
    expect(entries.length).toBeGreaterThan(2);
    expect(entries[0]).toContain('Contents');
    // Every entry ends in a page number
    for (const entry of entries) expect(entry).toMatch(/\d+$/);
  });

  test('reads the page from the layout, not from the document', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toc-entry');

    // This heading asks for a page break, so it is the one whose number proves
    // the table is generated rather than stored. Checked against the layout
    // rather than a fixed number, so the assertion survives the fixture growing.
    const expected = await page.evaluate(() => {
      const layout = (window as any).wordLayout?.values().next().value;
      const heading = Array.from(document.querySelectorAll('.w-heading')).find((el) =>
        (el.textContent ?? '').includes('starts its own page')
      )!;
      return String((layout.pageOfBlock.get(heading.getAttribute('data-bc-sid')!) ?? 0) + 1);
    });

    const later = page.locator('.w-toc-entry', { hasText: 'starts its own page' });
    await expect(later).toContainText(expected);
    expect(Number(expected)).toBeGreaterThan(1);
  });

  test('indents by heading level', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toc-entry');

    // The text, not the row: the indent is padding, so the row's own box does
    // not move — what the reader sees moving is the text inside it.
    const indents = await page.locator('.w-toc-entry').evaluateAll((els) =>
      els.map((el) => ({
        level: el.getAttribute('data-level'),
        left: el.querySelector('.w-toc-text')!.getBoundingClientRect().left
      }))
    );

    const first = indents.find((i) => i.level === '1')!;
    const second = indents.find((i) => i.level === '2')!;
    expect(second.left).toBeGreaterThan(first.left);
  });

  test('follows the levels the node asks for', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toc-entry');

    // The sample asks for 1-2, so nothing deeper is listed
    const levels = await page
      .locator('.w-toc-entry')
      .evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-level'))));
    expect(Math.max(...levels)).toBeLessThanOrEqual(2);
  });
})

test.describe('computed fields', () => {
  test('numbers a caption', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-field-seq');
    await expect(page.locator('.w-field-seq').first()).toHaveText('1');
  });

  test('quotes only what the bookmark covers', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-field-ref');

    // Not the punctuation and words around it in the same text node
    await expect(page.locator('.w-field-ref').first()).toHaveText('a merged header');
  });

  test('says whether the target is above or below', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-field-ref');
    await expect(page.locator('.w-field-ref').nth(1)).toHaveText('above');
  });
});

test.describe('tracked changes', () => {
  test('draws a deletion rather than removing it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-deletion');

    // The whole point of tracking: the reader has to see what was taken out in
    // order to accept or reject it.
    await expect(page.locator('.w-deletion')).toHaveText('this was removed');
    await expect(page.locator('.w-deletion')).toHaveCSS('text-decoration-line', 'line-through');
  });

  test('underlines an insertion', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-insertion');
    await expect(page.locator('.w-insertion')).toHaveCSS('text-decoration-line', 'underline');
  });

  test('gives each reviewer a colour of their own', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-insertion');

    const colors = await page.evaluate(() => [
      getComputedStyle(document.querySelector('.w-insertion')!).color,
      getComputedStyle(document.querySelector('.w-deletion')!).color
    ]);

    expect(colors[0]).not.toBe(colors[1]);
  });

  test('names the reviewer', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-insertion');

    await expect(page.locator('.w-insertion')).toHaveAttribute('data-author', 'Jinho');
    await expect(page.locator('.w-insertion')).toHaveAttribute('title', /Jinho/);
  });
});

test.describe('editing a header', () => {
  test('shows the real node in place of the drawn copies', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-header');

    const drawnBefore = await page.locator('.w-header').count();
    expect(await page.locator('.w-header-source.is-editing').count()).toBe(0);

    // Double-clicking the header area, which is what Word opens on
    const box = (await page.locator('.w-header').first().boundingBox())!;
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

    // The copy for this header is gone and the node itself has taken its place:
    // several copies of one node are the wrong thing to type into.
    await expect(page.locator('.w-header-source.is-editing')).toBeVisible();
    expect(await page.locator('.w-header').count()).toBeLessThan(drawnBefore);
  });

  test('lets the caret into it, because it is the document', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-header');

    await page.evaluate(() => (window as any).setEditingFurniture('hdr-main'));
    await expect(page.locator('.w-header-source.is-editing')).toBeVisible();

    await placeCaret(page, '.w-header-source.is-editing .w-text');
    const inside = await page.evaluate(() => {
      const editor = (window as any).editor;
      const sid = editor.selection?.startNodeId;
      const el = document.querySelector(`[data-bc-sid="${sid}"]`);
      return !!el?.closest('.w-header-source');
    });

    expect(inside).toBe(true);
  });

  test('types into the one node, not into a copy of it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-header');

    await page.evaluate(() => (window as any).setEditingFurniture('hdr-main'));
    await placeCaret(page, '.w-header-source.is-editing .w-text');
    await page.keyboard.press('End');
    await page.keyboard.type('!');

    await expect(page.locator('.w-header-source.is-editing')).toContainText('!');
  });

  test('leaves the mode on Escape, and the copies come back', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-header');

    const drawnBefore = await page.locator('.w-header').count();
    await page.evaluate(() => (window as any).setEditingFurniture('hdr-main'));
    await expect(page.locator('.w-header-source.is-editing')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.w-header-source.is-editing')).toHaveCount(0);
    expect(await page.locator('.w-header').count()).toBe(drawnBefore);
  });

  test('keeps the definitions out of the way when nothing is being edited', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-header');

    // The container is no longer display:none — a header being edited has to be
    // able to show itself, and back matter belongs at the end of the document —
    // so each kind of resource decides for itself instead.
    const definitions = await page.locator('.w-def').evaluateAll((els) =>
      els.every((el) => (el as HTMLElement).offsetHeight === 0)
    );
    expect(definitions).toBe(true);
    await expect(page.locator('.w-header-source').first()).toBeHidden();
  });
});

test.describe('columns', () => {
  const secondSurface = (page: import('@playwright/test').Page) =>
    page.locator('.w-surface').nth(1);

  test('runs the text in two columns', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const lefts = await secondSurface(page).evaluate((surface) => {
      const blocks = Array.from(surface.children).filter(
        (el) => el.hasAttribute('data-bc-sid') && !el.classList.contains('w-sheets')
      );
      return [...new Set(blocks.map((el) => Math.round(el.getBoundingClientRect().left)))];
    });

    expect(lefts).toHaveLength(2);
  });

  test('breaks lines at the column width, not the page width', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const [width, textWidth] = await secondSurface(page).evaluate((surface) => {
      const block = Array.from(surface.children).find(
        (el) => el.hasAttribute('data-bc-sid') && !el.classList.contains('w-sheets')
      )!;
      const sheet = surface.querySelector('.w-sheet')!;
      return [
        block.getBoundingClientRect().width,
        sheet.getBoundingClientRect().width - 192 // one inch of margin either side
      ];
    });

    // (text width - gap) / 2, which is what makes the lines shorter
    expect(width).toBeLessThan(textWidth / 2 + 1);
  });

  test('fills the first column before starting the second', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const blocks = await secondSurface(page).evaluate((surface) =>
      Array.from(surface.children)
        .filter((el) => el.hasAttribute('data-bc-sid') && !el.classList.contains('w-sheets'))
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { left: Math.round(rect.left), top: Math.round(rect.top) };
        })
    );

    const left = Math.min(...blocks.map((b) => b.left));
    const firstColumn = blocks.filter((b) => b.left === left);
    const secondColumn = blocks.filter((b) => b.left !== left);

    // The second column starts above where the first one ended: that is the
    // move a top margin cannot express, and the reason these are positioned.
    expect(secondColumn.length).toBeGreaterThan(0);
    const lastOfFirst = Math.max(...firstColumn.map((b) => b.top));
    expect(Math.min(...secondColumn.map((b) => b.top))).toBeLessThan(lastOfFirst);
  });

  test('leaves the single-column section stacking in normal flow', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    // Only sections that need it pay for absolute positioning
    const positioned = await page.locator('.w-surface').first().evaluate((surface) =>
      Array.from(surface.children)
        .filter((el) => el.hasAttribute('data-bc-sid') && !el.classList.contains('w-sheets'))
        .filter((el) => getComputedStyle(el as HTMLElement).position === 'absolute').length
    );

    expect(positioned).toBe(0);
  });
})

test.describe('marks that carry a value', () => {
  test('renders a size in Word’s unit', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.mark-fontSize');

    // 36 half-points is 18pt is 24px. A class name could not have said that.
    await expect(page.locator('.mark-fontSize')).toHaveCSS('font-size', '24px');
  });

  test('renders a colour written the way a .docx writes it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.mark-fontColor');
    await expect(page.locator('.mark-fontColor')).toHaveCSS('color', 'rgb(178, 34, 34)');
  });

  test('resolves a character style through the cascade', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.mark-charStyle');

    // The mark carries only the name; what it means is the cascade's answer,
    // the same one a paragraph would get.
    await expect(page.locator('.mark-charStyle')).toHaveCSS('font-style', 'italic');
    await expect(page.locator('.mark-charStyle')).toHaveCSS('color', 'rgb(44, 82, 130)');
  });
})


test.describe('a paragraph longer than a page', () => {
  const longParagraph = '.w-paragraph:has-text("A page break inside a paragraph cannot be a margin")';

  test('breaks inside itself', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-page-break');

    // Everything else the layout does moves whole blocks. This one puts space
    // between two lines of one block, which no margin can express: the thing
    // before the break and the thing after it are the same element.
    expect(await page.locator('.w-page-break').count()).toBeGreaterThan(0);
  });

  test('settles rather than growing on every pass', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-page-break');

    // The spacer is part of how tall the paragraph currently is and no part of
    // how tall its text is. Measuring it as a line made the block grow each time
    // it broke, and the breaks drifted further down on every pass.
    const first = await page.locator('.w-page-break').count();
    await page.waitForTimeout(600);
    expect(await page.locator('.w-page-break').count()).toBe(first);
  });

  test('leaves the text the model holds untouched', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-page-break');

    // The spacer is an empty element: it contributes no text node, so nothing
    // that reads text should be able to tell it is there.
    const [dom, model] = await page.evaluate(() => {
      // Located by its text: `:has-text` is Playwright's, not the DOM's.
      const el = Array.from(document.querySelectorAll('.w-paragraph')).find((p) =>
        (p.textContent ?? '').includes('A page break inside a paragraph cannot be a margin')
      )!;
      const sid = el.querySelector('[data-bc-sid]')!.getAttribute('data-bc-sid')!;
      return [el.textContent ?? '', (window as any).editor.dataStore.getNode(sid)?.text ?? ''];
    });

    expect(dom).toBe(model);
    expect(dom).not.toContain('﻿');
  });

  test('types in order across the break', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-page-break');

    await placeCaret(page, longParagraph);
    const before = await page.evaluate(() => (window as any).editor.selection.startOffset);
    await page.keyboard.type('XYZ', { delay: 120 });

    // The caret has to advance with each character, or the next one lands in
    // front of the last and the word arrives backwards.
    await expect
      .poll(async () => page.evaluate(() => (window as any).editor.selection.startOffset))
      .toBe(before + 3);
    await expect(page.locator(longParagraph)).toContainText('XYZ');
  });

  test('types in order when typed quickly', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-page-break');

    // Fast enough that a render is still settling when the next key arrives,
    // which is where a forced caret restore used to overwrite the user's own.
    await placeCaret(page, longParagraph);
    await page.keyboard.type('ABCDEFGH', { delay: 15 });

    await expect(page.locator(longParagraph)).toContainText('ABCDEFGH');
  });

  test('is not copied with the text', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-page-break');

    const copied = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.w-paragraph')).find((p) =>
        (p.textContent ?? '').includes('A page break inside a paragraph cannot be a margin')
      )!;
      const range = document.createRange();
      range.selectNodeContents(el);
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

    expect(copied).not.toContain('w-page-break');
  });
})

test.describe('fields that ask the document about itself', () => {
  test('shows the title and the author from the metadata', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-field-title');

    // From docMeta, not from the flow: a field asking for the title wants what
    // the document is called, not what its first heading says.
    await expect(page.locator('.w-field-title')).toHaveText('Barocss Word');
    await expect(page.locator('.w-field-author')).toHaveText('Jinho Park');
  });

  test('shows a date the host supplied, in the format the field asks for', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-field-date');

    // The host supplies the instant; a renderer that read the clock could not be
    // tested and would make every layout pass look like a change.
    await expect(page.locator('.w-field-date')).toHaveText('5 August 2026');
  });
});

test.describe('back matter', () => {
  test('collects at the end of the document, after the last page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-back-matter');

    const [firstBack, lastSheetBottom] = await page.evaluate(() => {
      const back = document.querySelector('.w-back-matter')!.getBoundingClientRect().top;
      const sheets = Array.from(document.querySelectorAll('.w-sheet'));
      return [back, Math.max(...sheets.map((s) => s.getBoundingClientRect().bottom))];
    });

    // Which is what separates an endnote from a footnote: a footnote's whole
    // point is being on the page that refers to it.
    expect(firstBack).toBeGreaterThanOrEqual(lastSheetBottom);
  });

  test('titles each region', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-endnotes');

    await expect(page.locator('.w-endnotes')).toContainText('Notes');
    await expect(page.locator('.w-endnotes')).toContainText('An endnote body');
    await expect(page.locator('.w-bibliography')).toContainText('ECMA-376');
  });

  test('is editable, unlike the furniture', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-endnotes');

    // Back matter is content that appears once; only its position is a layout
    // decision. So the caret goes in, and typing works.
    await placeCaret(page, '.w-endnotes .w-text');
    await page.keyboard.press('End');
    await page.keyboard.type('!');

    await expect(page.locator('.w-endnotes')).toContainText('!');
  });
});

test.describe('sheets under columns', () => {
  test('draws one sheet per page, not one per column', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const perSurface = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.w-surface')).map((surface) => {
        const layout = (window as any).wordLayout?.get(surface.getAttribute('data-bc-sid'));
        return {
          sheets: surface.querySelectorAll('.w-sheet').length,
          boxes: layout?.pages?.length ?? 0,
          columns: layout?.metrics?.columnCount ?? 1
        };
      })
    );

    const columned = perSurface.find((s) => s.columns > 1)!;
    expect(columned).toBeDefined();
    // A page holds one box per column; a sheet per box would stack two or three
    // sheets of paper down the document for one.
    expect(columned.sheets).toBe(Math.ceil(columned.boxes / columned.columns));
    expect(columned.sheets).toBeLessThan(columned.boxes);
  });
})

/**
 * Printing.
 *
 * The document already has pages: the paginator measured the rendered text and
 * decided where each one ends. Printing is not a second pagination but that one
 * honoured, so what these check is agreement — the paper has the pages the
 * screen shows, and nothing that is only on screen goes to paper while nothing
 * that is the document stays off it.
 */
/**
 * Wait until pagination has stopped moving.
 *
 * The layout runs, measures its own output and runs again; asking during that
 * is asking about a page count on its way somewhere else. Two readings that
 * agree is the cheapest evidence it has arrived.
 */
async function settled(page: import('@playwright/test').Page) {
  // Attached rather than visible: in print media the sheets are hidden — the
  // page itself is the paper — and they are still what there is to count.
  await page.waitForSelector('.w-sheet', { state: 'attached' });
  let previous = -1;
  await expect
    .poll(
      async () => {
        const count = await page.locator('.w-sheet').count();
        const stable = count === previous && count > 0;
        previous = count;
        return stable;
      },
      { timeout: 15000, intervals: [250] }
    )
    .toBe(true);
}

test.describe('print', () => {
  test('puts the same number of pages on paper as on screen', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    const sheets = await page.locator('.w-sheet').count();

    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });

    // Read out of the PDF itself rather than from anything the app says. A page
    // tree records how many pages it holds, and that is the only number a
    // printer acts on.
    const counts = [...pdf.toString('latin1').matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
    expect(counts).toContain(sheets);
  });

  test('builds a page for each sheet when the browser asks to print', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    const sheets = await page.locator('.w-sheet').count();

    // The browser's own event, which is what the print dialog fires. Nothing
    // exists before it: the copies are made for the print and taken away after.
    expect(await page.locator('.w-print-page').count()).toBe(0);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    expect(await page.locator('.w-print-page').count()).toBe(sheets);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    expect(await page.locator('.w-print-page').count()).toBe(0);
  });

  test('cuts a paragraph across two pages without cutting the text', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });

    const seam = await page.evaluate(() => {
      const pages = [...document.querySelectorAll('.w-print-page')];
      const visibleText = (page: Element): string => {
        const box = page.getBoundingClientRect();
        const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
        const lines: { top: number; text: string }[] = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of [...range.getClientRects()]) {
            if (rect.height <= 0) continue;
            if (rect.top < box.top - 1 || rect.bottom > box.bottom + 1) continue;
            lines.push({ top: rect.top, text: node.textContent ?? '' });
          }
        }
        return lines.sort((a, b) => a.top - b.top).map((l) => l.text).join(' ');
      };
      // The long paragraph runs from page three onwards in the sample.
      return { third: visibleText(pages[2]), fourth: visibleText(pages[3]) };
    });
    await page.emulateMedia({ media: 'screen' });

    // The paragraph appears on both pages, because a paragraph crossing a page
    // boundary is on both pages. What matters is that each shows a different
    // part of it: the text is clipped, never split, so nothing is lost at the
    // seam and nothing is printed twice.
    expect(seam.third).toContain('A paragraph longer than a page');
    expect(seam.third).toContain('(1) A page break inside a paragraph');
    expect(seam.third).not.toContain('(27) A page break');
    expect(seam.fourth).toContain('(27) A page break');
    expect(seam.fourth).not.toContain('A paragraph longer than a page');
  });

  test('prints the paper the section describes', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const css = await page.evaluate(
      () => document.querySelector('style[data-word-print]')!.textContent!
    );
    // US Letter in points, the unit a printer works in. No margins on the page
    // box: each page holds a copy clipped to a whole sheet, margins included.
    expect(css).toContain('size: 612pt 792pt');
    expect(css).toMatch(/@page \{[\s\S]*?margin: 0;/);
  });

  test('carries the page furniture onto the paper', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));

    // Headers, footers, page numbers and footnotes are drawn per page on the
    // sheet layer. Clipping is what gives each printed page the ones that belong
    // to it — the earlier stylesheet had to drop them, and dropped the footnote
    // text off the printout with them.
    const first = await page.evaluate(() => {
      const page = document.querySelectorAll('.w-print-page')[0];
      const text = (selector: string) => page.querySelector(selector)?.textContent?.trim() ?? null;
      return { header: text('.w-header'), footer: text('.w-footer'), note: text('.w-footnotes') };
    });

    expect(first.header).toContain('Draft');
    expect(first.footer).toContain('1 / ');
    expect(first.note).toContain('A footnote body');
  });
});

test.describe('the toolbar', () => {
  test('shows a mark as on when it covers the whole selection', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');

    // The sample has a code mark over one word
    await page.locator('.mark-code').first().click();
    await page.waitForTimeout(300);
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');

    await expect
      .poll(async () =>
        page.evaluate(() => (window as any).editor.getSelectionSummary().marks.includes('code'))
      )
      .toBe(true);
  });

  test('shows a mark as mixed when it covers only part of it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');

    // Select across the boundary of the marked run into unmarked text
    const summary = await page.evaluate(() => {
      const editor = (window as any).editor;
      const marked = document.querySelector('.mark-code')!.closest('[data-bc-sid]')!;
      const sid = marked.getAttribute('data-bc-sid')!;
      const next = (editor.dataStore.getNode(sid).text ?? '').length;

      // From inside the marked node into the one after it
      const parent = editor.dataStore.getParent(sid);
      const siblings = parent.content as string[];
      const after = siblings[siblings.indexOf(sid) + 1];

      editor.updateSelection({
        type: 'range',
        startNodeId: sid,
        startOffset: 0,
        endNodeId: after,
        endOffset: 3,
        collapsed: false
      });
      return editor.getSelectionSummary();
    });

    // Neither on nor off: a button drawn as off here would turn one click into
    // a silent reformat of everything selected.
    expect(summary.mixedMarks).toContain('code');
    expect(summary.marks).not.toContain('code');
  });

  test('draws the three states apart', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);

    const states = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-control]')).map(
        (b) => (b as HTMLElement).dataset.state
      )
    );
    expect(states.every((state) => ['on', 'mixed', 'off'].includes(state!))).toBe(true);

    // A screen reader has to be told "partially pressed" rather than "not pressed"
    const pressed = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-control]')).map((b) =>
        b.getAttribute('aria-pressed')
      )
    );
    expect(pressed.every((value) => ['true', 'false', 'mixed'].includes(value!))).toBe(true);
  });

  test('shows the style the blocks agree on, and nothing when they do not', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');

    await placeCaret(page, '.w-paragraph', 1);
    // The control is a button showing the current value, not a <select>
    await expect(page.locator('.w-toolbar-style')).toContainText('Body text');

    // Across a heading and a paragraph there is no single style to show
    await page.evaluate(() => {
      const editor = (window as any).editor;
      const heading = document.querySelector('.w-heading [data-bc-sid]')!.getAttribute('data-bc-sid')!;
      const paragraph = document.querySelector('.w-paragraph [data-bc-sid]')!.getAttribute('data-bc-sid')!;
      editor.updateSelection({
        type: 'range',
        startNodeId: heading,
        startOffset: 0,
        endNodeId: paragraph,
        endOffset: 2,
        collapsed: false
      });
    });

    // Nothing to show: the blocks are in different styles, and picking one of
    // them is how a dropdown reformats a selection it was only reporting on.
    await expect(page.locator('.w-toolbar-style')).toHaveAttribute('data-mixed', 'true');
  });

  test('applies alignment to every block the selection touches', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);

    await page.locator('[data-control="align-center"]').dispatchEvent('pointerdown');

    await expect
      .poll(async () =>
        page.evaluate(() => (window as any).editor.getSelectionSummary().blockAttributes.alignment)
      )
      .toBe('center');

    // ...and the button says so
    await expect(page.locator('[data-control="align-center"]')).toHaveAttribute('data-state', 'on');
  });

  test('shows the font and size the text inherits, not a dash', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);

    // Almost no text in a Word document carries direct font formatting — it
    // comes down the style cascade — so a control that read only marks would sit
    // blank over every ordinary paragraph and claim the selection disagreed with
    // itself.
    await expect(page.locator('.w-toolbar-font-family')).toContainText('Georgia');
    await expect(page.locator('.w-toolbar-font-size')).toContainText('11');
  });

  test('applies the size chosen in the dropdown', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);
    await page.keyboard.down('Shift');
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');

    const before = await page.evaluate(() => {
      const sel = (window as any).editor.selection;
      const el = document.querySelector(`[data-bc-sid="${sel.startNodeId}"]`) as HTMLElement;
      return getComputedStyle(el).fontSize;
    });

    // Driven through the control a reader would use, not the command behind it:
    // the dropdown has to send the value in the unit the renderer reads, and
    // sending points where half-points were meant halves the size silently.
    await page.locator('.w-toolbar-font-size').click();
    await page.locator('[data-style="40"]').click();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const marked = document.querySelectorAll('.mark-fontSize');
          return [...marked].map((el) => getComputedStyle(el as HTMLElement).fontSize);
        })
      )
      // Twenty point, which the model stores as forty half-points.
      .toContain('26.6667px');
    expect(before).not.toBe('26.6667px');
  });

  test('fetches a web font before setting the text in it', async ({ page }) => {
    // Served locally, so the test does not depend on the network and stays a
    // test of the ordering rather than of Google's uptime. Delayed on purpose:
    // without a delay the font resolves instantly and the ordering cannot be
    // observed at all — the test would pass whichever way round it happened.
    let requested: string | null = null;
    await page.route('**/fonts.googleapis.com/**', async (route) => {
      requested = route.request().url();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        contentType: 'text/css',
        body: `@font-face{font-family:'Playfair Display';src:local('Georgia');font-weight:400}
               @font-face{font-family:'Playfair Display';src:local('Georgia');font-weight:700}`
      });
    });

    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);
    await page.keyboard.down('Shift');
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');

    // Records whether the font was ready at the instant the text was first set
    // in it. Asking afterwards answers nothing: the font arrives either way, and
    // what matters is whether anything was measured before it did. Pagination
    // believes the widths it measures, so text painted in a fallback breaks its
    // pages against the wrong font and the correction arrives as a reflow.
    await page.evaluate(() => {
      const w = window as any;
      w.__readyWhenApplied = null;
      const observer = new MutationObserver(() => {
        if (w.__readyWhenApplied !== null) return;
        if (!document.querySelector('.mark-fontFamily')) return;
        // Not `fonts.check`: it answers true when no matching face exists at
        // all, because the text can still be drawn in a fallback — which is the
        // very situation being tested for. The face's own status is the fact.
        w.__readyWhenApplied = [...(document as any).fonts].some(
          (face: any) =>
            face.family.replace(/["']/g, '') === 'Playfair Display' && face.status === 'loaded'
        );
        observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });

    await page.locator('.w-toolbar-font-family').click();
    await page.locator('[data-style="Playfair Display"]').click();

    await expect
      .poll(async () => page.evaluate(() => (window as any).__readyWhenApplied), { timeout: 10000 })
      .toBe(true);

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const marked = document.querySelector('.mark-fontFamily') as HTMLElement | null;
          return marked ? getComputedStyle(marked).fontFamily : null;
        })
      )
      .toBe('"Playfair Display"');

    // Both weights, because a browser asked to embolden a face it lacks invents
    // one at a different width; and blocking rather than swapping, because a
    // swap paints in the fallback first — which is the measurement that matters.
    expect(requested).toContain('wght@400;700');
    expect(requested).toContain('display=block');
  });

  test('makes a list, moves it between levels, and lets it go again', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);

    // The block is captured before anything is pressed. Clicking a toolbar
    // button moves focus, and following the live selection afterwards would be
    // following whatever it became rather than the paragraph under test.
    const sid = await page.evaluate(() => {
      const ed: any = (window as any).editor;
      let node = ed.dataStore.getNode(ed.selection.startNodeId);
      for (let depth = 0; node && depth < 64; depth++) {
        if (node.stype && typeof node.text !== 'string' && node.stype !== 'inline-text') break;
        node = node.parentId ? ed.dataStore.getNode(node.parentId) : undefined;
      }
      return node.sid as string;
    });

    const state = async () =>
      page.evaluate((sid) => {
        const el = document.querySelector(`[data-bc-sid="${sid}"]`) as HTMLElement | null;
        return {
          marker: el?.getAttribute('data-marker')?.trim() ?? null,
          marginLeft: el ? getComputedStyle(el).marginLeft : null
        };
      }, sid);

    // Nothing here reads the model: a list nobody can see is not a list. The
    // marker is computed at render time from the definition the paragraph names,
    // so it only appears if the definition was written, the paragraph points at
    // it, and the resolver was rebuilt to notice.
    await page.getByRole('button', { name: 'Bulleted list' }).click();
    await expect.poll(state).toEqual({ marker: '•', marginLeft: '48px' });

    // A level in: the glyph changes and it moves half an inch further.
    await page.getByRole('button', { name: 'Increase indent' }).click();
    await expect.poll(state).toEqual({ marker: '○', marginLeft: '96px' });

    await page.getByRole('button', { name: 'Numbered list' }).click();
    await expect.poll(state).toEqual({ marker: 'a.', marginLeft: '96px' });

    // Out of the last level is out of the list: the button is a way back to an
    // ordinary paragraph rather than a dead end.
    await page.getByRole('button', { name: 'Decrease indent' }).click();
    await page.getByRole('button', { name: 'Decrease indent' }).click();
    await expect.poll(state).toEqual({ marker: '', marginLeft: '0px' });
  });

  test('shows a list button as on only for the list the caret is in', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);

    const pressed = async (name: string) =>
      page.getByRole('button', { name }).getAttribute('aria-pressed');

    expect(await pressed('Bulleted list')).toBe('false');
    await page.getByRole('button', { name: 'Bulleted list' }).click();

    await expect.poll(() => pressed('Bulleted list')).toBe('true');
    // Which kind cannot be read from the selection — it takes resolving the
    // definition the paragraph names — so this is where that resolution is
    // checked from the outside.
    expect(await pressed('Numbered list')).toBe('false');
  });

  test('disables a command that cannot run', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');

    // Nothing has been edited, so there is nothing to undo. A toolbar wired to
    // canExecuteCommand directly would have shown every button disabled here,
    // because almost every editing command requires a selection.
    await expect(page.locator('[data-control="undo"]')).toBeDisabled();

    await placeCaret(page, '.w-paragraph', 1);
    await expect(page.locator('[data-control="bold"]')).toBeEnabled();
  });
})
