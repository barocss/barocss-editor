import { describe, it, expect, beforeEach } from 'vitest';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import { removeStaleChildren, FiberReconcileDependencies, reconcileWithFiber, reconcileFiberNode } from '../../src/reconcile/fiber/fiber-reconciler';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

describe('Fiber Decorator Handling', () => {
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

  describe('createFiberTree - decorator VNode 처리', () => {
    it('decoratorSid를 가진 VNode를 Fiber로 변환해야 함', () => {
      const decoratorVNode: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight',
          'data-decorator-category': 'inline'
        },
        children: [
          {
            tag: 'span',
            children: [
              { tag: undefined, text: 'test' }
            ]
          }
        ]
      };

      const fiber = createFiberTree(container, decoratorVNode, undefined, {});
      
      expect(fiber).toBeDefined();
      expect(fiber.vnode.attrs?.['data-decorator-sid']).toBe('d-highlight');
      expect(fiber.child).toBeDefined();
    });

    it('같은 decoratorSid를 가진 여러 VNode를 모두 Fiber로 변환해야 함', () => {
      const parentVNode: VNode = {
        tag: 'span',
        sid: 'text-1',
        children: [
          {
            tag: 'span',
            attrs: {
              'data-decorator-sid': 'd-highlight',
              'data-decorator-stype': 'highlight'
            },
            children: [{ tag: undefined, text: 'first' }]
          },
          {
            tag: 'span',
            attrs: {
              'data-decorator-sid': 'd-highlight',
              'data-decorator-stype': 'highlight'
            },
            children: [{ tag: undefined, text: 'second' }]
          },
          {
            tag: 'span',
            attrs: {
              'data-decorator-sid': 'd-highlight',
              'data-decorator-stype': 'highlight'
            },
            children: [{ tag: undefined, text: 'third' }]
          }
        ]
      };

      const fiber = createFiberTree(container, parentVNode, undefined, {});
      
      expect(fiber).toBeDefined();
      expect(fiber.child).toBeDefined();
      
      // 모든 decorator VNode가 Fiber로 변환되었는지 확인
      let childFiber = fiber.child;
      let count = 0;
      while (childFiber) {
        if (childFiber.vnode.attrs?.['data-decorator-sid'] === 'd-highlight') {
          count++;
        }
        childFiber = childFiber.sibling;
      }
      
      expect(count).toBe(3);
    });
  });

  describe('reconcileFiberNode - decorator VNode DOM 렌더링', () => {
    it('decoratorSid를 가진 VNode를 DOM 요소로 렌더링해야 함', () => {
      const decoratorVNode: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight',
          'data-decorator-category': 'inline'
        },
        children: [
          {
            tag: 'span',
            children: [
              { tag: undefined, text: 'test' }
            ]
          }
        ]
      };

      const fiber = createFiberTree(container, decoratorVNode, undefined, {});
      reconcileFiberNode(fiber, deps, {});

      const decoratorEl = container.querySelector('[data-decorator-sid="d-highlight"]');
      expect(decoratorEl).toBeDefined();
      expect(decoratorEl?.getAttribute('class')).toBe('highlight-decorator');
    });

    it('같은 decoratorSid를 가진 여러 VNode를 모두 DOM으로 렌더링해야 함', () => {
      const parentVNode: VNode = {
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

      const fiber = createFiberTree(container, parentVNode, undefined, {});
      reconcileFiberNode(fiber, deps, {});

      // 모든 자식 Fiber 처리
      let childFiber = fiber.child;
      while (childFiber) {
        reconcileFiberNode(childFiber, deps, {});
        childFiber = childFiber.sibling;
      }

      const decoratorElements = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(decoratorElements.length).toBe(3);
    });

    it('decoratorSid가 있는 VNode는 일반 span을 재사용하지 않아야 함', () => {
      // 먼저 일반 span 생성
      const normalSpan = document.createElement('span');
      normalSpan.textContent = 'normal';
      container.appendChild(normalSpan);

      const decoratorVNode: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight',
          'data-decorator-category': 'inline'
        },
        children: [
          {
            tag: 'span',
            children: [
              { tag: undefined, text: 'decorator' }
            ]
          }
        ]
      };

      const fiber = createFiberTree(container, decoratorVNode, undefined, {});
      reconcileFiberNode(fiber, deps, {});

      // 일반 span은 그대로 유지되어야 함
      expect(container.children.length).toBe(2);
      const decoratorEl = container.querySelector('[data-decorator-sid="d-highlight"]');
      expect(decoratorEl).toBeDefined();
      expect(decoratorEl).not.toBe(normalSpan);
    });
  });

  describe('removeStaleChildren - decorator VNode 제거 방지', () => {
    it('현재 VNode children에 있는 decorator VNode는 제거하지 않아야 함', () => {
      // 초기 렌더링
      const initialVNode: VNode = {
        tag: 'span',
        sid: 'text-1',
        children: [
          {
            tag: 'span',
            decoratorSid: 'd-highlight',
            decoratorStype: 'highlight',
            attrs: { className: 'highlight-decorator' },
            children: [{ tag: undefined, text: 'test' }]
          }
        ]
      };

      const fiber = createFiberTree(container, initialVNode, undefined, {});
      reconcileFiberNode(fiber, deps, {});
      
      let childFiber = fiber.child;
      while (childFiber) {
        reconcileFiberNode(childFiber, deps, {});
        childFiber = childFiber.sibling;
      }

      // DOM에 decorator 요소가 생성되었는지 확인
      let decoratorEl = container.querySelector('[data-decorator-sid="d-highlight"]');
      expect(decoratorEl).toBeDefined();

      // 같은 VNode로 다시 렌더링 (removeStaleChildren 호출)
      const sameVNode: VNode = {
        tag: 'span',
        sid: 'text-1',
        children: [
          {
            tag: 'span',
            decoratorSid: 'd-highlight',
            decoratorStype: 'highlight',
            attrs: { className: 'highlight-decorator' },
            children: [{ tag: undefined, text: 'test' }]
          }
        ]
      };

      const newFiber = createFiberTree(container, sameVNode, initialVNode, {});
      reconcileFiberNode(newFiber, deps, {});
      
      childFiber = newFiber.child;
      while (childFiber) {
        reconcileFiberNode(childFiber, deps, {});
        childFiber = childFiber.sibling;
      }

      // removeStaleChildren 호출
      removeStaleChildren(newFiber, deps);

      // decorator 요소가 여전히 존재해야 함
      decoratorEl = container.querySelector('[data-decorator-sid="d-highlight"]');
      expect(decoratorEl).toBeDefined();
    });

    it('같은 decoratorSid를 가진 여러 VNode가 모두 제거되지 않아야 함', () => {
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
      reconcileFiberNode(fiber, deps, {});
      
      let childFiber = fiber.child;
      while (childFiber) {
        reconcileFiberNode(childFiber, deps, {});
        childFiber = childFiber.sibling;
      }

      // removeStaleChildren 호출
      removeStaleChildren(fiber, deps);

      const decoratorElements = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(decoratorElements.length).toBe(3);
    });
  });
});

