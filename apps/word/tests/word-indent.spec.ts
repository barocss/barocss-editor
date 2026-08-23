import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * What Tab and Ctrl+M mean, which in Word depends on where the caret is.
 *
 * Three of these four were wrong at once, and each for its own reason:
 *
 * - Ctrl+M was bound to `indentNode`, which nests one block inside another and
 *   only acts on a node type the schema marks `indentable`. Nothing here marks
 *   one — a Word list is a paragraph carrying a numbering level, not a nested
 *   node — so Word's own indent shortcut did nothing at all.
 * - Tab indented the whole paragraph wherever the caret was, so there was no way
 *   to indent only the first line.
 * - And no way at all to type a tab, though the schema has had a `tab` node with
 *   a renderer and the whole tab-stop layout behind it, and the sample document
 *   uses seven of them.
 */

/** A paragraph, by the two sids a test needs to work with it. */
type Found = { block: string; run: string } | null;

/**
 * A paragraph with text in it, numbered or not.
 *
 * The return type is stated rather than inferred: Playwright maps what `evaluate`
 * sends back through its own serialisable type, and a `{ … } | null` comes out the
 * other side as `never` — so every `plain!.run` in this file was an error the compiler
 * would have reported, if anything had ever compiled these specs. Nineteen of them.
 */
async function paragraphs(page: import('@playwright/test').Page) {
  return page.evaluate<{ plain: Found; listed: Found }>(() => {
    const store = (window as any).editor.dataStore;
    let plain: Found = null;
    let listed: Found = null;
    const walk = (sid: string) => {
      const node = store.getNode(sid);
      if (!node) return;
      if (node.stype === 'paragraph') {
        const runs = ((node.content ?? []) as string[]).filter(
          (child: string) => typeof store.getNode(child)?.text === 'string'
        );
        if (runs.length && (store.getNode(runs[0])?.text ?? '').length > 10) {
          if (node.attributes?.numId) listed ??= { block: sid, run: runs[0] };
          else plain ??= { block: sid, run: runs[0] };
        }
      }
      for (const child of ((node.content ?? []) as string[])) walk(child);
    };
    walk(store.getRootNodeId());
    return { plain, listed };
  });
}

/** Put the caret at a character offset in a run, the way a click would. */
async function caretAt(page: import('@playwright/test').Page, run: string, offset: number) {
  await page.evaluate(
    ([sid, at]: [string, number]) => {
      const el = document.querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`);
      const walker = document.createTreeWalker(el!, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode() as Text;
      const range = document.createRange();
      range.setStart(text, at);
      range.collapse(true);
      const selection = getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      (document.querySelector('[contenteditable="true"]') as HTMLElement)?.focus();
    },
    [run, offset] as [string, number]
  );
  await page.waitForTimeout(150);
}

/** What the paragraph says about itself, and how many tabs it holds. */
async function shape(page: import('@playwright/test').Page, block: string) {
  return page.evaluate((sid: string) => {
    const store = (window as any).editor.dataStore;
    const node = store.getNode(sid);
    const attributes = node?.attributes ?? {};
    return {
      indentLeft: attributes.indentLeft ?? 0,
      firstLine: attributes.indentFirstLine ?? 0,
      numLevel: attributes.numLevel ?? null,
      tabs: ((node?.content ?? []) as string[]).filter(
        (child) => store.getNode(child)?.stype === 'tab'
      ).length
    };
  }, block);
}

test('Tab at the start of a paragraph indents its first line', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  const { plain } = await paragraphs(page);
  expect(plain, 'the sample has no plain paragraph').not.toBeNull();

  await caretAt(page, plain!.run, 0);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);

  // The first line alone, not the whole paragraph
  expect(await shape(page, plain!.block)).toMatchObject({ firstLine: 720, indentLeft: 0 });

  await caretAt(page, plain!.run, 0);
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(300);
  expect(await shape(page, plain!.block)).toMatchObject({ firstLine: 0 });
});

test('Tab inside the text puts a tab there', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  const { plain } = await paragraphs(page);

  expect(await shape(page, plain!.block)).toMatchObject({ tabs: 0 });
  await caretAt(page, plain!.run, 6);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);

  const after = await shape(page, plain!.block);
  expect(after.tabs, 'no tab was inserted').toBe(1);
  // And it did not move the paragraph while it was at it
  expect(after.indentLeft).toBe(0);
  await expect(page.locator(`[data-bc-sid="${plain!.block}"] .w-tab`)).toHaveCount(1);
});

test('deleting a tab lets the runs it split meet again', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  const { plain } = await paragraphs(page);

  const runs = () => page.evaluate((sid: string) => {
    const store = (window as any).editor.dataStore;
    return ((store.getNode(sid)?.content ?? []) as string[]).filter(
      (child) => typeof store.getNode(child)?.text === 'string'
    ).length;
  }, plain!.block);

  const before = await runs();
  await caretAt(page, plain!.run, 6);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  // The tab went in the middle of a run, so that run is now two
  expect(await runs()).toBe(before + 1);

  // Caret just after the tab, then take it back out
  await page.evaluate((sid: string) => {
    const store = (window as any).editor.dataStore;
    const kids = (store.getNode(sid)?.content ?? []) as string[];
    const after = kids[kids.findIndex((c) => store.getNode(c)?.stype === 'tab') + 1];
    const el = document.querySelector(`[data-bc-sid="${CSS.escape(after)}"]`);
    const walker = document.createTreeWalker(el!, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode() as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.collapse(true);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    (document.querySelector('[contenteditable="true"]') as HTMLElement)?.focus();
  }, plain!.block);
  await page.waitForTimeout(150);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(400);

  expect(await shape(page, plain!.block)).toMatchObject({ tabs: 0 });
  // And the seam it left behind is gone with it
  expect(await runs(), 'the runs the tab had split stayed apart').toBe(before);
});

test('Tab in a list moves it a level, as it always did', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  const { listed } = await paragraphs(page);
  expect(listed, 'the sample has no numbered paragraph').not.toBeNull();

  expect(await shape(page, listed!.block)).toMatchObject({ numLevel: 0 });
  await caretAt(page, listed!.run, 3);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  expect(await shape(page, listed!.block)).toMatchObject({ numLevel: 1, tabs: 0 });
});

test('Ctrl+M indents the paragraph, and Ctrl+Shift+M takes it back', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  const { plain } = await paragraphs(page);

  await caretAt(page, plain!.run, 3);
  await page.keyboard.press('Control+m');
  await page.waitForTimeout(300);
  // Every line of it, which is what Word's Ctrl+M does
  expect(await shape(page, plain!.block)).toMatchObject({ indentLeft: 720, firstLine: 0 });

  await caretAt(page, plain!.run, 3);
  await page.keyboard.press('Control+Shift+m');
  await page.waitForTimeout(300);
  expect(await shape(page, plain!.block)).toMatchObject({ indentLeft: 0 });
});
