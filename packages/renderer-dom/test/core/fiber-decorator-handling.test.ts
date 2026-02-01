import { describe, it, expect, beforeEach } from 'vitest';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import { removeStaleChildren, FiberReconcileDependencies, reconcileWithFiber } from '../../src/reconcile/fiber/fiber-reconciler';
import type { FiberNode } from '../../src/reconcile/fiber/types';
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
      
      // Verify all decorator VNodes are converted to Fiber
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
    it('decoratorSid를 가진 VNode를 DOM 요소로 렌더링해야 함', async () => {
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

      await new Promise<void>((res) => {
        reconcileWithFiber(container, decoratorVNode, undefined, {}, deps, res);
      });

      const decoratorEl = container.querySelector('[data-decorator-sid="d-highlight"]');
      expect(decoratorEl).toBeDefined();
      expect(decoratorEl?.getAttribute('class')).toBe('highlight-decorator');
    });

    it('같은 decoratorSid를 가진 여러 VNode를 모두 DOM으로 렌더링해야 함', async () => {
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

      await new Promise<void>((res) => {
        reconcileWithFiber(container, parentVNode, undefined, {}, deps, res);
      });

      const decoratorElements = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(decoratorElements.length).toBe(3);
    });

    it('decoratorSid가 있는 VNode는 일반 span을 재사용하지 않아야 함', async () => {
      // Create normal span first
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

      await new Promise<void>((res) => {
        reconcileWithFiber(container, decoratorVNode, undefined, {}, deps, res);
      });

      // Normal span should remain unchanged
      expect(container.children.length).toBe(2);
      const decoratorEl = container.querySelector('[data-decorator-sid="d-highlight"]');
      expect(decoratorEl).toBeDefined();
      expect(decoratorEl).not.toBe(normalSpan);
    });
  });

  describe('removeStaleChildren - decorator VNode 제거 방지', () => {
    it('현재 VNode children에 있는 decorator VNode는 제거하지 않아야 함', async () => {
      // Initial rendering
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

      await new Promise<void>((res) => {
        reconcileWithFiber(container, initialVNode, undefined, {}, deps, res);
      });

      // Verify decorator element is created in DOM
      let decoratorEl = container.querySelector('[data-decorator-sid="d-highlight"]');
      expect(decoratorEl).toBeDefined();

      // Re-render with same VNode (removeStaleChildren will be called)
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

      let newFiber: FiberNode;
      await new Promise<void>((res) => {
        reconcileWithFiber(container, sameVNode, initialVNode, {}, deps, (f) => {
          newFiber = f;
          res();
        });
      });

      // Call removeStaleChildren
      removeStaleChildren(newFiber!, deps);

      // Decorator element should still exist
      decoratorEl = container.querySelector('[data-decorator-sid="d-highlight"]');
      expect(decoratorEl).toBeDefined();
    });

    it('같은 decoratorSid를 가진 여러 VNode가 모두 제거되지 않아야 함', async () => {
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

      let rootFiber: FiberNode;
      await new Promise<void>((res) => {
        reconcileWithFiber(container, vnode, undefined, {}, deps, (f) => {
          rootFiber = f;
          res();
        });
      });

      // Call removeStaleChildren
      removeStaleChildren(rootFiber!, deps);

      const decoratorElements = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(decoratorElements.length).toBe(3);
    });
  });
});

