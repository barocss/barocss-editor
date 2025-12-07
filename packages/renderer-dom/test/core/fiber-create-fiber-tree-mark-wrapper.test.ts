import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import { VNode } from '../../src/vnode/types';

describe('createFiberTree - Mark Wrapper prevChildVNode 찾기', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container.innerHTML = '';
  });

  it('mark wrapper의 prevChildVNode를 인덱스로 찾을 수 있어야 함', () => {
    // VNode from first render
    const prevVNode: VNode = {
      tag: 'span',
      stype: 'inline-text',
      sid: 'text-1',
      children: [
        {
          tag: 'span',
          attrs: {
            class: 'mark-bold'
          },
          children: ['Hello']
        } as VNode
      ]
    };

    // VNode from second render
    const vnode: VNode = {
      tag: 'span',
      stype: 'inline-text',
      sid: 'text-1',
      children: [
        {
          tag: 'span',
          attrs: {
            class: 'mark-bold'
          },
          children: ['Hello World']
        } as VNode
      ]
    };

    // Create Fiber with createFiberTree
    const fiber = createFiberTree(container, vnode, prevVNode, {});

    // Find mark wrapper Fiber
    const markWrapperFiber = fiber.child;
    expect(markWrapperFiber).toBeTruthy();
    expect(markWrapperFiber?.vnode.tag).toBe('span');
    expect(markWrapperFiber?.vnode.attrs?.class).toBe('mark-bold');
    
    // Verify prevVNode is set correctly
    expect(markWrapperFiber?.prevVNode).toBeTruthy();
    expect(markWrapperFiber?.prevVNode?.tag).toBe('span');
    expect(markWrapperFiber?.prevVNode?.attrs?.class).toBe('mark-bold');
  });

  it('mark wrapper의 prevChildVNode를 클래스로 찾을 수 있어야 함', () => {
    // VNode from first render (primitive text first)
    const prevVNode: VNode = {
      tag: 'span',
      stype: 'inline-text',
      sid: 'text-1',
      children: [
        {
          tag: 'span',
          attrs: {
            class: 'mark-bold'
          },
          children: ['Hello']
        } as VNode
      ]
    };

    // VNode from second render
    const vnode: VNode = {
      tag: 'span',
      stype: 'inline-text',
      sid: 'text-1',
      children: [
        {
          tag: 'span',
          attrs: {
            class: 'mark-bold'
          },
          children: ['Hello World']
        } as VNode
      ]
    };

    // Create Fiber with createFiberTree
    const fiber = createFiberTree(container, vnode, prevVNode, {});

    // Find mark wrapper Fiber
    const markWrapperFiber = fiber.child;
    
    expect(markWrapperFiber).toBeTruthy();
    expect(markWrapperFiber?.vnode.tag).toBe('span');
    expect(markWrapperFiber?.vnode.attrs?.class).toBe('mark-bold');
    
    // Verify prevVNode is set correctly
    expect(markWrapperFiber?.prevVNode).toBeTruthy();
    expect(markWrapperFiber?.prevVNode?.tag).toBe('span');
    expect(markWrapperFiber?.prevVNode?.attrs?.class).toBe('mark-bold');
  });
});

