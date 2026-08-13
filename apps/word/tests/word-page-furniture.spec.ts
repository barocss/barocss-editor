import { test, expect } from '@playwright/test';
import { placeCaret } from './helpers';

/**
 * Everything drawn per page rather than rendered once — headers, footers,
 * footnotes, the table of contents — and the matter that follows the last page.
 *
 * Part of the browser suite for apps/word; the shared helpers are in helpers.ts.
 */

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
    //
    // Measured as lines rather than as blocks. A paragraph split across a page
    // boundary has a box that spans both pages and the gap between them, so it
    // overlaps the note in coordinates while no word of it is anywhere near —
    // which made this pass or fail on whether a split happened to land on the
    // note's page.
    const overlapping = await page.evaluate(() => {
      const note = document.querySelector('.w-footnotes')!.getBoundingClientRect();
      const surface = document.querySelector('.w-surface')!;
      const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);

      let overlaps = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest('.w-sheets')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of [...range.getClientRects()]) {
          if (rect.height <= 0) continue;
          if (rect.top < note.bottom && rect.bottom > note.top) overlaps += 1;
        }
      }
      return overlaps;
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
      // The sheet the note is drawn on, not the first one. A note belongs to
      // the page that refers to it, and which page that is depends on how the
      // text fell — so naming a sheet by its number is naming the wrong one as
      // soon as anything above it changes.
      const sheet = [...document.querySelectorAll('.w-sheet')]
        .map((el) => el.getBoundingClientRect())
        .find((box) => note.top >= box.top && note.bottom <= box.bottom)!;
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

/**
 * Numbers down the margin, which a contract is quoted by.
 *
 * Switched on at runtime: the sample document does not number its lines, and a
 * fixture that did would put text in the margin of every page for every other
 * test in the suite to walk past.
 */
test.describe('line numbers', () => {
  const number = (page: import('@playwright/test').Page, over: Record<string, unknown>) =>
    page.evaluate((attrs) => {
      const ed = (window as any).editor;
      const section = ed.dataStore.getNode(
        document.querySelector('.w-surface')!.getAttribute('data-bc-sid')
      );
      ed.dataStore.updateNode(section.sid, { attributes: { ...section.attributes, ...attrs } });
      (window as any).editorView.render();
    }, over);

  test('are drawn beside the lines they count, in the margin', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');
    await expect(page.locator('.w-line-number')).toHaveCount(0);

    await number(page, { lineNumberingCountBy: 1, lineNumberingDistance: 360 });
    await expect.poll(() => page.locator('.w-line-number').count()).toBeGreaterThan(5);

    const placed = await page.evaluate(() => {
      const first = document.querySelector('.w-line-number') as HTMLElement;
      const box = first.getBoundingClientRect();
      const section = document.querySelector('.w-surface')!.getBoundingClientRect();
      const text = document.querySelector('.w-surface .w-heading, .w-surface .w-paragraph')!;
      return {
        label: first.textContent,
        // In the margin: right of the sheet's edge and left of where text starts
        insideMargin: box.left >= section.left && box.right <= text.getBoundingClientRect().left,
        selectable: getComputedStyle(first).userSelect
      };
    });

    expect(placed.label).toBe('1');
    expect(placed.insideMargin).toBe(true);
    // Drawn beside the text and no part of it: a copy must not carry a column
    // of digits into whatever it is pasted into.
    expect(placed.selectable).toBe('none');
  });

  test('show every fifth when that is what the section asks for', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');
    await number(page, { lineNumberingCountBy: 5, lineNumberingRestart: 'newSection' });

    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.querySelectorAll('.w-line-number')].slice(0, 3).map((el) => el.textContent)
        )
      )
      .toEqual(['5', '10', '15']);
  });

  test('line up with the lines they belong to', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');
    await number(page, { lineNumberingCountBy: 1 });
    await expect.poll(() => page.locator('.w-line-number').count()).toBeGreaterThan(5);

    // The first number sits against the first line of the document's first
    // block — not against the middle of the block, and not against the page.
    const aligned = await page.evaluate(() => {
      const first = document.querySelector('.w-line-number')!.getBoundingClientRect();
      const block = document.querySelector('.w-surface .w-heading, .w-surface .w-paragraph')!;
      const range = document.createRange();
      range.selectNodeContents(block);
      const line = range.getClientRects()[0];
      return Math.abs(first.top - line.top);
    });

    // Within a line of each other; the number is smaller than the text it counts
    expect(aligned).toBeLessThan(20);
  });
});

test.describe('which pages get a header of their own', () => {
  const section = (page: import('@playwright/test').Page, attrs: Record<string, unknown>) =>
    page.evaluate((over) => {
      const ed = (window as any).editor;
      const node = ed.dataStore.getNode(
        document.querySelector('.w-surface')!.getAttribute('data-bc-sid')
      );
      ed.dataStore.updateNode(node.sid, { attributes: { ...node.attributes, ...over } });
      (window as any).editorView.render();
    }, attrs);

  test('is the section’s switch, not whether the header exists', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-header');
    await expect(page.locator('.w-header').first()).toContainText('Draft');

    // The header stays in the document; the section simply stops using it, and
    // the first page falls back to the ordinary one.
    await section(page, { titlePage: false });
    await expect.poll(() => page.locator('.w-header').first().textContent()).toContain(
      'Barocss Word'
    );

    await section(page, { titlePage: true });
    await expect.poll(() => page.locator('.w-header').first().textContent()).toContain('Draft');
  });

  test('draws no even-page header until the document asks for a spread', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-header');

    await section(page, { evenPageHeaderId: 'hdr-first' });
    // Defined but unused: page two keeps the ordinary header
    await expect.poll(() => page.locator('.w-header').nth(1).textContent()).toContain(
      'Barocss Word'
    );

    await section(page, { differentOddEven: true });
    await expect.poll(() => page.locator('.w-header').nth(1).textContent()).toContain('Draft');
  });
});
