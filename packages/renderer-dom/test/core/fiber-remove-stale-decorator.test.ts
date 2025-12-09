import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import { reconcileFiberNode, removeStaleChildren, FiberReconcileDependencies } from '../../src/reconcile/fiber/fiber-reconciler';
import { FiberNode } from '../../src/reconcile/fiber/types';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

// Helper function: Process all Fibers recursively
function reconcileAllFibers(fiber: FiberNode, deps: FiberReconcileDependencies, context: any): void {
  reconcileFiberNode(fiber, deps, context);
  
  // Process child Fibers
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
    // Clean up state between tests
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

      // Call removeStaleChildren
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

      // Verify DOM elements before calling removeStaleChildren
      const beforeRemove = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(beforeRemove.length).toBe(3);

      // Call removeStaleChildren
      removeStaleChildren(fiber, deps);

      // All decorator elements should be maintained after calling removeStaleChildren
      const afterRemove = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(afterRemove.length).toBe(3);
      
      // Verify each element is unique
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

      // Verify 2 decorator elements are created in DOM
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

      // Call removeStaleChildren
      removeStaleChildren(fiber, deps);

      // All decorator elements should be maintained
      const afterRemove = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(afterRemove.length).toBe(2);
    });
  });
});

