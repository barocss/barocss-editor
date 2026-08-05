import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, getGlobalRegistry, slot } from '@barocss/dsl';
import { DOMRenderer } from '../src/dom-renderer';

/**
 * A node's id is stamped onto every element of that node's template, so that a
 * DOM mutation anywhere inside it can be traced back to the node it belongs to.
 * That makes the id an answer to "who owns this element" — which is not the same
 * question as "which element is this", and only the second one works as identity
 * among siblings.
 *
 * Reconciliation was asking the first and using the answer for the second. A
 * template drawing three page sheets gave all three the owner's id, so adding a
 * fourth matched it against an existing sheet instead of inserting it: the
 * layout said four pages and the screen kept showing three.
 */
describe('elements a template draws, sharing their owner’s id', () => {
  beforeEach(() => getGlobalRegistry().clear?.());

  const model = { sid: 'n1', stype: 'panel', content: [] };

  /** A node whose template draws a variable number of unkeyed boxes. */
  const definePanel = () =>
    define('panel', (_props: any, _model: any, ctx: any) =>
      element('div', { className: 'panel' }, [
        element(
          'div',
          { className: 'boxes' },
          Array.from({ length: (ctx?.env?.count as number) ?? 0 }, (_, i) =>
            element('div', { className: 'box', 'data-index': String(i) })
          )
        ),
        slot('content')
      ])
    );

  it('still carries the owner’s id in the DOM, which the input path needs', () => {
    definePanel();
    const host = document.createElement('div');
    new DOMRenderer(getGlobalRegistry(), { env: { count: 2 } }).render(host, model as any);

    // Every element of the template, not just the root: a mutation inside any of
    // them has to resolve to the node that owns it.
    for (const el of Array.from(host.querySelectorAll('div'))) {
      expect(el.getAttribute('data-bc-sid')).toBe('n1');
    }
  });

  it('adds a sibling rather than matching it against an existing one', () => {
    definePanel();
    const host = document.createElement('div');
    const renderer = new DOMRenderer(getGlobalRegistry(), { env: { count: 3 } });

    renderer.render(host, model as any);
    expect(host.querySelectorAll('.box')).toHaveLength(3);

    renderer.setEnv({ count: 4 });
    renderer.render(host, model as any);
    expect(host.querySelectorAll('.box')).toHaveLength(4);

    // ...and they are still in order
    expect(
      Array.from(host.querySelectorAll('.box')).map((el) => el.getAttribute('data-index'))
    ).toEqual(['0', '1', '2', '3']);
  });

  it('removes siblings when there are fewer of them', () => {
    definePanel();
    const host = document.createElement('div');
    const renderer = new DOMRenderer(getGlobalRegistry(), { env: { count: 4 } });

    renderer.render(host, model as any);
    renderer.setEnv({ count: 2 });
    renderer.render(host, model as any);

    expect(host.querySelectorAll('.box')).toHaveLength(2);
  });

  it('keeps model children keyed by their own id, which is identity', () => {
    // The fix must not reach model nodes: their ids do say which sibling is
    // which, and reordering them has to move DOM rather than rebuild it.
    define('item', element('p', { className: 'item' }, [slot('content')]));
    define('list', element('div', { className: 'list' }, [slot('content')]));

    const host = document.createElement('div');
    const renderer = new DOMRenderer(getGlobalRegistry());

    const list = (order: string[]) => ({
      sid: 'list',
      stype: 'list',
      content: order.map((sid) => ({ sid, stype: 'item', content: [] }))
    });

    renderer.render(host, list(['a', 'b', 'c']) as any);
    const before = Array.from(host.querySelectorAll('.item'));

    renderer.render(host, list(['c', 'a', 'b']) as any);
    const after = Array.from(host.querySelectorAll('.item'));

    expect(after.map((el) => el.getAttribute('data-bc-sid'))).toEqual(['c', 'a', 'b']);
    // the same elements, moved — not three new ones
    expect(after.every((el) => before.includes(el))).toBe(true);
  });
});
