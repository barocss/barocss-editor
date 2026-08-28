import { test, expect, type Browser } from '@playwright/test';

/**
 * **The chrome follows the theme; the slide does not.**
 *
 * ## Written expecting it to pass, which is the part worth recording
 *
 * The deck's dark theme was the one the other two products were measured *against* — it was called
 * the good one in this repository's own notes — and this check was added to make that a fact rather
 * than a coincidence. It failed on the first run: 23 runs on white slides changed colour with the
 * theme, every bullet and every table cell, near-white on white in the dark.
 *
 * What had actually been measured earlier was the **chrome**, which is excellent, and the slide was
 * never asked about. A deck whose sample happens to open on a title slide with coloured cards looks
 * fine in a screenshot; the fault lives four slides in. The lesson is the smaller one: "product A is
 * the good one" is a claim about whatever was looked at, and it becomes a claim about the product
 * the moment it is written down.
 *
 * ## What the naive version of this check said about a deck, which is worth keeping
 *
 * The first probe walked up from each word to the first painted ancestor and compared luminance. It
 * reported the metric cards' numbers as white-on-white — because a card is a `rectangle` part with
 * its text placed **over** it, not inside it, so the walk climbs past the green and finds the
 * studio. Word's sheets are behind its flow for the same reason and it cried wolf there too. On a
 * canvas, what is behind a word is not among its parents, and a check that assumes otherwise is
 * wrong about every product built on one.
 *
 * Comparing the two themes needs no ancestry at all: a colour drawn on a slide is the same colour in
 * both, and one that moved came from a window token.
 */
const read = async (browser: Browser, scheme: 'light' | 'dark') => {
  const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForSelector('.sl-slide');
  await page.waitForTimeout(1500);
  const seen = await page.evaluate(() => ({
    words: [...document.querySelectorAll('.sl-slide *')]
      .filter((n) => n.children.length === 0 && (n.textContent ?? '').trim().length > 1)
      .slice(0, 60)
      .map((n) => `${(n.textContent ?? '').trim().slice(0, 18)} → ${getComputedStyle(n as HTMLElement).color}`),
    chrome: getComputedStyle(document.querySelector('.sl-filmstrip') as HTMLElement).backgroundColor
  }));
  await ctx.close();
  return seen;
};

test('a slide holds its colour in both themes, and the chrome around it does not', async ({ browser }) => {
  const light = await read(browser, 'light');
  const dark = await read(browser, 'dark');

  expect(light.words.length).toBeGreaterThan(3);
  expect(dark.words).toEqual(light.words);
  expect(dark.chrome).not.toEqual(light.chrome);
});
