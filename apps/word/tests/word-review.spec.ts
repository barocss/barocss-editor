import { test, expect } from '@playwright/test';
import { placeCaret, settled } from './helpers';

/**
 * Working on a document with other people in mind: finding and replacing text,
 * and the comments left about it.
 *
 * Part of the browser suite for apps/word; the shared helpers are in helpers.ts.
 */

/**
 * Find and replace.
 *
 * The searching is the product's and is tested there, without a browser. What
 * only a browser can answer is whether the matches are shown where the text is,
 * whether moving between them moves, and whether replacing changes the document
 * the reader is looking at.
 */
test.describe('find', () => {
  const open = async (page: import('@playwright/test').Page, query: string) => {
    await page.goto('/');
    // Settled, not merely present. Find runs over the document as laid out, and
    // asking while the paginator is still moving text between pages gives a
    // match count on its way somewhere else — which is a race that only showed
    // up once the suite was split and the files began running side by side.
    await settled(page);
    await page.keyboard.press('Control+f');
    await expect(page.locator('.w-find-panel')).toBeVisible();
    await page.locator('.w-find-query').fill(query);
  };

  test('marks every match, and one of them as the one you are on', async ({ page }) => {
    await open(page, 'paragraph');

    await expect.poll(async () => page.locator('.w-find-hit').count()).toBeGreaterThan(1);
    // The current match is told apart from the rest: a reader pressing Next
    // needs to see where they went, not just that something matched.
    await expect(page.locator('.w-find-hit.is-current')).toHaveCount(1);
    await expect(page.locator('.w-find-count')).toContainText('1 / ');
  });

  test('moves between them, and wraps at the end', async ({ page }) => {
    await open(page, 'paragraph');
    await expect.poll(async () => page.locator('.w-find-count').textContent()).toContain('1 / ');

    const total = Number((await page.locator('.w-find-count').textContent())!.split('/')[1]);
    await page.getByLabel('Next match').click();
    await expect(page.locator('.w-find-count')).toContainText(`2 / ${total}`);

    // Backwards past the first goes to the last: a search that stopped at the
    // ends would make them dead ends.
    await page.getByLabel('Previous match').click();
    await page.getByLabel('Previous match').click();
    await expect(page.locator('.w-find-count')).toContainText(`${total} / ${total}`);
  });

  test('finds nothing where there is nothing, and says so', async ({ page }) => {
    await open(page, 'zzzznotinthedocument');
    await expect(page.locator('.w-find-count')).toHaveText('None');
    await expect(page.locator('.w-find-hit')).toHaveCount(0);
  });

  test('narrows to whole words when asked', async ({ page }) => {
    await open(page, 'page');
    const loose = await page.locator('.w-find-count').textContent();

    await page.locator('.w-find-whole').check();
    await expect.poll(async () => page.locator('.w-find-count').textContent()).not.toBe(loose);
  });

  test('replaces the one you are on, and leaves the rest', async ({ page }) => {
    await open(page, 'Pagination');
    const before = Number((await page.locator('.w-find-count').textContent())!.split('/')[1]);
    expect(before).toBeGreaterThan(1);

    await page.locator('.w-find-replacement').fill('Layout');
    await page.getByRole('button', { name: 'Replace', exact: true }).click();

    // One fewer to find, and the word is in the document.
    await expect
      .poll(async () => Number((await page.locator('.w-find-count').textContent())!.split('/')[1]))
      .toBe(before - 1);
    await expect(page.locator('.w-surface').first()).toContainText('Layout is measured');
  });

  test('replaces all of them in one edit, which one undo takes back', async ({ page }) => {
    await open(page, 'Pagination');
    const before = Number((await page.locator('.w-find-count').textContent())!.split('/')[1]);

    await page.locator('.w-find-replacement').fill('Layout');
    await page.getByRole('button', { name: 'Replace all' }).click();
    await expect(page.locator('.w-find-count')).toHaveText('None');

    // One transaction, so one undo: replacing every occurrence is one thing the
    // reader did, and a document with half of them replaced is a state nobody
    // asked for.
    await page.locator('.w-paragraph').first().click();
    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => Number((await page.locator('.w-find-count').textContent())!.split('/')[1] ?? 0))
      .toBe(before);
  });

  test('closes on Escape and takes its marks with it', async ({ page }) => {
    await open(page, 'paragraph');
    await expect.poll(async () => page.locator('.w-find-hit').count()).toBeGreaterThan(0);

    await page.locator('.w-find-query').press('Escape');
    await expect(page.locator('.w-find-panel')).toHaveCount(0);
    // The marks are drawn, not written: closing the search leaves no trace of
    // it in the document.
    await expect(page.locator('.w-find-hit')).toHaveCount(0);
  });
});

/**
 * Comments.
 *
 * A comment is two things that have to stay together: a thread among the
 * resources, and a mark over the text it is about. Reading them is tested
 * without a browser; what needs one is whether commenting anchors to what the
 * reader selected, and whether the pane and the page agree.
 */

/**
 * Comments.
 *
 * A comment is two things that have to stay together: a thread among the
 * resources, and a mark over the text it is about. Reading them is tested
 * without a browser; what needs one is whether commenting anchors to what the
 * reader selected, and whether the pane and the page agree.
 */
test.describe('comments', () => {
  const selectSome = async (page: import('@playwright/test').Page, chars = 10) => {
    await placeCaret(page, '.w-paragraph', 1);
    await page.keyboard.down('Shift');
    for (let i = 0; i < chars; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
  };

  const comment = async (page: import('@playwright/test').Page, text: string) => {
    // The pane learns about the selection from an event and re-renders; asking
    // to comment before it has is asking a button that does not know yet.
    await expect(page.getByLabel('Add comment')).toBeEnabled();
    await page.locator('.w-comment-draft').fill(text);
    await page.getByLabel('Add comment').click();
  };

  test('anchors to the selected text and shows who said it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');
    await selectSome(page);
    await comment(page, 'Is this clear?');

    await expect(page.locator('.w-comment')).toHaveCount(1);
    await expect(page.locator('.w-comment')).toContainText('Is this clear?');
    // The author is the host's to supply, so it is the host's name that shows.
    await expect(page.locator('.w-comment')).toContainText('Jinho');
    // And the text it is about is marked on the page.
    await expect(page.locator('.w-comment-hit')).toHaveCount(1);
  });

  test('can be corrected without changing who said it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');
    await selectSome(page);
    await comment(page, 'Is this clera?');

    await page.getByLabel('Edit comment').click();
    await page.getByLabel('Edit comment text').fill('Is this clear?');
    await page.getByLabel('Edit comment text').press('Enter');

    await expect(page.locator('.w-comment-text')).toHaveText('Is this clear?');
    // The words change; the name and the date do not. They record who said it
    // and when, and a comment that quietly reattributes itself is worse than
    // one nobody can fix.
    await expect(page.locator('.w-comment')).toContainText('Jinho');
    await expect(page.locator('.w-comment')).toContainText('2026-08-10');
  });

  test('collects replies under the comment they answer', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');
    await selectSome(page);
    await comment(page, 'Is this clear?');

    await page.locator('.w-comment-reply').fill('It is now');
    await page.getByLabel('Send reply').click();

    // One thread, two entries, in the order they were written.
    await expect(page.locator('.w-comment')).toHaveCount(1);
    await expect(page.locator('.w-comment-text')).toHaveCount(2);
    await expect(page.locator('.w-comment-text').nth(1)).toHaveText('It is now');
  });

  test('lets several comments cover the same words', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');

    // Two people commenting on the same phrase is the ordinary case in review,
    // not an edge one: each is anchored separately and neither disturbs the
    // other.
    await page.evaluate(async () => {
      const editor = (window as any).editor;
      const at = (start: number, end: number) => ({
        type: 'range',
        startNodeId: 'word:20',
        startOffset: start,
        endNodeId: 'word:20',
        endOffset: end,
        collapsed: false
      });
      await editor.run('insertComment', { selection: at(0, 10), text: 'First reader' });
      await editor.run('insertComment', { selection: at(5, 15), text: 'Second reader' });
      await editor.run('insertComment', { selection: at(5, 15), text: 'Third, same words' });
    });

    await expect(page.locator('.w-comment')).toHaveCount(3);
    await expect(page.locator('.w-comments-pane')).toContainText('Third, same words');
  });

  test('cannot comment on nothing', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');
    // A comment is about something. With only a caret there is nothing to
    // anchor to, and the button says so rather than making a comment that
    // points nowhere.
    await placeCaret(page, '.w-paragraph', 1);
    await expect(page.getByLabel('Add comment')).toBeDisabled();
  });

  test('resolving settles it and takes the mark off the page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');
    await selectSome(page);
    await comment(page, 'Settled?');

    await page.getByLabel('Resolve comment').click();
    await expect(page.locator('.w-comment[data-resolved="true"]')).toHaveCount(1);
    // Still there to read, but no longer marked on the text: a settled comment
    // is not something the reader is being asked about.
    await expect(page.locator('.w-comment-hit')).toHaveCount(0);
    await expect(page.locator('.w-comment')).toContainText('Settled?');
  });

  test('deleting takes the thread and the mark together', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');
    await selectSome(page);
    await comment(page, 'Never mind');

    await page.getByLabel('Delete comment').click();
    await expect(page.locator('.w-comment')).toHaveCount(0);
    // Leaving the mark would leave text highlighted as commented with nothing
    // to show when it is clicked.
    await expect(page.locator('.w-comment-hit')).toHaveCount(0);
  });

  test('keeps what somebody wrote when the text it was about goes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-sheet');
    await selectSome(page);
    await comment(page, 'About text that will not last');

    // Delete exactly what was commented on.
    await selectSome(page);
    await page.keyboard.press('Backspace');

    // The comment stays and says it has lost its place. Dropping it would
    // silently delete something a person wrote.
    await expect(page.locator('.w-comment')).toHaveCount(1);
    await expect(page.locator('.w-comment-orphan')).toBeVisible();
  });
});

test.describe('tracked changes', () => {
  test('draws a deletion rather than removing it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-deletion');

    // The whole point of tracking: the reader has to see what was taken out in
    // order to accept or reject it.
    await expect(page.locator('.w-deletion')).toHaveText('this was removed');
    await expect(page.locator('.w-deletion')).toHaveCSS('text-decoration-line', 'line-through');
  });

  test('underlines an insertion', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-insertion');
    await expect(page.locator('.w-insertion')).toHaveCSS('text-decoration-line', 'underline');
  });

  test('gives each reviewer a colour of their own', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.w-insertion');

    const colors = await page.evaluate(() => [
      getComputedStyle(document.querySelector('.w-insertion')!).color,
      getComputedStyle(document.querySelector('.w-deletion')!).color
    ]);

    expect(colors[0]).not.toBe(colors[1]);
  });

  test('names the reviewer', async ({ page }) => {
    await page.goto('/');
    // Settled first: a render patches the DOM by putting the new element in
    // before taking the old one out, so for an instant there are two of these
    // and asserting on "the" insertion is asking about a document mid-redraw.
    await settled(page);

    await expect(page.locator('.w-insertion')).toHaveAttribute('data-author', 'Jinho');
    await expect(page.locator('.w-insertion')).toHaveAttribute('title', /Jinho/);
  });
});

test.describe('reviewing tracked changes', () => {
  /** Whatever the ribbon's button for this control is called. */
  const button = (page: import('@playwright/test').Page, label: string) =>
    page.getByRole('button', { name: label, exact: true });

  const insertion = 'this was added';
  const deletion = 'this was removed';

  test('accepting an insertion keeps the words and stops marking them', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await placeCaret(page, '.w-insertion');
    await button(page, 'Accept').click();

    // The words stay; what goes is the claim that they are new.
    await expect(page.locator('.w-surface').first()).toContainText(insertion);
    await expect(page.locator('.w-insertion')).toHaveCount(0);
  });

  test('rejecting an insertion takes the words out', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await placeCaret(page, '.w-insertion');
    await button(page, 'Reject').click();

    await expect(page.locator('.w-surface').first()).not.toContainText(insertion);
  });

  test('accepting a deletion carries it out', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await placeCaret(page, '.w-deletion');
    await button(page, 'Accept').click();

    await expect(page.locator('.w-surface').first()).not.toContainText(deletion);
    await expect(page.locator('.w-deletion')).toHaveCount(0);
  });

  test('rejecting a deletion keeps the words', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await placeCaret(page, '.w-deletion');
    await button(page, 'Reject').click();

    await expect(page.locator('.w-surface').first()).toContainText(deletion);
    await expect(page.locator('.w-deletion')).toHaveCount(0);
  });

  test('one undo takes an accept back', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await placeCaret(page, '.w-deletion');
    await button(page, 'Accept').click();
    await expect(page.locator('.w-deletion')).toHaveCount(0);

    // Accepting destroys text by design. A reviewer who accepts the wrong change
    // needs it back, and needs it back in one press.
    await page.keyboard.press('Control+z');
    await expect(page.locator('.w-deletion')).toHaveCount(1);
    await expect(page.locator('.w-surface').first()).toContainText(deletion);
  });

  test('accept all settles every change at once', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await button(page, 'Accept all').click();

    await expect(page.locator('.w-insertion')).toHaveCount(0);
    await expect(page.locator('.w-deletion')).toHaveCount(0);
    // Accepted means each author got their way: the addition stayed, the
    // removal happened.
    await expect(page.locator('.w-surface').first()).toContainText(insertion);
    await expect(page.locator('.w-surface').first()).not.toContainText(deletion);
  });

  test('reject all puts the document back as it was', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await button(page, 'Reject all').click();

    await expect(page.locator('.w-surface').first()).not.toContainText(insertion);
    await expect(page.locator('.w-surface').first()).toContainText(deletion);
  });

  test('steps from one change to the next', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await button(page, 'Next change').click();
    const first = await page.evaluate(() => (window as any).editor.selection?.startNodeId);

    await button(page, 'Next change').click();
    const second = await page.evaluate(() => (window as any).editor.selection?.startNodeId);

    expect(second).not.toBe(first);
  });

  test('offers nothing to accept once there is nothing left', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await button(page, 'Accept all').click();
    await expect(page.locator('.w-insertion')).toHaveCount(0);

    // A button that stays lit with nothing to act on is a button that lies about
    // the state of the document.
    await expect(button(page, 'Accept')).toBeDisabled();
    await expect(button(page, 'Accept all')).toBeDisabled();
  });
});

/**
 * Editing while changes are tracked.
 *
 * The switch existed and nothing read it: turning tracking on changed nothing,
 * and the revisions on screen were marks written into the sample by hand. These
 * are about the switch meaning something.
 */
test.describe('recording changes as they are made', () => {
  const trackOn = async (page: import('@playwright/test').Page) => {
    await page.getByRole('button', { name: 'Track changes', exact: true }).click();
    await expect
      .poll(async () => page.evaluate(() => (window as any).editor.executeCommand('isTrackingChanges')))
      .toBeTruthy();
  };

  /** The paragraph the caret is in, model-side. */
  const caretRun = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const ed = (window as any).editor;
      const node = ed.dataStore.getNode(ed.selection.startNodeId);
      return {
        text: node?.text ?? '',
        marks: (node?.marks ?? []).map((m: any) => `${m.stype}[${m.range}]`)
      };
    });

  test('marks what is typed rather than slipping it in', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await trackOn(page);

    await placeCaret(page, '.w-paragraph', 1);
    await page.keyboard.type('added', { delay: 30 });
    await page.waitForTimeout(900);

    const run = await caretRun(page);
    expect(run.text).toContain('added');
    // One revision for the burst, not one per keystroke: a paragraph of typing
    // would otherwise be several hundred entries in the review pane.
    expect(run.marks.filter((m) => m.startsWith('insertion'))).toHaveLength(1);
  });

  test('proposes a deletion instead of carrying it out', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await trackOn(page);
    await placeCaret(page, '.w-paragraph', 1);
    await page.keyboard.press('End');

    const before = await caretRun(page);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(900);

    const after = await caretRun(page);
    // Not one character fewer — that is the whole point of a proposal.
    expect(after.text).toBe(before.text);
    expect(after.marks.some((m) => m.startsWith('deletion'))).toBe(true);
  });

  test('takes back what this reviewer just typed, without proposing it', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await trackOn(page);

    await placeCaret(page, '.w-paragraph', 1);
    await page.keyboard.type('xyz', { delay: 30 });
    await page.waitForTimeout(600);

    // Tracking really is on — otherwise the rest of this test would pass by
    // simply deleting, which is what it is here to tell apart.
    const typed = await caretRun(page);
    expect(typed.marks.some((m) => m.startsWith('insertion'))).toBe(true);

    await page.keyboard.press('Backspace');
    await page.waitForTimeout(900);

    const run = await caretRun(page);
    // Without this a typo is permanent the moment it is typed: its author could
    // only propose removing it and wait for somebody else to agree.
    expect(run.text).toContain('xy');
    expect(run.text).not.toContain('xyz');
    expect(run.marks.some((m) => m.startsWith('deletion'))).toBe(false);
    expect(run.marks.some((m) => m.startsWith('insertion'))).toBe(true);
  });

  test('leaves the document alone while tracking is off', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await placeCaret(page, '.w-paragraph', 1);
    await page.keyboard.type('plain', { delay: 30 });
    await page.waitForTimeout(900);

    const run = await caretRun(page);
    expect(run.text).toContain('plain');
    expect(run.marks.some((m) => m.startsWith('insertion'))).toBe(false);
  });
});
