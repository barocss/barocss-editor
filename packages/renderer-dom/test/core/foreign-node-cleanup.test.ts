/**
 * Ownership tracking for text nodes.
 *
 * Renderer-made text nodes have no fiber of their own, so stale-child cleanup
 * could not previously tell them apart from ones the browser created. Marking
 * what the renderer creates or adopts closes that gap.
 *
 * Sweeping the foreign ones is NOT enabled: text reaches the model by observing
 * the DOM, so between a keystroke and the sync the browser's text node is the
 * user's input, and removing it loses the keystroke (measured in Chrome — typing
 * and IME into a fresh block both lost their text). These tests pin the current,
 * safe behaviour: renderer content is preserved across re-renders, model changes
 * still apply, and nothing outside the renderer's own output is touched.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { define, element, data, getGlobalRegistry, slot } from '@barocss/dsl';
import { DOMRenderer } from '../../src/dom-renderer';
import { isRendererOwned } from '../../src/renderer-owned-nodes';

describe('foreign node cleanup', () => {
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

  const model = (text: string) => ({
    sid: 'p1',
    stype: 'paragraph',
    content: [{ sid: 't1', stype: 'inline-text', text }]
  });

  const host = () => container.querySelector('[data-bc-sid="t1"]') as HTMLElement;

  it('does not delete text the browser injected — it may be un-synced input', () => {
    renderer.render(container, model('hello') as any);

    // What an IME does: write text directly into the sid element, alongside the
    // structure the renderer produced. Until the MutationObserver diff picks it
    // up this IS the user's input, so a re-render must not remove it.
    host().insertBefore(document.createTextNode('한글'), host().firstChild);
    renderer.render(container, model('hello') as any);

    expect(host().textContent).toContain('한글');
  });

  it('marks renderer-created and renderer-adopted text nodes as owned', () => {
    renderer.render(container, model('hello') as any);

    const walker = document.createTreeWalker(host(), NodeFilter.SHOW_TEXT);
    const own = walker.nextNode() as Text;
    expect(isRendererOwned(own)).toBe(true);
    expect(isRendererOwned(document.createTextNode('foreign'))).toBe(false);
  });

  it('keeps the renderer’s own text across re-renders', () => {
    renderer.render(container, model('hello') as any);
    renderer.render(container, model('hello') as any);
    renderer.render(container, model('hello') as any);

    expect(host().textContent).toBe('hello');
  });

  it('still applies model changes when a foreign node is present', () => {
    renderer.render(container, model('hello') as any);
    host().appendChild(document.createTextNode('junk'));

    renderer.render(container, model('world') as any);

    expect(host().textContent).toContain('world');
  });

  it('leaves text in a plain host element alone', () => {
    const plain = document.createElement('div');
    plain.appendChild(document.createTextNode('pre-existing'));
    container.appendChild(plain);

    renderer.render(container, model('hello') as any);

    expect(plain.textContent).toBe('pre-existing');
  });
});
