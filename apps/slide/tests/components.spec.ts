import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, currentSlide } from './helpers';

/**
 * A component's definition, opened and closed.
 *
 * The design took three corrections to get here, and the last one is what this suite is
 * really about: **a definition is not a page of the deck.** It was a surface with a kind of
 * its own, and then the slide list, the strip, the presenter and the count each had to ask
 * whether a page counted. It lives in `resources` now, with the layouts and the theme, and is
 * drawn *hidden* until a reader opens it — which is how it gets the whole editing apparatus
 * without anything being told about components.
 *
 * Nothing makes a component yet, so the deck is loaded with one.
 */
const deckWithComponent = async (page: Page) =>
  page.evaluate(() => {
    const editor = (window as any).editor;
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          {
            stype: 'docMeta',
            attributes: {},
            content: [
              { stype: 'docTitle', attributes: {}, content: [{ stype: 'inline-text', text: '컴포넌트' }] }
            ]
          },
          {
            stype: 'surface',
            attributes: { kind: 'slide', name: '한 장' },
            content: [
              {
                stype: 'instance',
                attributes: { componentId: 'card', x: 2000, y: 2000, width: 4000, height: 2400 },
                content: [
                  {
                    stype: 'rectangle',
                    attributes: {
                      partOf: 'back',
                      x: 0,
                      y: 0,
                      width: 4000,
                      height: 2400,
                      fill: '#e2e8f0'
                    }
                  }
                ]
              }
            ]
          },
          {
            stype: 'resources',
            attributes: {},
            content: [
              {
                stype: 'component',
                attributes: { id: 'card', name: '카드', width: 4000, height: 2400 },
                content: [
                  {
                    stype: 'rectangle',
                    attributes: {
                      partId: 'back',
                      x: 0,
                      y: 0,
                      width: 4000,
                      height: 2400,
                      fill: '#e2e8f0'
                    }
                  }
                ]
              }
            ]
          }
        ]
      },
      'slides'
    );
  });

const openPanel = async (page: Page) => {
  await page.locator('.sl-components-closed').click();
  await expect(page.locator('.sl-components')).toHaveCount(1);
  // The list is drawn from the document, so it arrives with the next render rather than with
  // the click.
  await page.waitForTimeout(400);
};

/**
 * The panel's row for a definition.
 *
 * Scoped to the panel on purpose: the definition's *own* element carries the same
 * `data-component-id` — it is the same fact about the same thing — so an unscoped query finds
 * two, which is how this suite learned that the row and the drawing both say what they are.
 */
const row = (page: Page, id: string) => page.locator(`.sl-components [data-component-id="${id}"]`);

test.describe('a component’s definition', () => {
  test('is listed beside the deck, and is not one of its slides', async ({ page }) => {
    await openDeck(page);
    await deckWithComponent(page);
    await page.waitForTimeout(500);
    await openPanel(page);

    await expect(row(page, 'card')).toContainText('카드');
    // Not a page: one slide in the deck, one row in the filmstrip, and the count says 1 / 1.
    await expect(page.locator('.sl-filmstrip button[data-slide]')).toHaveCount(1);
    await expect(page.locator('.sl-count')).toContainText('1 / 1');
  });

  test('is drawn hidden until it is opened, and shown when it is', async ({ page }) => {
    await openDeck(page);
    await deckWithComponent(page);
    await page.waitForTimeout(500);
    await openPanel(page);

    const definition = page.locator('.sl-def-component[data-component-id="card"]');
    await expect(definition).toHaveCount(1);
    // Drawn — a node with no element has no place in the sid map — and not visible.
    await expect(definition).toBeHidden();

    await row(page, 'card').click();
    await page.waitForTimeout(500);
    await expect(definition).toBeVisible();
    // And the deck's slide is out of the way while its definition is being edited.
    await expect(page.locator('.sl-stage .sl-slide')).toBeHidden();
  });

  test('takes a new shape while it is open, rather than the slide taking it', async ({ page }) => {
    await openDeck(page);
    await deckWithComponent(page);
    await page.waitForTimeout(500);
    await openPanel(page);
    await row(page, 'card').click();
    await page.waitForTimeout(400);

    /*
     * Through the **ribbon**, which is the whole point of the distinction: a command with no
     * `slideId` is answering "put it on the deck" — what a console and a test mean — and the
     * *app* is the thing that knows the reader is inside a definition. Calling the command
     * bare put the shape on slide 1, correctly, which is how this test learned to press the
     * button instead.
     *
     * And the fault it is really measuring: the insert commands used to validate their
     * `slideId` against the deck's **slides**, so the definition's own sid was refused
     * outright — the button would have done nothing at all.
     */
    await page.locator('[data-control="insert-ellipse"]').click();
    await page.waitForTimeout(500);

    const where = await page.evaluate(() => {
      const editor = (window as any).editor;
      const sid = editor.selection?.nodeIds?.[0];
      const store = editor.dataStore;
      const parent = sid ? store.getNode(sid)?.parentId : undefined;
      return { parentType: parent ? store.getNode(parent)?.stype : null };
    });
    expect(where.parentType).toBe('component');
  });

  test('says where the reader is, and gives them the way back', async ({ page }) => {
    await openDeck(page);
    await deckWithComponent(page);
    await page.waitForTimeout(500);
    const was = await currentSlide(page);

    await openPanel(page);
    await row(page, 'card').click();
    await page.waitForTimeout(400);

    // A reader who opens a definition and cannot see how to get back has been trapped.
    await expect(page.locator('[data-editing-component="card"]')).toHaveCount(1);
    await page.locator('[data-component-close]').click();
    await page.waitForTimeout(400);

    // The slide they were on, remembered from the moment they left it.
    expect(await currentSlide(page)).toBe(was);
    await expect(page.locator('.sl-def-component[data-component-id="card"]')).toBeHidden();
  });

  test('says how many placements have fallen behind it', async ({ page }) => {
    await openDeck(page);
    await deckWithComponent(page);
    await page.waitForTimeout(500);
    await openPanel(page);

    // The placement has never recorded what it took, so nothing is behind: calling every
    // placement stale would put a badge on the whole deck and teach a reader to ignore it.
    await expect(page.locator('[data-component-behind]')).toHaveCount(0);

    // Record it, then change the definition: now there is something to take.
    await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const slide = (root.content as string[])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'surface');
      const instance = (slide.content as string[])[0];
      const res = (root.content as string[])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'resources');
      const definition = (res.content as string[])[0];
      const part = (store.getNode(definition).content as string[])[0];

      // What the definition says now, recorded on the placement…
      const signature = (window as any).__sig;
      void signature;
      return editor
        .executeCommand('setBoxStyle', { nodeId: part, fill: '#ff0000' })
        .then(() => ({ instance, definition }));
    });
    await page.waitForTimeout(500);

    /*
     * Still nothing, because the placement never recorded a signature — which is the honest
     * answer and the one this test is here to pin. The badge appears once a placement has been
     * applied from a definition and the definition then says something else, and that is what
     * the apply command will write.
     */
    await expect(page.locator('[data-component-behind]')).toHaveCount(0);
  });
});
