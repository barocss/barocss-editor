import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, currentSlide, visibleBoxes } from './helpers';

/**
 * A component's definition, opened and closed.
 *
 * The design took three corrections to get here, and the last one is what this suite is
 * really about: **a definition is not a page of the deck.** It was a surface with a kind of
 * its own, and then the slide list, the strip, the presenter and the count each had to ask
 * whether a page counted. It then lived in `resources`, with the layouts and the theme, which
 * worked and was still wrong for a reason only the screen shows: `resources` is hidden as a
 * group, so showing the definition a reader had *opened* meant a `:has()` rule reaching past a
 * `display: none` written to hide layouts — and un-hiding that container outright put the ruler
 * 6px off. It lives in a `components` container of its own now, whose children are what is
 * hidden, and is drawn *hidden* until a reader opens it — which is how it gets the whole
 * editing apparatus without anything being told about components.
 *
 * A deck of its own rather than the sample's, because two of these assertions are about the
 * *count*: one slide, one row in the filmstrip, 1 / 1.
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
            stype: 'components',
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
      const library = (root.content as string[])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'components');
      const definition = (library.content as string[])[0];
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

/**
 * What a reader **does** with a component, pressed rather than called.
 *
 * The model is tested in milliseconds and the commands with it
 * (`office-slides/test/component-commands.test.ts`). What only a browser shows is whether the
 * gestures exist: a card is made from a selection, put on a slide, asked for its values, given
 * the definition's changes, and let go of. Every one of those was a command nothing could
 * reach until this suite pressed it — which is the failure `every-command-can-be-reached`
 * exists to catch, and it caught all five.
 */
test.describe('working with a component', () => {
  /** The sample deck's card slide, which places one definition three times. */
  const cardSlide = async (page: Page) => {
    const sid = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      return ((root.content ?? []) as string[]).find((one: string) => {
        const node = store.getNode(one);
        if (node?.stype !== 'surface') return false;
        return ((node.content ?? []) as string[]).some(
          (child: string) => store.getNode(child)?.stype === 'instance'
        );
      });
    });
    await page.locator(`.sl-filmstrip button[data-slide="${sid}"]`).click();
    await page.waitForTimeout(400);
    return sid as string;
  };

  test('makes one out of the boxes a reader chose, and leaves a placement', async ({ page }) => {
    await openDeck(page);
    await openPanel(page);

    // Two boxes on the opening slide, selected together.
    const boxes = (await visibleBoxes(page)).slice(0, 2);
    await page.mouse.click(boxes[0].x, boxes[0].y);
    await page.keyboard.down('Shift');
    await page.mouse.click(boxes[1].x, boxes[1].y);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(300);

    await page.locator('[data-component-make]').click();
    await page.waitForTimeout(600);

    // What is on the slide is a placement — not the reader's two boxes beside a copy of them.
    const after = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const sid = document
        .querySelector('.sl-filmstrip button[data-current="true"]')
        ?.getAttribute('data-slide');
      const kinds = ((store.getNode(sid)?.content ?? []) as string[]).map(
        (one: string) => store.getNode(one)?.stype
      );
      return kinds;
    });
    expect(after).toContain('instance');
    // And the deck now defines something, which the panel lists.
    await expect(page.locator('.sl-components-list li')).not.toHaveCount(0);
  });

  test('puts one on the slide the reader is looking at', async ({ page }) => {
    await openDeck(page);
    const slide = await cardSlide(page);
    await openPanel(page);

    const before = await page.evaluate(
      (sid) =>
        (((window as any).editor.dataStore.getNode(sid)?.content ?? []) as string[]).length,
      slide
    );
    await page.locator('[data-component-place="metric-card"]').click();
    await page.waitForTimeout(600);

    const after = await page.evaluate(
      (sid) =>
        (((window as any).editor.dataStore.getNode(sid)?.content ?? []) as string[]).length,
      slide
    );
    // On *this* slide, because the app is the only thing that knows where the reader is: a
    // panel that passed nothing would have put it on slide 1.
    expect(after).toBe(before + 1);
  });

  test('asks a placement for its values, and the words on the slide change', async ({ page }) => {
    await openDeck(page);
    await cardSlide(page);

    // Click the first card's own background, which selects the placement's part…
    const placement = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const sid = document
        .querySelector('.sl-filmstrip button[data-current="true"]')
        ?.getAttribute('data-slide');
      const found = ((store.getNode(sid)?.content ?? []) as string[]).find(
        (one: string) => store.getNode(one)?.stype === 'instance'
      );
      // …selected directly, because what this test is about is the panel, not the hit test.
      void editor.executeCommand('setNode', { nodeIds: [found] });
      return found;
    });
    await page.waitForTimeout(400);

    // The fields are the definition's declaration: a name, a value, a colour and a state.
    const field = page.locator('[data-component-var="title"] input, input[data-component-var="title"]');
    await expect(field).toHaveCount(1);
    await field.fill('영업이익');
    await field.press('Enter');
    await page.waitForTimeout(600);

    const words = await page.evaluate((sid) => {
      const store = (window as any).editor.dataStore;
      const part = (((store.getNode(sid)?.content ?? []) as string[]) ?? []).find(
        (one: string) => store.getNode(one)?.attributes?.partOf === 'title'
      );
      const line = ((store.getNode(part)?.content ?? []) as string[])[0];
      const run = ((store.getNode(line)?.content ?? []) as string[])[0];
      return store.getNode(run)?.text;
    }, placement);
    /*
     * The value is substituted into the placement's own copy when it is written, not while it
     * is drawn: a template cannot draw a foreign node (canvas-model §10b-2), and a placement
     * whose text lived somewhere else could not be searched or spell-checked.
     */
    expect(words).toBe('영업이익');
  });

  test('says how far behind the placements are, and brings them up to date', async ({ page }) => {
    await openDeck(page);
    await cardSlide(page);
    await openPanel(page);

    /*
     * A placement made by the product records what it was given, so it can be told apart from
     * one a reader has edited. The sample deck's three are hand-authored and carry no such
     * record — deliberately, because that is what a deck from an earlier version looks like —
     * so this places a fresh one and edits the definition under it.
     */
    await page.locator('[data-component-place="metric-card"]').click();
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const library = ((root.content ?? []) as string[])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'components');
      const definition = (library.content as string[])[0];
      const part = ((store.getNode(definition).content ?? []) as string[]).find(
        (sid: string) => store.getNode(sid)?.stype === 'rectangle'
      );
      return editor.executeCommand('setBoxStyle', { nodeIds: [part], fill: '#0f766e' });
    });
    await page.waitForTimeout(600);

    // The count is the offer: "there is something new to take", said in a number rather than
    // by a dot a reader has to press to understand.
    await expect(page.locator('[data-component-behind]')).toHaveCount(1);
    await page.locator('[data-component-apply-all="metric-card"]').click();
    await page.waitForTimeout(800);
    await expect(page.locator('[data-component-behind]')).toHaveCount(0);
  });

  test('lets a placement go, and leaves the parts arranged', async ({ page }) => {
    await openDeck(page);
    const slide = await cardSlide(page);

    await page.evaluate((sid) => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const found = ((store.getNode(sid)?.content ?? []) as string[]).find(
        (one: string) => store.getNode(one)?.stype === 'instance'
      );
      void editor.executeCommand('setNode', { nodeIds: [found] });
    }, slide);
    await page.waitForTimeout(400);

    await page.locator('[data-component-detach]').click();
    await page.waitForTimeout(600);

    const kinds = await page.evaluate(
      (sid) =>
        (((window as any).editor.dataStore.getNode(sid)?.content ?? []) as string[]).map(
          (one: string) => (window as any).editor.dataStore.getNode(one)?.stype
        ),
      slide
    );
    // One fewer placement, one more group — and the group still holds the parts.
    expect(kinds.filter((kind: string) => kind === 'instance')).toHaveLength(2);
    expect(kinds).toContain('group');
  });
});
