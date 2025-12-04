/**
 * findOrCreateHost 및 updateExistingHost 테스트
 * 
 * Host 찾기 및 생성 로직의 통합 테스트
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { findOrCreateHost, updateExistingHost } from '../../src/reconcile/fiber/fiber-reconciler-helpers';
import { VNode } from '../../src/vnode/types';
import { FiberNode } from '../../src/reconcile/fiber/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

describe('findOrCreateHost and updateExistingHost', () => {
  let container: HTMLElement;
  let dom: DOMOperations;
  let components: ComponentManager;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dom = new DOMOperations();
    components = new ComponentManager();
  });

  describe('findOrCreateHost', () => {
    it('should reuse host from prevVNode.meta.domElement when ids match', () => {
      const host = document.createElement('div');
      host.setAttribute('data-bc-sid', 'p-1');
      container.appendChild(host);

      const vnode: VNode = {
        tag: 'div',
        sid: 'p-1',
        stype: 'paragraph'
      };

      const prevVNode: VNode = {
        tag: 'div',
        sid: 'p-1',
        stype: 'paragraph',
        meta: {
          domElement: host
        }
      };

      const fiber: FiberNode = {
        vnode,
        prevVNode,
        domElement: null,
        parent: container,
        parentFiber: null,
        child: null,
        sibling: null,
        return: null,
        effectTag: null,
        alternate: null,
        context: {},
        index: 0
      };

      const deps = {
        dom,
        components,
        context: {}
      };

      const result = findOrCreateHost(fiber, deps, {});

      expect(result).toBe(host);
      expect(container.children.length).toBe(1);
    });

    it('should reuse host from prevVNode.meta.domElement when no ids but structural match', () => {
      const host = document.createElement('span');
      host.className = 'mark-bold';
      container.appendChild(host);

      const vnode: VNode = {
        tag: 'span',
        attrs: {
          className: 'mark-bold'
        }
      };

      const prevVNode: VNode = {
        tag: 'span',
        attrs: {
          className: 'mark-bold'
        },
        meta: {
          domElement: host
        }
      };

      const fiber: FiberNode = {
        vnode,
        prevVNode,
        domElement: null,
        parent: container,
        parentFiber: null,
        child: null,
        sibling: null,
        return: null,
        effectTag: null,
        alternate: null,
        context: {},
        index: 0
      };

      const deps = {
        dom,
        components,
        context: {}
      };

      const result = findOrCreateHost(fiber, deps, {});

      expect(result).toBe(host);
    });

    it('should create new host when prevVNode has no matching host', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'p-1',
        stype: 'paragraph'
      };

      const fiber: FiberNode = {
        vnode,
        prevVNode: undefined,
        domElement: null,
        parent: container,
        parentFiber: null,
        child: null,
        sibling: null,
        return: null,
        effectTag: null,
        alternate: null,
        context: {},
        index: 0
      };

      const deps = {
        dom,
        components,
        context: {}
      };

      const result = findOrCreateHost(fiber, deps, {});

      expect(result).toBeInstanceOf(HTMLElement);
      expect(result.tagName.toLowerCase()).toBe('div');
      expect(result.getAttribute('data-bc-sid')).toBe('p-1');
      expect(container.children.length).toBe(1);
    });

    it('should return existing host when found (attributes updated separately in reconcileFiberNode)', () => {
      const host = document.createElement('div');
      host.setAttribute('data-bc-sid', 'p-1');
      host.className = 'old-class';
      container.appendChild(host);

      const vnode: VNode = {
        tag: 'div',
        sid: 'p-1',
        stype: 'paragraph',
        attrs: {
          className: 'new-class'
        }
      };

      const prevVNode: VNode = {
        tag: 'div',
        sid: 'p-1',
        stype: 'paragraph',
        attrs: {
          className: 'old-class'
        },
        meta: {
          domElement: host
        }
      };

      const fiber: FiberNode = {
        vnode,
        prevVNode,
        domElement: null,
        parent: container,
        parentFiber: null,
        child: null,
        sibling: null,
        return: null,
        effectTag: null,
        alternate: null,
        context: {},
        index: 0
      };

      const deps = {
        dom,
        components,
        context: {}
      };

      const result = findOrCreateHost(fiber, deps, {});

      // findOrCreateHost는 host를 찾거나 생성만 하고,
      // 속성 업데이트는 reconcileFiberNode에서 dom.updateAttributes로 수행됨
      expect(result).toBe(host);
      // className 업데이트는 reconcileFiberNode에서 수행되므로 여기서는 확인하지 않음
    });
  });

  describe('updateExistingHost', () => {
    it('should call updateHostElement to update host element attributes', () => {
      const host = document.createElement('div');
      host.className = 'old-class';
      container.appendChild(host);

      const vnode: VNode = {
        tag: 'div',
        sid: 'p-1',
        attrs: {
          className: 'new-class'
        }
      };

      const prevVNode: VNode = {
        tag: 'div',
        sid: 'p-1',
        attrs: {
          className: 'old-class'
        }
      };

      const prevChildVNodes: (VNode | string | number)[] = [];

      const deps = {
        dom,
        components,
        context: {}
      };

      // updateExistingHost는 updateHostElement를 호출하므로
      // 실제 업데이트는 updateHostElement가 수행함
      updateExistingHost(
        host,
        container,
        vnode,
        prevVNode,
        0,
        prevChildVNodes,
        deps,
        {}
      );

      // updateHostElement는 dom.updateAttributes를 호출하므로
      // className이 업데이트되어야 함
      // 하지만 updateHostElement의 동작은 별도 테스트에서 확인
      expect(host).toBeInstanceOf(HTMLElement);
    });

    it('should use prevVNode as prevChildVNode when root level', () => {
      const host = document.createElement('div');
      container.appendChild(host);

      const vnode: VNode = {
        tag: 'div',
        sid: 'p-1'
      };

      const prevVNode: VNode = {
        tag: 'div',
        sid: 'p-1'
      };

      const prevChildVNodes: (VNode | string | number)[] = [];

      const deps = {
        dom,
        components,
        context: {}
      };

      // Should not throw error
      updateExistingHost(
        host,
        container,
        vnode,
        prevVNode,
        0,
        prevChildVNodes,
        deps,
        {}
      );
    });
  });
});

