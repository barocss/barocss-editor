/**
 * reconcileFiberNode - Text VNode 처리 테스트
 * 
 * mark wrapper 내부의 span wrapper가 text VNode를 children으로 가질 때
 * reconcileFiberNode가 어떻게 처리하는지 검증
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { reconcileFiberNode } from '../../src/reconcile/fiber/fiber-reconciler';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import { FiberReconcileDependencies } from '../../src/reconcile/fiber/fiber-reconciler';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

describe('reconcileFiberNode - Text VNode Handling', () => {
  let container: HTMLElement;
  let deps: FiberReconcileDependencies;
  let dom: DOMOperations;
  let components: ComponentManager;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    dom = new DOMOperations();
    components = new ComponentManager();
    
    deps = {
      dom,
      components,
      context: {}
    };
  });

  it('should handle text VNode child in span wrapper', () => {
    // VNode 구조:
    // span wrapper (span)
    //   -> text VNode (text: "yellow background")
    
    const textVNode: VNode = {
      tag: undefined,
      text: 'yellow background',
      children: []
    };

    const spanWrapper: VNode = {
      tag: 'span',
      attrs: {},
      children: [textVNode]
    };

    // DOM에 초기 구조 생성
    const spanEl = document.createElement('span');
    const textNode = document.createTextNode('yellow background');
    spanEl.appendChild(textNode);
    container.appendChild(spanEl);

    const prevVNode: VNode = {
      tag: 'span',
      attrs: {},
      children: [{
        tag: undefined,
        text: 'yellow background',
        children: []
      }],
      meta: {
        domElement: spanEl
      }
    };

    // Fiber 생성
    const fiber = createFiberTree(container, spanWrapper, prevVNode, {});

    // reconcileFiberNode 호출
    reconcileFiberNode(fiber, deps, {});

    // span wrapper의 domElement 확인
    expect(fiber.domElement).toBe(spanEl);

    // text VNode Fiber 찾기
    const textVNodeFiber = fiber.child;
    expect(textVNodeFiber).toBeTruthy();
    expect(textVNodeFiber?.vnode.text).toBe('yellow background');

    // text VNode Fiber reconcile
    if (textVNodeFiber) {
      reconcileFiberNode(textVNodeFiber, deps, {});
      
      // 텍스트 노드가 올바르게 처리되었는지 확인
      expect(spanEl.textContent).toBe('yellow background');
      expect(spanEl.childNodes.length).toBe(1);
      expect(spanEl.firstChild).toBe(textNode);
    }
  });

  it('should update text VNode when text changes', () => {
    // Initial: "yellow background"
    // Updated: "yellow bㅁackground"
    
    const initialTextVNode: VNode = {
      tag: undefined,
      text: 'yellow background',
      children: []
    };

    const initialSpanWrapper: VNode = {
      tag: 'span',
      attrs: {},
      children: [initialTextVNode]
    };

    const updatedTextVNode: VNode = {
      tag: undefined,
      text: 'yellow bㅁackground',
      children: []
    };

    const updatedSpanWrapper: VNode = {
      tag: 'span',
      attrs: {},
      children: [updatedTextVNode]
    };

    // DOM에 초기 구조 생성
    const spanEl = document.createElement('span');
    const textNode = document.createTextNode('yellow background');
    spanEl.appendChild(textNode);
    container.appendChild(spanEl);

    const prevVNode: VNode = {
      tag: 'span',
      attrs: {},
      children: [{
        tag: undefined,
        text: 'yellow background',
        children: []
      }],
      meta: {
        domElement: spanEl
      }
    };

    // Updated Fiber 생성
    const fiber = createFiberTree(container, updatedSpanWrapper, prevVNode, {});

    // reconcileFiberNode 호출
    reconcileFiberNode(fiber, deps, {});

    // text VNode Fiber reconcile
    const textVNodeFiber = fiber.child;
    if (textVNodeFiber) {
      reconcileFiberNode(textVNodeFiber, deps, {});
      
      // 텍스트가 업데이트되었는지 확인
      expect(spanEl.textContent).toBe('yellow bㅁackground');
      expect(spanEl.childNodes.length).toBe(1);
      expect(spanEl.firstChild).toBe(textNode); // 같은 텍스트 노드 재사용
    }
  });

  it('should handle mark wrapper with span wrapper and text VNode', () => {
    // VNode 구조:
    // mark wrapper (span.custom-bg-color)
    //   -> span wrapper (span)
    //       -> text VNode (text: "yellow background")
    
    const textVNode: VNode = {
      tag: undefined,
      text: 'yellow background',
      children: []
    };

    const spanWrapper: VNode = {
      tag: 'span',
      attrs: {},
      children: [textVNode]
    };

    const markWrapper: VNode = {
      tag: 'span',
      attrs: { className: 'custom-bg-color' },
      children: [spanWrapper]
    };

    // DOM에 초기 구조 생성
    const markEl = document.createElement('span');
    markEl.className = 'custom-bg-color';
    
    const spanEl = document.createElement('span');
    const textNode = document.createTextNode('yellow background');
    spanEl.appendChild(textNode);
    markEl.appendChild(spanEl);
    container.appendChild(markEl);

    const prevVNode: VNode = {
      tag: 'span',
      attrs: { className: 'custom-bg-color' },
      children: [{
        tag: 'span',
        attrs: {},
        children: [{
          tag: undefined,
          text: 'yellow background',
          children: []
        }],
        meta: {
          domElement: spanEl
        }
      }],
      meta: {
        domElement: markEl
      }
    };

    // Fiber 생성
    const fiber = createFiberTree(container, markWrapper, prevVNode, {});

    // reconcileFiberNode 호출 (mark wrapper)
    reconcileFiberNode(fiber, deps, {});

    // span wrapper Fiber reconcile
    const spanWrapperFiber = fiber.child;
    if (spanWrapperFiber) {
      reconcileFiberNode(spanWrapperFiber, deps, {});
      
      // text VNode Fiber reconcile
      const textVNodeFiber = spanWrapperFiber.child;
      if (textVNodeFiber) {
        reconcileFiberNode(textVNodeFiber, deps, {});
        
        // 텍스트가 올바르게 처리되었는지 확인
        expect(spanEl.textContent).toBe('yellow background');
        expect(spanEl.childNodes.length).toBe(1);
        expect(spanEl.firstChild).toBe(textNode);
      }
    }
  });

  it('should update text in mark wrapper structure when text changes', () => {
    // Initial: "yellow background"
    // Updated: "yellow bㅁackground"
    
    const initialTextVNode: VNode = {
      tag: undefined,
      text: 'yellow background',
      children: []
    };

    const initialSpanWrapper: VNode = {
      tag: 'span',
      attrs: {},
      children: [initialTextVNode]
    };

    const initialMarkWrapper: VNode = {
      tag: 'span',
      attrs: { className: 'custom-bg-color' },
      children: [initialSpanWrapper]
    };

    const updatedTextVNode: VNode = {
      tag: undefined,
      text: 'yellow bㅁackground',
      children: []
    };

    const updatedSpanWrapper: VNode = {
      tag: 'span',
      attrs: {},
      children: [updatedTextVNode]
    };

    const updatedMarkWrapper: VNode = {
      tag: 'span',
      attrs: { className: 'custom-bg-color' },
      children: [updatedSpanWrapper]
    };

    // DOM에 초기 구조 생성
    const markEl = document.createElement('span');
    markEl.className = 'custom-bg-color';
    
    const spanEl = document.createElement('span');
    const textNode = document.createTextNode('yellow background');
    spanEl.appendChild(textNode);
    markEl.appendChild(spanEl);
    container.appendChild(markEl);

    const prevVNode: VNode = {
      tag: 'span',
      attrs: { className: 'custom-bg-color' },
      children: [{
        tag: 'span',
        attrs: {},
        children: [{
          tag: undefined,
          text: 'yellow background',
          children: []
        }],
        meta: {
          domElement: spanEl
        }
      }],
      meta: {
        domElement: markEl
      }
    };

    // Updated Fiber 생성
    const fiber = createFiberTree(container, updatedMarkWrapper, prevVNode, {});

    // reconcileFiberNode 호출 (mark wrapper)
    reconcileFiberNode(fiber, deps, {});

    // span wrapper Fiber reconcile
    const spanWrapperFiber = fiber.child;
    if (spanWrapperFiber) {
      reconcileFiberNode(spanWrapperFiber, deps, {});
      
      // text VNode Fiber reconcile
      const textVNodeFiber = spanWrapperFiber.child;
      if (textVNodeFiber) {
        reconcileFiberNode(textVNodeFiber, deps, {});
        
        // 텍스트가 업데이트되었는지 확인 (중복 없이)
        expect(spanEl.textContent).toBe('yellow bㅁackground');
        expect(spanEl.childNodes.length).toBe(1);
        expect(spanEl.firstChild).toBe(textNode); // 같은 텍스트 노드 재사용
      }
    }
  });
});

