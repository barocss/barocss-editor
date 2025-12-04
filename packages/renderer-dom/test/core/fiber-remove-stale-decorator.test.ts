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

describe('removeStaleChildren - Decorator VNode 제거 방지', () => {
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
    // 테스트 간 상태 정리
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container.innerHTML = '';
  });

  describe('같은 decoratorSid를 가진 여러 VNode 제거 방지', () => {
    it('현재 VNode children에 있는 decorator VNode는 제거하지 않아야 함', () => {
      const vnode: VNode = {
        tag: 'span',
        sid: 'text-1',
        children: [
          {
            tag: 'span',
            attrs: {
              className: 'highlight-decorator',
              'data-decorator-sid': 'd-highlight',
              'data-decorator-stype': 'highlight'
            },
            children: [{ tag: undefined, text: 'first' }]
          },
          {
            tag: 'span',
            attrs: {
              className: 'highlight-decorator',
              'data-decorator-sid': 'd-highlight',
              'data-decorator-stype': 'highlight'
            },
            children: [{ tag: undefined, text: 'second' }]
          },
          {
            tag: 'span',
            attrs: {
              className: 'highlight-decorator',
              'data-decorator-sid': 'd-highlight',
              'data-decorator-stype': 'highlight'
            },
            children: [{ tag: undefined, text: 'third' }]
          }
        ]
      };

      const fiber = createFiberTree(container, vnode, undefined, {});
      reconcileAllFibers(fiber, deps, {});

      // removeStaleChildren 호출
      removeStaleChildren(fiber, deps);

      const decoratorElements = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(decoratorElements.length).toBe(3);
    });

    it('같은 decoratorSid를 가진 여러 VNode가 모두 매칭되어야 함', () => {
      const vnode: VNode = {
        tag: 'span',
        sid: 'text-1',
        children: [
          {
            tag: 'span',
            attrs: {
              className: 'highlight-decorator',
              'data-decorator-sid': 'd-highlight',
              'data-decorator-stype': 'highlight'
            },
            children: [{ tag: undefined, text: 'first' }]
          },
          {
            tag: 'span',
            attrs: {
              className: 'highlight-decorator',
              'data-decorator-sid': 'd-highlight',
              'data-decorator-stype': 'highlight'
            },
            children: [{ tag: undefined, text: 'second' }]
          },
          {
            tag: 'span',
            attrs: {
              className: 'highlight-decorator',
              'data-decorator-sid': 'd-highlight',
              'data-decorator-stype': 'highlight'
            },
            children: [{ tag: undefined, text: 'third' }]
          }
        ]
      };

      const fiber = createFiberTree(container, vnode, undefined, {});
      reconcileAllFibers(fiber, deps, {});

      // removeStaleChildren 호출 전 DOM 요소 확인
      const beforeRemove = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(beforeRemove.length).toBe(3);

      // removeStaleChildren 호출
      removeStaleChildren(fiber, deps);

      // removeStaleChildren 호출 후에도 모든 decorator 요소가 유지되어야 함
      const afterRemove = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(afterRemove.length).toBe(3);
      
      // 각 요소가 고유한지 확인
      const texts = Array.from(afterRemove).map(el => el.textContent);
      expect(texts).toContain('first');
      expect(texts).toContain('second');
      expect(texts).toContain('third');
    });
  });

  describe('VNode children과 DOM children 매칭', () => {
    it('같은 decoratorSid를 가진 여러 VNode가 모두 DOM 요소와 매칭되어야 함', () => {
      const vnode: VNode = {
        tag: 'span',
        sid: 'text-1',
        children: [
          {
            tag: 'span',
            attrs: {
              className: 'highlight-decorator',
              'data-decorator-sid': 'd-highlight',
              'data-decorator-stype': 'highlight'
            },
            children: [{ tag: undefined, text: 'first' }]
          },
          {
            tag: 'span',
            attrs: {
              className: 'highlight-decorator',
              'data-decorator-sid': 'd-highlight',
              'data-decorator-stype': 'highlight'
            },
            children: [{ tag: undefined, text: 'second' }]
          }
        ]
      };

      const fiber = createFiberTree(container, vnode, undefined, {});
      reconcileAllFibers(fiber, deps, {});

      // DOM에 2개의 decorator 요소가 생성되었는지 확인
      const decoratorElements = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      // eslint-disable-next-line no-console
      console.log('[TEST] reconcileAllFibers 후:', {
        decoratorElementsCount: decoratorElements.length,
        containerHTML: container.innerHTML,
        containerChildrenCount: container.children.length,
        allDecoratorElements: Array.from(container.querySelectorAll('[data-decorator-sid]')).map(el => ({
          tag: el.tagName,
          decoratorSid: el.getAttribute('data-decorator-sid'),
          text: el.textContent
        })),
        fiberChildren: (() => {
          const children: any[] = [];
          let childFiber = fiber.child;
          while (childFiber) {
            children.push({
              decoratorSid: childFiber.vnode.attrs?.['data-decorator-sid'],
              domElement: childFiber.domElement?.getAttribute('data-decorator-sid'),
              hasChildren: !!childFiber.child
            });
            childFiber = childFiber.sibling;
          }
          return children;
        })()
      });
      expect(decoratorElements.length).toBe(2);

      // removeStaleChildren 호출
      removeStaleChildren(fiber, deps);

      // 모든 decorator 요소가 유지되어야 함
      const afterRemove = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(afterRemove.length).toBe(2);
    });
  });
});

