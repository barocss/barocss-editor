import { test, expect } from '@playwright/test';
import { caret, caretIsInside, clickText, settled } from './helpers';

/**
 * Click here, then type — for every kind of thing a document is made of.
 *
 * The rest of the suite types where a helper has already put the caret, which
 * tests the writing and not the aiming. This one starts where a reader starts:
 * a point over some text. Each row asserts the same three things, because a
 * word processor that gets any of them wrong is unusable in a way no amount of
 * correct rendering makes up for:
 *
 *   1. the caret lands in the thing that was clicked,
 *   2. what is typed is what the model ends up holding, in order,
 *   3. and what the model holds is what the page shows.
 *
 * The matrix is the point. A single spot proves nothing about the next one:
 * clicking a paragraph worked while clicking an equation put the caret in the
 * paragraph before it, and both look identical in a screenshot.
 */
const TARGETS = [
  { name: 'a paragraph', selector: '.w-paragraph', nth: 1 },
  { name: 'a heading', selector: '.w-heading', nth: 1 },
  { name: 'a list item', selector: '[data-marker]:not([data-marker=""])', nth: 0 },
  { name: 'a table cell', selector: '.w-tbody .w-cell', nth: 0 },
  { name: 'an equation run', selector: '.w-math .w-text', nth: 0 },
  { name: 'a fraction’s numerator', selector: '.w-math-frac .w-math-num .w-text', nth: 0 }
];

test.describe('click, then type', () => {
  for (const target of TARGETS) {
    test(`puts the caret in ${target.name} and writes there`, async ({ page }) => {
      await page.goto('/');
      await settled(page);

      const found = await page.locator(target.selector).count();
      expect(found, `nothing matches ${target.selector}`).toBeGreaterThan(target.nth);

      await page.locator(target.selector).nth(target.nth).scrollIntoViewIfNeeded();
      await clickText(page, target.selector, { nth: target.nth, at: 'middle' });

      expect(await caretIsInside(page, target.selector, target.nth)).toBe(true);

      const before = await caret(page);
      await page.keyboard.type('XY', { delay: 40 });
      await expect.poll(async () => (await caret(page))?.offset).toBe(before!.offset + 2);

      const after = await caret(page);
      expect(after!.sid).toBe(before!.sid);
      // Typed where the caret was, in the order it was typed
      expect(after!.text.slice(before!.offset, before!.offset + 2)).toBe('XY');
      expect(after!.text).toBe(
        before!.text.slice(0, before!.offset) + 'XY' + before!.text.slice(before!.offset)
      );

      // ...and the page shows what the model holds
      const shown = await page
        .locator(target.selector)
        .nth(target.nth)
        .evaluate((el) => el.textContent ?? '');
      expect(shown.replace(/﻿/g, '')).toContain('XY');
    });
  }
});

test.describe('what is typed is what is stored', () => {
  /**
   * Known failure, and what is known about it.
   *
   * Spaces in the middle of a line are kept and shown — that was `white-space`,
   * and it fixed both the look and the letter that used to land before them.
   * At the *end* of a paragraph they are still not a place the browser will put
   * a caret: typing "A", three spaces and "B" leaves the caret where the "A"
   * ended, so the model gets "AB" and then the spaces. A caret filler after the
   * text was tried — the shape that fixes it for an empty block — and did not
   * move it. The next thing to look at is what the caret is restored to after
   * the render that follows each space.
   */
  test.fixme('keeps several spaces, in the order they were typed', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickText(page, '.w-paragraph', { nth: 1, at: 'end' });
    await page.keyboard.press('End');

    const before = await caret(page);
    await page.keyboard.type('A   B', { delay: 60 });
    await expect.poll(async () => (await caret(page))?.offset).toBe(before!.offset + 5);

    // Three spaces between the letters, not one, and not after them
    expect((await caret(page))!.text.slice(before!.offset)).toBe('A   B');
  });

  test('shows every space it stored', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickText(page, '.w-paragraph', { nth: 1, at: 'end' });
    await page.keyboard.press('End');
    await page.keyboard.type('A   B', { delay: 60 });

    // Measured rather than read: the DOM keeps the spaces either way, and the
    // question is whether the reader sees them. Three spaces are wider than one.
    const widths = await page.evaluate(() => {
      const measure = (text: string) => {
        const el = document.querySelector('.w-paragraph')!;
        const span = document.createElement('span');
        span.textContent = text;
        span.style.whiteSpace = getComputedStyle(el).whiteSpace;
        el.appendChild(span);
        const width = span.getBoundingClientRect().width;
        span.remove();
        return width;
      };
      return { one: measure('A B'), three: measure('A   B') };
    });
    expect(widths.three).toBeGreaterThan(widths.one + 4);
  });

  test('puts the caret after the last character, not before it', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    // Clicking past the end of the text on its own line is how a reader asks for
    // the end of the paragraph.
    await clickText(page, '.w-paragraph', { nth: 1, at: 'end' });
    const at = await caret(page);
    expect(at!.offset).toBe(at!.text.length);

    await page.keyboard.type('!');
    await expect.poll(async () => (await caret(page))?.text.endsWith('!')).toBe(true);
  });
});

/**
 * Drawn matter is not content, and a caret in it is a caret nowhere: what it
 * shows is computed, and typing into it is lost on the next render.
 */
test.describe('what a caret must not reach', () => {
  test('leaves the table of contents alone', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const before = await page.locator('.w-toc').textContent();
    await clickText(page, '.w-toc-entry', { nth: 2, at: 'middle' });
    await page.keyboard.type('ZZ');
    await page.waitForTimeout(300);

    // Whatever the caret did, the table of contents still says what it computed
    expect(await page.locator('.w-toc').textContent()).toBe(before);
  });
});
