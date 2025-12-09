import { describe, it, expect, beforeEach } from 'vitest';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import { reconcileFiberNode, FiberReconcileDependencies } from '../../src/reconcile/fiber/fiber-reconciler';
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

describe('reconcileFiberNode - Decorator VNode 처리', () => {
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

  describe('단일 decorator VNode 렌더링', () => {
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
  });

  describe('같은 decoratorSid를 가진 여러 VNode 렌더링', () => {
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
      reconcileAllFibers(fiber, deps, {});

      const decoratorElements = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      // eslint-disable-next-line no-console
      console.log('[TEST] 최종 결과:', {
        decoratorElementsCount: decoratorElements.length,
        containerHTML: container.innerHTML
      });
      expect(decoratorElements.length).toBe(3);
      
      // Verify each decorator element is unique
      const texts = Array.from(decoratorElements).map(el => el.textContent);
      expect(texts).toContain('first');
      expect(texts).toContain('second');
      expect(texts).toContain('third');
    });

    it('형제 Fiber들의 domElement를 추적하여 각각 고유한 DOM 요소를 생성해야 함', () => {
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
          }
        ]
      };

      const fiber = createFiberTree(container, parentVNode, undefined, {});
      
      // Process first child Fiber
      let childFiber = fiber.child;
      expect(childFiber).toBeDefined();
      reconcileAllFibers(childFiber!, deps, {});
      
      // Verify first decorator element is created
      const firstDecorator = container.querySelector('[data-decorator-sid="d-highlight"]');
      expect(firstDecorator).toBeDefined();
      expect(firstDecorator?.textContent).toBe('first');
      expect(childFiber!.domElement).toBe(firstDecorator);

      // Process second child Fiber
      childFiber = childFiber!.sibling;
      expect(childFiber).toBeDefined();
      reconcileAllFibers(childFiber!, deps, {});
      
      // Verify second decorator element is created
      const allDecorators = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(allDecorators.length).toBe(2);
      expect(allDecorators[0]).toBe(firstDecorator);
      expect(allDecorators[1]).not.toBe(firstDecorator);
      expect(allDecorators[1].textContent).toBe('second');
      expect(childFiber!.domElement).toBe(allDecorators[1]);
    });
  });
});

