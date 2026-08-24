import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck } from './helpers';

/**
 * The reader's own decks, **by name**.
 *
 * Two features asked for the same thing and neither could have it: a button into another deck could
 * only point at a source the product can fetch (canvas-model §11h), and a shared component library
 * needs definitions that live in another document (§10). Both need *"the decks I have"* to be
 * something this product can say.
 *
 * Kept in IndexedDB, and the choice was measured rather than assumed: the sample deck is 42KB of
 * JSON and the starter 8KB, both pictureless — one photograph is a base64 megabyte, and
 * `localStorage` has five in total and fails by throwing in the middle of a save. A store whose
 * predictable failure is "the reader loses the deck they were saving" is not one to build on.
 *
 * Playwright gives each test its own browser context, so each of these starts with an empty
 * library — which is also the honest thing to test: the first row a reader ever makes.
 */
const openLibrary = async (page: Page) => {
  await page.locator('[data-deck-library]').click();
  await expect(page.locator('[data-library-keep]')).toBeVisible();
};

test.describe('a library of decks', () => {
  test('starts empty, and says what a name is for', async ({ page }) => {
    await openDeck(page);
    await openLibrary(page);

    await expect(page.locator('[data-library-row]')).toHaveCount(0);
    // A list that is empty has to say what putting something in it would buy.
    await expect(page.locator('.ou-dialog, [role="dialog"]')).toContainText('누르면');
  });

  test('keeps the deck under a name taken from what it is called', async ({ page }) => {
    await openDeck(page);
    await openLibrary(page);
    await page.locator('[data-library-keep]').click();
    await page.waitForTimeout(600);

    // The sample deck's opening words are "One engine, two products".
    const row = page.locator('[data-library-row="one-engine-two-products"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('6장');

    /*
     * And saving again keeps the name rather than minting a second: saving 가격표 twice is saving
     * *that* deck, and a second name would leave every button pointing at the old copy — which is
     * the one thing a durable reference must not do.
     */
    await page.locator('[data-library-keep]').click();
    await page.waitForTimeout(600);
    await expect(page.locator('[data-library-row]')).toHaveCount(1);
    await expect(page.locator('[data-library-keep]')).toContainText('one-engine-two-products');
  });

  test('opens a deck from the library, and takes it out again', async ({ page }) => {
    await openDeck(page);
    await openLibrary(page);
    await page.locator('[data-library-keep]').click();
    await page.waitForTimeout(600);

    // Change the deck on screen, so opening the row is visibly a different document.
    await page.locator('[data-library-close]').click();
    await page.waitForTimeout(300);

    await page.evaluate(async () => {
      const editor = (window as any).editor;
      await editor.executeCommand('insertSlide', {});
    });
    await page.waitForTimeout(500);
    const grew = await page.locator('.sl-filmstrip button[data-slide]').count();
    expect(grew).toBe(7);

    // Opening the row puts the six-page deck back. It asks first, because a new document takes the
    // history with it — the same confirmation 열기 asks, and only when there is work to lose.
    page.once('dialog', (dialog) => void dialog.accept());
    await openLibrary(page);
    await page.locator('[data-library-open="one-engine-two-products"]').click();
    await page.waitForTimeout(900);
    await expect(page.locator('.sl-filmstrip button[data-slide]')).toHaveCount(6);

    // And out again.
    page.once('dialog', (dialog) => void dialog.accept());
    await openLibrary(page);
    await page.locator('[data-library-drop="one-engine-two-products"]').click();
    await page.waitForTimeout(600);
    await expect(page.locator('[data-library-row]')).toHaveCount(0);
  });

  test('is what a button into another deck can point at, by name', async ({ page }) => {
    await openDeck(page);

    // Keep this deck, then make a button that points at it *by its library name*.
    await openLibrary(page);
    await page.locator('[data-library-keep]').click();
    await page.waitForTimeout(700);
    await page.locator('[data-library-close]').click();
    await page.waitForTimeout(300);

    const made = await page.evaluate(async () => {
      const editor = (window as any).editor;
      await editor.executeCommand('insertRectangle', {});
      const sid = editor.selection?.nodeIds?.[0];
      await editor.executeCommand('setBoxJump', {
        nodeIds: [sid],
        deck: 'one-engine-two-products',
        to: 'cards'
      });
      return sid;
    });
    await page.waitForTimeout(500);

    /*
     * The name is resolved by the **host**, not by the document: `isLibraryName` says this is a
     * name rather than an address, so the library answers and nothing is fetched. Which is the
     * whole point of the library — a reference that survives the deck being moved.
     */
    await page.locator('[data-present]').click();
    await page.waitForTimeout(600);
    const box = (await page.locator(`.sl-stage [data-bc-sid="${made}"]`).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1200);

    const now = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const shown = [...document.querySelectorAll<HTMLElement>('.sl-stage .sl-slide')].find(
        (one) => getComputedStyle(one).display !== 'none'
      );
      const sid = shown?.getAttribute('data-bc-sid');
      return {
        at: sid ? store.getNode(sid)?.attributes?.id : null,
        away: !!document.querySelector('[data-jump-away]')
      };
    });
    // The kept deck is open at the page the button named, and nothing went wrong on the way.
    expect(now.away).toBe(false);
    expect(now.at).toBe('cards');

    await page.keyboard.press('Escape');
  });
});

/**
 * A **brand kit**: a definition brought in from another deck.
 *
 * The other half of what the library was for. A reference was never available — a template cannot
 * draw a foreign node (canvas-model §10b-2) — so the definition is copied and remembers where it
 * came from, and *that* is what makes it a library rather than a paste: bringing it in again
 * replaces the copy, and the deck it came from can be asked whether it has moved on.
 *
 * Which is the relationship Figma has across files, and for the same reason: it cannot be live
 * there either.
 */
test.describe('a component from another deck', () => {
  /** Keep the sample deck (which defines a card) and start a deck of the reader's own. */
  const withKit = async (page: Page) => {
    await openDeck(page);
    await page.locator('[data-deck-library]').click();
    await page.locator('[data-library-keep]').click();
    await page.waitForTimeout(700);
    await page.locator('[data-library-close]').click();
    await page.waitForTimeout(300);

    // A new deck: the library keeps the old one, which is the point.
    page.once('dialog', (dialog) => void dialog.accept());
    await page.locator('[data-deck-new]').click();
    await page.waitForTimeout(700);
  };

  test('brings a value in from the same deck, and remembers whose it is', async ({ page }) => {
    await withKit(page);

    await page.locator('[data-deck-library]').click();
    await page.locator('[data-library-look="one-engine-two-products"]').click();
    await page.waitForTimeout(600);

    /*
     * A brand kit is a card **and** a colour, so the values are listed beside the definitions — one
     * read of one file, three states each. The sample deck declares 주의, which is what this brings in.
     */
    const value = page.locator('[data-library-value="주의"]');
    await expect(value).toHaveCount(1);
    await expect(value).toContainText('가져오기');

    await page.locator('[data-library-bring-value="주의"]').click();
    await page.waitForTimeout(800);
    await expect(page.locator('[data-library-value-have="주의"]')).toHaveCount(1);

    // This deck has it now, with where it came from — which is what makes it a library rather than a
    // paste: a copy that remembers.
    const held = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const container = ((root.content ?? []) as string[])
        .map((sid: string) => store.getNode(sid))
        .find((one: any) => one?.stype === 'variables');
      const one = store.getNode(((container?.content ?? []) as string[])[0]);
      return {
        name: one?.attributes?.name,
        value: one?.attributes?.value,
        fromDeck: one?.attributes?.fromDeck,
        fromValue: one?.attributes?.fromValue
      };
    });
    expect(held.name).toBe('주의');
    expect(held.fromDeck).toBe('one-engine-two-products');
    expect(held.fromValue).toBe(held.value);

    /*
     * "Behind" is deliberately about the **source**, not about this deck: editing the value here is a
     * reader deciding something for this deck, and a badge calling that stale would be the library
     * telling them off for it. The comparison both ways is tested in milliseconds
     * (`canvas-variable.test.ts`), where a brand can be made to change its mind without saving a
     * file.
     */
    await page.evaluate(async () => {
      const editor = (window as any).editor;
      await editor.executeCommand('setDocumentVar', { name: '주의', value: '#15803d' });
    });
    await page.locator('[data-library-look="one-engine-two-products"]').click();
    await page.locator('[data-library-look="one-engine-two-products"]').click();
    await page.waitForTimeout(700);
    await expect(page.locator('[data-library-value-behind="주의"]')).toHaveCount(0);
    // Still marked as brought in, which is the fact that matters on the row.
    await expect(page.locator('[data-library-value-have="주의"]')).toHaveCount(1);
  });

  test('lists what another deck defines, and brings one in', async ({ page }) => {
    await withKit(page);

    await page.locator('[data-deck-library]').click();
    await page.locator('[data-library-look="one-engine-two-products"]').click();
    await page.waitForTimeout(600);

    // What that deck defines — read without loading it, so the deck on screen stays put.
    const part = page.locator('[data-library-part="metric-card"]');
    await expect(part).toHaveCount(1);
    await expect(part).toContainText('가져오기');

    await page.locator('[data-library-bring="metric-card"]').click();
    await page.waitForTimeout(800);
    // And now this deck has it: same definition, and it knows whose it is.
    await expect(page.locator('[data-library-have="metric-card"]')).toHaveCount(1);

    const here = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const library = ((root.content ?? []) as string[])
        .map((sid: string) => store.getNode(sid))
        .find((one: any) => one?.stype === 'components');
      const card = store.getNode(((library?.content ?? []) as string[])[0]);
      return {
        id: card?.attributes?.id,
        fromDeck: card?.attributes?.fromDeck,
        fromId: card?.attributes?.fromId,
        recorded: typeof card?.attributes?.fromSignature === 'string',
        parts: ((card?.content ?? []) as string[]).length
      };
    });
    expect(here).toMatchObject({
      id: 'metric-card',
      fromDeck: 'one-engine-two-products',
      fromId: 'metric-card',
      recorded: true
    });
    /*
     * Everything the definition is came with it: four variables, four bindings and five parts. The
     * bindings are the card's own declarations now (canvas-model §10g-2) — which is why this number
     * grew by four the day a variable stopped being limited to three things.
     */
    expect(here.parts).toBe(13);
  });

  test('says when the deck it came from has moved on, and brings the newer copy', async ({
    page
  }) => {
    await withKit(page);

    await page.locator('[data-deck-library]').click();
    await page.locator('[data-library-look="one-engine-two-products"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-library-bring="metric-card"]').click();
    await page.waitForTimeout(800);
    await expect(page.locator('[data-library-behind]')).toHaveCount(0);
    await page.locator('[data-library-close]').click();
    await page.waitForTimeout(300);

    /*
     * The brand kit changes — as it would if a reader opened it, edited the card and kept it again.
     * Written straight into the library here, because what is under test is the *offer*, not the
     * round trip through the editor.
     */
    await page.evaluate(async () => {
      const request = indexedDB.open('barocss-slides', 1);
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const read = db.transaction('decks', 'readonly').objectStore('decks').get('one-engine-two-products');
      const kept: any = await new Promise((resolve) => {
        read.onsuccess = () => resolve(read.result);
      });
      const file = JSON.parse(kept.text);
      const library = file.document.content.find((one: any) => one.stype === 'components');
      // The card's back, a different colour there now.
      /*
       * Found by what it *is* rather than by where it sits: the card's declarations grew when the
       * bindings became the definition's own, and an index into its children is a test that quietly
       * edits the wrong node the day that changes.
       */
      const back = library.content[0].content.find(
        (one: any) => one.stype === 'rectangle' && one.attributes?.partId === 'back'
      );
      back.attributes.fill = '#ff0000';
      kept.text = JSON.stringify(file);
      db.transaction('decks', 'readwrite').objectStore('decks').put(kept);
      await new Promise((resolve) => setTimeout(resolve, 200));
      db.close();
    });


    await page.locator('[data-deck-library]').click();
    await page.locator('[data-library-look="one-engine-two-products"]').click();
    await page.waitForTimeout(600);


    // Offered, not applied: a reader who refreshes a brand kit and finds forty slides rearranged
    // has lost forty slides.
    await expect(page.locator('[data-library-behind]')).toHaveCount(1);
    await expect(page.locator('[data-library-part="metric-card"]')).toContainText('다시 가져오기');

    await page.locator('[data-library-bring="metric-card"]').click();
    await page.waitForTimeout(800);
    await expect(page.locator('[data-library-behind]')).toHaveCount(0);

    // One definition, not two: every placement of it goes on pointing at the same one.
    const ids = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const library = ((root.content ?? []) as string[])
        .map((sid: string) => store.getNode(sid))
        .find((one: any) => one?.stype === 'components');
      return ((library?.content ?? []) as string[]).map(
        (sid: string) => store.getNode(sid)?.attributes?.id
      );
    });
    expect(ids).toEqual(['metric-card']);
  });
});

/**
 * The two places a library's name has to appear where a reader is already looking.
 *
 * Both are the same shape of fault: the answer existed and was one dialog away. A definition that
 * is behind its brand kit said so only in the library dialog, and a button pointing at another deck
 * asked a reader to type a name they had no way to see.
 */
test.describe('a library where the reader is looking', () => {
  test('says in the components panel that a definition’s deck has moved on', async ({ page }) => {
    await openDeck(page);
    // Keep this deck as a brand kit, then start a deck of the reader's own and import the card.
    await page.locator('[data-deck-library]').click();
    await page.locator('[data-library-keep]').click();
    await page.waitForTimeout(700);
    await page.locator('[data-library-close]').click();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.locator('[data-deck-new]').click();
    await page.waitForTimeout(700);

    await page.locator('[data-deck-library]').click();
    await page.locator('[data-library-look="one-engine-two-products"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-library-bring="metric-card"]').click();
    await page.waitForTimeout(700);
    await page.locator('[data-library-close]').click();
    await page.waitForTimeout(300);

    // The panel says whose it is — a badge only on the ones that came from somewhere.
    await page.locator('.sl-components-closed').click();
    await page.waitForTimeout(600);
    await expect(page.locator('[data-component-from="one-engine-two-products"]')).toHaveCount(1);
    await expect(page.locator('[data-component-outdated]')).toHaveCount(0);

    // The brand kit changes under it, as it would if a reader edited and kept it again.
    await page.evaluate(async () => {
      const request = indexedDB.open('barocss-slides', 1);
      const db: IDBDatabase = await new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result);
      });
      const read = db
        .transaction('decks', 'readonly')
        .objectStore('decks')
        .get('one-engine-two-products');
      const kept: any = await new Promise((resolve) => {
        read.onsuccess = () => resolve(read.result);
      });
      const file = JSON.parse(kept.text);
      const library = file.document.content.find((one: any) => one.stype === 'components');
      /*
       * Found by what it *is* rather than by where it sits: the card's declarations grew when the
       * bindings became the definition's own, and an index into its children is a test that quietly
       * edits the wrong node the day that changes.
       */
      const back = library.content[0].content.find(
        (one: any) => one.stype === 'rectangle' && one.attributes?.partId === 'back'
      );
      back.attributes.fill = '#00aa00';
      kept.text = JSON.stringify(file);
      db.transaction('decks', 'readwrite').objectStore('decks').put(kept);
      await new Promise((resolve) => setTimeout(resolve, 200));
      db.close();
    });

    /*
     * Closed and opened again, because that is when the reading happens: a keystroke is not a
     * reason to open three files, and a brand kit does not change while somebody is typing here.
     */
    await page.locator('.sl-components [aria-label="컴포넌트 닫기"]').click();
    await page.waitForTimeout(300);
    await page.locator('.sl-components-closed').click();
    await page.waitForTimeout(900);
    await expect(page.locator('[data-component-outdated="metric-card"]')).toHaveCount(1);
  });

  test('offers the library’s names to a button that points at another deck', async ({ page }) => {
    await openDeck(page);
    await page.locator('[data-deck-library]').click();
    await page.locator('[data-library-keep]').click();
    await page.waitForTimeout(700);
    await page.locator('[data-library-close]').click();
    await page.waitForTimeout(300);

    const made = await page.evaluate(async () => {
      const editor = (window as any).editor;
      await editor.executeCommand('insertRectangle', {});
      return editor.selection?.nodeIds?.[0];
    });
    await page.waitForTimeout(400);

    await page.locator('.sl-properties').getByLabel('누르면 이동').selectOption('deck');
    await page.waitForTimeout(400);

    // The reader's own decks, by name — and 직접 입력 for an address, because `goToDeck` is both.
    const decks = page.locator('.sl-properties').getByLabel('라이브러리 덱');
    await expect(decks).toHaveCount(1);
    await decks.selectOption('one-engine-two-products');
    await page.waitForTimeout(600);

    expect(
      await page.evaluate(
        (sid) => (window as any).editor.dataStore.getNode(sid)?.attributes?.goToDeck,
        made
      )
    ).toBe('one-engine-two-products');
  });
});
