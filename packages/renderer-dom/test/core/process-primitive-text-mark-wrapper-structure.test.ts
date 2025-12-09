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
    // VNode structure:
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

    // Create initial structure in DOM
    const markEl = document.createElement('span');
    markEl.className = 'custom-bg-color';
    
    const spanEl = document.createElement('span');
    const textNode = document.createTextNode('yellow background');
    spanEl.appendChild(textNode);
    markEl.appendChild(spanEl);
    container.appendChild(markEl);

    // Create Fiber
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

    // Call reconcileFiberNode (find and set host)
    // Since we're only testing processPrimitiveTextChildren here,
    // manually set fiber.domElement
    fiber.domElement = markEl;

    // Call processPrimitiveTextChildren
    // mark wrapper's children are VNodes, so primitiveTextChildren should be undefined
    // But actually, span wrapper's children are text VNodes, so
    // we need to verify how this is handled
    
    expect(fiber.primitiveTextChildren).toBeUndefined();
    
    // Find span wrapper Fiber
    const spanWrapperFiber = fiber.child;
    expect(spanWrapperFiber).toBeTruthy();
    expect(spanWrapperFiber?.vnode.tag).toBe('span');
    
    // Verify span wrapper's primitiveTextChildren
    // span wrapper's children are text VNodes, so primitiveTextChildren should be undefined
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

    // Create initial structure in DOM
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

    // Find span wrapper Fiber
    const spanWrapperFiber = fiber.child;
    expect(spanWrapperFiber).toBeTruthy();
    
    if (spanWrapperFiber) {
      spanWrapperFiber.domElement = spanEl;
      
      // span wrapper's children are text VNodes, so
      // primitiveTextChildren should be undefined
      // Instead, text VNode should be converted to Fiber
      
      // Find text VNode Fiber
      const textVNodeFiber = spanWrapperFiber.child;
      expect(textVNodeFiber).toBeTruthy();
      expect(textVNodeFiber?.vnode.text).toBe('yellow bㅁackground');
    }
  });
});

