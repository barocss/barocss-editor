import { test, expect } from '@playwright/test';
import { placeCaret, settled } from './helpers';

/**
 * A **drawing** in a page.
 *
 * Word's canvas was declared, drawn, arranged and paginated for months with no command that made
 * one — half a schema a reader could not reach. The arithmetic and the transaction are unit-tested
 * in `office-word`; what only a browser shows is that the drawing lands **in the flow**: it sits
 * between the paragraphs, it takes the width the text has, and what is on it is drawn where the
 * model says rather than in the corner.
 */
test.describe('a drawing in the page', () => {
  test('arrives with a shape on it, between the paragraphs', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await placeCaret(page, '.barocss-editor-content p:not(.w-frame p)', 3);

    await page.locator('[data-control="insert-rectangle"]').click();
    await settled(page);

    const canvas = page.locator('.w-canvas');
    await expect(canvas).toHaveCount(1);

    // In the flow, and as wide as the text: the section answered that, not a constant.
    const drawn = await canvas.boundingBox();
    const column = await page.locator('.barocss-editor-content p:not(.w-frame p)').first().boundingBox();
    expect(Math.abs(drawn!.width - column!.width)).toBeLessThan(4);
    // Half as tall as it is wide, which is what a drawing canvas is.
    expect(Math.round(drawn!.height / drawn!.width * 100)).toBe(50);

    // The rectangle is inside it, painted, and a quarter of it — drawn where the model says.
    const rect = canvas.locator('rect');
    await expect(rect).toHaveCount(1);
    const shape = await rect.boundingBox();
    expect(Math.round(shape!.width / drawn!.width * 100)).toBe(25);
    await expect(rect).toHaveAttribute('fill', '#2563eb');
  });

  test('puts the next shape on the same drawing', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await placeCaret(page, '.barocss-editor-content p:not(.w-frame p)', 3);

    await page.locator('[data-control="insert-rectangle"]').click();
    await settled(page);

    /*
     * With the rectangle selected — which is what the pointer will do once there is an overlay —
     * "here" is its canvas. Selected through the editor, because selecting a shape by clicking is
     * the next slice and this test is about *where a shape goes*.
     */
    await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const walk = (sid: string): string | undefined => {
        const node = store.getNode(sid);
        if (node?.stype === 'rectangle') return sid;
        for (const child of node?.content ?? []) {
          if (typeof child === 'string') {
            const found = walk(child);
            if (found) return found;
          }
        }
        return undefined;
      };
      editor.setNode({ nodeIds: [walk(editor.getRootId())] });
    });
    await page.locator('[data-control="insert-ellipse"]').click();
    await settled(page);

    // One drawing, two shapes — not a second drawing under the first.
    await expect(page.locator('.w-canvas')).toHaveCount(1);
    await expect(page.locator('.w-canvas rect')).toHaveCount(1);
    await expect(page.locator('.w-canvas ellipse')).toHaveCount(1);
  });

  test('is taken back whole by one undo', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await placeCaret(page, '.barocss-editor-content p:not(.w-frame p)', 3);

    await page.locator('[data-control="insert-rectangle"]').click();
    await settled(page);
    await expect(page.locator('.w-canvas')).toHaveCount(1);

    await page.keyboard.press('Control+z');
    await settled(page);

    // The canvas goes with the rectangle: an empty canvas left behind would be the editor keeping
    // half of a gesture nobody made.
    await expect(page.locator('.w-canvas')).toHaveCount(0);
  });
});
