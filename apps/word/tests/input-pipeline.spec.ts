import { test, expect } from '@playwright/test';

/**
 * What a keystroke costs, and who writes it.
 *
 * Text arrives by two routes that must never both claim the same keystroke: a
 * command driven from `beforeinput`, and the MutationObserver reading what the
 * browser wrote. Which one owns a keystroke is decided by whether
 * `preventDefault` can stop the browser — for ordinary typing it can, for IME
 * composition it cannot. Everything here was written from measurements taken in
 * the browser, because every duplicate found so far was invisible in the source:
 * each writer looked correct on its own.
 *
 * The counts are the point. A pattern that ends with the right text but writes
 * it twice is a pattern that renders the document twice, tells every
 * content.change listener the document moved twice, and gives the observer a
 * second copy of its own output to interpret.
 */

type Entry = { at: number; stage: string; [k: string]: unknown };

/** Record every stage of the pipeline on one timeline. */
const INSTRUMENT = () => {
  const w = window as any;
  const ed = w.editor;
  const view = w.editorView;
  const log: any[] = [];
  w.__log = log;
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);

  const el: HTMLElement = view.contentEditableElement ?? document.querySelector('.barocss-editor-content');

  // Capture phase sees the event before the editor; bubble phase sees whether
  // the editor stopped it.
  el.addEventListener('beforeinput', (e: any) => {
    log.push({ at: at(), stage: 'beforeinput', inputType: e.inputType, data: e.data, composing: e.isComposing });
  }, true);
  el.addEventListener('beforeinput', (e: any) => {
    log.push({ at: at(), stage: 'beforeinput:after', inputType: e.inputType, prevented: e.defaultPrevented });
  }, false);

  el.addEventListener('compositionstart', () => log.push({ at: at(), stage: 'compositionstart' }));
  el.addEventListener('compositionend', (e: any) =>
    log.push({ at: at(), stage: 'compositionend', data: e.data }));

  // Where each DOM change landed. `surface` is the text; the rest is page
  // furniture our own render redraws.
  new MutationObserver((records) => {
    for (const r of records) {
      const t: any = r.target;
      const host = t.nodeType === 3 ? t.parentElement : t;
      const where = host?.closest?.('.w-sheets') ? 'chrome'
        : host?.closest?.('.w-surface') ? 'surface'
        : 'other';
      log.push({ at: at(), stage: 'mutation', type: r.type, where });
    }
  }).observe(el, { subtree: true, childList: true, characterData: true });

  const emit = ed.emit.bind(ed);
  ed.emit = (name: string, payload: any) => {
    if (name === 'editor:content.change') {
      const ops = payload?.transaction?.operations ?? [];
      log.push({ at: at(), stage: 'transaction', ops: ops.map((o: any) => o?.type).join('+'), from: payload?.from ?? '?' });
    }
    return emit(name, payload);
  };

  const render = view.render.bind(view);
  view.render = (...a: any[]) => {
    log.push({ at: at(), stage: 'render:start' });
    const r = render(...a);
    log.push({ at: at(), stage: 'render:end' });
    return r;
  };
};

const start = async (page: any) => {
  await page.goto('/');
  await page.waitForSelector('.w-sheet');
  await page.waitForTimeout(1200);
  await page.locator('.w-paragraph').nth(1).click();
  await page.waitForFunction(() => (window as any).editor?.selection?.type === 'range');
  await page.evaluate(INSTRUMENT);
};

const read = async (page: any): Promise<Entry[]> => page.evaluate(() => (window as any).__log);

const count = (log: Entry[], stage: string, match?: (e: Entry) => boolean) =>
  log.filter((e) => e.stage === stage && (!match || match(e))).length;

/** Print the timeline so a failure says what happened, not just what didn't. */
const show = (log: Entry[], label: string) => {
  const lines = [`--- ${label} ---`];
  let run: { at: number; n: number } | null = null;
  for (const e of log) {
    if (e.stage === 'mutation') {
      run = run ? { at: run.at, n: run.n + 1 } : { at: e.at, n: 1 };
      continue;
    }
    if (run) { lines.push(`${run.at}ms mutations x${run.n}`); run = null; }
    const extra = Object.entries(e).filter(([k]) => k !== 'at' && k !== 'stage')
      .map(([k, v]) => `${k}=${v}`).join(' ');
    lines.push(`${e.at}ms ${e.stage} ${extra}`);
  }
  if (run) lines.push(`${run.at}ms mutations x${run.n}`);
  return lines.join('\n');
};

/** The paragraph the caret is in, as the model has it and as the screen has it. */
const caretParagraph = async (page: any) =>
  page.evaluate(() => {
    const ed = (window as any).editor;
    const sid = ed.selection?.startNodeId;
    return {
      model: ed.dataStore.getNode(sid)?.text ?? '',
      dom: (document.querySelector(`[data-bc-sid="${sid}"]`)?.textContent ?? '').replace(/﻿/g, '')
    };
  });

test.describe('the input pipeline', () => {
  test('a keystroke is written once, by the command', async ({ page }) => {
    await start(page);
    await page.keyboard.press('a');
    await page.waitForTimeout(900);

    const log = await read(page);
    const trace = show(log, 'one character');

    // The command owns it: the browser is stopped and the model is written from
    // the range the event reported.
    expect(count(log, 'beforeinput:after', (e) => e.prevented === true), trace).toBe(1);
    expect(count(log, 'transaction'), trace).toBe(1);

    // Two renders: the content, and the layout pass that repaginates it. It was
    // four, because the fast path announced the command's own transaction a
    // second time after the promise settled.
    expect(count(log, 'render:start'), trace).toBeLessThanOrEqual(3);

    const { model, dom } = await caretParagraph(page);
    expect(dom).toBe(model);
    expect(model).toContain('isa');
  });

  test('typing fast writes each character once and keeps its order', async ({ page }) => {
    await start(page);
    await page.keyboard.type('barocss', { delay: 12 });
    await page.waitForTimeout(1500);

    const log = await read(page);
    const trace = show(log, 'fast typing');

    expect(count(log, 'beforeinput', (e) => e.inputType === 'insertText'), trace).toBe(7);
    expect(count(log, 'transaction'), trace).toBe(7);

    const { model, dom } = await caretParagraph(page);
    expect(dom).toBe(model);
    expect(model).toContain('isbarocss');
  });

  test('backspace removes one character and writes once', async ({ page }) => {
    await start(page);
    await page.keyboard.type('xy', { delay: 40 });
    await page.waitForTimeout(600);
    await page.evaluate(() => ((window as any).__log.length = 0));

    await page.keyboard.press('Backspace');
    await page.waitForTimeout(900);

    const log = await read(page);
    expect(count(log, 'transaction'), show(log, 'backspace')).toBeLessThanOrEqual(1);

    const { model, dom } = await caretParagraph(page);
    expect(dom).toBe(model);
    expect(model).toContain('isx');
    expect(model).not.toContain('isxy');
  });

  test('enter repaginates within a bounded number of renders', async ({ page }) => {
    await start(page);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);

    const log = await read(page);
    const trace = show(log, 'enter');

    expect(count(log, 'transaction'), trace).toBe(1);

    // Enter near the top moves every page break below it. Applying them one at a
    // time cost a render each — twenty-nine for one keystroke. They are applied
    // as one batch now, leaving the three layout rounds and their renders.
    expect(count(log, 'render:start'), trace).toBeLessThanOrEqual(10);

    const { model, dom } = await caretParagraph(page);
    expect(dom).toBe(model);
  });

  test('paste puts the text in the model, not only on the screen', async ({ page }) => {
    await start(page);
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text/plain', 'pasted');
      document.activeElement!.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      );
    });
    await page.waitForTimeout(1200);

    const log = await read(page);
    expect(count(log, 'transaction'), show(log, 'paste')).toBe(1);

    // The screen agreeing is not enough: the store is what gets exported, and a
    // node that renders but is not in the store is a document that loses the
    // paste when it is saved.
    const placed = await page.evaluate(() => {
      const ed = (window as any).editor;
      const nodes: any[] = Array.from((ed.dataStore.getAllNodes?.() ?? []) as any[]);
      const node = nodes.find((n: any) => n?.text === 'pasted');
      const parent = node && ed.dataStore.getNode(node.parentId);
      return {
        onScreen: !!document.querySelector('.w-surface')?.textContent?.includes('pasted'),
        inStore: !!node,
        attached: !!parent && (parent.content ?? []).some((c: any) => (c?.sid ?? c) === node.sid),
        exported: JSON.stringify(ed.exportDocument?.() ?? {}).includes('pasted')
      };
    });
    expect(placed).toEqual({ onScreen: true, inStore: true, attached: true, exported: true });
  });

  /**
   * IME composition is the one pattern the browser owns. `preventDefault` on
   * beforeinput does not stop it, so the DOM is written first and the observer
   * reads it back — and nothing may re-render underneath it, or the IME commits
   * the syllable it was still building.
   */
  test('composition is left to the browser and synced back once per step', async ({ page }) => {
    await start(page);
    const cdp = await page.context().newCDPSession(page);

    await cdp.send('Input.imeSetComposition', { text: 'ㅎ', selectionStart: 1, selectionEnd: 1 });
    await page.waitForTimeout(200);
    await cdp.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 });
    await page.waitForTimeout(200);
    await cdp.send('Input.insertText', { text: '한' });
    await page.waitForTimeout(1200);

    const log = await read(page);
    const trace = show(log, 'composition');

    const composed = log.filter((e) => e.stage === 'beforeinput' && e.inputType === 'insertCompositionText');
    expect(composed.length, trace).toBeGreaterThan(0);
    // Not prevented — the attempt would fail anyway, and pretending otherwise is
    // what makes the two writers disagree about who owns the keystroke.
    expect(count(log, 'beforeinput:after', (e) => e.prevented === true), trace).toBe(0);

    // One write per composition step, and no render while the IME holds the caret.
    const start_ = log.findIndex((e) => e.stage === 'compositionstart');
    const end = log.findIndex((e) => e.stage === 'compositionend');
    const during = log.slice(start_, end < 0 ? log.length : end);
    expect(during.filter((e) => e.stage === 'render:start').length, trace).toBe(0);
    expect(during.filter((e) => e.stage === 'transaction').length, trace).toBe(composed.length - 1);

    const { model, dom } = await caretParagraph(page);
    expect(dom).toBe(model);
    expect(model).toContain('is한');
  });
});
