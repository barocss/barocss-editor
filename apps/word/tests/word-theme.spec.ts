import { test, expect, type Browser } from '@playwright/test';

/**
 * **The chrome follows the theme; the paper does not.**
 *
 * ## The fault, which shipped and which nothing asked about
 *
 * Word carried 123 colour literals and mapped none of the suite's tokens. Mapping the chrome onto
 * them fixed the window and broke the document in the same commit: the flow took its colour by
 * inheritance, the window's ink is `--ou-ink`, and `--ou-ink` is white in the dark — over a sheet
 * that is white in both. **Every word of the sample was on screen and none of it could be read.**
 * The screenshot that found it looked, at a glance, like a page that had not finished loading, and
 * across three apps not one test mentioned `colorScheme`.
 *
 * ## Why it asks whether the colour *moved* rather than whether it contrasts
 *
 * The obvious probe walks up from each word to the first painted ancestor and compares luminance.
 * It is wrong here: `.w-sheet` is a rectangle drawn **behind** the flow, not around it, so the walk
 * climbs past the paper and finds the window. It reported 75 unreadable elements in a document that
 * reads perfectly. The same mistake put the first version of the fix on `.w-sheet`, where setting a
 * colour changed nothing at all.
 *
 * The rule needs no ancestry. Paper does not follow the theme, so what is drawn on paper has the
 * same colour in both — render twice and compare. A colour that moved came from a window token,
 * which is the entire fault.
 */
const read = async (browser: Browser, scheme: 'light' | 'dark') => {
  const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForSelector('.w-toolbar');
  await page.waitForTimeout(1200);
  const seen = await page.evaluate(() => ({
    words: [...document.querySelectorAll('.w-document *')]
      .filter((n) => n.children.length === 0 && (n.textContent ?? '').trim().length > 1)
      .slice(0, 60)
      .map((n) => `${(n.textContent ?? '').trim().slice(0, 18)} → ${getComputedStyle(n as HTMLElement).color}`),
    chrome: getComputedStyle(document.querySelector('.w-chrome') as HTMLElement).backgroundColor
  }));
  await ctx.close();
  return seen;
};

test('the document holds its colour in both themes, and the window does not', async ({ browser }) => {
  const light = await read(browser, 'light');
  const dark = await read(browser, 'dark');

  // Something was found to ask about; an empty list would pass this for the wrong reason.
  expect(light.words.length).toBeGreaterThan(3);
  expect(dark.words).toEqual(light.words);

  // And the theme did reach the window — otherwise the line above is true of a page that ignored it.
  expect(dark.chrome).not.toEqual(light.chrome);
});
