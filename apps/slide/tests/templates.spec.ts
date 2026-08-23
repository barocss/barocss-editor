import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck } from './helpers';

/**
 * The decks a reader can start from.
 *
 * 새로 만들기 makes the least a deck can be, which is the right answer for a default and the
 * wrong answer for the question a reader has: *what am I making?* A talk has a contents slide
 * and section dividers; a report puts its summary first. Those are five slides in an order
 * nobody types from memory.
 *
 * A template **is a document**, so the model tests are the ones a fixture needs — the schema
 * accepts it, the definitions are in it, the bodies hold no invented prose. What a browser
 * shows is that the tiles draw the *shape* of each deck, and that picking one starts it.
 */
const slidesOf = (page: Page) =>
  page.evaluate(() => {
    const editor = (window as any).editor;
    const store = editor.dataStore;
    const root = store.getNode(editor.getRootId());
    return (root.content as string[])
      .map((sid) => store.getNode(sid))
      .filter((node: any) => node?.stype === 'surface')
      .map((node: any) => node.attributes?.name ?? '');
  });

const openGallery = async (page: Page) => {
  await page.locator('[data-deck-template]').click();
  await expect(page.locator('[data-template-start]')).toHaveCount(1);
};

test.describe('starting from a template', () => {
  test('draws each deck’s shape, from the deck itself', async ({ page }) => {
    await openDeck(page);
    await openGallery(page);

    const tiles = page.locator('[data-template]');
    expect(await tiles.count()).toBeGreaterThan(1);

    /*
     * Not a screenshot — a file that goes stale the day the theme changes — and not a
     * hidden editor per tile. The boxes are drawn from `templateSketch`, so a tile with a
     * title slide has a title box in it and the count says how many slides there are.
     */
    const talk = page.locator('[data-template="talk"]');
    await expect(talk.locator('.sl-template-slide')).not.toHaveCount(0);
    await expect(talk.locator('[data-role="title"]').first()).toBeVisible();
    await expect(talk.locator('.sl-template-count')).toContainText('장');
  });

  test('starts the deck that was picked', async ({ page }) => {
    await openDeck(page);
    const before = await slidesOf(page);

    await openGallery(page);
    await page.locator('[data-template="report"]').click();
    await page.locator('[data-template-start]').click();
    await page.waitForTimeout(600);

    const after = await slidesOf(page);
    expect(after).not.toEqual(before);
    // The structure is the thing a reader chose: a report puts its summary first.
    expect(after[0]).toBe('제목');
    expect(after).toContain('요약');
    expect(after.length).toBeGreaterThan(3);
  });

  test('names the deck after the template, so the file is named too', async ({ page }) => {
    await openDeck(page);
    await openGallery(page);
    await page.locator('[data-template="pitch"]').click();
    await page.locator('[data-template-start]').click();
    await page.waitForTimeout(600);

    // `deckFileName` reads the title: a deck that saved itself as "제목 없는" when the reader
    // had picked 제안 would be telling the wrong truth.
    const title = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const meta = (root.content as string[])
        .map((sid) => store.getNode(sid))
        .find((node: any) => node?.stype === 'docMeta');
      const docTitle = ((meta?.content ?? []) as string[])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'docTitle');
      const text = ((docTitle?.content ?? []) as string[]).map((sid: string) =>
        store.getNode(sid)
      )[0];
      return text?.text ?? text?.attributes?.text ?? '';
    });
    expect(title).toBe('제안');
  });

  test('leaves the bodies empty, and only the headings written', async ({ page }) => {
    await openDeck(page);
    await openGallery(page);
    await page.locator('[data-template="talk"]').click();
    await page.locator('[data-template-start]').click();
    await page.waitForTimeout(600);

    /*
     * Structure, not somebody else's words. A template full of invented sentences reads as
     * another person's deck and has to be emptied before it can be used — and the starter
     * deck's own rule is that a new deck contains no words this product invented. A template
     * a reader asked for by name relaxes that as far as the headings, and no further.
     */
    const words = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const slide = (root.content as string[])
        .map((sid) => store.getNode(sid))
        .find((node: any) => node?.stype === 'surface' && node.attributes?.name === '내용');
      const said: { role: string; text: string }[] = [];
      const walk = (sid: string, role: string) => {
        const node = store.getNode(sid);
        if (!node) return;
        if (typeof node.text === 'string' && node.text.trim()) {
          said.push({ role, text: node.text.trim() });
        }
        for (const child of node.content ?? []) {
          if (typeof child === 'string') walk(child, node.attributes?.role ?? role);
        }
      };
      for (const box of slide.content as string[]) walk(box, '');
      return said;
    });
    expect(words.some((one) => one.role === 'body')).toBe(false);
    expect(words.some((one) => one.role === 'title')).toBe(true);
  });

  test('leaves 새로 만들기 alone, which is still the least a deck can be', async ({ page }) => {
    await openDeck(page);
    await page.locator('[data-deck-new]').click();
    await page.waitForTimeout(600);

    // One title slide: the default answer stays the default answer, and the gallery is the
    // other question rather than a replacement for this one.
    expect(await slidesOf(page)).toHaveLength(1);
  });
});
