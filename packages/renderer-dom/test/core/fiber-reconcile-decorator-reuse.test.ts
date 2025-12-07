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
    // chip-before already exists in DOM
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

    // Only chip-after exists in VNode
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

    // Create Fiber for chip-after VNode
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

    // Call reconcileFiberNode
    reconcileFiberNode(chipAfterFiber, deps, {});

    // chip-after VNode should not reuse chip-before DOM element
    // (should create new DOM element or not reuse chip-before)
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

    // chip-before should not be changed to chip-after
    // (chip-before should remain, chip-after should be newly created)
    expect(chipBeforeAfter?.getAttribute('data-decorator-sid')).toBe('chip-before');
    expect(chipAfter?.getAttribute('data-decorator-sid')).toBe('chip-after');
  });
});

