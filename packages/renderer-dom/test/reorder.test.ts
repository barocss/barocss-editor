import { describe, it, expect, beforeEach } from 'vitest';
import { data, define, element, getGlobalRegistry, slot } from '@barocss/dsl';
import { DOMRenderer } from '../src/dom-renderer';

/**
 * Siblings that have changed places.
 *
 * A document reorders its children constantly — a slide moved in the filmstrip, a block moved up, a
 * card dragged along a row — and the drawing has to follow. Found in a site builder: the model held
 * `[b, c, a]` and the page drew `[c, b, a]`, so a reader's drag looked like it had shuffled two
 * blocks it never touched.
 */
describe('a list whose children change places', () => {
  let host: HTMLElement;
  let renderer: DOMRenderer;

  const tree = (order: string[]) => ({
    sid: 'root',
    stype: 'stack',
    content: order.map((name) => ({ sid: name, stype: 'card', attributes: { name } }))
  });

  const drawn = () =>
    [...host.querySelectorAll('[data-bc-sid]')].map((el) => el.getAttribute('data-bc-sid'));

  beforeEach(() => {
    define('stack', element('div', { className: 'stack' }, [slot('content')]));
    define('card', element('div', { className: 'card' }, [data('attributes.name')]));

    host = document.createElement('div');
    document.body.appendChild(host);
    renderer = new DOMRenderer(getGlobalRegistry());
  });

  const render = (order: string[]) => renderer.render(host, tree(order) as never, [], undefined);

  it('draws them in the order it was given', () => {
    render(['a', 'b', 'c']);
    expect(drawn()).toEqual(['root', 'a', 'b', 'c']);
  });

  it('follows one moved to the end', () => {
    render(['a', 'b', 'c']);
    render(['b', 'c', 'a']);
    expect(drawn()).toEqual(['root', 'b', 'c', 'a']);
  });

  it('follows one moved to the front', () => {
    render(['a', 'b', 'c']);
    render(['c', 'a', 'b']);
    expect(drawn()).toEqual(['root', 'c', 'a', 'b']);
  });

  it('follows two that swapped', () => {
    render(['a', 'b', 'c']);
    render(['a', 'c', 'b']);
    expect(drawn()).toEqual(['root', 'a', 'c', 'b']);
  });

  it('follows a reversal', () => {
    render(['a', 'b', 'c', 'd']);
    render(['d', 'c', 'b', 'a']);
    expect(drawn()).toEqual(['root', 'd', 'c', 'b', 'a']);
  });
});

/**
 * Children that go away.
 *
 * Found next to the reordering, and by the same route: a site builder deleted a section, the model
 * held three and the page went on drawing four. A drawing that keeps something the document has let
 * go of is worse than one that is late — a reader clicks it, and it is not there.
 */
describe('a list whose children go away', () => {
  let host: HTMLElement;
  let renderer: DOMRenderer;

  const tree = (order: string[]) => ({
    sid: 'root',
    stype: 'stack',
    content: order.map((name) => ({ sid: name, stype: 'card', attributes: { name } }))
  });

  const drawn = () =>
    [...host.querySelectorAll('[data-bc-sid]')].map((el) => el.getAttribute('data-bc-sid'));

  beforeEach(() => {
    define('stack', element('div', { className: 'stack' }, [slot('content')]));
    define('card', element('div', { className: 'card' }, [data('attributes.name')]));
    host = document.createElement('div');
    document.body.appendChild(host);
    renderer = new DOMRenderer(getGlobalRegistry());
  });

  const render = (order: string[]) => renderer.render(host, tree(order) as never, [], undefined);

  it('drops one from the middle', () => {
    render(['a', 'b', 'c']);
    render(['a', 'c']);
    expect(drawn()).toEqual(['root', 'a', 'c']);
  });

  it('drops the last', () => {
    render(['a', 'b', 'c']);
    render(['a', 'b']);
    expect(drawn()).toEqual(['root', 'a', 'b']);
  });

  it('drops the first', () => {
    render(['a', 'b', 'c']);
    render(['b', 'c']);
    expect(drawn()).toEqual(['root', 'b', 'c']);
  });

  it('drops one and reorders the rest at the same time', () => {
    render(['a', 'b', 'c', 'd']);
    render(['d', 'b']);
    expect(drawn()).toEqual(['root', 'd', 'b']);
  });

  it('drops all of them', () => {
    render(['a', 'b', 'c']);
    render([]);
    expect(drawn()).toEqual(['root']);
  });
});
