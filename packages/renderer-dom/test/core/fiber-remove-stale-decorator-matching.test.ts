import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { removeStaleChildren, FiberReconcileDependencies } from '../../src/reconcile/fiber/fiber-reconciler';
import { FiberNode } from '../../src/reconcile/fiber/types';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

describe('removeStaleChildren - 매칭 로직 검증', () => {
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

  it('expectedChildIds에 chip-before가 포함되지 않아야 함', () => {
    // VNode only has chip-after
    const vnode: VNode = {
      tag: 'span',
      stype: 'inline-text',
      sid: 'text-14',
      children: [
        'Test Text',
        {
          tag: 'span',
          attrs: {
            'data-decorator-sid': 'chip-after',
            'data-decorator-stype': 'chip'
          },
          children: ['CHIP']
        } as VNode
      ]
    };

    // Collect expectedChildIds
    const expectedChildIds = new Set<string>();
    if (vnode.children) {
      for (const child of vnode.children) {
        if (typeof child === 'object' && child !== null) {
          const childVNode = child as VNode;
          const childId = childVNode.sid || childVNode.attrs?.['data-decorator-sid'];
          if (childId) {
            expectedChildIds.add(childId);
          }
        }
      }
    }

    expect(expectedChildIds.has('chip-after')).toBe(true);
    expect(expectedChildIds.has('chip-before')).toBe(false);
  });

  it('usedDomElements에 chip-before가 포함되지 않아야 함', () => {
    // Both chip-before and chip-after exist in DOM
    const chipBefore = document.createElement('span');
    chipBefore.setAttribute('data-decorator-sid', 'chip-before');
    chipBefore.textContent = 'CHIP';
    
    const chipAfter = document.createElement('span');
    chipAfter.setAttribute('data-decorator-sid', 'chip-after');
    chipAfter.textContent = 'CHIP';
    
    container.appendChild(chipBefore);
    container.appendChild(chipAfter);

    // VNode only has chip-after
    const vnode: VNode = {
      tag: 'span',
      stype: 'inline-text',
      sid: 'text-14',
      children: [
        {
          tag: 'span',
          attrs: {
            'data-decorator-sid': 'chip-after',
            'data-decorator-stype': 'chip'
          },
          children: ['CHIP']
        } as VNode
      ]
    };

    const prevVNode: VNode = {
      tag: 'span',
      stype: 'inline-text',
      sid: 'text-14',
      children: [
        {
          tag: 'span',
          decoratorSid: 'chip-before',
          decoratorStype: 'chip',
          children: ['CHIP']
        } as VNode
      ]
    };

    // Simulate usedDomElements tracking logic
    const childElements = Array.from(container.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement
    );
    const usedDomElements = new Set<HTMLElement>();

    if (vnode.children) {
      for (let i = 0; i < vnode.children.length; i++) {
        const child = vnode.children[i];
        if (typeof child === 'object' && child !== null) {
          const childVNode = child as VNode;
          const childId = childVNode.sid || childVNode.attrs?.['data-decorator-sid'];
          if (childId) {
            // Find DOM element by sid (exclude already matched elements)
            const matchedEl = childElements.find(
              el => !usedDomElements.has(el) && (
                el.getAttribute('data-bc-sid') === childId || 
                el.getAttribute('data-decorator-sid') === childId
              )
            );
            if (matchedEl) {
              usedDomElements.add(matchedEl);
            }
          }
        }
      }
    }

    // Only chip-after should be included in usedDomElements
    expect(usedDomElements.has(chipAfter)).toBe(true);
    expect(usedDomElements.has(chipBefore)).toBe(false);
  });

  it('removeStaleChildren이 chip-before를 제거해야 함', () => {
    // Both chip-before and chip-after exist in DOM
    const chipBefore = document.createElement('span');
    chipBefore.setAttribute('data-decorator-sid', 'chip-before');
    chipBefore.textContent = 'CHIP';
    
    const chipAfter = document.createElement('span');
    chipAfter.setAttribute('data-decorator-sid', 'chip-after');
    chipAfter.textContent = 'CHIP';
    
    container.appendChild(chipBefore);
    container.appendChild(chipAfter);

    // VNode only has chip-after
    const vnode: VNode = {
      tag: 'span',
      stype: 'inline-text',
      sid: 'text-14',
      children: [
        {
          tag: 'span',
          attrs: {
            'data-decorator-sid': 'chip-after',
            'data-decorator-stype': 'chip'
          },
          children: ['CHIP']
        } as VNode
      ]
    };

    const prevVNode: VNode = {
      tag: 'span',
      stype: 'inline-text',
      sid: 'text-14',
      children: [
        {
          tag: 'span',
          decoratorSid: 'chip-before',
          decoratorStype: 'chip',
          children: ['CHIP']
        } as VNode
      ]
    };

    const fiber: FiberNode = {
      vnode,
      prevVNode,
      domElement: container,
      parent: container,
      child: null,
      sibling: null,
      index: 0
    } as FiberNode;

    // Call removeStaleChildren
    removeStaleChildren(fiber, deps);

    // chip-before should be removed
    const chipBeforeAfter = container.querySelector('[data-decorator-sid="chip-before"]');
    const chipAfterAfter = container.querySelector('[data-decorator-sid="chip-after"]');
    
    expect(chipBeforeAfter).toBeFalsy();
    expect(chipAfterAfter).toBeTruthy();
  });
});

