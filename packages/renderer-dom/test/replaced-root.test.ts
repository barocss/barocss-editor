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

/**
 * A node that changes **type while keeping its sid** — the shape a detach has.
 *
 * Found in the site builder: `transformNode` turned a placed component into a frame, the document
 * held the result perfectly, and the block **disappeared off the page**. Two faults, one behind the
 * other, and the first one hid the second.
 *
 * - The reconciler asked whether the DOM could be reused by comparing **tags**, and a placement and
 *   a frame both draw a `div`. So it took the update path and kept the element — and then
 *   `ComponentManager.updateComponent`, which compares `stype` and is right to, unmounted the old
 *   component and took that very element out of the document, leaving the new one nothing to attach
 *   to. Two answers to "is this the same thing", one of them made after the other had already acted.
 * - With the element back, everything **inside** it was gone: the children found alternates in the
 *   old subtree, called themselves updates, and reused DOM elements that had just been removed with
 *   their old parent. React deletes the old fiber and mounts fresh; this handed the history down.
 */
describe('a node that changes type and keeps its sid', () => {
  let host: HTMLElement;
  let renderer: DOMRenderer;

  beforeEach(() => {
    define('boardT', element('section', { className: 'board' }, [slot('content')]));
    define('placedT', element('div', { className: 'placed' }, [slot('content')]));
    define('frameT', element('div', { className: 'framed' }, [slot('content')]));
    define('wordT', element('p', { className: 'word' }, [data('attributes.name')]));

    host = document.createElement('div');
    document.body.appendChild(host);
    renderer = new DOMRenderer(getGlobalRegistry());
  });

  const draw = (childType: string) =>
    renderer.render(
      host,
      {
        sid: 'board',
        stype: 'boardT',
        content: [
          {
            sid: 'block',
            stype: childType,
            content: [{ sid: 'w', stype: 'wordT', attributes: { name: '안녕' } }]
          }
        ]
      } as never,
      [],
      undefined
    );

  it('draws the new type, in the same place, where two types share an element', () => {
    draw('placedT');
    draw('frameT');

    const block = host.querySelector<HTMLElement>('[data-bc-sid="block"]');
    expect(block).not.toBeNull();
    expect(block!.className).toBe('framed');
    // One element, not two: the old one is taken out rather than left beside the new one.
    expect(host.querySelectorAll('[data-bc-sid="block"]')).toHaveLength(1);
  });

  it('keeps what was inside it', () => {
    draw('placedT');
    draw('frameT');

    const block = host.querySelector<HTMLElement>('[data-bc-sid="block"]')!;
    expect(block.querySelector('[data-bc-sid="w"]')?.textContent).toBe('안녕');
  });

  it('does the same when the two types draw different elements', () => {
    define('asideT', element('aside', { className: 'framed' }, [slot('content')]));
    draw('placedT');
    renderer.render(
      host,
      {
        sid: 'board',
        stype: 'boardT',
        content: [
          { sid: 'block', stype: 'asideT', content: [{ sid: 'w', stype: 'wordT', attributes: { name: '안녕' } }] }
        ]
      } as never,
      [],
      undefined
    );

    const block = host.querySelector<HTMLElement>('[data-bc-sid="block"]')!;
    expect(block.tagName).toBe('ASIDE');
    expect(block.querySelector('[data-bc-sid="w"]')?.textContent).toBe('안녕');
  });
});
