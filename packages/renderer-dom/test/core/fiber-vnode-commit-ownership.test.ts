import { afterEach, describe, expect, it } from 'vitest';
import { DOMRenderer } from '../../src/dom-renderer';
import type { VNode } from '../../src/vnode/types';

const renderers: DOMRenderer[] = [];

afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy();
  document.body.replaceChildren();
});

function fixture() {
  const renderer = new DOMRenderer();
  renderers.push(renderer);
  const container = document.createElement('div');
  document.body.append(container);
  let completed = 0;
  return {
    container,
    commit(input: VNode) {
      // Exercise the renderer's actual Reconciler, scheduler and commit path.
      // Root metadata belongs to the reconciler; descendant input stays external.
      const before = JSON.parse(JSON.stringify(input.children));
      const previousCompletions = completed;
      renderer['reconciler'].reconcile(container, input, { sid: 'ownership-root' }, undefined,
        () => completed++);
      expect(completed).toBe(previousCompletions + 1);
      expect(renderer['reconciler']['rootFiber']?.vnode).toBe(input);
      expect(input.children).toEqual(before);
      const host = container.querySelector<HTMLElement>('[data-host="mixed"]');
      expect(host).not.toBeNull();
      return host!;
    }
  };
}

function item(key: string, text: string): VNode {
  return { tag: 'span', key, sid: `ownership-${key}`, attrs: { 'data-item': key },
    style: { color: 'red' }, meta: { inputMarker: key }, text };
}

function input(children: VNode['children']): VNode {
  return { tag: 'article', sid: 'ownership-root', children: [
    { tag: 'section', key: 'host', sid: 'ownership-host', attrs: { 'data-host': 'mixed' }, children }
  ] };
}

function order(host: HTMLElement): string[] {
  return [...host.childNodes].map(node => node.nodeType === Node.TEXT_NODE
    ? `text:${node.textContent}`
    : `${(node as Element).getAttribute('data-item')}:${node.textContent}`);
}

function assertOrder(host: HTMLElement, phase: string, expected: string[]) {
  const actual = order(host);
  console.info('FIBER_COMMIT_OWNERSHIP', JSON.stringify({ phase, actual, html: host.innerHTML }));
  expect(actual, phase).toEqual(expected);
}

describe('actual committed descendant VNode ownership', () => {
  it('keeps keyed elements and primitive text ordered on mount, update and reorder', () => {
    const native = fixture();
    const mounted = native.commit(input([item('a', 'A'), 'middle', item('b', 'B')]));
    assertOrder(mounted, 'mixed mount', ['a:A', 'text:middle', 'b:B']);
    const a = mounted.querySelector('[data-item="a"]');
    const b = mounted.querySelector('[data-item="b"]');
    const literal = [...mounted.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();

    const updated = native.commit(input([item('a', 'A2'), 'updated', item('b', 'B2')]));
    expect(updated).toBe(mounted);
    expect(updated.querySelector('[data-item="a"]')).toBe(a);
    expect(updated.querySelector('[data-item="b"]')).toBe(b);
    assertOrder(updated, 'mixed update', ['a:A2', 'text:updated', 'b:B2']);
    expect([...updated.childNodes].find(node => node.nodeType === Node.TEXT_NODE)).toBe(literal);

    const reordered = native.commit(input([item('b', 'B3'), 'moved', item('a', 'A3')]));
    expect(reordered).toBe(mounted);
    expect(reordered.querySelector('[data-item="a"]')).toBe(a);
    expect(reordered.querySelector('[data-item="b"]')).toBe(b);
    assertOrder(reordered, 'mixed reorder', ['b:B3', 'text:moved', 'a:A3']);
    expect([...reordered.childNodes].find(node => node.nodeType === Node.TEXT_NODE)).toBe(literal);
  });

  it('keeps multiple fragment hosts before following primitive text through updates and reordering', () => {
    const native = fixture();
    const fragment = (children: VNode[]): VNode => ({ key: 'fragment', children });
    const mounted = native.commit(input([
      fragment([item('a', 'A'), item('b', 'B')]), 'tail', item('c', 'C')
    ]));
    assertOrder(mounted, 'fragment mount', ['a:A', 'b:B', 'text:tail', 'c:C']);
    const a = mounted.querySelector('[data-item="a"]');
    const b = mounted.querySelector('[data-item="b"]');
    const c = mounted.querySelector('[data-item="c"]');

    const updated = native.commit(input([
      fragment([item('a', 'A2'), item('b', 'B2')]), 'updated tail', item('c', 'C2')
    ]));
    expect(updated).toBe(mounted);
    expect(updated.querySelector('[data-item="a"]')).toBe(a);
    expect(updated.querySelector('[data-item="b"]')).toBe(b);
    expect(updated.querySelector('[data-item="c"]')).toBe(c);
    assertOrder(updated, 'fragment update', ['a:A2', 'b:B2', 'text:updated tail', 'c:C2']);

    const reordered = native.commit(input([
      fragment([item('b', 'B3'), item('a', 'A3')]), 'moved tail', item('c', 'C3')
    ]));
    expect(reordered.querySelector('[data-item="a"]')).toBe(a);
    expect(reordered.querySelector('[data-item="b"]')).toBe(b);
    expect(reordered.querySelector('[data-item="c"]')).toBe(c);
    assertOrder(reordered, 'fragment reorder', ['b:B3', 'a:A3', 'text:moved tail', 'c:C3']);

    const deleted = native.commit(input([fragment([item('b', 'B4')]), 'last tail', item('c', 'C4')]));
    expect(deleted.querySelector('[data-item="a"]')).toBeNull();
    expect(deleted.querySelector('[data-item="b"]')).toBe(b);
    expect(deleted.querySelector('[data-item="c"]')).toBe(c);
    assertOrder(deleted, 'fragment deletion', ['b:B4', 'text:last tail', 'c:C4']);
  });

  it('keeps multiple adjacent literals distinct through updates', () => {
    const native = fixture();
    const mounted = native.commit(input([item('a', 'A'), 'one', 'two', 3, item('b', 'B')]));
    assertOrder(mounted, 'adjacent mount', ['a:A', 'text:one', 'text:two', 'text:3', 'b:B']);
    const updated = native.commit(input([item('a', 'A2'), 'first', 'second', 4, item('b', 'B2')]));
    assertOrder(updated, 'adjacent update', ['a:A2', 'text:first', 'text:second', 'text:4', 'b:B2']);
  });

  it('preserves a tagged Text VNode beside primitive text', () => {
    const native = fixture();
    const text = (value: string): VNode => ({ tag: '#text', key: 'native-text', text: value });
    const mounted = native.commit(input([item('a', 'A'), 'before', text('owned'), 'after', item('b', 'B')]));
    assertOrder(mounted, 'text vnode mount', ['a:A', 'text:before', 'text:owned', 'text:after', 'b:B']);
    const owned = [...mounted.childNodes].find(node => node.textContent === 'owned');
    const updated = native.commit(input([item('a', 'A2'), 'first', text('owned2'), 'last', item('b', 'B2')]));
    assertOrder(updated, 'text vnode update', ['a:A2', 'text:first', 'text:owned2', 'text:last', 'b:B2']);
    expect([...updated.childNodes].find(node => node.textContent === 'owned2')).toBe(owned);
  });

  it('does not reuse a nested fragment literal as its enclosing host literal', () => {
    const native = fixture();
    const children = (suffix: string): VNode['children'] => [
      { key: 'outer', children: [
        item('a', `A${suffix}`), { key: 'inner', children: [`inner${suffix}`, item('b', `B${suffix}`)] },
        `fragment${suffix}`
      ] },
      `host${suffix}`, item('c', `C${suffix}`)
    ];
    const mounted = native.commit(input(children('')));
    assertOrder(mounted, 'nested literal mount', ['a:A', 'text:inner', 'b:B', 'text:fragment', 'text:host', 'c:C']);
    const updated = native.commit(input(children('2')));
    assertOrder(updated, 'nested literal update', ['a:A2', 'text:inner2', 'b:B2', 'text:fragment2', 'text:host2', 'c:C2']);
  });

  it('keeps a prefix before literal-only fragments, including duplicate values', () => {
    const native = fixture();
    const children = (prefix: string, inner: string): VNode['children'] => [
      prefix, { key: 'literal-fragment', children: [inner, { key: 'nested', children: [inner] }] }, item('c', 'C')
    ];
    const mounted = native.commit(input(children('prefix', 'same')));
    assertOrder(mounted, 'literal fragment mount', ['text:prefix', 'text:same', 'text:same', 'c:C']);
    const updated = native.commit(input(children('prefix2', 'same2')));
    assertOrder(updated, 'literal fragment update', ['text:prefix2', 'text:same2', 'text:same2', 'c:C']);
  });

  it('keeps root fragment cleanup responsible for removed concrete children', () => {
    const native = fixture();
    const root = (stale: boolean): VNode => ({ sid: 'ownership-root', children: [
      { tag: 'section', sid: 'ownership-host', attrs: { 'data-host': 'mixed' }, children: ['current'] },
      ...(stale ? [item('stale', 'removed')] : [])
    ] });
    native.commit(root(true));
    expect(native.container.querySelector('[data-item="stale"]')).not.toBeNull();
    const updated = native.commit(root(false));
    expect(native.container.querySelector('[data-item="stale"]')).toBeNull();
    assertOrder(updated, 'root fragment cleanup', ['text:current']);
  });
});
