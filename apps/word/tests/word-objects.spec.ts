import { test, expect } from '@playwright/test';

/**
 * Pictures and drawings, and the text that flows around them.
 *
 * Part of the browser suite for apps/word; the shared helpers are in helpers.ts.
 */

/**
 * Pagination is measured, not asserted from the model, so these checks read the
 * browser back: where a sheet is, and where the first block of a page actually
 * landed. A unit test cannot answer either question.
 */
/**
 * Tab stops.
 *
 * A tab is an instruction to reach the next stop, not a character of a fixed
 * width, so how far it stretches depends on where the line put it. Nothing but
 * a browser can answer that, which is why these are here rather than beside the
 * arithmetic they exercise.
 */
/**
 * Pictures, and what the text does about them.
 *
 * An inline picture is a very large character and moves with the words either
 * side of it; a floating one does not, and the lines beside it are shorter.
 * Which it is decides what every line near it does, so this is measured on the
 * page rather than argued about in a stylesheet.
 */
test.describe('pictures', () => {
  /** The width of each line of the paragraph the picture is in. */
  const lineWidths = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const image = document.querySelector('.w-image')!;
      const paragraph = image.closest('.w-paragraph')!;
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      const lines: { top: number; width: number }[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of [...range.getClientRects()]) {
          if (rect.height > 0) lines.push({ top: rect.top, width: rect.width });
        }
      }
      return {
        paragraph: paragraph.getBoundingClientRect().width,
        image: image.getBoundingClientRect().width,
        lines: lines.sort((a, b) => a.top - b.top).map((line) => line.width)
      };
    });

  test('is drawn at the size the document gives it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-image');

    // Eighteen hundred twips by thirteen fifty, which at 96dpi is 120 by 90. A
    // picture with no size is one the browser guesses at, and the guess arrives
    // after the layout was measured.
    const box = await page.locator('.w-image').first().boundingBox();
    expect(Math.round(box!.width)).toBe(120);
    expect(Math.round(box!.height)).toBe(90);
  });

  test('shortens the lines beside it and gives the width back below it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-image');

    // Both halves of what a float does, in one measurement. The fixture runs on
    // past the bottom of the picture on purpose: a paragraph that ended beside
    // it could only show the first half, and the second could go wrong unnoticed.
    const { paragraph, image, lines } = await lineWidths(page);
    const beside = paragraph - image;

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.some((width) => width <= beside)).toBe(true);
    expect(lines.some((width) => width > beside)).toBe(true);
  });

  test('follows the outline when the document gives one', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-image-tight');

    const measured = await page.evaluate(() => {
      const image = document.querySelector('.w-image-tight') as HTMLElement;
      const paragraph = image.closest('.w-paragraph')!;
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      const lines: number[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of [...range.getClientRects()]) {
          if (rect.height > 0) lines.push(rect.width);
        }
      }
      return {
        shape: getComputedStyle(image).shapeOutside,
        paragraph: paragraph.getBoundingClientRect().width,
        image: image.getBoundingClientRect().width,
        lines
      };
    });

    // Word keeps tight wrapping as a polygon and CSS takes one, so the two are
    // the same idea in different units — nought to 21600 a side against
    // percentages.
    expect(measured.shape).toBe('polygon(100% 0%, 100% 100%, 0% 100%)');

    // The proof that the outline is being followed rather than the box: against
    // a triangle, lines near its narrow end run past where the box would have
    // stopped them. With `square` every line beside it would fit in what is
    // left after the full width of the picture.
    const besideTheBox = measured.paragraph - measured.image;
    expect(measured.lines.some((width) => width > besideTheBox)).toBe(true);
  });
});

/**
 * Drawings.
 *
 * A drawing is a canvas with shapes placed on it by coordinate, which is what
 * SVG is, so the mapping is mostly a rename and is tested without a browser.
 * What needs one is whether they reach the page — and for a long time nothing
 * did: four separate faults in the renderer stood between an SVG template and a
 * picture, and every one of them failed silently.
 */

/**
 * Drawings.
 *
 * A drawing is a canvas with shapes placed on it by coordinate, which is what
 * SVG is, so the mapping is mostly a rename and is tested without a browser.
 * What needs one is whether they reach the page — and for a long time nothing
 * did: four separate faults in the renderer stood between an SVG template and a
 * picture, and every one of them failed silently.
 */
test.describe('drawings', () => {
  /**
   * A canvas is put into the document by the test rather than carried in the
   * sample, so that adding one does not move every page after it. Pagination is
   * measured, and a fixture that grows shifts the boundaries every other test
   * is standing on.
   */
  const insertCanvas = (page: import('@playwright/test').Page) =>
    page.evaluate(async () => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const body = (root.content ?? [])
        .map((id: any) => (typeof id === 'string' ? store.getNode(id) : id))
        .find((node: any) => node?.stype !== 'resources' && node?.stype !== 'docMeta');

      await editor.transaction([
        {
          type: 'addChild',
          payload: {
            parentId: body.sid,
            position: 0,
            child: {
              stype: 'canvasBlock',
              attributes: { width: 360, height: 140 },
              content: [
                {
                  stype: 'rectangle',
                  attributes: {
                    x: 10, y: 20, width: 120, height: 80,
                    cornerRadius: 8, fill: '#dbeafe', stroke: '#1d4ed8', strokeWidth: 2
                  }
                },
                {
                  stype: 'ellipse',
                  attributes: {
                    x: 150, y: 20, width: 100, height: 80,
                    fill: '#fee2e2', stroke: '#b91c1c', strokeWidth: 2
                  }
                },
                {
                  stype: 'line',
                  attributes: {
                    x: 270, y: 20, width: 70, height: 80,
                    stroke: '#166534', strokeWidth: 3, rotation: 15
                  }
                },
                {
                  stype: 'path',
                  attributes: {
                    d: 'M 10 120 Q 90 90 170 120 T 340 120',
                    x: 10, y: 90, width: 330, height: 40,
                    stroke: '#7c3aed', strokeWidth: 2
                  }
                }
              ]
            }
          }
        }
      ]).commit();
    });

  test('draws the shapes the canvas holds, at the size it declares', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');
    await insertCanvas(page);
    await page.waitForSelector('.w-canvas');

    // The canvas declares a size rather than growing to fit, so the page can be
    // laid out before anything is drawn in it.
    await expect(page.locator('.w-canvas').first()).toHaveAttribute('viewBox', '0 0 360 140');

    const drawn = await page.evaluate(() => {
      const svg = document.querySelector('.w-canvas')!;
      return {
        // Lower case, and in the SVG namespace. An <SVG> is not an <svg>: SVG
        // is case sensitive, so the upper-cased name this renderer used to
        // create made an unknown element with no geometry that drew nothing.
        tag: svg.tagName,
        namespace: svg.namespaceURI,
        children: [...svg.children].map((child) => child.tagName),
        // Each one occupies space, which an element in the wrong namespace
        // never would.
        widths: [...svg.children].map((child) => Math.round(child.getBoundingClientRect().width))
      };
    });

    expect(drawn.tag).toBe('svg');
    expect(drawn.namespace).toBe('http://www.w3.org/2000/svg');
    expect(drawn.children).toEqual(['rect', 'ellipse', 'line', 'path']);
    for (const width of drawn.widths) expect(width).toBeGreaterThan(0);
  });

  test('turns a shape about its own middle', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');
    await insertCanvas(page);
    await page.waitForSelector('.w-shape-line');

    // Every drawing tool turns a shape about its centre; SVG turns about the
    // origin unless told otherwise, and a shape that did would swing off the
    // canvas. The line is 70 by 80 at (270, 20), so its centre is (305, 60).
    await expect(page.locator('.w-shape-line')).toHaveAttribute('transform', 'rotate(15 305 60)');

    const inside = await page.evaluate(() => {
      const svg = document.querySelector('.w-canvas')!.getBoundingClientRect();
      const box = document.querySelector('.w-shape-line')!.getBoundingClientRect();
      return box.left >= svg.left - 1 && box.right <= svg.right + 1;
    });
    expect(inside).toBe(true);
  });
});
