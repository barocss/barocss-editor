import { test, expect, type Page } from '@playwright/test';

/**
 * **`office-note`, with no product behind it.**
 *
 * A package is only independent if something independent uses it. Every claim made about this one —
 * its own schema, kit, toolbar, chrome and session — was true *inside* the site builder, which is
 * the one place the claims are hardest to check: four borrowed parts had been working for the wrong
 * reason, and each was found by taking one thing away.
 *
 * So this app imports the package and nothing else of the products, and this suite presses every
 * button on it. Everything below was **found by running it**.
 */
const ready = async (page: Page) => {
  await page.goto('/');
  await page.waitForSelector('[data-note-editor]');
  /*
   * Three sessions mount here, each building a store and a view of its own, and a check that presses
   * a key before the last one is ready presses it into nothing. Measured: every check passed alone
   * and the quotation one failed in sequence, which is the shape of a wait that is long enough on an
   * idle machine and not on a busy one.
   */
  /*
   * **The three named cases**, not a count of every body on the page: 여럿 mounts three more of its
   * own, so an exact total is a wait that breaks the day another case is added — which it did.
   */
  await page.waitForFunction(() =>
    ['empty', 'post', 'long'].every((one) => !!document.querySelector(`[data-case="${one}"] .on-doc`))
  );
  await page.waitForTimeout(400);
};

/**
 * Wait until the caret has actually arrived in the words.
 *
 * A click and a fixed pause is a check that passes on an idle machine: an insert lands *after the
 * block the caret is in*, and with no caret yet it lands at the end — so the block order came out
 * right alone and wrong under load. The session is on `window` for exactly this: some of what has to
 * be checked here is a question about the model that no amount of looking at the DOM answers.
 */
const caretIn = (page: Page, id: string) =>
  page.waitForFunction((one) => {
    /*
     * Shaped on `window` rather than cast off the editor: inside a browser function there is no
     * `Editor` type to import, and saying what the session *is* once beats casting what it holds
     * twice — which the repository counts, in `editor-is-typed`.
     */
    const held = (window as never as {
      __notes?: Record<
        string,
        { editor: { selection?: { startNodeId?: string } | null; dataStore: { getNode: (sid: string) => { stype?: unknown } | undefined } } }
      >;
    }).__notes?.[one];
    const at = held?.editor.selection?.startNodeId;
    return !!at && String(held?.editor.dataStore.getNode(at)?.stype) === 'inline-text';
  }, id);

/**
 * Wait until there is a **range inside one block** — which is what a mark needs and what a caret is
 * not.
 *
 * Keys are the only way to make one from the outside and they are not instant: a `Shift+ArrowLeft`
 * pressed before the click's caret has settled extends nothing, and the check then fails on the mark
 * rather than on the selection it never had. Every failure of that shape in this file has been this.
 */
const rangeIn = (page: Page, id: string) =>
  page.waitForFunction((one) => {
    const held = (window as never as {
      __notes?: Record<
        string,
        { editor: { selection?: { startNodeId?: string; endNodeId?: string; startOffset?: number; endOffset?: number } | null } }
      >;
    }).__notes?.[one];
    const sel = held?.editor.selection;
    return (
      !!sel &&
      sel.startNodeId === sel.endNodeId &&
      sel.startOffset !== sel.endOffset
    );
  }, id);

/**
 * **블록을 가로지르는 범위** — `rangeIn` 의 반대쪽.
 *
 * `rangeIn` waits for a range **inside one run**: same node, different offsets. That is what a drag
 * across a few words makes, and it is the shape every mark command was written against.
 *
 * This waits for the other one: two ends in **different runs**. `Ctrl+A` makes it, and so does a drag
 * down a column of paragraphs — and it is the shape four separate faults were hiding in, because
 * nothing waited for it and so nothing checked it. See `docs/specs/selection.md`.
 */
const crossRangeIn = (page: Page, id: string) =>
  page.waitForFunction((one) => {
    const held = (window as never as {
      __notes?: Record<string, { editor: { selection?: { startNodeId?: string; endNodeId?: string } | null } }>;
    }).__notes?.[one];
    const sel = held?.editor.selection;
    return !!sel?.startNodeId && !!sel.endNodeId && sel.startNodeId !== sel.endNodeId;
  }, id);

/**
 * Wait until the caret is at the **end of the text it is in**.
 *
 * `End` is not usable here (see `BACKLOG.md`), so the gesture that gets there is a click past the
 * last character — and a click is not instant. Without this the Enter that follows lands wherever
 * the caret happened to be, which splits a paragraph in the middle and fails a check about
 * something else entirely.
 *
 * **A node with no text has no end, and this used to say it did.** `startOffset === text.length` is
 * `0 === 0` on an empty one, so the wait returned true immediately with the caret still wherever it
 * started. The note this is used on is `[data-case="empty"]` — its body *is* an empty paragraph —
 * so a click that missed the quotation left the caret there and the check went on regardless. What
 * failed then was the count sixty lines later, which is a check failing for something it is not
 * about. Measured: `note.spec.ts:213` failed in 1 of 3 clean runs and 2 of 3 with an unrelated
 * change, always at the count and never here.
 *
 * So it asks for a `wants` — the text the caret is supposed to be at the end of. Then the wait is
 * about the place, not about an arithmetic that an empty node satisfies for free.
 */
const atEndOf = (page: Page, id: string, wants: string) =>
  page.waitForFunction(([one, said]) => {
    const held = (window as never as {
      __notes?: Record<
        string,
        { editor: { selection?: { startNodeId?: string; startOffset?: number } | null; dataStore: { getNode: (sid: string) => { text?: unknown } | undefined } } }
      >;
    }).__notes?.[one];
    const sel = held?.editor.selection;
    if (!sel?.startNodeId) return false;
    const text = held?.editor.dataStore.getNode(sel.startNodeId)?.text;
    return text === said && sel.startOffset === said.length;
  }, [id, wants] as const);

/**
 * Wait until the caret is in an **empty** text node — the line Enter has just made.
 *
 * The other half of `atEndOf`: one waits for the caret to reach the end of what is written, this
 * waits for it to reach what is not.
 */
const caretInEmpty = (page: Page, id: string) =>
  page.waitForFunction((one) => {
    const held = (window as never as {
      __notes?: Record<
        string,
        { editor: { selection?: { startNodeId?: string } | null; dataStore: { getNode: (sid: string) => { text?: unknown } | undefined } } }
      >;
    }).__notes?.[one];
    const at = held?.editor.selection?.startNodeId;
    return !!at && held?.editor.dataStore.getNode(at)?.text === '';
  }, id);

const kindsIn = (page: Page, id: string) =>
  page.evaluate((one) => {
    const held = document.querySelector(`[data-case="${one}"] .on-doc`);
    return held ? [...held.children].map((each) => each.tagName).join(' ') : 'none';
  }, id);

test.describe('a note on its own', () => {
  test('mounts several, each with a bar of its own', async ({ page }) => {
    await ready(page);
    /*
     * Three: an empty one and two side by side — the case a single mount cannot show. Counted over
     * **the named cases**, because 여럿 mounts three more of its own and a count of every body on
     * the page is a check that breaks the day another case is added, which it did.
     */
    for (const one of ['empty', 'post', 'long']) {
      await expect(page.locator(`[data-case="${one}"] [data-note-editor]`)).toHaveCount(1);
      await expect(page.locator(`[data-case="${one}"] [data-note-bar]`)).toHaveCount(1);
    }
    await expect(page.locator('[data-case="post"] .on-doc')).toHaveCount(1);
  });

  test('every button on the bar does what it says', async ({ page }) => {
    await ready(page);
    const held = page.locator('[data-case="post"]');
    await held.locator('[data-note-body] p').first().click();
    await page.keyboard.press('End');
    await page.waitForTimeout(300);

    /**
     * **Five of the eleven did nothing**, and every cause was different — which is the argument for
     * this app rather than for more care:
     *
     * - `목록` wrote `type: 'unordered'` where the schema says **`bullet`** (번호 목록 worked, which
     *   is what made it look like a list problem rather than a value one);
     * - `이미지` wrote an empty `src`, which is **required and may not be empty**;
     * - `영상` and `넣은 것` named node types the note schema **did not declare** — office leaves them
     *   behind and the site takes them, so three places agreed about a node that did not exist;
     * - `표` put a `bTableRow` inside `bTableHeader`, which holds **`bTableHeaderCell+` directly**.
     *
     * And then three of them landed in the model and drew **nothing**: `picture`, `mediaVideo` and
     * `mediaEmbed` were the products' renderers, borrowed while embedded in a site. A note draws its
     * own now.
     */
    const every = [
      'insertHeading',
      'insertBodyText',
      'insertBulletList',
      'insertNumberList',
      'insertQuote',
      'insertCode',
      'insertTableBlock',
      'insertRule',
      'insertPicture',
      'insertVideo',
      'insertEmbed'
    ];

    const dead: string[] = [];
    for (const one of every) {
      const before = await kindsIn(page, 'post');
      await held.locator(`[data-note-control="${one}"]`).click();
      /* 표 asks its size first — one press opens the grid, and the cell is the second. */
      if (one === 'insertTableBlock') {
        await page.waitForTimeout(150);
        await held.locator('[data-note-pick-cell="3:2"]').click();
      }
      await page.waitForTimeout(400);
      if ((await kindsIn(page, 'post')) === before) dead.push(one);
    }
    expect(dead).toEqual([]);
  });

  test('leaves a quotation on an empty line, which it could not', async ({ page }) => {
    await ready(page);
    /*
     * The **empty** case, not the one every other check writes into: a body a previous test filled
     * has a quotation somewhere in it already, and `blockquote p` would then be somebody else's.
     */
    const held = page.locator('[data-case="empty"]');
    await held.locator('[data-note-body] p').first().click();
    await page.keyboard.press('End');
    await held.locator('[data-note-control="insertQuote"]').click();
    await page.waitForTimeout(400);

    /**
     * **There was no way out with the keyboard.** Enter inside a quotation added another paragraph
     * *inside* it, and then another: one blockquote, three paragraphs, caret still in it. Reported
     * as *인용구에서 엔터로 벗어날 수 없음*.
     *
     * The rule every editor of this kind has: an **empty** block at the end of a container is a
     * gesture rather than writing, so Enter on one lifts it out. A list item has had it since it was
     * written; a quotation had nothing.
     */
    const inside = () => held.locator('[data-note-body] blockquote p').count();
    /* Into the quote's own paragraph, and into the words: a press on the box places no caret. */
    /**
     * **The caret at the end, put there by the pointer.**
     *
     * `End` does not move the caret in this editor — measured in one instance as much as in twelve,
     * with `keydown` not prevented and no handler for it anywhere; see `BACKLOG.md`. This check
     * passed alone and failed in a full run for exactly that reason, which is a check failing for
     * something it is not about.
     *
     * So the pointer does it: a click past the end of a short line in a full-width paragraph lands
     * on the nearest text position, which is the end. One gesture, no keys, and `atEndOf` refuses to
     * go on until the model agrees.
     */
    const line = held.locator('[data-note-body] blockquote p').last();
    await line.scrollIntoViewIfNeeded();
    const box = (await line.boundingBox())!;
    await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
    /* 그 줄이 무슨 글자인지는 제품이 정한다 — 여기서 베끼면 둘이 조용히 어긋난다. */
    await atEndOf(page, 'empty', (await line.textContent()) ?? '');
    await page.keyboard.press('Enter');
    /*
     * **The line, not a pause.** A fixed wait after Enter is a check that passes on an idle machine
     * and fails in a full run — measured, twice, on this one: the transaction had not committed and
     * the count was still 1. What the check is about is whether Enter makes a line, so it waits for
     * the line.
     */
    await expect.poll(() => inside()).toBe(2);

    /**
     * **The caret has to have arrived in the new line before the second Enter.**
     *
     * A fixed pause is a check that passes on an idle machine: this one passed alone and failed in a
     * full run with three other suites on the same box, because the Enter landed while the caret was
     * still in the paragraph above and split *that* one again. What the check is about is whether an
     * empty last line lifts out of a quotation — not how fast a transaction commits.
     */
    await caretInEmpty(page, 'empty');
    await page.keyboard.press('Enter');
    /* Two: out. The quote keeps what was written and the empty line becomes the body's. */
    await expect.poll(() => inside()).toBe(1);
    expect(await kindsIn(page, 'empty')).toContain('BLOCKQUOTE P');
  });

  test('holds a block a caret cannot enter, and lets go of it for words', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1400 });
    await ready(page);
    const held = page.locator('[data-case="post"]');
    await held.locator('[data-note-body] p').first().click();
    await page.keyboard.press('End');
    for (const one of ['insertPicture', 'insertTableBlock', 'insertRule', 'insertCode']) {
      await held.locator(`[data-note-control="${one}"]`).click();
      if (one === 'insertTableBlock') {
        await page.waitForTimeout(150);
        await held.locator('[data-note-pick-cell="3:2"]').click();
      }
      await page.waitForTimeout(350);
    }

    /**
     * **A click had one answer and a body needs two.**
     *
     * In a document a click puts a caret somewhere and that is the whole of it. A body is not only
     * words: a picture, a table, a rule and a code block are things a reader **points at**, and a
     * caret has nowhere to go in any of them. Without a second answer a note could put four kinds of
     * block in and never touch one again — no file, no move, no delete. Measured: clicking a picture
     * did nothing at all.
     */
    const press = async (selector: string) => {
      const one = held.locator(selector).first();
      await one.scrollIntoViewIfNeeded();
      const box = (await one.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + Math.max(1, box.height / 2));
      await page.waitForTimeout(300);
      return held.locator('[data-note-picked]').evaluateAll((all) => all.map((each) => each.tagName).join(','));
    };

    expect(await press('.on-picture')).toBe('IMG');
    /*
     * **A table with nothing in it has no size**, and there were no rules for one: a fresh 2×2 drew
     * as a `<table>` of empty cells, which is a box of zero height — so a click at its centre landed
     * on the body behind it. Reported as *테이블 추가가 안됨*, and it was added every time.
     */
    expect(await press('table')).toBe('TABLE');
    /*
     * And a rule is **one pixel**, which is not a target. The element is eleven pixels of row with
     * one pixel of ink drawn inside it — the same trade every editor makes.
     */
    expect(await press('hr')).toBe('HR');
    expect(await press('pre')).toBe('PRE');

    /* Delete takes the held block, which is the first thing a reader tries on one. */
    await press('.on-picture');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(400);
    await expect(held.locator('.on-picture')).toHaveCount(0);

    /* And words still take the caret: a paragraph is written in, not pointed at. */
    await held.locator('[data-note-body] p').first().click();
    await page.waitForTimeout(300);
    await expect(held.locator('[data-note-picked]')).toHaveCount(0);
  });

  test('lets a player be held, which a player will not allow by itself', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1400 });
    await ready(page);
    const held = page.locator('[data-case="post"]');
    await held.locator('[data-note-body] p').first().click();
    await page.keyboard.press('End');
    await held.locator('[data-note-control="insertEmbed"]').click();
    await page.waitForTimeout(400);

    /**
     * **An `<iframe>` is a document of its own and never hands a click to the page around it** — and
     * a `<video controls>` has its own control bar with the same effect. So the two blocks a reader
     * is most likely to want to configure were the two they could not select: the strip went on
     * describing whatever was held before.
     *
     * The sid is on a holder now and the player inside it is drawn rather than pressed, which is the
     * ordinary answer and worth stating: an editing surface takes the clicks, a published page gives
     * them away.
     */
    const one = held.locator('.on-embed-holder').first();
    const box = (await one.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    await expect(held.locator('[data-note-block]')).toHaveAttribute('data-note-block', 'mediaEmbed');

    /* And what it is asked: the provider and the **id**, which survives a provider moving its URLs. */
    const id = held.locator('[data-note-block] [data-note-field="id"]');
    await id.fill('dQw4w9WgXcQ');
    await id.press('Enter');
    await page.waitForTimeout(400);
    await expect(held.locator('.on-embed')).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  test('gives a picture a file, which is the whole of why it can be held', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1400 });
    await ready(page);
    const held = page.locator('[data-case="post"]');
    await held.locator('[data-note-body] p').first().click();
    await page.keyboard.press('End');
    await held.locator('[data-note-control="insertPicture"]').click();
    await page.waitForTimeout(400);

    /*
     * A picture arrives as a placeholder because `src` is required and a reader has not chosen one
     * yet. Without somewhere to give it a file, 이미지 is a button that puts a grey rectangle in a
     * post forever — *이미지나 동영상은 파일을 넣을 수 있어야하고*.
     */
    const img = held.locator('.on-picture').first();
    expect((await img.getAttribute('src')) ?? '').toContain('svg+xml');

    const box = (await img.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    /* The **input**, not the button: no amount of clicking a button hands a browser a file. */
    await held.locator('[data-note-file="src"]').setInputFiles({
      name: 'a.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFElEQVR4nGP8//8/AzJgYkAFRPMBRakCA8FT1yAAAAAASUVORK5CYII=',
        'base64'
      )
    });
    await page.waitForTimeout(600);
    expect((await img.getAttribute('src')) ?? '').toContain('data:image/png;base64,');
    /* Four pixels of picture, drawn four pixels wide — the file went in, not just the string. */
    expect(Math.round((await img.boundingBox())!.width)).toBe(4);

    /* And the words for it, which is the commonest accessibility fault a post has. */
    const alt = held.locator('[data-note-block] [data-note-field="alt"]');
    await alt.fill('네 픽셀');
    await alt.press('Enter');
    await page.waitForTimeout(400);
    await expect(img).toHaveAttribute('alt', '네 픽셀');
  });

  test('asks how many cells before making the table, and then changes it', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1400 });
    await ready(page);
    const held = page.locator('[data-case="post"]');
    await held.locator('[data-note-body] p').first().click();
    await page.keyboard.press('End');

    /*
     * *테이블은 셀 선택으로 몇칸인지 드래그 해서 선택해야한느거 아니니?* — and the reason is not that
     * it looks familiar: a fixed 2×2 makes a reader's first act after inserting a table be adding
     * rows to it.
     */
    await held.locator('[data-note-control="insertTableBlock"]').click();
    await page.waitForTimeout(200);
    await held.locator('[data-note-pick-cell="4:3"]').hover();
    await expect(held.locator('[data-note-pick-said]')).toHaveText('4 × 3');
    await expect(held.locator('[data-note-pick-cell][data-on]')).toHaveCount(12);
    await held.locator('[data-note-pick-cell="4:3"]').click();
    await page.waitForTimeout(500);
    await expect(held.locator('[data-note-pick]')).toHaveCount(0);

    const table = held.locator('table').first();
    const size = async () =>
      `${await table.locator('tr').count()}×${await table.locator('tr').first().locator('th,td').count()}`;
    expect(await size()).toBe('4×3');

    /**
     * And then the four acts — **the shared ones**. They were `addNoteRow` and three siblings for two
     * hours, registered in `office-note` over operations *"the model has and nothing calls"*, until
     * `three-agree.test.ts` pointed out that `@barocss/extensions` registers them and the other three
     * products all declare them. Four new commands over six that were there.
     *
     * All of them read **the cell the caret is in**, which is why a table is the one held block that
     * keeps its caret.
     */
    await table.locator('th').first().click();
    await page.waitForTimeout(300);
    await expect(held.locator('[data-note-act="insertRowBelow"]')).toBeEnabled();
    await held.locator('[data-note-act="insertRowBelow"]').click();
    await page.waitForTimeout(400);
    expect(await size()).toBe('5×3');

    await table.locator('th').first().click();
    await page.waitForTimeout(250);
    await held.locator('[data-note-act="insertColumnRight"]').click();
    await page.waitForTimeout(400);
    expect(await size()).toBe('5×4');

    await table.locator('tr').nth(1).locator('td').first().click();
    await page.waitForTimeout(250);
    await held.locator('[data-note-act="deleteRow"]').click();
    await page.waitForTimeout(400);
    expect(await size()).toBe('4×4');

    await table.locator('th').nth(1).click();
    await page.waitForTimeout(250);
    await held.locator('[data-note-act="deleteColumn"]').click();
    await page.waitForTimeout(400);
    expect(await size()).toBe('4×3');
  });

  /**
   * **셀 두 개를 말할 수 있는가** — 표의 여덟 가지 중 둘이 이것을 필요로 한다.
   *
   * 여섯은 *캐럿이 있는 셀* 을 읽으면 되고, 합치기는 정의상 두 번째 셀이 있어야 한다. 그것을 말하는
   * 유일한 방법이 셀을 가로질러 끄는 것인데, 그 제스처가 `office-word` 안에 있어서 표를 가진 제품
   * 넷 중 Word 와 Slides 만 닿았다. `office-text` 로 옮기고 `note-view` 가 자기 컨테이너에 설치한다.
   *
   * 그리고 `extensions/table.ts` 가 `cell` 선택을 못 알아보고 있었다 — `cell` 은 이 명령 하나를
   * 위해 있는 선택 종류인데 `_selectedCellRange` 가 `type !== 'range'` 로 버렸다. Word 에서 되던
   * 것은 `office-word/table-commands.ts` 가 양 끝 셀 id 를 따로 넘겨 줬기 때문이다.
   */
  test('takes two cells by dragging across them, and merges them', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1400 });
    await ready(page);
    const held = page.locator('[data-case="post"]');
    await held.locator('[data-note-body] p').first().click();
    await page.keyboard.press('End');

    await held.locator('[data-note-control="insertTableBlock"]').click();
    await page.waitForTimeout(200);
    await held.locator('[data-note-pick-cell="2:2"]').click();
    await page.waitForTimeout(500);

    const table = held.locator('table').first();
    const cells = () => table.locator('th,td');
    const before = await cells().count();
    expect(before, '2×2 는 네 칸입니다').toBe(4);

    /*
     * **먼저 한 번 눌러 잡는다.** 잡히지 않은 블록을 누르면 그 누름이 프레임을 만들고 레이아웃이
     * 바뀐다 — 미리 잰 좌표가 그 순간부터 표가 아니라 본문 문단을 가리킨다. 재는 것과 끄는 것 사이에
     * 레이아웃이 움직이면 안 되므로, 잡는 누름을 따로 쓴다.
     */
    await table.locator('th').first().click();
    await page.waitForTimeout(300);

    // 첫 행의 두 칸을 가로질러 끈다.
    const one = await table.locator('th').first().boundingBox();
    const two = await table.locator('th').nth(1).boundingBox();
    expect(one && two, '표의 첫 행이 그려지지 않았습니다').toBeTruthy();

    await page.mouse.move(one!.x + one!.width / 2, one!.y + one!.height / 2);
    await page.mouse.down();
    await page.mouse.move(two!.x + two!.width / 2, two!.y + two!.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // 둘 다 칠해진다 — 그 표시가 `office-text/text.css` 의 것이다.
    await expect(table.locator('[data-cell-selected]')).toHaveCount(2);

    /*
     * **그리고 이 노트에서만.** `installCellSelection` 은 인스턴스마다 하나이고 `container.contains`
     * 로 자기 것만 듣는다 — 그것이 이 구조의 주장이므로 여기서 묻는다. 셋이 떠 있고 칠해진 칸은 둘,
     * 둘 다 이 노트 안이다.
     */
    await expect(page.locator('.w-table-handle'), '노트마다 표 핸들이 하나여야 합니다').toHaveCount(3);
    await expect(page.locator('[data-cell-selected]')).toHaveCount(2);
    await expect(
      held.locator('[data-cell-selected]'),
      '칠해진 칸이 이 노트 밖에 있습니다'
    ).toHaveCount(2);

    const merge = held.locator('[data-note-act="mergeCells"]');
    await expect(merge).toBeEnabled();
    await merge.click();
    await page.waitForTimeout(400);

    // 두 칸이 하나가 되고, 남은 것이 두 열을 덮는다.
    await expect(cells()).toHaveCount(before - 1);
    const spans = await cells().evaluateAll((els) => els.map((el) => el.getAttribute('colspan')));
    expect(spans, '합쳐진 셀이 두 열을 덮지 않습니다').toContain('2');
  });

  /**
   * **표에서 Tab 이 다음 칸으로 간다** — 그리고 이게 오래 안 됐다.
   *
   * `nextCell` 은 공용 `TableExtension` 이 등록하므로 표를 가진 넷이 다 갖는데, **키를 묶는 곳이
   * `word-keymap.ts` 뿐이었다.** 브라우저에서 쟀다: 노트의 표에서 Tab 을 누르면 선택이 그대로이고,
   * 표 크기도 그대로이고, 다음 글자가 **같은 칸**에 들어갔다.
   *
   * ## 그리고 그것만이 아니었다
   *
   * 같이 잰 것: **표를 넣는 순간 모델 선택이 `bTableHeader`(구조 노드)에 앉고** DOM 선택은 첫 칸의
   * 런에 앉는다. `addChild` 의 `selectionAfter` 가 `content[0]` 을 한 칸만 보고 그것을
   * `firstTextNodeId` 라 불렀기 때문이다 — 문단은 `content[0]` 이 곧 글자라 맞고 표는 헤더다.
   *
   * 그 둘이 겹쳐서, **키를 묶기만 해도 안 됐을 것이다**: `nextCell` 은 캐럿에서 셀을 찾고
   * (`findAncestorCell`), 캐럿이 헤더에 있으면 `null` 을 받는다. 그리고 칸을 클릭해도 안 고쳐진다 —
   * DOM 선택이 이미 그 자리라 `selectionchange` 가 뜨지 않는다(0회를 셌다).
   *
   * 노트의 툴바가 그것을 가려 왔다: 눌린 칸을 `cellId` 로 **명시적으로** 넘긴다
   * (`note-view.tsx` 의 `const on = { nodeId: sid, cellId: cell }`). 그래서 행 추가 단추는 되고
   * 키보드는 안 됐다. **단추가 있는 길과 키보드의 길이 다르면, 단추가 결함을 가린다.**
   */
  test('moves to the next cell on Tab, and grows the table past the last one', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1400 });
    await ready(page);
    const held = page.locator('[data-case="post"]');
    await held.locator('[data-note-body] p').first().click();
    await page.keyboard.press('End');

    await held.locator('[data-note-control="insertTableBlock"]').click();
    await page.waitForTimeout(200);
    await held.locator('[data-note-pick-cell="2:2"]').click();
    await page.waitForTimeout(500);

    const table = held.locator('table').first();
    const cells = () => table.locator('th,td');
    expect(await cells().count(), '2×2 는 네 칸입니다').toBe(4);

    /**
     * **표를 넣은 직후의 캐럿이 첫 칸의 글자에 있어야 한다.**
     *
     * 이것이 `addChild` 의 수정이 지키는 것이고, 아래의 Tab 이 성립하는 전제다. 클릭으로 고쳐지지
     * 않으므로(위를 보라) 넣은 순간에 맞아야 한다.
     */
    const caretStype = () =>
      page.evaluate(() => {
        type Held = {
          __notes: Record<string, { editor: { selection?: { startNodeId?: string }; dataStore: { getNode: (id: string) => { stype?: string; parentId?: string } | undefined } } }>;
        };
        const ed = (window as unknown as Held).__notes.post.editor;
        const sid = ed.selection?.startNodeId;
        if (!sid) return '(선택 없음)';
        const node = ed.dataStore.getNode(sid);
        const parent = node?.parentId ? ed.dataStore.getNode(node.parentId) : undefined;
        return `${node?.stype}<${parent?.stype}`;
      });

    expect(await caretStype(), '넣은 직후 캐럿이 첫 칸의 글자에 없습니다').toBe('inline-text<bTableHeaderCell');

    /* 첫 칸에 쓰고, Tab, 둘째 칸에 쓴다. 다른 칸에 들어가면 글자가 그것을 말한다. */
    await page.keyboard.type('가');
    await page.waitForTimeout(300);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await page.keyboard.type('나');
    await page.waitForTimeout(400);

    const said = await cells().allInnerTexts();
    expect(said[0].replace(/\uFEFF/g, ''), '첫 칸이 가 가 아닙니다').toBe('가');
    expect(said[1].replace(/\uFEFF/g, ''), 'Tab 이 다음 칸으로 가지 않았습니다').toBe('나');

    /*
     * **마지막 칸을 지나면 표가 자란다** — Word·스프레드시트가 하는 것이고 `nextCell` 이 이미 그렇게
     * 되어 있었다. 닿을 키가 없어서 확인된 적이 없었다.
     */
    await held.locator('table tr').nth(1).locator('td').last().click();
    await page.waitForTimeout(300);
    await page.keyboard.type('끝');
    await page.waitForTimeout(300);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    expect(await cells().count(), '마지막 칸에서 Tab 이 표를 늘리지 않았습니다').toBe(6);
  });

  /**
   * **잡은 블록을 끌어서 옮긴다** — 위/아래 단추가 한 칸씩 하던 것을 한 번에.
   *
   * **손잡이는 블록의 왼쪽에 있고, 스트립이 아니다.** 첫 판은 스트립에 뒀다 — 위/아래 단추가 거기
   * 있으므로 일관돼 보였다. 재보고 알았다: **문단은 잡히지 않는다.** 클릭하면 캐럿이 들어가고
   * (`holdsWriting`), 스트립은 그림·표처럼 캐럿을 담지 않는 블록에만 뜬다. 그런데 독자가 가장
   * 옮기고 싶은 것은 문단이다. 이 검사가 *손잡이가 없습니다* 로 그것을 먼저 말했다.
   *
   * 자리는 `reorderIndexAt`(`office-canvas`, `column`)이 센다. 그 함수는 **옮기는 것을 빼고** 세고,
   * 그게 `moveNode` 가 하는 일과 같아서 두 번 보정하지 않는다.
   */
  test('drags a held block to a new place, and Escape puts it back', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1400 });
    await ready(page);
    const held = page.locator('[data-case="post"]');
    const body = held.locator('[data-note-body]');

    /** 본문의 블록들을 글자로 — 순서가 바뀌었는지 읽는 유일한 정직한 방법. */
    const order = async () =>
      (await body.evaluate((el) => {
        /* 블록은 뷰의 콘텐츠 층 안, `on-doc`(= note 노드)의 자식이다 — 두 층 깊다. */
        const doc = el.querySelector('.on-doc');
        return [...(doc?.children ?? [])]
          .filter((one) => one.hasAttribute('data-bc-sid'))
          .map((one) => (one.textContent ?? '').replace(/\uFEFF/g, '').slice(0, 12));
      })) as string[];

    const before = await order();
    expect(before.length, '본문에 블록이 셋 이상 있어야 이 검사가 뜻을 갖습니다').toBeGreaterThan(2);

    /* 첫 블록에 캐럿을 넣는다 — 그러면 그 블록 옆에 손잡이가 선다. */
    await body.locator('.on-doc > [data-bc-sid]').first().click();
    await page.waitForTimeout(350);
    const grip = held.locator('[data-note-grip]');
    await expect(grip, '캐럿이 든 블록에 손잡이가 없습니다').toHaveCount(1);
    expect(
      await grip.getAttribute('data-note-grip'),
      '손잡이가 캐럿이 든 블록의 것이 아닙니다'
    ).toBe(await body.locator('.on-doc > [data-bc-sid]').first().getAttribute('data-bc-sid'));

    const from = await grip.boundingBox();
    const third = await body.locator('.on-doc > [data-bc-sid]').nth(2).boundingBox();
    expect(from && third, '손잡이와 셋째 블록이 그려지지 않았습니다').toBeTruthy();

    /* 셋째 블록의 아래쪽 절반으로 끈다 — 그 아래가 놓일 자리다. */
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(third!.x + third!.width / 2, third!.y + third!.height * 0.75, { steps: 10 });
    await page.waitForTimeout(150);

    /* 끄는 동안 놓일 자리에 선이 있어야 한다 — 없으면 독자는 어디로 가는지 모른다. */
    await expect(held.locator('[data-note-landing]'), '놓일 자리를 그리는 선이 없습니다').toHaveCount(1);

    await page.mouse.up();
    await page.waitForTimeout(500);

    await expect(held.locator('[data-note-landing]'), '놓은 뒤에 선이 남았습니다').toHaveCount(0);

    const after = await order();
    expect(after.length, '블록이 사라지거나 늘었습니다').toBe(before.length);
    expect(after, '순서가 바뀌지 않았습니다').not.toEqual(before);
    expect(after[0], '첫 블록이 그대로 첫 자리에 있습니다').not.toBe(before[0]);
    expect(after.includes(before[0]), '끌던 블록이 사라졌습니다').toBe(true);

    /**
     * **Escape 로 물러선다.** `dragGesture` 의 `abort` 가 그것이고, 그게 없으면 되돌릴 방법 없이
     * 미리 보기만 끊겨 화면이 거짓말을 한다.
     */
    const now = await order();
    await body.locator('.on-doc > [data-bc-sid]').first().click();
    await page.waitForTimeout(350);
    const again = await held.locator('[data-note-grip]').boundingBox();
    const last = await body.locator('.on-doc > [data-bc-sid]').last().boundingBox();

    await page.mouse.move(again!.x + again!.width / 2, again!.y + again!.height / 2);
    await page.mouse.down();
    await page.mouse.move(last!.x + last!.width / 2, last!.y + last!.height * 0.75, { steps: 10 });
    await page.waitForTimeout(150);
    await expect(held.locator('[data-note-landing]')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await expect(held.locator('[data-note-landing]'), 'Escape 뒤에 선이 남았습니다').toHaveCount(0);
    await page.mouse.up();
    await page.waitForTimeout(300);

    expect(await order(), 'Escape 로 물러섰는데 순서가 바뀌었습니다').toEqual(now);
  });

  test('offers every held block what it needs, and nothing it does not', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (one) => errors.push(String(one).slice(0, 140)));

    await page.setViewportSize({ width: 1400, height: 1400 });
    await ready(page);
    const held = page.locator('[data-case="post"]');

    /**
     * **잡을 수 있는 다섯 종류를 하나씩 잡아 보고, 무엇을 내주는지 셉니다.**
     *
     * `NOTE_FIELDS`(묻는 것)와 `NOTE_ACTS`(시키는 것)는 선언이고 단위검사가 그 모양을 봅니다. 이건
     * 다른 질문입니다 — **선언한 것이 화면에 실제로 나오는가.** 두 선언이 옳고 `pickedAt` 이 그 종류를
     * 못 잡으면 아무것도 안 나오고, 단위검사는 그것을 못 봅니다.
     *
     * 표의 여섯은 특히 이유가 있습니다: 하루 동안 `office-note` 자신의 것이었다가 공유 명령으로
     * 바뀌었고(`three-agree.test.ts` 가 찾았습니다), 바뀐 뒤 실제로 도는지는 여기서만 보입니다.
     */
    await held.locator('[data-note-body] p').first().click();
    await page.keyboard.press('End');
    for (const one of ['insertPicture', 'insertRule', 'insertCode', 'insertEmbed']) {
      await held.locator(`[data-note-control="${one}"]`).click();
      await page.waitForTimeout(350);
    }
    await held.locator('[data-note-control="insertTableBlock"]').click();
    await page.waitForTimeout(150);
    await held.locator('[data-note-pick-cell="3:2"]').click();
    await page.waitForTimeout(500);

    const hold = async (selector: string) => {
      const one = held.locator(selector).first();
      await one.scrollIntoViewIfNeeded();
      const box = (await one.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + Math.max(2, box.height / 2));
      await page.waitForTimeout(350);
    };
    const acts = () =>
      held.locator('[data-note-act]').evaluateAll((all) => all.map((one) => one.getAttribute('data-note-act')!));
    const asks = () =>
      held
        .locator('[data-note-block] [data-note-field], [data-note-block] [data-note-file]')
        .evaluateAll((all) =>
          all.map((one) => one.getAttribute('data-note-field') ?? `file:${one.getAttribute('data-note-file')}`)
        );

    /* 위로/아래로 belong to *being held*, so every kind has them and only a table has more. */
    const moves = ['moveNoteBlockUp', 'moveNoteBlockDown'];

    await hold('.on-picture');
    await expect(held.locator('.on-block-what')).toHaveText('이미지');
    expect(await asks()).toEqual(['file:src', 'alt']);
    expect(await acts()).toEqual(moves);

    await hold('hr');
    await expect(held.locator('.on-block-what')).toHaveText('구분선');
    /* 구분선 is the one exemption the declaration check names: a line has nothing to be asked. */
    expect(await asks()).toEqual([]);

    await hold('pre');
    expect(await asks()).toEqual(['language']);

    await hold('.on-embed-holder');
    await expect(held.locator('.on-block-what')).toHaveText('넣은 것');
    expect(await asks()).toEqual(['provider', 'id']);

    await hold('table');
    await expect(held.locator('.on-block-what')).toHaveText('표');
    expect(await acts()).toEqual([
      'insertRowAbove',
      'insertRowBelow',
      'deleteRow',
      'insertColumnLeft',
      'insertColumnRight',
      'deleteColumn',
      /*
       * 여덟이지 여섯이 아니다. 이 둘은 *두 셀* 을 말할 수 있어야 하고, 그 말을 만드는 제스처
       * (`installCellSelection`)가 `office-word` 안에 있어서 한동안 목록에 없었다 — 표를 가진 제품
       * 넷 중 둘만 닿았다는 뜻이다.
       */
      'mergeCells',
      'splitCell',
      ...moves
    ]);

    /* And the six run — the shared commands, over the model's own grid walk. */
    const table = held.locator('table').first();
    const size = async () =>
      `${await table.locator('tr').count()}×${await table.locator('tr').first().locator('th,td').count()}`;
    const inCell = async () => {
      await table.locator('tr').nth(1).locator('th,td').first().click();
      await page.waitForTimeout(250);
    };

    expect(await size()).toBe('3×2');
    for (const [act, wanted] of [
      ['insertRowAbove', '4×2'],
      ['insertRowBelow', '5×2'],
      ['insertColumnLeft', '5×3'],
      ['insertColumnRight', '5×4'],
      ['deleteRow', '4×4'],
      ['deleteColumn', '4×3']
    ] as const) {
      await inCell();
      await expect(held.locator(`[data-note-act="${act}"]`)).toBeEnabled();
      await held.locator(`[data-note-act="${act}"]`).click();
      await page.waitForTimeout(400);
      expect(await size(), act).toBe(wanted);
    }

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('leaves a table alone when the caret is in it, which Backspace did not', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1400 });
    await ready(page);
    const held = page.locator('[data-case="post"]');
    await held.locator('[data-note-body] p').first().click();
    await page.keyboard.press('End');
    await held.locator('[data-note-control="insertTableBlock"]').click();
    await page.waitForTimeout(150);
    await held.locator('[data-note-pick-cell="3:2"]').click();
    await page.waitForTimeout(500);

    /**
     * **Being pointed at and having no text are two different facts**, and treating them as one
     * deleted a reader's table. Measured in six lines: insert a table, click a cell, type 이름, press
     * Backspace — and the whole table went, because the table was held from the moment the cell was
     * clicked and the held-block key handler answered for it.
     */
    await held.locator('table th').first().click();
    await page.waitForTimeout(300);
    await page.keyboard.type('이름');
    await page.waitForTimeout(400);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);

    await expect(held.locator('table')).toHaveCount(1);
    await expect(held.locator('table th').first()).toHaveText('이');
  });

  test('moves a held block, which cost the file it was given to redo', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1400 });
    await ready(page);
    const held = page.locator('[data-case="post"]');
    const order = () =>
      held.locator('[data-note-body] .on-doc > *').evaluateAll((all) => all.map((one) => one.tagName).join(' '));

    await held.locator('[data-note-body] p').first().click();
    await page.keyboard.press('End');
    await caretIn(page, 'post');
    await held.locator('[data-note-control="insertRule"]').click();
    await page.waitForTimeout(400);
    expect(await order()).toBe('H2 P HR P');

    const rule = held.locator('hr').first();
    const box = (await rule.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);

    await held.locator('[data-note-act="moveNoteBlockUp"]').click();
    await page.waitForTimeout(400);
    expect(await order()).toBe('H2 HR P P');

    await held.locator('[data-note-act="moveNoteBlockUp"]').click();
    await page.waitForTimeout(400);
    expect(await order()).toBe('HR H2 P P');
    /* At the top there is no up, and a button that runs and changes nothing is pressed twice. */
    await expect(held.locator('[data-note-act="moveNoteBlockUp"]')).toBeDisabled();

    await held.locator('[data-note-act="moveNoteBlockDown"]').click();
    await page.waitForTimeout(400);
    expect(await order()).toBe('H2 HR P P');
  });

  test('holds twelve at once, and lets go of every one of them', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await ready(page);

    /**
     * **여러 인스턴스를 동시에 생성해서 관리해도 문제가 없는지.**
     *
     * Two side by side answers *do the sessions stay apart*. It does not answer what a host does with
     * a list of posts: make twelve, take six away, make them all again. Each session builds a store,
     * a schema, an editor and a view, and hangs a listener on the editor — and anything `close()`
     * misses is invisible at two and obvious at forty, which is the shape of fault that ships.
     */
    /* Nothing is mounted here until a check asks for it — see `Many`. */
    await expect(page.locator('[data-case="many"] [data-note-editor]')).toHaveCount(0);
    await page.locator('[data-many="twelve"]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-case="many"] .on-doc').length === 12);
    const many = page.locator('[data-case="many"] [data-note-editor]');
    await expect(many).toHaveCount(12);
    await expect(page.locator('[data-case="many"] [data-note-bar]')).toHaveCount(12);

    /* Nothing left behind. Three full remounts of twelve, and the page is the same size it was. */
    const nodes = () => page.evaluate(() => document.querySelectorAll('*').length);
    const before = await nodes();
    for (let round = 0; round < 3; round += 1) {
      await page.locator('[data-many="again"]').click();
      await page.waitForTimeout(700);
    }
    await expect(many).toHaveCount(12);
    expect(await nodes()).toBe(before);

    /* And they come and go one at a time, which is what a drawer opening another row does. */
    await page.locator('[data-many="less"]').click();
    await expect(many).toHaveCount(11);
    await page.locator('[data-many="more"]').click();
    await expect(many).toHaveCount(12);
  });

  test('keeps twelve sessions apart, not just two', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await ready(page);
    await page.locator('[data-many="twelve"]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-case="many"] .on-doc').length === 12);

    const cases = page.locator('[data-case^="many-"]');
    const fifth = cases.nth(4);

    await fifth.locator('[data-note-body] p').first().click();
    await caretIn(page, (await fifth.getAttribute('data-case'))!);
    await page.keyboard.press('End');
    await page.keyboard.type(' 여기만');
    await page.waitForTimeout(300);
    await page.waitForTimeout(400);

    /* The words went into one body and no other. */
    const written = await cases.evaluateAll((all) =>
      all.map((one) => ((one.querySelector('.on-doc p')?.textContent ?? '').includes('여기만') ? 'Y' : '.')).join('')
    );
    expect(written).toBe('....Y.......');

    /* And a mark applied in one leaves the other eleven's bars saying what they said. */
    for (let step = 0; step < 5; step += 1) await page.keyboard.press('Shift+ArrowLeft');
    await rangeIn(page, (await fifth.getAttribute('data-case'))!);
    await fifth.locator('[data-note-control="toggleBold"]').click();
    await page.waitForTimeout(500);

    /*
     * Drawn as `mark-bold`, not as `<strong>` — the shared text renderers draw a mark as a span
     * carrying the style, which is what lets a mark be a colour or a size as easily as a weight.
     */
    await expect(fifth.locator('.mark-bold')).toHaveCount(1);
    await expect(page.locator('[data-case="many"] .mark-bold')).toHaveCount(1);

    const states = await cases.evaluateAll((all) =>
      all.map((one) => one.querySelector('[data-note-control="toggleBold"]')?.getAttribute('data-state') ?? '?')
    );
    expect(states).toEqual(['off', 'off', 'off', 'off', 'on', 'off', 'off', 'off', 'off', 'off', 'off', 'off']);
  });

  test('acts on a selection that crosses blocks, which it made and then ignored', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1400 });
    await ready(page);
    const held = page.locator('[data-case="post"]');
    const blocks = () => held.locator('[data-note-body] .on-doc > *').count();

    /**
     * **지금 selection 도구가 제대로 없는데** — and the measurement was worse than the wording: the
     * selection was **made correctly** and everything that consumed one got it wrong.
     *
     * | | 무엇이 일어났나 |
     * |---|---|
     * | 굵게 | the first two runs took the mark and the last came back bare |
     * | Backspace | the blocks stayed as they were, with the right characters in the wrong shape |
     * | 글자 치기 | the selection was not replaced — the character was simply inserted |
     *
     * Three symptoms, four causes, none of them in the same file. `Ctrl+A` rather than a drag,
     * because a drag does not produce a selection under this driver at all — measured within a single
     * paragraph too, so it is the harness and not the product.
     */
    const all = async () => {
      await held.locator('[data-note-body] p').first().click();
      await page.waitForTimeout(150);
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(300);
    };

    await all();
    await held.locator('[data-note-control="toggleBold"]').click();
    await page.waitForTimeout(600);

    /**
     * **Every run, including the last.** `toggleMark` marked the two ends and skipped everything
     * between — the walk `deleteText` has, six hundred lines up in the same file, was simply absent.
     * And then the last run was marked by the command and **unmarked by the view**: a MutationObserver
     * read the render's own output as a markup gesture and answered a *state* with a *toggle*.
     */
    const marks = await page.evaluate(() => {
      /*
       * The session's shape said **once**, the way the two waits above say it. Inside a browser
       * function there is no `Editor` to import, so naming what `window` holds is the honest form;
       * casting what it holds, again, is not — and `every-cast-counted` reads this file.
       */
      const editor = (window as never as {
        __notes: Record<
          string,
          {
            editor: {
              getRootId: () => string;
              dataStore: {
                getNode: (sid: string) => { text?: unknown; marks?: unknown[]; content?: string[] } | undefined;
              };
            };
          }
        >;
      }).__notes.post.editor;
      const out: number[] = [];
      const dig = (sid: string) => {
        const node = editor.dataStore.getNode(sid);
        if (!node) return;
        if (typeof node.text === 'string') return void out.push((node.marks ?? []).length);
        for (const one of node.content ?? []) dig(one);
      };
      dig(editor.getRootId());
      return out;
    });
    expect(marks.length).toBeGreaterThanOrEqual(3);
    expect(marks.filter((one) => one > 0).length).toBe(marks.length);

    /* And Backspace joins what it crossed rather than leaving the shape it found. */
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    await all();
    expect(await blocks()).toBeGreaterThan(1);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(700);
    expect(await blocks()).toBe(1);
  });

  test('crosses blocks in one body of twelve, and leaves the other eleven alone', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await ready(page);
    await page.locator('[data-many="twelve"]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-case="many"] .on-doc').length === 12);

    /**
     * **한 몸통에서 블록을 가로지르는 선택이, 열둘이 떠 있을 때도 그 몸통에만 듣는가.**
     *
     * The two halves were checked apart and never together: *twelve sessions stay apart* types one
     * word into the fifth, and *acts on a selection that crosses blocks* drags across three blocks of
     * a single note. What neither asked is whether a **range** — which the four faults this round
     * fixed all lived in — stays inside its own instance.
     *
     * It is the case with the most ways to be wrong: `Ctrl+A` is the browser's, the mark walks runs
     * by sid, the delete moves blocks between parents, and every one of those could reach into a
     * document it was never given.
     */
    const cases = page.locator('[data-case^="many-"]');
    const eighth = cases.nth(7);
    const id = (await eighth.getAttribute('data-case'))!;

    const blocksIn = (one: typeof eighth) => one.locator('[data-note-body] .on-doc > *').count();
    const before = await cases.evaluateAll((all) => all.map((one) => one.querySelectorAll('.on-doc > *').length));
    expect(before[7]).toBeGreaterThan(1);

    await eighth.locator('[data-note-body] p').first().click();
    await caretIn(page, id);
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(300);
    await crossRangeIn(page, id);

    /* 굵게 — every run of that body and no run of any other. */
    await eighth.locator('[data-note-control="toggleBold"]').click();
    await page.waitForTimeout(600);
    const marked = await cases.evaluateAll((all) => all.map((one) => one.querySelectorAll('.mark-bold').length));
    expect(marked.filter((n) => n > 0).length, JSON.stringify(marked)).toBe(1);
    expect(marked[7]).toBeGreaterThan(0);

    /* And Backspace joins that body's blocks into one, leaving the other eleven as they were. */
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    await eighth.locator('[data-note-body] p').first().click();
    await caretIn(page, id);
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(300);
    await crossRangeIn(page, id);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(700);

    expect(await blocksIn(eighth)).toBe(1);
    const after = await cases.evaluateAll((all) => all.map((one) => one.querySelectorAll('.on-doc > *').length));
    for (let at = 0; at < after.length; at += 1) {
      if (at === 7) continue;
      expect(after[at], `${at}번째 몸통이 함께 바뀌었습니다`).toBe(before[at]);
    }
  });

  test('every control on the bar changes something, whichever selection it is given', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (one) => { if (one.type() === 'error') errors.push(one.text().slice(0, 140)); });
    page.on('pageerror', (one) => errors.push(`PAGEERROR ${String(one).slice(0, 140)}`));

    await page.setViewportSize({ width: 1200, height: 1400 });
    await ready(page);
    const held = page.locator('[data-case="post"]');

    /**
     * **선택의 모양마다 다시 눌러 봅니다.**
     *
     * *every button on the bar does what it says* presses each control once, from a **caret**. That
     * found five dead buttons the day it was written and then stopped finding anything — because a
     * caret is the one selection every command was written against.
     *
     * This gives the marks a **range that crosses a block**, which `Shift+→` makes the moment it
     * steps past the end of a run. Three of the four came back dead: the command returned `true`,
     * the model carried the mark for fifty milliseconds, and the view's MutationObserver read its own
     * redraw as a markup gesture and toggled it straight back off.
     *
     * The counting is per mark, not a total — two marks on one span is one element, so a sum cannot
     * see the second one arrive.
     */
    const shape = (one: string) => (one.startsWith('toggle') ? 'range' : 'caret');
    const controls = await held
      .locator('[data-note-control]')
      .evaluateAll((all) => all.map((each) => each.getAttribute('data-note-control')!));
    expect(controls.length).toBeGreaterThanOrEqual(15);

    const marksIn = () =>
      held.locator('[data-note-body]').evaluate((el) =>
        ['bold', 'italic', 'underline', 'strikethrough']
          .map((one) => el.querySelectorAll(`.mark-${one}`).length)
          .join(',')
      );
    const blocksIn = () => held.locator('[data-note-body] .on-doc > *').count();

    const dead: string[] = [];
    for (const one of controls) {
      await held.locator('[data-note-body] p').first().click();
      if (shape(one) === 'range') {
        for (let step = 0; step < 6; step += 1) await page.keyboard.press('Shift+ArrowRight');
        await page.waitForTimeout(200);
      }
      const wasBlocks = await blocksIn();
      const wasMarks = await marksIn();

      await held.locator(`[data-note-control="${one}"]`).click();
      /* 표 asks its size first — one press opens the grid, and the cell is the second. */
      if (one === 'insertTableBlock') {
        await page.waitForTimeout(150);
        await held.locator('[data-note-pick-cell="2:2"]').click();
      }
      await page.waitForTimeout(400);

      if ((await blocksIn()) === wasBlocks && (await marksIn()) === wasMarks) dead.push(one);
    }

    expect(dead, dead.join(' ')).toEqual([]);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('writes home on a pause, which is how a host hears about it', async ({ page }) => {
    await ready(page);
    const held = page.locator('[data-case="post"]');
    await expect(held.locator('[data-out]')).toHaveText('아직 바뀐 것 없음');

    await held.locator('[data-note-body] p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' 새 낱말');
    await page.waitForTimeout(700);

    /*
     * A host with no store of its own still hears what changed — a callback, not a write. And the
     * count is of **letters a reader wrote**: it printed `JSON.stringify(blocks).length` first, so
     * three paragraphs read as 2,636자. A number nobody can check against the screen is worse than
     * no number.
     */
    await expect(held.locator('[data-out]')).toContainText('개 블록');
    const said = (await held.locator('[data-out]').textContent()) ?? '';
    expect(Number(said.match(/·\s*(\d+)자/)?.[1] ?? 0)).toBeLessThan(400);
  });

  test('keeps two sessions apart, which one editor could not', async ({ page }) => {
    await ready(page);
    const post = page.locator('[data-case="post"]');
    const long = page.locator('[data-case="long"]');

    await post.locator('[data-note-body] p').first().click();
    /* The caret before the keys — see `caretIn`; six bodies mount here now and a click is not instant. */
    await caretIn(page, 'post');
    /*
     * Extended from where the click landed, with **no `Home` first**. `Home` is not reliable in this
     * body — pressed after a click it moves the caret once and then stops, and pressed after typing
     * it does nothing at all, in one instance as much as in twelve. Measured and written up in
     * `BACKLOG.md`; a check that depends on it is a check that fails for a reason it is not about.
     *
     * **Leftwards**, because a click lands at the end of this paragraph — 64 of 64 — and extending
     * right crosses into the next block, where 굵게 does nothing at all. That is a second recorded
     * fault and not this check's subject: a selection spanning two blocks is made correctly and then
     * ignored by every operation that consumes one. Also in `BACKLOG.md`.
     */
    for (let step = 0; step < 3; step += 1) await page.keyboard.press('Shift+ArrowLeft');
    await rangeIn(page, 'post');
    await post.locator('[data-note-control="toggleBold"]').click();
    await page.waitForTimeout(500);

    /*
     * The other bar has not moved. With one editor and two views this was impossible: one selection,
     * applied everywhere, and a caret in one body lit the other's toolbar.
     */
    await expect(post.locator('[data-note-control="toggleBold"]')).toHaveAttribute('data-state', 'on');
    await expect(long.locator('[data-note-control="toggleBold"]')).toHaveAttribute('data-state', 'off');
  });
});
