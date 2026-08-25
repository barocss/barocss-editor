import { test, expect } from '@playwright/test';

/**
 * The site builder, in a browser.
 *
 * The claim the product is built on is that a page is a document being drawn, so the tests that
 * matter are the ones a document cannot answer: that the same page is on screen at **several
 * widths at once**, that each of them is a real view of the one document, and that typing in the
 * narrow one is typing in the page.
 */
const ready = async (page: any) => {
  await page.goto('/');
  await page.waitForSelector('[data-frame="desktop"] .st-page');
  // The views render on an effect; one settle is enough because a page places nothing.
  await page.waitForTimeout(400);
};

test.describe('a site at several widths', () => {
  test('draws the page once per width, each at its own size', async ({ page }) => {
    await ready(page);

    const frames = page.locator('.st-frame');
    await expect(frames).toHaveCount(3);

    const widths = await frames.evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().width))
    );
    // 1280 / 834 / 390 — the widths a reader designs for, side by side rather than one at a time.
    expect(widths).toEqual([1280, 834, 390]);

    // Every frame drew the same page: the hero heading is in all three.
    for (const id of ['desktop', 'tablet', 'mobile']) {
      await expect(page.locator(`[data-frame="${id}"] h1`)).toHaveText(/한 엔진/);
    }
  });

  test('is one document: typing in the narrow frame is typing in the page', async ({ page }) => {
    await ready(page);

    const before = await page.locator('[data-frame="desktop"] h1').textContent();

    const mobile = page.locator('[data-frame="mobile"] h1');
    await mobile.click();
    // Wherever the click landed in the line — the caret is the document's, not the frame's, and this
    // test is about *which document* the letter goes into rather than where in it.
    await page.keyboard.type('!');
    await page.waitForTimeout(600);

    /*
     * The desktop frame shows it too, because there is no second copy of the text: three views, one
     * editor, one store. This is the notes pane's mechanism doing the thing a site builder needs it
     * for.
     */
    await expect(page.locator('[data-frame="desktop"] h1')).toContainText('!');
    await expect(page.locator('[data-frame="tablet"] h1')).toContainText('!');

    // And one undo takes it back everywhere, because it was one editor's transaction.
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(600);
    expect(await page.locator('[data-frame="desktop"] h1').textContent()).toBe(before);
  });

  test('a width can be turned off to make room, and comes back', async ({ page }) => {
    await ready(page);

    await page.locator('[data-width="tablet"]').click();
    await expect(page.locator('.st-frame')).toHaveCount(2);
    await expect(page.locator('[data-frame="tablet"]')).toHaveCount(0);

    await page.locator('[data-width="tablet"]').click();
    await expect(page.locator('.st-frame')).toHaveCount(3);
  });

  test('shows the pages of the site, and switches between them', async ({ page }) => {
    await ready(page);

    // Two pages, which is the first thing that separates a site from a document.
    await expect(page.locator('[data-pages] button')).toHaveCount(2);
    await expect(page.locator('[data-frame="desktop"] .st-page')).toHaveAttribute('data-path', '/');

    await page.locator('[data-page-current]').nth(0).click();
    await page.locator('[data-pages] button').nth(1).click();
    await page.waitForTimeout(500);

    await expect(page.locator('[data-frame="desktop"] .st-page')).toHaveAttribute(
      'data-path',
      '/about'
    );
    // The header is on both pages, from one definition placed twice.
    await expect(page.locator('[data-frame="desktop"] .st-placement')).toHaveCount(1);
  });

  test('lays the page out as stacks, which is the browser doing it', async ({ page }) => {
    await ready(page);

    const row = page.locator('[data-frame="desktop"] .st-stack[data-layout="row"]').first();
    await expect(row).toHaveCount(1);

    // Three cards, side by side, each filling its share — and the same three stacked on a phone,
    // because that is what a flex row does when it is 390 pixels wide and its children can wrap...
    const desktopCards = await row.evaluate((node) =>
      [...node.children].map((child) => Math.round(child.getBoundingClientRect().width))
    );
    expect(desktopCards).toHaveLength(3);
    expect(new Set(desktopCards).size).toBe(1);
  });
});
