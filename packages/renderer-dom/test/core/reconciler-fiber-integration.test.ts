import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reconciler } from '../../src/reconcile/reconciler';
import { RendererRegistry } from '@barocss/dsl';
import { VNodeBuilder } from '../../src/vnode/factory';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';
import { VNode } from '../../src/vnode/types';

describe('Reconciler Fiber Integration', () => {
  let reconciler: Reconciler;
  let container: HTMLElement;
  let registry: RendererRegistry;
  let builder: VNodeBuilder;
  let dom: DOMOperations;
  let components: ComponentManager;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    registry = {
      get: vi.fn(),
      getComponent: vi.fn(),
      register: vi.fn()
    } as any;
    
    builder = new VNodeBuilder(registry);
    dom = new DOMOperations();
    components = new ComponentManager(registry);
    
    reconciler = new Reconciler(registry, builder, dom, components);
  });
  
  describe('reconcile with fiber', () => {
    it('should always use fiber for reconcile', async () => {
      const model = {
        sid: 'test',
        stype: 'test',
        text: 'Hello'
      };
      
      const vnode: VNode = {
        tag: 'div',
        sid: 'test',
        stype: 'test',
        children: []
      };
      
      reconciler.reconcile(container, vnode, model);
      
      // Wait for fiber scheduler to process (Fiber는 비동기로 처리됨)
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Container should have been reconciled
      expect(container.children.length).toBeGreaterThan(0);
    });
    
    it('should handle VNode with children using fiber', async () => {
      const model = {
        sid: 'parent',
        stype: 'parent'
      };
      
      const vnode: VNode = {
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
      };
      
      reconciler.reconcile(container, vnode, model);
      
      // Wait for fiber scheduler to process
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Container should have been reconciled with children
      expect(container.children.length).toBeGreaterThan(0);
    });
  });
});

