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

/**
 * **Hidden, faded and turned** — the three every shape beside a frame drew, and a frame did not.
 *
 * `visible`, `opacity` and `rotation` are on the shared geometry, so a rectangle, an ellipse, a
 * line, a path and a picture all honour them. A frame took none, because it is a `<div>` and the two
 * helpers that answer them speak SVG — `display: none` happens to be the same in both, and a
 * `rotate(deg cx cy)` about a point in the canvas's coordinates is not a CSS `transform` at all.
 *
 * So a reader could hide, fade or turn any box on the canvas **except a frame** — which is the one
 * they are most likely to want to turn, because a frame is the box that holds the card.
 *
 * Loaded rather than dragged, because the overlay has no handle for any of the three: that is the
 * other half of this, and it is in the backlog.
 */
test.describe('a frame that is hidden, faded or turned', () => {
  const reframe = async (page: any, attrs: Record<string, unknown>) => {
    await placeCaret(page, '.barocss-editor-content p:not(.w-frame p)', 3);
    await page.getByRole('button', { name: 'Side by side' }).click();
    await expect(page.locator('.w-frame')).toHaveCount(1);

    await page.evaluate((wanted: Record<string, unknown>) => {
      const editor = (window as any).editor;
      const tree = editor.exportDocument(editor.getRootId());
      const find = (node: any): any => {
        if (node?.stype === 'frame') return node;
        for (const child of node?.content ?? []) {
          if (typeof child === 'object') {
            const found = find(child);
            if (found) return found;
          }
        }
        return undefined;
      };
      Object.assign(find(tree).attributes, wanted);
      editor.loadDocument(tree, 'word');
    }, attrs);
    await page.waitForTimeout(800);

  };

  test('goes away when the box says it is not visible', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await reframe(page, { visible: false });

    await expect(page.locator('.w-frame')).toBeHidden();
  });

  test('fades to the opacity the box asks for, and turns about its middle', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await reframe(page, { opacity: 0.4, rotation: 15 });

    const drawn = await page.locator('.w-frame').evaluate((el) => {
      const style = getComputedStyle(el);
      return { opacity: style.opacity, transform: style.transform, origin: style.transformOrigin };
    });

    expect(drawn.opacity).toBe('0.4');
    // A computed `transform` is a matrix; 15° is cos 15° ≈ 0.966 down the diagonal.
    expect(drawn.transform).toMatch(/^matrix\(0\.9659/);
    /*
     * About its middle, which is what the SVG version rotates about.
     *
     * Measured against `offsetWidth`, not the bounding rectangle: a turned box's bounding rectangle
     * is the *outline of the turned thing*, which is larger than the box — asking against it made
     * the origin look 6.7px off centre when it was exactly on it.
     */
    const box = await page
      .locator('.w-frame')
      .evaluate((el) => ({ width: (el as HTMLElement).offsetWidth, height: (el as HTMLElement).offsetHeight }));
    const [x, y] = drawn.origin.split(' ').map(parseFloat);
    expect(Math.abs(x - box.width / 2)).toBeLessThan(2);
    expect(Math.abs(y - box.height / 2)).toBeLessThan(2);
  });
});

