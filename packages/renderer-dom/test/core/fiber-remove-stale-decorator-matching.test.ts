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
    // VNode에는 chip-after만 있음
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

    // expectedChildIds 수집
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
    // DOM에 chip-before와 chip-after가 모두 있음
    const chipBefore = document.createElement('span');
    chipBefore.setAttribute('data-decorator-sid', 'chip-before');
    chipBefore.textContent = 'CHIP';
    
    const chipAfter = document.createElement('span');
    chipAfter.setAttribute('data-decorator-sid', 'chip-after');
    chipAfter.textContent = 'CHIP';
    
    container.appendChild(chipBefore);
    container.appendChild(chipAfter);

    // VNode에는 chip-after만 있음
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

    // usedDomElements 추적 로직 시뮬레이션
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
            // sid로 DOM 요소 찾기 (이미 매칭된 요소는 제외)
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

    // chip-after만 usedDomElements에 포함되어야 함
    expect(usedDomElements.has(chipAfter)).toBe(true);
    expect(usedDomElements.has(chipBefore)).toBe(false);
  });

  it('removeStaleChildren이 chip-before를 제거해야 함', () => {
    // DOM에 chip-before와 chip-after가 모두 있음
    const chipBefore = document.createElement('span');
    chipBefore.setAttribute('data-decorator-sid', 'chip-before');
    chipBefore.textContent = 'CHIP';
    
    const chipAfter = document.createElement('span');
    chipAfter.setAttribute('data-decorator-sid', 'chip-after');
    chipAfter.textContent = 'CHIP';
    
    container.appendChild(chipBefore);
    container.appendChild(chipAfter);

    // VNode에는 chip-after만 있음
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

    // removeStaleChildren 호출
    removeStaleChildren(fiber, deps);

    // chip-before가 제거되어야 함
    const chipBeforeAfter = container.querySelector('[data-decorator-sid="chip-before"]');
    const chipAfterAfter = container.querySelector('[data-decorator-sid="chip-after"]');
    
    expect(chipBeforeAfter).toBeFalsy();
    expect(chipAfterAfter).toBeTruthy();
  });
});

