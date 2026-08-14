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
  test('is drawn outside the flow and marked as furniture', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const meta = page.locator('.w-meta');
    await expect(meta).toBeVisible();
    await expect(meta, '메타데이터가 페이지 안에 있습니다').toHaveAttribute('contenteditable', 'false');
    await expect(page.locator('.w-surface .w-doc-title'), '제목이 흐름 안에 있습니다').toHaveCount(0);
  });

  test('cannot be typed into', async ({ page }) => {
    await page.goto('/');
    await settled(page);

    const titleBefore = await page.locator('.w-doc-title').textContent();
    await page.locator('.w-doc-title').first().click();
    await page.waitForTimeout(200);
    await page.keyboard.type('XYZ', { delay: 20 });
    await page.waitForTimeout(400);

    await expect(page.locator('.w-doc-title'), '문서 제목이 본문처럼 편집됐습니다').toHaveText(
      (titleBefore ?? '').trim()
    );
  });

  test('the door refuses a character while the caret is in it', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await page.locator('.w-doc-title').first().click();
    await page.waitForTimeout(200);

    const verdict = await page.evaluate(() => {
      const view = (window as any).editorView;
      const selection = window.getSelection();
      const anchor = selection?.anchorNode ?? null;
      const host = anchor?.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as Element | null);
      return {
        caretIsInTheMetadata: !!host?.closest?.('.w-meta'),
        editorSaysItIsText: view.isSelectionInsideEditableText() === true
      };
    });

    // If the browser kept the caret out entirely, there is nothing to refuse
    // and the test has nothing to say; if it did not, the editor must.
    if (verdict.caretIsInTheMetadata) {
      expect(
        verdict.editorSaysItIsText,
        '커서가 메타데이터 안에 있는데 편집기가 글자를 넣어도 된다고 답합니다'
      ).toBe(false);
    }
  });
});
