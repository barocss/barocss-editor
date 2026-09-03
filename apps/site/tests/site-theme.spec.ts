import { test, expect, type Browser } from '@playwright/test';

/**
 * **The chrome follows the theme; the boards do not.**
 *
 * ## What this product's half of the fault looked like
 *
 * `--ou-board` is `#ffffff` and stays white in the dark, which was already right. What no token
 * said was the colour of the words **on** the board, so they took the window's — and in the dark
 * every heading came out near-white on white. Measured at 1.04:1, 57 elements of it, while the
 * paragraphs beside them read perfectly because their colour happened to be set by hand. A page
 * half-legible is worse evidence than a page fully broken: it looks like a rendering hiccup rather
 * than a rule that was never written.
 *
 * The fix is a token beside the one that was already there — `--ou-board-written`, stated rather
 * than themed — and `.st-frame-body` naming both, because a ground and its ink are one decision.
 *
 * ## And the other direction, which the same measurement found
 *
 * The sample's closing band paints itself near-black. Its heading was near-black too: 1.06:1, dark
 * on dark, in **both** themes — an authoring fault rather than a theming one, and one the builder
 * could not have fixed, because the panel offered a 배경 row and no 글자 row. A section could flip
 * the ground and had no way to say what was written on it. That is now `ink` on the box, inherited,
 * so one statement reaches everything added to the band afterwards.
 */
const read = async (browser: Browser, scheme: 'light' | 'dark') => {
  const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();
  await page.goto('/');
  /* 관리가 밖이고 편집이 안 — the window opens into the admin, so this goes in. */
  await page.waitForSelector('[data-admin-page]');
  await page.locator('[data-admin-open]').first().click();
  await page.waitForSelector('.st-frame-body');
  await page.waitForTimeout(2000);
  const seen = await page.evaluate(() => ({
    words: [...document.querySelectorAll('.st-frame-body *')]
      .filter((n) => n.children.length === 0 && (n.textContent ?? '').trim().length > 1)
      .slice(0, 60)
      .map((n) => `${(n.textContent ?? '').trim().slice(0, 18)} → ${getComputedStyle(n as HTMLElement).color}`),
    chrome: getComputedStyle(document.querySelector('.st-rail') as HTMLElement).backgroundColor
  }));
  await ctx.close();
  return seen;
};

test('a board holds its colour in both themes, and the studio around it does not', async ({ browser }) => {
  const light = await read(browser, 'light');
  const dark = await read(browser, 'dark');

  expect(light.words.length).toBeGreaterThan(3);
  expect(dark.words).toEqual(light.words);
  expect(dark.chrome).not.toEqual(light.chrome);
});

/**
 * And the band that flips the ground says what is written on it — the `ink` attribute, end to end.
 *
 * Asserted on the drawn page rather than on the model, because the attribute is only worth anything
 * if it reaches the words: a schema field the renderer ignores is exactly the class of fault this
 * repository keeps finding.
 */
test('a section that paints itself dark states its own ink, and it reaches the words', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();
  await page.goto('/');
  /* 관리가 밖이고 편집이 안 — the window opens into the admin, so this goes in. */
  await page.waitForSelector('[data-admin-page]');
  await page.locator('[data-admin-open]').first().click();
  await page.waitForSelector('.st-frame-body');
  await page.waitForTimeout(2000);

  /**
   * The colour is **read from the document**, not written here.
   *
   * It held the sample's own hex, and a change of palette broke a check that is not about a colour:
   * what it claims is that a band which flips its ground states what is written on it, and that the
   * statement reaches the words. So it asks the document what the band said, and compares.
   */
  const band = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('.st-frame-body *')].find((n) =>
      (n.textContent ?? '').trim().startsWith('문서 하나로 시작해')
    );
    const editor = (window as any).editor;
    const store = editor.dataStore;
    let said = '';
    const walk = (sid: string) => {
      const node = store.getNode(sid);
      if (!node || said) return;
      if (node.stype === 'variable' && node.attributes?.name === '종이') said = String(node.attributes.value);
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId());
    const hex = said.replace('#', '');
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return {
      drawn: heading ? getComputedStyle(heading as HTMLElement).color : 'not drawn',
      wanted: `rgb(${rgb.join(', ')})`
    };
  });

  // Light on the band's near-black, rather than the board's near-black it would inherit otherwise.
  expect(band.drawn).toBe(band.wanted);
  await ctx.close();
});
