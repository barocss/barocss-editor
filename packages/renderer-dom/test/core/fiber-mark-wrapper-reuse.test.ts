import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import { reconcileFiberNode, FiberReconcileDependencies, processPrimitiveTextChildren } from '../../src/reconcile/fiber/fiber-reconciler';
import { findHostForChildVNode } from '../../src/reconcile/utils/host-finding';
import { FiberNode } from '../../src/reconcile/fiber/types';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

describe('Fiber - Mark Wrapper 재사용', () => {
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

  it('findHostForChildVNode가 mark wrapper를 찾을 수 있어야 함', () => {
    // Mark wrapper already exists in DOM
    const textEl = document.createElement('span');
    textEl.setAttribute('data-bc-sid', 'text-1');
    textEl.className = 'text';
    
    const markWrapper = document.createElement('span');
    markWrapper.className = 'mark-bold';
    markWrapper.textContent = 'Hello';
    
    textEl.appendChild(markWrapper);
    container.appendChild(textEl);

    // VNode: mark wrapper (both sid and decoratorSid are missing)
    const vnode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-bold'
      },
      children: ['Hello World']
    };

    const prevVNode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-bold'
      },
      children: ['Hello']
    };

    const prevChildVNodes: (VNode | string | number)[] = [prevVNode];
    const prevChildToElement = new Map<VNode | string | number, HTMLElement | Text>();
    prevChildToElement.set(prevVNode, markWrapper);

    // Call findHostForChildVNode
    const host = findHostForChildVNode(
      textEl,
      vnode,
      0,
      prevChildVNodes,
      prevChildToElement
    );

    expect(host).toBe(markWrapper);
  });

  it('reconcileFiberNode가 mark wrapper를 재사용해야 함', () => {
    // Mark wrapper already exists in DOM
    const textEl = document.createElement('span');
    textEl.setAttribute('data-bc-sid', 'text-1');
    textEl.className = 'text';
    
    const markWrapper = document.createElement('span');
    markWrapper.className = 'mark-bold';
    markWrapper.textContent = 'Hello';
    
    textEl.appendChild(markWrapper);
    container.appendChild(textEl);

    // VNode: mark wrapper (both sid and decoratorSid are missing)
    const vnode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-bold'
      },
      children: ['Hello World']
    };

    const prevVNode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-bold'
      },
      children: ['Hello'],
      meta: {
        domElement: markWrapper
      }
    };

    // Create Fiber with createFiberTree (primitiveTextChildren is correctly set)
    const fiber = createFiberTree(textEl, vnode, prevVNode, {});

    // Call reconcileFiberNode
    reconcileFiberNode(fiber, deps, {});

    // Call processPrimitiveTextChildren (automatically called in actual reconcileWithFiber)
    processPrimitiveTextChildren(fiber, deps);

    // Verify mark wrapper is reused
    expect(fiber.domElement).toBe(markWrapper);
    expect(markWrapper.textContent).toBe('Hello World');
  });

  it('prevVNodeMatches가 false일 때 findHostForChildVNode가 호출되어야 함', () => {
    // Mark wrapper already exists in DOM
    const textEl = document.createElement('span');
    textEl.setAttribute('data-bc-sid', 'text-1');
    textEl.className = 'text';
    
    const markWrapper = document.createElement('span');
    markWrapper.className = 'mark-bold';
    markWrapper.textContent = 'Hello';
    
    textEl.appendChild(markWrapper);
    container.appendChild(textEl);

    // VNode: mark wrapper (both sid and decoratorSid are missing)
    const vnode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-bold'
      },
      children: ['Hello World']
    };

    const prevVNode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-bold'
      },
      children: ['Hello'],
      meta: {
        domElement: markWrapper
      }
    };

    // Verify prevVNodeMatches
    const prevVNodeMatches = prevVNode && (
      (prevVNode.sid && prevVNode.sid === vnode.sid) ||
      (prevVNode.decoratorSid && prevVNode.decoratorSid === vnode.decoratorSid)
    );

    expect(prevVNodeMatches).toBeFalsy(); // false because both sid and decoratorSid are missing

    // findHostForChildVNode should be called
    const prevChildVNodes: (VNode | string | number)[] = [prevVNode];
    const prevChildToElement = new Map<VNode | string | number, HTMLElement | Text>();
    prevChildToElement.set(prevVNode, markWrapper);

    const host = findHostForChildVNode(
      textEl,
      vnode,
      0,
      prevChildVNodes,
      prevChildToElement
    );

    expect(host).toBe(markWrapper);
  });

  it('createFiberTree가 mark wrapper의 primitive text children을 올바르게 수집해야 함', () => {
    const vnode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-bold'
      },
      children: ['Hello World']
    };

    const prevVNode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-bold'
      },
      children: ['Hello']
    };

    const fiber = createFiberTree(container, vnode, prevVNode, {});

    // Verify primitiveTextChildren is correctly collected
    expect(fiber.primitiveTextChildren).toBeDefined();
    expect(fiber.primitiveTextChildren?.length).toBe(1);
    expect(fiber.primitiveTextChildren?.[0].text).toBe('Hello World');
    expect(fiber.primitiveTextChildren?.[0].index).toBe(0);
    
    // Should not have child Fiber (primitive text is not converted to Fiber)
    expect(fiber.child).toBeNull();
  });

  it('processPrimitiveTextChildren이 mark wrapper의 텍스트를 업데이트해야 함', () => {
    // Mark wrapper already exists in DOM
    const markWrapper = document.createElement('span');
    markWrapper.className = 'mark-bold';
    markWrapper.textContent = 'Hello';
    container.appendChild(markWrapper);

    const vnode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-bold'
      },
      children: ['Hello World']
    };

    const prevVNode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-bold'
      },
      children: ['Hello']
    };

    const fiber: FiberNode = {
      vnode,
      prevVNode,
      domElement: markWrapper,
      parent: container,
      child: null,
      sibling: null,
      index: 0,
      primitiveTextChildren: [{ text: 'Hello World', index: 0 }]
    } as FiberNode;

    // Call processPrimitiveTextChildren
    processPrimitiveTextChildren(fiber, deps);

    // Verify text is updated
    expect(markWrapper.textContent).toBe('Hello World');
  });

  it('reconcileFiberNode 후 processPrimitiveTextChildren이 호출되어야 함', () => {
    // Mark wrapper already exists in DOM
    const textEl = document.createElement('span');
    textEl.setAttribute('data-bc-sid', 'text-1');
    textEl.className = 'text';
    
    const markWrapper = document.createElement('span');
    markWrapper.className = 'mark-bold';
    markWrapper.textContent = 'Hello';
    
    textEl.appendChild(markWrapper);
    container.appendChild(textEl);

    // VNode: mark wrapper (both sid and decoratorSid are missing)
    const vnode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-bold'
      },
      children: ['Hello World']
    };

    const prevVNode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-bold'
      },
      children: ['Hello'],
      meta: {
        domElement: markWrapper
      }
    };

    // Create Fiber with createFiberTree
    const fiber = createFiberTree(textEl, vnode, prevVNode, {});
    
    // Call reconcileFiberNode
    reconcileFiberNode(fiber, deps, {});
    
    // Call processPrimitiveTextChildren (automatically called in actual reconcileWithFiber)
    processPrimitiveTextChildren(fiber, deps);

    // Verify mark wrapper is reused and text is updated
    expect(fiber.domElement).toBe(markWrapper);
    expect(markWrapper.textContent).toBe('Hello World');
  });
});

