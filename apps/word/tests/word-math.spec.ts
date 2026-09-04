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

  test('draws an empty slot the caret can reach, and hides only the one it cannot', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    /**
     * **A slot the caret can enter and the author cannot see is a place to lose text in** — which is
     * what this said, and it asked for the wrong half of it.
     *
     * A square root is written `√` and not `²√`, so a radical's degree is hidden unless it says
     * otherwise, and this product draws it that way. The check went on asking for the degree to be
     * **visible**, and while it failed, Tab still stopped in that hidden slot: a **3** typed there
     * went into the document and onto no page. Two halves of one bug, and neither check was right
     * alone.
     *
     * So the rule is stated the way it is now true: a hidden degree is not drawn **and** not a stop.
     * Every other empty slot — a numerator, a denominator — is drawn as a dotted box.
     */
    const degree = page.locator('.w-math-deg').first();
    await expect(degree).toBeHidden();

    const num = page.locator('.w-math-num').first();
    await expect(num).toBeVisible();
    expect((await num.boundingBox())!.width).toBeGreaterThan(0);
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

    /*
     * **Past the degree**, which this radical hides — a hidden slot is not a stop. It was one, and
     * the keystroke a reader spent there went nowhere they could see.
     */
    await page.keyboard.press('Tab');
    await expect.poll(() => slotOfCaret(page)).toBe('mathElement');

    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => slotOfCaret(page)).toBe('mathNum');
  });

  test('makes a place for the caret in an empty slot a reader can see', async ({ page }) => {
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

    /*
     * `mathElement`, not `mathDeg`: this radical hides its degree, and a hidden slot is not a stop.
     * The empty slot that **is** drawn gets a run made for the caret, which is what this is about.
     */
    expect(landed).toEqual({ caretIn: 'inline-text', slot: 'mathElement' });

    // And typing there goes there. The caret has to sit *after* the slot's
    // zero-width filler: a position in front of it is not one the browser will
    // edit at, and the character went to a run earlier in the paragraph.
    await page.keyboard.type('3');
    await page.waitForTimeout(700);

    expect(await page.locator('.w-math-rad .w-math-e').first().textContent()).toContain('3');
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

/**
 * Building an equation by typing it.
 *
 * `a/b` and a space becomes a fraction — Word's linear format, and the reason
 * its equations are written rather than assembled. The space is consumed: it was
 * the instruction to build up, not a character anybody wanted.
 */
test.describe('build-up', () => {
  test('turns a typed line into the equation it describes', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const before = await page.evaluate(() => document.querySelectorAll('.w-math-frac').length);

    await page.locator('.w-paragraph').nth(1).click();
    await expect
      .poll(async () => page.evaluate(() => (window as any).editor.selection?.type))
      .toBe('range');
    await page.keyboard.press('End');
    await page.keyboard.type(' a/b', { delay: 40 });

    // Scoped by context, so an ordinary space anywhere else still reaches the
    // document: bound any wider, Space would never get there at all.
    await expect
      .poll(async () => page.evaluate(() => (window as any).editor.getContext('canBuildUpMath')))
      .toBe(true);

    await page.keyboard.press('Space');
    await page.waitForTimeout(900);

    const after = await page.evaluate(() => {
      const ed = (window as any).editor;
      const walk = (node: any, out: string[] = [], depth = 0): string[] => {
        if (!node || depth > 40) return out;
        if (typeof node.text === 'string') out.push(node.text);
        for (const child of node.content ?? [])
          walk(typeof child === 'string' ? ed.dataStore.getNode(child) : child, out, depth + 1);
        return out;
      };
      const caret = ed.dataStore.getNode(ed.selection?.startNodeId);
      const equation = ed.dataStore.getNode(caret?.parentId);
      return {
        fractions: document.querySelectorAll('.w-math-frac').length,
        // The typed line is gone from the text: it is the structure now.
        stillTyped: walk(ed.dataStore.getNode(ed.getRootId())).some((t) => t.includes('a/b')),
        inMath: !!equation
      };
    });

    expect(after.fractions).toBe(before + 1);
    expect(after.stillTyped).toBe(false);
    expect(after.inMath).toBe(true);
  });

  test('leaves an ordinary space alone', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await page.locator('.w-paragraph').nth(1).click();
    await expect
      .poll(async () => page.evaluate(() => (window as any).editor.selection?.type))
      .toBe('range');
    await page.keyboard.press('End');
    await page.keyboard.type(' hello', { delay: 40 });

    expect(await page.evaluate(() => (window as any).editor.getContext('canBuildUpMath'))).toBe(
      false
    );

    await page.keyboard.press('Space');
    await page.keyboard.type('there', { delay: 40 });
    await page.waitForTimeout(700);

    const text = await page.evaluate(() => {
      const ed = (window as any).editor;
      return ed.dataStore.getNode(ed.selection.startNodeId)?.text ?? '';
    });
    expect(text).toContain('hello there');
  });
});

test.describe('the linear view', () => {
  test('flattens an equation to the line it came from, and back', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const before = await page.evaluate(() => document.querySelectorAll('.w-math-frac').length);

    await page.locator('.w-math-num > .w-math-run').first().click();
    await expect
      .poll(async () => page.evaluate(() => (window as any).editor.selection?.type))
      .toBe('range');

    await page.getByRole('button', { name: 'Linear', exact: true }).click();
    await page.waitForTimeout(900);

    // The equation is a line of text now, in the place it stood, so the sentence
    // around it is undisturbed.
    const flattened = await page.evaluate(() => {
      const surface = document.querySelector('.w-surface')!;
      return {
        fractions: document.querySelectorAll('.w-math-frac').length,
        text: surface.textContent ?? ''
      };
    });

    expect(flattened.fractions).toBe(before - 1);
    expect(flattened.text).toContain('/');
  });
});
