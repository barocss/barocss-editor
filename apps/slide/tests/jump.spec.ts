import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, currentSlide } from './helpers';

/**
 * A deck that is **not a line**: a shape a reader presses, and the page it shows.
 *
 * The click was not new, and measuring that first is what made this small: `present.tsx` already
 * collected the shapes whose press runs something and already had the rule a jump needs — *a
 * press that fires one does not also advance the deck* — written when a build could be fired by a
 * click, with the reason that a quiz answer must not advance past its own tick.
 *
 * The sample deck ships one button, on the card slide, pointing at the cover by the cover's
 * durable id. A fixture would have proved less: every design in this repository that was decided
 * against one had to be decided twice.
 */
const cardSlide = async (page: Page) => {
  const sid = await page.evaluate(() => {
    const editor = (window as any).editor;
    const store = editor.dataStore;
    const root = store.getNode(editor.getRootId());
    return ((root.content ?? []) as string[]).find(
      (one: string) => store.getNode(one)?.attributes?.id === 'cards'
    );
  });
  await page.locator(`.sl-filmstrip button[data-slide="${sid}"]`).click();
  await page.waitForTimeout(400);
  return sid as string;
};

test.describe('a button on a slide', () => {
  test('is in the drawing, so a reader can see what leads somewhere', async ({ page }) => {
    await openDeck(page);
    await cardSlide(page);

    // The drawing says where it goes — which is also what makes the attribute *read*, and the
    // conformance check is right to ask the drawing.
    const button = page.locator('.sl-stage [data-go-to="title"]');
    await expect(button).toHaveCount(1);
  });

  test('takes the show to the page it names, and does not also advance', async ({ page }) => {
    await openDeck(page);
    const from = await cardSlide(page);

    await page.locator('[data-present]').click();
    await page.waitForTimeout(600);

    const box = await page.locator('.sl-stage [data-go-to="title"]').boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(700);

    const to = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const showing = document.querySelector('.sl-stage .sl-slide:not([style*="display: none"])');
      const sid = showing?.getAttribute('data-bc-sid');
      return { sid, id: sid ? store.getNode(sid)?.attributes?.id : null };
    });
    // The cover, not the page after the card slide: the press was the button's, and a press that
    // both jumped and advanced would land a reader one page past what they chose.
    expect(to.id).toBe('title');
    expect(to.sid).not.toBe(from);

    await page.keyboard.press('Escape');
  });

  test('is made from the panel, which offers the pages by name', async ({ page }) => {
    await openDeck(page);
    const slide = await cardSlide(page);

    // A shape of the reader's own, selected.
    const made = await page.evaluate(async (sid) => {
      const editor = (window as any).editor;
      // Awaited: a command is async, and reading the selection on the next line gave the
      // selection from *before* the insert — which is how this test first measured nothing.
      await editor.executeCommand('insertRectangle', { slideId: sid });
      return editor.selection?.nodeIds?.[0];
    }, slide);
    await page.waitForTimeout(500);

    const row = page.locator('.sl-properties').getByLabel('누르면 이동');
    await expect(row).toHaveCount(1);
    /*
     * Chosen by *value* here, which is `page:<sid>`: the control offers the pages by name because
     * that is what a reader knows, and the value is where the page is this session. What the
     * document gets is neither — it is the page's durable id, minted by the command.
     */
    const second = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      return ((root.content ?? []) as string[]).filter(
        (one: string) => store.getNode(one)?.stype === 'surface'
      )[1];
    });
    await row.selectOption(`page:${second}`);
    await page.waitForTimeout(600);

    const written = await page.evaluate((sid) => {
      const store = (window as any).editor.dataStore;
      const node = store.getNode(sid);
      const to = node?.attributes?.goTo;
      const target = ((store.getNode((window as any).editor.getRootId()).content ?? []) as string[])
        .map((one: string) => store.getNode(one))
        .find((one: any) => one?.attributes?.id === to);
      return { to, targetIsSurface: target?.stype === 'surface' };
    }, made);
    expect(typeof written.to).toBe('string');
    expect(written.targetIsSurface).toBe(true);
  });

  test('and the deck’s own check says when a button leads nowhere', async ({ page }) => {
    await openDeck(page);
    await cardSlide(page);

    // Point the sample's button at a page that does not exist.
    await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const slide = ((root.content ?? []) as string[]).find(
        (one: string) => store.getNode(one)?.attributes?.id === 'cards'
      );
      const button = ((store.getNode(slide)?.content ?? []) as string[]).find(
        (one: string) => store.getNode(one)?.attributes?.goTo === 'title'
      );
      return editor.transaction([
        { type: 'setAttrs', payload: { nodeId: button, attrs: { goTo: 'deleted' } } }
      ]).commit();
    });
    await page.waitForTimeout(500);

    await page.locator('[data-audit]').first().click();
    await page.waitForTimeout(500);
    // Certainly wrong: a press that does nothing in front of a room is not a matter of taste.
    await expect(page.locator('.sl-audit-list li[data-audit="dead-jump"]')).toHaveCount(1);
  });
});
