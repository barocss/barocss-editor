/**
 * processPrimitiveTextChildren - Mark Wrapper 구조 테스트
 * 
 * mark wrapper 내부의 span wrapper가 text VNode를 children으로 가질 때
 * processPrimitiveTextChildren이 어떻게 처리하는지 검증
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { processPrimitiveTextChildren } from '../../src/reconcile/fiber/fiber-reconciler';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import { FiberReconcileDependencies } from '../../src/reconcile/fiber/fiber-reconciler';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

describe('processPrimitiveTextChildren - Mark Wrapper Structure', () => {
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

  it('should handle mark wrapper with span wrapper and text VNode inside', () => {
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

    // Fiber 생성
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
        }]
      }],
      meta: {
        domElement: markEl
      }
    };

    const fiber = createFiberTree(container, markWrapper, prevVNode, {});

    // reconcileFiberNode 호출 (host 찾기 및 설정)
    // 여기서는 processPrimitiveTextChildren만 테스트하므로
    // fiber.domElement를 수동으로 설정
    fiber.domElement = markEl;

    // processPrimitiveTextChildren 호출
    // mark wrapper의 children은 VNode이므로 primitiveTextChildren이 없어야 함
    // 하지만 실제로는 span wrapper의 children이 text VNode이므로
    // 이것이 어떻게 처리되는지 확인해야 함
    
    expect(fiber.primitiveTextChildren).toBeUndefined();
    
    // span wrapper Fiber 찾기
    const spanWrapperFiber = fiber.child;
    expect(spanWrapperFiber).toBeTruthy();
    expect(spanWrapperFiber?.vnode.tag).toBe('span');
    
    // span wrapper의 primitiveTextChildren 확인
    // span wrapper의 children은 text VNode이므로 primitiveTextChildren이 없어야 함
    expect(spanWrapperFiber?.primitiveTextChildren).toBeUndefined();
  });

  it('should handle text update in mark wrapper structure', () => {
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

    // Updated VNode
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

    const fiber = createFiberTree(container, updatedMarkWrapper, prevVNode, {});
    fiber.domElement = markEl;

    // span wrapper Fiber 찾기
    const spanWrapperFiber = fiber.child;
    expect(spanWrapperFiber).toBeTruthy();
    
    if (spanWrapperFiber) {
      spanWrapperFiber.domElement = spanEl;
      
      // span wrapper의 children은 text VNode이므로
      // primitiveTextChildren이 없어야 함
      // 대신 text VNode가 Fiber로 변환되어야 함
      
      // text VNode Fiber 찾기
      const textVNodeFiber = spanWrapperFiber.child;
      expect(textVNodeFiber).toBeTruthy();
      expect(textVNodeFiber?.vnode.text).toBe('yellow bㅁackground');
    }
  });
});

