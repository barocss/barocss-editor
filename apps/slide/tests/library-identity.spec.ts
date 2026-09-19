import { test, expect, type Page } from '@playwright/test';
import { openDeck, pickMenu } from './helpers';

const ORIGINAL = 'one-engine-two-products';
async function rows(page: Page): Promise<Array<{ name: string; text: string; title: string; revision?: number }>> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('barocss-slides');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('decks');
      const read = tx.objectStore('decks').getAll();
      tx.oncomplete = () => { db.close(); resolve(read.result); };
    };
  }));
}
async function library(page: Page) {
  await pickMenu(page, 'file.library.0');
  await expect(page.locator('[data-library-keep]')).toBeVisible();
}
async function keepOriginal(page: Page) {
  await openDeck(page); await library(page);
  await page.locator('[data-library-keep]').click();
  await expect(page.locator(`[data-library-row="${ORIGINAL}"]`)).toBeVisible();
  const original = (await rows(page))[0];
  await page.locator('[data-library-close]').click();
  return original;
}

test('a template starts a separate library identity and preserves the previously kept deck', async ({ page }) => {
  const original = await keepOriginal(page);
  await pickMenu(page, 'file.library.1');
  await page.locator('[data-template="report"]').click();
  await page.locator('[data-template-start]').click();
  await library(page);
  await page.locator('[data-library-keep]').click();
  await expect(page.locator('[data-library-row]')).toHaveCount(2);
  expect((await rows(page)).find(row => row.name === ORIGINAL)?.text).toBe(original.text);
  await page.reload(); await library(page);
  await expect(page.locator('[data-library-row]')).toHaveCount(2);
});

for (const local of [true, false]) test(`a jump to a ${local ? 'library' : 'remote'} deck adopts its destination identity before the next save`, async ({ page }) => {
  const original = await keepOriginal(page);
  const target = JSON.parse(original.text);
  const visit = (node: any) => {
    if (node.stype === 'docTitle') node.content = [{ stype: 'inline-text', text: 'Destination B' }];
    else for (const child of node.content ?? []) if (typeof child === 'object') visit(child);
  };
  visit(target.document);
  const source = local ? 'destination-b' : '/target-deck.json';
  const text = JSON.stringify(target);
  if (local) await page.evaluate(({ text }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('barocss-slides');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('decks', 'readwrite');
      tx.objectStore('decks').put({ name: 'destination-b', title: 'Destination B', text, count: 6, savedAt: Date.now(), revision: 1 });
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }), { text });
  else await page.route('**/target-deck.json', route => route.fulfill({ contentType: 'application/json', body: text }));

  const sid = await page.evaluate(async source => {
    const editor = (window as any).editor;
    await editor.executeCommand('insertRectangle', {});
    const sid = editor.selection.nodeIds[0];
    await editor.executeCommand('setBoxJump', { nodeIds: [sid], deck: source, to: 'cards' });
    return sid;
  }, source);
  await page.locator('[data-present]').click();
  const jump = page.locator(`.sl-stage [data-bc-sid="${sid}"]`);
  await expect(jump).toBeVisible();
  const box = (await jump.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toContain('Destination B');
  await page.keyboard.press('Escape');
  await page.evaluate(async () => { await (window as any).editor.executeCommand('insertSlide', {}); });
  await library(page);
  if (local) await expect(page.locator('[data-library-keep]')).toContainText('destination-b');
  else await expect(page.locator('[data-library-keep]')).not.toContainText(ORIGINAL);
  await page.locator('[data-library-keep]').click();
  // Remote files mint a new name from their opening slide, even when that title matches A.
  const savedName = local ? 'destination-b' : `${ORIGINAL}-2`;
  await expect(page.locator(`[data-library-row="${savedName}"]`)).toContainText('7장');
  const stored = await rows(page);
  expect(stored).toHaveLength(2);
  expect(stored.find(row => row.name === ORIGINAL)?.text).toBe(original.text);
  expect(stored.find(row => row.name === savedName)?.text).not.toBe(text);
});
