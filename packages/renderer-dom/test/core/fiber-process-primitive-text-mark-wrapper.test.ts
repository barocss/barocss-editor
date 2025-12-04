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
    // DOM에 mark wrapper가 이미 있고 텍스트 노드가 있음
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

    // processPrimitiveTextChildren 호출
    processPrimitiveTextChildren(fiber, deps);

    // 텍스트가 업데이트되었는지 확인
    expect(markWrapper.textContent).toBe('Hello World');
    // 기존 텍스트 노드가 재사용되었는지 확인
    expect(markWrapper.childNodes.length).toBe(1);
    expect(markWrapper.firstChild).toBe(textNode);
  });

  it('mark wrapper의 텍스트를 업데이트해야 함 (새 텍스트 노드 생성)', () => {
    // DOM에 mark wrapper가 있지만 텍스트 노드가 없음
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

    // processPrimitiveTextChildren 호출
    processPrimitiveTextChildren(fiber, deps);

    // 텍스트가 추가되었는지 확인
    expect(markWrapper.textContent).toBe('Hello World');
    expect(markWrapper.childNodes.length).toBe(1);
    expect(markWrapper.firstChild?.nodeType).toBe(Node.TEXT_NODE);
  });

  it('mark wrapper의 텍스트를 업데이트해야 함 (childIndex가 맞지 않을 때 기존 텍스트 노드 재사용)', () => {
    // DOM에 mark wrapper가 이미 있고 텍스트 노드가 있음
    // 하지만 childIndex가 맞지 않는 경우 (예: elementCount 계산 오류)
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

    // processPrimitiveTextChildren 호출
    // elementCount = 0이지만, 실제로는 텍스트 노드가 0번째 위치에 있음
    processPrimitiveTextChildren(fiber, deps);

    // 텍스트가 업데이트되었는지 확인
    expect(markWrapper.textContent).toBe('Hello World');
    // 기존 텍스트 노드가 재사용되었는지 확인 (중복 생성 방지)
    expect(markWrapper.childNodes.length).toBe(1);
    expect(markWrapper.firstChild).toBe(textNode);
  });
});

