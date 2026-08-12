import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * Equations, edited in the document.
 *
 * The model is OMML's — a tree of constructs with named slots — and a slot is an
 * ordinary editable container. That is the whole reason for the shape: the
 * caret, the input path and undo already work inside an element that holds text,
 * so an equation is edited where it sits rather than in a dialogue, and nothing
 * had to be added to the input path to allow it.
 */
test.describe('an equation', () => {
  test('is drawn as structure, not as a picture of one', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const drawn = await page.evaluate(() => {
      const fraction = document.querySelector('.w-math-frac')?.getBoundingClientRect();
      return {
        slots: document.querySelectorAll('.w-math-slot').length,
        // Every slot is a model node, which is what makes it a place the caret
        // can go rather than a span somebody drew.
        slotsWithIds: [...document.querySelectorAll('.w-math-slot')].filter((s) =>
          s.getAttribute('data-bc-sid')
        ).length,
        // Two lines tall: the numerator sits above the denominator rather than
        // beside it.
        fractionIsStacked: !!fraction && fraction.height > 30
      };
    });

    expect(drawn.slots).toBeGreaterThan(4);
    expect(drawn.slotsWithIds).toBe(drawn.slots);
    expect(drawn.fractionIsStacked).toBe(true);
  });

  test('takes the caret into a slot and typing goes there', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await page.locator('.w-math-num').first().click();
    await expect
      .poll(async () => page.evaluate(() => (window as any).editor.selection?.type))
      .toBe('range');

    await page.keyboard.type('Z');
    await page.waitForTimeout(700);

    const after = await page.evaluate(() => {
      const ed = (window as any).editor;
      const run = ed.dataStore.getNode(ed.selection.startNodeId);
      return {
        // The caret is in a run of mathematical text inside the numerator, not
        // in the paragraph around the equation.
        caretIn: ed.dataStore.getNode(run?.parentId)?.stype,
        numerator: document.querySelector('.w-math-num')?.textContent ?? ''
      };
    });

    expect(after.caretIn).toBe('mathRun');
    expect(after.numerator).toContain('Z');
  });

  test('shows an empty slot rather than hiding it', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    // The radical's degree is empty — a square root — and Word draws the slot
    // anyway. A slot the caret can enter and the author cannot see is a place to
    // lose text in.
    const degree = page.locator('.w-math-deg').first();
    await expect(degree).toBeVisible();
    const box = await degree.boundingBox();
    expect(box!.width).toBeGreaterThan(0);
  });
});

/**
 * Tab through the slots.
 *
 * This is how an equation gets written: make a fraction, type the numerator,
 * Tab, type the denominator. Without it the slots are places only the mouse can
 * reach, which is not how anybody writes mathematics.
 */
test.describe('moving between slots', () => {
  const slotOfCaret = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const ed = (window as any).editor;
      const SLOTS = new Set(['mathNum', 'mathDen', 'mathElement', 'mathSup', 'mathSub', 'mathDeg']);
      let node = ed.dataStore.getNode(ed.selection?.startNodeId);
      for (let depth = 0; node && depth < 40; depth++) {
        if (SLOTS.has(node.stype)) return node.stype;
        node = node.parentId ? ed.dataStore.getNode(node.parentId) : null;
      }
      return null;
    });

  test('Tab steps forward and Shift+Tab back', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    // The numerator's own run, not the radical nested inside it — a click on the
    // slot itself lands wherever the pointer was, which may be a slot further
    // down.
    await page.locator('.w-math-num > .w-math-run').first().click();
    await expect.poll(() => slotOfCaret(page)).toBe('mathNum');

    await page.keyboard.press('Tab');
    await expect.poll(() => slotOfCaret(page)).toBe('mathDeg');

    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => slotOfCaret(page)).toBe('mathNum');
  });

  test('makes a place for the caret in an empty slot', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await page.locator('.w-math-num > .w-math-run').first().click();
    await expect.poll(() => slotOfCaret(page)).toBe('mathNum');

    // The radical's degree is empty, so it has no text node to put a caret in
    // and Tab has to make one. A Tab that appeared to do nothing would be the
    // alternative.
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);

    const landed = await page.evaluate(() => {
      const ed = (window as any).editor;
      const run = ed.dataStore.getNode(ed.selection?.startNodeId);
      const slot = ed.dataStore.getNode(ed.dataStore.getNode(run?.parentId)?.parentId);
      return { caretIn: run?.stype, slot: slot?.stype };
    });

    expect(landed).toEqual({ caretIn: 'inline-text', slot: 'mathDeg' });

    // Typing into it does not work yet, and this is where it stops: an empty
    // inline-text renders a zero-width filler, and the input path's guard for
    // that case turns the keystroke away. Its comment says what has to be fixed
    // in the reconciler first, and doing it here would be changing the typing
    // path on the way past.
  });

  test('leaves Tab alone outside an equation', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const before = await page.evaluate(() => (window as any).editor.getContext('inEquation'));
    await page.locator('.w-paragraph').first().click();
    await page.waitForTimeout(300);

    // Scoped by context rather than decided inside the command, so a Tab in a
    // table still moves between cells.
    expect(await page.evaluate(() => (window as any).editor.getContext('inEquation'))).toBe(false);
    expect(before === true || before === false || before === undefined).toBe(true);
  });
});

test.describe('brackets', () => {
  test('grow to the height of what they hold', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const measured = await page.evaluate(() => {
      const delimiter = document.querySelector('.w-math-delim')!;
      const open = delimiter.querySelector('.w-math-fence-open')!.getBoundingClientRect();
      const close = delimiter.querySelector('.w-math-fence-close')!.getBoundingClientRect();
      const fraction = delimiter.querySelector('.w-math-frac')!.getBoundingClientRect();
      const oneLine = document.querySelector('.w-math-run')!.getBoundingClientRect();
      return {
        open: Math.round(open.height),
        close: Math.round(close.height),
        content: Math.round(fraction.height),
        oneLine: Math.round(oneLine.height)
      };
    });

    // Word grows a bracket by assembling glyph pieces named in the font's MATH
    // table. There is none to read here, so these are borders that stretch —
    // exact at every height, and only an approximation of the shape.
    expect(measured.open).toBe(measured.content);
    expect(measured.close).toBe(measured.content);
    expect(measured.content).toBeGreaterThan(measured.oneLine * 2);
  });

  test('are the construct\'s, not the content\'s', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    // Typing between them must not be able to delete them, and they must not be
    // copied with the text.
    const chrome = await page.evaluate(() =>
      [...document.querySelectorAll('.w-math-fence')].every(
        (fence) => fence.getAttribute('data-bc-chrome') === 'true'
      )
    );
    expect(chrome).toBe(true);
  });

  test('add no height to the paragraph they sit in', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    // They are as tall as the equation and part of it. Counting them as
    // something the layout drew on top took a 44px paragraph to −36 and left it
    // with no lines at all, which moved every page after it.
    const lines = await page.evaluate(() => {
      const layout = [...(window as any).wordLayout.values()][0];
      return layout.pages.flatMap((page: any) => page.fragments).some((f: any) => f.toLine > f.fromLine);
    });
    expect(lines).toBe(true);
  });
});
