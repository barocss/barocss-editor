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
    // Definitions are content but not laid out: the container takes no space,
    // rather than being display:none, so that a header being edited can show
    // itself out of it.
    const resources = await page.locator('.w-resources').boundingBox();
    expect(resources === null || (resources.width === 0 && resources.height === 0)).toBe(true);
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

  test('starts each page at the top of its own sheet', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    const offsets = await page.evaluate(() => {
      const sheets = Array.from(document.querySelectorAll('.w-sheet'));
      const surface = document.querySelector('.w-surface')!;
      const blocks = Array.from(surface.children).filter(
        (el) => el.hasAttribute('data-bc-sid') && !el.classList.contains('w-sheets')
      );

      // Only pages that a block *starts* on. A page whose text continues a
      // paragraph from the page before has no block beginning on it, and the
      // block it belongs to began somewhere overleaf — that case is covered by
      // the test below, which checks no text escapes its page at all.
      const out: number[] = [];
      for (let i = 1; i < sheets.length; i++) {
        const rect = sheets[i].getBoundingClientRect();
        const opener = blocks.find(
          (b) => b.getBoundingClientRect().top >= rect.top && b.getBoundingClientRect().top < rect.bottom
        );
        if (opener) out.push(opener.getBoundingClientRect().top - (rect.top + 96));
      }
      return out;
    });

    expect(offsets.length).toBeGreaterThan(0);
    for (const offset of offsets) {
      // A couple of pixels, which is what summing thirty measured heights costs
      // in sub-pixel rounding. A page that was actually misaligned would be out
      // by tens.
      expect(Math.abs(offset)).toBeLessThan(2.5);
    }
  });

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

    // The body lives in resources, which is not laid out as flow content
    await expect(page.locator('.w-footnote')).toContainText('A footnote body');
    const resources = await page.locator('.w-resources').boundingBox();
    expect(resources === null || (resources.width === 0 && resources.height === 0)).toBe(true);
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
    // able to show itself — so it must take no space instead.
    const box = await page.locator('.w-resources').boundingBox();
    expect(box === null || (box.width === 0 && box.height === 0)).toBe(true);
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
