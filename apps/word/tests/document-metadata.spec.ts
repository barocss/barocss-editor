import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * The document's title and author, which are not somewhere to type.
 *
 * They live in `docMeta` — a definition the fields read, so that `{ TITLE }`
 * puts the title where the document says it should appear. The copy drawn above
 * the first page is a display of that definition, not a second place the title
 * lives.
 *
 * It was both. The metadata rendered inside the editing surface with nothing
 * marking it out, so a click put the caret in it and typing changed the
 * document's title while looking like a stray heading floating above the page.
 *
 * Marking it `contenteditable="false"` is half the answer; the other half is
 * that the editor decided whether a character could go somewhere by asking the
 * *model* what kind of node it was — and the nodes in there are real
 * inline-text, so the model said yes. A region the view has marked as furniture
 * is not text, whatever the model calls it.
 */
test.describe('the document metadata', () => {
  test('is not drawn in the document at all', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    // A definition, like a style or a numbering scheme: read by `{ TITLE }`,
    // never drawn. Not hidden inside the surface — not in the surface.
    await expect(page.locator('.w-surface .w-doc-title'), '제목이 흐름 안에 있습니다').toHaveCount(0);
    const drawn = await page.locator('.w-def-docMeta').evaluateAll((els) =>
      els.every((el) => (el as HTMLElement).offsetHeight === 0)
    );
    expect(drawn, '메타데이터가 페이지에 그려집니다').toBe(true);
  });

  test('is edited above the ribbon, the way a file is renamed', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const title = page.locator('.doc-title-docTitle');
    await expect(title, '문서 제목을 편집할 곳이 없습니다').toBeVisible();
    await expect(title).toHaveValue('Barocss Word');

    await title.fill('Renamed');
    await page.waitForTimeout(300);

    const stored = await page.evaluate(() => {
      const store = (window as any).editor.dataStore;
      const root = store.getNode(store.getRootNodeId());
      const metaSid = (root.content ?? []).find((sid: string) => store.getNode(sid)?.stype === 'docMeta');
      const titleSid = (store.getNode(metaSid)?.content ?? []).find(
        (sid: string) => store.getNode(sid)?.stype === 'docTitle'
      );
      const runSid = (store.getNode(titleSid)?.content ?? [])[0];
      return store.getNode(runSid)?.text;
    });
    expect(stored, '제목을 바꿨는데 문서에 반영되지 않았습니다').toBe('Renamed');
  });

  test('a field quoting the title follows it', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    // The field that quotes the *title*, not whichever field comes first —
    // this document also has one for the author.
    const quoted = page.locator('.w-field-title').first();
    const hasField = (await quoted.count()) > 0;
    test.skip(!hasField, 'this document quotes the title nowhere');

    await page.locator('.doc-title-docTitle').fill('Renamed');
    await page.waitForTimeout(500);
    await expect(quoted).toContainText('Renamed');
  });
});
