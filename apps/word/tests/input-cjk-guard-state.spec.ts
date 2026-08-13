import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * Where the inferred composition flag disagrees with the composition.
 *
 * Text is written by two things and only two: a command driven from
 * `beforeinput`, and the MutationObserver reading what an IME wrote. Nothing
 * here changes that. But five decisions are made from a *derived* fact — "is a
 * composition in progress" — which is inferred from `beforeinput.isComposing`
 * and from keydown's keyCode 229, and never from a composition event. That
 * inference decides whether keydown is handled, whether paste and drop are
 * handled, whether a content change is drawn at all, and whether the observer
 * trusts its records during a burst.
 *
 * An inference is only as good as its edges, and this reports both of them: the
 * moment the IME starts writing and the flag is still false, and the stretch
 * after the commit where nothing has cleared it. The composition events are
 * listened to *here*, in the test, as the reference to compare the inference
 * against — which is the one place they are unambiguously the right tool.
 */

const INSTRUMENT = () => {
  const view = (window as any).editorView;
  const handler = (view as any).inputHandler;
  const log: any[] = [];
  const counts = { skippedBeforeFlagSet: 0, skippedAfterEnd: 0, recordsAfterEnd: 0 };
  (window as any).__probe = { log, counts };
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);
  let started = false;
  let ended = false;

  const state = (stage: string) =>
    log.push({ at: at(), stage, burst: handler.isTypingBurst === true, composing: view._isComposing === true });

  const el: HTMLElement =
    view.contentEditableElement ?? document.querySelector('.barocss-editor-content')!;

  // Capture phase would read the flag before the view's own handler runs, which
  // would be measuring the test's listener order rather than the editor's. The
  // bubble phase reads it after every handler the editor has.
  el.addEventListener('compositionstart', () => { started = true; state('compositionstart'); });
  el.addEventListener('compositionupdate', (e: any) => state(`compositionupdate ${e.data}`));
  el.addEventListener('compositionend', (e: any) => {
    ended = true;
    state(`compositionend ${e.data}`);
    setTimeout(() => state('task after end'), 0);
    setTimeout(() => state('16ms after end'), 16);
    setTimeout(() => state('300ms after end'), 300);
  });
  el.addEventListener('beforeinput', (e: any) =>
    log.push({ at: at(), stage: `beforeinput ${e.inputType} isComposing=${e.isComposing}`,
               burst: handler.isTypingBurst === true, composing: view._isComposing === true }));
  el.addEventListener('input', (e: any) =>
    log.push({ at: at(), stage: `input ${e.inputType} isComposing=${e.isComposing}`,
               burst: handler.isTypingBurst === true, composing: view._isComposing === true }));

  // A second observer applying the guard's own test, so what it would turn away
  // can be counted without changing what the editor does.
  new MutationObserver((records) => {
    const composing = view._isComposing === true;
    const burst = handler.isTypingBurst === true;
    if (ended) counts.recordsAfterEnd += records.length;
    if (!composing && burst) {
      if (started && !ended) counts.skippedBeforeFlagSet += records.length;
      if (ended) counts.skippedAfterEnd += records.length;
      log.push({ at: at(), stage: `guard would drop x${records.length}`, burst, composing });
    }
  }).observe(el, { subtree: true, childList: true, characterData: true });
};

const clickIntoParagraph = async (page: import('@playwright/test').Page) => {
  const point = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.w-paragraph')][1];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode()!;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = [...range.getClientRects()][0];
    return { x: rect.left + rect.width * 0.35, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(() => page.evaluate(() => (window as any).editor?.selection?.startNodeId ?? null))
    .not.toBeNull();
};

const timeline = (log: any[]) =>
  log
    .map((e) => `${String(e.at).padStart(5)}ms ${String(e.stage).padEnd(40)} burst=${e.burst} composing=${e.composing}`)
    .join('\n');

test.describe('the inferred composition flag', () => {
  test('is true while the IME writes, and false once it has finished', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    await page.evaluate(INSTRUMENT);

    const cdp = await page.context().newCDPSession(page);
    const at = await page.evaluate(() => (window as any).editor.selection.startOffset as number);

    // A hot burst, then a composition with no pause: the arrangement that puts
    // both edges of the inference inside the burst window at once.
    await page.keyboard.type('abc', { delay: 0 });
    for (const step of ['ㅎ', '한']) {
      await cdp.send('Input.imeSetComposition', {
        text: step,
        selectionStart: step.length,
        selectionEnd: step.length
      });
      await page.waitForTimeout(40);
    }
    await cdp.send('Input.insertText', { text: '한' });
    await page.waitForTimeout(900);

    const probe = await page.evaluate(() => (window as any).__probe);
    const trace = `${timeline(probe.log)}\n\ncounts: ${JSON.stringify(probe.counts)}`;

    // The measurement is only worth anything if the composition happened and the
    // burst was still alive for it.
    const updates = probe.log.filter((e: any) => String(e.stage).startsWith('compositionupdate'));
    expect(updates.length, `no composition happened\n${trace}`).toBeGreaterThan(0);
    expect(updates.every((e: any) => e.burst), `the burst had lapsed — nothing was tested\n${trace}`).toBe(true);

    // The leading edge. The flag is not yet set at `compositionstart` or at the
    // first `compositionupdate` — `beforeinput` sets it a millisecond later — and
    // that is not a hole, because the IME has not written anything yet either.
    // Ordering is the guarantee, not simultaneity, so the thing to assert is the
    // consequence: no record of the IME's went past the guard unprotected.
    expect(probe.counts.skippedBeforeFlagSet, `IME records dropped before the flag was set\n${trace}`).toBe(0);
    const composingBeforeInput = probe.log.filter(
      (e: any) => String(e.stage).includes('insertCompositionText') && String(e.stage).includes('isComposing=true')
    );
    expect(composingBeforeInput.length, `no composing beforeinput to set the flag\n${trace}`).toBeGreaterThan(0);
    expect(composingBeforeInput[0].composing, `the flag was not set by the composing beforeinput\n${trace}`).toBe(true);

    // The trailing edge: once the commit's records have been delivered, the flag
    // must be clear again — five behaviours are switched off while it is not.
    const settledAfter = probe.log.filter((e: any) => String(e.stage) === '300ms after end');
    expect(settledAfter.length, trace).toBeGreaterThan(0);
    expect(settledAfter[0].composing, `flag still set long after the composition ended\n${trace}`).toBe(false);

    // And the invariant that either edge would break.
    const text = await page.evaluate(() => {
      const sid = (window as any).editor.selection.startNodeId;
      const el = document.querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`);
      return {
        model: ((window as any).editor.dataStore.getNode(sid)?.text ?? '') as string,
        dom: (el?.textContent ?? '').replace(/﻿/g, '')
      };
    });
    expect(text.dom, trace).toBe(text.model);
    expect(text.model.slice(at, at + 4), trace).toBe('abc한');
  });
});
