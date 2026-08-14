import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * The shell, and the map down its left side.
 *
 * The whole page used to scroll, which took the ribbon and the ruler off the
 * screen with it — and a ruler the text is not beside is a ruler for nothing.
 * The window is the frame now: the chrome holds its place, and the one thing
 * that scrolls is the document.
 *
 * The outline needed no new reading of the document. `tocEntries` already
 * answers exactly this, headings and `outlineLevel` paragraphs alike, so the
 * contents page and this pane are two drawings of one answer.
 */

test('the window is the frame, and only the document scrolls', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(400);

  const before = await page.evaluate(() => {
    const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect().top;
    return {
      ruler: Math.round(rect('.w-ruler')),
      documentScroll: document.querySelector('.w-shell-document')!.scrollTop,
      windowScrollable:
        document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight
    };
  });
  // Nothing for the window itself to scroll: the shell is exactly the viewport
  expect(before.windowScrollable).toBeLessThanOrEqual(1);

  await page.locator('.w-shell-document').evaluate((pane) => pane.scrollBy(0, 1200));
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => ({
    ruler: Math.round(document.querySelector('.w-ruler')!.getBoundingClientRect().top),
    documentScroll: Math.round(document.querySelector('.w-shell-document')!.scrollTop)
  }));

  expect(after.documentScroll, 'the document did not scroll').toBeGreaterThan(500);
  expect(after.ruler, 'the ruler scrolled away with the page').toBe(before.ruler);
});

test('the outline lists every heading, indented by its level', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(400);

  const items = page.locator('.w-outline [data-outline-sid]');
  expect(await items.count()).toBeGreaterThan(3);

  // The levels the document actually has, and a deeper one indented further
  const levels = await items.evaluateAll((els) =>
    els.map((el) => Number(el.getAttribute('data-outline-level')))
  );
  expect(Math.min(...levels)).toBe(1);
  expect(Math.max(...levels)).toBeGreaterThan(1);

  const padding = await items.evaluateAll((els) =>
    els.map((el) => parseFloat(getComputedStyle(el).paddingLeft))
  );
  const deepest = levels.indexOf(Math.max(...levels));
  const shallowest = levels.indexOf(1);
  expect(padding[deepest]).toBeGreaterThan(padding[shallowest]);
});

test('the outline goes deeper than the contents page does', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(400);

  // A contents page lists 1–3 by default; a map that hid the rest would
  // disagree with the document it is a map of.
  const inOutline = await page
    .locator('.w-outline [data-outline-sid]')
    .evaluateAll((els) => els.map((el) => el.textContent?.trim()));
  const inContents = await page
    .locator('.w-toc-entry')
    .evaluateAll((els) => els.map((el) => el.textContent?.replace(/[\s.]*\d+$/, '').trim()));

  expect(inOutline.length).toBeGreaterThanOrEqual(inContents.length);
  for (const entry of inContents) {
    if (entry) expect(inOutline.some((one) => one?.startsWith(entry.slice(0, 12)))).toBe(true);
  }
});

test('clicking an entry takes the reader and the caret there', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(400);

  const items = page.locator('.w-outline [data-outline-sid]');
  const last = items.nth((await items.count()) - 1);
  const sid = await last.getAttribute('data-outline-sid');

  await last.click();

  // Waited for rather than slept through: the pane scrolls smoothly, and how
  // long seven thousand pixels take is not a number a test should be guessing.
  await expect
    .poll(
      () =>
        page.evaluate((target: string) => {
          const heading = document.querySelector(`#editor [data-bc-sid="${CSS.escape(target)}"]`);
          const box = heading?.getBoundingClientRect();
          return !!box && box.top > 0 && box.top < window.innerHeight;
        }, sid!),
      { timeout: 8000, message: 'the heading was not brought into view' }
    )
    .toBe(true);

  const landed = await page.evaluate((target: string) => {
    const heading = document.querySelector(`#editor [data-bc-sid="${CSS.escape(target)}"]`);
    const box = heading!.getBoundingClientRect();
    const selection = (window as any).editor.selection;
    return {
      onScreen: box.top > 0 && box.top < window.innerHeight,
      caretIn: selection?.startNodeId ?? null,
      inside: !!heading!.querySelector(`[data-bc-sid="${CSS.escape(selection?.startNodeId ?? '')}"]`)
    };
  }, sid!);

  expect(landed.onScreen).toBe(true);
  // The caret goes with the reader, so they can start typing where they asked
  expect(landed.inside).toBe(true);
  await expect(last).toHaveClass(/is-here/);
});

test('closes to a strip, and opens again', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(400);

  await page.locator('.w-outline-title button').click();
  await expect(page.locator('.w-outline')).toHaveCount(0);
  // A pane with no way back is a pane a reader closes once
  await page.locator('.w-outline-closed').click();
  await expect(page.locator('.w-outline')).toHaveCount(1);
});
