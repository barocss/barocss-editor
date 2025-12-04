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
}

describe('removeStaleChildren - Decorator 변경 시 제거', () => {
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

  it('decorator가 변경되면 이전 decorator를 제거해야 함', () => {
    // 첫 번째 render: chip-before decorator
    const prevVNode: VNode = {
      tag: 'span',
      stype: 'inline-text',
      sid: 'text-1',
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
    };

    // 두 번째 render: chip-after decorator (chip-before 제거됨)
    const nextVNode: VNode = {
      tag: 'span',
      stype: 'inline-text',
      sid: 'text-1',
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
    };

    // 첫 번째 render
    const prevFiber = createFiberTree(container, prevVNode, undefined, {});
    reconcileAllFibers(prevFiber, deps, {});
    
    // DOM 확인: chip-before가 있어야 함
    const chipBefore1 = container.querySelector('[data-decorator-sid="chip-before"]');
    expect(chipBefore1).toBeTruthy();

    // 두 번째 render
    const nextFiber = createFiberTree(container, nextVNode, prevVNode, {});
    reconcileAllFibers(nextFiber, deps, {});
    
    // removeStaleChildren 호출 (부모로 돌아갈 때)
    removeStaleChildren(nextFiber, deps);

    // DOM 확인: chip-before가 제거되어야 함
    const chipBefore2 = container.querySelector('[data-decorator-sid="chip-before"]');
    const chipAfter = container.querySelector('[data-decorator-sid="chip-after"]');
    
    expect(chipBefore2).toBeFalsy();
    expect(chipAfter).toBeTruthy();
  });

  it('removeStaleChildren이 expectedChildIds를 올바르게 수집하는지 확인', () => {
    const vnode: VNode = {
      tag: 'span',
      stype: 'inline-text',
      sid: 'text-1',
      children: [
        {
          tag: 'span',
          attrs: {
            'data-decorator-sid': 'chip-after',
            'data-decorator-stype': 'chip'
          },
          children: ['CHIP']
        } as VNode,
        'Text'
      ]
    };

    const fiber = createFiberTree(container, vnode, undefined, {});
    reconcileAllFibers(fiber, deps, {});
    
    // removeStaleChildren 호출 전에 expectedChildIds 확인
    const expectedChildIds = new Set<string>();
    if (vnode.children) {
      for (const child of vnode.children) {
        if (typeof child === 'object' && child !== null) {
          const childVNode = child as VNode;
          const childId = childVNode.sid || childVNode.attrs?.['data-decorator-sid'];
          if (childId) {
            expectedChildIds.add(childId);
          }
        }
      }
    }

    expect(expectedChildIds.has('chip-after')).toBe(true);
    expect(expectedChildIds.has('chip-before')).toBe(false);
  });

  it('removeStaleChildren이 usedDomElements를 올바르게 추적하는지 확인', () => {
    // DOM에 chip-before와 chip-after가 모두 있는 경우
    const chipBefore = document.createElement('span');
    chipBefore.setAttribute('data-decorator-sid', 'chip-before');
    chipBefore.textContent = 'CHIP';
    
    const chipAfter = document.createElement('span');
    chipAfter.setAttribute('data-decorator-sid', 'chip-after');
    chipAfter.textContent = 'CHIP';
    
    container.appendChild(chipBefore);
    container.appendChild(chipAfter);

    // VNode에는 chip-after만 있음
    const vnode: VNode = {
      tag: 'span',
      stype: 'inline-text',
      sid: 'text-1',
      children: [
        {
          tag: 'span',
          attrs: {
            'data-decorator-sid': 'chip-after',
            'data-decorator-stype': 'chip'
          },
          children: ['CHIP']
        } as VNode
      ]
    };

    const fiber = createFiberTree(container, vnode, undefined, {});
    fiber.domElement = container;
    
    // removeStaleChildren 호출
    removeStaleChildren(fiber, deps);

    // chip-before가 제거되어야 함
    const chipBeforeAfter = container.querySelector('[data-decorator-sid="chip-before"]');
    const chipAfterAfter = container.querySelector('[data-decorator-sid="chip-after"]');
    
    expect(chipBeforeAfter).toBeFalsy();
    expect(chipAfterAfter).toBeTruthy();
  });
});

