/**
 * An empty inline-text renders a caret filler instead of a zero-length text node.
 *
 * Chrome will not use a zero-length text node as an insertion point: the caret can
 * sit in it, but beforeinput.getTargetRanges() snaps to the next block, so the
 * first character typed into a freshly created empty block landed in the wrong
 * paragraph.
 *
 * The filler is U+FEFF inside a marked span — the same shape a rendered text run
 * has — so the browser's own IME mutations land where the model expects them. It
 * is stripped by buildTextRunIndex, so it never reaches model offsets.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { define, element, data, getGlobalRegistry, slot } from '@barocss/dsl';
import { FILLER_ATTR, FILLER_CHAR } from '@barocss/shared';
import { DOMRenderer } from '../../src/dom-renderer';
import { buildTextRunIndex } from '../../src/utils/text-run-index';

describe('Empty inline-text caret filler', () => {
  let renderer: DOMRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    renderer = new DOMRenderer(getGlobalRegistry());
    container = document.createElement('div');
    document.body.appendChild(container);
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text', '')]));
  });

  afterEach(() => {
    container.parentNode?.removeChild(container);
    renderer.destroy();
  });

  const para = (text: string) => ({
    sid: 'p1',
    stype: 'paragraph',
    content: [{ sid: 't1', stype: 'inline-text', text }]
  });

  const host = () => container.querySelector('[data-bc-sid="t1"]')!;
  const filler = () => container.querySelector(`[${FILLER_ATTR}="true"]`);

  it('renders a marked zero-width filler for empty text', () => {
    renderer.render(container, para('') as any);

    const el = filler();
    expect(el).toBeTruthy();
    expect(el!.tagName).toBe('SPAN');
    expect(el!.textContent).toBe(FILLER_CHAR);
  });

  it('gives the caret a real text node to sit in', () => {
    renderer.render(container, para('') as any);

    // This is the whole point of U+FEFF over <br>: a text node exists, so the
    // browser (and the IME) has somewhere to write without inventing structure.
    const walker = document.createTreeWalker(host(), NodeFilter.SHOW_TEXT);
    expect(walker.nextNode()).not.toBeNull();
  });

  it('contributes no run and no length to the offset index', () => {
    renderer.render(container, para('') as any);

    const runs = buildTextRunIndex(host(), undefined, { normalizeWhitespace: false });
    expect(runs.runs).toHaveLength(0);
    expect(runs.total).toBe(0);
  });

  it('does not render a filler for non-empty text', () => {
    renderer.render(container, para('hi') as any);

    expect(filler()).toBeNull();
    expect(host().textContent).toBe('hi');
  });

  it('replaces the filler with the text once the node stops being empty', () => {
    const model: any = para('');
    renderer.render(container, model);
    expect(filler()).toBeTruthy();

    model.content[0].text = 'a';
    renderer.render(container, model);

    expect(filler()).toBeNull();
    expect(host().textContent).toBe('a');
  });

  it('brings the filler back when the text is emptied again', () => {
    const model: any = para('a');
    renderer.render(container, model);

    model.content[0].text = '';
    renderer.render(container, model);

    expect(filler()).toBeTruthy();
    const runs = buildTextRunIndex(host(), undefined, { normalizeWhitespace: false });
    expect(runs.total).toBe(0);
  });
});

describe('buildTextRunIndex with a filler present', () => {
  it('keeps text typed into the filler node, and maps offsets past the filler', () => {
    const host = document.createElement('span');
    host.setAttribute('data-bc-sid', 't1');
    const fillerSpan = document.createElement('span');
    fillerSpan.setAttribute(FILLER_ATTR, 'true');
    // The browser types INTO the filler node, so it holds both.
    fillerSpan.textContent = `${FILLER_CHAR}ab`;
    host.appendChild(fillerSpan);
    document.body.appendChild(host);

    const runs = buildTextRunIndex(host, undefined, { normalizeWhitespace: false });

    expect(runs.total).toBe(2);
    expect(runs.runs[0].text).toBe('ab');
    // model offset 0 is DOM offset 1 — right after the zero-width character
    expect(runs.runs[0].domStart).toBe(1);

    document.body.removeChild(host);
  });
});
