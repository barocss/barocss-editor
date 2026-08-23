import { test, expect } from '@playwright/test';
import { openDeck } from './helpers';

/**
 * Making a frame, which the deck could do everything with except make one.
 *
 * `frame` has been drawn by this product since the canvas renderers were
 * written, arranged by `layoutChildren` since auto-layout, and adjusted from the
 * properties panel — direction, gap, padding, columns, all wired to
 * `setFrameLayout`. And the only frames that had ever existed were the two in
 * `sample-deck.ts`, because no command put one on a slide. A feature that works
 * and cannot be reached.
 *
 * What is checked here is the pair: the button makes one, and the panel that was
 * already there arranges it.
 */
test.describe('a frame on a slide', () => {
  /**
   * The frame that was just made, by the selection rather than by position.
   *
   * `.sl-frame` on the stage is not one thing: the deck draws every slide and
   * hides the ones that are not current, so a sample deck's frame on slide four
   * is in the DOM at zero width. Picking "the last one" measured that instead —
   * a test failing on a box the reader is not looking at.
   */
  const madeFrame = async (page: import('@playwright/test').Page) => {
    const sid = await page.evaluate(() => (window as any).editor?.selection?.startNodeId);
    expect(sid, '프레임을 넣고 나서 아무것도 선택되지 않았습니다').toBeTruthy();
    return { sid, locator: page.locator(`.sl-stage [data-bc-sid="${sid}"]`) };
  };

  test('is made by the toolbar, and arrives somewhere the reader can see it', async ({ page }) => {
    await openDeck(page);

    const before = await page.locator('.sl-stage .sl-frame').count();
    /**
     * `exact`, because 프레임 means two things in this app.
     *
     * A frame is a shape that arranges what is in it, and a *frame* is also 1/60
     * of a second — the timeline's transport steps by one. An accessible name is
     * matched by substring unless it is not, so this matched the toolbar's tool
     * and both of the transport's buttons.
     */
    await page.getByRole('button', { name: '프레임', exact: true }).click();
    await expect(page.locator('.sl-stage .sl-frame')).toHaveCount(before + 1);

    const { locator } = await madeFrame(page);

    /**
     * A container arrives empty, so it has to be visible as itself — a frame
     * with no fill and no outline is a box nobody can find or drop anything on.
     */
    const drawn = await locator.evaluate((el) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        width: Math.round(box.width),
        height: Math.round(box.height),
        painted:
          style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent',
        outlined: parseFloat(style.borderTopWidth) > 0
      };
    });
    expect(drawn.width, '프레임에 너비가 없습니다').toBeGreaterThan(50);
    expect(drawn.height).toBeGreaterThan(50);
    expect(drawn.painted, '프레임이 보이지 않습니다').toBe(true);
    expect(drawn.outlined, '프레임에 테두리가 없습니다').toBe(true);
  });

  /**
   * A new frame is a plain box: it arranges nothing until the reader says so.
   * Creating it already arranging would move whatever they drop into it before
   * they had asked for that.
   */
  test('starts with no arrangement, and the panel gives it one', async ({ page }) => {
    await openDeck(page);
    await page.getByRole('button', { name: '프레임', exact: true }).click();
    const { sid } = await madeFrame(page);

    // Inserting selects it, so the panel is already showing this frame — and the
    // layout group appears because `layoutMode` is declared on `frame` alone.
    const direction = page.getByLabel('배치 방향');
    await expect(direction).toBeVisible();
    await expect(direction).toHaveValue('none');

    await direction.selectOption('row');
    await expect(direction).toHaveValue('row');

    const mode = await page.evaluate(
      (id) => (window as any).editor.dataStore.getNode(id)?.attributes?.layoutMode,
      sid
    );
    expect(mode, '모델에 배치가 기록되지 않았습니다').toBe('row');
  });
});
