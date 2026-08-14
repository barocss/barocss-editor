import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * Hyphenation, which needed three attributes and had readers for none.
 *
 * The switch is the document's (`hyphenationAuto`), the exception is a
 * paragraph's (`suppressAutoHyphens`), and neither is any use without the
 * third — a browser hyphenates by dictionary and has to be told which language
 * the text is in, which is `lang`, on the run. All three arrive together or none
 * of them does anything, which is why they were worth doing as one piece.
 *
 * `hyphenationZone` is left unread on purpose: the space Word allows at the end
 * of a line before reaching for a hyphen has no equivalent in CSS.
 */
test('the document switches it on, a paragraph opts out, and the run says the language', async ({
  page
}) => {
  await page.goto('/');
  await settled(page);
  await page.waitForTimeout(600);

  const target = await page.evaluate(() => {
    const store = (window as any).editor.dataStore;
    for (const el of [...document.querySelectorAll('.w-surface p[data-bc-sid]')]) {
      const sid = el.getAttribute('data-bc-sid')!;
      const node = store.getNode(sid);
      const runs = ((node?.content ?? []) as string[]).filter(
        (child: string) => typeof store.getNode(child)?.text === 'string'
      );
      if (runs.length) return { block: sid, run: runs[0] };
    }
    return null;
  });
  expect(target).not.toBeNull();

  const hyphensOf = (sid: string) =>
    page.evaluate(
      (id: string) =>
        getComputedStyle(document.querySelector(`[data-bc-sid="${CSS.escape(id)}"]`)!).hyphens,
      sid
    );
  const langOf = (sid: string) =>
    page.evaluate(
      (id: string) => document.querySelector(`[data-bc-sid="${CSS.escape(id)}"]`)!.getAttribute('lang'),
      sid
    );

  // Nothing until the document asks
  expect(await hyphensOf(target!.block)).toBe('manual');
  expect(await langOf(target!.run)).toBeNull();

  await page.evaluate((run: string) => {
    const editor = (window as any).editor;
    const store = editor.dataStore;
    const settings = (() => {
      const root = store.getNode(store.getRootNodeId());
      for (const child of ((root?.content ?? []) as string[])) {
        const node = store.getNode(child);
        if (node?.stype !== 'resources') continue;
        for (const resource of ((node.content ?? []) as string[])) {
          if (store.getNode(resource)?.stype === 'docSettings') return resource;
        }
      }
      return null;
    })();
    store.updateNode(settings!, {
      attributes: { ...(store.getNode(settings!)?.attributes ?? {}), hyphenationAuto: true }
    });
    store.updateNode(run, {
      attributes: { ...(store.getNode(run)?.attributes ?? {}), lang: 'en-GB' }
    });
    editor.emit('editor:content.change', { from: 'test' });
  }, target!.run);
  await page.waitForTimeout(800);

  expect(await hyphensOf(target!.block), 'the document asked and nothing happened').toBe('auto');
  expect(await langOf(target!.run), 'the run did not say its language').toBe('en-GB');

  // And a paragraph may say no to a document that said yes
  await page.evaluate((block: string) => {
    const editor = (window as any).editor;
    editor.dataStore.updateNode(block, {
      attributes: {
        ...(editor.dataStore.getNode(block)?.attributes ?? {}),
        suppressAutoHyphens: true
      }
    });
    editor.emit('editor:content.change', { from: 'test' });
  }, target!.block);
  await page.waitForTimeout(800);

  // `manual`, not `none`: a soft hyphen the author typed is still a place they chose
  expect(await hyphensOf(target!.block)).toBe('manual');
});
