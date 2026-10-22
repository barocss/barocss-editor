import { describe, expect, it } from 'vitest';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import type { FiberNode } from '../../src/reconcile/fiber/types';
import type { VNode } from '../../src/vnode/types';

function fibers(root: FiberNode): FiberNode[] {
  const result: FiberNode[] = [];
  const pending = [root];
  while (pending.length) {
    const fiber = pending.pop()!;
    result.push(fiber);
    if (fiber.child) pending.push(fiber.child);
    if (fiber.sibling) pending.push(fiber.sibling);
  }
  return result;
}

/** Count only VNodes reachable through the current Fiber and VNode trees. */
function retainedVNodes(root: FiberNode): Set<VNode> {
  const seen = new Set<VNode>();
  const pending = fibers(root).map((fiber) => fiber.vnode);
  while (pending.length) {
    const vnode = pending.pop()!;
    if (seen.has(vnode)) continue;
    seen.add(vnode);
    for (const child of vnode.children ?? []) {
      if (typeof child === 'object' && child !== null) pending.push(child as VNode);
    }
  }
  return seen;
}

function chain(length: number): VNode {
  let vnode: VNode = { tag: 'span', sid: `node-${length - 1}`, text: 'leaf' };
  for (let index = length - 2; index >= 0; index--) {
    vnode = { tag: 'div', sid: `node-${index}`, children: [vnode] };
  }
  return vnode;
}

function binary(depth: number, sid = 'root'): VNode {
  return {
    tag: 'div', sid,
    children: depth ? [binary(depth - 1, `${sid}-a`), binary(depth - 1, `${sid}-b`)] : ['leaf']
  };
}

describe('current Fiber VNode ownership', () => {
  it.each([
    ['chain', () => chain(10), 10, 19],
    ['branching tree', () => binary(3), 15, 29]
  ] as const)('keeps one owned descendant tree for a %s', (_name, build, count, retained) => {
    const input = build();
    const root = createFiberTree(document.createElement('div'), input, undefined, {});
    const all = fibers(root);
    const current = retainedVNodes(root).size;
    console.log('FIBER_VNODE_OWNERSHIP', { shape: _name, fibers: all.length, retained: current });
    expect(root.vnode).toBe(input);
    expect(all).toHaveLength(count);
    expect(current).toBe(retained);
    for (const fiber of all.slice(1)) {
      if (fiber.parentFiber !== root) {
        expect(fiber.parentFiber?.vnode.children?.[fiber.index]).toBe(fiber.vnode);
      }
    }
  });

  it('isolates mutable descendant bags and arrays while preserving external references', () => {
    const model = { value: 'external model' };
    const props = { value: 'external props' };
    const target = document.createElement('aside');
    const leaf: VNode & { model: typeof model } = {
      tag: 'span', sid: 'leaf', attrs: { title: 'original' }, style: { color: 'red' },
      meta: { domElement: target }, props, model, children: ['text']
    };
    const branch: VNode = { tag: 'div', sid: 'branch', children: [leaf, 'tail', 42] };
    const input: VNode = { tag: 'div', sid: 'root', children: [branch] };
    const root = createFiberTree(document.createElement('div'), input, undefined, {});
    const ownedBranch = root.child!.vnode;
    const ownedLeaf = root.child!.child!.vnode;

    expect(ownedBranch).not.toBe(branch);
    expect(ownedBranch.children).not.toBe(branch.children);
    expect(ownedLeaf).not.toBe(leaf);
    expect(ownedLeaf.attrs).not.toBe(leaf.attrs);
    expect(ownedLeaf.style).not.toBe(leaf.style);
    expect(ownedLeaf.meta).not.toBe(leaf.meta);
    expect(ownedLeaf.children).not.toBe(leaf.children);
    expect(ownedLeaf.props).toBe(props);
    expect((ownedLeaf as VNode & { model: typeof model }).model).toBe(model);
    expect(ownedLeaf.meta?.domElement).toBe(target);
    expect(ownedBranch.children?.[0]).toBe(ownedLeaf);
    expect(ownedBranch.children?.slice(1)).toEqual(['tail', 42]);

    ownedLeaf.attrs!.title = 'changed';
    ownedLeaf.style!.color = 'blue';
    ownedLeaf.meta!.domElement = document.createElement('b');
    ownedLeaf.children!.push('new');
    expect(leaf.attrs!.title).toBe('original');
    expect(leaf.style!.color).toBe('red');
    expect(leaf.meta!.domElement).toBe(target);
    expect(leaf.children).toEqual(['text']);
    expect(branch.children).toEqual([leaf, 'tail', 42]);
  });

  it('owns fragments and text VNodes that omit the tag property', () => {
    const text: VNode = { text: 'original', meta: { probe: 'original' } };
    const fragment: VNode = { children: [text] };
    const input: VNode = { tag: 'div', children: [{ tag: 'section', children: [fragment] }] };
    const root = createFiberTree(document.createElement('div'), input, undefined, {});
    const ownedFragment = root.child!.child!.vnode;
    const ownedText = root.child!.child!.child!.vnode;
    expect(ownedFragment).not.toBe(fragment);
    expect(ownedFragment.children).not.toBe(fragment.children);
    expect(ownedFragment.children?.[0]).toBe(ownedText);
    expect(ownedText).not.toBe(text);
    ownedText.text = 'changed';
    ownedText.meta!.probe = 'changed';
    expect(text.text).toBe('original');
    expect(text.meta!.probe).toBe('original');
  });

  it('inherits missing descendant IDs into the same owned tree without changing input', () => {
    const previousLeaf: VNode = {
      tag: 'span', sid: 'inherited-leaf', stype: 'leaf', text: 'old', meta: { sidInherited: true }
    };
    const previous: VNode = {
      tag: 'div', sid: 'root', children: [
        { tag: 'section', sid: 'branch', children: [previousLeaf] }
      ]
    };
    const previousFiber = createFiberTree(document.createElement('div'), previous, undefined, {});
    const nextLeaf: VNode = { tag: 'span', stype: 'leaf', text: 'new' };
    const nextBranch: VNode = { tag: 'section', sid: 'branch', children: [nextLeaf] };
    const next: VNode = { tag: 'div', sid: 'root', children: [nextBranch] };
    const root = createFiberTree(document.createElement('div'), next, previous, {}, null, 0, previousFiber);
    const leaf = root.child!.child!;
    expect(leaf.vnode.sid).toBe('inherited-leaf');
    expect(leaf.alternate).toBe(previousFiber.child!.child);
    expect(leaf.prevVNode).toBe(previousFiber.child!.child!.vnode);
    expect(root.child!.vnode.children?.[0]).toBe(leaf.vnode);
    expect(nextLeaf.sid).toBeUndefined();
    expect(next.children?.[0]).toBe(nextBranch);
    expect(nextBranch.children?.[0]).toBe(nextLeaf);
  });
});
