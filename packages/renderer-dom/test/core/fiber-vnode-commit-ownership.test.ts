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
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();

    const updated = native.commit(input([item('a', 'A2'), 'updated', item('b', 'B2')]));
    expect(updated).toBe(mounted);
    expect(updated.querySelector('[data-item="a"]')).toBe(a);
    expect(updated.querySelector('[data-item="b"]')).toBe(b);
    assertOrder(updated, 'mixed update', ['a:A2', 'text:updated', 'b:B2']);

    const reordered = native.commit(input([item('b', 'B3'), 'moved', item('a', 'A3')]));
    expect(reordered).toBe(mounted);
    expect(reordered.querySelector('[data-item="a"]')).toBe(a);
    expect(reordered.querySelector('[data-item="b"]')).toBe(b);
    assertOrder(reordered, 'mixed reorder', ['b:B3', 'text:moved', 'a:A3']);
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
  });
});
