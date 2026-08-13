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
  {
    name: 'an equation run',
    selector: '.w-math .w-text',
    nth: 0,
    /**
     * The first run of an equation begins at a boundary between two inline
     * things, and which side of it a point falls on is the browser's own hit
     * test — measured, a click on the first pixel of the "x" lands after the
     * space before the equation, and four pixels in it lands after the "x".
     * Offset 0 of the run is not a position a pointer can ask for, so asking
     * for it here would be asserting against the platform.
     */
    startIsABoundary: true
  },
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

/**
 * Where in the text the caret lands, not just which text.
 *
 * Aiming is two questions and the matrix above only asks one. A reader clicking
 * the first letter of a word means before it; clicking past the last means the
 * end. Getting the node right and the offset wrong is the same experience as
 * getting neither right — what you type appears somewhere you did not ask for.
 */
test.describe('where in the line the caret lands', () => {
  for (const target of TARGETS) {
    test(`lands at both ends of ${target.name}`, async ({ page }) => {
      await page.goto('/');
      await settled(page);
      test.skip((await page.locator(target.selector).count()) <= target.nth, 'not in the sample');
      await page.locator(target.selector).nth(target.nth).scrollIntoViewIfNeeded();

      await clickText(page, target.selector, { nth: target.nth, at: 'start' });
      const atStart = await caret(page);
      if (target.startIsABoundary) {
        // At a boundary the caret may be on either side of it; what it must not
        // be is somewhere else entirely.
        const near = atStart!.offset === 0 || atStart!.offset >= atStart!.text.length - 1;
        expect(near, 'a click at the boundary landed away from it').toBe(true);
      } else {
        expect(atStart!.offset, 'clicking the first letter should mean before it').toBe(0);
      }

      await clickText(page, target.selector, { nth: target.nth, at: 'end' });
      const atEnd = await caret(page);
      expect(atEnd!.offset, 'clicking past the last letter should mean after it').toBe(
        atEnd!.text.length
      );
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
  test('keeps several spaces, in the order they were typed', async ({ page }) => {
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
 * Clicking the parts of an equation that are not letters.
 *
 * A fraction is mostly not text: the bar between the numerator and the
 * denominator, the space beside a radical, the inside of a bracket. A reader
 * aiming at an equation hits those as often as a glyph, and where the caret goes
 * then is what decides whether the equation can be edited at all.
 */
test.describe('clicking an equation where there is no letter', () => {
  const STRUCTURE = [
    { name: 'the bar of a fraction', selector: '.w-math-frac' },
    { name: 'a bracket', selector: '.w-math-delim' },
    { name: 'a radical', selector: '.w-math-rad' }
  ];

  for (const part of STRUCTURE) {
    test(`puts the caret inside the equation when clicking ${part.name}`, async ({ page }) => {
      await page.goto('/');
      await settled(page);

      const found = await page.locator(part.selector).count();
      test.skip(found === 0, `the sample has no ${part.name}`);

      // The equation this construct is *in* — not the first one on the page,
      // which is a different equation and was quietly being asserted about.
      const math = page.locator('.w-math').filter({ has: page.locator(part.selector) }).first();
      await math.scrollIntoViewIfNeeded();

      // The middle of the construct's own box, which is the structure rather
      // than any of its text.
      const box = (await page.locator(part.selector).first().boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect
        .poll(() => page.evaluate(() => (window as any).editor?.selection?.startNodeId ?? null))
        .not.toBeNull();

      const inside = await page.evaluate(() => {
        const selection = (window as any).editor.selection;
        const el = document.querySelector(`[data-bc-sid="${CSS.escape(selection.startNodeId)}"]`);
        return !!el?.closest('.w-math');
      });
      expect(inside, 'the caret left the equation').toBe(true);

      // ...and what is typed goes into the equation, not into the sentence
      // around it.
      await page.keyboard.type('7');
      await expect.poll(() => math.textContent()).toContain('7');
    });
  }
});

/**
 * Drawn matter is not content, and a caret in it is a caret nowhere: what it
 * shows is computed, and typing into it is lost on the next render.
 */
test.describe('what a caret must not reach', () => {
  test('leaves the table of contents alone, and goes where the line points', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    // Not clickText: that waits for the model to describe the click, and the
    // point of this one is that it never will — the entry is computed text and
    // holds no position to describe.
    const entry = page.locator('.w-toc-entry').nth(2);
    const target = (await entry.getAttribute('data-toc-target'))!;
    const box = (await entry.boundingBox())!;

    // Computed text takes no caret at all
    await expect(entry).toHaveCSS('user-select', 'none');

    await page.mouse.click(box.x + 30, box.y + box.height / 2);
    await expect
      .poll(() =>
        page.evaluate((sid) => {
          const selection = (window as any).editor?.selection;
          if (!selection) return false;
          const el = document.querySelector(`[data-bc-sid="${CSS.escape(selection.startNodeId)}"]`);
          return !!el?.closest(`[data-bc-sid="${CSS.escape(sid as string)}"]`);
        }, target)
      )
      .toBe(true);

    // Typing goes to the heading the line stands for — and the line follows,
    // because it is a drawing of that heading rather than text of its own.
    const heading = page.locator(`[data-bc-sid="${target}"]`);
    await page.keyboard.type('ZZ');
    await expect(heading).toContainText('ZZ');
    await expect(entry).toContainText('ZZ');
  });
});
