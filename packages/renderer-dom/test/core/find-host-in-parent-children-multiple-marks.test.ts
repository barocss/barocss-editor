/**
 * Test for findHostInParentChildren with multiple mark wrappers
 * 
 * 문제: 여러 mark wrapper가 순차적으로 있을 때 두 번째 wrapper가 재사용되지 않음
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { findHostInParentChildren } from '../../src/reconcile/utils/host-finding';
import { VNode } from '../../src/vnode/types';

describe('findHostInParentChildren - Multiple Mark Wrappers', () => {
  let parent: HTMLElement;
  let boldWrapper: HTMLElement;
  let italicWrapper: HTMLElement;

  beforeEach(() => {
    parent = document.createElement('span');
    parent.setAttribute('data-bc-sid', 'text-1');
    
    // 첫 번째 mark wrapper (bold)
    boldWrapper = document.createElement('span');
    boldWrapper.className = 'mark-bold';
    boldWrapper.textContent = 'Hello';
    parent.appendChild(boldWrapper);
    
    // 두 번째 mark wrapper (italic)
    italicWrapper = document.createElement('span');
    italicWrapper.className = 'mark-italic';
    italicWrapper.textContent = 'World';
    parent.appendChild(italicWrapper);
  });

  it('should find bold wrapper when searching for bold wrapper', () => {
    const vnode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-bold'
      },
      children: ['Hello Beautiful']
    };

    const prevVNode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-bold'
      },
      children: ['Hello'],
      meta: {
        domElement: boldWrapper
      }
    };

    const found = findHostInParentChildren(parent, vnode, prevVNode, 0);
    
    expect(found).toBe(boldWrapper);
  });

  it('should find italic wrapper when searching for italic wrapper', () => {
    const vnode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-italic'
      },
      children: ['Beautiful World']
    };

    const prevVNode: VNode = {
      tag: 'span',
      children: [
        {
          tag: 'span',
          attrs: { class: 'mark-bold' },
          children: ['Hello'],
          meta: { domElement: boldWrapper }
        } as VNode,
        {
          tag: 'span',
          attrs: { class: 'mark-italic' },
          children: ['World'],
          meta: { domElement: italicWrapper }
        } as VNode
      ]
    };

    const found = findHostInParentChildren(parent, vnode, prevVNode, 1);
    
    expect(found).toBe(italicWrapper);
  });

  it('should find italic wrapper by structural matching when prevVNode has children', () => {
    const vnode: VNode = {
      tag: 'span',
      attrs: {
        class: 'mark-italic'
      },
      children: ['Beautiful']
    };

    // prevVNode는 parent VNode (text-1)
    const prevVNode: VNode = {
      tag: 'span',
      children: [
        {
          tag: 'span',
          attrs: { class: 'mark-bold' },
          children: ['Hello'],
          meta: { domElement: boldWrapper }
        } as VNode,
        {
          tag: 'span',
          attrs: { class: 'mark-italic' },
          children: ['World'],
          meta: { domElement: italicWrapper }
        } as VNode
      ]
    };

    // Strategy 3: prevVNode.children에서 구조적 매칭
    const found = findHostInParentChildren(parent, vnode, prevVNode, 1);
    
    expect(found).toBe(italicWrapper);
  });
});

