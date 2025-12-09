import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { processPrimitiveTextChildren, FiberReconcileDependencies } from '../../src/reconcile/fiber/fiber-reconciler';
import { FiberNode } from '../../src/reconcile/fiber/types';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

describe('processPrimitiveTextChildren - Mark Wrapper', () => {
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

  it('mark wrapper의 텍스트를 업데이트해야 함 (기존 텍스트 노드 재사용)', () => {
    // Mark wrapper already exists in DOM with text node
    const markWrapper = document.createElement('span');
    markWrapper.className = 'mark-bold';
    const textNode = document.createTextNode('Hello');
    markWrapper.appendChild(textNode);
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
    // Verify existing text node is reused
    expect(markWrapper.childNodes.length).toBe(1);
    expect(markWrapper.firstChild).toBe(textNode);
  });

  it('mark wrapper의 텍스트를 업데이트해야 함 (새 텍스트 노드 생성)', () => {
    // Mark wrapper exists in DOM but no text node
    const markWrapper = document.createElement('span');
    markWrapper.className = 'mark-bold';
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
      children: []
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

    // Verify text is added
    expect(markWrapper.textContent).toBe('Hello World');
    expect(markWrapper.childNodes.length).toBe(1);
    expect(markWrapper.firstChild?.nodeType).toBe(Node.TEXT_NODE);
  });

  it('mark wrapper의 텍스트를 업데이트해야 함 (childIndex가 맞지 않을 때 기존 텍스트 노드 재사용)', () => {
    // Mark wrapper already exists in DOM with text node
    // But childIndex doesn't match (e.g., elementCount calculation error)
    const markWrapper = document.createElement('span');
    markWrapper.className = 'mark-bold';
    const textNode = document.createTextNode('Hello');
    markWrapper.appendChild(textNode);
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
    // elementCount = 0, but text node is actually at 0th position
    processPrimitiveTextChildren(fiber, deps);

    // Verify text is updated
    expect(markWrapper.textContent).toBe('Hello World');
    // Verify existing text node is reused (prevent duplicate creation)
    expect(markWrapper.childNodes.length).toBe(1);
    expect(markWrapper.firstChild).toBe(textNode);
  });
});

