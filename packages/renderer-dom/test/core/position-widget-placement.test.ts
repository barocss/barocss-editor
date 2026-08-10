import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, defineDecorator, getGlobalRegistry, slot, data } from '@barocss/dsl';
import { DOMRenderer } from '../../src/dom-renderer';
import type { Decorator } from '../../src/vnode/decorator';

/**
 * Where a position widget ends up when another one is already there.
 *
 * A widget marks a place between two characters — a collaborator's caret, the
 * point where a page breaks inside a paragraph. Its whole value is being at that
 * place, so landing anywhere else is not a cosmetic fault: a page break drawn at
 * the top of the paragraph it was meant to split takes every line after it onto
 * the wrong page, which is how this was found.
 */
describe('a position widget among others', () => {
  let renderer: DOMRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    renderer = new DOMRenderer(getGlobalRegistry());
    container = document.createElement('div');
    document.body.appendChild(container);
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));
    defineDecorator('brk', element('span', { className: 'brk' }, []));
  });

  const model = {
    sid: 'p1',
    stype: 'paragraph',
    content: [{ sid: 't1', stype: 'inline-text', text: 'x'.repeat(100) }]
  };

  const at = (offset: number, sid: string): Decorator =>
    ({
      sid,
      stype: 'brk',
      category: 'inline',
      target: { sid: 't1', startOffset: offset, endOffset: offset }
    }) as Decorator;

  /** The children of the text holder, as text runs and widgets in order. */
  const shape = () =>
    [...container.querySelector('[data-bc-sid="t1"]')!.childNodes].map((node: any) =>
      node.nodeType === 3
        ? 'text'
        : node.className === 'brk'
          ? `widget:${node.getAttribute('data-decorator-sid')}`
          : 'text'
    );

  it('sits between the runs it was cut between', () => {
    renderer.render(container, model as never, [at(30, 'a'), at(70, 'b')] as never);
    expect(shape()).toEqual(['text', 'widget:a', 'text', 'widget:b', 'text']);
  });

  it('sits there when it arrives after the paragraph was already drawn', () => {
    renderer.render(container, model as never, [] as never);
    renderer.render(container, model as never, [at(30, 'a'), at(70, 'b')] as never);
    expect(shape()).toEqual(['text', 'widget:a', 'text', 'widget:b', 'text']);
  });

  it('survives one of them moving', () => {
    renderer.render(container, model as never, [at(70, 'b'), at(50, 'a')] as never);
    renderer.render(container, model as never, [at(70, 'b'), at(30, 'a')] as never);
    expect(shape()).toEqual(['text', 'widget:a', 'text', 'widget:b', 'text']);
  });

  // This is the case that was wrong. Adding a widget *before* one already drawn
  // put the children in the order text, text, widget, widget, text: the widgets
  // were matched to their old selves by identity while the runs between them
  // were matched by position, and the two orders crossed. In the word processor
  // it drew a mid-paragraph page break at the head of its paragraph and took
  // twelve lines off the bottom of their page.
  it('sits there when it arrives before one that is already drawn', () => {
    renderer.render(container, model as never, [at(70, 'b')] as never);
    renderer.render(container, model as never, [at(70, 'b'), at(30, 'a')] as never);
    expect(shape()).toEqual(['text', 'widget:a', 'text', 'widget:b', 'text']);
  });
});
