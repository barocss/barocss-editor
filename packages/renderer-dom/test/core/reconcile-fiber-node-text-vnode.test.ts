/**
 * reconcileFiberNode - Text VNode Handling Test
 * 
 * Verifies how reconcileFiberNode handles when a span wrapper inside a mark wrapper
 * has a text VNode as children
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
    // VNode structure:
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

    // Create initial structure in DOM
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

    // Create Fiber
    const fiber = createFiberTree(container, spanWrapper, prevVNode, {});

    // Call reconcileFiberNode
    reconcileFiberNode(fiber, deps, {});

    // Verify span wrapper's domElement
    expect(fiber.domElement).toBe(spanEl);

    // Find text VNode Fiber
    const textVNodeFiber = fiber.child;
    expect(textVNodeFiber).toBeTruthy();
    expect(textVNodeFiber?.vnode.text).toBe('yellow background');

    // Reconcile text VNode Fiber
    if (textVNodeFiber) {
      reconcileFiberNode(textVNodeFiber, deps, {});
      
      // Verify text node is processed correctly
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

    // Create initial structure in DOM
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

    // Create Updated Fiber
    const fiber = createFiberTree(container, updatedSpanWrapper, prevVNode, {});

    // Call reconcileFiberNode
    reconcileFiberNode(fiber, deps, {});

    // Reconcile text VNode Fiber
    const textVNodeFiber = fiber.child;
    if (textVNodeFiber) {
      reconcileFiberNode(textVNodeFiber, deps, {});
      
      // Verify text is updated
      expect(spanEl.textContent).toBe('yellow bㅁackground');
      expect(spanEl.childNodes.length).toBe(1);
      expect(spanEl.firstChild).toBe(textNode); // Reuse same text node
    }
  });

  it('should handle mark wrapper with span wrapper and text VNode', () => {
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

    // Create Fiber
    const fiber = createFiberTree(container, markWrapper, prevVNode, {});

    // Call reconcileFiberNode (mark wrapper)
    reconcileFiberNode(fiber, deps, {});

    // Reconcile span wrapper Fiber
    const spanWrapperFiber = fiber.child;
    if (spanWrapperFiber) {
      reconcileFiberNode(spanWrapperFiber, deps, {});
      
      // Reconcile text VNode Fiber
      const textVNodeFiber = spanWrapperFiber.child;
      if (textVNodeFiber) {
        reconcileFiberNode(textVNodeFiber, deps, {});
        
        // Verify text is processed correctly
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

    // Create Updated Fiber
    const fiber = createFiberTree(container, updatedMarkWrapper, prevVNode, {});

    // Call reconcileFiberNode (mark wrapper)
    reconcileFiberNode(fiber, deps, {});

    // Reconcile span wrapper Fiber
    const spanWrapperFiber = fiber.child;
    if (spanWrapperFiber) {
      reconcileFiberNode(spanWrapperFiber, deps, {});
      
      // Reconcile text VNode Fiber
      const textVNodeFiber = spanWrapperFiber.child;
      if (textVNodeFiber) {
        reconcileFiberNode(textVNodeFiber, deps, {});
        
        // Verify text is updated (without duplication)
        expect(spanEl.textContent).toBe('yellow bㅁackground');
        expect(spanEl.childNodes.length).toBe(1);
        expect(spanEl.firstChild).toBe(textNode); // Reuse same text node
      }
    }
  });
});

