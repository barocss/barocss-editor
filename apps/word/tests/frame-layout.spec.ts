import { test, expect } from '@playwright/test';
import { placeCaret, settled } from './helpers';

/**
 * Two things side by side, without drawing a table to do it.
 *
 * A word processor's document is one column of blocks, so every report that
 * wants two columns of text or a row of cards ends up containing a table with
 * its borders switched off. `frame` is the node that says "these go in a row",
 * and none of what it does can be checked without a browser: the schema and the
 * command are unit-tested, and whether the box *lays out* is a question only a
 * layout engine can answer.
 *
 * Each of these failed while it was being built:
 *
 * - The frame was refused by the schema, because a placed node must state a
 *   width and a frame in the flow has none to state.
 * - The frame arrived with empty paragraphs, which draw no line — 307 pixels
 *   wide and zero high, so neither half could be clicked into.
 * - A row of flex children with no text in them collapsed to nothing, because a
 *   flex item is as wide as its contents.
 */
test.describe('a frame in the document flow', () => {
  /** Put the caret somewhere ordinary, then insert a frame from the toolbar. */
  const insert = async (page: any, label: string) => {
    await placeCaret(page, '.barocss-editor-content p:not(.w-frame p)', 3);
    await page.getByRole('button', { name: label }).click();
    await expect(page.locator('.w-frame')).toHaveCount(1);
  };

  test('puts two paragraphs beside each other, each half the width', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await insert(page, 'Side by side');

    const frame = page.locator('.w-frame');
    await expect(frame).toHaveAttribute('data-layout', 'row');
    await expect(frame.locator('> p')).toHaveCount(2);

    const halves = await frame.locator('> p').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect())
    );
    // Side by side: the second starts after the first ends, and on the same line.
    expect(halves[1].left, '두 번째 단이 첫 번째 옆에 있지 않습니다').toBeGreaterThan(halves[0].right - 1);
    expect(Math.abs(halves[0].top - halves[1].top), '두 단의 윗변이 다릅니다').toBeLessThan(2);
    // And an even split, which is what "side by side" means before anything is
    // typed. Without `flex: 1 1 0` an empty paragraph is zero wide.
    expect(Math.abs(halves[0].width - halves[1].width)).toBeLessThan(2);
    expect(halves[0].width).toBeGreaterThan(100);
  });

  /**
   * The one that made the frame usable. An empty paragraph draws no line, so
   * the halves had no height and there was nothing to put a caret in — a box a
   * reader could only get out of with undo.
   */
  test('can be typed into on either side', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await insert(page, 'Side by side');

    await placeCaret(page, '.w-frame > p', 0);
    await page.keyboard.type('왼쪽');
    await placeCaret(page, '.w-frame > p', 1);
    await page.keyboard.type('오른쪽');

    await expect(page.locator('.w-frame > p').nth(0)).toContainText('왼쪽');
    await expect(page.locator('.w-frame > p').nth(1)).toContainText('오른쪽');
    // Each character in the half it was typed in, which is the whole test:
    // a caret that drifted between keystrokes would put them in one paragraph.
    await expect(page.locator('.w-frame > p').nth(0)).not.toContainText('오른쪽');
  });

  test('a grid divides the width into the columns it declares', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await insert(page, 'Grid');

    const frame = page.locator('.w-frame');
    await expect(frame).toHaveAttribute('data-layout', 'grid');
    await expect(frame.locator('> p')).toHaveCount(4);

    const widths = await frame.locator('> p').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().width)
    );
    for (const width of widths) {
      expect(Math.abs(width - widths[0]), '그리드 칸의 너비가 다릅니다').toBeLessThan(2);
    }
  });

  /**
   * A frame in the flow has no `x` and no `y`, and neither do the paragraphs in
   * it. The same code arranges frames on a canvas by *writing* coordinates onto
   * their children, and a paragraph given one would carry a number no renderer
   * reads and every save keeps.
   */
  test('writes no coordinates into the document', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await insert(page, 'Side by side');
    // Let the layout reaction run at least once.
    await page.waitForTimeout(500);

    const attrs = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const found: string[][] = [];
      const walk = (sid: string, depth: number) => {
        const node = store.getNode(sid);
        if (!node || depth > 40) return;
        if (node.stype === 'frame') {
          found.push(Object.keys(node.attributes ?? {}));
          for (const child of node.content ?? []) {
            found.push(Object.keys(store.getNode(child)?.attributes ?? {}));
          }
        }
        for (const child of node.content ?? []) {
          if (typeof child === 'string') walk(child, depth + 1);
        }
      };
      walk(editor.getRootId(), 0);
      return found;
    });

    expect(attrs.length).toBeGreaterThan(0);
    for (const keys of attrs) {
      expect(keys, '프레임 안에 좌표가 쓰였습니다').not.toContain('x');
      expect(keys).not.toContain('y');
      expect(keys).not.toContain('width');
    }
  });
});
