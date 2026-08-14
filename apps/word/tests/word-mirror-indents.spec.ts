import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * A paragraph that indents from the spine.
 *
 * `mirrorIndents` says the left and right indents are really an *inside* and an
 * *outside* one — the inside being the edge the binding is on, which changes
 * side every page. It is what makes a bound document look right, and nothing
 * read it: the attribute has been in the schema since paragraph formatting was.
 *
 * Set at runtime rather than in the sample. Which side a paragraph lands on is
 * what this is about, and putting it in the fixture would tie the answer to
 * where the pages happen to break.
 */
test('swaps a paragraph’s indents on a left-hand page and not on a right', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(600);

  // Two paragraphs on facing pages: one whose page shows an odd number, one even
  const pair = await page.evaluate(() => {
    const layout = (window as any).wordLayout?.values().next().value;
    const found: Record<string, string> = {};
    for (const [sid, index] of layout.pageOfBlock as Map<string, number>) {
      const node = (window as any).editor.dataStore.getNode(sid);
      if (node?.stype !== 'paragraph') continue;
      const side = (index + 1) % 2 === 0 ? 'even' : 'odd';
      if (!found[side]) found[side] = sid;
    }
    return found;
  });
  expect(pair.odd, 'no paragraph on a right-hand page').toBeTruthy();
  expect(pair.even, 'no paragraph on a left-hand page').toBeTruthy();

  await page.evaluate((sids: Record<string, string>) => {
    const editor = (window as any).editor;
    for (const sid of Object.values(sids)) {
      editor.dataStore.updateNode(sid, {
        attributes: {
          ...(editor.dataStore.getNode(sid)?.attributes ?? {}),
          indentLeft: 1440,
          indentRight: 720,
          mirrorIndents: true
        }
      });
    }
    editor.emit('editor:content.change', { from: 'test' });
  }, pair);
  await page.waitForTimeout(900);

  const drawn = await page.evaluate((sids: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(sids).map(([side, sid]) => {
        const style = getComputedStyle(
          document.querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`)!
        );
        return [side, { left: Math.round(parseFloat(style.marginLeft)), right: Math.round(parseFloat(style.marginRight)) }];
      })
    ), pair) as Record<string, { left: number; right: number }>;

  // 1in and 0.5in, in the order the side of the page puts them
  expect(drawn.odd).toEqual({ left: 96, right: 48 });
  expect(drawn.even, 'the left-hand page did not swap them').toEqual({ left: 48, right: 96 });
});
