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
/**
 * Which page is **on screen**, asked by computed style.
 *
 * Not `:not([style*="display: none"])`, which is what this suite tried first: the stage hides the
 * pages it is not focused on with a **generated stylesheet** (it names a sid, so it cannot be in
 * the app's own CSS file), and an inline-style selector matches every slide element in the DOM.
 * The test then read the *first* one and compared it with itself.
 */
const onScreen = (page: Page) =>
  page.evaluate(() => {
    const shown = [...document.querySelectorAll<HTMLElement>('.sl-stage .sl-slide')].find(
      (one) => getComputedStyle(one).display !== 'none'
    );
    return shown?.getAttribute('data-bc-sid') ?? null;
  });

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

    const sid = await onScreen(page);
    const to = {
      sid,
      id: await page.evaluate(
        (one) => (one ? (window as any).editor.dataStore.getNode(one)?.attributes?.id : null),
        sid
      )
    };
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

/**
 * A deck that moves by its **links only** — Keynote's mode, and the one setting a deck has.
 *
 * "What does a click mean here" cannot be answered per page: a deck where half the pages advance
 * and half do not is a deck nobody can present. So it is one decision on the document, and what it
 * changes is everything a press touches.
 */
test.describe('a deck that moves by its links', () => {
  const setLinksOnly = async (page: Page) => {
    await page.locator('[data-deck-map]').click();
    await page.waitForTimeout(400);
    await page.locator('.sl-map').getByLabel('덱 이동 방식').selectOption('links');
    await page.waitForTimeout(500);
  };

  test('stops a press at the end of a page, and moves on a button', async ({ page }) => {
    await openDeck(page);
    await setLinksOnly(page);
    // Onto the card slide, which has the sample's buttons.
    const from = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      return ((root.content ?? []) as string[]).find(
        (sid: string) => store.getNode(sid)?.attributes?.id === 'cards'
      );
    });
    await page.locator(`[data-map-page="${from}"]`).click();
    await page.waitForTimeout(400);

    await page.locator('[data-present]').click();
    await page.waitForTimeout(600);

    // A press on empty slide: nothing moves. Landing on the next page by accident is the thing
    // this mode exists to make impossible.
    const showing = () => onScreen(page);
    const was = await showing();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    expect(await showing()).toBe(was);

    // A press on the button moves it, because that is the only thing that does.
    const box = (await page.locator('.sl-stage [data-go-to="title"]').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(600);
    expect(await showing()).not.toBe(was);

    await page.keyboard.press('Escape');
  });

  test('refuses the scroll show, visibly and with the reason', async ({ page }) => {
    await openDeck(page);
    await setLinksOnly(page);
    await page.locator('[data-map-close]').click();
    await page.waitForTimeout(300);

    // A scroll is a line, and a deck that is not one has nothing for it to run along. Greyed
    // rather than left to fail, which is the rule wherever the model has no answer.
    const scroll = page.locator('[data-scroll-present]');
    await expect(scroll).toBeDisabled();
    await expect(scroll).toHaveAttribute('title', /스크롤은 한 줄/);
  });

  test('draws no spine in the map, because there is none', async ({ page }) => {
    await openDeck(page);
    await setLinksOnly(page);

    // The picture becomes the whole truth about where a reader can get to — which is the point of
    // drawing a map of such a deck at all.
    await expect(page.locator('[data-map-link="flow"]')).toHaveCount(0);
    expect(await page.locator('[data-map-link="jump"]').count()).toBe(2);
    // And the pages a button does not name are islands now: the larger question, asked by the
    // same function.
    expect(await page.locator('[data-map-unreachable="true"]').count()).toBeGreaterThan(0);
  });
});

/**
 * A button that opens **another deck** at a page.
 *
 * The link between the four decks a hundred-slide deck really is. What it can point at is a
 * *source this product can fetch* — there is no library of decks, so there is no id for "the
 * pricing deck" — and the honesty that comes with that: the deck's own check warns about such a
 * button (볼 것) instead of telling (고칠 것), because whether that page is there is not a question
 * this document can answer.
 */
test.describe('a button into another deck', () => {
  /** A second deck, served to the app the way any file would be. */
  const otherDeck = {
    // The format the reader's own 열기 button accepts, from `deck-file.ts`: a test that invented
    // its own would be testing a file this product would refuse.
    format: 'barocss-slides',
    version: 1,
    document: {
      stype: 'document',
      attributes: {},
      content: [
        {
          stype: 'surface',
          attributes: { kind: 'slide', id: 'cover', name: '가격표 표지' },
          content: [
            {
              stype: 'textFrame',
              attributes: { role: 'title', x: 1440, y: 3600, width: 16320, height: 2400 },
              content: [
                {
                  stype: 'paragraph',
                  attributes: {},
                  content: [{ stype: 'inline-text', text: '가격표' }]
                }
              ]
            }
          ]
        },
        {
          stype: 'surface',
          attributes: { kind: 'slide', id: 'plans', name: '요금제' },
          content: [
            {
              stype: 'textFrame',
              attributes: { role: 'title', x: 1440, y: 3600, width: 16320, height: 2400 },
              content: [
                {
                  stype: 'paragraph',
                  attributes: {},
                  content: [{ stype: 'inline-text', text: '요금제' }]
                }
              ]
            }
          ]
        }
      ]
    }
  };

  test('is written from the panel, and the check warns rather than telling', async ({ page }) => {
    await openDeck(page);

    // A shape of the reader's own, made a button into another deck.
    const made = await page.evaluate(async () => {
      const editor = (window as any).editor;
      await editor.executeCommand('insertRectangle', {});
      return editor.selection?.nodeIds?.[0];
    });
    await page.waitForTimeout(400);

    await page.locator('.sl-properties').getByLabel('누르면 이동').selectOption('deck');
    await page.waitForTimeout(300);
    const source = page.locator('.sl-properties').getByLabel('다른 덱 주소');
    await source.fill('/other-deck.slides.json');
    await source.press('Enter');
    await page.waitForTimeout(500);
    const which = page.locator('.sl-properties').getByLabel('다른 덱의 장');
    await which.fill('plans');
    await which.press('Enter');
    await page.waitForTimeout(500);

    const written = await page.evaluate(
      (sid) => (window as any).editor.dataStore.getNode(sid)?.attributes,
      made
    );
    expect(written.goToDeck).toBe('/other-deck.slides.json');
    expect(written.goTo).toBe('plans');

    // 볼 것: whether that page is there is not a question this document can answer, and a reader
    // who deleted the button on a 고칠 것 would have lost a working link.
    await page.locator('[data-audit]').first().click();
    await page.waitForTimeout(500);
    const row = page.locator('.sl-audit-list li[data-audit="away"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('볼 것');
  });

  test('opens that deck at that page when it is pressed in the show', async ({ page }) => {
    // Served from the app's own origin: the reader's press is a fetch, and a test can answer it.
    await page.route('**/other-deck.slides.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(otherDeck) })
    );

    await openDeck(page);
    const made = await page.evaluate(async () => {
      const editor = (window as any).editor;
      await editor.executeCommand('insertRectangle', {});
      const sid = editor.selection?.nodeIds?.[0];
      await editor.executeCommand('setBoxJump', {
        nodeIds: [sid],
        deck: '/other-deck.slides.json',
        to: 'plans'
      });
      return sid;
    });
    await page.waitForTimeout(500);

    await page.locator('[data-present]').click();
    await page.waitForTimeout(600);

    const box = (await page.locator(`.sl-stage [data-bc-sid="${made}"]`).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1200);

    const now = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const pages = ((root.content ?? []) as string[])
        .map((sid: string) => store.getNode(sid))
        .filter((one: any) => one?.stype === 'surface')
        .map((one: any) => one.attributes?.id);
      const shown = [...document.querySelectorAll<HTMLElement>('.sl-stage .sl-slide')].find(
        (one) => getComputedStyle(one).display !== 'none'
      );
      const sid = shown?.getAttribute('data-bc-sid');
      return { pages, at: sid ? store.getNode(sid)?.attributes?.id : null };
    });

    // The other deck is open, and the reader is on the page the button named — by that page's
    // durable id, resolved after the load because until then it does not exist in this session.
    expect(now.pages).toEqual(['cover', 'plans']);
    expect(now.at).toBe('plans');

    await page.keyboard.press('Escape');
  });

  test('says so, rather than silently doing nothing, when the deck cannot be opened', async ({
    page
  }) => {
    await page.route('**/missing-deck.slides.json', (route) => route.fulfill({ status: 404, body: '' }));

    await openDeck(page);
    const made = await page.evaluate(async () => {
      const editor = (window as any).editor;
      await editor.executeCommand('insertRectangle', {});
      const sid = editor.selection?.nodeIds?.[0];
      await editor.executeCommand('setBoxJump', {
        nodeIds: [sid],
        deck: '/missing-deck.slides.json'
      });
      return sid;
    });
    await page.waitForTimeout(500);

    await page.locator('[data-present]').click();
    await page.waitForTimeout(600);
    const box = (await page.locator(`.sl-stage [data-bc-sid="${made}"]`).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1000);

    // A button that silently does nothing in front of a room is the fault this feature's own
    // check exists to prevent, so the failure is said where the reader is looking.
    await expect(page.locator('[data-jump-away]')).toHaveCount(1);
    await page.keyboard.press('Escape');
  });
});
