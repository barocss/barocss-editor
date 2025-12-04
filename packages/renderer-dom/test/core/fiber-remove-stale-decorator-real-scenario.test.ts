import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import { reconcileFiberNode, removeStaleChildren, FiberReconcileDependencies } from '../../src/reconcile/fiber/fiber-reconciler';
import { FiberNode } from '../../src/reconcile/fiber/types';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

// 헬퍼 함수: 모든 Fiber를 재귀적으로 처리
function reconcileAllFibers(fiber: FiberNode, deps: FiberReconcileDependencies, context: any): void {
  reconcileFiberNode(fiber, deps, context);
  
  // 자식 Fiber 처리
  let childFiber = fiber.child;
  while (childFiber) {
    reconcileAllFibers(childFiber, deps, context);
    childFiber = childFiber.sibling;
  }
  
  // 부모로 돌아갈 때 removeStaleChildren 호출 (실제 reconcileWithFiber와 동일한 로직)
  removeStaleChildren(fiber, deps);
}

describe('removeStaleChildren - 실제 시나리오: decorator 변경', () => {
  let container: HTMLElement;
  let deps: FiberReconcileDependencies;
  let dom: DOMOperations;
  let components: ComponentManager;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    dom = new DOMOperations();
    components = {
      mountComponent: () => {},
      updateComponent: () => {},
      unmountComponent: () => {},
      getComponentInstance: () => null
    } as any;
    
    deps = {
      dom,
      components,
      currentVisitedPortalIds: null,
      portalHostsById: new Map()
    };
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container.innerHTML = '';
  });

  it('chip-before에서 chip-after로 변경 시 chip-before가 제거되어야 함', () => {
    // 첫 번째 render: chip-before decorator
    const prevVNode: VNode = {
      tag: 'div',
      stype: 'document',
      sid: 'doc-1',
      children: [
        {
          tag: 'span',
          stype: 'inline-text',
          sid: 'text-14',
          children: [
            {
              tag: 'span',
              attrs: {
                'data-decorator-sid': 'chip-before',
                'data-decorator-stype': 'chip',
                'data-decorator-category': 'inline',
                'data-decorator-position': 'before'
              },
              children: ['CHIP']
            } as VNode,
            'Hello World'
          ]
        } as VNode
      ]
    };

    // 두 번째 render: chip-after decorator (chip-before 제거됨)
    const nextVNode: VNode = {
      tag: 'div',
      stype: 'document',
      sid: 'doc-1',
      children: [
        {
          tag: 'span',
          stype: 'inline-text',
          sid: 'text-14',
          children: [
            'Test Text',
            {
              tag: 'span',
              attrs: {
                'data-decorator-sid': 'chip-after',
                'data-decorator-stype': 'chip',
                'data-decorator-category': 'inline',
                'data-decorator-position': 'after'
              },
              children: ['CHIP']
            } as VNode
          ]
        } as VNode
      ]
    };

    // 첫 번째 render
    const prevFiber = createFiberTree(container, prevVNode, undefined, {});
    reconcileAllFibers(prevFiber, deps, {});
    
    // DOM 확인: chip-before가 있어야 함
    const textEl1 = container.querySelector('[data-bc-sid="text-14"]');
    expect(textEl1).toBeTruthy();
    const chipBefore1 = textEl1?.querySelector('[data-decorator-sid="chip-before"]');
    expect(chipBefore1).toBeTruthy();

    // 두 번째 render
    const nextFiber = createFiberTree(container, nextVNode, prevVNode, {});
    reconcileAllFibers(nextFiber, deps, {});

    // DOM 확인: chip-before가 제거되어야 함
    const textEl2 = container.querySelector('[data-bc-sid="text-14"]');
    expect(textEl2).toBeTruthy();
    const chipBefore2 = textEl2?.querySelector('[data-decorator-sid="chip-before"]');
    const chipAfter = textEl2?.querySelector('[data-decorator-sid="chip-after"]');
    
    // eslint-disable-next-line no-console
    console.log('Final DOM:', textEl2?.innerHTML);
    
    expect(chipBefore2).toBeFalsy();
    expect(chipAfter).toBeTruthy();
  });

  it('removeStaleChildren이 text-14 Fiber에서 올바르게 작동하는지 확인', () => {
    // document 모델로 시작
    const prevVNode: VNode = {
      tag: 'div',
      stype: 'document',
      sid: 'doc-1',
      children: [
        {
          tag: 'span',
          stype: 'inline-text',
          sid: 'text-14',
          children: [
            {
              tag: 'span',
              attrs: {
                'data-decorator-sid': 'chip-before',
                'data-decorator-stype': 'chip',
                'data-decorator-category': 'inline',
                'data-decorator-position': 'before'
              },
              children: ['CHIP']
            } as VNode,
            'Hello World'
          ]
        } as VNode
      ]
    };

    // 첫 번째 render: chip-before decorator
    const prevFiber = createFiberTree(container, prevVNode, undefined, {});
    reconcileAllFibers(prevFiber, deps, {});
    
    // DOM 확인: chip-before가 있어야 함
    const textEl1 = container.querySelector('[data-bc-sid="text-14"]');
    expect(textEl1).toBeTruthy();
    const chipBefore1 = textEl1?.querySelector('[data-decorator-sid="chip-before"]');
    expect(chipBefore1).toBeTruthy();

    // 두 번째 render: chip-after decorator (chip-before 제거됨)
    const vnode: VNode = {
      tag: 'div',
      stype: 'document',
      sid: 'doc-1',
      children: [
        {
          tag: 'span',
          stype: 'inline-text',
          sid: 'text-14',
          children: [
            'Test Text',
            {
              tag: 'span',
              attrs: {
                'data-decorator-sid': 'chip-after',
                'data-decorator-stype': 'chip',
                'data-decorator-category': 'inline',
                'data-decorator-position': 'after'
              },
              children: ['CHIP']
            } as VNode
          ]
        } as VNode
      ]
    };

    const fiber = createFiberTree(container, vnode, prevVNode, {});
    reconcileAllFibers(fiber, deps, {});
    
    // DOM 확인: chip-before가 제거되어야 함
    const textEl2 = container.querySelector('[data-bc-sid="text-14"]');
    expect(textEl2).toBeTruthy();
    const chipBefore2 = textEl2?.querySelector('[data-decorator-sid="chip-before"]');
    const chipAfter = textEl2?.querySelector('[data-decorator-sid="chip-after"]');
    
    expect(chipBefore2).toBeFalsy();
    expect(chipAfter).toBeTruthy();
  });
});

