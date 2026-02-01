import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import { renderFiberNode, commitFiberTree, FiberReconcileDependencies } from '../../src/reconcile/fiber/fiber-reconciler';
import { FiberNode } from '../../src/reconcile/fiber/types';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

// Helper function: Process all Fibers recursively (render phase only)
function reconcileAllFibers(fiber: FiberNode, deps: FiberReconcileDependencies, context: any): void {
  renderFiberNode(fiber, deps, context);

  let childFiber = fiber.child;
  while (childFiber) {
    reconcileAllFibers(childFiber, deps, context);
    childFiber = childFiber.sibling;
  }
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
    // First render: chip-before decorator
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

    // Second render: chip-after decorator (chip-before removed)
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

    // First render
    const prevFiber = createFiberTree(container, prevVNode, undefined, {});
    reconcileAllFibers(prevFiber, deps, {});
    commitFiberTree(prevFiber, deps, {});

    const textEl1 = container.querySelector('[data-bc-sid="text-14"]');
    expect(textEl1).toBeTruthy();
    const chipBefore1 = textEl1?.querySelector('[data-decorator-sid="chip-before"]');
    expect(chipBefore1).toBeTruthy();

    // Second render
    const nextFiber = createFiberTree(container, nextVNode, prevVNode, {});
    reconcileAllFibers(nextFiber, deps, {});
    commitFiberTree(nextFiber, deps, {});

    const chipBefore2 = container.querySelector('[data-decorator-sid="chip-before"]');

    expect(chipBefore2).toBeFalsy();
  });

  it('removeStaleChildren이 text-14 Fiber에서 올바르게 작동하는지 확인', () => {
    // Start with document model
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

    // First render: chip-before decorator
    const prevFiber = createFiberTree(container, prevVNode, undefined, {});
    reconcileAllFibers(prevFiber, deps, {});
    commitFiberTree(prevFiber, deps, {});

    const textEl1 = container.querySelector('[data-bc-sid="text-14"]');
    expect(textEl1).toBeTruthy();
    const chipBefore1 = textEl1?.querySelector('[data-decorator-sid="chip-before"]');
    expect(chipBefore1).toBeTruthy();

    // Second render: chip-after decorator (chip-before removed)
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
    commitFiberTree(fiber, deps, {});

    const chipBefore2 = container.querySelector('[data-decorator-sid="chip-before"]');

    expect(chipBefore2).toBeFalsy();
  });
});

