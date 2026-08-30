import { test, expect } from '@playwright/test';
import { placeCaret } from './helpers';

/**
 * The toolbar, which reads the editor as much as it writes to it — a control
 * showing the wrong state is a click that undoes something the user can see.
 *
 * Part of the browser suite for apps/word; the shared helpers are in helpers.ts.
 */

test.describe('the toolbar', () => {
  test('shows a mark as on when it covers the whole selection', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');

    // The sample has a code mark over one word
    await page.locator('.mark-code').first().click();
    await page.waitForTimeout(300);
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');

    await expect
      .poll(async () =>
        page.evaluate(() => (window as any).editor.getSelectionSummary().marks.includes('code'))
      )
      .toBe(true);
  });

  test('shows a mark as mixed when it covers only part of it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');

    // Select across the boundary of the marked run into unmarked text
    const summary = await page.evaluate(() => {
      const editor = (window as any).editor;
      const marked = document.querySelector('.mark-code')!.closest('[data-bc-sid]')!;
      const sid = marked.getAttribute('data-bc-sid')!;

      // From inside the marked node into the one after it
      const parent = editor.dataStore.getParent(sid);
      const siblings = parent.content as string[];
      const after = siblings[siblings.indexOf(sid) + 1];

      editor.updateSelection({
        type: 'range',
        startNodeId: sid,
        startOffset: 0,
        endNodeId: after,
        endOffset: 3,
        collapsed: false
      });
      return editor.getSelectionSummary();
    });

    // Neither on nor off: a button drawn as off here would turn one click into
    // a silent reformat of everything selected.
    expect(summary.mixedMarks).toContain('code');
    expect(summary.marks).not.toContain('code');
  });

  test('draws the three states apart', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);

    /**
     * The toggles, which is `[data-state]` and not `[data-control]`.
     *
     * A colour palette carries `data-control` too and is not a toggle: it has no
     * pressed state to be three-valued about — what it shows is the colour it
     * would apply, in a bar under the letter, and `aria-pressed` on it would tell
     * a screen reader that a button which opens a panel is switched off. Asking
     * every `[data-control]` for a state failed the moment one appeared that
     * legitimately has none.
     */
    const states = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-control][data-state]')).map(
        (b) => (b as HTMLElement).dataset.state
      )
    );
    expect(states.length).toBeGreaterThan(10);
    expect(states.every((state) => ['on', 'mixed', 'off'].includes(state!))).toBe(true);

    // A screen reader has to be told "partially pressed" rather than "not pressed"
    const pressed = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-control][data-state]')).map((b) =>
        b.getAttribute('aria-pressed')
      )
    );
    expect(pressed.every((value) => ['true', 'false', 'mixed'].includes(value!))).toBe(true);

    // And the palette says what it is instead: a button that opens something.
    const palette = page.locator('[data-control="font-color"]');
    await expect(palette).toHaveAttribute('aria-expanded', 'false');
    expect(await palette.getAttribute('aria-pressed'), '팔레트가 눌림 상태를 주장합니다').toBeNull();
  });

  test('shows the style the blocks agree on, and nothing when they do not', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');

    await placeCaret(page, '.w-paragraph', 1);
    // The control is a button showing the current value, not a <select>
    await expect(page.locator('.w-toolbar-style')).toContainText('Body text');

    // Across a heading and a paragraph there is no single style to show
    await page.evaluate(() => {
      const editor = (window as any).editor;
      const heading = document.querySelector('.w-heading [data-bc-sid]')!.getAttribute('data-bc-sid')!;
      const paragraph = document.querySelector('.w-paragraph [data-bc-sid]')!.getAttribute('data-bc-sid')!;
      editor.updateSelection({
        type: 'range',
        startNodeId: heading,
        startOffset: 0,
        endNodeId: paragraph,
        endOffset: 2,
        collapsed: false
      });
    });

    // Nothing to show: the blocks are in different styles, and picking one of
    // them is how a dropdown reformats a selection it was only reporting on.
    await expect(page.locator('.w-toolbar-style')).toHaveAttribute('data-mixed', 'true');
  });

  test('applies alignment to every block the selection touches', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);

    await page.locator('[data-control="align-center"]').dispatchEvent('pointerdown');

    await expect
      .poll(async () =>
        page.evaluate(() => (window as any).editor.getSelectionSummary().blockAttributes.alignment)
      )
      .toBe('center');

    // ...and the button says so
    await expect(page.locator('[data-control="align-center"]')).toHaveAttribute('data-state', 'on');
  });

  test('shows the font and size the text inherits, not a dash', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);

    // Almost no text in a Word document carries direct font formatting — it
    // comes down the style cascade — so a control that read only marks would sit
    // blank over every ordinary paragraph and claim the selection disagreed with
    // itself.
    await expect(page.locator('.w-toolbar-font-family')).toContainText('Georgia');
    await expect(page.locator('.w-toolbar-font-size')).toContainText('11');
  });

  test('applies the size chosen in the dropdown', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);
    await page.keyboard.down('Shift');
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');

    const before = await page.evaluate(() => {
      const sel = (window as any).editor.selection;
      const el = document.querySelector(`[data-bc-sid="${sel.startNodeId}"]`) as HTMLElement;
      return getComputedStyle(el).fontSize;
    });

    // Driven through the control a reader would use, not the command behind it:
    // the dropdown has to send the value in the unit the renderer reads, and
    // sending points where half-points were meant halves the size silently.
    await page.locator('.w-toolbar-font-size').click();
    await page.locator('[data-style="40"]').click();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const marked = document.querySelectorAll('.mark-fontSize');
          return [...marked].map((el) => getComputedStyle(el as HTMLElement).fontSize);
        })
      )
      // Twenty point, which the model stores as forty half-points.
      .toContain('26.6667px');
    expect(before).not.toBe('26.6667px');
  });

  test('fetches a web font before setting the text in it', async ({ page }) => {
    // Served locally, so the test does not depend on the network and stays a
    // test of the ordering rather than of Google's uptime. Delayed on purpose:
    // without a delay the font resolves instantly and the ordering cannot be
    // observed at all — the test would pass whichever way round it happened.
    let requested: string | null = null;
    await page.route('**/fonts.googleapis.com/**', async (route) => {
      requested = route.request().url();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        contentType: 'text/css',
        body: `@font-face{font-family:'Playfair Display';src:local('Georgia');font-weight:400}
               @font-face{font-family:'Playfair Display';src:local('Georgia');font-weight:700}`
      });
    });

    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);
    await page.keyboard.down('Shift');
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');

    // Records whether the font was ready at the instant the text was first set
    // in it. Asking afterwards answers nothing: the font arrives either way, and
    // what matters is whether anything was measured before it did. Pagination
    // believes the widths it measures, so text painted in a fallback breaks its
    // pages against the wrong font and the correction arrives as a reflow.
    await page.evaluate(() => {
      const w = window as any;
      w.__readyWhenApplied = null;
      const observer = new MutationObserver(() => {
        if (w.__readyWhenApplied !== null) return;
        if (!document.querySelector('.mark-fontFamily')) return;
        // Not `fonts.check`: it answers true when no matching face exists at
        // all, because the text can still be drawn in a fallback — which is the
        // very situation being tested for. The face's own status is the fact.
        w.__readyWhenApplied = [...(document as any).fonts].some(
          (face: any) =>
            face.family.replace(/["']/g, '') === 'Playfair Display' && face.status === 'loaded'
        );
        observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });

    await page.locator('.w-toolbar-font-family').click();
    await page.locator('[data-style="Playfair Display"]').click();

    await expect
      .poll(async () => page.evaluate(() => (window as any).__readyWhenApplied), { timeout: 10000 })
      .toBe(true);

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const marked = document.querySelector('.mark-fontFamily') as HTMLElement | null;
          return marked ? getComputedStyle(marked).fontFamily : null;
        })
      )
      .toBe('"Playfair Display"');

    // Both weights, because a browser asked to embolden a face it lacks invents
    // one at a different width; and blocking rather than swapping, because a
    // swap paints in the fallback first — which is the measurement that matters.
    expect(requested).toContain('wght@400;700');
    expect(requested).toContain('display=block');
  });

  test('makes a list, moves it between levels, and lets it go again', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);

    // The block is captured before anything is pressed. Clicking a toolbar
    // button moves focus, and following the live selection afterwards would be
    // following whatever it became rather than the paragraph under test.
    const sid = await page.evaluate(() => {
      const ed: any = (window as any).editor;
      let node = ed.dataStore.getNode(ed.selection.startNodeId);
      for (let depth = 0; node && depth < 64; depth++) {
        if (node.stype && typeof node.text !== 'string' && node.stype !== 'inline-text') break;
        node = node.parentId ? ed.dataStore.getNode(node.parentId) : undefined;
      }
      return node.sid as string;
    });

    const state = async () =>
      page.evaluate((sid) => {
        const el = document.querySelector(`[data-bc-sid="${sid}"]`) as HTMLElement | null;
        return {
          marker: el?.getAttribute('data-marker')?.trim() ?? null,
          marginLeft: el ? getComputedStyle(el).marginLeft : null
        };
      }, sid);

    // Nothing here reads the model: a list nobody can see is not a list. The
    // marker is computed at render time from the definition the paragraph names,
    // so it only appears if the definition was written, the paragraph points at
    // it, and the resolver was rebuilt to notice.
    await page.getByRole('button', { name: 'Bulleted list' }).click();
    await expect.poll(state).toEqual({ marker: '•', marginLeft: '48px' });

    // A level in: the glyph changes and it moves half an inch further.
    await page.getByRole('button', { name: 'Increase indent' }).click();
    await expect.poll(state).toEqual({ marker: '○', marginLeft: '96px' });

    await page.getByRole('button', { name: 'Numbered list' }).click();
    await expect.poll(state).toEqual({ marker: 'a.', marginLeft: '96px' });

    // Out of the last level is out of the list: the button is a way back to an
    // ordinary paragraph rather than a dead end.
    await page.getByRole('button', { name: 'Decrease indent' }).click();
    await page.getByRole('button', { name: 'Decrease indent' }).click();
    await expect.poll(state).toEqual({ marker: '', marginLeft: '0px' });
  });

  test('shows a list button as on only for the list the caret is in', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);

    const pressed = async (name: string) =>
      page.getByRole('button', { name }).getAttribute('aria-pressed');

    expect(await pressed('Bulleted list')).toBe('false');
    await page.getByRole('button', { name: 'Bulleted list' }).click();

    await expect.poll(() => pressed('Bulleted list')).toBe('true');
    // Which kind cannot be read from the selection — it takes resolving the
    // definition the paragraph names — so this is where that resolution is
    // checked from the outside.
    expect(await pressed('Numbered list')).toBe('false');
  });

  test('disables a command that cannot run', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');

    // Nothing has been edited, so there is nothing to undo. A toolbar wired to
    // canExecuteCommand directly would have shown every button disabled here,
    // because almost every editing command requires a selection.
    await expect(page.locator('[data-control="undo"]')).toBeDisabled();

    await placeCaret(page, '.w-paragraph', 1);
    await expect(page.locator('[data-control="bold"]')).toBeEnabled();
  });

  /**
   * Notices a selection that has been *cleared*, not only one that has moved.
   *
   * These are two different events, which is the whole point: `selection.model`
   * is emitted for a selection that *is* something, and a selection cleared is
   * announced on `selection.change` and nowhere else. Measured, before the
   * subscription became the suite's: this ribbon listened to the first and not
   * the second, so nothing here re-read — and `deleteTable` clears the selection
   * when it succeeds, so a reader could delete a table and leave a toolbar
   * describing the cells that used to be under the caret.
   *
   * Slides had already found this and written the reason down in its own copy of
   * the subscription. That is what made it worth sharing rather than fixing here.
   */
  test('notices a selection that is cleared, not only one that moves', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);

    /**
     * **Words, not a caret** — because a font is a mark, and a mark over zero characters is written
     * nowhere.
     *
     * This held the caret and expected 글꼴 to be live, and it was: the guard asked only for a range
     * and a collapsed one passed. So a reader could click into a word, choose a font, and have
     * nothing happen — the class `guards.ts` is named after. 크기 and 색 had been given the tighter
     * question long before and were already grey here; 글꼴 was the odd one, and the three agree now.
     *
     * The test is about the *cleared* selection either way, and it says the same thing over a
     * selection as over a caret — it just says it about a control that means something.
     */
    await page.keyboard.down('Shift');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const at = (window as never as { editor?: { selection?: Record<string, number | string> } })
            .editor?.selection;
          return at ? at.endOffset !== at.startOffset : false;
        })
      )
      .toBe(true);

    const font = page.locator('.w-toolbar-font-family');
    await expect(font).toBeEnabled();
    await expect(page.locator('.w-toolbar-style')).toContainText('Body text');

    // Cleared the way the document clears it — `deleteTable` does exactly this.
    await page.evaluate(() => (window as any).editor.updateSelection(null));

    // There is nothing to set a font on, and the ribbon has to say so.
    await expect(font).toBeDisabled();
    await expect(page.locator('.w-toolbar-style')).toHaveText('—');
  });
})

/**
 * A ribbon is a band that reflows to the width it is given.
 *
 * It was one row that ran off the edge: at 1200px the table buttons were past
 * the right edge of the screen with no way to reach them, which is the whole
 * difference between a ribbon and a strip.
 */
test.describe('the ribbon at any width', () => {
  for (const width of [1440, 1024, 820, 620]) {
    test(`keeps every control on screen at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto('/');
      await page.waitForSelector('.w-toolbar');

      const measured = await page.evaluate(() => {
        const bar = document.querySelector('.w-toolbar')!;
        const controls = [...bar.querySelectorAll('[data-control], [class^="w-toolbar-"]')];
        const offscreen = controls.filter((control) => {
          const box = control.getBoundingClientRect();
          return box.right > window.innerWidth + 1 || box.left < -1;
        });
        return {
          controls: controls.length,
          offscreen: offscreen.map((el) => el.getAttribute('data-control') ?? el.className),
          rows: new Set(controls.map((c) => Math.round(c.getBoundingClientRect().top))).size
        };
      });

      expect(measured.controls).toBeGreaterThan(20);
      expect(measured.offscreen).toEqual([]);
      // Narrower windows take more rows, which is what wrapping is
      if (width <= 820) expect(measured.rows).toBeGreaterThan(2);
    });
  }

  test('never breaks a group across two rows', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 700 });
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');

    // A group squeezed in half is a row of buttons that belong together drawn
    // as though they do not.
    const split = await page.evaluate(() =>
      [...document.querySelectorAll('.w-toolbar-group')]
        .map((group) => ({
          id: group.getAttribute('data-group'),
          rows: new Set(
            [...group.children].map((child) => Math.round(child.getBoundingClientRect().top))
          ).size
        }))
        .filter((group) => group.rows > 1)
    );
    expect(split).toEqual([]);
  });
});

/**
 * Every control is drawn with an icon, not with a letter.
 *
 * The model says which **act** a control performs — `icon: 'accept-all'` — and the
 * shared table turns that into a drawing; a name it does not know draws as the
 * name in text. That is the right fallback and a bad default: one control added
 * without an entry reads as `accept-all` beside twenty icons and nothing else
 * fails. Eleven were drawing a glyph when this was written, three of them from
 * before the session that found it.
 *
 * Asked of the DOM rather than of the map, because that is the question: not
 * "is there an entry" but "does this button draw an icon".
 */
test.describe('the toolbar’s icons', () => {
  test('every control draws one, and none falls back to a glyph', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);

    const withoutIcon = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.w-toolbar [data-control]'))
        .filter((control) => !control.querySelector('svg'))
        .map((control) => control.getAttribute('data-control'))
    );
    expect(withoutIcon, '아이콘 없이 글리프로 그려진 컨트롤이 있습니다').toEqual([]);
  });

  /**
   * And the panes, which is where the letters were still hiding.
   *
   * The toolbar was swept twice; the two side panes never were, because nothing
   * asked. Measured before this test existed: the outline strip drew `☰`, the
   * comments strip drew `💬`, and both panes' close buttons drew `×` — a
   * multiplication sign at whatever weight the body face happens to have, beside
   * a ribbon of drawn icons.
   *
   * Asked of both panes *open*, because a closed pane is one button and the
   * interesting ones (reply, resolve, delete, close) only exist inside. The find
   * bar too, which is the third place a close button lives.
   */
  test('and so does every button in the panes beside it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-toolbar');
    await placeCaret(page, '.w-paragraph', 1);

    /**
     * Opened by the strip that is showing, not by pressing the toggle twice.
     *
     * Which of the two panes starts open is the app's choice and it is not the
     * same for both — the outline is open when the document loads and the
     * comments are not. A test that pressed both toggles closed the one that was
     * already open, and then looked for buttons in a pane that was a strip.
     */
    const reveal = async (strip: string, pane: string) => {
      if ((await page.locator(strip).count()) > 0) await page.locator(strip).click();
      await expect(page.locator(pane)).toHaveCount(1);
    };
    await reveal('.w-outline-closed', '.w-outline');
    await reveal('.w-comments-closed', '.w-comments-pane');

    // Ctrl+F rather than a control, because the find bar has none — it is bound
    // and nothing else opens it.
    await page.keyboard.press('Control+f');
    await expect(page.locator('.w-find-panel')).toHaveCount(1);

    /**
     * And one comment, because four of the drawings only exist inside a thread.
     *
     * An empty pane has two buttons in it; a thread adds edit, reply, resolve and
     * delete, which is where most of the comment icons are. Made through the
     * command rather than by selecting and pressing, because what is being tested
     * here is the drawing and not the making — `word-review.spec.ts` owns that.
     */
    await page.evaluate(async () => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const longEnough = (sid: string): string | null => {
        const node = store.getNode(sid);
        if (!node) return null;
        if (typeof node.text === 'string') return node.text.length >= 15 ? sid : null;
        for (const child of (node.content ?? []) as string[]) {
          const found = longEnough(child);
          if (found) return found;
        }
        return null;
      };
      const run = longEnough(store.getRootNodeId())!;
      await editor.run('insertComment', {
        selection: {
          type: 'range',
          startNodeId: run,
          startOffset: 0,
          endNodeId: run,
          endOffset: 10,
          collapsed: false
        },
        text: '아이콘을 그릴 만한 댓글'
      });
    });
    await expect(page.locator('.w-comments-pane [data-comment]')).toHaveCount(1);

    /**
     * A button whose whole content is text, in any of the three.
     *
     * Not "has no svg": a button that is *meant* to be words — 바꾸기, 모두
     * 바꾸기, a heading in the outline list — is right to be words. The fault is a
     * button the size of an icon whose content is one character, so that is what
     * this asks: short text, and no drawing.
     */
    const buttons = await page.evaluate(() => {
      const all = Array.from(
        document.querySelectorAll('.w-outline button, .w-comments-pane button, .w-find-panel button')
      );
      return {
        drawn: all.filter((button) => button.querySelector('svg')).length,
        lettered: all
          .filter((button) => !button.querySelector('svg'))
          .map((button) => (button.textContent ?? '').trim())
          .filter((text) => text.length > 0 && text.length <= 2)
      };
    });
    expect(buttons.lettered, '아이콘 대신 글자 한 자를 그린 버튼이 있습니다').toEqual([]);
    // And it looked at something: an empty list of buttons would satisfy the
    // assertion above while proving nothing, which is how this kind of test rots.
    expect(buttons.drawn, '창에서 아이콘을 그린 버튼을 찾지 못했습니다').toBeGreaterThanOrEqual(9);

    // And nothing in the chrome fell back to its own name, which the table marks.
    expect(await page.locator('[data-icon-missing]').count()).toBe(0);
  });
});
