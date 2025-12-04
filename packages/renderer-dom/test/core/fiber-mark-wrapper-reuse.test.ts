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
    // DOM에 mark wrapper가 이미 있음
    const textEl = document.createElement('span');
    textEl.setAttribute('data-bc-sid', 'text-1');
    textEl.className = 'text';
    
    const markWrapper = document.createElement('span');
    markWrapper.className = 'mark-bold';
    markWrapper.textContent = 'Hello';
    
    textEl.appendChild(markWrapper);
    container.appendChild(textEl);

    // VNode: mark wrapper (sid와 decoratorSid가 모두 없음)
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

    // findHostForChildVNode 호출
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
    // DOM에 mark wrapper가 이미 있음
    const textEl = document.createElement('span');
    textEl.setAttribute('data-bc-sid', 'text-1');
    textEl.className = 'text';
    
    const markWrapper = document.createElement('span');
    markWrapper.className = 'mark-bold';
    markWrapper.textContent = 'Hello';
    
    textEl.appendChild(markWrapper);
    container.appendChild(textEl);

    // VNode: mark wrapper (sid와 decoratorSid가 모두 없음)
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

    // createFiberTree로 Fiber 생성 (primitiveTextChildren이 올바르게 설정됨)
    const fiber = createFiberTree(textEl, vnode, prevVNode, {});

    // reconcileFiberNode 호출
    reconcileFiberNode(fiber, deps, {});

    // processPrimitiveTextChildren 호출 (실제 reconcileWithFiber에서 자동으로 호출됨)
    processPrimitiveTextChildren(fiber, deps);

    // mark wrapper가 재사용되었는지 확인
    expect(fiber.domElement).toBe(markWrapper);
    expect(markWrapper.textContent).toBe('Hello World');
  });

  it('prevVNodeMatches가 false일 때 findHostForChildVNode가 호출되어야 함', () => {
    // DOM에 mark wrapper가 이미 있음
    const textEl = document.createElement('span');
    textEl.setAttribute('data-bc-sid', 'text-1');
    textEl.className = 'text';
    
    const markWrapper = document.createElement('span');
    markWrapper.className = 'mark-bold';
    markWrapper.textContent = 'Hello';
    
    textEl.appendChild(markWrapper);
    container.appendChild(textEl);

    // VNode: mark wrapper (sid와 decoratorSid가 모두 없음)
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

    // prevVNodeMatches 확인
    const prevVNodeMatches = prevVNode && (
      (prevVNode.sid && prevVNode.sid === vnode.sid) ||
      (prevVNode.decoratorSid && prevVNode.decoratorSid === vnode.decoratorSid)
    );

    expect(prevVNodeMatches).toBeFalsy(); // sid와 decoratorSid가 모두 없으므로 false

    // findHostForChildVNode가 호출되어야 함
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

    // primitiveTextChildren이 올바르게 수집되었는지 확인
    expect(fiber.primitiveTextChildren).toBeDefined();
    expect(fiber.primitiveTextChildren?.length).toBe(1);
    expect(fiber.primitiveTextChildren?.[0].text).toBe('Hello World');
    expect(fiber.primitiveTextChildren?.[0].index).toBe(0);
    
    // child Fiber는 없어야 함 (primitive text는 Fiber로 변환하지 않음)
    expect(fiber.child).toBeNull();
  });

  it('processPrimitiveTextChildren이 mark wrapper의 텍스트를 업데이트해야 함', () => {
    // DOM에 mark wrapper가 이미 있음
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

    // processPrimitiveTextChildren 호출
    processPrimitiveTextChildren(fiber, deps);

    // 텍스트가 업데이트되었는지 확인
    expect(markWrapper.textContent).toBe('Hello World');
  });

  it('reconcileFiberNode 후 processPrimitiveTextChildren이 호출되어야 함', () => {
    // DOM에 mark wrapper가 이미 있음
    const textEl = document.createElement('span');
    textEl.setAttribute('data-bc-sid', 'text-1');
    textEl.className = 'text';
    
    const markWrapper = document.createElement('span');
    markWrapper.className = 'mark-bold';
    markWrapper.textContent = 'Hello';
    
    textEl.appendChild(markWrapper);
    container.appendChild(textEl);

    // VNode: mark wrapper (sid와 decoratorSid가 모두 없음)
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

    // createFiberTree로 Fiber 생성
    const fiber = createFiberTree(textEl, vnode, prevVNode, {});
    
    // reconcileFiberNode 호출
    reconcileFiberNode(fiber, deps, {});
    
    // processPrimitiveTextChildren 호출 (실제 reconcileWithFiber에서 자동으로 호출됨)
    processPrimitiveTextChildren(fiber, deps);

    // mark wrapper가 재사용되고 텍스트가 업데이트되었는지 확인
    expect(fiber.domElement).toBe(markWrapper);
    expect(markWrapper.textContent).toBe('Hello World');
  });
});

