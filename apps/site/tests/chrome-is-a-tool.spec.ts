import { test, expect, type Page } from '@playwright/test';

/**
 * **The four things that separate a tool from a mock-up**, asked of every control in the chrome.
 *
 * Not a look — a look is a judgement and this suite has a designer's eye on it elsewhere. These are
 * the four a *measurement* can answer, and every one of them found something the eye had walked past
 * for weeks:
 *
 * - **A target a pointer can hit.** Three width switches were 22×20, which is what a 14px picture
 *   and 2px of padding come to when nobody states a size, while every other button on the same
 *   panel was `--ou-control-h`.
 * - **A name a screen reader can read.** Clean, and worth keeping clean.
 * - **Ink a reader can see.** Five rail tabs at 4.3:1. `--ou-muted` was `#737373`, which is 4.74:1
 *   on **white** and 4.35:1 on `--ou-ground` — chosen against the surface it is *least* often drawn
 *   on. Half a step darker answers both.
 * - **A ring the keyboard can follow.** Eight controls with nothing on screen saying where the
 *   keyboard was: six colour swatches, a clear button and the zoom field. The swatches take
 *   `CONTROL`, which answers focus by drawing the *border* in the accent — a field's rule, and the
 *   wrong one for a filled square whose border is a hairline.
 *
 * ## Two ways this measurement was wrong before it was right
 *
 * It read the whole document at first and reported eleven faint controls — six of which were the
 * **reader's own page**, drawn on the boards. A reader's content is not this product's chrome, and a
 * check that says otherwise is a check about somebody else's design.
 *
 * And it called `el.focus()`, which does not raise `:focus-visible` — so it reported nine controls
 * with no ring that all have one. Tabbing is the only honest way to ask, because tabbing is what a
 * reader does.
 */
const ready = async (page: Page) => {
  await page.goto('/');
  /* 관리가 밖이고 편집이 안 — the window opens into the admin, so this goes in. */
  await page.waitForSelector('[data-admin-page]');
  await page.locator('[data-admin-open]').first().click();
  await page.waitForSelector('[data-frame="desktop"] .st-page');
  await page.waitForTimeout(400);
};

/** Every control in the app's own chrome — the boards hold the reader's page, not this product's. */
const CONTROLS =
  'button, input, select, textarea, [role="tab"], [role="button"], [role="menuitem"], a[href], [tabindex]';

test.describe('the chrome, measured', () => {
  test('has a target, a name and readable ink on every control', async ({ page }) => {
    await ready(page);

    const found = await page.evaluate((selector) => {
      const boards = [...document.querySelectorAll('[data-frame]')];
      const controls = [...document.querySelectorAll(selector)].filter(
        (el) => !boards.some((board) => board.contains(el))
      );

      /**
       * The three numbers, **whichever notation the browser hands them back in**.
       *
       * `rgb(23, 23, 23)` counts to 255 and `color(srgb 0.81 0.86 0.98)` counts to 1 — and this read
       * both as 255, so every token that resolves through a `color-mix` came back as near-black. It
       * reported a 13:1 pair as 1.2:1, which is the check calling a legible control unreadable: the
       * worst kind of failure, because the fix it asks for makes the product worse.
       *
       * Told apart by the notation rather than by the size of the numbers — `rgb(0, 0, 1)` is a real
       * colour and guessing from magnitude would read it as white.
       */
      const luminance = (colour: string) => {
        const parts = (colour.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number);
        const scale = colour.startsWith('color(') ? 1 : 255;
        const [r, g, b] = parts;
        const lin = (v: number) => {
          const c = v / scale;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      };

      /*
       * The ground it is **really** painted on, walked up until something opaque is found — not the
       * token beside it in the stylesheet. `--ou-muted` passed against white and failed against
       * `--ou-ground`, which is where a rail's tabs actually sit.
       */
      const groundOf = (el: Element): string => {
        let up: Element | null = el;
        while (up) {
          const bg = getComputedStyle(up).backgroundColor;
          if (bg && !bg.startsWith('rgba(0, 0, 0, 0)')) return bg;
          up = up.parentElement;
        }
        return 'rgb(255, 255, 255)';
      };

      const small: string[] = [];
      const nameless: string[] = [];
      const faint: string[] = [];

      for (const el of controls) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;

        const said = (el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent ?? '')
          .trim();

        // 24 is the smallest a control in this suite gets; 16 across allows a divider or a handle.
        if (box.height < 22 || box.width < 16) {
          small.push(`${said || el.className} ${Math.round(box.width)}×${Math.round(box.height)}`);
        }
        if (!said) nameless.push(`${el.tagName}.${String(el.className).slice(0, 40)}`);

        const words = (el.textContent ?? '').trim();
        if (words) {
          const drawn = getComputedStyle(el);
          const a = luminance(drawn.color) + 0.05;
          const b = luminance(groundOf(el)) + 0.05;
          const ratio = a > b ? a / b : b / a;
          if (ratio < 4.5) faint.push(`${words.slice(0, 14)} ${ratio.toFixed(1)}:1`);
        }
      }

      return { total: controls.length, small, nameless, faint };
    }, CONTROLS);

    // And it looked at them — an empty result would pass for the wrong reason otherwise.
    expect(found.total).toBeGreaterThan(60);

    expect(found.small, 'a target smaller than a pointer is aimed at rather than moved to').toEqual([]);
    expect(found.nameless, 'a control with no name is one a screen reader cannot offer').toEqual([]);
    expect(found.faint, 'ink under 4.5:1 against the ground it is really painted on').toEqual([]);
  });

  /**
   * **A ring the keyboard can follow**, asked by tabbing.
   *
   * `focus-visible` is what this library draws — a ring left behind by every mouse click is what
   * made the rings that existed get avoided — so `el.focus()` raises nothing and reports every
   * control as ringless. The first version of this did exactly that and was wrong about nine.
   */
  test('shows the keyboard where it is, on everything it can reach', async ({ page }) => {
    await ready(page);
    await page.locator('body').click({ position: { x: 2, y: 2 } });

    const missing: string[] = [];
    let reached = 0;

    for (let step = 0; step < 60; step++) {
      await page.keyboard.press('Tab');
      const seen = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return { on: false, missing: null as string | null };

        const drawn = getComputedStyle(el);
        const ring =
          (drawn.outlineStyle !== 'none' && Number.parseFloat(drawn.outlineWidth) > 0) ||
          drawn.boxShadow !== 'none';
        const said = (el.getAttribute('aria-label') ?? el.textContent ?? el.className)
          .toString()
          .trim()
          .slice(0, 24);
        return { on: true, missing: ring ? null : said };
      });

      if (seen.on) reached += 1;
      if (seen.missing) missing.push(seen.missing);
    }

    expect(reached).toBeGreaterThan(20);
    expect([...new Set(missing)], 'a control the keyboard reaches and nothing marks').toEqual([]);
  });
});
