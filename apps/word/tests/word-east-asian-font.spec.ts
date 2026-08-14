import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * A run holding both scripts, drawn in the two faces the document names.
 *
 * Word gives a run a Latin font and an East Asian one and chooses between them
 * per character. Only the Latin one was ever read, so Hangul in a document set
 * in Georgia — which has none of it — was drawn in whatever the browser fell
 * back to: a different face on every machine, and one the page was never
 * measured in.
 *
 * CSS needs no per-script rule, because a family list is already per-character.
 */
test('Korean text takes the East Asian face, and Latin keeps its own', async ({ page }) => {
  await page.goto('/');
  await settled(page);

  // A run that is actually drawn on a sheet — the metadata block is a
  // definition and never appears, so its runs have no element to measure.
  const target = await page.evaluate(() => {
    const store = (window as any).editor.dataStore;
    for (const el of [...document.querySelectorAll('.w-surface [data-bc-sid]')]) {
      const sid = el.getAttribute('data-bc-sid')!;
      const node = store.getNode(sid);
      if (typeof node?.text === 'string' && node.text.length > 10) return sid;
    }
    return null;
  });
  expect(target, 'no drawn run to set text in').not.toBeNull();

  // The document's own defaults name both; the run says nothing of its own.
  await page.evaluate((sid: string) => {
    const editor = (window as any).editor;
    editor.dataStore.updateNode(sid, { text: 'Hello 안녕하세요 world' });
    editor.emit('editor:content.change', { from: 'test' });
  }, target!);
  await page.waitForTimeout(500);

  const families = await page.evaluate((sid: string) => {
    const el = document.querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`) as HTMLElement;
    return getComputedStyle(el).fontFamily;
  }, target!);

  // Georgia first for the Latin, the Korean face behind it for the Hangul
  expect(families).toContain('Georgia');
  expect(families, 'the East Asian face the document names is not in the stack').toContain(
    'Noto Serif KR'
  );

  // And the two scripts are actually drawn in different faces, which is the
  // whole point — measured, not asserted from the declaration.
  const drawn = await page.evaluate((sid: string) => {
    const el = document.querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`)!;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode() as Text;
    const widthOf = (from: number, to: number) => {
      const range = document.createRange();
      range.setStart(text, from);
      range.setEnd(text, to);
      return range.getBoundingClientRect().width;
    };
    // 'Hello' against '안녕하세요' says nothing on its own; what says something
    // is that the Hangul has a width at all, which a face without it would not
    // give without falling back.
    return { latin: widthOf(0, 5), hangul: widthOf(6, 11) };
  }, target!);

  expect(drawn.latin).toBeGreaterThan(0);
  expect(drawn.hangul).toBeGreaterThan(0);
});
