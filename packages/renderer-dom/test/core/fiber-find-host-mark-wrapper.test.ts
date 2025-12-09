import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { findHostForChildVNode } from '../../src/reconcile/utils/host-finding';
import { findChildHost } from '../../src/reconcile/utils/dom-utils';
import { VNode } from '../../src/vnode/types';

describe('findHostForChildVNode - Mark Wrapper', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container.innerHTML = '';
  });

  it('Strategy 2: 인덱스 기반 매칭으로 mark wrapper를 찾을 수 있어야 함', () => {
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

  it('Strategy 3: 인덱스 기반 fallback으로 mark wrapper를 찾을 수 있어야 함', () => {
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

    // When prevChildVNodes is empty or prevChildToElement is empty
    const prevChildVNodes: (VNode | string | number)[] = [];
    const prevChildToElement = new Map<VNode | string | number, HTMLElement | Text>();

    // Call findHostForChildVNode
    const host = findHostForChildVNode(
      textEl,
      vnode,
      0,
      prevChildVNodes,
      prevChildToElement
    );

    // Should find using Strategy 3 (index-based fallback)
    expect(host).toBe(markWrapper);
  });

  it('findChildHost가 childIndex 위치에서 찾지 못하면 모든 자식 요소를 순회해야 함', () => {
    // Mark wrapper already exists in DOM (but childIndex doesn't match)
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

    // Call findChildHost directly (when childIndex doesn't match)
    const host = findChildHost(textEl, vnode, 999); // Invalid childIndex

    // Should traverse all child elements to find by class matching
    expect(host).toBe(markWrapper);
  });
});

