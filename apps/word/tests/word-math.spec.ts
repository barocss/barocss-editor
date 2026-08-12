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
