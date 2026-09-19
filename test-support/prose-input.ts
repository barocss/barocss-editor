import { expect, type Locator, type Page } from '@playwright/test';

/** The same rendered-text/caret contract for standalone and embedded writing surfaces. */
export async function checkTrailingSpaceEditing(page: Page, paragraph: Locator, initial: string) {
  await paragraph.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let last: Node | null = null, next: Node | null;
    while ((next = walker.nextNode())) last = next;
    if (!last) throw new Error('Expected an editable text run');
    (element.closest('[contenteditable="true"]') as HTMLElement).focus();
    const end = last.textContent!.length;
    getSelection()!.setBaseAndExtent(last, end, last, end);
  });
  for (let index = 0; index < 4; index++) await page.keyboard.press('Space');
  // Playwright's toHaveText normalizes whitespace; compare literal text instead.
  await expect.poll(() => paragraph.textContent()).toBe(`${initial}    `);
  await expect(paragraph).toHaveCSS('white-space', 'pre-wrap');
  await page.keyboard.type('End');
  await expect.poll(() => paragraph.textContent()).toBe(`${initial}    End`);
  for (let index = 0; index < 5; index++) await page.keyboard.press('Backspace');
  await expect.poll(() => paragraph.textContent()).toBe(`${initial}  `);
  await page.keyboard.type('X');
  await expect.poll(() => paragraph.textContent()).toBe(`${initial}  X`);
}
