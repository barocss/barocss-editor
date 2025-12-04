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

  it('Strategy 3: 인덱스 기반 fallback으로 mark wrapper를 찾을 수 있어야 함', () => {
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

    // prevChildVNodes가 비어있거나 prevChildToElement가 비어있는 경우
    const prevChildVNodes: (VNode | string | number)[] = [];
    const prevChildToElement = new Map<VNode | string | number, HTMLElement | Text>();

    // findHostForChildVNode 호출
    const host = findHostForChildVNode(
      textEl,
      vnode,
      0,
      prevChildVNodes,
      prevChildToElement
    );

    // Strategy 3 (인덱스 기반 fallback)으로 찾아야 함
    expect(host).toBe(markWrapper);
  });

  it('findChildHost가 childIndex 위치에서 찾지 못하면 모든 자식 요소를 순회해야 함', () => {
    // DOM에 mark wrapper가 이미 있음 (하지만 childIndex가 맞지 않는 경우)
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

    // findChildHost 직접 호출 (childIndex가 맞지 않는 경우)
    const host = findChildHost(textEl, vnode, 999); // 잘못된 childIndex

    // 모든 자식 요소를 순회하여 클래스 매칭으로 찾아야 함
    expect(host).toBe(markWrapper);
  });
});

