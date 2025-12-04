import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import { reconcileFiberNode, FiberReconcileDependencies } from '../../src/reconcile/fiber/fiber-reconciler';
import { FiberNode } from '../../src/reconcile/fiber/types';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

describe('reconcileFiberNode - Decorator 재사용 방지', () => {
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

  it('chip-after VNode가 chip-before DOM 요소를 재사용하지 않아야 함', () => {
    // DOM에 chip-before가 이미 있음
    const textEl = document.createElement('span');
    textEl.setAttribute('data-bc-sid', 'text-14');
    textEl.className = 'text';
    
    const chipBefore = document.createElement('span');
    chipBefore.setAttribute('data-decorator-sid', 'chip-before');
    chipBefore.setAttribute('data-decorator-stype', 'chip');
    chipBefore.textContent = 'CHIP';
    
    textEl.appendChild(chipBefore);
    textEl.appendChild(document.createTextNode('Hello World'));
    container.appendChild(textEl);

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
            'data-decorator-stype': 'chip',
            'data-decorator-category': 'inline',
            'data-decorator-position': 'after'
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
          attrs: {
            'data-decorator-sid': 'chip-before',
            'data-decorator-stype': 'chip',
            'data-decorator-category': 'inline',
            'data-decorator-position': 'before'
          },
          children: ['CHIP']
        } as VNode,
        'Hello World'
      ]
    };

    // chip-after VNode를 위한 Fiber 생성
    const chipAfterVNode = vnode.children[1] as VNode;
    const chipAfterFiber: FiberNode = {
      vnode: chipAfterVNode,
      prevVNode: prevVNode.children[0] as VNode,
      domElement: null,
      parent: textEl,
      child: null,
      sibling: null,
      index: 1
    } as FiberNode;

    // reconcileFiberNode 호출
    reconcileFiberNode(chipAfterFiber, deps, {});

    // chip-after VNode가 chip-before DOM 요소를 재사용하지 않아야 함
    // (새로운 DOM 요소를 생성하거나, chip-before를 재사용하지 않아야 함)
    const chipBeforeAfter = textEl.querySelector('[data-decorator-sid="chip-before"]');
    const chipAfter = textEl.querySelector('[data-decorator-sid="chip-after"]');
    
    // eslint-disable-next-line no-console
    console.log('After reconcileFiberNode:', {
      chipBeforeExists: !!chipBeforeAfter,
      chipAfterExists: !!chipAfter,
      chipBeforeDecoratorSid: chipBeforeAfter?.getAttribute('data-decorator-sid'),
      chipAfterDecoratorSid: chipAfter?.getAttribute('data-decorator-sid'),
      textElChildren: Array.from(textEl.children).map(el => ({
        tag: el.tagName,
        decoratorSid: el.getAttribute('data-decorator-sid'),
        text: el.textContent
      }))
    });

    // chip-before가 chip-after로 변경되지 않아야 함
    // (chip-before는 그대로 있어야 하고, chip-after는 새로 생성되어야 함)
    expect(chipBeforeAfter?.getAttribute('data-decorator-sid')).toBe('chip-before');
    expect(chipAfter?.getAttribute('data-decorator-sid')).toBe('chip-after');
  });
});

