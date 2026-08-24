import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { drawnFill, openDeck } from './helpers';

/**
 * A shape with a gradient, a shadow and a dash.
 *
 * A shape's whole style was `fill`, `stroke` and `strokeWidth` — a flat colour
 * and a solid line, which is a diagram's vocabulary. This deck is measured
 * against tools where a gradient and a shadow are not effects a reader goes
 * hunting for but what "designing" means, and nothing further on the roadmap is
 * worth much before it: a theme has no colour slots to resolve until a shape has
 * more than one colour, and an animation has nothing worth watching until the
 * thing it moves looks designed.
 *
 * The arithmetic is unit-tested in `office-slides/test/paint.test.ts`. What only
 * a browser shows is the chain: the panel writes an attribute, the schema keeps
 * it, the renderer reads it, and the browser paints it.
 */
const newRectangle = async (page: Page) => {
  await page.getByRole('button', { name: '사각형' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).editor?.selection?.startNodeId ?? null))
    .not.toBeNull();
  return page.evaluate(() => (window as any).editor.selection.startNodeId as string);
};

const cssOf = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-bc-sid="${CSS.escape(id)}"]`)!;
    const style = getComputedStyle(el);
    return {
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
      border: style.border
    };
  }, sid);

/**
 * Setting a colour, which is now a control rather than the browser's dialog.
 *
 * `<input type="color">` could only ever produce a hex string, and a deck's
 * shapes can say `theme:accent1` — so the panel grew a field that can hold what
 * the document can hold: the theme's slots, a standard row, a picker, and the
 * value typed out. These tests take the last of those, because a hex is what
 * they are asserting on.
 */
const setColour = async (page: Page, label: string, value: string) => {
  await page.getByLabel(label, { exact: true }).click();
  // The field opens the picker, whose hex box carries the digits without the
  // `#` — the picker draws that, because a reader typing a colour types six
  // characters and not seven.
  await page.getByLabel('색상 코드').fill(value.replace('#', ''));
  await page.waitForTimeout(250);
  // The panel closes on a pointer outside it, like every other one here.
  await page.keyboard.press('Escape');
};

test.describe('designing a shape', () => {
  /**
   * The gradient and the shadow moved from four flat rows each into the two
   * *lists* a shape actually has — see `paint.spec.ts` for the stacks. What is
   * kept here is the chain each one still has to prove: the panel writes it, the
   * schema keeps it, the browser paints it.
   */
  test('takes a gradient from the panel and paints it', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);

    await page.locator('.sl-properties').getByLabel('1번 채우기 종류').selectOption('linear');
    await page.waitForTimeout(400);
    await page.locator('.sl-properties').getByLabel('1번 채우기', { exact: true }).click();
    /*
      * Blurred, because the panel's fields commit when the reader is done with
      * them rather than on every keystroke — see `NumberField`, which exists
      * because a field that wrote per keystroke put 10.68 seconds in a document
      * where 1.8 was typed.
      */
    await page.locator('.sl-properties').getByLabel('1번 각도').fill('135');
    await page.locator('.sl-properties').getByLabel('1번 각도').blur();
    await page.waitForTimeout(400);

    /**
     * Read from the element the fill is *drawn* as rather than from the box: a
     * gradient is a layer now, for the three things a `background` could not do.
     * See `office-slides/src/fill-layers.ts`.
     */
    await expect.poll(async () => (await drawnFill(page, sid, 0))?.background).toContain(
      'linear-gradient(135deg'
    );
  });

  /**
   * A gradient needs both ends — which is now "at least two stops", and the
   * control cannot take one below that: the delete is disabled at two, because a
   * gradient of one stop is a colour pretending to be a gradient.
   */
  test('will not let a gradient fall below two stops', async ({ page }) => {
    await openDeck(page);
    await newRectangle(page);

    await page.locator('.sl-properties').getByLabel('1번 채우기 종류').selectOption('linear');
    await page.waitForTimeout(400);
    await page.locator('.sl-properties').getByLabel('1번 채우기', { exact: true }).click();

    await expect(page.locator('.sl-properties').getByLabel('1번 지점 삭제')).toBeDisabled();
  });

  test('takes a shadow, and lets it be moved', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);

    await page.locator('.sl-properties').getByLabel('효과 추가').click();
    await page.waitForTimeout(400);
    await expect.poll(async () => (await cssOf(page, sid)).boxShadow).not.toBe('none');

    // Straight down by default, which is where a shadow is unless it is told.
    expect((await cssOf(page, sid)).boxShadow).toMatch(/\b0px \d/);

    await page.locator('.sl-properties').getByLabel('1번 가로').fill('6');
    await page.locator('.sl-properties').getByLabel('1번 가로').blur();
    await page.waitForTimeout(400);
    // The panel is in points and the browser draws pixels: 6pt is 120 twips is
    // 8px. The field says what a designer says; the model keeps twips like every
    // other length; and neither of them is what CSS prints.
    expect((await cssOf(page, sid)).boxShadow).toContain('8px');
  });

  test('draws the dash the panel names', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);

    await setColour(page, '선 색', '#111111');
    await page.getByLabel('선 모양').selectOption('dash');

    await expect.poll(async () => (await cssOf(page, sid)).border).toContain('dashed');
  });

  /**
   * The rows come from the schema, so a node that declares none of this gets
   * none of the controls — the same rule that gives a rectangle a corner radius
   * and a group nothing.
   */
  test('offers the design rows only where the shape declares them', async ({ page }) => {
    await openDeck(page);
    await newRectangle(page);
    await expect(page.locator('.sl-properties').getByLabel('채우기 추가')).toBeVisible();
    await expect(page.locator('.sl-properties').getByLabel('효과 추가')).toBeVisible();

    /**
     * And with nothing selected the panel shows the slide, and none of them.
     *
     * Reloaded rather than deselected only because this test predates the
     * gesture; Escape clears a selection now, and the deselect suite proves it.
     */
    await openDeck(page);
    await expect(page.locator('.sl-properties').getByLabel('채우기 추가')).toHaveCount(0);
  });
});

/**
 * Two shapes selected: what the panel says, and what it changes.
 *
 * Measured on 2026-08-20, and it was a fault rather than a gap: with a 6000-twip
 * rectangle and a 2000-twip ellipse selected, the panel showed **10.58cm** — the
 * rectangle's width, presented as the selection's — and typing a width changed the
 * rectangle and left the ellipse alone. A reader who selects two shapes and types a
 * number is asking for two shapes to be that wide.
 *
 * The controls had been ready since Word's ruler: `PropertyNumber` draws a `null`
 * as an empty field with a placeholder so that committing it is a no-op. Nothing
 * had ever passed it one.
 */
test.describe('a panel about more than one shape', () => {
  const two = async (page: Page) => {
    const rect = await page.evaluate(async () => {
      await (window as any).editor.executeCommand('insertRectangle', {
        x: 3000,
        y: 3000,
        width: 6000,
        height: 4000
      });
      return (window as any).editor.selection?.nodeIds?.[0] as string;
    });
    const oval = await page.evaluate(async () => {
      await (window as any).editor.executeCommand('insertEllipse', {
        x: 11000,
        y: 3000,
        width: 2000,
        height: 4000
      });
      return (window as any).editor.selection?.nodeIds?.[0] as string;
    });
    await page.evaluate(
      (ids) => (window as any).editor.executeCommand('setNode', { nodeIds: ids }),
      [rect, oval]
    );
    await page.waitForTimeout(400);
    return { rect, oval };
  };

  const attrs = (page: Page, sid: string) =>
    page.evaluate((id) => (window as any).editor.dataStore.getNode(id)?.attributes ?? {}, sid);

  test('says nothing where they differ, and the value where they agree', async ({ page }) => {
    await openDeck(page);
    await two(page);
    const panel = page.locator('.sl-properties');

    // The widths differ, so the field is empty rather than one of the two.
    /*
     * Exactly named: a shape's panel now has a second control per bindable attribute
     * ("너비 문서 변수", §10h-2), and `getByLabel` matches by substring. Two controls about one word
     * is ordinary in a panel; the substring match is the loose half.
     */
    await expect(panel.getByLabel('너비', { exact: true })).toHaveValue('');
    // The heights agree, so it says so — a blank field for everything would be
    // its own kind of lie.
    await expect(panel.getByLabel('높이', { exact: true })).not.toHaveValue('');
    // And the heading says what the fields are about.
    await expect(panel.locator('h3').first()).toHaveText('2개 선택');
  });

  test('changes both, in one edit', async ({ page }) => {
    await openDeck(page);
    const { rect, oval } = await two(page);
    const panel = page.locator('.sl-properties');

    await panel.getByLabel('너비', { exact: true }).fill('10');
    await panel.getByLabel('너비', { exact: true }).blur();
    await page.waitForTimeout(500);

    // 10cm is 5669 twips, and both of them are it.
    expect((await attrs(page, rect)).width).toBe(5669);
    expect((await attrs(page, oval)).width).toBe(5669);
    // What was not typed is untouched: the ellipse keeps its own height.
    expect((await attrs(page, oval)).height).toBe(4000);

    /*
     * One undo, because it was one edit.
     *
     * The command writes every box in one transaction. Six shapes retyped once
     * would otherwise be six presses of undo to get back — the ruler's mistake,
     * which `PropertyNumber` already exists to avoid one level up.
     */
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    expect((await attrs(page, rect)).width).toBe(6000);
    expect((await attrs(page, oval)).width).toBe(2000);
  });

  /**
   * A *stack* cannot be blanked the way a number can.
   *
   * "These two have no shared list of fills" is not a list, and an empty panel
   * would hide the very rows a reader is about to replace. So the rows are one
   * box's and a note says so — Figma's *Mixed* chip, in a sentence — and editing
   * writes to the whole selection, which is what clicking that chip does.
   */
  test('says when the fills differ, and stops saying it once they do not', async ({ page }) => {
    await openDeck(page);
    const { rect, oval } = await two(page);
    await page.evaluate(
      ([a, b]) => {
        const run = (window as any).editor.executeCommand.bind((window as any).editor);
        run('setBoxStyle', {
          nodeId: a,
          fills: [{ kind: 'solid', color: '#ff0000', opacity: 1, visible: true }]
        });
        run('setBoxStyle', {
          nodeId: b,
          fills: [{ kind: 'solid', color: '#00ff00', opacity: 1, visible: true }]
        });
      },
      [rect, oval]
    );
    await page.evaluate(
      (ids) => (window as any).editor.executeCommand('setNode', { nodeIds: ids }),
      [rect, oval]
    );
    await page.waitForTimeout(500);

    const panel = page.locator('.sl-properties');
    await expect(panel).toContainText('채우기가 서로 다릅니다');

    // Editing writes to both, and then there is nothing to say.
    await page.evaluate(
      (ids) =>
        (window as any).editor.executeCommand('setBoxStyle', {
          nodeIds: ids,
          fills: [{ kind: 'solid', color: '#0000ff', opacity: 1, visible: true }]
        }),
      [rect, oval]
    );
    await page.waitForTimeout(500);
    await expect(panel).not.toContainText('채우기가 서로 다릅니다');
    expect((await attrs(page, oval)).fills?.[0]?.color).toBe('#0000ff');
  });

  /**
   * A row only one of them has: the corner radius. Offered, because the rectangle
   * has corners — and written only where it means something, which the schema
   * already knew and the command now asks per box.
   */
  test('writes what a shape declares and skips what it does not', async ({ page }) => {
    await openDeck(page);
    const { rect, oval } = await two(page);
    const panel = page.locator('.sl-properties');

    const radius = panel.getByLabel('모서리 둥글기', { exact: true });
    await expect(radius).toHaveCount(1);
    await radius.fill('0.3');
    await radius.blur();
    await page.waitForTimeout(500);

    expect((await attrs(page, rect)).cornerRadius).toBe(170);
    // The ellipse is round; it never gained the attribute at all.
    expect((await attrs(page, oval)).cornerRadius).toBeUndefined();
  });
});

/**
 * Mirroring, which every drawing tool has and this one did not.
 *
 * Two things a browser has to confirm, because both are about composition rather
 * than about the attribute: the mirror lands *after* the rotation in one
 * `transform`, and pressing the button twice puts the shape back exactly.
 */
test.describe('flipping a box', () => {
  test('mirrors after the turn, and is its own undo', async ({ page }) => {
    await openDeck(page);
    const sid = await newRectangle(page);
    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setBoxGeometry', { nodeId: id, rotation: 30 }),
      sid
    );
    await page.waitForTimeout(400);

    const drawn = () =>
      page.evaluate((id) => {
        const el = document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`)!;
        const attrs = (window as any).editor.dataStore.getNode(id)?.attributes ?? {};
        return { transform: getComputedStyle(el).transform, flipX: attrs.flipX, rotation: attrs.rotation };
      }, sid);

    const before = await drawn();
    expect(before.rotation).toBe(30);

    await page.locator('[data-control="flip-h"]').click();
    await page.waitForTimeout(450);

    const after = await drawn();
    expect(after.flipX).toBe(true);
    // The turn survives — a flip is not a rotation — and the matrix is mirrored.
    expect(after.rotation).toBe(30);
    expect(after.transform).not.toBe(before.transform);

    await page.locator('[data-control="flip-h"]').click();
    await page.waitForTimeout(450);
    // Exactly back: a toggle is its own undo, which is what makes it safe to try.
    expect((await drawn()).transform).toBe(before.transform);
    expect((await drawn()).flipX).toBe(false);
  });

  /**
   * A toggle *per box*: with one mirrored shape and one not, "flip" means mirror
   * each of them rather than make them both mirrored. Every tool means the
   * second, and so does the word.
   */
  test('flips each of a selection on its own', async ({ page }) => {
    await openDeck(page);
    const rect = await newRectangle(page);
    const oval = await page.evaluate(async () => {
      await (window as any).editor.executeCommand('insertEllipse', {
        x: 11000,
        y: 3000,
        width: 2000,
        height: 2000
      });
      return (window as any).editor.selection?.nodeIds?.[0] as string;
    });
    // One of them starts mirrored.
    await page.evaluate(
      (id) => (window as any).editor.executeCommand('flipBoxes', { nodeIds: [id], axis: 'y' }),
      rect
    );
    await page.waitForTimeout(400);
    await page.evaluate(
      (ids) => (window as any).editor.executeCommand('setNode', { nodeIds: ids }),
      [rect, oval]
    );
    await page.waitForTimeout(300);

    await page.locator('[data-control="flip-v"]').click();
    await page.waitForTimeout(500);

    const flips = await page.evaluate(
      (ids) =>
        ids.map(
          (id: string) => (window as any).editor.dataStore.getNode(id)?.attributes?.flipY ?? false
        ),
      [rect, oval]
    );
    // The one that was mirrored is not any more; the one that was not, is.
    expect(flips).toEqual([false, true]);
  });
});
