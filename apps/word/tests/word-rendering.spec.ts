import { test, expect } from '@playwright/test';
import { placeCaret } from './helpers';

/**
 * What the document looks like once it is drawn: formatting resolved against
 * the document rather than read off a node, marks that carry a value, fields
 * that compute themselves, and what a copy carries out of the editor.
 *
 * Part of the browser suite for apps/word; the shared helpers are in helpers.ts.
 */

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
