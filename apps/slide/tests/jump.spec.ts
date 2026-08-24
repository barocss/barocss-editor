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

/**
 * The deck as a **picture of where its presses go**.
 *
 * A filmstrip says what order the pages are in, and once a deck has buttons that is no longer the
 * whole truth. The two things a strip cannot show are exactly the two a reader most needs: a page
 * nothing leads to, and a button that leads nowhere — an island is obvious in a picture and
 * invisible in a list.
 *
 * It is a **view**: nothing in it is written, so there is nothing here about state — every test
 * is "given these buttons, what does a reader see".
 */
test.describe('the deck’s map', () => {
  const openMap = async (page: Page) => {
    await page.locator('[data-deck-map]').click();
    await expect(page.locator('.sl-map')).toHaveCount(1);
    await page.waitForTimeout(500);
  };

  test('draws every page, the deck’s order and the buttons', async ({ page }) => {
    await openDeck(page);
    await openMap(page);

    // Every page, including the hidden one: a page kept in the deck is in the picture, drawn as
    // what it is.
    const pages = page.locator('[data-map-page]');
    expect(await pages.count()).toBe(6);
    await expect(page.locator('[data-map-hidden="true"]')).toHaveCount(1);

    /*
     * The spine, and the sample's two buttons — 표지로 and the one that reaches the page the show
     * skips. Drawn in the accent, because a jump is the thing a reader added; the spine is what a
     * deck does anyway.
     */
    expect(await page.locator('[data-map-link="flow"]').count()).toBeGreaterThan(0);
    expect(await page.locator('[data-map-link="jump"]').count()).toBe(2);
  });

  test('is somewhere to go, and closes when it takes you there', async ({ page }) => {
    await openDeck(page);
    await openMap(page);

    const target = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      return ((root.content ?? []) as string[]).find(
        (sid: string) => store.getNode(sid)?.attributes?.id === 'cards'
      );
    });
    await page.locator(`[data-map-page="${target}"]`).click();
    await page.waitForTimeout(500);

    // A press in the map is "take me there": staying would make the reader press twice for one
    // intention, which is the rule the check's rows already follow.
    await expect(page.locator('.sl-map')).toHaveCount(0);
    expect(await currentSlide(page)).toBe(target);
  });

  test('marks a page nothing leads to, and a button that leads nowhere', async ({ page }) => {
    await openDeck(page);

    // Break the sample's button, and add a page nothing can reach.
    await page.evaluate(async () => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const cards = ((root.content ?? []) as string[]).find(
        (sid: string) => store.getNode(sid)?.attributes?.id === 'cards'
      );
      const button = ((store.getNode(cards)?.content ?? []) as string[]).find(
        (sid: string) => store.getNode(sid)?.attributes?.goTo === 'title'
      );
      await editor
        .transaction([{ type: 'setAttrs', payload: { nodeId: button, attrs: { goTo: 'deleted' } } }])
        .commit();
    });
    await page.waitForTimeout(400);
    await openMap(page);

    /*
     * The deck's own check says both of these as a list; the map is the same two answers laid out
     * where a reader can see *why*.
     */
    await expect(page.locator('[data-map-dead]')).toHaveCount(1);
    await expect(page.locator('.sl-map-broken')).toHaveCount(1);
    /*
     * And nothing is an island **here**, which is worth asserting rather than assuming: this test
     * is what found the model's first rule wrong. It reported five of the sample's six pages as
     * unreachable the moment a button existed — nonsense, because pressing on still reaches them.
     * An island is a *hidden* page nothing links to, and the sample's hidden page has a button.
     */
    await expect(page.locator('[data-map-unreachable="true"]')).toHaveCount(0);
  });

  test('runs its ranks the other way when asked', async ({ page }) => {
    await openDeck(page);
    await openMap(page);

    const shape = async () => {
      const box = await page.locator('.sl-map-canvas').boundingBox();
      return box ? Math.round((box.width / box.height) * 100) : 0;
    };
    const down = await shape();
    await page.locator('.sl-map').getByLabel('지도 방향').selectOption('right');
    await page.waitForTimeout(500);
    // A deck of six pages reads down and a deck of twenty reads across — the same choice the
    // diagram tidy offers, and the same words.
    expect(await shape()).not.toBe(down);
  });

  test('is not drawn while presenting', async ({ page }) => {
    await openDeck(page);
    await openMap(page);
    await page.locator('[data-present]').click();
    await page.waitForTimeout(600);
    // An audience is looking at a page, not at the deck's plumbing — the same rule the rulers,
    // the guides, the layer list and the check follow.
    await expect(page.locator('.sl-map')).toHaveCount(0);
  });
});

/**
 * Rewiring the deck **in the map**, which is what a map is for.
 *
 * The gesture a connector already has — pick up the end, drop it on something else — and the
 * reason it is the right one here: "which button" is a question a drag between two pages cannot
 * answer, and this one takes hold of the button that is already there. Making a *new* button is
 * still the panel's 누르면 row, because there would be no shape for a page-to-page drag to attach
 * to and inventing one would be the map deciding what a reader meant.
 */
test.describe('moving a jump in the map', () => {
  test('drops an arrow’s end on another page, and the button follows', async ({ page }) => {
    await openDeck(page);
    await page.locator('[data-deck-map]').click();
    await expect(page.locator('.sl-map')).toHaveCount(1);
    await page.waitForTimeout(500);

    // The sample's 표지로 button: an arrow with a grip on its end.
    const button = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const cards = ((root.content ?? []) as string[]).find(
        (sid: string) => store.getNode(sid)?.attributes?.id === 'cards'
      );
      const found = ((store.getNode(cards)?.content ?? []) as string[]).find(
        (sid: string) => store.getNode(sid)?.attributes?.goTo === 'title'
      );
      return found;
    });
    const grip = page.locator(`[data-map-grip="${button}"]`);
    await expect(grip).toHaveCount(1);

    // Drop it on the third page.
    const target = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      return ((root.content ?? []) as string[]).filter(
        (sid: string) => store.getNode(sid)?.stype === 'surface'
      )[2];
    });

    const from = (await grip.boundingBox())!;
    const to = (await page.locator(`[data-map-page="${target}"]`).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    // The page says it is where the drop would land, which is the only thing a reader has to go on.
    await expect(page.locator(`[data-map-page="${target}"][data-map-over="true"]`)).toHaveCount(1);
    await page.mouse.up();
    await page.waitForTimeout(700);

    const now = await page.evaluate(
      (ids) => {
        const store = (window as any).editor.dataStore;
        return {
          goTo: store.getNode(ids.button)?.attributes?.goTo,
          targetId: store.getNode(ids.target)?.attributes?.id
        };
      },
      { button, target }
    );
    // The button points at the page it was dropped on — by that page's durable id, minted by the
    // command if the page had none.
    expect(typeof now.targetId).toBe('string');
    expect(now.goTo).toBe(now.targetId);
  });

  test('changes nothing when the end is dropped on no page', async ({ page }) => {
    await openDeck(page);
    await page.locator('[data-deck-map]').click();
    await page.waitForTimeout(500);

    const before = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const cards = ((root.content ?? []) as string[]).find(
        (sid: string) => store.getNode(sid)?.attributes?.id === 'cards'
      );
      const found = ((store.getNode(cards)?.content ?? []) as string[]).find(
        (sid: string) => store.getNode(sid)?.attributes?.goTo === 'title'
      );
      return { sid: found, goTo: store.getNode(found)?.attributes?.goTo };
    });

    const grip = page.locator(`[data-map-grip="${before.sid}"]`);
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Out over the empty part of the pane.
    await page.mouse.move(box.x + 6, box.y - 120, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const after = await page.evaluate(
      (sid) => (window as any).editor.dataStore.getNode(sid)?.attributes?.goTo,
      before.sid
    );
    // A button that quietly lost its page because a reader let go in the wrong place is worse
    // than a drag that fails.
    expect(after).toBe(before.goTo);
  });
});
