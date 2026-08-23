import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck } from './helpers';

/**
 * A deck leaving the app and coming back.
 *
 * The last thing Deck 4 was missing: everything the timeline can now express —
 * the order, the presses, a film in the sequence, a title that arrives a letter
 * at a time — lasted until the page was reloaded.
 *
 * The arithmetic is in `office-slides/test/deck-file.test.ts`, including the round
 * trip through two editors with no sid in common. What only a browser shows is
 * the two gestures: a file the browser downloads, and a file the reader picks.
 */
const slideCount = (page: Page) =>
  page.evaluate(() => document.querySelectorAll('.sl-filmstrip button[data-slide]').length);

test.describe('saving a deck', () => {
  test('downloads a file named after the deck, with no session ids in it', async ({ page }) => {
    await openDeck(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-deck-save]').click()
    ]);

    // Named after what the deck is about, which is what a reader would have typed.
    expect(download.suggestedFilename()).toBe('One engine, two products.slides.json');

    const stream = await download.createReadStream();
    const text = await new Promise<string>((resolve, reject) => {
      let out = '';
      stream!.on('data', (chunk) => (out += chunk));
      stream!.on('end', () => resolve(out));
      stream!.on('error', reject);
    });

    const file = JSON.parse(text);
    expect(file.format).toBe('barocss-slides');
    expect(file.version).toBe(1);
    expect(file.savedAt).toBeTruthy();
    // A sid is `session:counter` and means nothing in another session; a file
    // that kept them would be unloadable in the one that wrote it.
    expect(text).not.toContain('slides:');
    // And it is a file a person can read: indented, one thing per line.
    expect(text.split('\n').length).toBeGreaterThan(50);
  });
});

test.describe('opening a deck', () => {
  /**
   * The round trip a reader actually makes: save, break something, open the file
   * again, and find the deck as it was.
   */
  test('brings back the deck that was saved', async ({ page }) => {
    await openDeck(page);
    const before = await slideCount(page);
    expect(before).toBeGreaterThan(1);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-deck-save]').click()
    ]);
    const saved = await download.path();

    // Break it: one slide fewer than the file has.
    await page.evaluate(() => {
      const first = document
        .querySelector('.sl-filmstrip button[data-slide]')!
        .getAttribute('data-slide');
      (window as any).editor.executeCommand('deleteSlide', { slideId: first });
    });
    await expect.poll(() => slideCount(page)).toBe(before - 1);

    // Opening replaces the document and takes the history with it, so it asks —
    // and only because there is now work to lose.
    page.on('dialog', (dialog) => void dialog.accept());
    await page.locator('[data-deck-file]').setInputFiles(saved!);

    await expect.poll(() => slideCount(page)).toBe(before);
    // And the reader is looking at a slide of the deck they just opened.
    await expect(page.locator('.sl-filmstrip button[data-current="true"]')).toHaveCount(1);
  });

  test('says what is wrong with a file it cannot read', async ({ page }) => {
    await openDeck(page);

    await page.locator('[data-deck-file]').setInputFiles({
      name: 'notes.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"format":"some-other-tool","version":1}')
    });

    const problem = page.locator('[data-deck-file-problem]');
    await expect(problem).toContainText('Barocss 슬라이드 파일이 아닙니다');

    // It stays until the reader is done with it, where an alert would be gone
    // before it could be read twice.
    await problem.getByLabel('닫기').click();
    await expect(problem).toHaveCount(0);
  });

  /** A file that is not JSON at all is the other half of the same message. */
  test('says so when the file is not JSON', async ({ page }) => {
    await openDeck(page);
    await page.locator('[data-deck-file]').setInputFiles({
      name: 'deck.json',
      mimeType: 'application/json',
      buffer: Buffer.from('this is not json')
    });
    await expect(page.locator('[data-deck-file-problem]')).toContainText('JSON이 아닙니다');
  });
});

/**
 * A deck of the reader's own, which this app could not start.
 *
 * It could save one and open one, so the only way to begin was to delete somebody
 * else's slides out of the sample. What a new deck *is* — one title slide and the
 * theme, master and layouts under it — is `createStarterDeck`'s answer, and it is
 * unit-tested against the schema in `office-slides`.
 *
 * What only a browser shows is the part that was quietly broken in the **engine**:
 * `render()` preferred the last tree it drew, which is a proxy over the store and
 * therefore live for *that root* — so a document replaced under the view was never
 * drawn. Measured: the model held one slide and the DOM held the previous five.
 */
test.describe('starting a deck', () => {
  const drawnSlides = (page: Page) =>
    page.evaluate(
      () =>
        [...document.querySelectorAll('.sl-stage .sl-slide')].map((slide) =>
          slide.getAttribute('data-bc-sid')
        ).length
    );

  test('makes one title slide, and the stage draws it', async ({ page }) => {
    await openDeck(page);
    expect(await slideCount(page)).toBeGreaterThan(1);

    await page.locator('[data-deck-new]').click();
    await page.waitForTimeout(600);

    // One slide in the model, in the rail — and in the DOM, which is the half the
    // engine was getting wrong.
    expect(await slideCount(page)).toBe(1);
    expect(await drawnSlides(page)).toBe(1);

    const deck = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const kinds = (root.content ?? []).map((sid: string) => store.getNode(sid)?.stype);
      const resources = (root.content ?? [])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'resources');
      return {
        kinds,
        inside: (resources?.content ?? []).map((sid: string) => store.getNode(sid)?.stype)
      };
    });
    // The definitions a first edit needs: a theme to resolve `theme:accent1`, a
    // master to inherit from, and the layouts a new slide is made from.
    expect(deck.inside).toEqual(['theme', 'slideMaster', 'slideLayout', 'slideLayout']);
  });

  /**
   * An untouched placeholder says what it is for — and the prompt is not in the
   * document, which is what PowerPoint does too: it is drawn from the *filler* an
   * empty run renders, so it disappears the moment anything is typed.
   */
  test('shows a prompt in an empty placeholder, and drops it on the first keystroke', async ({
    page
  }) => {
    await openDeck(page);
    await page.locator('[data-deck-new]').click();
    await page.waitForTimeout(600);

    const hint = (role: string) =>
      page.evaluate((which) => {
        const frame = document.querySelector(
          `.sl-stage .sl-slide:not([style*="display: none"]) .sl-text-frame[data-role="${which}"]`
        );
        return frame ? getComputedStyle(frame, '::before').content : null;
      }, role);

    expect(await hint('title')).toContain('제목');
    expect(await hint('subtitle')).toContain('부제목');

    // Typed into, the way a reader starts: a double-click goes inside the box.
    const at = await page.evaluate(() => {
      const frame = document.querySelector(
        '.sl-stage .sl-slide:not([style*="display: none"]) .sl-text-frame[data-role="title"]'
      )!;
      const box = frame.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    await page.mouse.dblclick(at.x, at.y);
    await page.keyboard.type('첫 발표');
    await page.waitForTimeout(400);

    expect(await hint('title')).toBe('none');
    // …and the subtitle still asks, because nothing has been typed in it.
    expect(await hint('subtitle')).toContain('부제목');

    /**
     * And the words are set in the deck's own face, which is the other half of a
     * new deck having definitions at all: Georgia is the theme's `majorFont`,
     * reached through the master.
     *
     * This is a regression test for a *captured root*. The environment the
     * renderers resolve formatting against held the root id from the moment the
     * app mounted, so after a new document it looked for the theme under the old
     * one and found nothing — measured, the title drew in `system-ui`.
     */
    expect(
      await page.evaluate(() => {
        const span = document.querySelector(
          '.sl-stage .sl-slide:not([style*="display: none"]) .sl-text-frame[data-role="title"] span'
        )!;
        return getComputedStyle(span).fontFamily;
      })
    ).toContain('Georgia');
  });

  /** The same confirmation opening a file asks, and for the same reason. */
  test('asks before it throws away work that is not saved', async ({ page }) => {
    await openDeck(page);
    // Something to lose.
    await page.evaluate(() => {
      const first = document
        .querySelector('.sl-filmstrip button[data-slide]')!
        .getAttribute('data-slide');
      (window as any).editor.executeCommand('deleteSlide', { slideId: first });
    });
    await page.waitForTimeout(400);

    const asked: string[] = [];
    page.on('dialog', (dialog) => {
      asked.push(dialog.message());
      void dialog.dismiss();
    });
    await page.locator('[data-deck-new]').click();
    await page.waitForTimeout(400);

    expect(asked).toHaveLength(1);
    // Dismissed, so the deck is still the one that was being worked on.
    expect(await slideCount(page)).toBeGreaterThan(1);
  });
});
