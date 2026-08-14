import { test, expect, type Page } from '@playwright/test';
import { settled } from './helpers';

/**
 * The ruler, and the two things only it could give a reader.
 *
 * There was no way to put a tab stop anywhere. The layout has resolved them
 * since tabs were drawn — every alignment Word has, with leaders — and a
 * document could only carry one if it arrived with one. The same for the two
 * indents that are not a single number: a first line and a hanging one are what
 * every printed paragraph is shaped by, and neither had a control.
 *
 * The arithmetic is in `office-word/src/ruler.ts` and tested without a browser.
 * What is here is what only a browser can answer — that the ruler's inches are
 * the document's inches, and that a pointer does what it looks like it does.
 */

/** The caret into a plain paragraph, and which paragraph that is. */
async function caretInParagraph(page: Page): Promise<string> {
  const block = await page.evaluate(() => {
    const store = (window as any).editor.dataStore;
    for (const el of [...document.querySelectorAll('.w-surface [data-bc-sid]')]) {
      const sid = el.getAttribute('data-bc-sid')!;
      const node = store.getNode(sid);
      if (node?.stype !== 'paragraph' || node.attributes?.numId) continue;
      const runs = ((node.content ?? []) as string[]).filter(
        (child: string) => typeof store.getNode(child)?.text === 'string'
      );
      if (runs.length === 0) continue;

      const runEl = document.querySelector(`[data-bc-sid="${CSS.escape(runs[0])}"]`);
      const walker = document.createTreeWalker(runEl!, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode() as Text;
      const range = document.createRange();
      range.setStart(text, 1);
      range.collapse(true);
      const selection = getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      (document.querySelector('[contenteditable="true"]') as HTMLElement)?.focus();
      return sid;
    }
    return null;
  });
  expect(block, 'no plain paragraph to put the caret in').not.toBeNull();
  await page.waitForTimeout(300);
  return block!;
}

/** What the paragraph says about its stops and its indents. */
function shapeOf(page: Page, block: string) {
  return page.evaluate((sid: string) => {
    const attributes = (window as any).editor.dataStore.getNode(sid)?.attributes ?? {};
    return {
      tabs: (attributes.tabs ?? []) as { pos: number; align?: string }[],
      indentLeft: attributes.indentLeft ?? 0,
      firstLine: attributes.indentFirstLine ?? 0,
      hanging: attributes.indentHanging ?? 0
    };
  }, block);
}

/** Where the text area starts on the ruler, and how wide an inch is on it. */
async function rulerScale(page: Page) {
  return page.evaluate(() => {
    const inches = [...document.querySelectorAll('.w-ruler-inch')] as HTMLElement[];
    const bar = document.querySelector('.w-ruler')!.getBoundingClientRect();
    return {
      left: document.querySelector('.w-ruler-text')!.getBoundingClientRect().left,
      // Between two *numbered* inches. The zero mark carries no number, so its
      // box is a different width, and the labels are centred on their ticks —
      // measuring from it read an inch a little short, which snapping hid at two
      // inches and not at four.
      perInch: inches[2].getBoundingClientRect().left - inches[1].getBoundingClientRect().left,
      middle: bar.y + bar.height / 2,
      top: bar.top
    };
  });
}

test('measures the text area, not the paper', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(500);

  // The margins are the section's padding, not the sheet's — a sheet is paper
  // drawn behind the text and carries none. Measuring the sheet made the ruler
  // eight and a half inches wide where the text is six and a half.
  const shape = await page.evaluate(() => {
    const surface = document.querySelector('.w-surface')!.getBoundingClientRect();
    const style = getComputedStyle(document.querySelector('.w-surface')!);
    const text = document.querySelector('.w-ruler-text')!.getBoundingClientRect();
    return {
      textLeft: Math.round(text.left),
      textWidth: Math.round(text.width),
      wantLeft: Math.round(surface.left + parseFloat(style.paddingLeft)),
      wantWidth: Math.round(
        surface.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      ),
      inches: [...document.querySelectorAll('.w-ruler-inch')].length
    };
  });

  expect(shape.textLeft).toBe(shape.wantLeft);
  expect(shape.textWidth).toBe(shape.wantWidth);
  // 0 through 6, for a 6.5in text area
  expect(shape.inches).toBe(7);
});

test('a click puts a tab stop where the click was', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(500);
  const block = await caretInParagraph(page);
  const scale = await rulerScale(page);

  expect((await shapeOf(page, block)).tabs).toHaveLength(0);
  await page.mouse.click(scale.left + scale.perInch * 2, scale.middle);
  await page.waitForTimeout(300);

  const after = await shapeOf(page, block);
  // Two inches, in the document's own unit, and left-aligned as Word makes them
  expect(after.tabs).toHaveLength(1);
  expect(after.tabs[0]).toMatchObject({ pos: 2880, align: 'left' });
  await expect(page.locator('.w-ruler-stop')).toHaveCount(1);
});

test('a second click on a stop changes what it does', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(500);
  const block = await caretInParagraph(page);
  const scale = await rulerScale(page);

  await page.mouse.click(scale.left + scale.perInch * 2, scale.middle);
  await page.waitForTimeout(300);
  await page.mouse.click(scale.left + scale.perInch * 2, scale.middle);
  await page.waitForTimeout(300);

  // Held and let go where it was is Word's way of cycling the alignment, and
  // taking hold of a stop is also how a drag begins — so this is the case that
  // reads as a drag of no distance unless something separates them.
  const after = await shapeOf(page, block);
  expect(after.tabs[0]).toMatchObject({ pos: 2880, align: 'center' });
});

test('dragging a stop moves it, and dragging it off the ruler removes it', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(500);
  const block = await caretInParagraph(page);
  const scale = await rulerScale(page);

  await page.mouse.click(scale.left + scale.perInch * 2, scale.middle);
  await page.waitForTimeout(300);

  await page.mouse.move(scale.left + scale.perInch * 2, scale.middle);
  await page.mouse.down();
  await page.mouse.move(scale.left + scale.perInch * 4, scale.middle, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect((await shapeOf(page, block)).tabs[0]).toMatchObject({ pos: 5760 });

  // Off the top of the ruler, which is the only way to get rid of one
  await page.mouse.move(scale.left + scale.perInch * 4, scale.middle);
  await page.mouse.down();
  await page.mouse.move(scale.left + scale.perInch * 4, scale.top - 40, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect((await shapeOf(page, block)).tabs).toHaveLength(0);
});

test('the first-line marker sets the indent no control could reach', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(500);
  const block = await caretInParagraph(page);
  const scale = await rulerScale(page);

  const marker = page.locator('.w-ruler-marker.is-first');
  const box = (await marker.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(scale.left + scale.perInch, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const after = await shapeOf(page, block);
  expect(after.firstLine).toBe(1440);
  // The rest of the paragraph stays where it was — this marker is only the
  // first line, which is the whole reason it is separate
  expect(after.indentLeft).toBe(0);
  expect(after.hanging).toBe(0);
});

test('dragging the first line left of the rest makes it a hanging indent', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(500);
  const block = await caretInParagraph(page);
  const scale = await rulerScale(page);

  // Move the paragraph in first, so there is room to its left
  await page.keyboard.press('Control+m');
  await page.waitForTimeout(300);
  expect((await shapeOf(page, block)).indentLeft).toBe(720);

  const marker = page.locator('.w-ruler-marker.is-first');
  const box = (await marker.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(scale.left, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // One measurement with two names and opposite signs, which Word keeps exclusive
  const after = await shapeOf(page, block);
  expect(after.hanging).toBe(720);
  expect(after.firstLine).toBe(0);
});
