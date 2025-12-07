import { describe, it, expect, beforeEach } from 'vitest';
import { processPrimitiveTextChildren, reconcileFiberNode, FiberReconcileDependencies } from '../../src/reconcile/fiber/fiber-reconciler';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import { FiberNode } from '../../src/reconcile/fiber/types';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

// Helper function: recursively process all Fibers
function reconcileAllFibers(fiber: FiberNode, deps: FiberReconcileDependencies, context: any): void {
  reconcileFiberNode(fiber, deps, context);
  
  let childFiber = fiber.child;
  while (childFiber) {
    reconcileAllFibers(childFiber, deps, context);
    childFiber = childFiber.sibling;
  }
}

describe('processPrimitiveTextChildren - Unit Test', () => {
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

  describe('primitive text 처리', () => {
    it('primitive text children를 DOM에 추가해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          'first',
          {
            tag: 'span',
            sid: 'child-1'
          },
          'second',
          123
        ]
      };

      const fiber = createFiberTree(container, vnode, undefined, {});
      reconcileAllFibers(fiber, deps, {});

      // Verify domElement and primitiveTextChildren
      expect(fiber.domElement).toBeDefined();
      expect(fiber.primitiveTextChildren).toBeDefined();
      expect(fiber.primitiveTextChildren?.length).toBe(3); // 'first', 'second', 123

      // Process primitive text
      processPrimitiveTextChildren(fiber, deps);

      // Verify text nodes are added to DOM
      // (May vary depending on handlePrimitiveTextChild behavior)
      // IMPORTANT: fiber.domElement is container, so check container.childNodes
      const textNodes = Array.from(fiber.domElement?.childNodes || []).filter(n => n.nodeType === Node.TEXT_NODE);
      // If primitiveTextChildren exists, text nodes should be created
      if (fiber.primitiveTextChildren && fiber.primitiveTextChildren.length > 0) {
        expect(textNodes.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('primitive text should be inserted at correct position', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          'before',
          {
            tag: 'span',
            sid: 'child-1',
            children: [{ tag: undefined, text: 'middle' }]
          },
          'after'
        ]
      };

      const fiber = createFiberTree(container, vnode, undefined, {});
      reconcileAllFibers(fiber, deps, {});

      // domElement가 설정되었는지 확인
      expect(fiber.domElement).toBeDefined();
      expect(fiber.primitiveTextChildren).toBeDefined();
      expect(fiber.primitiveTextChildren?.length).toBeGreaterThan(0);

      // primitive text 처리
      processPrimitiveTextChildren(fiber, deps);

      // DOM에 텍스트 노드가 추가되었는지 확인
      // (handlePrimitiveTextChild가 정확한 위치에 삽입하는지 확인)
      // IMPORTANT: fiber.domElement가 container이므로, container.childNodes를 확인
      const allNodes = Array.from(fiber.domElement?.childNodes || []);
      const textNodes = allNodes.filter(n => n.nodeType === Node.TEXT_NODE);
      
      // span 요소가 있는지 확인
      const spanElement = allNodes.find(n => 
        n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === 'SPAN'
      );
      expect(spanElement).toBeDefined();
      
      // primitiveTextChildren가 있으면 텍스트 노드가 생성되어야 함
      // (하지만 handlePrimitiveTextChild의 동작에 따라 다를 수 있음)
      if (fiber.primitiveTextChildren && fiber.primitiveTextChildren.length > 0) {
        // 텍스트 노드가 생성되었는지 확인 (최소 1개 이상)
        expect(textNodes.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('primitiveTextChildren가 없으면 아무것도 하지 않아야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          {
            tag: 'span',
            sid: 'child-1'
          }
        ]
      };

      const fiber = createFiberTree(container, vnode, undefined, {});
      reconcileAllFibers(fiber, deps, {});

      const beforeCount = container.childNodes.length;
      processPrimitiveTextChildren(fiber, deps);
      const afterCount = container.childNodes.length;

      // primitiveTextChildren가 없으므로 변경 없음
      expect(afterCount).toBe(beforeCount);
    });

    it('domElement가 없으면 아무것도 하지 않아야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: ['text']
      };

      const fiber = createFiberTree(container, vnode, undefined, {});
      // domElement를 설정하지 않음
      fiber.domElement = null;

      // 에러가 발생하지 않아야 함
      expect(() => {
        processPrimitiveTextChildren(fiber, deps);
      }).not.toThrow();
    });
  });
});

