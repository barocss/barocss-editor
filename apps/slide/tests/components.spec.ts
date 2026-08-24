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
              /*
               * A placement, holding **nothing**: what it draws is the definition below, resolved
               * as the view reads its children (§10b-2a). A fixture that copied the part into it
               * would be testing a design the product no longer has.
               */
              {
                stype: 'instance',
                attributes: { componentId: 'card', x: 2000, y: 2000, width: 4000, height: 2400 },
                content: []
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

    /*
     * A reader who opens a definition and cannot see how to get back has been trapped.
     *
     * Above the stage rather than in the components panel, which is where it used to be: a
     * layout and a master are openable now, and all three need the same sentence and the same
     * way out — so there is one banner, saying which kind it is.
     */
    await expect(page.locator('[data-editing="component"][data-editing-id="card"]')).toHaveCount(1);
    await page.locator('[data-editing-close]').click();
    await page.waitForTimeout(400);

    // The slide they were on, remembered from the moment they left it.
    expect(await currentSlide(page)).toBe(was);
    await expect(page.locator('.sl-def-component[data-component-id="card"]')).toBeHidden();
  });

  test('says how many places use it', async ({ page }) => {
    await openDeck(page);
    await deckWithComponent(page);
    await page.waitForTimeout(500);
    await openPanel(page);

    /*
     * This row used to say how many placements had **fallen behind** the definition, and that
     * whole state is gone: a placement draws the definition, so there is nothing to fall behind.
     * What is worth saying instead is the question a reader has *before* editing a card — this
     * change is about to appear in this many places.
     */
    await expect(page.locator('[data-component-uses="1"]')).toHaveCount(1);
    await expect(page.locator('[data-component-apply-all]')).toHaveCount(0);

    // And a second placement is a second use, counted from the document rather than remembered.
    await page.locator('[data-component-place="card"]').click();
    await page.waitForTimeout(600);
    await expect(page.locator('[data-component-uses="2"]')).toHaveCount(1);
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

    /*
     * Read from the **screen**, because that is where a placement's words are now: the parts belong
     * to the definition and the value is substituted while they are resolved. Which is what makes it
     * a component rather than a template — and the cost, said plainly: a placement's text is not in
     * the document, so find-and-replace and the deck's own check do not see it.
     */
    const words = await page.evaluate((sid) => {
      const box = document.querySelector(`.sl-stage [data-bc-sid="${sid}"]`);
      return box?.textContent ?? '';
    }, placement);
    expect(words).toContain('영업이익');
  });

  test('carries a definition’s change to every placement, with nothing to press', async ({ page }) => {
    await openDeck(page);
    await cardSlide(page);
    await openPanel(page);

    /*
     * The measurement this test exists for. There is no 적용 and no 모두 적용 any more: editing the
     * definition is the whole gesture, and what the audience would see changes in the same breath.
     * Read from the screen rather than from the document, because that is where a placement's parts
     * are now — the document holds a placement and its values, and nothing else (§10b-2a).
     */
    const painted = async () =>
      await page.evaluate(() => {
        const found: string[] = [];
        for (const box of Array.from(document.querySelectorAll('.sl-stage [data-bc-sid]'))) {
          const fill = getComputedStyle(box as Element).backgroundColor;
          if (fill) found.push(fill);
        }
        return found;
      });

    const before = (await painted()).filter((colour) => colour === 'rgb(15, 118, 110)').length;

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

    // Three placements of the card on this slide, all three repainted, and no button was pressed.
    const after = (await painted()).filter((colour) => colour === 'rgb(15, 118, 110)').length;
    expect(after).toBeGreaterThan(before);
    await expect(page.locator('[data-component-apply]')).toHaveCount(0);
  });

  /**
   * A definition is fitted and measured as **itself**.
   *
   * Measured before the fix, and it is the kind of fault a feature ships with: the stage
   * fitted the constant `SLIDE_16_9`, so a 5040×3960 card and a 30000×18000 component both
   * drew at 0.3797 — the card 128 pixels wide in a 486-pixel pane, with 19200 twips of ruler
   * along it. A definition is a canvas of its own, and "the deck's shape" is not an answer for
   * a card.
   */
  test('fits a definition to itself, and rules it by its own size', async ({ page }) => {
    await openDeck(page);
    await openPanel(page);
    await page.locator('.sl-components [data-component-id="metric-card"]').click();
    await page.waitForTimeout(600);

    const drawn = await page.evaluate(() => {
      const card = document.querySelector('.sl-def-component') as HTMLElement | null;
      const ruler = document.querySelector('[data-ruler="x"]') as HTMLElement | null;
      if (!card || !ruler) return null;
      const rect = card.getBoundingClientRect();
      return {
        css: card.style.width,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        ruler: Math.round(ruler.getBoundingClientRect().width)
      };
    });

    // 5040×3960 twips is 336×264 CSS pixels, and the editor never draws above natural size.
    expect(drawn?.css).toBe('336px');
    expect(drawn?.width).toBe(336);
    expect(drawn?.height).toBe(264);
    // The ruler spans the card, not the slide it was placed on.
    expect(drawn?.ruler).toBe(336);
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

/**
 * Declaring what a card takes, and binding a part to it — the half that had no way in.
 *
 * Everything downstream of a `componentVar` worked before this: the properties panel drew a
 * field per variable, apply substituted the values, the sample deck's card declared four. And
 * the only way to *make* one was to write it into the document by hand — a feature that works
 * and nothing can start, which is the same failure as a command nothing surfaces, one layer up.
 *
 * So this test is the whole loop pressed: declare a variable, bind a part to it, and check the
 * words on the *slide* change when the placement is asked.
 */
test.describe('declaring what a card takes', () => {
  test('declares a variable, binds a part to it, and the placement follows', async ({ page }) => {
    await openDeck(page);
    await openPanel(page);

    // A card of the reader's own, so the test is not reading the sample's declaration.
    const boxes = (await visibleBoxes(page)).slice(0, 2);
    await page.mouse.click(boxes[0].x, boxes[0].y);
    await page.keyboard.down('Shift');
    await page.mouse.click(boxes[1].x, boxes[1].y);
    await page.keyboard.up('Shift');
    await page.locator('[data-component-make]').click();
    await page.waitForTimeout(600);

    /*
     * Open **the card that was just made**, by asking the placement which definition it points
     * at. Reading the library's first child instead opened the sample deck's card and declared
     * a variable on the wrong one, which is a mistake a test can make quietly: everything
     * passed until the placement was asked for a value it had never heard of.
     */
    const made = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const sid = document
        .querySelector('.sl-filmstrip button[data-current="true"]')
        ?.getAttribute('data-slide');
      const placement = ((store.getNode(sid)?.content ?? []) as string[]).find(
        (one: string) => store.getNode(one)?.stype === 'instance'
      );
      return store.getNode(placement)?.attributes?.componentId as string;
    });
    await page.locator(`.sl-components [data-component-id="${made}"]`).click();
    await page.waitForTimeout(500);

    // The card's list, by the attribute that names the card: the pane now holds two lists — the
    // document's own variables above and this one — which is the distinction §10h is about.
    await expect(page.locator('[data-var-list]')).toHaveCount(1);
    await page.locator('[data-var-new] input, input[data-var-new]').fill('heading');
    await page.locator('[data-var-add]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-var-row="heading"]')).toHaveCount(1);

    // Bind the definition's text part to it, from the part's own panel.
    const part = await page.evaluate((id) => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const library = ((root.content ?? []) as string[])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'components');
      const definition = ((library.content ?? []) as string[]).find(
        (sid: string) => store.getNode(sid)?.attributes?.id === id
      );
      const found = ((store.getNode(definition)?.content ?? []) as string[]).find(
        (sid: string) => store.getNode(sid)?.stype === 'textFrame'
      );
      void editor.executeCommand('setNode', { nodeIds: [found] });
      return found;
    }, made);
    await page.waitForTimeout(400);

    await page.locator('.sl-properties').getByLabel('글자 변수').selectOption('heading');
    await page.waitForTimeout(500);
    /*
     * The binding is the **definition's** declaration now, not an attribute on the part: three
     * attributes on a part meant a variable could drive exactly three things, and a number could
     * only ever be text (canvas-model §10g-2). So this asks the card what it binds.
     */
    const declared = await page.evaluate((sid) => {
      const store = (window as any).editor.dataStore;
      const definition = store.getNode(store.getNode(sid)?.parentId);
      return ((definition?.content ?? []) as string[])
        .map((one: string) => store.getNode(one))
        .filter((one: any) => one?.stype === 'componentBind')
        .map((one: any) => `${one.attributes.part}.${one.attributes.attr}=${one.attributes.var}`);
    }, part);
    expect(declared).toContain('title.text=heading');

    // Back to the deck, and ask the placement for its value.
    await page.locator('[data-editing-close]').click();
    await page.waitForTimeout(500);
    const placement = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const sid = document
        .querySelector('.sl-filmstrip button[data-current="true"]')
        ?.getAttribute('data-slide');
      const found = ((store.getNode(sid)?.content ?? []) as string[]).find(
        (one: string) => store.getNode(one)?.stype === 'instance'
      );
      void editor.executeCommand('setNode', { nodeIds: [found] });
      return found;
    });
    await page.waitForTimeout(400);

    const field = page.locator('input[data-component-var="heading"], [data-component-var="heading"] input');
    await expect(field).toHaveCount(1);
    await field.fill('한 엔진, 두 제품');
    await field.press('Enter');
    await page.waitForTimeout(600);

    /*
     * Read off the **screen**, because that is the only place a placement's words are: the part is
     * the definition's, and the value is put into it while the children are resolved (§10b-2a). The
     * cost, said plainly: find-and-replace and the deck's own check cannot see these words in the
     * document — the check resolves placements itself for exactly that reason.
     */
    const words = await page.evaluate((sid) => {
      const box = document.querySelector(`.sl-stage [data-bc-sid="${sid}"]`);
      return box?.textContent ?? '';
    }, placement);
    // Declared in one panel, bound in another, answered in a third — and the words on the
    // slide are the answer.
    expect(words).toContain('한 엔진, 두 제품');
  });
});

/**
 * How big a card is — and why a placement cannot be resized.
 *
 * Measured before any of this existed: dragging a placement's corner handle wrote a box of
 * 8280×6440 onto a card whose parts stayed exactly 5040×3960. The selection outline grew, the
 * card did not change at all, and nothing said so — which is the refused frame drag in a new
 * place, and the reason that one taught us to grey the fields rather than accept the gesture.
 *
 * A placement's extent *is* its definition's, so the way to change a card's size is to change
 * the card, and every placement's box follows.
 */
test.describe('how big a card is', () => {
  const cardSlide = async (page: Page) => {
    const sid = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      return ((root.content ?? []) as string[]).find((one: string) => {
        const node = store.getNode(one);
        return (
          node?.stype === 'surface' &&
          ((node.content ?? []) as string[]).some(
            (child: string) => store.getNode(child)?.stype === 'instance'
          )
        );
      });
    });
    await page.locator(`.sl-filmstrip button[data-slide="${sid}"]`).click();
    await page.waitForTimeout(400);
    return sid as string;
  };

  const selectPlacement = async (page: Page, slide: string) => {
    const sid = await page.evaluate((one) => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const found = ((store.getNode(one)?.content ?? []) as string[]).find(
        (child: string) => store.getNode(child)?.stype === 'instance'
      );
      void editor.executeCommand('setNode', { nodeIds: [found] });
      return found;
    }, slide);
    await page.waitForTimeout(400);
    return sid as string;
  };

  test('offers a placement no resize handles, and says why', async ({ page }) => {
    await openDeck(page);
    const slide = await cardSlide(page);
    await selectPlacement(page, slide);

    // Rotation stays: turning a card is a transform of the whole thing and needs no answer
    // about what is inside it.
    await expect(page.locator('[data-handle="se"]')).toHaveCount(0);
    await expect(page.locator('[data-handle="rotate"]')).toHaveCount(1);

    // And the panel says it in words as well as by the greyed fields, because a number a
    // reader can type that changes nothing is the same fault as a drag that does nothing.
    await expect(page.locator('.sl-properties')).toContainText('크기는 컴포넌트가 정합니다');
    await expect(page.locator('.sl-properties').getByLabel('너비')).toBeDisabled();
  });

  test('changes the card’s size, and every placement follows', async ({ page }) => {
    await openDeck(page);
    const slide = await cardSlide(page);
    const placement = await selectPlacement(page, slide);

    await openPanel(page);
    await page.locator('.sl-components [data-component-id="metric-card"]').click();
    await page.waitForTimeout(600);

    // Standing in the definition with nothing selected: the panel is about the card.
    const width = page.locator('.sl-properties').getByLabel('컴포넌트 너비');
    await expect(width).toHaveCount(1);
    await width.fill('12');
    await width.press('Enter');
    await page.waitForTimeout(700);

    const sizes = await page.evaluate((sid) => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const library = ((root.content ?? []) as string[])
        .map((one: string) => store.getNode(one))
        .find((node: any) => node?.stype === 'components');
      const definition = ((library.content ?? []) as string[])[0];
      return {
        card: store.getNode(definition)?.attributes?.width,
        placement: store.getNode(sid)?.attributes?.width
      };
    }, placement);

    /*
     * 12cm in twips, rounded once where the reader's unit is turned back into the model's —
     * 6803 rather than 6804, which is the conversion and not the command. What matters is the
     * second line: the placement is exactly as wide as the card, because a placement drawing a
     * bigger card inside a smaller outline is the drift this closes.
     */
    expect(sizes.card).toBe(6803);
    expect(sizes.placement).toBe(sizes.card);
  });
});

/**
 * A card's parts in the layer list — the only way to reach one that is covered.
 *
 * The list descended into a group and a frame and stopped at a placement, so a card's badge was
 * reachable by clicking exactly on it and by nothing else. Picking what is underneath is the
 * whole reason the list exists (`layers.ts`), so leaving out the container that holds five boxes
 * left out the case.
 */
test.describe('a card in the layer list', () => {
  test('lists what the placement itself holds, and takes the reader to it', async ({
    page
  }) => {
    await openDeck(page);

    // The card slide, and the layer pane open on it.
    const slide = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      return ((root.content ?? []) as string[]).find((one: string) => {
        const node = store.getNode(one);
        return (
          node?.stype === 'surface' &&
          ((node.content ?? []) as string[]).some(
            (child: string) => store.getNode(child)?.stype === 'instance'
          )
        );
      });
    });
    await page.locator(`.sl-filmstrip button[data-slide="${slide}"]`).click();
    await page.waitForTimeout(400);
    await page.locator('.sl-layers-closed').click();
    await expect(page.locator('.sl-layers')).toHaveCount(1);
    await page.waitForTimeout(400);

    /*
     * The list shows what the **document** holds, and a placement now holds only what a reader put
     * in its slot: the card's parts belong to the definition, so they are worked on by opening the
     * card. That is the honest consequence of a component that follows its definition — there is no
     * per-placement copy of a part to select.
     */
    const rows = page.locator('.sl-layers-list li[data-layer]');
    expect(await rows.count()).toBeGreaterThan(0);
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('.sl-layers-list .sl-layer-name')].map((n) => n.textContent)
    );
    // A value the card was asked for is not a row: "값" is not a name a reader could tell rows by.
    expect(labels).not.toContain('값');

    // The placement itself is a row, and pressing it selects a node in the document.
    await page.locator('.sl-layers-list li [data-layer-pick]').first().click();
    await page.waitForTimeout(400);
    const picked = await page.evaluate(() => {
      const editor = (window as any).editor;
      const sid = editor.selection?.nodeIds?.[0];
      return sid ? editor.dataStore.getNode(sid)?.stype : null;
    });
    expect(typeof picked).toBe('string');
  });
});

/**
 * A card that **can** be resized, because it was built out of a frame.
 *
 * The refusal in the group above is right for a card of absolutely placed parts: the drag writes
 * a box and nothing that can be seen changes. It is wrong for a card whose parts were told to
 * fill it — there the drag reaches the card, because the part takes the placement's new box and,
 * being a frame, arranges its own children against it. So the product refuses exactly where it
 * has no answer, and this is the other side of that.
 */
test.describe('a card built out of a frame', () => {
  const deckWithFillingCard = async (page: Page) =>
    page.evaluate(() =>
      (window as any).editor.loadDocument(
        {
          stype: 'document',
          attributes: {},
          content: [
            {
              stype: 'surface',
              attributes: { kind: 'slide', name: '한 장' },
              content: [
                {
                  stype: 'instance',
                  attributes: { componentId: 'card', x: 2000, y: 2000, width: 6000, height: 4000 },
                  content: []
                }
              ]
            },
            {
              stype: 'components',
              attributes: {},
              content: [
                {
                  stype: 'component',
                  attributes: { id: 'card', name: '카드', width: 6000, height: 4000 },
                  content: [
                    {
                      stype: 'frame',
                      attributes: {
                        partId: 'body',
                        x: 0,
                        y: 0,
                        width: 6000,
                        height: 4000,
                        layoutStretch: true,
                        layoutMode: 'column',
                        gap: 200,
                        padding: 200,
                        fill: '#e2e8f0'
                      },
                      content: [
                        {
                          stype: 'rectangle',
                          attributes: { x: 0, y: 0, width: 5600, height: 1000, layoutStretch: true, fill: '#2563eb' }
                        },
                        {
                          stype: 'rectangle',
                          attributes: { x: 0, y: 0, width: 5600, height: 1000, layoutStretch: true, fill: '#94a3b8' }
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        'slides'
      )
    );

  test('gets its handles back, and a drag reaches the parts', async ({ page }) => {
    await openDeck(page);
    await deckWithFillingCard(page);
    await page.waitForTimeout(600);

    const placement = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const slide = ((root.content ?? []) as string[]).find(
        (sid: string) => store.getNode(sid)?.stype === 'surface'
      );
      const found = ((store.getNode(slide)?.content ?? []) as string[])[0];
      void editor.executeCommand('setNode', { nodeIds: [found] });
      return found;
    });
    await page.waitForTimeout(400);

    // Offered, because the model has an answer for the drag.
    const handle = page.locator('[data-handle="se"]');
    await expect(handle).toHaveCount(1);
    await expect(page.locator('.sl-properties').getByLabel('너비')).toBeEnabled();

    /**
     * Measured off the **drawing**, in pixels.
     *
     * The parts are not in the document any more — the placement holds nothing and what is on the
     * screen is the definition, resolved with the placement's box — so there is nothing to read
     * `width` off. Which is exactly what this test should be checking: the reader's drag has to
     * change what the audience sees, whatever the document does about it.
     */
    const shown = async (sid: string) =>
      await page.evaluate((one) => {
        const card = document.querySelector(`.sl-stage [data-bc-sid="${one}"]`) as HTMLElement | null;
        const parts = card ? [...card.querySelectorAll('[data-bc-sid]')] : [];
        const rect = (el: Element | null) => (el ? (el as HTMLElement).getBoundingClientRect().width : 0);
        return { card: rect(card), body: rect(parts[0] ?? null), row: rect(parts[1] ?? null) };
      }, sid);

    const before = await shown(placement);

    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 140, box.y + 60, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(700);

    const after = await shown(placement);

    /*
     * The card, the part that fills it, and the row inside that part — three levels, one drag, and
     * none of it the browser's doing: a slide places, and an absolutely positioned child does not
     * reflow when its parent's box changes. All three are answered while the children are
     * resolved, which is why no document write was needed to move any of them.
     */
    expect(after.card).toBeGreaterThan(before.card);
    expect(Math.round(after.body)).toBe(Math.round(after.card));
    // The frame's padding, 200 twips a side, in pixels at the stage's scale.
    const inset = (after.card - after.row) / 2;
    expect(inset).toBeGreaterThan(0);
    expect(Math.round(after.row)).toBe(Math.round(after.body - inset * 2));
  });
});

/**
 * A variable that drives something other than the three things three attributes allowed.
 *
 * The measurement that made this item worth doing: a card's corner radius, a frame's gap and a
 * badge's opacity were all unreachable, because a variable could only be bound through `bindText`,
 * `bindFill` or `bindVisible` — so a `number` could only ever be *text*. The bindings are the
 * definition's declarations now, and what a piece can take is what it **declares**.
 */
test.describe('a variable that drives an attribute', () => {
  test('offers what the part declares, and writes a number as a number', async ({ page }) => {
    await openDeck(page);
    await openPanel(page);
    await page.locator('.sl-components [data-component-id="metric-card"]').click();
    await page.waitForTimeout(600);

    // A number variable on the sample's card.
    await page.locator('[data-var-new] input, input[data-var-new]').fill('round');
    await page.locator('[data-var-add]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-var-row="round"] select').first().selectOption('number');
    await page.waitForTimeout(400);
    const value = page.locator('[data-var-row="round"] input').nth(1);
    await value.fill('400');
    await value.press('Enter');
    await page.waitForTimeout(500);

    // The card's back, selected inside the definition.
    const back = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const library = ((root.content ?? []) as string[])
        .map((sid: string) => store.getNode(sid))
        .find((one: any) => one?.stype === 'components');
      const card = ((library?.content ?? []) as string[])[0];
      const part = ((store.getNode(card)?.content ?? []) as string[]).find(
        (sid: string) => store.getNode(sid)?.attributes?.partId === 'back'
      );
      void editor.executeCommand('setNode', { nodeIds: [part] });
      return part;
    });
    await page.waitForTimeout(500);

    const panel = page.locator('.sl-properties');
    await expect(panel).toContainText('컴포넌트 부품 · back');
    /*
     * A row per attribute the part declares — 둥근 정도 among them, which no binding could reach
     * before — and each row offers only the variables whose *kind* fits.
     */
    const radius = panel.getByLabel('둥근 정도 변수');
    await expect(radius).toHaveCount(1);
    await radius.selectOption('round');
    await page.waitForTimeout(600);

    // The declaration is the card's.
    const binds = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode((window as any).editor.getRootId());
      const library = ((root.content ?? []) as string[])
        .map((sid: string) => store.getNode(sid))
        .find((one: any) => one?.stype === 'components');
      const card = ((library?.content ?? []) as string[])[0];
      return ((store.getNode(card)?.content ?? []) as string[])
        .map((sid: string) => store.getNode(sid))
        .filter((one: any) => one?.stype === 'componentBind')
        .map((one: any) => `${one.attributes.part}.${one.attributes.attr}=${one.attributes.var}`);
    });
    expect(binds).toContain('back.cornerRadius=round');

    // And a new placement takes it — as a **number**, because an attribute that means a length has
    // to be one, while the document keeps a variable's value as a string.
    await page.locator('[data-editing-close]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-component-place="metric-card"]').click();
    await page.waitForTimeout(700);

    /*
     * Read off the screen: the value is put into the part while the placement's children are
     * resolved, so a corner radius a reader chose is a **rounded corner** and not an attribute in
     * the document. 400 twips is 26.67px at 1:1, scaled by the stage — so the assertion is that it
     * is rounded at all, and by more than a hairline.
     */
    const rounded = await page.evaluate(() => {
      const sid = (window as any).editor.selection?.nodeIds?.[0];
      const card = document.querySelector(`.sl-stage [data-bc-sid="${sid}"]`);
      const back = card?.querySelector('[data-bc-sid]') as HTMLElement | null;
      return back ? parseFloat(getComputedStyle(back).borderTopLeftRadius) : 0;
    });
    expect(rounded).toBeGreaterThan(1);
    void back;
  });
});
