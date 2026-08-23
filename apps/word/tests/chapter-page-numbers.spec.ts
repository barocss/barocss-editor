import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settled } from './helpers';

/**
 * Word's `1-1`: the page number with its chapter's number in front.
 *
 * How a manual is numbered so a chapter can be revised and reprinted without
 * renumbering the rest of the book. `pageNumberChapterStyle` has been in the
 * schema since page setup was written and nothing read it — while every part it
 * needed existed separately: the furniture resolves a page number, `toc.ts`
 * finds the headings and which page each is on, and the numbering resolver
 * computes what a heading is *numbered*. What was missing was the join.
 *
 * The arithmetic is unit-tested in `office-word/test/chapter-numbering.test.ts`;
 * what only a browser can show is that the join reaches the page — the section
 * has to find its chapters, the layout has to have placed them, and the footer
 * has to be drawn per page with the answer.
 */
const footers = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.w-footer')].map((f) =>
      (f.textContent ?? '').replace(/\s+/g, ' ').trim()
    )
  );

/** Number the chapter headings, the way Word links a heading style to a list. */
const numberTheChapters = (page: Page, extra: Record<string, unknown> = {}) =>
  page.evaluate(async (attrs) => {
    const editor = (window as any).editor;
    const store = editor.dataStore;
    const root = store.getNode(editor.getRootId());
    const surface = (root.content ?? [])
      .map((sid: string) => store.getNode(sid))
      .find((node: any) => node?.stype === 'surface');

    const ops: unknown[] = [];
    const walk = (sid: string, depth: number) => {
      const node = store.getNode(sid);
      if (!node || depth > 40) return;
      if (node.stype === 'heading' && node.attributes?.styleId === 'Heading1') {
        ops.push({
          type: 'setAttrs',
          payload: { nodeId: node.sid, attrs: { numId: 'outline', numberingLevel: 0 } }
        });
      }
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child, depth + 1);
    };
    walk(surface.sid, 0);

    ops.push({
      type: 'setAttrs',
      payload: { nodeId: surface.sid, attrs: { pageNumberChapterStyle: 'Heading1', ...attrs } }
    });
    await editor.transaction(ops).commit();
  }, extra);

test.describe('page numbers that carry their chapter', () => {
  test('are plain until a section asks for them', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const drawn = await footers(page);
    expect(drawn.length).toBeGreaterThan(2);
    for (const footer of drawn) expect(footer).not.toMatch(/\d+-\d+/);
  });

  test('carry the chapter once it does', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await numberTheChapters(page);

    await expect.poll(async () => (await footers(page))[0]).toMatch(/\d+-1\b/);
    const drawn = await footers(page);

    // Every page under the same chapter shows the same chapter and its own page.
    const chapter = drawn[0].match(/(\d+)-\d+/)?.[1];
    expect(chapter).toBeTruthy();
    expect(drawn[1]).toContain(`${chapter}-2`);
    expect(drawn[2]).toContain(`${chapter}-3`);
  });

  test('take the separator the section names', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await numberTheChapters(page, { pageNumberChapterSeparator: 'period' });

    await expect.poll(async () => (await footers(page))[0]).toMatch(/\d+\.1\b/);
  });

  /**
   * The one that keeps this honest. Chapter numbering needs the chapter heading
   * to *be* numbered — Word requires the heading style to be linked to a list —
   * and a document whose headings carry no numbering has no chapter number to
   * print. Inventing one from the heading's position would be a page number that
   * disagrees with the heading it claims to be under.
   */
  test('stay plain when the chapter headings are not numbered', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    await page.evaluate(async () => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const surface = (root.content ?? [])
        .map((sid: string) => store.getNode(sid))
        .find((node: any) => node?.stype === 'surface');
      await editor
        .transaction([
          {
            type: 'setAttrs',
            payload: { nodeId: surface.sid, attrs: { pageNumberChapterStyle: 'Heading1' } }
          }
        ])
        .commit();
    });
    await page.waitForTimeout(800);

    for (const footer of await footers(page)) expect(footer).not.toMatch(/\d+-\d+/);
  });
});
