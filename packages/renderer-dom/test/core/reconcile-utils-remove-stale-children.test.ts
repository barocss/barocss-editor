import { describe, it, expect, beforeEach } from 'vitest';
import { removeStaleChildren, FiberReconcileDependencies, reconcileFiberNode } from '../../src/reconcile/fiber/fiber-reconciler';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import { FiberNode } from '../../src/reconcile/fiber/types';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

// Helper function: Process all Fibers recursively
function reconcileAllFibers(fiber: FiberNode, deps: FiberReconcileDependencies, context: any): void {
  reconcileFiberNode(fiber, deps, context);
  
  let childFiber = fiber.child;
  while (childFiber) {
    reconcileAllFibers(childFiber, deps, context);
    childFiber = childFiber.sibling;
  }
}

describe('removeStaleChildren - 단위 테스트', () => {
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

  describe('같은 decoratorSid를 가진 여러 VNode 매칭', () => {
    it('VNode children에 있는 모든 decorator VNode가 DOM과 매칭되어야 함', () => {
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
      const beforeRemove = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(beforeRemove.length).toBe(2);

      // Call removeStaleChildren
      removeStaleChildren(fiber, deps);

      // All decorator elements should be maintained
      const afterRemove = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(afterRemove.length).toBe(2);
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

      // Call removeStaleChildren
      removeStaleChildren(fiber, deps);

      // All decorator elements should be maintained
      const decoratorElements = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(decoratorElements.length).toBe(3);
      
      // Verify each element is unique
      const texts = Array.from(decoratorElements).map(el => el.textContent);
      expect(texts).toContain('first');
      expect(texts).toContain('second');
      expect(texts).toContain('third');
    });
  });
});

