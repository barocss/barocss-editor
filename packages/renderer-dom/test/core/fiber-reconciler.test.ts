import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reconcileWithFiber, FiberReconcileDependencies } from '../../src/reconcile/fiber/fiber-reconciler';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

describe('Fiber Reconciler', () => {
  let container: HTMLElement;
  let deps: FiberReconcileDependencies;
  let dom: DOMOperations;
  let components: ComponentManager;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    dom = new DOMOperations();
    components = {
      mountComponent: vi.fn(),
      updateComponent: vi.fn(),
      unmountComponent: vi.fn(),
      getComponentInstance: vi.fn()
    } as any;
    
    deps = {
      dom,
      components,
      currentVisitedPortalIds: null,
      portalHostsById: new Map()
    };
  });
  
  describe('reconcileWithFiber', () => {
    it('should create fiber tree and start scheduler', async () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'test',
        stype: 'test',
        children: []
      };
      
      reconcileWithFiber(container, vnode, undefined, {}, deps);
      
      // Wait for scheduler to process (Fiber는 비동기로 처리됨)
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // DOM에 요소가 생성되었는지 확인
      expect(container.children.length).toBeGreaterThan(0);
    });
    
    it('should handle VNode with prevVNode', async () => {
      const prevVNode: VNode = {
        tag: 'div',
        sid: 'test',
        stype: 'test',
        children: []
      };
      
      const vnode: VNode = {
        tag: 'div',
        sid: 'test',
        stype: 'test',
        children: []
      };
      
      reconcileWithFiber(container, vnode, prevVNode, {}, deps);
      
      // Wait for scheduler to process
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // DOM에 요소가 생성되었는지 확인
      expect(container.children.length).toBeGreaterThan(0);
    });
    
    it('should handle VNode with children', async () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent',
        stype: 'parent',
        children: [
          {
            tag: 'span',
            sid: 'child-1',
            stype: 'child',
            children: []
          } as VNode,
          {
            tag: 'span',
            sid: 'child-2',
            stype: 'child',
            children: []
          } as VNode
        ]
      };
      
      reconcileWithFiber(container, vnode, undefined, {}, deps);
      
      // Wait for scheduler to process
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // DOM에 요소들이 생성되었는지 확인
      expect(container.children.length).toBeGreaterThan(0);
    });
    
    it('should handle nested VNode tree', async () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'root',
        stype: 'root',
        children: [
          {
            tag: 'div',
            sid: 'parent',
            stype: 'parent',
            children: [
              {
                tag: 'span',
                sid: 'child',
                stype: 'child',
                children: []
              } as VNode
            ]
          } as VNode
        ]
      };
      
      reconcileWithFiber(container, vnode, undefined, {}, deps);
      
      // Wait for scheduler to process
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // DOM에 요소들이 생성되었는지 확인
      expect(container.children.length).toBeGreaterThan(0);
    });
    
    it('should preserve context through fiber tree', async () => {
      const context = {
        registry: {},
        builder: {},
        decorators: []
      };
      
      const vnode: VNode = {
        tag: 'div',
        sid: 'test',
        stype: 'test',
        children: []
      };
      
      reconcileWithFiber(container, vnode, undefined, context, deps);
      
      // Wait for scheduler to process
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // DOM에 요소가 생성되었는지 확인
      expect(container.children.length).toBeGreaterThan(0);
    });
  });
});
