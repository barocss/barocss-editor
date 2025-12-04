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
    // 첫 번째 render의 VNode
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

    // 두 번째 render의 VNode
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

    // createFiberTree로 Fiber 생성
    const fiber = createFiberTree(container, vnode, prevVNode, {});

    // mark wrapper Fiber 찾기
    const markWrapperFiber = fiber.child;
    expect(markWrapperFiber).toBeTruthy();
    expect(markWrapperFiber?.vnode.tag).toBe('span');
    expect(markWrapperFiber?.vnode.attrs?.class).toBe('mark-bold');
    
    // prevVNode가 올바르게 설정되었는지 확인
    expect(markWrapperFiber?.prevVNode).toBeTruthy();
    expect(markWrapperFiber?.prevVNode?.tag).toBe('span');
    expect(markWrapperFiber?.prevVNode?.attrs?.class).toBe('mark-bold');
  });

  it('mark wrapper의 prevChildVNode를 클래스로 찾을 수 있어야 함', () => {
    // 첫 번째 render의 VNode (primitive text가 먼저)
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

    // 두 번째 render의 VNode
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

    // createFiberTree로 Fiber 생성
    const fiber = createFiberTree(container, vnode, prevVNode, {});

    // mark wrapper Fiber 찾기
    const markWrapperFiber = fiber.child;
    
    expect(markWrapperFiber).toBeTruthy();
    expect(markWrapperFiber?.vnode.tag).toBe('span');
    expect(markWrapperFiber?.vnode.attrs?.class).toBe('mark-bold');
    
    // prevVNode가 올바르게 설정되었는지 확인
    expect(markWrapperFiber?.prevVNode).toBeTruthy();
    expect(markWrapperFiber?.prevVNode?.tag).toBe('span');
    expect(markWrapperFiber?.prevVNode?.attrs?.class).toBe('mark-bold');
  });
});

