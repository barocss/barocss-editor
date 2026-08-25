import { describe, it, expect, beforeEach } from 'vitest';
import { data, define, element, getGlobalRegistry, slot } from '@barocss/dsl';
import { DOMRenderer } from '../src/dom-renderer';

/**
 * An element that **replaces** another must be given its whole style.
 *
 * Found in a site builder, where one board draws a page and then the same board is pointed at a
 * component's definition: a `surface` draws `display: flex` and so does a `frame`, the element was
 * replaced because the type changed — and the new one came out `display: block`, with every *other*
 * declaration in place.
 *
 * Which is the shape of the fault: the style was diffed against the vnode it replaced, and a
 * property both of them declare the same way was skipped. Skipping is right for an element that is
 * being kept and wrong for one that has just been made, because a new element has none of it.
 */
describe('a root that changes type', () => {
  let host: HTMLElement;
  let renderer: DOMRenderer;

  beforeEach(() => {
    define('page', element('section', { className: 'page', style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, [slot('content')]));
    define('stack', element('div', { className: 'stack', style: { display: 'flex', flexDirection: 'row', gap: '16px' } }, [slot('content')]));
    define('card', element('div', { className: 'card' }, [data('attributes.name')]));

    host = document.createElement('div');
    document.body.appendChild(host);
    renderer = new DOMRenderer(getGlobalRegistry());
  });

  const render = (stype: string, sid: string) =>
    renderer.render(
      host,
      { sid, stype, content: [{ sid: `${sid}-a`, stype: 'card', attributes: { name: 'a' } }] } as never,
      [],
      undefined
    );

  it('draws the first one as its template says', () => {
    render('page', 'p1');
    const drawn = host.firstElementChild as HTMLElement;
    expect(drawn.tagName).toBe('SECTION');
    expect(drawn.style.display).toBe('flex');
    expect(drawn.style.flexDirection).toBe('column');
  });

  it('gives the replacement everything, including what the old one also had', () => {
    render('page', 'p1');
    render('stack', 's1');

    const drawn = host.firstElementChild as HTMLElement;
    expect(drawn.tagName).toBe('DIV');
    expect(drawn.style.flexDirection).toBe('row');
    // The one both templates declare the same way — and the one that went missing.
    expect(drawn.style.display).toBe('flex');
    expect(drawn.style.gap).toBe('16px');
  });

  it('does the same for a child that changes type', () => {
    renderer.render(host, { sid: 'r', stype: 'page', content: [{ sid: 'x', stype: 'page', content: [] }] } as never, [], undefined);
    renderer.render(host, { sid: 'r', stype: 'page', content: [{ sid: 'x', stype: 'stack', content: [] }] } as never, [], undefined);

    const child = host.querySelector<HTMLElement>('[data-bc-sid="x"]')!;
    expect(child.tagName).toBe('DIV');
    expect(child.style.display).toBe('flex');
    expect(child.style.flexDirection).toBe('row');
  });
});
